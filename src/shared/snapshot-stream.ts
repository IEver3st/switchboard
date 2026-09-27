import { z } from 'zod';
import { systemSnapshotSchema, type SystemSnapshot } from './contracts';

export const snapshotStreamChannel = 'snapshot:subscribe';
// Do not use systemSnapshotSchema.partial(): optional branches with hydration
// defaults would be inserted into every patch, resetting setup/diagnostics.
const changesSchema = z.record(z.string(), z.unknown()).transform((raw, context) => {
  const changes: Partial<SystemSnapshot> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!Object.hasOwn(systemSnapshotSchema.shape, key)) {
      context.addIssue({ code: 'custom', path: [key], message: 'Unknown snapshot branch' });
      continue;
    }
    const parsed = systemSnapshotSchema.shape[key as keyof SystemSnapshot].safeParse(value);
    if (!parsed.success) context.addIssue({ code: 'custom', path: [key], message: 'Invalid snapshot branch' });
    else Object.assign(changes, { [key]: parsed.data });
  }
  return changes;
});
const frameSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('full'), revision: z.number().int().nonnegative(), snapshot: systemSnapshotSchema }),
  z.object({ type: z.literal('patch'), revision: z.number().int().positive(), changes: changesSchema }),
]);
export type SnapshotFrame = z.infer<typeof frameSchema>;

/** One publisher per webContents lifetime; a subscription always receives a baseline. */
export class SnapshotPublisher {
  private previous: SystemSnapshot | null = null;
  private revision = 0;
  next(snapshot: SystemSnapshot, reset = false): SnapshotFrame {
    const revision = ++this.revision;
    if (!this.previous || reset) {
      this.previous = snapshot;
      return { type: 'full', revision, snapshot };
    }
    const changes: Partial<SystemSnapshot> = {};
    for (const key of Object.keys(snapshot) as Array<keyof SystemSnapshot>) {
      if (this.previous[key] !== snapshot[key]) Object.assign(changes, { [key]: snapshot[key] });
    }
    this.previous = snapshot;
    return { type: 'patch', revision, changes };
  }
}

export class SnapshotReceiver {
  private snapshot: SystemSnapshot | null = null;
  private revision = -1;
  accept(raw: unknown): SystemSnapshot | null {
    const frame = frameSchema.parse(raw);
    if (frame.type === 'full') {
      if (frame.revision < this.revision) return this.snapshot;
      this.snapshot = frame.snapshot;
    } else {
      if (!this.snapshot || frame.revision !== this.revision + 1) return null;
      this.snapshot = { ...this.snapshot, ...frame.changes };
    }
    this.revision = frame.revision;
    return this.snapshot;
  }
}
