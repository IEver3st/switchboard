[CmdletBinding()]
param(
    [ValidateSet('Debug', 'Release')]
    [string]$Configuration = 'Release'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$buildRoot = Join-Path $repoRoot '.switchboard\build'
$sourceRoot = Join-Path $buildRoot 'virtual-audio-source'
$patchPath = Join-Path $repoRoot 'drivers\virtual-audio\patches\simpleaudiosample-switchboard.patch'
$sampleCommit = '717778a20ba4dd2440fe609f69153a1f8a64f597'
$sampleRemote = 'https://github.com/microsoft/Windows-driver-samples.git'
$solutionPath = Join-Path $sourceRoot 'audio\simpleaudiosample\SimpleAudioSample.sln'
$nugetPath = Join-Path $buildRoot 'nuget.exe'

function Test-PatchApplication {
    param([switch]$Reverse)
    $arguments = @('-C', $sourceRoot, 'apply')
    if ($Reverse) { $arguments += '--reverse' }
    $arguments += @('--check', $patchPath)
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & git @arguments 2>$null
        return $LASTEXITCODE -eq 0
    } finally {
        $ErrorActionPreference = $previousPreference
    }
}

New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null

if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot '.git'))) {
    & git clone --filter=blob:none --no-checkout $sampleRemote $sourceRoot
    if ($LASTEXITCODE -ne 0) { throw 'Unable to clone Microsoft Windows-driver-samples.' }
    & git -C $sourceRoot sparse-checkout init --cone
    & git -C $sourceRoot sparse-checkout set audio/simpleaudiosample
    & git -C $sourceRoot checkout --detach $sampleCommit
    if ($LASTEXITCODE -ne 0) { throw "Unable to check out Windows-driver-samples commit $sampleCommit." }
}

$currentCommit = (& git -C $sourceRoot rev-parse HEAD).Trim()
if ($currentCommit -ne $sampleCommit) {
    throw "The cached driver source is at $currentCommit, expected $sampleCommit. Remove '$sourceRoot' and retry."
}

if (-not (Test-PatchApplication -Reverse)) {
    if (-not (Test-PatchApplication)) { throw 'The Switchboard driver patch does not apply cleanly to the pinned Microsoft sample.' }
    & git -C $sourceRoot apply $patchPath
    if ($LASTEXITCODE -ne 0) { throw 'Unable to apply the Switchboard virtual-audio patch.' }
}

if (-not (Test-Path -LiteralPath $nugetPath)) {
    Invoke-WebRequest -Uri 'https://dist.nuget.org/win-x86-commandline/latest/nuget.exe' -OutFile $nugetPath
}
& $nugetPath restore (Join-Path $sourceRoot 'packages.config') -PackagesDirectory (Join-Path $sourceRoot 'packages') -NonInteractive
if ($LASTEXITCODE -ne 0) { throw 'Unable to restore the pinned Windows SDK and WDK packages.' }

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere)) { throw 'Visual Studio 2022 with Desktop development with C++ is required.' }
$vsInstall = (& $vswhere -latest -products * -requires Microsoft.Component.MSBuild -property installationPath).Trim()
if (-not $vsInstall) { throw 'Visual Studio 2022 MSBuild was not found.' }
$msbuild = Join-Path $vsInstall 'MSBuild\Current\Bin\MSBuild.exe'
$toolset = Join-Path $vsInstall 'MSBuild\Microsoft\VC\v170\Platforms\x64\PlatformToolsets\WindowsKernelModeDriver10.0'
if (-not (Test-Path -LiteralPath $toolset)) {
    throw 'The Windows Driver Kit Visual Studio component is not installed. Install the Windows 11 24H2 WDK, then rerun this command.'
}

& $msbuild $solutionPath /m /p:Configuration=$Configuration /p:Platform=x64 /v:minimal
if ($LASTEXITCODE -ne 0) { throw "Switchboard virtual-audio driver build failed with exit code $LASTEXITCODE." }

$packageDirectory = Join-Path $sourceRoot "audio\simpleaudiosample\x64\$Configuration\package"
Write-Host "Switchboard virtual-audio driver built at $packageDirectory"
Write-Host 'Installation still requires an elevated session and a Windows-accepted driver signature.'
