// Biome modifier notes: one for every modifier the game can roll, each naming real creatures and materials, with
// the banner the game shows shipped.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Enemy, Material } from '../src/data/types.ts';
import { BIOME_MODIFIERS } from '../src/data/biomeModifiers.ts';

const GAME = join(import.meta.dirname, '../public/game');
const lua = readFileSync(join(GAME, 'lua/data/scripts/biome_modifiers.lua'), 'utf8');
const enemies = new Set((JSON.parse(readFileSync(join(GAME, 'data/enemies.json'), 'utf8')) as Enemy[]).map((e) => e.id));
const materials = new Set((JSON.parse(readFileSync(join(GAME, 'data/materials.json'), 'utf8')) as Material[]).map((m) => m.id));
// The modifiers in the biome_modifiers table (before its commented-out ideas), and their banners.
const table = lua.slice(lua.indexOf('biome_modifiers ='), lua.indexOf('--[[-- dry'));
const ids = [...table.matchAll(/\bid\s*=\s*"(\w+)"/g)].map((m) => m[1]!);
const banners = [...lua.matchAll(/ui_decoration_file\s*=\s*"[^"]*\/(\w+)\.png"/g)].map((m) => m[1]!);

describe('biome modifier notes', () => {
  it('cover every modifier the game can roll', () => {
    expect(ids.length).toBeGreaterThan(20);
    for (const id of ids) expect(BIOME_MODIFIERS[id], id).toBeDefined();
  });

  it('name real creatures and materials', () => {
    for (const [id, m] of Object.entries(BIOME_MODIFIERS)) {
      expect(m.effects.length, id).toBeGreaterThan(0);
      for (const e of m.effects) {
        for (const c of e.creatures ?? []) expect(enemies.has(c), `${id}: ${c}`).toBe(true);
        if ('material' in e.icon) expect(materials.has(e.icon.material), `${id}: ${e.icon.material}`).toBe(true);
      }
    }
  });

  it("ship the game's banners", () => {
    for (const b of banners) expect(existsSync(join(GAME, `ui/modifiers/${b}.png`)), b).toBe(true);
  });
});
