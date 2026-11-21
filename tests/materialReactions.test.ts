// Reactions on a material's page read from its side: groups resolved the way the engine substitutes them.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GROUP_LABEL, groupLabel, groupMembers, parseGroup } from '../src/data/materialGroups.ts';
import { reactionsOf, type ReactionRow, type Side } from '../src/features/materials/reactions.ts';
import type { Material, Reaction } from '../src/data/types.ts';

const read = <T,>(f: string) => JSON.parse(readFileSync(join(import.meta.dirname, '../public/game/data', f), 'utf8')) as T;
const materials = read<Material[]>('materials.json');
const reactions = read<Reaction[]>('reactions.json');
const byId = new Map(materials.map((m) => [m.id, m]));
const ctx = { materials, byId };

const name = (s: Side) => (s.kind === 'material' ? s.id : s.pattern);
const text = (r: ReactionRow) => `${r.inputs.map(name).join(' + ')} = ${r.outputs.map(name).join(' + ')}`;
const of = (id: string) => reactionsOf(byId.get(id)!, reactions, ctx);

describe('material reactions', () => {
  it('every group a reaction uses has a plain name', () => {
    const patterns = new Set(reactions.flatMap((r) => [...r.inputs, ...r.outputs]).filter((p) => p.startsWith('[')));
    const tags = new Set([...patterns].map((p) => parseGroup(p)!.tag));
    expect([...tags].filter((t) => !GROUP_LABEL[t])).toEqual([]);
    // Suffix groups read as words too, not "[meltable]_molten".
    for (const p of patterns) expect(groupLabel(p), p).not.toMatch(/[[\]_]/);
  });

  it('Water meets fire as itself, and the fire stays fire', () => {
    const rows = of('water').asInput.map(text);
    expect(rows).toContain('water + [fire] = steam + [fire]');
    // A group of one is that material: [lava] is lava.
    expect(rows).toContain('water + lava = steam + rock_static');
  });

  it('a molten form resolves to the material itself', () => {
    const rows = of('wax').asInput.map(text);
    expect(rows.some((r) => r.startsWith('wax + lava = wax_molten'))).toBe(true);
    const molten = of('wax_molten').asInput.map(text);
    expect(molten).toContain('wax_molten + water = wax + steam');
  });

  it('Molten gold is listed as made from gold', () => {
    expect(of('gold_molten').asOutput.some((r) => r.inputs.some((s) => s.kind === 'material' && s.id === 'gold'))).toBe(true);
  });

  it('the same reaction written both ways is one row', () => {
    const rows = of('water').asInput.map(text);
    expect(rows.length).toBe(new Set(rows).size);
  });

  it('Mimicium takes on any liquid it touches', () => {
    expect(of('water').asInput.map(text)).toContain('water + mimic_liquid = water + water');
    expect(groupMembers('[any_liquid]', materials, byId).some((m) => m.id === 'water')).toBe(true);
  });
});
