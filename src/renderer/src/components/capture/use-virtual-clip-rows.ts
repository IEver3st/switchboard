import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type SyntheticEvent } from 'react';
import type { Clip } from '../../../../shared/contracts';
import { visibleClipIndexes } from './virtual-clip-rows';

type Group = { key: string; clips: Clip[] };
type Geometry = { columns: number; height: number; gap: number; indexes: number[][] };
const overscan = 300;

function focusable(item: Element): HTMLElement[] {
  return [...item.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]')]
    .filter(node => node.tabIndex >= 0 && !node.matches(':disabled') && !node.closest('[hidden], [inert]') && node.getClientRects().length > 0);
}

/** Native scroll stays with the route. Only rows near it retain React controls.
 * No polling: passive scroll/resize events share one cancellable animation frame.
 */
export function useVirtualClipRows(groups: Group[], layout: 'grid' | 'list', retainedClipId?: string | null) {
  const root = useRef<HTMLDivElement>(null);
  const [retained, setRetained] = useState<string | null>(retainedClipId ?? null);
  const pendingFocus = useRef<{ id: string; last: boolean } | null>(null);
  const [geometry, setGeometry] = useState<Geometry>(() => ({
    columns: layout === 'grid' ? 3 : 1, height: layout === 'grid' ? 240 : 110, gap: layout === 'grid' ? 24 : 0,
    indexes: groups.map((group, index) => index === 0 ? group.clips.slice(0, 12).map((_, i) => i) : []),
  }));

  const measure = useCallback(() => {
    const element = root.current;
    const viewport = element?.closest<HTMLElement>('[data-radix-scroll-area-viewport]');
    if (!element || !viewport) return;
    const lists = [...element.querySelectorAll<HTMLElement>('[data-virtual-clip-group]')];
    if (!lists.length) return;
    const style = getComputedStyle(lists[0]!);
    const columns = layout === 'grid' ? Number(style.getPropertyValue('--capture-virtual-columns')) || 3 : 1;
    const gap = parseFloat(style.rowGap) || 0;
    let height = geometry.height;
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
    const keep = retainedClipId ?? retained;
    const indexes = groups.map((group, index) => visibleClipIndexes(group.clips.length, columns, height, gap,
      viewportTop - lists[index]!.getBoundingClientRect().top, viewport.clientHeight, overscan,
      keep ? group.clips.findIndex(clip => clip.id === keep) : -1));
    setGeometry(previous => previous.columns === columns && previous.height === height && previous.gap === gap
      && indexes.length === previous.indexes.length && indexes.every((items, i) => items.length === previous.indexes[i]?.length && items.every((item, j) => item === previous.indexes[i]?.[j]))
      ? previous : { columns, height, gap, indexes });
  }, [groups, layout, retained, retainedClipId, geometry.height]);

  useLayoutEffect(() => {
    if (retainedClipId) setRetained(retainedClipId);
  }, [retainedClipId]);

  // Track heights after applying measured tracks as later groups move with them.
  useLayoutEffect(measure, [measure, geometry]);
  useLayoutEffect(() => {
    const element = root.current;
    const viewport = element?.closest<HTMLElement>('[data-radix-scroll-area-viewport]');
    if (!element || !viewport) return;
    let frame = 0;
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; measure(); });
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    observer.observe(viewport);
    viewport.addEventListener('scroll', schedule, { passive: true });
    return () => {
      observer.disconnect();
      viewport.removeEventListener('scroll', schedule);
      cancelAnimationFrame(frame);
    };
  }, [measure]);

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
    if (item && root.current?.contains(item)) setRetained(item.dataset.libraryClipId!);
  };
  const onKeyDownCapture = (event: KeyboardEvent) => {
    if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
    const item = (event.target as Element).closest<HTMLElement>('[data-library-clip-id]');
    // Portalled menus manage their own focus; retain their trigger row instead.
    if (!item || !root.current?.contains(item)) return;
    const controls = focusable(item);
    if (event.target !== (event.shiftKey ? controls[0] : controls.at(-1))) return;
    const clips = groups.flatMap(group => group.clips);
    const index = clips.findIndex(clip => clip.id === item.dataset.libraryClipId);
    const next = clips[index + (event.shiftKey ? -1 : 1)];
    if (!next) return;
    event.preventDefault();
    pendingFocus.current = { id: next.id, last: event.shiftKey };
    setRetained(next.id);
  };

  return {
    rootProps: { ref: root, onFocusCapture: retainTarget, onPointerDownCapture: retainTarget, onContextMenuCapture: retainTarget, onKeyDownCapture },
    indexes: (groupIndex: number) => geometry.indexes[groupIndex] ?? [],
    listStyle: (count: number): CSSProperties => ({ gridTemplateRows: `repeat(${Math.ceil(count / geometry.columns)}, ${geometry.height}px)` }),
    itemStyle: (index: number): CSSProperties => ({ gridRow: Math.floor(index / geometry.columns) + 1, gridColumn: index % geometry.columns + 1 }),
  };
}
