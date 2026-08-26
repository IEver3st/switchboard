using System.Runtime.InteropServices;
using System.Security.Cryptography;

namespace Switchboard.AudioHost.NoiseSuppression;

internal sealed partial class RnnoiseNoiseSuppressor : INoiseSuppressor
{
    private const string LibraryName = "switchboard_noise";
    private SafeNativeStateHandle? state;
    private float dryFloor;

    public bool IsAvailable => state is { IsInvalid: false, IsClosed: false };
    public string BackendName => "RNNoise";
    public string ModelIdentifier => "nnnoiseless-v0.5.2-default";
    public string? ModelHash => null;
    public string? NativeLibraryHash { get; private set; }
    public int SampleRate => AudioConstants.ProcessingSampleRate;
    public int FrameLength { get; private set; } = 480;
    public double AlgorithmicLatencyMs => FrameLength * 2_000d / SampleRate;
    public double AttenuationLimitDb { get; private set; }
    public string? LastError { get; private set; }

    public bool Initialize(NoiseSuppressorInitialization initialization)
    {
        Dispose();
        try
        {
            var libraryPath = Path.Combine(initialization.NativeDirectory, $"{LibraryName}.dll");
            if (!File.Exists(libraryPath)) throw new DllNotFoundException($"The native library was not found at {libraryPath}.");
            var pointer = NativeMethods.Create();
            if (pointer == IntPtr.Zero) throw new InvalidOperationException("RNNoise did not create a model state.");
            state = new SafeNativeStateHandle(pointer, NativeMethods.Destroy);
            FrameLength = checked((int)NativeMethods.GetFrameSize());
            if (FrameLength <= 0 || FrameLength > 4_096) throw new InvalidOperationException("RNNoise reported an invalid frame size.");
            NativeLibraryHash = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(libraryPath)));
            LastError = null;
            return true;
        }
        catch (Exception error) when (error is DllNotFoundException or EntryPointNotFoundException or BadImageFormatException or InvalidOperationException or OverflowException)
        {
            LastError = $"RNNoise could not start: {error.Message}";
            Dispose();
            return false;
        }
    }

    public void Configure(float amount)
    {
        AttenuationLimitDb = NoiseStrengthMapping.ToAttenuationDb(amount);
        dryFloor = NoiseStrengthMapping.ToDryFloor(amount);
    }

    public unsafe bool Process(ReadOnlySpan<float> input, Span<float> output, out float localSnrDb)
    {
        localSnrDb = float.NaN;
        var handle = state;
        if (handle is null || handle.IsInvalid || input.Length != FrameLength || output.Length < FrameLength) return false;
        try
        {
            float voiceProbability;
            fixed (float* inputPointer = input)
            fixed (float* outputPointer = output)
            {
                if (!NativeMethods.ProcessFrame(handle, inputPointer, outputPointer, &voiceProbability)) return false;
            }
            for (var index = 0; index < FrameLength; index++)
            {
                var sample = output[index] * (1f - dryFloor) + input[index] * dryFloor;
                if (!float.IsFinite(sample)) return false;
                output[index] = sample;
            }
            return true;
        }
        catch (Exception error) when (error is SEHException or ObjectDisposedException)
        {
            LastError = "RNNoise native processing failed.";
            return false;
        }
    }

    public bool Reset()
    {
        var handle = state;
        if (handle is null || handle.IsInvalid) return false;
        try { return NativeMethods.Reset(handle); }
        catch (Exception error) when (error is SEHException or ObjectDisposedException)
        {
            LastError = $"RNNoise reset failed: {error.Message}";
            return false;
        }
    }

    public void Dispose()
    {
        state?.Dispose();
        state = null;
    }

    private static partial class NativeMethods
    {
        [LibraryImport(LibraryName, EntryPoint = "switchboard_noise_get_frame_size")]
        [UnmanagedCallConv(CallConvs = [typeof(System.Runtime.CompilerServices.CallConvCdecl)])]
        internal static partial nuint GetFrameSize();

        [LibraryImport(LibraryName, EntryPoint = "switchboard_noise_create")]
        [UnmanagedCallConv(CallConvs = [typeof(System.Runtime.CompilerServices.CallConvCdecl)])]
        internal static partial IntPtr Create();

        [LibraryImport(LibraryName, EntryPoint = "switchboard_noise_reset")]
        [return: MarshalAs(UnmanagedType.I1)]
        [UnmanagedCallConv(CallConvs = [typeof(System.Runtime.CompilerServices.CallConvCdecl)])]
        internal static partial bool Reset(SafeNativeStateHandle state);

        [LibraryImport(LibraryName, EntryPoint = "switchboard_noise_process_frame")]
        [return: MarshalAs(UnmanagedType.I1)]
        [UnmanagedCallConv(CallConvs = [typeof(System.Runtime.CompilerServices.CallConvCdecl)])]
        internal static unsafe partial bool ProcessFrame(SafeNativeStateHandle state, float* input, float* output, float* voiceProbability);

        [LibraryImport(LibraryName, EntryPoint = "switchboard_noise_destroy")]
        [UnmanagedCallConv(CallConvs = [typeof(System.Runtime.CompilerServices.CallConvCdecl)])]
        internal static partial void Destroy(IntPtr state);
    }
}
