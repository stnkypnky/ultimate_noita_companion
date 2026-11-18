// Points of interest for a seed, from the shipped files only (public/game: map, wang templates, the game scripts
// the seed worker gets), so it also proves the worker has every script the biome scripts need.
import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { createLuaHost, seedSource, type LuaHost } from '../tools/extract/lua.ts';
import { generateLayouts, type AreaLayout } from '../src/seed/layout.ts';
import { buildTileset, type Tileset } from '../src/seed/wang.ts';
import { placePois, type PoiData, type PoiStats, type SeedPoi } from '../src/seed/poi.ts';
import { fixedPois, placedPois, poiDirection } from '../src/features/map/pois.ts';
import type { WorldMap } from '../src/data/types.ts';

const GAME = join(import.meta.dirname, '../public/game');
const map = JSON.parse(readFileSync(join(GAME, 'data/map.json'), 'utf8')) as WorldMap;
const data = JSON.parse(readFileSync(join(GAME, 'data/pois.json'), 'utf8')) as PoiData;
const shipped = new Set(JSON.parse(readFileSync(join(GAME, 'lua/seed-files.json'), 'utf8')) as string[]);

let host: LuaHost;
let layouts: AreaLayout[];
let pois: SeedPoi[];
const stats: PoiStats[] = [];
const SEED = 123;

beforeAll(async () => {
  host = await createLuaHost((p) => (shipped.has(p) && existsSync(join(GAME, 'lua', p)) ? readFileSync(join(GAME, 'lua', p), 'utf8') : undefined));
  await host.lua.doString(seedSource);
  const tilesets = new Map<string, Tileset>();
  for (const n of new Set(map.biomes.flatMap((b) => (b.wangTemplate ? [b.wangTemplate] : [])))) {
    const { data: px, info } = await sharp(join(GAME, `wang/${n}.png`)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const ts = buildTileset(new Uint8Array(px), info.width, info.height);
    if (ts) tilesets.set(n, ts);
  }
  const overlay = new Uint8Array(await sharp(join(GAME, 'wang/coalmine_overlay.png')).removeAlpha().raw().toBuffer());
  layouts = generateLayouts(map, SEED, tilesets, overlay);
  host.call('sim_set_world_seed', SEED);
  pois = placePois(host.call, map, layouts, data, stats);
}, 60_000);

const count = (file: string) => pois.filter((p) => p.file.endsWith(file)).length;
const biomeAt = (x: number, y: number) => map.biomes[map.cells[Math.floor(y / map.chunk + map.offsetY) * map.w + Math.floor(x / map.chunk + map.w / 2)]!]!;

describe('points of interest for a seed', () => {
  it('runs every cave biome script without errors, with only the shipped files', () => {
    expect(map.biomes.filter((b) => b.luaScript).length).toBeGreaterThan(20);
    expect(stats.reduce((n, s) => n + s.errors, 0)).toBe(0);
    expect(stats.reduce((n, s) => n + s.markers, 0)).toBeGreaterThan(1000);
  });

  it('places the rooms the scripts choose for this seed', () => {
    // Snowy Depths: init() hides 8 hand statues by ProceduralRandom alone.
    expect(count('snowcave/statue_hand.png')).toBe(8);
    // The Jungle's portal hint statues: two on each axis.
    expect(count('rainforest/rainforest_statue_01.png') + count('rainforest/rainforest_statue_02.png')).toBe(4);
    // Hiisi Base's random rooms for seed 123.
    expect(count('snowcastle/kitchen.png')).toBe(1);
    expect(count('snowcastle/bar.png')).toBe(1);
    // Only curated rooms come back, each a known one.
    for (const p of pois) expect(data.scenes[p.file], p.file).toBeDefined();
  });

  it('keeps each room inside its biome', () => {
    for (const p of pois) {
      const info = data.scenes[p.file]!;
      const b = biomeAt(p.x + info.w / 2, p.y + info.h / 2);
      expect(b.wangTemplate, `${p.file} at ${p.x},${p.y} is in ${b.id}`).toBeDefined();
    }
  });

  it('is the same every time for a seed', () => {
    host.call('sim_set_world_seed', SEED);
    expect(placePois(host.call, map, layouts, data)).toEqual(pois);
  });

  it('adds the fixed ones and names everything for the map', () => {
    const fixed = fixedPois(map, data);
    expect(fixed.find((p) => p.name === 'Anvil')).toMatchObject({ x: 1464, y: 5976, fixed: true });
    expect(fixed.filter((p) => p.name === 'The Tree')).toHaveLength(1);
    const shown = placedPois(data, pois);
    expect(shown.find((p) => p.name === 'Hiisi Kitchen')?.wiki).toContain('Hiisi_Base');
    expect(poiDirection({ x: 0, y: 0 }, { ...shown[0]!, x: 300, y: -10, w: 20, h: 20 })).toBe('310 m right');
    expect(poiDirection({ x: 0, y: 0 }, { ...shown[0]!, x: -1600, y: 1500, w: 0, h: 0 })).toBe('2.2 km down-left');
  });
});
