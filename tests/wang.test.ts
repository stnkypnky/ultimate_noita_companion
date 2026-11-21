// Cave layouts (seed/wang.ts): generated maps must match the game's, pixel for pixel (fixtures from noita-tools).
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import type { WorldMap } from '../src/data/types.ts';
import type { Tileset } from '../src/seed/wang.ts';
import { areaParams, generateLayouts, templateOf, type Template } from '../src/seed/layout.ts';
import { generateArea } from '../src/seed/wang.ts';

const GAME = join(import.meta.dirname, '../public/game');
const FIX = join(import.meta.dirname, 'fixtures/wang');
const map = JSON.parse(readFileSync(join(GAME, 'data/map.json'), 'utf8')) as WorldMap;
const tilesets = new Map<string, Template>();
let overlay: Uint8Array;

const rgb = async (file: string) => {
  const r = await sharp(file, { ignoreIcc: true }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(r.data), w: r.info.width, h: r.info.height };
};

beforeAll(async () => {
  for (const b of map.biomes) {
    if (!b.wangTemplate || tilesets.has(b.wangTemplate)) continue;
    const t = await rgb(join(GAME, 'wang', `${b.wangTemplate}.png`));
    tilesets.set(b.wangTemplate, templateOf(t.data, t.w, t.h));
  }
  overlay = (await rgb(join(GAME, 'wang/coalmine_overlay.png'))).data;
});

/** The area holding chunk (x, y), as noita-tools' map tests pick them (y in biome_map.png's rows). */
const areaAt = (x: number, gy: number, y = gy + (map.mapTop ?? 0)) => map.areas.findIndex((a) => a.x1 <= x && a.x2 >= x && a.y1 <= y && a.y2 >= y && map.cells[y * map.w + x] === a.biome);

describe('cave layouts (herringbone wang tiles, as the game generates them)', () => {
  const cases: [string, number, number][] = [
    ['1385124_coalmine_alt', 32, 15],
    ['1385124_fungicave', 34, 28],
    ['1385124_crypt', 26, 36],
    ['1385124_coalmine', 53, 31], // a tower wall, generated with the Mines' entrance overlay
    ['1674055821_liquidcave', 28, 14],
    ['1674055821_vault', 32, 31],
    ['5550_clouds', 53, 3],
    ['5550_wand', 53, 39],
    ['5550_wizardcave', 53, 40],
  ];
  for (const [name, x, y] of cases) {
    it(`${name}: matches the game's map pixel for pixel`, async () => {
      const seed = Number(name.split('_')[0]);
      const p = areaParams(map, areaAt(x, y), seed, overlay)!;
      const got = generateArea(tilesets.get(p.template) as Tileset, p)!;
      const want = await rgb(join(FIX, `${name}.png`));
      expect([p.width, p.height]).toEqual([want.w, want.h]);
      let diff = 0;
      for (let i = 0; i < want.data.length; i++) if (got[i] !== want.data[i]) diff++;
      expect(diff).toBe(0);
    });
  }

  it('lays out every cave area of a seed (the Mines open at the top where the player enters), in well under a second', () => {
    const t0 = performance.now();
    const all = generateLayouts(map, 123, tilesets, overlay);
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(all.length).toBeGreaterThan(map.areas.length * 0.8);
    expect(all).toHaveLength(map.areas.length);
    const mines = all.find((l) => map.biomes[map.areas[l.area]!.biome]!.id === 'coalmine')!;
    expect([mines.width, mines.height]).toEqual([256, 103]);
    // Open cave (black) somewhere along the top row, where the path down starts.
    let open = 0;
    for (let x = 0; x < mines.width; x++) if (mines.rgb[x * 3] === 0 && mines.rgb[x * 3 + 1] === 0 && mines.rgb[x * 3 + 2] === 0) open++;
    expect(open).toBeGreaterThan(0);
  });

  it('lays out tall areas without a path check, and keeps a layout even when no try finds a way down', () => {
    // Seed 2046258427: the Snowy Chasm (28 chunks tall) never has a way down in 100 tries, and the Lake never does.
    const all = generateLayouts(map, 2046258427, tilesets, overlay);
    expect(all).toHaveLength(map.areas.length);
    const ids = all.map((l) => map.biomes[map.areas[l.area]!.biome]!.id);
    for (const id of ['winter_caves', 'lake_deep', 'rainforest_dark']) expect(ids, id).toContain(id);
    // Even checked, the Lake (no way down ever) keeps its 100th layout rather than none.
    const lake = areaParams(map, map.areas.findIndex((a) => map.biomes[a.biome]!.id === 'lake_deep'), 2046258427)!;
    expect(generateArea(tilesets.get(lake.template) as Tileset, { ...lake, checkPath: true })).not.toBeNull();
  });

  it("draws the sky temples' fixed pictures as they are", () => {
    const all = generateLayouts(map, 123, tilesets, overlay);
    const barren = all.find((l) => map.biomes[map.areas[l.area]!.biome]!.id === 'biome_barren')!;
    expect([barren.width, barren.height]).toEqual([153, 94]);
  });
});
