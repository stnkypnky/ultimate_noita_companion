// What the world map shows freely, and what stays hidden as a spoiler.
//
// Shown: the way down (Mines to the Laboratory, the Holy Mountains between) and the overworld you can see from the
// start. Everything else (side biomes, secret rooms, orb rooms, hidden messages and props) is a spoiler until it is
// revealed: one at a time, with the page's "Show spoilers" switch, or by the global "show everything" mode. Orb rooms
// also open once your synced save has that orb.
import type { MapBiome, MapScene, WorldMap } from '@/data/types';
import { fetchJson } from '@/data/store';

let mapData: Promise<WorldMap> | null = null;
/** The world map data (fetched once). */
export const loadMap = () => (mapData ??= fetchJson<WorldMap>('data/map.json'));

/** The map chunk (column, row) a world position falls in. */
export const chunkOf = (map: WorldMap, x: number, y: number) => ({ cx: Math.floor(x / map.chunk + map.w / 2), cy: Math.floor(y / map.chunk + map.offsetY) });

/** The descent: the biomes every run walks through. */
const PATH = new Set([
  'coalmine',
  'coalmine_alt',
  'excavationsite',
  'snowcave',
  'snowcave_tunnel',
  'snowcastle',
  'snowcastle_cavern',
  'rainforest',
  'rainforest_open',
  'vault',
  'crypt',
  'temple_wall',
  'temple_wall_ending',
  'temple_altar',
  'temple_altar_left',
  'temple_altar_right',
  'temple_altar_right_snowcastle',
  'solid_wall_temple',
  'boss_arena',
  'boss_arena_top',
]);

/** The overworld around the start, and the plain rock between areas. */
const SURFACE = new Set([
  'hills',
  'hills2',
  'hills_flat',
  'mountain_left_entrance',
  'mountain_left_stub',
  'mountain_right',
  'mountain_right_stub',
  'mountain_hall',
  'mountain_top',
  'mountain_tree',
  'mountain_lake',
  'mountain_floating_island',
  'empty',
  'solid_wall',
  'solid_wall_tower',
  'lake',
  'lake_deep',
  'desert',
  'winter',
  'bridge',
  'sky_light_injector',
  'water',
  'unknown',
]);

/** Names for the biomes the game leaves unnamed. */
const NAMES: Record<string, string> = {
  hills: 'Forest',
  hills2: 'Forest',
  hills_flat: 'Forest',
  empty: 'Open sky',
  solid_wall: 'Solid rock',
  solid_wall_tower: 'Solid rock',
  solid_wall_hidden_cavern: 'Hidden cavern',
  sky_light_injector: 'Open sky',
  bridge: 'Bridge',
  roadblock: 'Roadblock',
  unknown: 'Unknown',
};

/**
 * The overworld biomes are procedural (noise, not wang tiles) and the map can't lay them out; it fills them with the
 * layer you see from the surface (from each biome's own <Materials>) rather than the rock that lies deep under it.
 */
const SURFACE_LOOK: Record<string, string> = {
  desert: 'sand_surface',
  scale: 'sand_surface',
  pyramid_right: 'sandstone_surface',
  winter: 'snow_static',
  hills: 'soil',
  hills2: 'soil',
  hills_flat: 'soil',
};

/** Above the ground line (y < 0) these overworld columns are open sky; the biome map marks them all the way up. */
const SKY_ABOVE_GROUND = new Set(['hills', 'hills2', 'hills_flat', 'desert', 'winter', 'lake', 'scale']);

/** The material a chunk is filled with on the map (undefined: sky). */
export const displayMaterial = (b: MapBiome, aboveGround = false) => (aboveGround && SKY_ABOVE_GROUND.has(b.id) ? undefined : (SURFACE_LOOK[b.id] ?? b.material));

/** Pictures that are part of what's always shown, even in the overworld (the rest of the overworld's are secrets). */
const OPEN_SCENES = new Set(['tree', 'boss_arena']);

export type Area = { biome: MapBiome; cx: number; cy: number; index: number };

export const biomeKey = (b: MapBiome) => `map:${b.id}`;
export const sceneKey = (s: MapScene) => `map:scene:${s.id}`;

/** Orb room number (orbroom_07 holds orb 7). */
export const orbOf = (b: MapBiome) => (/^orbroom_(\d+)$/.exec(b.id) ? Number(/^orbroom_(\d+)$/.exec(b.id)![1]) : null);

export const isOpenBiome = (b: MapBiome) => PATH.has(b.id) || SURFACE.has(b.id);
export const onPath = (b: MapBiome) => PATH.has(b.id);

/** A biome's display name: the game's, capitalised, or ours for the unnamed ones. */
export function biomeName(b: MapBiome) {
  const n = b.name && b.name !== '_EMPTY_' && b.name !== '???' ? b.name : NAMES[b.id] ?? b.id.replace(/_/g, ' ');
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/** Whether the game names it (the rest are unnamed rooms and filler). */
export const namedInGame = (b: MapBiome) => !!b.name && b.name !== '_EMPTY_' && b.name !== '???';

export function makeVisibility(map: WorldMap, opts: { all: boolean; visible: (key: string) => boolean; orbs: number[] }) {
  const orbs = new Set(opts.orbs);
  const biome = (b: MapBiome) => opts.all || isOpenBiome(b) || opts.visible(biomeKey(b)) || (orbOf(b) !== null && orbs.has(orbOf(b)!));
  const chunkAt = (x: number, y: number) => {
    const cx = Math.floor(x / map.chunk + map.w / 2);
    const cy = Math.floor(y / map.chunk + map.offsetY);
    if (cx < 0 || cy < 0 || cx >= map.w || cy >= map.h) return null;
    return map.biomes[map.cells[cy * map.w + cx]!]!;
  };
  const scene = (s: MapScene) => {
    if (opts.all) return true;
    const home = chunkAt(s.x + s.w / 2, s.y + s.h / 2);
    if (s.from === 'biome') return !!home && biome(home);
    // Decorative borders of an area show with it; standalone props in the open world are secrets of their own.
    if (s.from === 'background_images' && !s.file.includes('/hidden/')) return !!home && biome(home);
    if (OPEN_SCENES.has(s.from) || OPEN_SCENES.has(s.id)) return true;
    if (s.file.includes('/temple/')) return true;
    return opts.visible(sceneKey(s));
  };
  return { biome, scene, chunkAt };
}

/** Holy Mountain number per row of altar chunks, top to bottom. */
export function holyMountains(map: WorldMap) {
  const rows = new Set<number>();
  map.cells.forEach((k, i) => {
    if (map.biomes[k]!.id.startsWith('temple_altar')) rows.add(Math.floor(i / map.w));
  });
  return new Map([...rows].sort((a, b) => a - b).map((r, i) => [r, i + 1]));
}

export const chunkWorld = (map: WorldMap, cx: number, cy: number) => ({ x: (cx - map.w / 2) * map.chunk, y: (cy - map.offsetY) * map.chunk });
