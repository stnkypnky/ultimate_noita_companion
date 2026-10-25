import type { Spell } from '@/data/types';
import type { SimRequest, SimWand } from '@/sim/types';
import { packJson, unpackJson } from '@/lib/encoding';

export type Wand = SimWand & {
  name: string;
  /** One entry per slot; null = empty. Length always equals capacity. */
  spells: (string | null)[];
  alwaysCasts: string[];
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

export function resize(spells: (string | null)[], capacity: number): (string | null)[] {
  const out = spells.slice(0, capacity);
  while (out.length < capacity) out.push(null);
  return out;
}

export function toSimRequest(wand: Wand, opts: SimOptions, spellById: Map<string, Spell>): { req: SimRequest; slotOfCard: number[] } {
  const deck: SimRequest['deck'] = [];
  // Card n (1-based, in sim_add_card order) came from slot slotOfCard[n - 1].
  const slotOfCard: number[] = [];
  wand.spells.forEach((id, slot) => {
    const spell = id ? spellById.get(id) : undefined;
    if (!spell) return;
    const limited = spell.maxUses !== null && (!opts.unlimitedSpells || spell.neverUnlimited);
    deck.push({ id: spell.id, uses: limited ? spell.maxUses! : -1 });
    slotOfCard.push(slot);
  });
  return {
    req: {
      wand,
      deck,
      alwaysCasts: wand.alwaysCasts.filter((id) => spellById.has(id)),
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
type Packed = { v: 1; n?: string; w: [number, number, number, number, number, number, number, number, number, number]; s: string; a?: string };

export async function encodeWand(w: Wand): Promise<string> {
  const packed: Packed = {
    v: 1,
    ...(w.name && w.name !== DEFAULT_WAND.name ? { n: w.name } : {}),
    w: [w.shuffle ? 1 : 0, w.spellsPerCast, w.castDelay, w.rechargeTime, w.manaMax, w.manaChargeSpeed, w.capacity, w.spread, w.speedMultiplier, 0],
    s: w.spells.map((s) => s ?? '').join(','),
    ...(w.alwaysCasts.length ? { a: w.alwaysCasts.join(',') } : {}),
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
  };
}
