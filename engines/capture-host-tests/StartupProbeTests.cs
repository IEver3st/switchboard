using System.Diagnostics;
using Switchboard.CaptureHost;

internal static class StartupProbeTests
{
    internal static async Task<bool> RunFixtureAsync(string[] args)
    {
        if (args.Contains("switchboard_stdin_fixture"))
        {
            // An inherited, still-open host command pipe would block here or feed
            // its JSON commands to the probe instead of the host.
            Environment.ExitCode = (await Console.In.ReadToEndAsync()).Length == 0 ? 0 : 1;
            return true;
        }
        if (!args.Contains("--startup-probe-host")) return false;
        var passed = await FfmpegLocator.ProbeEncoderAsync(Environment.ProcessPath!, "switchboard_stdin_fixture", CancellationToken.None);
        Console.WriteLine($"probe={passed};command={await Console.In.ReadLineAsync()}");
        return true;
    }

    internal static async Task AssertStdinIsolationAsync()
    {
        using var job = new WindowsChildProcessJob();
        var start = new ProcessStartInfo(Environment.ProcessPath!)
        {
            UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true,
        };
        start.ArgumentList.Add("--startup-probe-host");
        using var process = job.Start(start, "startup probe regression fixture");
        var output = process.StandardOutput.ReadToEndAsync();
        var errors = process.StandardError.ReadToEndAsync();
        try
        {
            await process.StandardInput.WriteLineAsync("setDiagnostics");
            await process.StandardInput.FlushAsync();
            using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            await process.WaitForExitAsync(deadline.Token);
            if (process.ExitCode != 0 || (await output).Trim() != "probe=True;command=setDiagnostics")
                throw new InvalidOperationException("A startup encoder probe consumed the host command pipe. " + await errors);
        }
        catch (OperationCanceledException)
        {
            throw new InvalidOperationException("Startup probe blocked on the host command pipe instead of isolated EOF.");
        }
        finally
        {
            if (!process.HasExited) process.Kill(entireProcessTree: true);
            await process.WaitForExitAsync();
            await Task.WhenAll(output, errors);
        }
    }
}
