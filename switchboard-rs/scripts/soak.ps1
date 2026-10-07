# Samples the background service every $Every seconds for $Minutes minutes.
param([int]$Minutes = 10, [int]$Every = 10, [string]$Out = "soak.csv")
$p = Get-Process switchboard-rs | Sort-Object StartTime | Select-Object -First 1
$cores = [Environment]::ProcessorCount
"t_s,private_mb,ws_mb,handles,threads,cpu_pct" | Set-Content $Out
$t0 = Get-Date; $c0 = $p.TotalProcessorTime.TotalSeconds; $last = $t0; $lastCpu = $c0
while (((Get-Date) - $t0).TotalMinutes -lt $Minutes) {
  Start-Sleep -Seconds $Every
  $p.Refresh(); $now = Get-Date; $cpu = $p.TotalProcessorTime.TotalSeconds
  $pct = ($cpu - $lastCpu) / ($now - $last).TotalSeconds / $cores * 100
  "{0:N0},{1:N1},{2:N1},{3},{4},{5:N2}" -f ($now - $t0).TotalSeconds, ($p.PrivateMemorySize64/1MB), ($p.WorkingSet64/1MB), $p.HandleCount, $p.Threads.Count, $pct | Add-Content $Out
  $last = $now; $lastCpu = $cpu
}
