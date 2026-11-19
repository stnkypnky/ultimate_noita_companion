// Cast explanations: each spell's and perk's own part of a shot (driver.lua steps), and the analyser's breakdowns.
import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLuaHost, loadGun, type LuaHost } from '../tools/extract/lua.ts';
import { castWand, resetWand, runWand } from '../src/sim/protocol.ts';
import type { SimRequest, SimShot } from '../src/sim/types.ts';
import { Analyzer, type ProjectileView } from '../src/sim/analyze.ts';
import { perkBoost } from '../src/sim/perks.ts';
import type { Projectile, Spell } from '../src/data/types.ts';

const GAME = join(import.meta.dirname, '../public/game');
let host: LuaHost;
const call = (fn: string, ...args: unknown[]) => host.call(fn, ...args);

beforeAll(async () => {
  host = await createLuaHost((p) => (existsSync(join(GAME, 'lua', p)) ? readFileSync(join(GAME, 'lua', p), 'utf8') : undefined));
  await loadGun(host);
});

const req = (deck: string[], modifiers: string[] = [], spellsPerCast = 1): SimRequest => ({
  wand: { shuffle: false, spellsPerCast, castDelay: 10, rechargeTime: 20, manaMax: 2000, manaChargeSpeed: 2000, capacity: deck.length, spread: 0, speedMultiplier: 1 },
  deck: deck.map((id) => ({ id, uses: -1 })),
  alwaysCasts: [],
  modifiers,
  options: { maxCasts: 1, stopOnReload: true, hp: 100, maxHp: 100, money: 0, frame: 0 },
});

const who = (s: SimShot) => (s.steps ?? []).map((st) => st.id ?? `mod:${st.mod}`);

describe('driver steps', () => {
  it('splits a trigger, its payload and a perk modifier into their own steps', () => {
    const c = runWand(call, req(['LIGHT_BULLET_TRIGGER', 'LIGHT_BULLET'], ['lower_spread'])).casts[0]!;
    expect(who(c.shot)).toEqual(['LIGHT_BULLET_TRIGGER', 'mod:lower_spread']);
    const mod = c.shot.steps![1]!;
    expect(mod.d.damage_projectile_add).toBeCloseTo(0.5);
    expect(mod.d.spread_degrees).toBe(-25);
    expect(mod.d.fire_rate_wait).toBe(2);
    expect(mod.mana).toBe(0);
    const payload = c.shot.projectiles[0]!.trigger!.shot;
    expect(who(payload)).toEqual(['LIGHT_BULLET', 'mod:lower_spread']);
    // The trigger paid its own mana, not its payload's.
    expect(c.shot.steps![0]!.mana + payload.steps![0]!.mana).toBe(c.mana_before - c.mana_after);
    expect(payload.steps![0]!.mana).toBeGreaterThan(0);
  });

  it("a nested modifier's changes are its own, not the multicast's that drew it", () => {
    const c = runWand(call, req(['BURST_2', 'DAMAGE', 'LIGHT_BULLET', 'LIGHT_BULLET'])).casts[0]!;
    expect(who(c.shot)).toEqual(['BURST_2', 'DAMAGE', 'LIGHT_BULLET', 'LIGHT_BULLET']);
    const [burst, dmg] = c.shot.steps!;
    expect(burst!.d.damage_projectile_add).toBeUndefined();
    expect(dmg!.d.damage_projectile_add).toBeCloseTo(0.4);
    // Steps plus the wand's own delay make up the cast delay.
    const sum = c.shot.steps!.reduce((s, st) => s + (st.d.fire_rate_wait ?? 0), 0);
    expect(sum + 10).toBe(c.cast_delay);
  });

  it('live casts skip the bookkeeping', () => {
    resetWand(call, req(['LIGHT_BULLET'], ['lower_spread']));
    expect(castWand(call, 0, 2000, 1).cast.shot.steps).toBeUndefined();
  });
});

