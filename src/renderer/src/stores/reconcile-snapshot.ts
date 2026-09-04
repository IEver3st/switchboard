import type { SystemSnapshot } from '../../../shared/contracts';

/** IPC clones every branch. Recover identity for unchanged canonical data so
 * selectors, memoized collections, and media effects can actually stay idle.
 * Neither the previous snapshot nor the received snapshot is mutated. */
export function reconcileSnapshot(previous: SystemSnapshot | null, incoming: SystemSnapshot): SystemSnapshot {
  return shareEqual(previous, incoming) as SystemSnapshot;
}

function shareEqual(previous: unknown, incoming: unknown): unknown {
  if (Object.is(previous, incoming)) return previous;
  if (!previous || !incoming || typeof previous !== 'object' || typeof incoming !== 'object') return incoming;
  if (Array.isArray(previous) !== Array.isArray(incoming)) return incoming;
  if (Array.isArray(incoming)) {
    const before = previous as unknown[];
    // Canonical collections use unique IDs. Matching by ID also preserves
    // existing clip/device objects when a new item is inserted at the front.
    const keyed = before.length > 0 && incoming.length > 0 && before.every(hasId) && incoming.every(hasId);
    const byId = keyed ? new Map(before.map(item => [(item as { id: string }).id, item])) : null;
    let equal = before.length === incoming.length;
    const next = incoming.map((item, index) => {
      const shared = shareEqual(byId && hasId(item) ? byId.get(item.id) : before[index], item);
      if (shared !== before[index]) equal = false;
      return shared;
    });
    return equal ? previous : next;
  }
  const before = previous as Record<string, unknown>;
  const after = incoming as Record<string, unknown>;
  const keys = Object.keys(after);
  let equal = Object.keys(before).length === keys.length;
  const next = { ...after };
  for (const key of keys) {
    const shared = shareEqual(before[key], after[key]);
    next[key] = shared;
    if (shared !== before[key] || !Object.hasOwn(before, key)) equal = false;
  }
  return equal ? previous : next;
}

function hasId(value: unknown): value is { id: string } {
  return Boolean(value && typeof value === 'object' && 'id' in value && typeof value.id === 'string');
}
