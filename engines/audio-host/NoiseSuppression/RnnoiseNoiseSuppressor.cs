using System.Runtime.InteropServices;
using System.Security.Cryptography;

namespace Switchboard.AudioHost.NoiseSuppression;

internal sealed partial class RnnoiseNoiseSuppressor : INoiseSuppressor
{
    private const string LibraryName = "switchboard_noise";
    private SafeNativeStateHandle? state;

    public bool IsAvailable => state is { IsInvalid: false, IsClosed: false };
    public string BackendName => "RNNoise";
    public string ModelIdentifier => "nnnoiseless-v0.5.2-default";
    public string? ModelHash => null;
    public string? NativeLibraryHash { get; private set; }
    public int SampleRate => AudioConstants.ProcessingSampleRate;
    public int FrameLength { get; private set; } = 480;
    public int OutputDelaySamples => FrameLength;
    public float SpeechProbability => VoiceProbability;
    public double AlgorithmicLatencyMs => FrameLength * 2_000d / SampleRate;
    public string? LastError { get; private set; }
    internal float VoiceProbability { get; private set; }

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
            VoiceProbability = voiceProbability;
            for (var index = 0; index < FrameLength; index++)
            {
                if (!float.IsFinite(output[index])) return false;
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
        try
        {
            if (!NativeMethods.Reset(handle)) return false;
            VoiceProbability = 0f;
            return true;
        }
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
        VoiceProbability = 0f;
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