describe('analyser breakdowns', () => {
  const json = <T>(p: string) => JSON.parse(readFileSync(join(GAME, p), 'utf8')) as T;
  const analyzer = () => new Analyzer(json<Record<string, Projectile>>('data/projectiles.json'), json<Spell[]>('data/spells.json'));
  // Adds the additions, then applies the multipliers: what the "Damage from" list says.
  const fromSources = (p: ProjectileView) => {
    const add = p.sources.reduce((a, s) => a + s.damage + s.explosion, 0);
    return p.sources.reduce((m, s) => (s.mult !== undefined ? m * s.mult : m), add);
  };
  const all = (list: ProjectileView[]): ProjectileView[] => list.flatMap((p) => [p, ...all(p.trigger?.children ?? [])]);

  it('damage sources add up to each projectile’s damage, perks included', () => {
    const boost = perkBoost({ GLASS_CANNON: 1, CRITICAL_HIT: 2 });
    const r = runWand(call, req(['LIGHT_BULLET_TRIGGER', 'DAMAGE', 'BOMB'], ['lower_spread']));
    const { casts } = analyzer().run(r, boost);
    const ps = all(casts[0]!.projectiles);
    expect(ps.length).toBe(2);
    for (const p of ps) {
      expect(fromSources(p)).toBeCloseTo(p.total, 1);
      expect(p.sources.reduce((a, s) => a + s.crit, 0)).toBeCloseTo(p.critChance);
    }
    const spark = ps[0]!;
    expect(spark.sources[0]).toMatchObject({ base: true, damage: 3 });
    expect(spark.sources.find((s) => s.perkId === 'LOWER_SPREAD')?.damage).toBeCloseTo(12.5);
    expect(spark.sources.find((s) => s.perkId === 'GLASS_CANNON')?.mult).toBe(5);
    // Damage Plus sits in the payload's shot, so only the bomb gets it.
    expect(ps[1]!.depth).toBe(1);
    expect(ps[1]!.sources.some((s) => s.spell?.id === 'DAMAGE')).toBe(true);
    expect(spark.sources.some((s) => s.spell?.id === 'DAMAGE')).toBe(false);
  });

  it('timing rows add up to the cast delay and mana; carrier + payload = damage', () => {
    const r = runWand(call, req(['LIGHT_BULLET_TRIGGER', 'DAMAGE', 'LIGHT_BULLET'], ['lower_spread']));
    const { casts, summary } = analyzer().run(r);
    const c = casts[0]!;
    expect(c.timing.reduce((a, t) => a + t.delay, 0)).toBe(c.cast.cast_delay);
    expect(c.timing.reduce((a, t) => a + t.mana, 0)).toBeCloseTo(c.manaUsed);
    expect(c.timing[0]).toMatchObject({ wand: true, delay: 10, mana: 0 });
    expect(c.timing.map((t) => t.spell?.id ?? t.perkId)).toEqual([undefined, 'LIGHT_BULLET_TRIGGER', 'DAMAGE', 'LIGHT_BULLET', 'LOWER_SPREAD', 'LOWER_SPREAD']);
    expect(c.timing.filter((t) => t.payload).length).toBe(3);
    expect(c.payloadCount).toBe(1);
    expect(c.carrierDamage + c.payloadDamage).toBeCloseTo(c.damage);
    expect(summary.payloadDamage).toBeCloseTo(c.payloadDamage);
  });

  it('flight stats take the shot’s modifiers', () => {
    const plain = analyzer().run(runWand(call, req(['LIGHT_BULLET']))).casts[0]!.projectiles[0]!.stats;
    const fast = analyzer().run(runWand(call, req(['LIGHT_BULLET'], ['fast_projectiles']))).casts[0]!.projectiles[0]!.stats;
    expect(fast.speed[0]).toBeGreaterThan(plain.speed[0]);
    expect(plain.lifetime).toBeDefined();
  });
});
