[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$PackageDirectory,
    [switch]$AllowTestSigned
)

$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Driver installation requires an elevated PowerShell session.'
}

$resolvedPackage = (Resolve-Path -LiteralPath $PackageDirectory).Path
$inf = Get-ChildItem -LiteralPath $resolvedPackage -Filter '*.inf' | Select-Object -First 1
$sys = Get-ChildItem -LiteralPath $resolvedPackage -Filter '*.sys' | Select-Object -First 1
$catalog = Get-ChildItem -LiteralPath $resolvedPackage -Filter '*.cat' | Select-Object -First 1
if ($null -eq $inf -or $null -eq $sys -or $null -eq $catalog) {
    throw 'The package must contain an INF, SYS, and catalog file.'
}

$signature = Get-AuthenticodeSignature -LiteralPath $catalog.FullName
if ($signature.Status -ne 'Valid' -and -not $AllowTestSigned) {
    throw "The driver catalog signature is '$($signature.Status)'. Use a production-signed package, or explicitly pass -AllowTestSigned on an isolated test-mode machine."
}

& pnputil.exe /add-driver $inf.FullName /install
if ($LASTEXITCODE -ne 0) { throw "Windows rejected the driver package with exit code $LASTEXITCODE." }

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'verify-virtual-audio-driver.ps1')
if ($LASTEXITCODE -ne 0) { throw 'The driver installed, but Switchboard endpoint verification failed.' }
