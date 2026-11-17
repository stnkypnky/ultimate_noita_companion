import type { Spell } from '@/data/types';
import type { SimRequest, SimWand } from '@/sim/types';
import { packJson, unpackJson } from '@/lib/encoding';

export type Wand = SimWand & {
  name: string;
  /** One entry per slot; null = empty. Length always equals capacity. */
  spells: (string | null)[];
  alwaysCasts: string[];
  /** Charges left per slot, for spells with limited uses; null or missing = full. */
  charges?: (number | null)[];
};

export type SimOptions = {
  /** "Unlimited spells" perk: charges never run out (except never_unlimited spells). */
  unlimitedSpells: boolean;
  /** Simulate until the wand recharges, or a fixed number of casts. */
  mode: 'cycle' | 'casts';
  casts: number;
  /** Changes shuffle order and random spells. */
  frame: number;
  hp: number;
  maxHp: number;
  money: number;
  /** Casting in the test range spends the wand's charges, which stay spent until refilled (as in the game). */
  useCharges?: boolean;
};

export const MAX_CAPACITY = 26;

export const DEFAULT_WAND: Wand = {
  name: 'Wand',
  shuffle: false,
  spellsPerCast: 1,
  castDelay: 10,
  rechargeTime: 20,
  manaMax: 300,
  manaChargeSpeed: 100,
  capacity: 8,
  spread: 0,
  speedMultiplier: 1,
  spells: Array(8).fill(null),
  alwaysCasts: [],
};

export const DEFAULT_OPTIONS: SimOptions = { unlimitedSpells: true, mode: 'cycle', casts: 10, frame: 0, hp: 100, maxHp: 100, money: 0 };

export function resize<T>(slots: (T | null)[], capacity: number): (T | null)[] {
  const out = slots.slice(0, capacity);
  while (out.length < capacity) out.push(null);
  return out;
}

/** Does this spell run out of charges with these options? (The Unlimited Spells perk spares all but a few.) */
export const isLimited = (spell: Spell, opts: Pick<SimOptions, 'unlimitedSpells'>) => spell.maxUses !== null && (!opts.unlimitedSpells || spell.neverUnlimited);

/** Charges left for the spell in a slot, or null when it has unlimited uses. */
export function chargesLeft(wand: Wand, slot: number, spell: Spell, opts: Pick<SimOptions, 'unlimitedSpells'>): number | null {
  if (!isLimited(spell, opts)) return null;
  const c = wand.charges?.[slot];
  return c === null || c === undefined ? spell.maxUses! : Math.max(0, Math.min(spell.maxUses!, Math.round(c)));
}

/**
 * The wand's charges after the live deck spent some: `uses` is gun.lua's remaining uses per deck card (1-based
 * inventory number), `slotOfCard` maps cards to slots. Full spells are stored as null.
 */
export function chargesAfter(
  wand: Wand,
  slotOfCard: number[],
  uses: { inv: number; uses: number }[],
  spellById: Map<string, Spell>,
): (number | null)[] {
  const out = resize(wand.charges ?? [], wand.capacity);
  for (const { inv, uses: left } of uses) {
    const slot = slotOfCard[inv - 1];
    const spell = slot === undefined ? undefined : spellById.get(wand.spells[slot] ?? '');
    if (slot === undefined || !spell || spell.maxUses === null || left < 0) continue;
    out[slot] = left >= spell.maxUses ? null : left;
  }
  return out;
}

export const sameCharges = (a: (number | null)[] | undefined, b: (number | null)[] | undefined, capacity: number) => {
  const x = resize(a ?? [], capacity);
  const y = resize(b ?? [], capacity);
  return x.every((v, i) => (v ?? null) === (y[i] ?? null));
};

/**
 * The player carries at most 4 wands (the quick inventory), so Zeta can draw on 3 others. The wand builder
 * holds only one, so saved builds stand in for the rest: the most recently saved, other than the one in hand.
 */
export const CARRIED_WANDS = 4;

export function pickOtherWands(builds: { name: string; wand: Wand }[], current: string): string[][] {
  return builds
    .filter((b) => b.name !== current)
    .slice(0, CARRIED_WANDS - 1)
    .map(({ wand }) => [...wand.spells.filter((s): s is string => !!s), ...wand.alwaysCasts]);
}

export function toSimRequest(
  wand: Wand,
  opts: SimOptions,
  spellById: Map<string, Spell>,
  otherWands: string[][] = [],
): { req: SimRequest; slotOfCard: number[] } {
  const deck: SimRequest['deck'] = [];
  // Card n (1-based, in sim_add_card order) came from slot slotOfCard[n - 1].
  const slotOfCard: number[] = [];
  wand.spells.forEach((id, slot) => {
    const spell = id ? spellById.get(id) : undefined;
    if (!spell) return;
    deck.push({ id: spell.id, uses: chargesLeft(wand, slot, spell, opts) ?? -1 });
    slotOfCard.push(slot);
  });
  return {
    req: {
      wand,
      deck,
      alwaysCasts: wand.alwaysCasts.filter((id) => spellById.has(id)),
      otherWands: otherWands.map((w) => w.filter((id) => spellById.has(id))).filter((w) => w.length),
      options: {
        maxCasts: opts.mode === 'cycle' ? 64 : opts.casts,
        stopOnReload: opts.mode === 'cycle',
        hp: opts.hp,
        maxHp: opts.maxHp,
        money: opts.money,
        frame: opts.frame,
      },
    },
    slotOfCard,
  };
}

// ---------- Share codes ----------

/** Compact on-the-wire form: short keys, spells as one comma string. */
/** `c`: charges left per slot, one comma entry per slot (empty = full), only when any were spent. */
type Packed = { v: 1; n?: string; w: [number, number, number, number, number, number, number, number, number, number]; s: string; a?: string; c?: string };

export async function encodeWand(w: Wand): Promise<string> {
  const packed: Packed = {
    v: 1,
    ...(w.name && w.name !== DEFAULT_WAND.name ? { n: w.name } : {}),
    w: [w.shuffle ? 1 : 0, w.spellsPerCast, w.castDelay, w.rechargeTime, w.manaMax, w.manaChargeSpeed, w.capacity, w.spread, w.speedMultiplier, 0],
    s: w.spells.map((s) => s ?? '').join(','),
    ...(w.alwaysCasts.length ? { a: w.alwaysCasts.join(',') } : {}),
    ...(w.charges?.some((c) => c !== null && c !== undefined) ? { c: resize(w.charges, w.capacity).map((c) => c ?? '').join(',') } : {}),
  };
  return packJson(packed);
}

export async function decodeWand(code: string): Promise<Wand> {
  const p = await unpackJson<Packed>(code);
  if (p.v !== 1) throw new Error('Unsupported wand code version');
  const [shuffle, spellsPerCast, castDelay, rechargeTime, manaMax, manaChargeSpeed, capacity, spread, speedMultiplier] = p.w;
  const cap = Math.max(1, Math.min(MAX_CAPACITY, capacity));
  return {
    name: p.n ?? DEFAULT_WAND.name,
    shuffle: !!shuffle,
    spellsPerCast,
    castDelay,
    rechargeTime,
    manaMax,
    manaChargeSpeed,
    capacity: cap,
    spread,
    speedMultiplier,
    spells: resize(
      p.s.split(',').map((s) => s || null),
      cap,
    ),
    alwaysCasts: p.a ? p.a.split(',').filter(Boolean) : [],
    ...(p.c ? { charges: resize(p.c.split(',').map((c) => (c === '' || !Number.isFinite(Number(c)) ? null : Math.max(0, Math.round(Number(c))))), cap) } : {}),
  };
}
