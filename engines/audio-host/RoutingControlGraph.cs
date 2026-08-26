using System.Numerics;

namespace Switchboard.AudioHost;

// Control-rate state for the transport mixer. It is intentionally separate from the
// microphone DSP graph: the virtual driver moves samples, while Audio.Host owns policy.
internal sealed class RoutingControlGraph
{
    private readonly Dictionary<string, BusControl> buses = new(StringComparer.OrdinalIgnoreCase)
    {
        ["game"] = new(),
        ["chat"] = new(),
        ["media"] = new(),
        ["aux"] = new(),
    };
    private float masterGain = 1f;
    private int masterEnabled = 1;

    public void Configure(AudioHostSettings settings)
    {
        Volatile.Write(ref masterGain, Math.Clamp(settings.Master.Gain, 0f, 1.5f));
        Volatile.Write(ref masterEnabled, settings.Master.Enabled ? 1 : 0);
        foreach (var bus in settings.Buses)
        {
            if (!buses.TryGetValue(bus.Id, out var control)) continue;
            control.Set(bus.Gain, bus.Enabled);
        }
    }

    public void Process(Span<float> samples, string busId)
    {
        var gain = buses.TryGetValue(busId, out var bus) && bus.Enabled ? bus.Gain : 0f;
        gain *= Volatile.Read(ref masterEnabled) != 0 ? Volatile.Read(ref masterGain) : 0f;
        var width = Vector<float>.Count;
        var gainVector = new Vector<float>(gain);
        var index = 0;
        for (; index <= samples.Length - width; index += width)
        {
            var vector = new Vector<float>(samples.Slice(index, width));
            (vector * gainVector).CopyTo(samples.Slice(index, width));
        }
        for (; index < samples.Length; index++) samples[index] *= gain;
    }

    private sealed class BusControl
    {
        private float gain = 1f;
        private int enabled = 1;
        public float Gain => Volatile.Read(ref gain);
        public bool Enabled => Volatile.Read(ref enabled) != 0;
        public void Set(float nextGain, bool nextEnabled)
        {
            Volatile.Write(ref gain, Math.Clamp(nextGain, 0f, 1.5f));
            Volatile.Write(ref enabled, nextEnabled ? 1 : 0);
        }
    }
}
