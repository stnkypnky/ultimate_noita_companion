import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS, DEFAULT_WAND, decodeWand, encodeWand, resize, toSimRequest, type Wand } from '../src/features/wand/model.ts';
import type { Spell } from '../src/data/types.ts';

const wand: Wand = {
  ...DEFAULT_WAND,
  name: 'Bomb trigger',
  shuffle: true,
  spellsPerCast: 2,
  castDelay: -5,
  rechargeTime: 33,
  capacity: 5,
  spread: 2.5,
  spells: ['BURST_2', null, 'LIGHT_BULLET_TRIGGER', 'BOMB', null],
  alwaysCasts: ['DAMAGE'],
};

describe('wand share codes', () => {
  it('round-trips every field', async () => {
    const code = await encodeWand(wand);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decodeWand(code)).toEqual(wand);
  });

  it('rejects junk', async () => {
    await expect(decodeWand('nope')).rejects.toThrow();
  });
});

describe('toSimRequest', () => {
  const spell = (id: string, maxUses: number | null, neverUnlimited = false) => ({ id, maxUses, neverUnlimited }) as Spell;
  const byId = new Map([spell('BURST_2', null), spell('LIGHT_BULLET_TRIGGER', null), spell('BOMB', 3), spell('DAMAGE', null)].map((s) => [s.id, s]));

  it('skips empty slots and maps cards back to slots', () => {
    const { req, slotOfCard } = toSimRequest(wand, DEFAULT_OPTIONS, byId);
    expect(req.deck.map((d) => d.id)).toEqual(['BURST_2', 'LIGHT_BULLET_TRIGGER', 'BOMB']);
    expect(slotOfCard).toEqual([0, 2, 3]);
  });

  it('limits charges unless Unlimited spells is on', () => {
    expect(toSimRequest(wand, { ...DEFAULT_OPTIONS, unlimitedSpells: false }, byId).req.deck[2]!.uses).toBe(3);
    expect(toSimRequest(wand, { ...DEFAULT_OPTIONS, unlimitedSpells: true }, byId).req.deck[2]!.uses).toBe(-1);
  });

  it('resizes slot arrays', () => {
    expect(resize(['A', 'B'], 4)).toEqual(['A', 'B', null, null]);
    expect(resize(['A', 'B', 'C'], 2)).toEqual(['A', 'B']);
  });
});
