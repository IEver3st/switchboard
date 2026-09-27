namespace Switchboard.AudioHost;

// Runs on the control thread when sessions appear, never in an audio callback.
internal static class ApplicationRoutingPolicy
{
    internal static string? AutomaticDestination(string executablePath)
    {
        var name = Path.GetFileNameWithoutExtension(executablePath).ToLowerInvariant();
        return name switch
        {
            "audio.host" or "capture.host" or "switchboard" or "audiodg" or "system"
                or "steelseriesgg" or "steelseriessonar" or "obs64" or "obs32"
                or "voicemeeter" or "voicemeeter8" or "voicemeeterpro" or "voicemeeterpro_x64"
                or "voicemeeter8x64" or "voicemeeter_x64" => null,
            "discord" or "discordcanary" or "discordptb" or "slack" or "teams" or "ms-teams"
                or "zoom" or "skype" or "mumble" or "ts3client_win64" or "ts3client_win32"
                or "teamspeak" or "whatsapp" or "telegram" or "signal" => "chat",
            "chrome" or "msedge" or "firefox" or "brave" or "opera" or "vivaldi" or "helium"
                or "zen" or "spotify" or "vlc" or "musicbee" or "foobar2000" or "itunes"
                or "applemusic" or "wmplayer" or "microsoft.media.player" or "mpv"
                or "mpc-hc" or "mpc-hc64" or "tidal" or "amazon music" => "media",
            _ => "game",
        };
    }

    internal static string? Destination(string path, bool automatic, IReadOnlyDictionary<string, string> overrides)
    {
        var category = AutomaticDestination(path);
        // Mixer/host outputs must never feed back into their own input.
        if (category is null) return null;
        return overrides.TryGetValue(path, out var selected) ? selected : automatic ? category : null;
    }
}
