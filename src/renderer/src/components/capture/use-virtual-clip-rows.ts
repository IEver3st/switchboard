import { useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type SyntheticEvent } from 'react';
import { flushSync } from 'react-dom';
import { visibleClipIndexes } from './virtual-clip-rows';

type Group = { key: string; clips: Array<{ id: string; pendingSave?: true }> };
type Geometry = { columns: number; height: number; gap: number; indexes: number[][] };
type ViewportGeometry = { tops: number[]; height: number };

function sameGeometry(previous: Geometry, next: Geometry): boolean {
  return previous.columns === next.columns && previous.height === next.height && previous.gap === next.gap
    && next.indexes.length === previous.indexes.length && next.indexes.every((items, i) =>
      items.length === previous.indexes[i]?.length && items.every((item, j) => item === previous.indexes[i]?.[j]));
}

function focusable(item: Element): HTMLElement[] {
  return [...item.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]')]
    .filter(node => node.tabIndex >= 0 && !node.matches(':disabled') && !node.closest('[hidden], [inert]') && node.getClientRects().length > 0);
}

/** Native scroll stays with the route. Only nearby rows retain React controls.
 * Scroll reads cached layout; resize work shares one cancellable animation frame.
 * No polling or delayed scroll commit that could paint an empty virtual range.
 */
