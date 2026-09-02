export function estimateWindowedGrowth(samples, valueKey) {
  if (samples.length < 2) throw new Error('At least two samples are required to estimate growth.');
  const windowSize = Math.max(2, Math.floor(samples.length / 3));
  const firstWindow = samples.slice(0, windowSize);
  const lastWindow = samples.slice(-windowSize);
  const firstWindowMedian = percentile(firstWindow.map((sample) => sample[valueKey]), 0.5);
  const lastWindowMedian = percentile(lastWindow.map((sample) => sample[valueKey]), 0.5);
  const firstWindowTime = percentile(firstWindow.map((sample) => sample.sampledAt), 0.5);
  const lastWindowTime = percentile(lastWindow.map((sample) => sample.sampledAt), 0.5);
  const elapsedMinutes = Math.max(1 / 60, (lastWindowTime - firstWindowTime) / 60_000);
  return {
    firstWindowMedian,
    lastWindowMedian,
    perMinute: (lastWindowMedian - firstWindowMedian) / elapsedMinutes,
  };
}

export function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}
