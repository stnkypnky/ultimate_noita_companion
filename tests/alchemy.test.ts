import { describe, expect, it } from 'vitest';
import { alchemyRecipes } from '../src/features/alchemy/aplc.ts';

// Known recipes published on the Noita Wiki's Lively Concoction page.
describe('LC/AP recipes', () => {
  it('seed 1517558277: Pheromone + Blood + Coal', () => {
    expect(alchemyRecipes(1517558277).lc.materials.slice().sort()).toEqual(['blood', 'coal', 'magic_liquid_charm']);
  });

  it('seed 403539766: Water + Chaotic Polymorphine + Concentrated Mana', () => {
    expect(alchemyRecipes(403539766).lc.materials.slice().sort()).toEqual(['magic_liquid_mana_regeneration', 'magic_liquid_random_polymorph', 'water']);
  });

  it('gives three distinct ingredients and a 10–100% probability', () => {
    for (const seed of [1, 42, 123456789, 4294967295]) {
      const { lc, ap } = alchemyRecipes(seed);
      for (const r of [lc, ap]) {
        expect(new Set(r.materials).size).toBe(3);
        expect(r.probability).toBeGreaterThanOrEqual(10);
        expect(r.probability).toBeLessThanOrEqual(100);
      }
    }
  });
});
