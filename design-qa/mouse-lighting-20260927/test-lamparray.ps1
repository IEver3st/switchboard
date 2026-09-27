$ErrorActionPreference = 'Stop'
$resultPath = Join-Path $PSScriptRoot 'lamparray-test.json'
$wasRunning = (Get-Service -Name 'logi_lamparray_service').Status -eq 'Running'
try {
  Stop-Service -Name 'logi_lamparray_service' -ErrorAction Stop
  @{ phase = 'stopped'; time = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $resultPath
  Start-Sleep -Seconds 120
} catch {
  @{ phase = 'error'; message = $_.Exception.Message } | ConvertTo-Json | Set-Content -LiteralPath $resultPath
} finally {
  if ($wasRunning) {
    Start-Service -Name 'logi_lamparray_service'
    @{ phase = 'restored'; time = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $resultPath
  }
}