export function useVirtualClipRows(groups: Group[], layout: 'grid' | 'list', retainedClipId?: string | null) {
  const root = useRef<HTMLDivElement>(null);
  const [retained, setRetained] = useState<string | null>(retainedClipId ?? null);
  const retainedTarget = useRef(retainedClipId ?? null);
  const pendingFocus = useRef<{ id: string; last: boolean } | null>(null);
  const [geometry, setGeometry] = useState<Geometry>(() => ({
    columns: layout === 'grid' ? 3 : 1, height: layout === 'grid' ? 240 : 110, gap: layout === 'grid' ? 24 : 0,
    indexes: groups.map((group, index) => index === 0 ? group.clips.slice(0, 12).map((_, i) => i) : []),
  }));
  const currentGeometry = useRef(geometry);
  const viewportGeometry = useRef<ViewportGeometry | null>(null);
  const clipPositions = useMemo(() => {
    const positions = new Map<string, { group: number; index: number }>();
    groups.forEach((group, groupIndex) => group.clips.forEach((clip, index) => positions.set(clip.id, { group: groupIndex, index })));
    return positions;
  }, [groups]);

  const commit = useCallback((next: Geometry, synchronous = false) => {
    // Bail out before scheduling React work, including the measurement after a commit.
    if (sameGeometry(currentGeometry.current, next)) return;
    currentGeometry.current = next;
    if (synchronous) flushSync(() => setGeometry(next));
    else setGeometry(next);
  }, []);

  const indexesForViewport = useCallback((tracks: Geometry, viewport: ViewportGeometry, scrollTop: number) => {
    const position = clipPositions.get(retainedClipId ?? retainedTarget.current ?? '');
    return groups.map((group, index) => visibleClipIndexes(group.clips.length, tracks.columns, tracks.height, tracks.gap,
      scrollTop - viewport.tops[index]!, viewport.height, Math.max(600, viewport.height), position?.group === index ? position.index : -1));
  }, [groups, clipPositions, retainedClipId]);

  const measure = useCallback(() => {
    const element = root.current;
    const viewport = element?.closest<HTMLElement>('[data-radix-scroll-area-viewport]');
    // Hidden routes must retain their last valid tracks until they have layout again.
    if (!element || !viewport || !viewport.clientHeight || !element.getBoundingClientRect().width) return;
    const lists = [...element.querySelectorAll<HTMLElement>('[data-virtual-clip-group]')];
    if (lists.length !== groups.length || !lists.length) return;
    const style = getComputedStyle(lists[0]!);
    const columns = layout === 'grid' ? Number(style.getPropertyValue('--capture-virtual-columns')) || 3 : 1;
    const gap = parseFloat(style.rowGap) || 0;
    let height = currentGeometry.current.height;
    const card = element.querySelector<HTMLElement>('.capture-clip-card');
    const listItem = element.querySelector<HTMLElement>('.capture-clip-list__item');
    if (layout === 'grid' && card) height = card.getBoundingClientRect().height;
    if (layout === 'list' && listItem) {
      const itemStyle = getComputedStyle(listItem);
      const content = Math.max(...[...listItem.children].map(child => child.getBoundingClientRect().height));
      height = Math.max(parseFloat(itemStyle.minHeight) || 0, content + parseFloat(itemStyle.paddingTop) + parseFloat(itemStyle.paddingBottom) + 1);
    }
    height = Math.max(1, Math.ceil(height * 100) / 100);
    const viewportTop = viewport.getBoundingClientRect().top;
    const measured = {
      tops: lists.map(list => list.getBoundingClientRect().top - viewportTop + viewport.scrollTop),
      height: viewport.clientHeight,
    };
    viewportGeometry.current = measured;
    const tracks = { columns, height, gap, indexes: [] };
    commit({ ...tracks, indexes: indexesForViewport(tracks, measured, viewport.scrollTop) });
  }, [groups, layout, commit, indexesForViewport]);

  useLayoutEffect(() => {
    if (retainedClipId) {
      retainedTarget.current = retainedClipId;
      setRetained(retainedClipId);
    }
  }, [retainedClipId]);

  // Track heights after applying measured tracks as later groups move with them.
  useLayoutEffect(measure, [measure, geometry.columns, geometry.height, geometry.gap, retained]);
  useLayoutEffect(() => {
    const element = root.current;
    const viewport = element?.closest<HTMLElement>('[data-radix-scroll-area-viewport]');
    if (!element || !viewport) return;
    let frame = 0;
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; measure(); });
    };
    const onScroll = () => {
      const measured = viewportGeometry.current;
      if (!measured) return;
      const tracks = currentGeometry.current;
      // Scroll is already coalesced by Chromium. Commit before its next paint, even
      // for scrollbar/Home/End jumps beyond the buffer. No DOM measurements here.
      commit({ ...tracks, indexes: indexesForViewport(tracks, measured, viewport.scrollTop) }, true);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    observer.observe(viewport);
    // The header/draft strip can move the library without resizing the library itself.
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild);
    viewport.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      observer.disconnect();
      viewport.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [measure, commit, indexesForViewport]);

  useLayoutEffect(() => {
    const request = pendingFocus.current;
    if (!request || !root.current) return;
    const item = root.current.querySelector(`[data-library-clip-id="${CSS.escape(request.id)}"]`);
    if (!item) return;
    const controls = focusable(item);
    const target = request.last ? controls.at(-1) : controls[0];
    if (target) {
      pendingFocus.current = null;
      target.focus({ preventScroll: true });
      const viewport = root.current.closest<HTMLElement>('[data-radix-scroll-area-viewport]');
      if (viewport) {
        const bounds = viewport.getBoundingClientRect();
        const header = viewport.querySelector('.capture-command-header')?.getBoundingClientRect();
        const visibleTop = Math.max(bounds.top, header?.bottom ?? bounds.top) + 8;
        const control = target.getBoundingClientRect();
        // The sticky capture header occludes the top of the native viewport.
        if (control.top < visibleTop) viewport.scrollTop += control.top - visibleTop;
        else if (control.bottom > bounds.bottom - 8) viewport.scrollTop += control.bottom - bounds.bottom + 8;
      }
    }
  }, [geometry, retained]);

  const retainTarget = (event: SyntheticEvent) => {
    const item = (event.target as Element).closest<HTMLElement>('[data-library-clip-id]');
    if (item && root.current?.contains(item)) {
      // A native scroll can arrive before React commits the focus/pointer event.
      retainedTarget.current = item.dataset.libraryClipId!;
      setRetained(retainedTarget.current);
    }
  };
  const onKeyDownCapture = (event: KeyboardEvent) => {
    if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
    const item = (event.target as Element).closest<HTMLElement>('[data-library-clip-id]');
    // Portalled menus manage their own focus; retain their trigger row instead.
    if (!item || !root.current?.contains(item)) return;
    const controls = focusable(item);
    if (event.target !== (event.shiftKey ? controls[0] : controls.at(-1))) return;
    const clips = groups.flatMap(group => group.clips).filter(clip => !clip.pendingSave);
    const index = clips.findIndex(clip => clip.id === item.dataset.libraryClipId);
    const next = clips[index + (event.shiftKey ? -1 : 1)];
    if (!next) return;
    event.preventDefault();
    pendingFocus.current = { id: next.id, last: event.shiftKey };
    retainedTarget.current = next.id;
    setRetained(next.id);
  };

  // Memoized cards must receive the same style object when only the range changes.
  const itemStyles = useMemo(() => new Map<number, CSSProperties>(), [geometry.columns]);
  const itemStyle = (index: number): CSSProperties => {
    let style = itemStyles.get(index);
    if (!style) {
      style = { gridRow: Math.floor(index / geometry.columns) + 1, gridColumn: index % geometry.columns + 1 };
      itemStyles.set(index, style);
    }
    return style;
  };

  return {
    rootProps: { ref: root, onFocusCapture: retainTarget, onPointerDownCapture: retainTarget, onContextMenuCapture: retainTarget, onKeyDownCapture },
    indexes: (groupIndex: number) => geometry.indexes[groupIndex] ?? [],
    listStyle: (count: number): CSSProperties => ({ gridTemplateRows: `repeat(${Math.ceil(count / geometry.columns)}, ${geometry.height}px)` }),
    itemStyle,
  };
}
