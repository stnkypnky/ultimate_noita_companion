// The world map extracted from biome_map.png, and what it shows before anything is revealed.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Material, WorldMap } from '../src/data/types.ts';
import { biomeKey, biomeName, groundBands, holyMountains, isLayered, makeVisibility, orbOf, OVERWORLD_LAYERED, sceneKey } from '../src/features/map/world.ts';
import { SHOP_SPOTS } from '../src/seed/seed.ts';
import { evalCond, initSceneCalls } from '../tools/extract/map.ts';

const GAME = join(import.meta.dirname, '../public/game');
const map = JSON.parse(readFileSync(join(GAME, 'data/map.json'), 'utf8')) as WorldMap;
const materials = JSON.parse(readFileSync(join(GAME, 'data/materials.json'), 'utf8')) as Material[];
const byId = (id: string) => map.biomes.find((b) => b.id === id)!;
const hidden = makeVisibility(map, { all: false, visible: () => false, orbs: [] });

describe('world map', () => {
  it('has a biome for every chunk of the 70 × 48 map, and the world past it above and below', () => {
    expect([map.w, map.chunk, map.offsetY - map.mapTop!]).toEqual([70, 512, 14]);
    // The edge rows carry on: up past the Moon and the Work's Heaven, down past Hell and the dark Moon.
    expect(-map.offsetY * map.chunk).toBeLessThanOrEqual(-26104);
    expect((map.h - map.offsetY) * map.chunk).toBeGreaterThan(37513);
    expect(map.cells.slice(0, map.w)).toEqual(map.cells.slice(map.mapTop! * map.w, (map.mapTop! + 1) * map.w));
    expect(map.scenes.filter((s) => s.id === 'the_end_shop').map((s) => s.y).sort((a, b) => a - b)).toEqual([-13954, 24576]);
    // Heaven and Hell are the world one biome_map height up and down: where the Snowy Depths are, the column above
    // is the_sky (Heaven's caves) and below it the_end (Hell's), which the map draws the main caves into again.
    expect(map.mapRows).toBe(48);
    const snow = map.areas.find((a) => map.biomes[a.biome]!.id === 'snowcave' && a.x1 <= 35 && a.x2 >= 35)!;
    const at = (cy: number) => map.biomes[map.cells[cy * map.w + 35]!]!.id;
    expect([at(snow.y1 - 48), at(snow.y1 + 48)]).toEqual(['the_sky', 'the_end']);
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

  it('draws every piece the mountain and pyramid scripts load, and none of their commented-out ones', () => {
    const files = (id: string) => map.scenes.filter((s) => s.id === id && s.from === 'biome').map((s) => s.file.split('/').pop());
    expect(files('mountain_left_entrance')).toEqual(expect.arrayContaining(['left_entrance.png', 'left_entrance_bottom.png', 'left_stub_edge.png']));
    expect(files('mountain_hall')).toEqual(expect.arrayContaining(['hall.png', 'hall_r.png', 'hall_b.png', 'hall_br.png']));
    expect(files('mountain_right')).toEqual(expect.arrayContaining(['right.png', 'right_bottom.png']));
    expect(files('pyramid_top')).toContain('top.png');
    // mountain_top.lua's two bottom pieces are commented out in the game.
    expect(files('mountain_top')).toEqual(['top.png']);
  });

  it('reads init() as the game runs it: every call, comments skipped, one branch of an if', () => {
    const init = [
      '\t--LoadPixelScene( "old.png", "", x, y, "", true )\r',
      '\tif GameGetIsGamepadConnected() then\r',
      '\t\tLoadPixelScene( "a.png", "", x, y, "pad.png", true )\r',
      '\telse\r',
      '\t\tLoadPixelScene( "a.png", "", x, y, "keys.png", true )\r',
      '\tend\r',
      '\tLoadPixelScene( "b.png", "", x+512, y-40+300, "", true )\r',
      '\tif is_right then LoadPixelScene( "r.png", "", x-50, y, "", true ) elseif left then LoadPixelScene( "l.png", "", x+50, y, "", true ) end\r',
      '\tLoadPixelScene( "data/biome_impl/end/c.png", "", portal_x, portal_y, "", true )\r',
      'end',
    ].join('\n');
    expect(initSceneCalls(init).map((c) => [c.file, c.background, c.dx, c.dy])).toEqual([
      ['a.png', 'keys.png', 0, 0],
      ['b.png', '', 512, 260],
      ['r.png', '', -50, 0],
    ]);
  });

  it('finds the fixed portals, each named, with where it leads', () => {
    const pois = JSON.parse(readFileSync(join(GAME, 'data/pois.json'), 'utf8')) as { scenes: Record<string, { kind: string }> };
    const portals = map.portals ?? [];
    for (const p of portals) expect(pois.scenes[p.entity]?.kind, p.entity).toBe('portal');
    const of = (name: string) => portals.filter((p) => p.entity.endsWith(`/${name}.xml`));
    // A portal into each of the six Holy Mountains below an area, across the row; then the last one's, to the Laboratory.
    const rows = new Set(of('teleport_liquid_powered').map((p) => p.y));
    expect(rows.size).toBe(6);
    expect(of('teleport_ending').length).toBeGreaterThan(0);
    expect(of('teleport_teleroom_1').length + of('teleport_teleroom_6').length).toBe(2);
    // The Lava Lake's scene has a portal marker, but outside the chunk that knows it: the game spawns nothing there.
    expect(of('teleport_lavalake')).toHaveLength(0);
    expect(map.portalImage && existsSync(join(GAME, 'map', `${map.portalImage}.png`))).toBe(true);
  });

  it('decides a script’s branches on where it runs', () => {
    expect(evalCond('y > 2000 and y < 2400', { x: 0, y: 2048 }, new Set())).toBe(true);
    expect(evalCond('y > 2000 and y < 2400', { x: 0, y: 2560 }, new Set())).toBe(false);
    expect(evalCond('is_right and x > 0', { x: -512, y: 0 }, new Set())).toBe(false);
    expect(evalCond('is_right and x > 0', { x: 512, y: 0 }, new Set())).toBeNull();
    expect(evalCond('GameGetIsGamepadConnected()', undefined, new Set())).toBeNull();
    expect(evalCond('is_solid', undefined, new Set(['is_solid']))).toBe(false);
  });

  it('draws the Lava Lake from its spliced picture, shown when the lake is found', () => {
    const lake = map.scenes.find((s) => s.id === 'lavalake2')!;
    expect(lake).toMatchObject({ area: 'lavalake', materials: true, w: 2560, h: 2392 });
    expect(existsSync(join(GAME, 'map', `${lake.image}.png`))).toBe(true);
    expect(hidden.scene(lake)).toBe(false);
    expect(makeVisibility(map, { all: false, visible: (k) => k === 'map:lavalake', orbs: [] }).scene(lake)).toBe(true);
    // The Tree stands in the open forest: drawn, but it doesn't make the forest a room.
    expect(map.scenes.find((s) => s.id === 'tree' && s.image)?.area).toBeUndefined();
  });

  it('finds the seven Holy Mountain shops, the same spots the seed tool uses', () => {
    expect(map.shops).toEqual(SHOP_SPOTS);
  });

  it('shows the way down and the overworld; side areas, orb rooms and secrets stay hidden', () => {
    for (const id of ['coalmine', 'excavationsite', 'snowcave', 'snowcastle', 'rainforest', 'vault', 'crypt', 'temple_altar', 'hills', 'lake'])
      expect(hidden.biome(byId(id)), id).toBe(true);
    for (const id of ['wizardcave', 'meat', 'the_end', 'orbroom_07', 'secret_lab', 'pyramid', 'boss_arena', 'boss_arena_top']) expect(hidden.biome(byId(id)), id).toBe(false);
    // The Laboratory and every piece of its picture wait until you get there.
    expect(map.scenes.filter((s) => s.file.includes('spliced/boss_arena')).some((s) => hidden.scene(s))).toBe(false);
  });

  it('opens the Laboratory once your save has met its boss', () => {
    const met = makeVisibility(map, { all: false, visible: () => false, orbs: [], enemies: ['boss_centipede'] });
    expect(met.biome(byId('boss_arena'))).toBe(true);
    expect(map.scenes.filter((s) => s.file.includes('spliced/boss_arena')).every((s) => met.scene(s))).toBe(true);
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

describe('overworld ground layers', () => {
  const at = (id: string, y: number) => groundBands(byId(id)).find((b) => b.y0 <= y && y < b.y1)?.material;
  it('draws the forest as sky, a thin soil surface, the olive sand under it, then rock', () => {
    expect(at('hills', -300)).toBeUndefined();
    expect(at('hills', -50)).toBe('soil');
    expect(at('hills', 300)).toBe('sand_static');
    expect(at('hills', 1000)).toBe('rock_static');
    expect(at('hills', 20000)).toBe('rock_static');
  });
  it('draws the desert as a sand surface over sandstone, with rock deepest', () => {
    const bands = groundBands(byId('desert'));
    expect(bands[0]!.material).toBe('sand_surface');
    expect(bands.map((b) => b.material)).toContain('sandstone_surface');
    expect(bands.at(-1)!.material).toBe('rock_static');
    expect(at('winter', -500)).toBeUndefined();
    expect(at('winter', 2000)).toBe('snowrock_static');
  });
  it('has layers for every overworld biome it draws that way (so no stone boxes in the sky)', () => {
    for (const id of OVERWORLD_LAYERED) {
      const b = map.biomes.find((x) => x.id === id);
      if (b) expect(isLayered(b), id).toBe(true);
    }
    expect(at('mountain_lake', -1000)).toBeUndefined();
    expect(at('mountain_left_entrance', -400)).toBeUndefined();
  });
});
