param(
  [Parameter(Mandatory = $true)]
  [string]$Source
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = (Resolve-Path -LiteralPath $Source).Path
$ffmpeg = (Get-Command ffmpeg -ErrorAction Stop).Source

$brandingDirectory = Join-Path $projectRoot 'resources\branding'
$rendererPublicDirectory = Join-Path $projectRoot 'src\renderer\public'
$previewDirectory = Join-Path $projectRoot 'preview'
$buildDirectory = Join-Path $projectRoot 'build'

foreach ($directory in @($brandingDirectory, $rendererPublicDirectory, $buildDirectory)) {
  New-Item -ItemType Directory -Force -Path $directory | Out-Null
}

$canonicalSource = Join-Path $brandingDirectory 'switchboard-mark-source.png'
if ($sourcePath -ne $canonicalSource) {
  Copy-Item -LiteralPath $sourcePath -Destination $canonicalSource -Force
}

Add-Type -AssemblyName System.Drawing
$sourceImage = [System.Drawing.Image]::FromFile($canonicalSource)
try {
  $cropSize = [Math]::Min($sourceImage.Width, $sourceImage.Height)
  $cropX = [Math]::Floor(($sourceImage.Width - $cropSize) / 2)
  $cropY = [Math]::Floor(($sourceImage.Height - $cropSize) / 2)
} finally {
  $sourceImage.Dispose()
}

function Convert-BrandIcon {
  param(
    [Parameter(Mandatory = $true)]
    [int]$Size,
    [Parameter(Mandatory = $true)]
    [string]$Destination
  )

  $filter = "crop=${cropSize}:${cropSize}:${cropX}:${cropY},scale=${Size}:${Size}:flags=lanczos"
  & $ffmpeg -hide_banner -loglevel error -y -i $canonicalSource -vf $filter -frames:v 1 $Destination
  if ($LASTEXITCODE -ne 0) {
    throw "ffmpeg failed while generating the ${Size}px brand icon."
  }
}

$runtimeIcon = Join-Path $brandingDirectory 'switchboard-icon.png'
Convert-BrandIcon -Size 1024 -Destination $runtimeIcon
Copy-Item -LiteralPath $runtimeIcon -Destination (Join-Path $rendererPublicDirectory 'switchboard-icon.png') -Force
Copy-Item -LiteralPath $runtimeIcon -Destination (Join-Path $previewDirectory 'switchboard-icon.png') -Force

$temporaryDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("switchboard-icons-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporaryDirectory | Out-Null

try {
  $sizes = @(16, 20, 24, 32, 40, 48, 64, 128, 256)
  $images = foreach ($size in $sizes) {
    $path = Join-Path $temporaryDirectory "icon-${size}.png"
    Convert-BrandIcon -Size $size -Destination $path
    [pscustomobject]@{
      Size = $size
      Bytes = [System.IO.File]::ReadAllBytes($path)
    }
  }

  $stream = [System.IO.MemoryStream]::new()
  $writer = [System.IO.BinaryWriter]::new($stream)
  try {
    $writer.Write([uint16]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]$images.Count)

    $offset = 6 + (16 * $images.Count)
    foreach ($image in $images) {
      $dimension = if ($image.Size -eq 256) { 0 } else { $image.Size }
      $writer.Write([byte]$dimension)
      $writer.Write([byte]$dimension)
      $writer.Write([byte]0)
      $writer.Write([byte]0)
      $writer.Write([uint16]1)
      $writer.Write([uint16]32)
      $writer.Write([uint32]$image.Bytes.Length)
      $writer.Write([uint32]$offset)
      $offset += $image.Bytes.Length
    }

    foreach ($image in $images) {
      $writer.Write($image.Bytes)
    }

    $writer.Flush()
    [System.IO.File]::WriteAllBytes((Join-Path $buildDirectory 'icon.ico'), $stream.ToArray())
  } finally {
    $writer.Dispose()
    $stream.Dispose()
  }
} finally {
  $resolvedTemporaryDirectory = (Resolve-Path -LiteralPath $temporaryDirectory).Path
  $resolvedTempRoot = (Resolve-Path -LiteralPath ([System.IO.Path]::GetTempPath())).Path
  if ($resolvedTemporaryDirectory.StartsWith($resolvedTempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    Remove-Item -LiteralPath $resolvedTemporaryDirectory -Recurse -Force
  }
}

Write-Output 'Generated Switchboard PNG and multi-resolution Windows icon assets.'
