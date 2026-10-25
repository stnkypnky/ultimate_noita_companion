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
