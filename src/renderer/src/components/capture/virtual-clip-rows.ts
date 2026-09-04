/** Include intersecting rows plus overscan and, independently, one retained row. */
export function visibleClipIndexes(count: number, columns: number, height: number, gap: number, top: number, viewportHeight: number, overscan: number, retainedIndex = -1): number[] {
  const rows = Math.ceil(count / columns);
  const stride = height + gap;
  const first = Math.max(0, Math.floor((top - overscan) / stride));
  const end = Math.min(rows, Math.ceil((top + viewportHeight + overscan) / stride));
  const visible = new Set<number>();
  for (let row = first; row < end; row++) visible.add(row);
  if (retainedIndex >= 0 && retainedIndex < count) visible.add(Math.floor(retainedIndex / columns));
  return [...visible].sort((a, b) => a - b).flatMap(row =>
    Array.from({ length: Math.min(columns, count - row * columns) }, (_, column) => row * columns + column));
}
