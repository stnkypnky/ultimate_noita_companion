// The world map extracted from biome_map.png, and what it shows before anything is revealed.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Material, WorldMap } from '../src/data/types.ts';
import { biomeKey, biomeName, holyMountains, makeVisibility, orbOf, sceneKey } from '../src/features/map/world.ts';
import { SHOP_SPOTS } from '../src/seed/seed.ts';

const GAME = join(import.meta.dirname, '../public/game');
const map = JSON.parse(readFileSync(join(GAME, 'data/map.json'), 'utf8')) as WorldMap;
const materials = JSON.parse(readFileSync(join(GAME, 'data/materials.json'), 'utf8')) as Material[];
const byId = (id: string) => map.biomes.find((b) => b.id === id)!;
const hidden = makeVisibility(map, { all: false, visible: () => false, orbs: [] });

describe('world map', () => {
  it('has a biome for every chunk of the 70 × 48 map', () => {
    expect([map.w, map.h, map.chunk]).toEqual([70, 48, 512]);
    expect(map.cells).toHaveLength(map.w * map.h);
    expect(map.cells.every((k) => k >= 0 && k < map.biomes.length)).toBe(true);
    expect(map.biomes.filter((b) => b.id === 'unknown')).toHaveLength(0);
  });

  it('the Mines sit just below the surface, the Laboratory far below, with Holy Mountains between', () => {
    const rows = (id: string) => map.cells.flatMap((k, i) => (map.biomes[k]!.id === id ? [Math.floor(i / map.w) - map.offsetY] : []));
    expect(Math.min(...rows('coalmine'))).toBe(0);
    expect(Math.min(...rows('boss_arena'))).toBeGreaterThan(Math.min(...rows('crypt')));
    expect(Math.min(...rows('crypt'))).toBeGreaterThan(Math.min(...rows('vault')));
    expect(holyMountains(map).size).toBeGreaterThanOrEqual(6);
    expect(biomeName(byId('coalmine'))).toBe('Mines');
  });

  it("names materials the game has, and every picture it points to was copied", () => {
    const ids = new Set(materials.map((m) => m.id));
    for (const b of map.biomes) if (b.material) expect(ids, b.id).toContain(b.material);
    for (const s of map.scenes) for (const k of [s.image, s.background]) if (k) expect(existsSync(join(GAME, 'map', `${k}.png`)), k).toBe(true);
    for (const b of map.biomes) if (b.background) expect(existsSync(join(GAME, 'backgrounds', `${b.background}.png`)), b.background).toBe(true);
  });

  it('finds the seven Holy Mountain shops, the same spots the seed tool uses', () => {
    expect(map.shops).toEqual(SHOP_SPOTS);
  });

  it('shows the way down and the overworld; side areas, orb rooms and secrets stay hidden', () => {
    for (const id of ['coalmine', 'excavationsite', 'snowcave', 'snowcastle', 'rainforest', 'vault', 'crypt', 'boss_arena', 'temple_altar', 'hills', 'lake'])
      expect(hidden.biome(byId(id)), id).toBe(true);
    for (const id of ['wizardcave', 'meat', 'the_end', 'orbroom_07', 'secret_lab', 'pyramid']) expect(hidden.biome(byId(id)), id).toBe(false);
    // Holy Mountain altars are always drawn; the eye glyphs are a secret.
    expect(map.scenes.filter((s) => s.id.startsWith('temple_altar')).every((s) => hidden.scene(s))).toBe(true);
    const eyes = map.scenes.filter((s) => s.id === 'eyespot');
    expect(eyes.length).toBeGreaterThan(0);
    expect(eyes.some((s) => hidden.scene(s))).toBe(false);
  });

  it('opens an area when revealed, an orb room when your save has that orb, and everything with spoilers on', () => {
    const wiz = byId('wizardcave');
    expect(makeVisibility(map, { all: false, visible: (k) => k === biomeKey(wiz), orbs: [] }).biome(wiz)).toBe(true);
    const room = byId('orbroom_07');
    expect(orbOf(room)).toBe(7);
    expect(makeVisibility(map, { all: false, visible: () => false, orbs: [7] }).biome(room)).toBe(true);
    const eye = map.scenes.find((s) => s.id === 'eyespot')!;
    expect(makeVisibility(map, { all: false, visible: (k) => k === sceneKey(eye), orbs: [] }).scene(eye)).toBe(true);
    const all = makeVisibility(map, { all: true, visible: () => false, orbs: [] });
    expect(map.biomes.every((b) => all.biome(b)) && map.scenes.every((s) => all.scene(s))).toBe(true);
  });
});
