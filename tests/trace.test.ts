// The map against the game itself: a trace the mod recorded ("Record world generation", trimmed into
// tests/fixtures by `npx tsx tools/trace-check.ts --fixture …`) lists every room the game loaded as the player went
// down. Each one in a cave biome must be where, and what, the map's placement says.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { createLuaHost, seedSource } from '../tools/extract/lua.ts';
import { generateLayouts, templateOf, type Template } from '../src/seed/layout.ts';
import { placePois, type PoiData } from '../src/seed/poi.ts';
import type { WorldMap } from '../src/data/types.ts';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const traces = existsSync(FIXTURES) ? readdirSync(FIXTURES).filter((f) => /^trace-\d+\.json$/.test(f)) : [];
const GAME = join(import.meta.dirname, '../public/game');

describe.skipIf(!traces.length)('rooms as the game placed them', () => {
  for (const file of traces) {
    it(`matches ${file}`, async () => {
      const trace = JSON.parse(readFileSync(join(FIXTURES, file), 'utf8')) as { seed: number; scenes: [string, number, number][] };
      const map = JSON.parse(readFileSync(join(GAME, 'data/map.json'), 'utf8')) as WorldMap;
      const shipped = new Set(JSON.parse(readFileSync(join(GAME, 'lua/seed-files.json'), 'utf8')) as string[]);
      const host = await createLuaHost((p) => (shipped.has(p) && existsSync(join(GAME, 'lua', p)) ? readFileSync(join(GAME, 'lua', p), 'utf8') : undefined));
      await host.lua.doString(seedSource);
      const tilesets = new Map<string, Template>();
      for (const n of new Set(map.biomes.flatMap((b) => (b.wangTemplate ? [b.wangTemplate] : [])))) {
        const { data, info } = await sharp(join(GAME, `wang/${n}.png`)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        tilesets.set(n, templateOf(new Uint8Array(data), info.width, info.height));
      }
      const overlay = new Uint8Array(await sharp(join(GAME, 'wang/coalmine_overlay.png')).removeAlpha().raw().toBuffer());
      host.call('sim_set_world_seed', trace.seed);
      const everything: PoiData = { scenes: new Proxy({}, { get: (_t, k) => ({ name: String(k), kind: 'room', w: 1, h: 1 }) }) };
      const ours = new Set(placePois(host.call, map, generateLayouts(map, trace.seed, tilesets, overlay), everything).map((p) => `${p.file}|${p.x}|${p.y}`));
      // The rooms the cave biomes' layouts place (the fixed world's scenes and Holy Mountains aren't the walk's).
      const caveRooms = trace.scenes.filter(([f]) => /biome_impl\/(coalmine|excavationsite|snowcave|snowcastle|rainforest|vault|crypt|fungicave|wandcave)\//.test(f));
      expect(caveRooms.length).toBeGreaterThan(0);
      const missing = caveRooms.filter(([f, x, y]) => !ours.has(`${f}|${Math.round(x)}|${Math.round(y)}`));
      expect(missing).toEqual([]);
      host.close();
    }, 120_000);
  }
});
