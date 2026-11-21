// The one-material alchemy lookup, against the real extracted reaction table.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Material, Reaction } from '../src/data/types.ts';
import { SECRET_MATERIALS } from '../src/data/spoilers.ts';
import { collapseVariants, lookupReactions, nameHints, tagLabel, unique } from '../src/features/alchemy/lookup.ts';
import { projectileDamage } from '../src/sim/analyze.ts';
import type { Projectile } from '../src/data/types.ts';

const GAME = join(import.meta.dirname, '../public/game/data');
const materials = JSON.parse(readFileSync(join(GAME, 'materials.json'), 'utf8')) as Material[];
const reactions = JSON.parse(readFileSync(join(GAME, 'reactions.json'), 'utf8')) as Reaction[];
const byId = new Map(materials.map((m) => [m.id, m]));
const noSecrets = (id: string) => !SECRET_MATERIALS.has(id);

describe('lightning damage', () => {
  // Wiki: Lightning Bolt deals 25 electric and a 125 explosion of radius 35.
  it("counts Lightning Bolt's explosion, not just its electric hit", () => {
    const projectiles = JSON.parse(readFileSync(join(GAME, 'projectiles.json'), 'utf8')) as Record<string, Projectile>;
    const d = projectileDamage(projectiles['data/entities/projectiles/deck/lightning.xml'], {});
    expect(d.hit).toBe(25);
    expect(d.explosion).toEqual({ damage: 125, radius: 35 });
  });
});

describe('alchemy lookup', () => {
  it('shows how Pheromone is made: Flummoxium + Berserkium', () => {
    const { makes } = lookupReactions(byId.get('magic_liquid_charm')!, reactions, noSecrets);
    expect(makes.map((r) => unique(r.inputs).sort())).toContainEqual(['magic_liquid_berserk', 'material_confusion']);
  });

  it('lists what a material reacts with, through its tags too', () => {
    const water = byId.get('water')!;
    const { mixes } = lookupReactions(water, reactions, noSecrets);
    expect(mixes.length).toBeGreaterThan(3);
    expect(mixes.every((r) => r.inputs.some((x) => x === 'water' || water.tags.includes(x)))).toBe(true);
  });

  it('keeps secret materials out unless they are visible', () => {
    // Healthium is a secret: nothing listed may name a secret material (tag reactions like "any magic liquid" are fine).
    const hp = byId.get('magic_liquid_hp_regeneration')!;
    const hidden = lookupReactions(hp, reactions, noSecrets);
    const named = [...hidden.makes, ...hidden.mixes].flatMap((r) => [...r.inputs, ...r.outputs]);
    expect(named.some((x) => SECRET_MATERIALS.has(x))).toBe(false);
    expect(hidden.makes).toEqual([]);
    expect(hidden.hidden).toBeGreaterThan(0);
    const all = lookupReactions(hp, reactions, () => true);
    expect(all.makes.length + all.mixes.length).toBe(hidden.makes.length + hidden.mixes.length + hidden.hidden);
    expect(all.hidden).toBe(0);
  });

  it('never lists a reaction under both headings', () => {
    for (const m of materials.slice(0, 200)) {
      const { makes, mixes } = lookupReactions(m, reactions, () => true);
      expect(makes.some((r) => mixes.includes(r))).toBe(false);
    }
  });

  it('names tags readably', () => {
    expect(tagLabel('[magic_liquid]')).toBe('Any magic liquid');
    expect(tagLabel('[meltable]_molten')).toBe('Molten form');
  });

  it('tells same-named materials apart (the game calls liquid fire "fire" too)', () => {
    const hints = nameHints(materials);
    expect(hints.get('liquid_fire')).toBe('liquid');
    expect(hints.get('fire_blue')).toBe('blue');
    expect(hints.has('fire')).toBe(false);
    expect(hints.has('magic_liquid_charm')).toBe(false);
  });

  it('words its hints for players, never with internal id words', () => {
    const hints = nameHints(materials);
    expect(hints.get('ice_glass')).toBe('loose');
    expect(hints.get('water_fading')).toBe('fades');
    expect(hints.has('rock_static_trip_secret')).toBe(false);
    for (const h of hints.values()) expect(h).not.toMatch(/static|box2d|_|secret|noedge|intro/);
  });

  it('shows variants a player cannot tell apart as one material', () => {
    const hints = nameHints(materials);
    const list = collapseVariants(materials.filter((m) => m.showInCreative), hints, (id) => SECRET_MATERIALS.has(id));
    const rocks = list.filter((m) => m.name.toLowerCase() === 'rock' && !hints.get(m.id));
    expect(rocks.map((m) => m.id)).toEqual(['rock_static']);
    // Every card left reads differently: name, state and hint.
    const keys = list.filter((m) => !SECRET_MATERIALS.has(m.id)).map((m) => `${m.name.toLowerCase()}|${m.state}|${hints.get(m.id) ?? ''}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(list.length).toBeLessThan(materials.filter((m) => m.showInCreative).length - 50);
  });
});
