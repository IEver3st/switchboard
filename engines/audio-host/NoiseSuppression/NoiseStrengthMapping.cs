namespace Switchboard.AudioHost.NoiseSuppression;

internal static class NoiseStrengthMapping
{
    private static readonly float[] AmountAnchors = [0f, 25f, 55f, 80f, 100f];
    private static readonly float[] AttenuationAnchorsDb = [0f, 9f, 21f, 36f, 100f];

    public static float ToAttenuationDb(float amount)
    {
        amount = Math.Clamp(amount, 0f, 100f);
        for (var index = 1; index < AmountAnchors.Length; index++)
        {
            if (amount > AmountAnchors[index]) continue;
            var lowerAmount = AmountAnchors[index - 1];
            var upperAmount = AmountAnchors[index];
            var t = (amount - lowerAmount) / (upperAmount - lowerAmount);
            // Smoothstep keeps the named strengths stable while avoiding a linear
            // percent-to-decibel control between calibration anchors.
            t = t * t * (3f - 2f * t);
            return AttenuationAnchorsDb[index - 1]
                   + (AttenuationAnchorsDb[index] - AttenuationAnchorsDb[index - 1]) * t;
        }
        return AttenuationAnchorsDb[^1];
    }

    public static float ToDryFloor(float amount)
    {
        var attenuation = ToAttenuationDb(amount);
        return attenuation >= 100f ? 0f : MathF.Pow(10f, -attenuation / 20f);
    }
}

