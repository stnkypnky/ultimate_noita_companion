// How often each perk is offered in a run: the game's own perk.lua deck, run for thousands of seeds. Each run counts
// the 21 perks of the seven Holy Mountains (3 each), with no perks taken and no rerolls, and every unlock in place.
import type { LuaCall } from '../../src/sim/protocol.ts';
import { holyMountainPerks, setupSeed } from '../../src/seed/seed.ts';

export type PerkOdds = { any: number; first: number };

/** Spread-out seeds that are the same on every extract (Knuth's multiplicative hash). */
export const oddsSeed = (i: number) => ((i * 2654435761) % 2147483647) + 1;

export function perkOdds(call: LuaCall, materials: string, runs = 5000): Map<string, PerkOdds> {
  const any = new Map<string, number>();
  const first = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (let i = 0; i < runs; i++) {
    setupSeed(call, { seed: oddsSeed(i), materials, allUnlocked: true, flags: [] });
    const r = holyMountainPerks(call, [], 7, 0);
    for (const p of new Set(r.mountains.flat())) bump(any, p);
    for (const p of new Set(r.mountains[0] ?? [])) bump(first, p);
  }
  const round = (n: number) => Math.round((n / runs) * 10000) / 10000;
  return new Map([...any].map(([p, n]) => [p, { any: round(n), first: round(first.get(p) ?? 0) }]));
}
