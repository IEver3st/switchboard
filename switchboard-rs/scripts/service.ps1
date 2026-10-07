# Talks to the running background service over its named pipe.
#   ./scripts/service.ps1 Subscribe | SaveClip | Quit
#   ./scripts/service.ps1 -Json '{"type":"SetReplay","enabled":false}' -Until State
param([string]$Type = "Subscribe", [string]$Json = "", [string]$Until = "", [int]$Timeout = 10)
$job = Start-Job -ArgumentList $Type, $Json, $Until -ScriptBlock {
  param($Type, $Json, $Until)
  $name = "switchboard-native-" + ($env:USERNAME -replace '[^A-Za-z0-9]', '_')
  $pipe = New-Object System.IO.Pipes.NamedPipeClientStream(".", $name, [System.IO.Pipes.PipeDirection]::InOut)
  try { $pipe.Connect(2000) } catch { "not running"; return }
  $r = New-Object System.IO.StreamReader($pipe); $w = New-Object System.IO.StreamWriter($pipe); $w.AutoFlush = $true
  $w.WriteLine('{"type":"Subscribe"}'); $state = $r.ReadLine()
  if (-not $Json -and $Type -eq "Subscribe") { $state; return }
  $msg = if ($Json) { $Json } else { "{""type"":""$Type""}" }
  $w.WriteLine($msg)
  while ($true) {
    $line = $r.ReadLine(); if ($null -eq $line) { "closed"; break }
    $kind = ($line | ConvertFrom-Json).type
    if ($Until) { if ($kind -eq $Until) { $line; break } else { continue } }
    if ($kind -ne 'State') { $line; if ($Type -ne 'Quit') { break } }
  }
}
if (Wait-Job $job -Timeout $Timeout) { Receive-Job $job } else { "timeout"; Stop-Job $job }
