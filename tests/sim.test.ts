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

  it('gives a modifier-made trigger the next spell as its payload (Add Trigger)', () => {
    const [p] = sim(['ADD_TRIGGER', 'LIGHT_BULLET', 'BOMB']).casts[0]!.shot.projectiles;
    expect(p!.file.endsWith(SPARK)).toBe(true);
    expect(p!.trigger?.kind).toBe('hit');
    expect(files(p!.trigger!.shot)).toEqual(['bomb.xml']);
  });

  it('uses the right trigger kind for timer and expiration variants', () => {
    const timer = sim(['LIGHT_BULLET_TIMER', 'BOMB']).casts[0]!.shot.projectiles[0]!.trigger;
    expect(timer?.kind).toBe('timer');
    expect(timer?.delay).toBeGreaterThan(0);
    expect(sim(['ADD_DEATH_TRIGGER', 'LIGHT_BULLET', 'BOMB']).casts[0]!.shot.projectiles[0]!.trigger?.kind).toBe('death');
  });

  it('casts the next spell several times with Divide By', () => {
    expect(files(sim(['DIVIDE_2', 'LIGHT_BULLET']).casts[0]!.shot)).toEqual([SPARK, SPARK]);
    expect(sim(['DIVIDE_10', 'LIGHT_BULLET']).casts[0]!.shot.projectiles).toHaveLength(10);
  });

  it('copies spells from elsewhere in the wand with the Greek letters', () => {
    // Omega casts a copy of every spell in the wand.
    const omega = sim(['LIGHT_BULLET', 'BOMB', 'OMEGA'], { spc: 1 }).casts.find((c) => c.played.includes('OMEGA'))!;
    expect(files(omega.shot)).toEqual(expect.arrayContaining([SPARK, 'bomb.xml']));
    // Alpha casts a copy of the first spell.
    const alpha = sim(['BOMB', 'LIGHT_BULLET', 'ALPHA']).casts.find((c) => c.played.includes('ALPHA'))!;
    expect(files(alpha.shot)).toEqual(['bomb.xml']);
  });

  it('lets Requirement spells depend on the caster (low health)', () => {
    const run = (hp: number) => {
      host.call('sim_reset', 1, false, 20, 3, 10, 0, 1, 1000, 100, 1000, hp, 100, 0, 0);
      for (const id of ['IF_HP', 'LIGHT_BULLET', 'BOMB']) host.call('sim_add_card', id, -1);
      return (JSON.parse(host.call<string>('sim_run', 6, false)) as SimResult).casts.flatMap((c) => files(c.shot));
    };
    expect(run(100)).not.toEqual(run(10));
  });

  it('runs a limited spell out of charges, then skips it', () => {
    host.call('sim_reset', 1, false, 0, 2, 0, 0, 1, 10000, 10000, 10000, 100, 100, 0, 0);
    host.call('sim_add_card', 'BOMB', 3);
    host.call('sim_add_card', 'LIGHT_BULLET', -1);
    const r = JSON.parse(host.call<string>('sim_run', 10, false)) as SimResult;
    expect(r.casts.flatMap((c) => files(c.shot)).filter((f) => f === 'bomb.xml')).toHaveLength(3);
  });

  it('casts every spell exactly once per round on a shuffle wand', () => {
    const r = sim(['LIGHT_BULLET', 'BOMB', 'BULLET', 'GRENADE'], { shuffle: true, casts: 4 });
    expect(r.casts.flatMap((c) => c.played).sort()).toEqual(['BOMB', 'BULLET', 'GRENADE', 'LIGHT_BULLET']);
  });

  describe('Plicate spells (copy the next projectile)', () => {
    const shot = (deck: string[], o: Opts = {}) => sim(deck, o).casts[0]!;

    it('adds copies of the next projectile and sets the formation angle', () => {
      const cases: [string, number, number][] = [
        ['I_SHOT', 2, 180],
        ['Y_SHOT', 2, 45],
        ['T_SHOT', 3, 90],
        ['W_SHOT', 3, 20],
        ['QUAD_SHOT', 4, 180],
        ['PENTA_SHOT', 5, 180],
        ['HEXA_SHOT', 6, 180],
      ];
      for (const [id, total, pattern] of cases) {
        const c = shot([id, 'LIGHT_BULLET']);
        expect(files(c.shot), id).toEqual(Array(total).fill(SPARK));
        expect(c.shot.state.pattern_degrees, id).toBe(pattern);
      }
    });

    it('charges the copied spell\'s mana for every copy', () => {
      // Iplicate 40 + Spark bolt 5 for the copy + 5 for the original.
      expect(shot(['I_SHOT', 'LIGHT_BULLET'], { mana: 1000 }).mana_after).toBe(1000 - 50);
      // Heplicate 130 + 6 × Bomb 25.
      expect(shot(['HEXA_SHOT', 'BOMB'], { mana: 1000 }).mana_after).toBe(1000 - 130 - 150);
    });

    it('stops copying when mana runs out', () => {
      // 40 for Heplicate leaves 30: one Bomb copy (25), then not enough for more or for the original.
      const c = shot(['HEXA_SHOT', 'BOMB'], { mana: 70, casts: 1 });
      expect(files(c.shot)).toEqual(['bomb.xml']);
    });

    it('copies only the bare projectile: a trigger\'s copy carries no payload', () => {
      const ps = shot(['I_SHOT', 'LIGHT_BULLET_TRIGGER', 'BOMB']).shot.projectiles;
      expect(ps).toHaveLength(2);
      expect(ps.filter((p) => p.trigger)).toHaveLength(1);
    });

    it('copies nothing when the next spell is not a projectile', () => {
      const c = shot(['I_SHOT', 'DAMAGE', 'LIGHT_BULLET']);
      expect(files(c.shot)).toEqual([SPARK]);
    });

    it('copies every projectile of a multi-projectile spell (Triplicate bolt: 3 per copy)', () => {
      expect(shot(['I_SHOT', 'BUCKSHOT']).shot.projectiles).toHaveLength(6);
    });

    it('copies Matosade as a real Giant Worm (its related projectile), not as worm rain', () => {
      const ps = files(shot(['I_SHOT', 'WORM_RAIN']).shot);
      expect(ps).toEqual(expect.arrayContaining(['worm_big.xml', 'worm_rain.xml']));
    });
  });

  describe('Greek letter spells', () => {
    const greek = (deck: string[], id: string, o: Opts = {}) => sim(deck, { casts: 6, stop: false, ...o }).casts.find((c) => c.played.includes(id))!;

    it('Gamma copies the last spell in the wand', () => {
      expect(files(greek(['GAMMA', 'LIGHT_BULLET', 'BOMB'], 'GAMMA').shot)).toEqual(['bomb.xml']);
    });

    it('Tau copies the next two spells', () => {
      // Tau's copies come first, then the wand carries on drawing as normal.
      const c = greek(['TAU', 'BOMB', 'LIGHT_BULLET'], 'TAU');
      expect(files(c.shot)).toEqual(expect.arrayContaining(['bomb.xml', SPARK]));
    });

    it('Mu copies every modifier in the wand onto the shot', () => {
      // Mu leads the cast, so the Damage Plus on the shot can only be Mu's copy of the one later in the wand.
      const c = greek(['MU', 'BULLET', 'DAMAGE', 'LIGHT_BULLET'], 'MU');
      expect(c.played[0]).toBe('MU');
      expect(c.shot.state.damage_projectile_add).toBeCloseTo(0.4);
    });

    it('Phi copies every projectile in the wand', () => {
      const c = greek(['LIGHT_BULLET', 'BOMB', 'PHI', 'BULLET'], 'PHI');
      expect(files(c.shot)).toEqual(expect.arrayContaining([SPARK, 'bomb.xml']));
    });

    it('Sigma copies every static projectile in the wand', () => {
      const c = greek(['FREEZE_FIELD', 'LIGHT_BULLET', 'SIGMA', 'BULLET'], 'SIGMA');
      expect(c.shot.projectiles.length).toBeGreaterThan(1);
    });

    it('Omega and Alpha do not copy themselves or each other into infinity', () => {
      const r = sim(['OMEGA', 'ALPHA', 'LIGHT_BULLET'], { casts: 4, stop: false });
      for (const c of r.casts) expect(c.shot.projectiles.length).toBeLessThan(50);
    });

    it('Zeta copies nothing without other wands in the inventory', () => {
      // Zeta picks a random spell from the player's other wands; none are carried here.
      const c = greek(['ZETA', 'LIGHT_BULLET'], 'ZETA');
      expect(files(c.shot)).toEqual([SPARK]);
    });

    it('the stationary Pollen engine: Add Trigger fails on a spent Black Hole, so Divide By 10 makes 11 copies of the modifiers', () => {
      // reddit "A vanilla guide to 2D/3D projection wands"; wiki: Add Trigger, Useful Failure.
      const deck = ['BURST_3', 'POLLEN', 'DIVIDE_10', 'ADD_TRIGGER', 'HEAVY_SHOT', 'DECELERATING_SHOT', 'BLACK_HOLE', 'ADD_TRIGGER', 'LANCE_HOLY', 'POLLEN'];
      host.call('sim_reset', 1, false, 20, deck.length, 10, 0, 1, 10000, 1000, 10000, 100, 100, 0, 0);
      for (const id of deck) host.call('sim_add_card', id, id === 'BLACK_HOLE' ? 0 : -1);
      const shot = (JSON.parse(host.call<string>('sim_run', 1, false)) as SimResult).casts[0]!.shot;
      const extras = String(shot.state.extra_entities).split(',').filter(Boolean);
      expect(extras.filter((e) => e.endsWith('heavy_shot.xml'))).toHaveLength(11);
      expect(extras.filter((e) => e.endsWith('decelerating_shot.xml'))).toHaveLength(11);
      expect(files(shot)).toEqual(['pollen.xml', 'lance_holy.xml']);
      expect(shot.projectiles[1]!.trigger?.kind).toBe('hit');
      expect(files(shot.projectiles[1]!.trigger!.shot)).toEqual(['pollen.xml']);
    });

    it('Zeta copies a spell from another carried wand (saved builds stand in for them)', () => {
      const run = (others: string) => {
        host.call('sim_reset', 1, false, 20, 2, 10, 0, 1, 1000, 100, 1000, 100, 100, 0, 0);
        host.call('sim_set_other_wands', others);
        for (const id of ['ZETA', 'LIGHT_BULLET']) host.call('sim_add_card', id, -1);
        return (JSON.parse(host.call<string>('sim_run', 1, false)) as SimResult).casts[0]!;
      };
      expect(files(run('BOMB').shot)).toEqual(['bomb.xml', SPARK]);
      // Only the other wands count; spells come from any of them.
      for (let i = 0; i < 5; i++) expect(['bomb.xml', 'rocket.xml']).toContain(files(run('BOMB;ROCKET').shot)[0]);
      // An empty other wand gives it nothing to copy, and a reset forgets the other wands.
      expect(files(run('').shot)).toEqual([SPARK]);
      expect(files(greek(['ZETA', 'LIGHT_BULLET'], 'ZETA').shot)).toEqual([SPARK]);
    });
  });

  it('casts music notes as plain short-lived projectiles', () => {
    const c = sim(['BURST_4', 'KANTELE_G', 'KANTELE_D', 'KANTELE_E', 'KANTELE_D']).casts[0]!;
    expect(files(c.shot)).toEqual(['kantele_g.xml', 'kantele_d.xml', 'kantele_e.xml', 'kantele_d.xml']);
  });

  it('heals with Healing bolt copied by Divide By', () => {
    expect(files(sim(['DIVIDE_2', 'HEAL_BULLET']).casts[0]!.shot)).toEqual(['heal_bullet.xml', 'heal_bullet.xml']);
  });

  it('does not call unimplemented engine functions for common spells', () => {
    const r = sim(['BURST_3', 'LIGHT_BULLET', 'DAMAGE', 'BOMB', 'LIGHT_BULLET_TRIGGER', 'BULLET']);
    expect(r.missing).toEqual([]);
  });
});
