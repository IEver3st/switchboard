[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $repoRoot 'drivers\virtual-audio\endpoint-manifest.json'
$projectPath = Join-Path $repoRoot 'engines\audio-host\Audio.Host.csproj'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$json = & dotnet run --project $projectPath --no-launch-profile -- --list-endpoints
if ($LASTEXITCODE -ne 0) { throw "Audio.Host endpoint discovery failed with exit code $LASTEXITCODE." }
$discovered = $json | ConvertFrom-Json
$missing = [System.Collections.Generic.List[string]]::new()

foreach ($expected in $manifest.endpoints) {
    $match = $discovered | Where-Object {
        $_.isSwitchboard -eq $true -and
        $_.flow -eq $expected.flow -and
        ($_.name -eq $expected.name -or $_.name.StartsWith("$($expected.name) ("))
    } | Select-Object -First 1
    if ($null -eq $match) { $missing.Add("$($expected.name) ($($expected.flow))") }
}

if ($missing.Count -gt 0) {
    throw "Switchboard Virtual Audio Device is incomplete. Missing: $($missing -join ', ')."
}

Write-Host "Switchboard Virtual Audio Device verified: $($manifest.endpoints.Count) endpoints at $($manifest.sampleRate) Hz."
