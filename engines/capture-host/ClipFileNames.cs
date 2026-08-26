using System.Globalization;
using System.Text;

namespace Switchboard.CaptureHost;

internal static class ClipFileNames
{
    private static readonly HashSet<string> Reserved = new(StringComparer.OrdinalIgnoreCase)
    {
        "CON", "PRN", "AUX", "NUL",
        "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
        "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    };

    public static string Sanitize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "Desktop";
        var invalid = Path.GetInvalidFileNameChars().ToHashSet();
        var builder = new StringBuilder(Math.Min(value.Length, 80));
        foreach (var character in value.Normalize(NormalizationForm.FormKC))
        {
            if (character < 32 || invalid.Contains(character)) continue;
            if (char.IsWhiteSpace(character)) continue;
            builder.Append(character);
            if (builder.Length >= 80) break;
        }

        var result = builder.ToString().TrimEnd('.', ' ');
        if (result.Length == 0 || Reserved.Contains(result)) return "Capture";
        return result;
    }

    public static string CreateUniquePath(string directory, string? sourceName, DateTimeOffset createdAt)
    {
        var stem = $"{Sanitize(sourceName)}_{createdAt.ToString("yyyy-MM-dd_HH-mm-ss", CultureInfo.InvariantCulture)}";
        var candidate = Path.Combine(directory, $"{stem}.mp4");
        for (var suffix = 2; File.Exists(candidate) || File.Exists($"{candidate}.clip-writing"); suffix++)
        {
            candidate = Path.Combine(directory, $"{stem}_{suffix}.mp4");
        }
        return candidate;
    }
}
