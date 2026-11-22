// What a seed adds to the world map, shared by the World Map and the Run page's map: the seed's cave layouts, the
// colours their material files use, and the points of interest (fixed ones, and the rooms the seed's biome
// scripts place). Kept per seed for the session, so moving between pages doesn't regenerate.
import { useEffect, useMemo, useState } from 'react';
import { fetchJson, useData } from '@/data/store';
import type { WorldMap } from '@/data/types';
import type { AreaLayout } from '@/seed/layout';
import type { PoiData, SeedPoi } from '@/seed/poi';
import type { SeedItem } from '@/seed/items';
import { seedItems, seedLayouts, seedPois } from '@/seed/client';
import { useProgress } from '@/store/progress';
import { fixedPois, placedPois, type MapPoi } from './pois';

let wang: Promise<Record<string, string>> | null = null;
let poiData: Promise<PoiData> | null = null;
/** Generating a seed takes a moment and memory: keep the last few. */
const KEEP = 3;
const layoutsBySeed = new Map<number, Promise<AreaLayout[]>>();
const poisBySeed = new Map<number, Promise<SeedPoi[]>>();
/** By seed and the unlocks that decide which spells wands and chests can hold. */
const itemsByKey = new Map<string, Promise<SeedItem[]>>();

function cached<K, T>(m: Map<K, Promise<T>>, seed: K, make: (s: K) => Promise<T>) {
  let p = m.get(seed);
  if (!p) {
    p = make(seed);
    p.catch(() => m.delete(seed));
    m.set(seed, p);
    while (m.size > KEEP) m.delete(m.keys().next().value!);
  }
  return p;
}

/** Once, shared: a promise that's dropped (to try again next time) if it fails. */
function once<T>(get: () => Promise<T> | null, set: (p: Promise<T> | null) => void, load: () => Promise<T>) {
  let p = get();
  if (!p) {
    p = load();
    set(p);
    p.catch(() => set(null));
  }
  return p;
}

export type SeedLayers = {
  layouts: AreaLayout[] | null;
  wangColors: Record<string, string> | null;
  /** Fixed points of interest plus this seed's; null while this seed's are being placed. */
  pois: MapPoi[] | null;
  /** The seed's items; null while they're being placed. */
  items: SeedItem[] | null;
};

export function useSeedLayers(seed: number | null, map: WorldMap | null): SeedLayers {
  const [wangColors, setWangColors] = useState<Record<string, string> | null>(null);
  const [data, setData] = useState<PoiData | null>(null);
  const [layouts, setLayouts] = useState<{ seed: number; l: AreaLayout[] } | null>(null);
  const [placed, setPlaced] = useState<{ seed: number; p: SeedPoi[] } | null>(null);
  const [items, setItems] = useState<{ key: string; i: SeedItem[] } | null>(null);
  // With a synced save, its unlocks decide which spells can turn up; without one, everything counts as unlocked.
  const { spells } = useData();
  const progressFlags = useProgress((s) => s.progress?.flags);
  const unlocks = useMemo(() => {
    if (!progressFlags) return null;
    const needed = new Set(spells.flatMap((s) => (s.requiresFlag ? [s.requiresFlag] : [])));
    return progressFlags.filter((f) => needed.has(f)).sort();
  }, [progressFlags, spells]);
  const itemKey = seed === null ? null : `${seed}|${unlocks ? unlocks.join(',') : 'all'}`;
  useEffect(() => {
    let live = true;
    once(() => wang, (p) => (wang = p), () => fetchJson<Record<string, string>>('data/wang_colors.json')).then((w) => live && setWangColors(w), () => {});
    once(() => poiData, (p) => (poiData = p), () => fetchJson<PoiData>('data/pois.json')).then((d) => live && setData(d), () => {});
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (seed === null) return;
    let live = true;
    cached(layoutsBySeed, seed, seedLayouts).then(
      (l) => live && setLayouts({ seed, l }),
      () => live && setLayouts(null),
    );
    // After the layouts: placing the rooms generates them again in the worker, so the caves draw first.
    cached(poisBySeed, seed, seedPois).then(
      (p) => live && setPlaced({ seed, p }),
      () => live && setPlaced({ seed, p: [] }),
    );
    return () => {
      live = false;
    };
  }, [seed]);
  useEffect(() => {
    if (seed === null || itemKey === null) return;
    let live = true;
    // Queued after the points of interest (the worker takes requests in order): pins first, items next.
    cached(itemsByKey, itemKey, () => seedItems({ seed, allUnlocked: !unlocks, flags: unlocks ?? [] })).then(
      (i) => live && setItems({ key: itemKey, i }),
      () => live && setItems({ key: itemKey, i: [] }),
    );
    return () => {
      live = false;
    };
    // unlocks is part of itemKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemKey]);
  const fixed = useMemo(() => (map && data ? fixedPois(map, data) : []), [map, data]);
  const mine = placed && placed.seed === seed ? placed.p : null;
  const pois = useMemo(() => (data && mine && map ? [...fixed, ...placedPois(data, mine, map)] : null), [fixed, data, mine, map]);
  return { layouts: layouts && layouts.seed === seed ? layouts.l : null, wangColors, pois, items: items && items.key === itemKey ? items.i : null };
}
