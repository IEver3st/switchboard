using NAudio.CoreAudioApi;
using NAudio.Wave;

namespace Switchboard.AudioHost;

internal static class MicrophoneCableCatalog
{
    public const string InterfaceName = "VB-Audio Hi-Fi Cable";
    public static bool IsCable(AudioEndpoint endpoint) => string.Equals(endpoint.InterfaceName, InterfaceName, StringComparison.OrdinalIgnoreCase);
    public static AudioEndpoint? Find(IEnumerable<AudioEndpoint> endpoints, string flow) => endpoints.FirstOrDefault(endpoint =>
        IsCable(endpoint) && endpoint.Flow == flow
        && (EndpointCatalog.FriendlyNameMatches(endpoint.Name, flow == "render" ? "Hi-Fi Cable Input" : "Hi-Fi Cable Output")
            || EndpointCatalog.FriendlyNameMatches(endpoint.Name, "Switchboard Microphone")));
}

// Dedicated mic transport. It never shares the application mixer's cable or ring.
// All opening/recovery runs on the existing host control tick, not the callback.
internal sealed class MicrophoneCableOutput : IDisposable
{
    private readonly EndpointService endpoints;
    private readonly GatedSource source;
    private MMDevice? device;
    private AudioOutput? output;
    private AudioEndpoint? destination;
    private Exception? failure;
    private string? error;
    private bool started;
    private bool waitingForDriver;
    private bool disposed;

    public MicrophoneCableOutput(EndpointService endpoints, ISampleProvider source, bool enabled)
    {
        this.endpoints = endpoints;
        this.source = new GatedSource(source);
        SetEnabled(enabled);
        Recover();
    }

    public bool Running => started && Volatile.Read(ref failure) is null;
    public MicrophoneVirtualOutputRuntime Snapshot() => new(Running, Running ? destination?.Id : null,
        Running ? destination?.Name : null, Volatile.Read(ref failure)?.Message ?? error);
    public void SetEnabled(bool enabled) => source.SetEnabled(enabled);

    public void Recover()
    {
        if (disposed || Running || waitingForDriver) return;
        Close();
        try
        {
            var inventory = endpoints.List();
            var input = MicrophoneCableCatalog.Find(inventory, "render");
            destination = MicrophoneCableCatalog.Find(inventory, "capture");
            if (input is null || destination is null)
            {
                waitingForDriver = true;
                throw new InvalidOperationException("Install the free VB-Audio Hi-Fi Cable to use the processed microphone in other apps, then restart Windows.");
            }
            device = endpoints.Open(input.Id);
            using var receiver = endpoints.Open(destination.Id);
            using var renderClient = device.CreateAudioClient();
            using var captureClient = receiver.CreateAudioClient();
            if (renderClient.MixFormat.SampleRate != captureClient.MixFormat.SampleRate)
                throw new InvalidOperationException("Set Hi-Fi Cable Input and Output to the same sample rate in Windows Sound settings (48 kHz recommended).");
            source.DiscardBufferedSamples();
            output = new AudioOutput(device, source);
            output.Failed += OnFailed;
            output.Start();
            started = true;
            error = null;
        }
        catch (Exception exception)
        {
            Close();
            error = exception.Message;
        }
    }

    private void OnFailed(Exception exception) => Volatile.Write(ref failure, exception);
    private void Close()
    {
        started = false;
        if (output is not null) { output.Failed -= OnFailed; output.Dispose(); output = null; }
        device?.Dispose(); device = null;
        Volatile.Write(ref failure, null);
    }
    public void Dispose() { if (disposed) return; disposed = true; Close(); }

    private sealed class GatedSource(ISampleProvider source) : ISampleProvider
    {
        private int enabled;
        public WaveFormat WaveFormat => source.WaveFormat;
        public void DiscardBufferedSamples() { if (source is SpscFloatRing ring) ring.DiscardBufferedSamples(); }
        public void SetEnabled(bool value) => Volatile.Write(ref enabled, value ? 1 : 0);
        public int Read(Span<float> buffer)
        {
            var count = source.Read(buffer);
            if (Volatile.Read(ref enabled) == 0) buffer[..count].Clear();
            return count;
        }
    }
}
