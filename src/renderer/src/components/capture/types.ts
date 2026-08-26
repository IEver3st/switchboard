import type { Clip } from '../../../../shared/contracts';

export interface ClipActions {
  open(clip: Clip): void;
  favorite(clip: Clip, favorite: boolean): void;
  rename(clip: Clip): void;
  reveal(clip: Clip): void;
  export(clip: Clip): void;
  delete(clip: Clip): void;
}
