// Where materials are found (tools/extract/materialSources.ts → data/material_sources.json).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { luaTableMaterials, stripLuaComments } from '../tools/extract/materialSources.ts';
import type { MaterialSources } from '../src/data/types.ts';

const sources = JSON.parse(readFileSync(join(import.meta.dirname, '../public/game/data/material_sources.json'), 'utf8')) as MaterialSources;
const has = (id: string, biome: string, how: string) => !!sources[id]?.biomes?.some((w) => w.biome === biome && w.how === how);
const odds = (id: string, kind: string) => sources[id]?.containers?.find((c) => c.kind === kind)?.odds ?? 0;

describe('material sources', () => {
  it("each flask or pouch's odds add up to 100%", () => {
    const sums: Record<string, number> = {};
    for (const s of Object.values(sources)) for (const c of s.containers ?? []) sums[c.kind] = (sums[c.kind] ?? 0) + c.odds;
    expect(Object.keys(sums).sort()).toEqual(['alchemist', 'chestFlask', 'flask', 'pouch', 'starting']);
    for (const [k, v] of Object.entries(sums)) expect(v, k).toBeCloseTo(1, 6);
  });

  it('random flasks: magic liquids 75%, plain ones 25%', () => {
    // potion.lua: Random(0,100) <= 75 picks one of 12 magic liquids (after the rare hp-regen, purifying, weakness rolls).
    expect(odds('water', 'flask')).toBeCloseTo(25 / 101 / 11, 6);
    expect(odds('magic_liquid_charm', 'flask')).toBeGreaterThan(0.06);
    expect(odds('magic_liquid_hp_regeneration', 'flask')).toBeLessThan(0.001);
  });

  it('powder pouches hold metals and powders', () => {
    expect(odds('copper', 'pouch')).toBeCloseTo(76 / 101 / 7, 6);
    expect(odds('sand', 'pouch')).toBeCloseTo(25 / 101 / 7, 6);
  });

  it('places: Mines caves have water and oil, coal in pockets, the Lake is water', () => {
    expect(has('water', 'coalmine', 'caves')).toBe(true);
    expect(has('oil', 'coalmine', 'caves')).toBe(true);
    expect(has('coal', 'coalmine', 'pockets')).toBe(true);
    expect(has('water', 'lake', 'ground')).toBe(true);
  });

  it('creatures: robots bleed oil, ants bleed slime', () => {
    expect(sources.oil?.bleeds).toContain('tank');
    expect(sources.slime?.bleeds).toContain('ant');
  });

  it('reads Lua material tables without their commented-out entries', () => {
    const src = 'potions = {\n { material="a" },\n --[[\n { material="b" },\n ]]--\n -- { material="c" },\n { material="d" },\n}\nother = { { material="e" } }';
    expect(luaTableMaterials(src, 'potions')).toEqual(['a', 'd']);
    expect(stripLuaComments('x = 1 -- note')).toBe('x = 1 ');
  });
});
