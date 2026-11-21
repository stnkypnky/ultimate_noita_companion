import { useEffect, useState, useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = matchMedia(query);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}

/** Laptop/desktop layout breakpoint (matches Tailwind `lg`). */
export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');
/** Tablet and up (Tailwind `md`). */
export const useIsTablet = () => useMediaQuery('(min-width: 768px)');
/** Wide screens (Tailwind `2xl`). */
export const useIsWide = () => useMediaQuery('(min-width: 1536px)');

/**
 * A landscape tablet (or a short laptop screen): wide but not tall, so a page that scrolls on and on is a poor
 * fit and a dashboard should fit the screen instead. A landscape phone is too short for that and keeps its tabs.
 */
export const useIsShortLandscape = () =>
  useMediaQuery('(orientation: landscape) and (min-width: 768px) and (min-height: 501px) and (max-height: 820px)');

/** The width of an element, kept up to date as it resizes. Attach the returned ref callback to it. */
export function useElementWidth(): [(el: HTMLElement | null) => void, number] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, width];
}

export function useDebounced<T>(value: T, ms = 120): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Global keyboard shortcut ("/" to focus search, etc.). Ignored while typing in a field unless `allowInInputs`. */
export function useHotkey(key: string, fn: (e: KeyboardEvent) => void, allowInInputs = false) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (typing && !allowInInputs) return;
      if (e.key === key) fn(e);
    };
    addEventListener('keydown', h);
    return () => removeEventListener('keydown', h);
  }, [key, fn, allowInInputs]);
}
