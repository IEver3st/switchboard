# Fires the service's global shortcut with synthesized keys and captures
# the saved-clip notice. Uses a temporary shortcut so it cannot collide with
# another app, then restores the original.
param([string]$Out = "toast.png")
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing, System.Windows.Forms
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class Keys {
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr v);
  public static void Chord(byte[] mods, byte key) {
    foreach (var m in mods) keybd_event(m, 0, 0, UIntPtr.Zero);
    keybd_event(key, 0, 0, UIntPtr.Zero); keybd_event(key, 0, 2, UIntPtr.Zero);
    Array.Reverse(mods); foreach (var m in mods) keybd_event(m, 0, 2, UIntPtr.Zero);
  }
}
"@
[void][Keys]::SetProcessDpiAwarenessContext([IntPtr]-4)
$svc = Join-Path $PSScriptRoot "service.ps1"
$settings = ((& $svc Subscribe) | ConvertFrom-Json).state.settings
$original = $settings.hotkey
$settings.hotkey = "Ctrl+Alt+F9"
$apply = @{ type = "ApplySettings"; settings = $settings } | ConvertTo-Json -Depth 5 -Compress
[void](& $svc -Json $apply -Until State)
Start-Sleep -Milliseconds 300
$state = ((& $svc Subscribe) | ConvertFrom-Json).state
"shortcut now: $($state.settings.hotkey), error: $($state.hotkey_error)"

# Listen for the save event while the chord fires.
$listener = Start-Job -ScriptBlock {
  $name = "switchboard-native-" + ($env:USERNAME -replace '[^A-Za-z0-9]', '_')
  $pipe = New-Object System.IO.Pipes.NamedPipeClientStream(".", $name, [System.IO.Pipes.PipeDirection]::InOut)
  $pipe.Connect(2000); $r = New-Object System.IO.StreamReader($pipe); $w = New-Object System.IO.StreamWriter($pipe); $w.AutoFlush = $true
  $w.WriteLine('{"type":"Subscribe"}')
  while ($true) { $line = $r.ReadLine(); if ($null -eq $line) { break }; if (($line | ConvertFrom-Json).type -match 'Clip') { $line; break } }
}
Start-Sleep -Milliseconds 700
$t = [Diagnostics.Stopwatch]::StartNew()
[Keys]::Chord([byte[]](0x11, 0x12), 0x78)   # Ctrl+Alt+F9
Start-Sleep -Milliseconds 450
# Capture only the notice area (top-right of the primary work area).
$wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$scale = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width / [System.Windows.Forms.SystemInformation]::PrimaryMonitorSize.Width
$bmp = New-Object System.Drawing.Bitmap 640, 170
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($wa.Right - 640, $wa.Top, 0, 0, $bmp.Size); $g.Dispose()
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
if (Wait-Job $listener -Timeout 10) { "event after {0} ms: {1}" -f $t.ElapsedMilliseconds, (Receive-Job $listener) } else { "no save event"; Stop-Job $listener }

$settings.hotkey = $original
$apply = @{ type = "ApplySettings"; settings = $settings } | ConvertTo-Json -Depth 5 -Compress
[void](& $svc -Json $apply -Until State)
"restored shortcut: " + (((& $svc Subscribe) | ConvertFrom-Json).state.settings.hotkey)
