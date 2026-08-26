import type { EqBand } from '../../../shared/contracts';

const SAMPLE_RATE = 48_000;

type Biquad = {
  b0: number;
  b1: number;
  b2: number;
  a0: number;
  a1: number;
  a2: number;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function coefficients(band: EqBand): Biquad {
  const frequency = clamp(band.frequency, 20, SAMPLE_RATE / 2 - 1);
  const omega = (2 * Math.PI * frequency) / SAMPLE_RATE;
  const cosine = Math.cos(omega);
  const sine = Math.sin(omega);
  const amplitude = 10 ** (band.gainDb / 40);
  const alphaQ = sine / (2 * Math.max(0.2, band.q));

  if (band.type === 'bell') {
    return {
      b0: 1 + alphaQ * amplitude,
      b1: -2 * cosine,
      b2: 1 - alphaQ * amplitude,
      a0: 1 + alphaQ / amplitude,
      a1: -2 * cosine,
      a2: 1 - alphaQ / amplitude,
    };
  }

  const alpha = alphaQ;
  const beta = 2 * Math.sqrt(amplitude) * alpha;

  if (band.type === 'low-shelf') {
    return {
      b0: amplitude * ((amplitude + 1) - (amplitude - 1) * cosine + beta),
      b1: 2 * amplitude * ((amplitude - 1) - (amplitude + 1) * cosine),
      b2: amplitude * ((amplitude + 1) - (amplitude - 1) * cosine - beta),
      a0: (amplitude + 1) + (amplitude - 1) * cosine + beta,
      a1: -2 * ((amplitude - 1) + (amplitude + 1) * cosine),
      a2: (amplitude + 1) + (amplitude - 1) * cosine - beta,
    };
  }

  return {
    b0: amplitude * ((amplitude + 1) + (amplitude - 1) * cosine + beta),
    b1: -2 * amplitude * ((amplitude - 1) + (amplitude + 1) * cosine),
    b2: amplitude * ((amplitude + 1) + (amplitude - 1) * cosine - beta),
    a0: (amplitude + 1) - (amplitude - 1) * cosine + beta,
    a1: 2 * ((amplitude - 1) - (amplitude + 1) * cosine),
    a2: (amplitude + 1) - (amplitude - 1) * cosine - beta,
  };
}

function magnitudeAt(frequency: number, biquad: Biquad): number {
  const omega = (2 * Math.PI * frequency) / SAMPLE_RATE;
  const cosine = Math.cos(omega);
  const sine = Math.sin(omega);
  const cosine2 = Math.cos(2 * omega);
  const sine2 = Math.sin(2 * omega);
  const numeratorReal = biquad.b0 + biquad.b1 * cosine + biquad.b2 * cosine2;
  const numeratorImaginary = -biquad.b1 * sine - biquad.b2 * sine2;
  const denominatorReal = biquad.a0 + biquad.a1 * cosine + biquad.a2 * cosine2;
  const denominatorImaginary = -biquad.a1 * sine - biquad.a2 * sine2;
  const numerator = numeratorReal ** 2 + numeratorImaginary ** 2;
  const denominator = denominatorReal ** 2 + denominatorImaginary ** 2;
  return Math.sqrt(numerator / Math.max(Number.EPSILON, denominator));
}

export function equalizerResponseDb(frequency: number, bands: EqBand[]): number {
  let response = 0;
  for (const band of bands) {
    if (!band.enabled || Math.abs(band.gainDb) < 0.0001) continue;
    response += 20 * Math.log10(Math.max(Number.EPSILON, magnitudeAt(frequency, coefficients(band))));
  }
  return clamp(response, -12, 12);
}
