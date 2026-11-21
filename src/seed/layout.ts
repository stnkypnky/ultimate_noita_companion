// The seed's cave layouts for the world map: every patch of a cave biome, generated as the game does (wang.ts).
import type { WorldMap } from '@/data/types';
import { buildTileset, generateArea, PATH_CHECK_MAX_CHUNKS, widthFromPix, type Tileset, type WangArea } from './wang';

/** Biomes generated with the Mines' fixed entrance (noita-tools: the engine special-cases these). */
const COAL_MINE = new Set(['coalmine', 'solid_wall_tower_1']);
/** Biomes whose marked rooms are walled off while checking for a way down. */
const BLOCK_OUT_ROOMS = new Set(['coalmine', 'excavationsite', 'solid_wall_tower_1', 'solid_wall_tower_2']);

export type AreaLayout = { area: number; width: number; height: number; rgb: Uint8Array };

/**
 * A biome's layout template: wang tiles to lay out per seed, or (the sky temples' static_tile pictures, which carry no
 * tile header) a fixed picture used as it is, at the area's top-left corner.
 */
export type Template = Tileset | { picture: Uint8Array; w: number; h: number };

/** A template from its raw RGB: a tile set, or the picture itself when it isn't one. */
export const templateOf = (rgb: Uint8Array, w: number, h: number): Template => buildTileset(rgb, w, h) ?? { picture: rgb, w, h };

const hex = (s: string) => parseInt(s, 16);

export function areaParams(map: WorldMap, index: number, seed: number, overlay?: Uint8Array): WangArea & { template: string } | null {
  const a = map.areas[index]!;
  const b = map.biomes[a.biome]!;
  if (!b.wangTemplate) return null;
  const coal = COAL_MINE.has(b.id);
  // The generator works in the game's biome-map rows, not the map's (which has the world past it added on top).
  const top = map.mapTop ?? 0;
  return {
    template: b.wangTemplate,
    seed: seed >>> 0,
    width: widthFromPix(a.x1, a.x2 + 1),
    height: widthFromPix(a.y1 - top, a.y2 + 1 - top),
    chunkX: a.x1,
    chunkY: a.y1 - top,
    coalMine: coal,
    blockOutRooms: BLOCK_OUT_ROOMS.has(b.id),
    checkPath: a.y2 - a.y1 + 1 <= PATH_CHECK_MAX_CHUNKS,
    randomMaterials: (b.randomMaterials ?? []).map((r) => ({ from: hex(r.from), to: r.to.map(hex) })),
    ...(coal && overlay ? { overlay } : {}),
  };
}

/** Every cave area's layout for a seed (areas the generator can't make are left out). */
export function generateLayouts(map: WorldMap, seed: number, templates: Map<string, Template>, overlay?: Uint8Array): AreaLayout[] {
  const out: AreaLayout[] = [];
  for (let i = 0; i < map.areas.length; i++) {
    const p = areaParams(map, i, seed, overlay);
    const t = p && templates.get(p.template);
    if (!p || !t) continue;
    if ('picture' in t) {
      out.push({ area: i, width: t.w, height: t.h, rgb: t.picture.slice() });
      continue;
    }
    const rgb = generateArea(t, p);
    if (rgb) out.push({ area: i, width: p.width, height: p.height, rgb });
  }
  return out;
}
