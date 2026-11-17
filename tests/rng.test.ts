// The engine's RNG port, against the values noita-tools checks (random.spec.ts, taken from the game).
import { describe, expect, it } from 'vitest';
import { NoitaRandom, roundHalfEven } from '../src/sim/rng.ts';
import { createLuaHost } from '../tools/extract/lua.ts';

describe('Noita RNG', () => {
  const cases = [
    { x: 1475.5, y: 827, ans: [65, 40641, 57806, 3] },
    { x: 1385.5, y: 177, ans: [64, 57621, 39985, 12] },
    { x: 185.5, y: 107, ans: [69, 86000, 94607, 9] },
  ];
  for (const [i, c] of cases.entries()) {
    it(`SetRandomSeed + Random match the game (#${i})`, () => {
      const r = new NoitaRandom(1674055821);
      r.SetRandomSeed(c.x, c.y);
      expect([r.Random(0, 100), r.Random(0, 100000), r.Random(200, 100000), r.Random(1, 12)]).toEqual(c.ans);
    });
  }

  it('is repeatable per seed and position, and differs between seeds', () => {
    const roll = (seed: number) => {
      const r = new NoitaRandom(seed);
      r.SetRandomSeed(100, 200);
      return [r.Random(), r.Random(1, 6), r.Random(1, 6)];
    };
    expect(roll(123)).toEqual(roll(123));
    expect(roll(123)).not.toEqual(roll(124));
    const v = roll(5)[0]!;
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });

  it("the game's Lua gets these numbers through the fake engine", async () => {
    const host = await createLuaHost(() => undefined);
    host.call('sim_set_world_seed', 1674055821);
    await host.lua.doString('SetRandomSeed(1475.5, 827) __r = { Random(0, 100), Random(0, 100000), Random(200, 100000), Random(1, 12), GameGetSeed() }');
    const r = host.lua.global.get('__r') as number[];
    expect([...Object.values(r)]).toEqual([65, 40641, 57806, 3, 1674055821]);
    host.close();
  });

  it('rounds float bounds half to even, like the engine', () => {
    expect([roundHalfEven(0.5), roundHalfEven(1.5), roundHalfEven(2.5), roundHalfEven(2.6)]).toEqual([0, 2, 2, 3]);
  });
});
