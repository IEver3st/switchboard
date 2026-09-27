using System.Diagnostics;
using System.Numerics;
using Switchboard.AudioHost;

// Live, read-only: samples the real headset sensor and reports rate, jitter and dominant rotation axis.
internal static class SpatialHeadsetTrace
{
    public static void Run()
    {
        using var tracker = new HeadsetHeadTracker();
        if (tracker.Error is { } error) { Console.WriteLine(error); return; }
        var rows = new List<(double T, Quaternion Q, long Stamp)>();
        var start = Stopwatch.GetTimestamp(); long lastStamp = 0;
        while (Stopwatch.GetElapsedTime(start).TotalSeconds < 10)
        {
            var pose = tracker.Latest;
            if (pose is not null && pose.Timestamp != lastStamp) { lastStamp = pose.Timestamp; rows.Add((Stopwatch.GetElapsedTime(start).TotalSeconds, pose.Rotation, pose.Timestamp)); }
            Thread.Sleep(1);
        }
        Console.WriteLine($"samples {rows.Count} ({rows.Count / 10.0:F0}/s)");
        if (rows.Count < 2) return;
        double maxStep = 0; var yaw = new List<double>(); var pitch = new List<double>(); var roll = new List<double>();
        for (var i = 0; i < rows.Count; i++)
        {
            var q = rows[i].Q;
            var forward = Vector3.Transform(Vector3.UnitZ, q); var up = Vector3.Transform(Vector3.UnitY, q);
            yaw.Add(Math.Atan2(forward.X, forward.Z) * 180 / Math.PI);
            pitch.Add(Math.Asin(Math.Clamp(forward.Y, -1, 1)) * 180 / Math.PI);
            roll.Add(Math.Atan2(-up.X, up.Y) * 180 / Math.PI);
            if (i > 0) maxStep = Math.Max(maxStep, 2 * Math.Acos(Math.Min(1, Math.Abs(Quaternion.Dot(rows[i - 1].Q, q)))) * 180 / Math.PI);
        }
        static string Range(List<double> v) => $"{v.Min(),7:F1} .. {v.Max(),6:F1} (span {v.Max() - v.Min():F1})";
        Console.WriteLine($"yaw   {Range(yaw)}\npitch {Range(pitch)}\nroll  {Range(roll)}\nlargest sample-to-sample jump {maxStep:F1} deg");
        for (var i = 0; i < rows.Count; i += Math.Max(1, rows.Count / 25))
            Console.WriteLine($"t={rows[i].T,5:F2}s yaw {yaw[i],7:F1} pitch {pitch[i],6:F1} roll {roll[i],6:F1}");
    }
}
