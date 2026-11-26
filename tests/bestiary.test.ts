import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIGHTS, MOVES } from '../src/data/enemyFights.ts';
import type { Enemy } from '../src/data/types.ts';
import { behaviorLines, combatStyle, effectText, movesLabel } from '../src/features/bestiary/fightStyle.ts';
import { howToBeat } from '../src/features/bestiary/tactics.ts';
import { causeLabel, recordOf } from '../src/features/bestiary/record.ts';

const icon = { x: 0, y: 0, w: 1, h: 1 };
const enemy = (e: Partial<Enemy>): Enemy => ({ id: 'x', name: 'X', icon, hp: 25, ...e });

describe('combat style', () => {
  it('labels how a creature fights', () => {
    expect(combatStyle(enemy({ boss: true })).label).toBe('Boss');
    expect(combatStyle(enemy({ moves: { digs: true }, attacks: [{ kind: 'bite' }] })).label).toBe('Digger');
    expect(combatStyle(enemy({ attacks: [{ kind: 'ranged', range: 400 }] })).label).toBe('Sniper');
    expect(combatStyle(enemy({ attacks: [{ kind: 'ranged', range: 160 }] })).label).toBe('Shooter');
    expect(combatStyle(enemy({ attacks: [{ kind: 'dash' }] })).label).toBe('Charger');
    expect(combatStyle(enemy({ attacks: [{ kind: 'melee' }] })).label).toBe('Brawler');
    expect(combatStyle(enemy({ behavior: { helpsFriends: true }, attacks: [{ kind: 'ranged' }] })).label).toBe('Support');
    expect(combatStyle(enemy({})).label).toBe('Harmless');
  });

  it('never calls a creature that attacks harmless', () => {
    const enemies = JSON.parse(readFileSync(join(import.meta.dirname, '../public/game/data/enemies.json'), 'utf8')) as Enemy[];
    const byId = new Map(enemies.map((e) => [e.id, e]));
    for (const [id, f] of Object.entries(FIGHTS)) {
      const e = byId.get(id);
      expect(e, id).toBeDefined();
      // Once the extractor finds real attacks, the curated entry is stale: drop it.
      expect(e!.attacks?.length ?? 0, `${id} now has extracted attacks`).toBe(0);
      expect(f.source, id).toMatch(/^https:\/\/noita\.wiki\.gg\/wiki\//);
      expect(f.label, id).not.toBe('Harmless');
    }
    const label = (id: string) => combatStyle(byId.get(id)!).label;
    for (const id of ['monk', 'lukki', 'lukki_longleg', 'lukki_tiny', 'lukki_dark', 'icer', 'tank', 'tank_rocket', 'tentacler', 'boss_dragon', 'maggot_tiny']) {
      expect(label(id), id).not.toBe('Harmless');
    }
    // The ones that really don't attack stay harmless.
    for (const id of ['sheep', 'duck', 'deer', 'fish', 'fish_large', 'scorpion']) expect(label(id), id).toBe('Harmless');
  });

  it('says how creatures with no extracted movement get around', () => {
    const enemies = JSON.parse(readFileSync(join(import.meta.dirname, '../public/game/data/enemies.json'), 'utf8')) as Enemy[];
    const byId = new Map(enemies.map((e) => [e.id, e]));
    for (const [id, m] of Object.entries(MOVES)) {
      const e = byId.get(id);
      expect(e, id).toBeDefined();
      expect(m.source, id).toMatch(/^https:\/\/noita\.wiki\.gg\/wiki\//);
      // The curated label only fills in when the data says nothing, so it must be what the tile shows.
      expect(movesLabel(e!), `${id} now has extracted movement`).toBe(m.moves);
    }
    expect(movesLabel(byId.get('boss_dragon')!)).toBe('Flies, digs');
    expect(movesLabel(enemy({ moves: { flies: true } }))).toBe('Flies');
    expect(movesLabel(enemy({}))).toBe('Walks');
  });

  it('describes behavior in sentences', () => {
    const lines = behaviorLines(enemy({ attacks: [{ kind: 'ranged', range: 160 }], behavior: { sight: 400, flees: 40, minRange: 60, predicts: true, inflicts: ['effect_frozen_short'] } }));
    expect(lines).toContain('Spots prey up to 400 px away.');
    expect(lines).toContain("Shoots from up to 160 px, but not when you're closer than 60 px.");
    expect(lines).toContain('Sometimes runs away when hurt (40% chance).');
    expect(lines).toContain('Getting hit by it freezes you.');
    expect(effectText('effect_curse_cloud_01_temporary')).toBe('curses you');
    expect(effectText('effect_teleportation_enemy')).toBe('teleports you');
  });
});

describe('how to beat it', () => {
  it('reads weaknesses, immunities and tricks', () => {
    const t = howToBeat(enemy({ resist: { fire: 1.5, drill: 0.1, ice: 0 }, attacks: [{ kind: 'melee' }], behavior: { explodes: true } })).map((x) => x.text);
    expect(t).toContain('Weak to Fire (150%).');
    expect(t).toContain('Ice damage does nothing to it.');
    expect(t).toContain('Shrugs off Drill (10%).');
    expect(t).toContain('It can only hurt you up close: keep your distance and shoot.');
    expect(t).toContain('Stay back when it dies: it explodes.');
    expect(t).toContain('Freeze it, then any melee hit (even a kick) kills it outright.');
  });

  it("doesn't offer the frozen-melee kill against bosses or the freeze-proof", () => {
    const tip = 'Freeze it, then any melee hit (even a kick) kills it outright.';
    expect(howToBeat(enemy({ boss: true })).map((x) => x.text)).not.toContain(tip);
    expect(howToBeat(enemy({ immune: ['Freezing'] })).map((x) => x.text)).not.toContain(tip);
  });
});

describe('your record', () => {
  it('groups how it died and finds the runs it ended', () => {
    const r = recordOf(
      'worm_skull',
      { died: 3, killedYou: 0, byYou: { $damage_projectile: 2, $damage_physicshit: 1 }, byWorld: { 'damage from material: acid': 1 } },
      [
        { date: '2026-11-19T18:49:13', seed: 7, killer: 'worm_skull', cause: 'bite' },
        { date: '2026-11-18T10:00:00', seed: 8, cause: 'explosion' },
      ],
    )!;
    expect(r.killedYou).toBe(1);
    expect(r.youKilled).toBe(3);
    expect(r.byYou).toEqual([
      { key: 'projectile', n: 2 },
      { key: 'physics', n: 1 },
    ]);
    expect(r.byWorld).toEqual([{ key: 'acid', n: 1 }]);
    expect(r.deaths).toHaveLength(1);
    expect(recordOf('rat', undefined, [])).toBeNull();
    expect(causeLabel('$damage_radioactive')).toBe('toxic');
  });
});
