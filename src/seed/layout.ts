// The seed's cave layouts for the world map: every patch of a cave biome, generated as the game does (wang.ts).
import type { WorldMap } from '@/data/types';
import { generateArea, widthFromPix, type Tileset, type WangArea } from './wang';

/** Biomes generated with the Mines' fixed entrance (noita-tools: the engine special-cases these). */
const COAL_MINE = new Set(['coalmine', 'solid_wall_tower_1']);
/** Biomes whose marked rooms are walled off while checking for a way down. */
const BLOCK_OUT_ROOMS = new Set(['coalmine', 'excavationsite', 'solid_wall_tower_1', 'solid_wall_tower_2']);

export type AreaLayout = { area: number; width: number; height: number; rgb: Uint8Array };

const hex = (s: string) => parseInt(s, 16);

export function areaParams(map: WorldMap, index: number, seed: number, overlay?: Uint8Array): WangArea & { template: string } | null {
  const a = map.areas[index]!;
  const b = map.biomes[a.biome]!;
  if (!b.wangTemplate) return null;
  const coal = COAL_MINE.has(b.id);
  return {
    template: b.wangTemplate,
    seed: seed >>> 0,
    width: widthFromPix(a.x1, a.x2 + 1),
    height: widthFromPix(a.y1, a.y2 + 1),
    chunkX: a.x1,
    chunkY: a.y1,
    coalMine: coal,
    blockOutRooms: BLOCK_OUT_ROOMS.has(b.id),
    randomMaterials: (b.randomMaterials ?? []).map((r) => ({ from: hex(r.from), to: r.to.map(hex) })),
    ...(coal && overlay ? { overlay } : {}),
  };
}

/** Every cave area's layout for a seed (areas the generator can't make are left out). */
export function generateLayouts(map: WorldMap, seed: number, tilesets: Map<string, Tileset>, overlay?: Uint8Array): AreaLayout[] {
  const out: AreaLayout[] = [];
  for (let i = 0; i < map.areas.length; i++) {
    const p = areaParams(map, i, seed, overlay);
    const ts = p && tilesets.get(p.template);
    if (!p || !ts) continue;
    const rgb = generateArea(ts, p);
    if (rgb) out.push({ area: i, width: p.width, height: p.height, rgb });
  }
  return out;
}
