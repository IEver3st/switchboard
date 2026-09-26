using System.Diagnostics;
using NAudio.CoreAudioApi;
using Switchboard.CaptureHost;

internal static class ChatAudioTests
{
    // Opt-in: reads the live endpoint/session inventory and opens loopback inputs.
    // No output playback, screen capture, or saved conversation audio.
    public static async Task RunLiveAsync()
    {
        using var devices = new MMDeviceEnumerator();
        using var system = devices.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
        using var chat = devices.GetDefaultAudioEndpoint(DataFlow.Render, Role.Communications);
        Console.WriteLine($"Desktop: {system.FriendlyName}; communications: {chat.FriendlyName}");
        using (var outputs = devices.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active))
        for (var i = 0; i < outputs.Count; i++)
        {
            using var output = outputs[i];
            using var sessions = output.AudioSessionManager.Sessions;
            for (var j = 0; j < sessions.Count; j++)
            {
                using var session = sessions[j];
                try
                {
                    using var process = Process.GetProcessById((int)session.GetProcessID);
                    if (process.ProcessName.Equals("Discord", StringComparison.OrdinalIgnoreCase))
                        Console.WriteLine($"Discord output: {output.FriendlyName} ({session.State})");
                }
                catch (ArgumentException) { }
            }
        }
        if (ReplayEngine.CreateChatAudio(new(IncludeChatAudio: false)) is not null)
            throw new Exception("Disabled chat must not open a device.");
        for (var cycle = 0; cycle < 3; cycle++)
        {
            await using var automatic = ReplayEngine.CreateChatAudio(new(IncludeChatAudio: true))!;
            if (!string.Equals(chat.ID, automatic.EndpointId, StringComparison.OrdinalIgnoreCase))
                throw new Exception("Automatic chat recorded the desktop endpoint instead of communications.");
            await automatic.StartAnalysisOnlyAsync();
            await Task.Delay(150);
            await automatic.DisposeAsync();
        }
        await using var explicitDevice = ReplayEngine.CreateChatAudio(new(IncludeChatAudio: true, ChatAudioDeviceId: system.ID))!;
        if (explicitDevice.EndpointId != system.ID) throw new Exception("Explicit chat output must override automatic routing.");
        try
        {
            await using var missing = ReplayEngine.CreateChatAudio(new(IncludeChatAudio: true, ChatAudioDeviceId: "missing-chat-device"));
            throw new Exception("Unavailable explicit chat must not fall back to another output.");
        }
        catch (System.Runtime.InteropServices.COMException) { }
        Console.WriteLine("Chat loopback selection and repeated start/stop passed. No conversation was saved.");
    }
}
