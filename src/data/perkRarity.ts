// How rare a perk is, from the real odds (Perk.odds: the game's perk.lua over thousands of seeds). The deck splits
// in two: perks that can sit in it more than once are offered in about 22–27% of runs, the rest in about 18–21%.
// Perks outside the Holy Mountain deck only come from special places.
import type { Perk } from './types';

export type PerkRarity = 'Common' | 'Uncommon' | 'Rare';

export function perkRarity(p: Perk): PerkRarity {
  if (!p.inDefaultPool || !p.odds) return 'Rare';
  return p.odds.any >= 0.22 ? 'Common' : 'Uncommon';
}

/** How many copies a run's perk deck can hold (perk_get_spawn_order in perk.lua). */
export function deckCopies(p: Perk): string {
  if (!p.inDefaultPool) return 'None';
  if (!p.stackable || p.stackableRare) return '1';
  const most = p.maxInPool ?? 2;
  return most > 1 ? `1–${most}` : '1';
}

/** "1 in 5 runs" style wording of a share of runs. */
export const runsWording = (share: number) => `${Math.round(share * 100)}% of runs (about 1 in ${Math.max(1, Math.round(1 / share))})`;
