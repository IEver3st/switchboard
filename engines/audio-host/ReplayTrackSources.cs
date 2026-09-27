using NAudio.Wave;

namespace Switchboard.AudioHost;

// Shared by both transport backends. A source has exactly one reader: chat can
// never leak into the system track and microphone ownership stays in AudioEngine.
internal sealed class ReplayTrackSources
{
    private readonly List<ISampleProvider> system = [];
    private readonly List<ISampleProvider> chat = [];

    public void Add(string busId, ISampleProvider source)
    {
        if (busId is not ("game" or "media" or "aux" or "chat")) throw new ArgumentOutOfRangeException(nameof(busId));
        (busId == "chat" ? chat : system).Add(source);
    }

    public ISampleProvider System => new FixedMixer(system);
    public ISampleProvider Chat => new FixedMixer(chat);
}
