param(
  [int]$RootPid = 0,
  [ValidateRange(2, 120)][int]$Samples = 6,
  [ValidateRange(100, 60000)][int]$IntervalMilliseconds = 1000,
  [ValidateRange(1, 65536)][double]$TotalPrivateLimitMb = 512,
  [ValidateRange(0, 65536)][double]$RendererGrowthLimitMbPerMinute = 60
)

$ErrorActionPreference = 'Stop'
$repositoryPath = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$series = @()

for ($sampleIndex = 0; $sampleIndex -lt $Samples; $sampleIndex += 1) {
  $all = Get-CimInstance Win32_Process
  if ($RootPid -le 0) {
    $root = $all |
      Where-Object {
        $_.Name -eq 'electron.exe' -and
        $_.ExecutablePath -like "$repositoryPath*" -and
        $_.CommandLine -notmatch ' --type=' -and
        $_.CommandLine.Trim() -match 'electron\.exe"?\s+\.$'
      } |
      Sort-Object CreationDate -Descending |
      Select-Object -First 1
  } else {
    $root = $all | Where-Object ProcessId -eq $RootPid | Select-Object -First 1
  }
  if (-not $root) { throw 'No running Switchboard development Electron root was found.' }

  $ids = [System.Collections.Generic.HashSet[uint32]]::new()
  [void]$ids.Add([uint32]$root.ProcessId)
  do {
    $countBefore = $ids.Count
    foreach ($process in $all) {
      if ($ids.Contains([uint32]$process.ParentProcessId)) { [void]$ids.Add([uint32]$process.ProcessId) }
    }
  } while ($ids.Count -gt $countBefore)

  $rows = foreach ($process in $all | Where-Object { $ids.Contains([uint32]$_.ProcessId) }) {
    $role = if ($process.Name -eq 'Capture.Host.exe') { 'capture-host' }
      elseif ($process.Name -eq 'Audio.Host.exe') { 'audio-host' }
      elseif ($process.Name -eq 'ffmpeg.exe' -and $process.CommandLine -match 'gfxcapture') { 'capture-video' }
      elseif ($process.Name -eq 'ffmpeg.exe' -and $process.CommandLine -match 'Microphone') { 'capture-microphone' }
      elseif ($process.Name -eq 'ffmpeg.exe') { 'capture-audio' }
      elseif ($process.CommandLine -match '--type=renderer') { 'renderer' }
      elseif ($process.CommandLine -match '--type=gpu-process') { 'gpu' }
      elseif ($process.CommandLine -match '--type=utility') { 'utility' }
      elseif ($process.ProcessId -eq $root.ProcessId) { 'browser' }
      else { $process.Name }
    [pscustomobject]@{
      pid = [int]$process.ProcessId
      role = $role
      privateMb = [math]::Round($process.PrivatePageCount / 1MB, 1)
      workingSetMb = [math]::Round($process.WorkingSetSize / 1MB, 1)
      handles = (Get-Process -Id $process.ProcessId -ErrorAction SilentlyContinue).HandleCount
    }
  }

  $series += [pscustomobject]@{
    sample = $sampleIndex
    sampledAt = (Get-Date).ToString('o')
    rootPid = [int]$root.ProcessId
    privateMb = [math]::Round(($rows | Measure-Object privateMb -Sum).Sum, 1)
    workingSetMb = [math]::Round(($rows | Measure-Object workingSetMb -Sum).Sum, 1)
    processes = @($rows)
  }
  if ($sampleIndex -lt $Samples - 1) { Start-Sleep -Milliseconds $IntervalMilliseconds }
}

$first = $series[0]
$last = $series[-1]
$maximumPrivateMb = ($series | Measure-Object privateMb -Maximum).Maximum
$firstRenderer = ($first.processes | Where-Object role -eq 'renderer' | Measure-Object privateMb -Sum).Sum
$lastRenderer = ($last.processes | Where-Object role -eq 'renderer' | Measure-Object privateMb -Sum).Sum
$elapsedMinutes = (($Samples - 1) * $IntervalMilliseconds) / 60000
$rendererGrowthMbPerMinute = if ($elapsedMinutes -gt 0) { [math]::Round(($lastRenderer - $firstRenderer) / $elapsedMinutes, 1) } else { 0 }
$result = [pscustomobject]@{
  verdict = if ($maximumPrivateMb -gt $TotalPrivateLimitMb -or $rendererGrowthMbPerMinute -gt $RendererGrowthLimitMbPerMinute) { 'fail' } else { 'pass' }
  rootPid = $last.rootPid
  samples = $Samples
  maximumPrivateMb = $maximumPrivateMb
  latestPrivateMb = $last.privateMb
  latestWorkingSetMb = $last.workingSetMb
  rendererGrowthMbPerMinute = $rendererGrowthMbPerMinute
  totalPrivateLimitMb = $TotalPrivateLimitMb
  rendererGrowthLimitMbPerMinute = $RendererGrowthLimitMbPerMinute
  latestProcesses = @($last.processes | Sort-Object privateMb -Descending)
}
$result | ConvertTo-Json -Depth 5
if ($result.verdict -eq 'fail') {
  throw "Switchboard resource gate failed: max private $maximumPrivateMb MB; renderer growth $rendererGrowthMbPerMinute MB/min."
}
