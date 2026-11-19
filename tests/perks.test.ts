// Perks in the simulator: the table matches the game's perk_list.lua, gun.lua gets their shot modifiers, and the
// engine-side ones (Glass Cannon, Living on the Edge, Critical Hit +) scale damage where it's worked out.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLuaHost, loadGun, type LuaHost } from '../tools/extract/lua.ts';
import { runWand } from '../src/sim/protocol.ts';
import { PERK_EFFECTS, damageMultiplier, perkBoost, shotModifiers, critBonus } from '../src/sim/perks.ts';
import { Analyzer, projectileDamage } from '../src/sim/analyze.ts';
import { decodeWand, encodeWand, DEFAULT_WAND, toSimRequest, DEFAULT_OPTIONS } from '../src/features/wand/model.ts';
import { toBuilderWand } from '../src/features/live/toBuilder.ts';
import { RangeWorld, type RangeData } from '../src/features/range/world.ts';
import type { EntityVisual, Material, Projectile, RangeKit, Reaction, Spell } from '../src/data/types.ts';
import type { SimRequest } from '../src/sim/types.ts';

const GAME = join(import.meta.dirname, '../public/game');
const json = <T>(p: string) => JSON.parse(readFileSync(join(GAME, p), 'utf8')) as T;
let host: LuaHost;
const call = (fn: string, ...args: unknown[]) => host.call(fn, ...args);

beforeAll(async () => {
  host = await createLuaHost((p) => (existsSync(join(GAME, 'lua', p)) ? readFileSync(join(GAME, 'lua', p), 'utf8') : undefined));
  await loadGun(host);
});

const req = (deck: string[], modifiers: string[] = []): SimRequest => ({
  wand: { shuffle: false, spellsPerCast: 1, castDelay: 10, rechargeTime: 20, manaMax: 2000, manaChargeSpeed: 2000, capacity: deck.length, spread: 0, speedMultiplier: 1 },
  deck: deck.map((id) => ({ id, uses: -1 })),
  alwaysCasts: [],
  modifiers,
  options: { maxCasts: 1, stopOnReload: true, hp: 100, maxHp: 100, money: 0, frame: 0 },
});

describe('perk table', () => {
  it("matches perk_list.lua's ShotEffectComponent extra modifiers", () => {
    const lines = readFileSync(join(GAME, 'lua/data/scripts/perks/perk_list.lua'), 'utf8').split('\n');
    const fromGame: Record<string, string[]> = {};
    let id = '';
    for (const l of lines) {
      const m = /id = "([A-Z_0-9]+)"/.exec(l);
      if (m) id = m[1]!;
      const e = /extra_modifier = "(\w+)"/.exec(l);
      if (e) (fromGame[id] ??= []).push(e[1]!);
    }
    const ours = Object.fromEntries(Object.entries(PERK_EFFECTS).flatMap(([k, v]) => (v.mods ? [[k, v.mods]] : [])));
    expect(ours).toEqual(fromGame);
  });

  it('adds a modifier per pickup, Personal Laser only once', () => {
    expect(shotModifiers({ DUPLICATE_PROJECTILE: 2, LOWER_SPREAD: 1 })).toEqual(['lower_spread', 'duplicate_projectile', 'duplicate_projectile']);
    expect(shotModifiers({ PERSONAL_LASER: 3 })).toEqual(['slow_firing']);
    expect(shotModifiers(undefined)).toEqual([]);
  });

  it('chains damage multipliers as the wiki describes', () => {
    expect(damageMultiplier({ GLASS_CANNON: 1 })).toBe(5);
    expect(damageMultiplier({ GLASS_CANNON: 3 })).toBe(25); // two count
    expect(damageMultiplier({ GLASS_CANNON: 2, LOW_HP_DAMAGE_BOOST: 1 }, true)).toBe(75);
    expect(damageMultiplier({ GLASS_CANNON: 2, LOW_HP_DAMAGE_BOOST: 1 }, false)).toBe(25);
    expect(damageMultiplier({ LOW_HP_DAMAGE_BOOST: 5 }, true)).toBe(27);
    expect(critBonus({ CRITICAL_HIT: 2 })).toBe(20);
  });
});

