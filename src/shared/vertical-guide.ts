import type { SetupPreferences } from './contracts';

export type VerticalGuidePreferences = SetupPreferences['verticalGuide'];
export const verticalGuideColors = { white: '#ffffff', violet: '#b9aaff', lime: '#cefa76' } as const;

/** All frame dimensions and offsets are physical pixels relative to the selected display. */
export function verticalGuideFrame(display: { width: number; height: number }, guide: VerticalGuidePreferences) {
  if (guide.frame) {
    if (guide.frame.x + guide.frame.width > display.width || guide.frame.y + guide.frame.height > display.height) {
      throw new Error(`The frame extends beyond this display (${display.width} × ${display.height} px). Reduce its size or position.`);
    }
    return { ...guide.frame };
  }
  const unit = Math.max(1, Math.floor(Math.min(display.height / 16, display.width / 9) * guide.size / 100));
  const width = unit * 9, height = unit * 16;
  return { x: Math.round((display.width - width) * guide.horizontal / 100), y: Math.round((display.height - height) * guide.vertical / 100), width, height };
}

