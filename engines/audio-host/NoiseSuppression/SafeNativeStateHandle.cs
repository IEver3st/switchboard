using Microsoft.Win32.SafeHandles;

namespace Switchboard.AudioHost.NoiseSuppression;

internal sealed class SafeNativeStateHandle : SafeHandleZeroOrMinusOneIsInvalid
{
    private readonly Action<IntPtr> release;

    public SafeNativeStateHandle(IntPtr value, Action<IntPtr> release) : base(ownsHandle: true)
    {
        this.release = release;
        SetHandle(value);
    }

    protected override bool ReleaseHandle()
    {
        release(handle);
        return true;
    }
}

