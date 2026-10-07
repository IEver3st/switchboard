# Turns Instant Replay off and on repeatedly and checks that handles,
# threads and memory return to their running baseline.
param([int]$Cycles = 10)
$svc = Join-Path $PSScriptRoot "service.ps1"
$p = Get-Process switchboard-rs | Sort-Object StartTime | Select-Object -First 1
function Snap($label) {
  $p.Refresh()
  "{0,-14} private={1,6:N1}MB ws={2,6:N1}MB handles={3,5} threads={4,3}" -f $label, ($p.PrivateMemorySize64/1MB), ($p.WorkingSet64/1MB), $p.HandleCount, $p.Threads.Count
}
function WaitReplay($want) {
  for ($i = 0; $i -lt 40; $i++) {
    $state = ((& $svc Subscribe) | ConvertFrom-Json).state
    if ($state.replay.state -eq $want) { return $true }
    Start-Sleep -Milliseconds 250
  }
  return $false
}
Snap "before"
$sw = [Diagnostics.Stopwatch]::StartNew()
for ($c = 1; $c -le $Cycles; $c++) {
  [void](& $svc -Json '{"type":"SetReplay","enabled":false}' -Until State)
  if (-not (WaitReplay "Off")) { "cycle ${c}: did not stop"; break }
  if ($c -eq 1) { Snap "off" }
  [void](& $svc -Json '{"type":"SetReplay","enabled":true}' -Until State)
  if (-not (WaitReplay "Running")) { "cycle ${c}: did not start"; break }
}
"{0} cycles in {1:N1}s" -f $Cycles, $sw.Elapsed.TotalSeconds
Start-Sleep -Seconds 5
Snap "after"
