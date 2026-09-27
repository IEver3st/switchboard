using System.Runtime.InteropServices;

namespace Switchboard.AudioHost.Realtime;

// Register once on the DSP thread and revert on that same thread at shutdown.
// An unavailable MMCSS service leaves the existing AboveNormal priority in place.
internal sealed partial class AudioThreadScheduling : IDisposable
{
    private nint handle;
    public AudioThreadScheduling()
    {
        uint taskIndex = 0;
        handle = AvSetMmThreadCharacteristics("Pro Audio", ref taskIndex);
    }
    public bool Active => handle != 0;
    public void Dispose()
    {
        if (handle == 0) return;
        AvRevertMmThreadCharacteristics(handle);
        handle = 0;
    }

    [LibraryImport("avrt.dll", EntryPoint = "AvSetMmThreadCharacteristicsW", StringMarshalling = StringMarshalling.Utf16)]
    private static partial nint AvSetMmThreadCharacteristics(string taskName, ref uint taskIndex);

    [LibraryImport("avrt.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool AvRevertMmThreadCharacteristics(nint handle);
}
