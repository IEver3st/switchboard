using System.Runtime.InteropServices;
using System.Security.Cryptography;

namespace Switchboard.AudioHost.NoiseSuppression;

internal sealed partial class DeepFilterNetNoiseSuppressor : INoiseSuppressor
{
    internal const string ExpectedModelFileName = "DeepFilterNet3_onnx.tar.gz";
    internal const string ExpectedModelHash = "C94D91F70911001C946E0FABB4AA9ADC37045F45A03B56008CB0C8244CB63616";
    private const string LibraryName = "df";
    private readonly IDeepFilterNativeApi native;
    private SafeNativeStateHandle? state;

    public DeepFilterNetNoiseSuppressor() : this(new DeepFilterNativeApi()) { }
    internal DeepFilterNetNoiseSuppressor(IDeepFilterNativeApi native) => this.native = native;

    public bool IsAvailable => state is { IsInvalid: false, IsClosed: false };
    public string BackendName => "DeepFilterNet3";
    public string ModelIdentifier => "DeepFilterNet3-onnx-v0.5.6";
    public string? ModelHash { get; private set; }
    public string? NativeLibraryHash { get; private set; }
    public int SampleRate => AudioConstants.ProcessingSampleRate;
    public int FrameLength { get; private set; }
    public double AlgorithmicLatencyMs => FrameLength <= 0 ? 0 : FrameLength * 2_000d / SampleRate;
    public double AttenuationLimitDb { get; private set; }
    public string? LastError { get; private set; }

