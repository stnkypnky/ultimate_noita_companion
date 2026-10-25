import type { Perk } from '../../src/data/types.ts';
import { tr, type Translations } from './translations.ts';

export type RawPerk = {
  id: string;
  ui_name: string;
  ui_description: string;
  ui_icon?: string;
  perk_icon?: string;
  stackable?: boolean;
  stackable_is_rare?: boolean;
  stackable_maximum?: number;
  max_in_perk_pool?: number;
  usable_by_enemies?: boolean;
  not_in_default_perk_pool?: boolean;
  one_off_effect?: boolean;
  remove_other_perks?: unknown;
  game_effect?: string;
};

export function buildPerks(raw: RawPerk[], t: Translations, icons: Map<string, Perk['icon']>): Perk[] {
  return raw.map((p) => ({
    id: p.id,
    name: tr(t, p.ui_name),
    description: tr(t, p.ui_description),
    icon: icons.get(p.ui_icon ?? '') ?? { x: 0, y: 0, w: 0, h: 0 },
    stackable: !!p.stackable,
    stackableRare: !!p.stackable_is_rare,
    ...(p.stackable_maximum ? { maxStack: p.stackable_maximum } : {}),
    ...(p.max_in_perk_pool ? { maxInPool: p.max_in_perk_pool } : {}),
    usableByEnemies: !!p.usable_by_enemies,
    inDefaultPool: !p.not_in_default_perk_pool,
    oneOff: !!p.one_off_effect,
    removesOtherPerks: !!p.remove_other_perks,
    ...(p.game_effect ? { gameEffect: p.game_effect } : {}),
    discoverFlag: `perk_picked_${p.id.toLowerCase()}`,
  }));
}
