import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS, DEFAULT_WAND, chargesAfter, decodeWand, encodeWand, resize, sameCharges, toSimRequest, type Wand } from '../src/features/wand/model.ts';
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

  it('uses the charges left in each slot, down to 0 (a spent spell, for Add Trigger’s useful failure)', () => {
    const limited = { ...DEFAULT_OPTIONS, unlimitedSpells: false };
    const spent: Wand = { ...wand, charges: [null, null, null, 0, null] };
    expect(toSimRequest(spent, limited, byId).req.deck[2]!.uses).toBe(0);
    expect(toSimRequest({ ...wand, charges: [null, null, null, 2, null] }, limited, byId).req.deck[2]!.uses).toBe(2);
    // Out-of-range values are clamped; Unlimited spells still overrides them.
    expect(toSimRequest({ ...wand, charges: [null, null, null, 9, null] }, limited, byId).req.deck[2]!.uses).toBe(3);
    expect(toSimRequest(spent, DEFAULT_OPTIONS, byId).req.deck[2]!.uses).toBe(-1);
  });

  it('turns the live deck’s spent charges back into slot charges (full = null)', () => {
    const { slotOfCard } = toSimRequest(wand, { ...DEFAULT_OPTIONS, unlimitedSpells: false }, byId);
    const uses = [
      { inv: 1, uses: -1 },
      { inv: 2, uses: -1 },
      { inv: 3, uses: 1 },
    ];
    expect(chargesAfter(wand, slotOfCard, uses, byId)).toEqual([null, null, null, 1, null]);
    expect(chargesAfter(wand, slotOfCard, [{ inv: 3, uses: 3 }], byId)).toEqual([null, null, null, null, null]);
    expect(sameCharges([null, null, null, 1, null], [null, null, null, 1], 5)).toBe(true);
    expect(sameCharges(undefined, [null, 0], 5)).toBe(false);
  });

  it('share codes keep spent charges', async () => {
    const spent: Wand = { ...wand, charges: [null, null, null, 0, null] };
    expect(await decodeWand(await encodeWand(spent))).toEqual(spent);
  });

  it('resizes slot arrays', () => {
    expect(resize(['A', 'B'], 4)).toEqual(['A', 'B', null, null]);
    expect(resize(['A', 'B', 'C'], 2)).toEqual(['A', 'B']);
  });
});
