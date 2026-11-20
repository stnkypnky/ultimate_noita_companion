// What the world map shows freely, and what stays hidden as a spoiler.
//
// Shown: the way down (Mines to the last Holy Mountain; the Laboratory below it once you've reached it) and the overworld you can see from the
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
 * The overworld biomes are procedural (noise, not wang tiles). The map draws them in their depth layers instead: open
 * sky, then the surface (soil, sand, snow), the layer under it, and deep rock (see groundBands). Their pictures (the
 * mountain, the pyramid, the stubs) are drawn over that.
 */
const OVERWORLD_LAYERED = new Set([
  'hills',
  'hills2',
  'hills_flat',
  'desert',
  'scale',
  'winter',
  'mountain_left_entrance',
  'mountain_left_stub',
  'mountain_right',
  'mountain_right_stub',
  'mountain_hall',
  'mountain_top',
  'mountain_tree',
  'mountain_lake',
  'mountain_floating_island',
  'pyramid_top',
  'pyramid_left',
  'pyramid_right',
  'pyramid_entrance',
]);
export { OVERWORLD_LAYERED };

/** Whether the map draws this biome in its depth layers. */
export const isLayered = (b: MapBiome) => OVERWORLD_LAYERED.has(b.id) && !!b.layers?.length;

export type GroundBand = { y0: number; y1: number; material: string };

const bandCache = new WeakMap<MapBiome, GroundBand[]>();
/**
 * A layered biome's materials by world depth: the noise value climbs linearly from 0 at the gradient's start to 1 at
 * its end, and at each value the matching layer that starts deepest wins (so the deep rock takes over from the sand
 * above it where their ranges overlap). Above the first layer: open sky (no band).
 */
export function groundBands(b: MapBiome): GroundBand[] {
  const have = bandCache.get(b);
  if (have) return have;
  const layers = b.layers ?? [];
  const [start, end] = b.gradient ?? [-1024, 1024];
  const yOf = (v: number) => start + v * (end - start);
  // Every edge where the winning layer can change.
  const cuts = [...new Set(layers.flatMap((l) => [l.min, l.max]))].sort((a, b) => a - b);
  const out: GroundBand[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const mid = (cuts[i]! + cuts[i + 1]!) / 2;
    let win: (typeof layers)[number] | undefined;
    for (const l of layers) if (l.min <= mid && mid < l.max && (!win || l.min >= win.min)) win = l;
    if (!win) continue;
    const y0 = yOf(cuts[i]!);
    const y1 = yOf(cuts[i + 1]!);
    const last = out.at(-1);
    if (last && last.material === win.material && last.y1 === y0) last.y1 = y1;
    else out.push({ y0, y1, material: win.material });
  }
  // The deepest layer carries on below its range.
  if (out.length) out.at(-1)!.y1 = Infinity;
  bandCache.set(b, out);
  return out;
}

/**
 * What a layered biome's pictures are made of where their material file is white: the layer under the surface (the
 * mountain's hard rock, the pyramid's sandstone, the forest's sand). In the game that white keeps the ground already
 * there; the map's flat layers have open sky up there, so it draws the body the wiki maps show.
 */
export const bodyMaterial = (b: MapBiome) => (isLayered(b) ? (groundBands(b)[1] ?? groundBands(b)[0])?.material : undefined);

/** A gentle roll on the ground's top edge (world px, up to about ±80): only a look, not the seed's real terrain. */
export const surfaceWave = (x: number) => 55 * Math.sin(x / 610) + 25 * Math.sin(x / 173 + 1.3);

/**
 * Above the ground line (y < 0) these are open sky: the lake's column, which the biome map marks all the way up, and the
 * roadblock, solid rock everywhere by its noise but in the game just the rock its picture draws.
 */
const SKY_ABOVE_GROUND = new Set(['lake', 'roadblock']);

/** The material a chunk is filled with on the map (undefined: sky). Layered biomes are drawn by groundBands. */
export const displayMaterial = (b: MapBiome, aboveGround = false) => (aboveGround && SKY_ABOVE_GROUND.has(b.id) ? undefined : b.material);

/** Pictures that are part of what's always shown, even in the overworld (the rest of the overworld's are secrets). */
const OPEN_SCENES = new Set(['tree']);

export type Area = { biome: MapBiome; cx: number; cy: number; index: number };

export const biomeKey = (b: MapBiome) => `map:${b.id}`;
export const sceneKey = (s: MapScene) => `map:scene:${s.id}`;

/** Orb room number (orbroom_07 holds orb 7). */
export const orbOf = (b: MapBiome) => (/^orbroom_(\d+)$/.exec(b.id) ? Number(/^orbroom_(\d+)$/.exec(b.id)![1]) : null);

export const isOpenBiome = (b: MapBiome) => PATH.has(b.id) || SURFACE.has(b.id);
/** On the way down: the descent, and the Laboratory at its end (hidden until reached, but still on the way). */
export const onPath = (b: MapBiome) => PATH.has(b.id) || b.id in MET_IN;

/** A biome's display name: the game's, capitalised, or ours for the unnamed ones. */
export function biomeName(b: MapBiome) {
  const n = b.name && b.name !== '_EMPTY_' && b.name !== '???' ? b.name : NAMES[b.id] ?? b.id.replace(/_/g, ' ');
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/** Whether the game names it (the rest are unnamed rooms and filler). */
export const namedInGame = (b: MapBiome) => !!b.name && b.name !== '_EMPTY_' && b.name !== '???';

/** Areas your save shows you've reached: the Laboratory once you've met its boss (its stats file). */
const MET_IN: Record<string, string[]> = { boss_arena: ['boss_centipede'], boss_arena_top: ['boss_centipede'] };

export function makeVisibility(map: WorldMap, opts: { all: boolean; visible: (key: string) => boolean; orbs: number[]; enemies?: string[] }) {
  const orbs = new Set(opts.orbs);
  const enemies = new Set(opts.enemies);
  const areaOfSplice = new Map(
    map.scenes.flatMap((s) => {
      const a = s.area ? map.biomes.find((b) => b.id === s.area) : undefined;
      return a ? [[s.from, a] as const] : [];
    }),
  );
  const met = (b: MapBiome) =>!!MET_IN[b.id]?.some((e) => enemies.has(e));
  const biome = (b: MapBiome) => opts.all || isOpenBiome(b) || opts.visible(biomeKey(b)) || (orbOf(b) !== null && orbs.has(orbOf(b)!)) || met(b);
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
    // The pieces of a room built from a spliced scene (the Laboratory) show with the area its whole picture lays out.
    const owner = areaOfSplice.get(s.from);
    if (owner) return biome(owner);
    // A picture that lays out a whole area (the Lava Lake) shows with that area.
    if (s.area) {
      const a = map.biomes.find((b) => b.id === s.area);
      return !!a && biome(a);
    }
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

/** The spoiler key of the hidden area at a world position (null: open ground, or off the map's main world). */
export function hiddenAreaAt(map: WorldMap, x: number, y: number): string | null {
  const { cx, cy } = chunkOf(map, x, y);
  if (cx < 0 || cy < 0 || cx >= map.w || cy >= map.h) return null;
  const b = map.biomes[map.cells[cy * map.w + cx]!]!;
  return isOpenBiome(b) ? null : biomeKey(b);
}

export const chunkWorld =(map: WorldMap, cx: number, cy: number) => ({ x: (cx - map.w / 2) * map.chunk, y: (cy - map.offsetY) * map.chunk });
