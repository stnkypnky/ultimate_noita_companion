// Items for a seed, from the shipped files only (public/game: map, wang templates, world_items.json, the game
// scripts the seed worker gets), so it also proves the worker has every script the spawn functions need.
import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { createLuaHost, seedSource, type LuaHost } from '../tools/extract/lua.ts';
import { generateLayouts, templateOf, type AreaLayout, type Template } from '../src/seed/layout.ts';
import { itemDetails, placeItems, roundHalfEven, type ItemData, type ItemStats, type SeedItem } from '../src/seed/items.ts';
import type { WorldMap } from '../src/data/types.ts';

const GAME = join(import.meta.dirname, '../public/game');
const map = JSON.parse(readFileSync(join(GAME, 'data/map.json'), 'utf8')) as WorldMap;
const data = JSON.parse(readFileSync(join(GAME, 'data/world_items.json'), 'utf8')) as ItemData;
const shipped = new Set(JSON.parse(readFileSync(join(GAME, 'lua/seed-files.json'), 'utf8')) as string[]);

let host: LuaHost;
let layouts: AreaLayout[];
let items: SeedItem[];
const stats: ItemStats[] = [];
const SEED = 123;

beforeAll(async () => {
  host = await createLuaHost((p) => (shipped.has(p) && existsSync(join(GAME, 'lua', p)) ? readFileSync(join(GAME, 'lua', p), 'utf8') : undefined));
  await host.lua.doString(seedSource);
  const tilesets = new Map<string, Template>();
  for (const n of new Set(map.biomes.flatMap((b) => (b.wangTemplate ? [b.wangTemplate] : [])))) {
    const { data: px, info } = await sharp(join(GAME, `wang/${n}.png`)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    tilesets.set(n, templateOf(new Uint8Array(px), info.width, info.height));
  }
  const overlay = new Uint8Array(await sharp(join(GAME, 'wang/coalmine_overlay.png')).removeAlpha().raw().toBuffer());
  layouts = generateLayouts(map, SEED, tilesets, overlay);
  host.call('sim_set_world_seed', SEED);
  host.call('seed_set_flags', true, '');
  items = itemDetails(host.call, data, placeItems(host.call, map, layouts, data, stats));
}, 120_000);

const biomeAt = (x: number, y: number) => map.biomes[map.cells[Math.floor(y / map.chunk + map.offsetY) * map.w + Math.floor(x / map.chunk + map.w / 2)]!];
const kind = (k: SeedItem['kind']) => items.filter((i) => i.kind === k);

describe('items for a seed', () => {
  it('runs the spawn functions with only the shipped files, few failing', () => {
    const markers = stats.reduce((n, s) => n + s.markers, 0);
    expect(markers).toBeGreaterThan(1000);
    expect(stats.reduce((n, s) => n + s.errors, 0)).toBeLessThan(markers * 0.01);
  });

  it('places wands, chests, hearts and flasks in the caves', () => {
    expect(kind('wand').length).toBeGreaterThan(10);
    expect(kind('chest').length).toBeGreaterThan(3);
    expect(kind('heart').length).toBeGreaterThan(3);
    expect(kind('flask').length).toBeGreaterThan(10);
    // The Mines has wands (its wand altars) and flasks.
    const mines = items.filter((i) => biomeAt(i.x, i.y)?.id === 'coalmine');
    expect(mines.some((i) => i.kind === 'wand')).toBe(true);
    expect(mines.some((i) => i.kind === 'flask')).toBe(true);
  });

  it("rolls each wand's stats where it lies, within its level's range", () => {
    const rolled = kind('wand').filter((w) => w.wand);
    expect(rolled.length).toBeGreaterThan(kind('wand').length * 0.8);
    for (const w of rolled) {
      expect(w.wand!.capacity).toBeGreaterThanOrEqual(1);
      expect(w.wand!.capacity).toBeLessThanOrEqual(26);
      expect(w.wand!.manaMax).toBeGreaterThan(0);
    }
    // The same roll as the game's generate_gun at that spot.
    const w = rolled.find((r) => data.entities[r.file]!.wand)!;
    const e = data.entities[w.file]!.wand!;
    const again = JSON.parse(host.call('seed_wand', roundHalfEven(w.x), roundHalfEven(w.y), e.cost, e.level, e.unshuffle) as string) as { spells: string[] };
    expect(w.wand!.spells.filter(Boolean)).toEqual(again.spells.slice(0, w.wand!.capacity));
  });

  it("gives set wands (the Mines' altar wands) their own stats, name and spells", () => {
    const set = kind('wand').filter((w) => data.entities[w.file]!.preset?.script?.endsWith('level_1_wand.lua'));
    expect(set.length).toBeGreaterThan(0);
    for (const w of set) {
      expect(w.name).toMatch(/wand/i);
      expect(w.name).not.toBe('Wand');
      expect(w.wand!.spells.filter(Boolean).length).toBeGreaterThan(0);
    }
  });

  it('gives every set wand a way to get spells (some inherit their script from a Base file: wand_010…017)', () => {
    const bare = Object.entries(data.entities).filter(([, e]) => e.preset && !e.preset.script && !e.preset.spells?.length);
    expect(bare.map(([f]) => f)).toEqual([]);
  });

  it('opens chests and fills flasks', () => {
    expect(kind('chest').filter((c) => c.contents?.length).length).toBeGreaterThan(kind('chest').length * 0.8);
    expect(kind('flask').filter((f) => f.material).length).toBeGreaterThan(kind('flask').length * 0.8);
  });

  it('is the same every time for a seed', () => {
    host.call('sim_set_world_seed', SEED);
    expect(itemDetails(host.call, data, placeItems(host.call, map, layouts, data))).toEqual(items);
  });

  it("doesn't depend on what the engine did first (a chest opened before any wand: devices disagreed)", async () => {
    const other = await createLuaHost((p) => (shipped.has(p) && existsSync(join(GAME, 'lua', p)) ? readFileSync(join(GAME, 'lua', p), 'utf8') : undefined));
    await other.lua.doString(seedSource);
    other.call('sim_set_world_seed', SEED);
    other.call('seed_set_flags', true, '');
    const chest = kind('chest')[0]!;
    other.call('seed_chest', roundHalfEven(chest.x), roundHalfEven(chest.y));
    expect(itemDetails(other.call, data, placeItems(other.call, map, layouts, data))).toEqual(items);
    other.close();
  }, 120_000);
});
