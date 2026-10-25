// The test range driven by real cast-simulator output (game scripts) and real extracted projectile data.
import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLuaHost, loadGun, type LuaHost } from '../tools/extract/lua.ts';
import { AIR, RangeWorld, type RangeData } from '../src/features/range/world.ts';
import type { EntityVisual, Material, Projectile } from '../src/data/types.ts';
import type { SimResult } from '../src/sim/types.ts';

const GAME = join(import.meta.dirname, '../public/game');
const json = <T>(p: string) => JSON.parse(readFileSync(join(GAME, p), 'utf8')) as T;
let host: LuaHost;
let data: RangeData;

beforeAll(async () => {
  host = await createLuaHost((p) => (existsSync(join(GAME, 'lua', p)) ? readFileSync(join(GAME, 'lua', p), 'utf8') : undefined));
  await loadGun(host);
  const materials = json<Material[]>('data/materials.json');
  data = {
    projectiles: json<Record<string, Projectile>>('data/projectiles.json'),
    visuals: json<Record<string, EntityVisual>>('data/visuals.json'),
    materialColor: new Map(materials.map((m) => [m.id, m.color])),
    rockDurability: materials.find((m) => m.id === 'rock_static')?.durability ?? 0,
  };
});

function casts(deck: string[], always: string[] = []) {
  host.call('sim_reset', 1, false, 20, deck.length, 10, 0, 1, 1000, 1000, 1000, 100, 100, 0, 0);
  for (const id of deck) host.call('sim_add_card', id, -1);
  for (const id of always) host.call('sim_add_always_cast', id);
  return (JSON.parse(host.call<string>('sim_run', 64, true)) as SimResult).casts;
}

const rocks = (w: RangeWorld) => w.terrain.reduce((n, c) => n + (c !== AIR ? 1 : 0), 0);

describe('test range', () => {
  it('spark bolts fly to the dummy and deal their damage', () => {
    const w = new RangeWorld(data);
    w.setCycle(casts(['LIGHT_BULLET']));
    for (let i = 0; i < 120; i++) w.step();
    expect(w.castsFired).toBeGreaterThan(3);
    expect(w.damageEvents.length).toBeGreaterThan(0);
    // 3 damage, or 15 on a 5% crit
    expect(w.damageEvents.every((e) => e.amount === 3 || e.amount === 15)).toBe(true);
  });

  it('a bomb in a trigger payload explodes and digs the terrain', () => {
    const w = new RangeWorld(data);
    const before = rocks(w);
    w.setCycle(casts(['LIGHT_BULLET_TRIGGER', 'BOMB']));
    for (let i = 0; i < 400; i++) w.step();
    expect(rocks(w)).toBeLessThan(before - 200);
    expect(w.totalDamage).toBeGreaterThan(100);
  });

  it('homing bends shots into the dummy', () => {
    const w = new RangeWorld(data);
    w.setCycle(casts(['HOMING', 'BUBBLESHOT']));
    for (let i = 0; i < 300; i++) w.step();
    expect(w.damageEvents.length).toBeGreaterThan(0);
  });

  it('fires the first cast on the first step', () => {
    const w = new RangeWorld(data);
    w.setCycle(casts(['LIGHT_BULLET', 'LIGHT_BULLET']));
    w.step();
    expect(w.castsFired).toBe(1);
  });

  it('loops the cast cycle', () => {
    const w = new RangeWorld(data);
    const c = casts(['LIGHT_BULLET', 'LIGHT_BULLET']);
    const cycle = c.at(-1)!.next_frame - c[0]!.frame;
    w.setCycle(c);
    for (let i = 0; i < cycle * 3; i++) w.step();
    expect(w.castsFired).toBe(6);
  });
});
