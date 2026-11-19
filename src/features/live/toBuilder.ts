// A wand from the run, as the Wand Builder's wand (to simulate it here, or open it in the builder).
import { resize, type Wand } from '@/features/wand/model';
import { simPerks } from '@/sim/perks';
import type { LiveWand } from './parse';

/** Randomized wands use one of the game's numbered sprites; anything else falls back to a sprite by stats. */
const NUMBERED_SPRITE = /^data\/items_gfx\/wands\/wand_\d{4}\.png$/;

/** `perks`: the run's, so the wand is simulated (and opens in the builder) as it fires in that run. */
export function toBuilderWand(w: LiveWand, perks: { id: string; count: number }[] = []): Wand {
  const runPerks = simPerks(perks);
  const capacity = Math.max(1, w.capacity);
  const spells: (string | null)[] = Array(capacity).fill(null);
  const charges: (number | null)[] = Array(capacity).fill(null);
  let next = 0;
  for (const s of w.spells) {
    const slot = s.slot !== undefined && s.slot < capacity && spells[s.slot] === null ? s.slot : spells.indexOf(null, next);
    if (slot < 0) break;
    spells[slot] = s.id;
    if (s.uses !== undefined) charges[slot] = s.uses;
    next = slot + 1;
  }
  return {
    name: w.name === 'Wand' ? 'Wand from my run' : w.name,
    shuffle: w.shuffle,
    spellsPerCast: Math.max(1, Math.round(w.spellsPerCast)),
    castDelay: Math.round(w.castDelay),
    rechargeTime: Math.round(w.rechargeTime),
    manaMax: Math.round(w.manaMax),
    manaChargeSpeed: Math.round(w.manaChargeSpeed),
    capacity,
    spread: Math.round(w.spread * 10) / 10,
    speedMultiplier: Math.round(w.speedMultiplier * 1000) / 1000,
    spells: resize(spells, capacity),
    alwaysCasts: w.alwaysCasts,
    ...(charges.some((c) => c !== null) ? { charges } : {}),
    ...(w.sprite && NUMBERED_SPRITE.test(w.sprite) ? { sprite: w.sprite } : {}),
    ...(runPerks ? { perks: runPerks } : {}),
  };
}
