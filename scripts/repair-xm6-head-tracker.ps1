# Inspect by default. -Apply changes only the failed XM6 Android Head Tracker
# from Microsoft's sensor driver to Microsoft's inbox generic HID driver.
# Audio profiles, pairing and other Bluetooth devices are not modified.
[CmdletBinding()]
param([switch]$Apply)
$ErrorActionPreference = 'Stop'
$matches = @(Get-PnpDevice -PresentOnly | Where-Object {
    $_.InstanceId -like 'HID\{00001124-0000-1000-8000-00805F9B34FB}_VID&0002054C_PID&0F8A\*'
} | ForEach-Object {
    $node = $_
    $properties = @{}
    Get-PnpDeviceProperty -InstanceId $node.InstanceId | ForEach-Object { $properties[$_.KeyName] = $_.Data }
    if ($properties['DEVPKEY_Device_ProblemCode'] -eq 10 -and
        $properties['DEVPKEY_Device_Parent'] -like 'BTHENUM\*' -and
        ($properties['DEVPKEY_Device_HardwareIds'] -match 'UP:0020_U:00E1') -and
        $properties['DEVPKEY_Device_DriverInfPath'] -eq 'sensorshidclassdriver.inf') {
        [pscustomobject]@{ InstanceId = $node.InstanceId; HardwareId = @($properties['DEVPKEY_Device_HardwareIds'])[0]; OriginalInf = $properties['DEVPKEY_Device_DriverInfPath']; ProblemCode = 10 }
    }
})
if ($matches.Count -ne 1) { throw "Expected exactly one WH-1000XM6 tracker with sensor-driver Code 10; found $($matches.Count). Nothing changed." }
$target = $matches[0]
# The Windows update API matches hardware IDs, so refuse if this ID is shared by
# another present node rather than silently changing more than the selected node.
$sameId = @(Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -like 'HID\*VID&0002054C_PID&0F8A\*' } | Where-Object {
    $ids = (Get-PnpDeviceProperty -InstanceId $_.InstanceId -KeyName 'DEVPKEY_Device_HardwareIds' -ErrorAction SilentlyContinue).Data
    $ids -contains $target.HardwareId
})
if ($sameId.Count -ne 1) { throw 'The exact tracker hardware ID is not unique. Nothing changed.' }
$target | Format-List
if (!$Apply) { Write-Output 'Inspection only. Run this script with -Apply from an Administrator PowerShell to repair this binding.'; return }
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if (!(New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Administrator PowerShell is required. No driver binding was changed.'
}
$backup = Join-Path $env:TEMP ('switchboard-xm6-driver-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json')
$target | ConvertTo-Json | Set-Content -LiteralPath $backup -Encoding UTF8
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class SwitchboardTrackerDriver {
    [DllImport("newdev.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool UpdateDriverForPlugAndPlayDevicesW(IntPtr parent, string hardwareId, string inf, uint flags, out bool reboot);
}
'@
$reboot = $false
$inf = Join-Path $env:SystemRoot 'INF\input.inf'
if (![SwitchboardTrackerDriver]::UpdateDriverForPlugAndPlayDevicesW([IntPtr]::Zero, $target.HardwareId, $inf, 5, [ref]$reboot)) {
    throw (New-Object ComponentModel.Win32Exception([Runtime.InteropServices.Marshal]::GetLastWin32Error()))
}
Write-Output "Binding request succeeded. Restart required: $reboot. Original binding recorded at $backup"
Write-Output 'To revert, select this exact sensor in Device Manager, Update driver > Browse > Let me pick > HID Custom Sensor (Microsoft). Do not change its Bluetooth parent or audio endpoints.'
Start-Sleep -Seconds 2
Get-PnpDevice -InstanceId $target.InstanceId | Format-List Status,Class,FriendlyName,InstanceId
Write-Output 'Sensor packets still need verification in Switchboard. No reboot was initiated.'
