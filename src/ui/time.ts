import { useEffect, useState } from 'react';

const rtf = typeof Intl !== 'undefined' ? new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }) : null;

/** "just now", "2 minutes ago", "yesterday"… */
export function timeAgo(ms: number, now = Date.now()): string {
  const s = Math.round((ms - now) / 1000);
  if (Math.abs(s) < 10) return 'just now';
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 30],
    ['month', 12],
    ['year', Infinity],
  ];
  let v = s;
  for (const [unit, size] of steps) {
    if (Math.abs(v) < size) return rtf ? rtf.format(Math.round(v), unit) : `${Math.abs(Math.round(v))} ${unit}s ago`;
    v /= size;
  }
  return '';
}

/** Re-render every `ms` so relative times stay fresh. */
export function useNow(ms = 15000): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