describe('perks in the cast simulator (real gun.lua)', () => {
  it('Concentrated Spells: less spread, more damage, longer cast delay, payloads included', () => {
    const plain = runWand(call, req(['LIGHT_BULLET_TRIGGER', 'LIGHT_BULLET'])).casts[0]!;
    const perk = runWand(call, req(['LIGHT_BULLET_TRIGGER', 'LIGHT_BULLET'], ['lower_spread'])).casts[0]!;
    const n = (s: Record<string, unknown>, k: string) => (typeof s[k] === 'number' ? (s[k] as number) : 0);
    expect(n(perk.shot.state, 'damage_projectile_add') - n(plain.shot.state, 'damage_projectile_add')).toBeCloseTo(0.5);
    expect(n(perk.shot.state, 'spread_degrees') - n(plain.shot.state, 'spread_degrees')).toBe(-25);
    const payload = perk.shot.projectiles[0]!.trigger!.shot;
    expect(n(payload.state, 'damage_projectile_add')).toBeCloseTo(0.5);
    // +2 frames per projectile spell played: the carrier and its payload.
    expect(perk.cast_delay - plain.cast_delay).toBe(4);
  });

  it('changes nothing without perks, and ignores names gun.lua does not have', () => {
    const a = runWand(call, req(['LIGHT_BULLET']));
    const b = runWand(call, req(['LIGHT_BULLET'], ['not_a_modifier']));
    expect(b.casts[0]!.shot).toEqual(a.casts[0]!.shot);
  });
});

describe('perks on a wand', () => {
  it('ride along in share codes; old codes have none', async () => {
    const w = { ...DEFAULT_WAND, spells: ['LIGHT_BULLET', ...DEFAULT_WAND.spells.slice(1)], perks: { LOWER_SPREAD: 1, CRITICAL_HIT: 2 }, lowHp: true };
    const back = await decodeWand(await encodeWand(w));
    expect(back.perks).toEqual({ LOWER_SPREAD: 1, CRITICAL_HIT: 2 });
    expect(back.lowHp).toBe(true);
    const old = await decodeWand(await encodeWand({ ...DEFAULT_WAND }));
    expect(old.perks).toBeUndefined();
  });

  it("a run's wand brings the run's spell-changing perks into the request", () => {
    const live = { name: 'Wand', active: true, shuffle: false, spellsPerCast: 1, castDelay: 10, rechargeTime: 20, manaMax: 100, manaChargeSpeed: 50, capacity: 2, spread: 0, speedMultiplier: 1, spells: [{ id: 'LIGHT_BULLET', slot: 0 }], alwaysCasts: [] };
    const w = toBuilderWand(live, [
      { id: 'LOWER_SPREAD', count: 1 },
      { id: 'BREATH_UNDERWATER', count: 1 },
    ]);
    expect(w.perks).toEqual({ LOWER_SPREAD: 1 });
    const spells = json<Spell[]>('data/spells.json');
    expect(toSimRequest(w, DEFAULT_OPTIONS, new Map(spells.map((s) => [s.id, s]))).req.modifiers).toEqual(['lower_spread']);
  });

  it('Glass Cannon and Critical Hit + scale the analysed damage', () => {
    const projectiles = json<Record<string, Projectile>>('data/projectiles.json');
    const base = projectiles['data/entities/projectiles/deck/light_bullet.xml'];
    const plain = projectileDamage(base, {});
    const boosted = projectileDamage(base, {}, perkBoost({ GLASS_CANNON: 1, CRITICAL_HIT: 1 }));
    expect(boosted.hit).toBeCloseTo(plain.hit * 5);
    expect(boosted.critChance).toBe(plain.critChance + 10);
    const a = new Analyzer(projectiles, json<Spell[]>('data/spells.json'));
    const r = runWand(call, req(['LIGHT_BULLET']));
    expect(a.run(r, perkBoost({ GLASS_CANNON: 1 })).summary.damage).toBeCloseTo(a.run(r).summary.damage * 5);
  });

  it('Glass Cannon multiplies what lands in the test range', () => {
    const materials = json<Material[]>('data/materials.json');
    const data: RangeData = {
      projectiles: json<Record<string, Projectile>>('data/projectiles.json'),
      visuals: json<Record<string, EntityVisual>>('data/visuals.json'),
      materialColor: new Map(materials.map((m) => [m.id, m.color])),
      rockDurability: materials.find((m) => m.id === 'rock_static')?.durability ?? 0,
      kit: json<RangeKit>('data/range_kit.json'),
      materials,
      reactions: json<Reaction[]>('data/reactions.json'),
    };
    const shoot = (glass: boolean) => {
      const w = new RangeWorld(data);
      w.setDummyDistance(60);
      if (glass) w.boost = perkBoost({ GLASS_CANNON: 1 });
      const d = w.dummy;
      w.spawn('data/entities/projectiles/deck/light_bullet.xml', d.x - 30, d.y - d.h / 2, 600, 0);
      for (let i = 0; i < 20; i++) w.step();
      return w.totalDamage;
    };
    // No crits, so the two shots differ only by the perk.
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    try {
      const plain = shoot(false);
      expect(plain).toBeGreaterThan(0);
      expect(shoot(true)).toBeCloseTo(plain * 5);
    } finally {
      rnd.mockRestore();
    }
  });
});
