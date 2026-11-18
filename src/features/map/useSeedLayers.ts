// What a seed adds to the world map, shared by the World Map and the Run page's map: the seed's cave layouts and
// the colours their material files use. Kept per seed for the session, so moving between pages doesn't regenerate.
import { useEffect, useState } from 'react';
import { fetchJson } from '@/data/store';
import type { AreaLayout } from '@/seed/layout';
import { seedLayouts } from '@/seed/client';

let wang: Promise<Record<string, string>> | null = null;
const layoutsBySeed = new Map<number, Promise<AreaLayout[]>>();
/** Generating a seed's caves takes a moment and memory: keep the last few. */
const KEEP = 3;

function layoutsOf(seed: number) {
  let p = layoutsBySeed.get(seed);
  if (!p) {
    p = seedLayouts(seed);
    p.catch(() => layoutsBySeed.delete(seed));
    layoutsBySeed.set(seed, p);
    while (layoutsBySeed.size > KEEP) layoutsBySeed.delete(layoutsBySeed.keys().next().value!);
  }
  return p;
}

export type SeedLayers = { layouts: AreaLayout[] | null; wangColors: Record<string, string> | null };

export function useSeedLayers(seed: number | null): SeedLayers {
  const [wangColors, setWangColors] = useState<Record<string, string> | null>(null);
  const [layouts, setLayouts] = useState<{ seed: number; l: AreaLayout[] } | null>(null);
  useEffect(() => {
    let live = true;
    (wang ??= fetchJson<Record<string, string>>('data/wang_colors.json')).then(
      (w) => live && setWangColors(w),
      () => {
        wang = null;
      },
    );
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (seed === null) return;
    let live = true;
    layoutsOf(seed).then(
      (l) => live && setLayouts({ seed, l }),
      () => live && setLayouts(null),
    );
    return () => {
      live = false;
    };
  }, [seed]);
  return { layouts: layouts && layouts.seed === seed ? layouts.l : null, wangColors };
}
