import type { Clip } from './contracts';

export function unreviewedClips(clips: readonly Clip[], reviewedThrough: number): Clip[] {
  return clips
    .filter((clip) => clip.createdAt > reviewedThrough)
    .toSorted((left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id));
}

export function latestClipCreatedAt(clips: readonly Pick<Clip, 'createdAt'>[]): number {
  return clips.reduce((latest, clip) => Math.max(latest, clip.createdAt), 0);
}
