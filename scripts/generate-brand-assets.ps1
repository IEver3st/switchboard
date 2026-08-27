param(
  [Parameter(Mandatory = $true)]
  [string]$InAppSource,

  [Parameter(Mandatory = $true)]
  [string]$NativeIconSource,

  [ValidateRange(0, 255)]
  [int]$ChromaThreshold = 32,

  [ValidateRange(0, 30)]
  [int]$NativeIconPaddingPercent = 6
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$inAppSourcePath = (Resolve-Path -LiteralPath $InAppSource).Path
$nativeIconSourcePath = (Resolve-Path -LiteralPath $NativeIconSource).Path
$ffmpeg = (Get-Command ffmpeg -ErrorAction Stop).Source

$brandingDirectory = Join-Path $projectRoot 'resources\branding'
$rendererPublicDirectory = Join-Path $projectRoot 'src\renderer\public'
$previewDirectory = Join-Path $projectRoot 'preview'
$buildDirectory = Join-Path $projectRoot 'build'

foreach ($directory in @($brandingDirectory, $rendererPublicDirectory, $previewDirectory, $buildDirectory)) {
  New-Item -ItemType Directory -Force -Path $directory | Out-Null
}

$canonicalInAppSource = Join-Path $brandingDirectory 'switchboard-mark-source.png'
$canonicalNativeIconSource = Join-Path $brandingDirectory 'switchboard-icon-source.png'
if ($inAppSourcePath -ne $canonicalInAppSource) {
  Copy-Item -LiteralPath $inAppSourcePath -Destination $canonicalInAppSource -Force
}
if ($nativeIconSourcePath -ne $canonicalNativeIconSource) {
  Copy-Item -LiteralPath $nativeIconSourcePath -Destination $canonicalNativeIconSource -Force
}

Add-Type -AssemblyName System.Drawing
$drawingProbe = [System.Drawing.Bitmap]::new(1, 1)
$drawingProbe.Dispose()
$systemDrawingAssemblies = [System.AppDomain]::CurrentDomain.GetAssemblies()
  | Where-Object {
    ($_.GetName().Name -like 'System.Drawing*' -or
      $_.GetName().Name -like 'System.Private.Windows.*' -or
      $_.GetName().Name -in @('System.Private.CoreLib', 'System.Runtime', 'System.Collections', 'System.Runtime.InteropServices'))
  }
  | Select-Object -ExpandProperty Location
Add-Type -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class ConnectedChromaKey
{
    private static void TryEnqueue(
        int x,
        int y,
        int width,
        int stride,
        byte[] bytes,
        bool[] background,
        int[] queue,
        ref int tail,
        byte threshold)
    {
        var index = (y * width) + x;
        if (background[index]) return;
        var pixel = (y * stride) + (x * 4);
        var maximum = Math.Max(bytes[pixel], Math.Max(bytes[pixel + 1], bytes[pixel + 2]));
        if (maximum > threshold) return;
        background[index] = true;
        queue[tail++] = index;
    }

    public static void RemoveEdgeConnectedBlack(string source, string destination, byte threshold)
    {
        using (var input = new Bitmap(source))
        using (var bitmap = new Bitmap(input.Width, input.Height, PixelFormat.Format32bppArgb))
        {
            using (var graphics = Graphics.FromImage(bitmap))
            {
                graphics.DrawImageUnscaled(input, 0, 0);
            }

            var rectangle = new Rectangle(0, 0, bitmap.Width, bitmap.Height);
            var data = bitmap.LockBits(rectangle, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
            try
            {
                var bytes = new byte[Math.Abs(data.Stride) * bitmap.Height];
                Marshal.Copy(data.Scan0, bytes, 0, bytes.Length);
                var background = new bool[bitmap.Width * bitmap.Height];
                var queue = new int[bitmap.Width * bitmap.Height];
                var head = 0;
                var tail = 0;

                for (var x = 0; x < bitmap.Width; x++)
                {
                    TryEnqueue(x, 0, bitmap.Width, data.Stride, bytes, background, queue, ref tail, threshold);
                    TryEnqueue(x, bitmap.Height - 1, bitmap.Width, data.Stride, bytes, background, queue, ref tail, threshold);
                }
                for (var y = 1; y < bitmap.Height - 1; y++)
                {
                    TryEnqueue(0, y, bitmap.Width, data.Stride, bytes, background, queue, ref tail, threshold);
                    TryEnqueue(bitmap.Width - 1, y, bitmap.Width, data.Stride, bytes, background, queue, ref tail, threshold);
                }

                while (head < tail)
                {
                    var index = queue[head++];
                    var x = index % bitmap.Width;
                    var y = index / bitmap.Width;
                    if (x > 0) TryEnqueue(x - 1, y, bitmap.Width, data.Stride, bytes, background, queue, ref tail, threshold);
                    if (x + 1 < bitmap.Width) TryEnqueue(x + 1, y, bitmap.Width, data.Stride, bytes, background, queue, ref tail, threshold);
                    if (y > 0) TryEnqueue(x, y - 1, bitmap.Width, data.Stride, bytes, background, queue, ref tail, threshold);
                    if (y + 1 < bitmap.Height) TryEnqueue(x, y + 1, bitmap.Width, data.Stride, bytes, background, queue, ref tail, threshold);
                }

                for (var y = 0; y < bitmap.Height; y++)
                {
                    for (var x = 0; x < bitmap.Width; x++)
                    {
                        var index = (y * bitmap.Width) + x;
                        var pixel = (y * data.Stride) + (x * 4);
                        if (background[index])
                        {
                            bytes[pixel + 3] = 0;
                            continue;
                        }

                        var touchesBackground = (x > 0 && background[index - 1])
                            || (x + 1 < bitmap.Width && background[index + 1])
                            || (y > 0 && background[index - bitmap.Width])
                            || (y + 1 < bitmap.Height && background[index + bitmap.Width]);
                        if (!touchesBackground) continue;

                        var maximum = Math.Max(bytes[pixel], Math.Max(bytes[pixel + 1], bytes[pixel + 2]));
                        var feather = Math.Max(0, Math.Min(255, ((maximum - threshold) * 255) / Math.Max(1, 80 - threshold)));
                        bytes[pixel + 3] = (byte)feather;
                    }
                }

                Marshal.Copy(bytes, 0, data.Scan0, bytes.Length);
            }
            finally
            {
                bitmap.UnlockBits(data);
            }

            bitmap.Save(destination, ImageFormat.Png);
        }
    }

    public static int[] GetAlphaBounds(string source, byte threshold)
    {
        using (var bitmap = new Bitmap(source))
        {
            var rectangle = new Rectangle(0, 0, bitmap.Width, bitmap.Height);
            var data = bitmap.LockBits(rectangle, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            try
            {
                var bytes = new byte[Math.Abs(data.Stride) * bitmap.Height];
                Marshal.Copy(data.Scan0, bytes, 0, bytes.Length);
                var left = bitmap.Width;
                var top = bitmap.Height;
                var right = -1;
                var bottom = -1;
                for (var y = 0; y < bitmap.Height; y++)
                {
                    for (var x = 0; x < bitmap.Width; x++)
                    {
                        if (bytes[(y * data.Stride) + (x * 4) + 3] <= threshold) continue;
                        if (x < left) left = x;
                        if (x > right) right = x;
                        if (y < top) top = y;
                        if (y > bottom) bottom = y;
                    }
                }
                if (right < left || bottom < top) throw new InvalidOperationException("The keyed icon has no opaque pixels.");
                return new[] { left, top, right, bottom, bitmap.Width, bitmap.Height };
            }
            finally
            {
                bitmap.UnlockBits(data);
            }
        }
    }
}
'@ -ReferencedAssemblies $systemDrawingAssemblies

function Invoke-FfmpegImage {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Source,
    [Parameter(Mandatory = $true)]
    [string]$Filter,
    [Parameter(Mandatory = $true)]
    [string]$Destination
  )

  & $ffmpeg -hide_banner -loglevel error -y -i $Source -vf $Filter -frames:v 1 $Destination
  if ($LASTEXITCODE -ne 0) {
    throw "ffmpeg failed while generating '$Destination'."
  }
}

$runtimeMark = Join-Path $brandingDirectory 'switchboard-mark.png'
Invoke-FfmpegImage -Source $canonicalInAppSource -Filter 'scale=-2:512:flags=lanczos' -Destination $runtimeMark
Copy-Item -LiteralPath $runtimeMark -Destination (Join-Path $rendererPublicDirectory 'switchboard-mark.png') -Force
Copy-Item -LiteralPath $runtimeMark -Destination (Join-Path $previewDirectory 'switchboard-mark.png') -Force

$temporaryDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("switchboard-icons-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporaryDirectory | Out-Null

try {
  $keyedNativeIcon = Join-Path $temporaryDirectory 'switchboard-icon-keyed.png'
  [ConnectedChromaKey]::RemoveEdgeConnectedBlack($canonicalNativeIconSource, $keyedNativeIcon, [byte]$ChromaThreshold)

  $bounds = [ConnectedChromaKey]::GetAlphaBounds($keyedNativeIcon, [byte]4)
  $contentSize = [Math]::Max($bounds[2] - $bounds[0] + 1, $bounds[3] - $bounds[1] + 1)
  $cropSize = [Math]::Min([Math]::Min($bounds[4], $bounds[5]), [Math]::Ceiling($contentSize * (1 + ($NativeIconPaddingPercent / 100))))
  $contentCenterX = ($bounds[0] + $bounds[2] + 1) / 2
  $contentCenterY = ($bounds[1] + $bounds[3] + 1) / 2
  $cropX = [Math]::Max(0, [Math]::Min($bounds[4] - $cropSize, [Math]::Round($contentCenterX - ($cropSize / 2))))
  $cropY = [Math]::Max(0, [Math]::Min($bounds[5] - $cropSize, [Math]::Round($contentCenterY - ($cropSize / 2))))

  $runtimeIcon = Join-Path $brandingDirectory 'switchboard-icon.png'
  Invoke-FfmpegImage -Source $keyedNativeIcon -Filter "crop=${cropSize}:${cropSize}:${cropX}:${cropY},scale=1024:1024:flags=lanczos" -Destination $runtimeIcon
  Copy-Item -LiteralPath $runtimeIcon -Destination (Join-Path $rendererPublicDirectory 'switchboard-icon.png') -Force
  Copy-Item -LiteralPath $runtimeIcon -Destination (Join-Path $previewDirectory 'switchboard-icon.png') -Force

  $sizes = @(16, 20, 24, 32, 40, 48, 64, 128, 256)
  $images = foreach ($size in $sizes) {
    $path = Join-Path $temporaryDirectory "icon-${size}.png"
    Invoke-FfmpegImage -Source $runtimeIcon -Filter "scale=${size}:${size}:flags=lanczos" -Destination $path
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
    $windowsIcon = Join-Path $buildDirectory 'icon.ico'
    [System.IO.File]::WriteAllBytes($windowsIcon, $stream.ToArray())
    Copy-Item -LiteralPath $windowsIcon -Destination (Join-Path $brandingDirectory 'switchboard-icon.ico') -Force
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

Write-Output 'Generated the in-app mark, transparent native PNG, and multi-resolution Windows icon assets.'