    public bool Initialize(NoiseSuppressorInitialization initialization)
    {
        Dispose();
        var modelPath = Path.Combine(initialization.ModelDirectory, ExpectedModelFileName);
        var receiptPath = Path.Combine(initialization.ModelDirectory, "acquisition.json");
        if (!File.Exists(modelPath) || !File.Exists(receiptPath))
        {
            LastError = "The optional DeepFilterNet3 model has not been acquired from the pinned upstream source.";
            return false;
        }

        try
        {
            ModelHash = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(modelPath)));
            if (!ModelHash.Equals(ExpectedModelHash, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("The DeepFilterNet3 model hash does not match the pinned artifact.");
            var libraryPath = Path.Combine(initialization.NativeDirectory, $"{LibraryName}.dll");
            if (File.Exists(libraryPath)) NativeLibraryHash = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(libraryPath)));
            var pointer = native.Create(modelPath, 21f);
            if (pointer == IntPtr.Zero) throw new InvalidOperationException("libDF did not create a model state.");
            state = new SafeNativeStateHandle(pointer, native.Free);
            FrameLength = checked((int)native.GetFrameLength(state));
            if (FrameLength <= 0 || FrameLength > 4_096) throw new InvalidOperationException("libDF reported an invalid frame size.");
            native.SetPostFilterBeta(state, 0f);
            Configure(55f);
            LastError = null;
            return true;
        }
        catch (Exception error) when (error is DllNotFoundException or EntryPointNotFoundException or BadImageFormatException or InvalidDataException or InvalidOperationException or OverflowException)
        {
            LastError = $"DeepFilterNet3 could not start: {error.Message}";
            Dispose();
            return false;
        }
    }

    public void Configure(float amount)
    {
        AttenuationLimitDb = NoiseStrengthMapping.ToAttenuationDb(amount);
        var handle = state;
        if (handle is not null && !handle.IsInvalid) native.SetAttenuationLimit(handle, (float)AttenuationLimitDb);
    }

    public unsafe bool Process(ReadOnlySpan<float> input, Span<float> output, out float localSnrDb)
    {
        localSnrDb = float.NaN;
        var handle = state;
        if (handle is null || handle.IsInvalid || input.Length != FrameLength || output.Length < FrameLength) return false;
        try
        {
            fixed (float* inputPointer = input)
            fixed (float* outputPointer = output)
            {
                localSnrDb = native.ProcessFrame(handle, inputPointer, outputPointer);
            }
            if (!float.IsFinite(localSnrDb)) return false;
            for (var index = 0; index < FrameLength; index++)
                if (!float.IsFinite(output[index])) return false;
            return true;
        }
        catch (Exception error) when (error is SEHException or ObjectDisposedException)
        {
            LastError = "DeepFilterNet3 native processing failed.";
            return false;
        }
    }

    public bool Reset()
    {
        // libDF v0.5.6 does not expose a state-reset call. Reinitialization is
        // intentionally performed off the processing thread by the owner.
        return IsAvailable;
    }

    public void Dispose()
    {
        state?.Dispose();
        state = null;
    }

    internal unsafe interface IDeepFilterNativeApi
    {
        IntPtr Create(string modelPath, float attenuationLimitDb);
        nuint GetFrameLength(SafeNativeStateHandle state);
        void SetAttenuationLimit(SafeNativeStateHandle state, float attenuationLimitDb);
        void SetPostFilterBeta(SafeNativeStateHandle state, float beta);
        float ProcessFrame(SafeNativeStateHandle state, float* input, float* output);
        void Free(IntPtr state);
    }

    private sealed unsafe class DeepFilterNativeApi : IDeepFilterNativeApi
    {
        public IntPtr Create(string modelPath, float attenuationLimitDb) => NativeMethods.Create(modelPath, attenuationLimitDb);
        public nuint GetFrameLength(SafeNativeStateHandle state) => NativeMethods.GetFrameLength(state);
        public void SetAttenuationLimit(SafeNativeStateHandle state, float attenuationLimitDb) => NativeMethods.SetAttenuationLimit(state, attenuationLimitDb);
        public void SetPostFilterBeta(SafeNativeStateHandle state, float beta) => NativeMethods.SetPostFilterBeta(state, beta);
        public float ProcessFrame(SafeNativeStateHandle state, float* input, float* output) => NativeMethods.ProcessFrame(state, input, output);
        public void Free(IntPtr state) => NativeMethods.Free(state);
    }

    private static partial class NativeMethods
    {
        [LibraryImport(LibraryName, EntryPoint = "df_create", StringMarshalling = StringMarshalling.Utf8)]
        [UnmanagedCallConv(CallConvs = [typeof(System.Runtime.CompilerServices.CallConvCdecl)])]
        internal static partial IntPtr Create(string path, float attenuationLimitDb);

        [LibraryImport(LibraryName, EntryPoint = "df_get_frame_length")]
        [UnmanagedCallConv(CallConvs = [typeof(System.Runtime.CompilerServices.CallConvCdecl)])]
        internal static partial nuint GetFrameLength(SafeNativeStateHandle state);

        [LibraryImport(LibraryName, EntryPoint = "df_set_atten_lim")]
        [UnmanagedCallConv(CallConvs = [typeof(System.Runtime.CompilerServices.CallConvCdecl)])]
        internal static partial void SetAttenuationLimit(SafeNativeStateHandle state, float attenuationLimitDb);

        [LibraryImport(LibraryName, EntryPoint = "df_set_post_filter_beta")]
        [UnmanagedCallConv(CallConvs = [typeof(System.Runtime.CompilerServices.CallConvCdecl)])]
        internal static partial void SetPostFilterBeta(SafeNativeStateHandle state, float beta);

        [LibraryImport(LibraryName, EntryPoint = "df_process_frame")]
        [UnmanagedCallConv(CallConvs = [typeof(System.Runtime.CompilerServices.CallConvCdecl)])]
        internal static unsafe partial float ProcessFrame(SafeNativeStateHandle state, float* input, float* output);

        [LibraryImport(LibraryName, EntryPoint = "df_free")]
        [UnmanagedCallConv(CallConvs = [typeof(System.Runtime.CompilerServices.CallConvCdecl)])]
        internal static partial void Free(IntPtr state);
    }
}
