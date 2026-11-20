// Where a creature lives, with the map's spoiler rules: a biome you haven't reached reads "???".
import { useMemo } from 'react';
import type { Enemy } from '@/data/types';
import { biomeKey, biomeName, makeVisibility } from '@/features/map/world';
import { useWorldMap } from '@/features/live/seedCards';
import { useProgress, useSpoilers } from '@/store/progress';

export type Habitat = {
  /** Display name, shared by biome variants (Snowy Depths and its tunnel). */
  name: string;
  /** Spoiler keys of its biomes (revealing shows them all). */
  keys: string[];
  shown: boolean;
  share: number;
  count: [number, number];
};

export const rarity = (share: number) => (share >= 0.15 ? 'Common' : share >= 0.05 ? 'Uncommon' : 'Rare');

/** Turns biome ids into names and visibility; nothing is shown until the map data has loaded. */
export function useBiomeView() {
  const map = useWorldMap();
  const { mode, visible } = useSpoilers();
  const orbs = useProgress((s) => s.progress?.orbs);
  const enemies = useProgress((s) => s.progress?.enemies);
  return useMemo(() => {
    const vis = map ? makeVisibility(map, { all: mode === 'all', visible, orbs: orbs ?? [], enemies }) : null;
    const byId = new Map(map?.biomes.map((b) => [b.id, b]));
    const info = (id: string, fallback: string) => {
      const b = byId.get(id);
      const key = b ? biomeKey(b) : `map:${id}`;
      const shown = !!map && (mode === 'all' || (b ? vis!.biome(b) : visible(key)));
      const name = b ? biomeName(b) : fallback.charAt(0).toUpperCase() + fallback.slice(1);
      return { key, shown, name };
    };
    const habitats = (e: Enemy): Habitat[] => {
      const out = new Map<string, Habitat>();
      for (const s of e.spawns ?? []) {
        const i = info(s.biome, s.name);
        const h = out.get(i.name);
        if (!h) out.set(i.name, { name: i.name, keys: [i.key], shown: i.shown, share: s.share, count: [...s.count] });
        else {
          h.keys.push(i.key);
          h.shown ||= i.shown;
          h.share = Math.max(h.share, s.share);
          h.count = [Math.min(h.count[0], s.count[0]), Math.max(h.count[1], s.count[1])];
        }
      }
      return [...out.values()].sort((a, b) => b.share - a.share);
    };
    return { ready: !!map, info, habitats };
  }, [map, mode, visible, orbs, enemies]);
}
