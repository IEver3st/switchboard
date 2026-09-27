$ErrorActionPreference = 'Stop'
$releaseVersion = '0.9.12'
$assetRoot = 'https://github.com/IEver3st/switchboard/releases/download/v0.9.12'
$outputDirectory = Join-Path $PSScriptRoot 'release-0912'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$assetNames = @('Switchboard-0.9.12-x64.exe', 'Switchboard-0.9.12-x64.exe.blockmap', 'latest.yml', 'SHA256SUMS-Windows.txt')
foreach ($name in $assetNames) {
    Invoke-WebRequest -Uri "$assetRoot/$name" -OutFile (Join-Path $outputDirectory $name) -Headers @{ 'Cache-Control' = 'no-cache' }
}
$verified = @()
foreach ($line in (Get-Content -LiteralPath (Join-Path $outputDirectory 'SHA256SUMS-Windows.txt'))) {
    if ($line.Trim() -notmatch '^([0-9a-fA-F]{64})\s+(.+)$') { throw 'Invalid checksum manifest entry.' }
    $expected = $Matches[1]
    $name = $Matches[2]
    if ($name -notin $assetNames -or $name -eq 'SHA256SUMS-Windows.txt') { throw 'Unexpected checksum target.' }
    $actual = (Get-FileHash -LiteralPath (Join-Path $outputDirectory $name) -Algorithm SHA256).Hash
    if ($actual -ne $expected) { throw "Checksum mismatch: $name" }
    $verified += $name
}
if (($verified | Select-Object -Unique).Count -ne 3) { throw 'Checksum manifest does not cover every release asset.' }
$feedUri = 'https://github.com/IEver3st/switchboard/releases/latest/download/latest.yml?verification=' + [Guid]::NewGuid().ToString('N')
$response = Invoke-WebRequest -Uri $feedUri -Headers @{ 'Cache-Control' = 'no-cache' }
$feed = if ($response.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($response.Content) } else { [string]$response.Content }
if ($feed -notmatch '(?m)^version:\s*0\.9\.12\s*$' -or -not $feed.Contains($assetNames[0])) { throw 'Latest public feed points to a different release.' }
if ($feed -notmatch '(?m)^sha512:\s*(\S+)') { throw 'Latest feed is missing its SHA512.' }
$expectedSha512 = $Matches[1]
$installer = Join-Path $outputDirectory $assetNames[0]
$actualSha512 = [Convert]::ToBase64String([Convert]::FromHexString((Get-FileHash -LiteralPath $installer -Algorithm SHA512).Hash))
if ($actualSha512 -ne $expectedSha512) { throw 'Public update feed SHA512 does not match downloaded installer.' }
$signature = Get-AuthenticodeSignature -LiteralPath $installer
$result = [pscustomobject]@{ version = $releaseVersion; publicFeedVerified = $true; sha256VerifiedAssets = $verified; installerSha512Matches = $true; installerBytes = (Get-Item -LiteralPath $installer).Length; signatureStatus = [string]$signature.Status }
$result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $outputDirectory 'verification.json') -Encoding utf8
$result | ConvertTo-Json
