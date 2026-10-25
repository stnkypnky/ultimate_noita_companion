// Golden tests: the real gun.lua (committed under public/game/lua) driven by our recorder.
import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLuaHost, loadGun, type LuaHost } from '../tools/extract/lua.ts';
import type { SimResult, SimShot } from '../src/sim/types.ts';

const LUA = join(import.meta.dirname, '../public/game/lua');
let host: LuaHost;

beforeAll(async () => {
  host = await createLuaHost((p) => (existsSync(join(LUA, p)) ? readFileSync(join(LUA, p), 'utf8') : undefined));
  await loadGun(host);
});

type Opts = { spc?: number; shuffle?: boolean; mana?: number; always?: string[]; casts?: number; stop?: boolean; reload?: number; delay?: number };

function sim(deck: string[], o: Opts = {}): SimResult {
  const mana = o.mana ?? 1000;
  host.call('sim_reset', o.spc ?? 1, o.shuffle ?? false, o.reload ?? 20, deck.length, o.delay ?? 10, 0, 1, mana, 100, mana, 100, 100, 0, 0);
  for (const id of deck) host.call('sim_add_card', id, -1);
  for (const id of o.always ?? []) host.call('sim_add_always_cast', id);
  return JSON.parse(host.call<string>('sim_run', o.casts ?? 10, o.stop ?? true)) as SimResult;
}

const files = (s: SimShot) => s.projectiles.map((p) => p.file.split('/').pop());
const SPARK = 'light_bullet.xml';

describe('wand simulation (real gun.lua)', () => {
  it('casts one spell per cast and recharges after the last', () => {
    const r = sim(['LIGHT_BULLET', 'LIGHT_BULLET']);
    expect(r.casts).toHaveLength(2);
    expect(r.casts[0]!.played).toEqual(['LIGHT_BULLET']);
    expect(r.casts[0]!.reload).toBeUndefined();
    expect(r.casts[1]!.reload).toBe(20);
    expect(files(r.casts[0]!.shot)).toEqual([SPARK]);
  });

  it('casts both spells together with Double Spell', () => {
    const r = sim(['BURST_2', 'LIGHT_BULLET', 'LIGHT_BULLET']);
    expect(r.casts).toHaveLength(1);
    expect(files(r.casts[0]!.shot)).toEqual([SPARK, SPARK]);
    expect(r.casts[0]!.reload).toBe(20);
  });

  it('puts the next spell into a trigger payload', () => {
    const r = sim(['LIGHT_BULLET_TRIGGER', 'BOMB']);
    const [p] = r.casts[0]!.shot.projectiles;
    expect(p!.trigger?.kind).toBe('hit');
    expect(files(p!.trigger!.shot)).toEqual(['bomb.xml']);
  });

  it('adds payload cast delay to the cast', () => {
    const r = sim(['LIGHT_BULLET_TRIGGER', 'BOMB'], { delay: 10 });
    // wand 10 + spark bolt 3 + bomb 100
    expect(r.casts[0]!.cast_delay).toBe(113);
  });

  it('applies modifiers to the shot they are drawn into', () => {
    const r = sim(['DAMAGE', 'LIGHT_BULLET']);
    expect(r.casts).toHaveLength(1);
    expect(r.casts[0]!.shot.state.damage_projectile_add).toBeCloseTo(0.4);
  });

  it('wraps around the deck when a multicast runs off the end', () => {
    const r = sim(['LIGHT_BULLET', 'BURST_2']);
    const second = r.casts[1]!;
    expect(second.played).toEqual(['BURST_2', 'LIGHT_BULLET']);
    expect(second.reload).toBeDefined();
  });

  it('reports which deck slots each cast played', () => {
    const r = sim(['BURST_2', 'LIGHT_BULLET', 'LIGHT_BULLET'], { always: ['BOMB'] });
    expect(r.casts[0]!.slots).toEqual([-1, 1, 2, 3]);
  });

  it('plays always-cast spells on every cast', () => {
    const r = sim(['LIGHT_BULLET', 'LIGHT_BULLET'], { always: ['BOMB'] });
    for (const c of r.casts) expect(files(c.shot)).toContain('bomb.xml');
  });

  it('skips spells it cannot afford', () => {
    const r = sim(['BLACK_HOLE', 'LIGHT_BULLET'], { mana: 50, casts: 1 });
    expect(r.casts[0]!.played).toEqual(['LIGHT_BULLET']);
    expect(r.casts[0]!.no_mana).toBe(1);
  });

  it('regenerates mana between casts', () => {
    const r = sim(['LIGHT_BULLET', 'LIGHT_BULLET'], { mana: 100 });
    const [a, b] = r.casts;
    expect(a!.mana_after).toBe(95);
    // 13 frames of cast delay at 100 mana/s ≈ +21.7, capped at 100
    expect(b!.mana_before).toBe(100);
  });

  it('does not call unimplemented engine functions for common spells', () => {
    const r = sim(['BURST_3', 'LIGHT_BULLET', 'DAMAGE', 'BOMB', 'LIGHT_BULLET_TRIGGER', 'BULLET']);
    expect(r.missing).toEqual([]);
  });
});
