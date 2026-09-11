using Switchboard.CaptureHost;

internal static class NvencReplayTests
{
    public static void AssertArguments()
    {
        var settings = new CaptureSettings(CacheDirectory: Path.GetTempPath(), ClipsDirectory: Path.GetTempPath());
        var source = new CaptureSource("fixture", "display", "Synthetic", null, null, null, true);
        foreach (var encoder in new[] { "h264_nvenc", "hevc_nvenc", "av1_nvenc" })
        foreach (var backend in new[] { "Windows Graphics Capture", "Desktop Duplication" })
        foreach (var diagnostic in new[] { false, true })
        {
            var arguments = ReplayEngine.BuildVideoArguments(settings, source, backend, encoder, "", diagnostic).ToArray();
            var delay = int.Parse(Value(arguments, "-delay"));
            if (delay < 2 || delay > 4)
                throw new Exception($"{encoder}: replay must allow bounded encode overlap, not wait on every submitted frame (delay={delay}).");
            var surfaces = int.Parse(Value(arguments, "-surfaces"));
            if (surfaces <= delay || surfaces > 8)
                throw new Exception($"{encoder}: frame surfaces must cover the pipeline without an automatic allocation.");
            if (Value(arguments, "-bf") != "0" || Value(arguments, "-rc-lookahead") != "0")
                throw new Exception($"{encoder}: reordering/lookahead must not expand the bounded replay pipeline.");
            if (Value(arguments, "-forced-idr") != "1")
                throw new Exception($"{encoder}: saved segments must start independently of evicted reference frames.");
            if (arguments.Contains("-thread_queue_size") || arguments.Contains("-vf"))
                throw new Exception($"{encoder}: retain the single hardware input without a raw-frame queue or CPU download.");
            if (Value(arguments, "-c:v") != encoder || Value(arguments, "-b:v") != settings.TargetVideoBitrateBps.ToString())
                throw new Exception("Replay pipelining must preserve the selected codec and bitrate.");
        }
    }

    private static string Value(string[] arguments, string option)
    {
        var index = Array.IndexOf(arguments, option);
        if (index < 0 || index + 1 == arguments.Length) throw new Exception($"Missing replay encoder option {option}.");
        return arguments[index + 1];
    }
}
