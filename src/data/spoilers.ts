// Things the save file can't tell us about, so they're curated by hand.
// Spells, perks and enemies use the game's own persistent flags instead.

/** Secret / endgame materials. Hidden (along with every reaction that touches them) until revealed. */
export const SECRET_MATERIALS = new Set([
  'magic_liquid_hp_regeneration_unstable', // lively concoction
  'midas_precursor', // alchemic precursor
  'midas',
  'magic_gas_midas',
  'magic_liquid_hp_regeneration', // healthium
  'magic_gas_hp_regeneration',
  'creepy_liquid',
  'creepy_liquid_emitter',
  'cheese_static',
  'purifying_powder',
  'void_liquid',
  'fungi_creeping',
  'fungi_creeping_secret',
  'cursed_liquid',
  'bloodgold_box2d',
  'gold_static_dark',
  'material_rainbow',
  'rainbow_gas',
  'juhannussima',
]);

export const materialKey = (id: string) => `material:${id}`;

/**
 * Secret world items. Essences also unlock from the save's own flags (essence_<x>),
 * so they're keyed by that flag name; everything else uses item:<id>.
 */
export const SECRET_ITEMS = new Set([
  'essence_air', 'essence_alcohol', 'essence_fire', 'essence_laser', 'essence_water',
  'evil_eye', 'greed_curse', 'physics_gold_orb_greed', 'physics_greed_die', 'moon', 'safe_haven', 'summon_portal_broken',
  'beamstone', 'brimstone', 'musicstone', 'poopstone', 'stonestone', 'thunderstone', 'wandstone', 'waterstone',
  'newsun', 'newsun_dark', 'sunbaby', 'sunegg', 'sunseed', 'sunstone', 'broken_wand', 'potion_mimic', 'bloodmoney_x',
  'chest_leggy', 'goldnugget_x', 'physics_die',
]);

/**
 * Items the save's own flags unlock. The Chaos die only spawns once Ylialkemisti has been beaten, which
 * sets card_unlocked_duplicate (boss_alchemist/death.lua; item_spawnlists.lua spawn_requires_flag).
 */
export const ITEM_FLAGS: Record<string, string> = { physics_die: 'card_unlocked_duplicate' };

export const itemKey = (id: string) => ITEM_FLAGS[id] ?? (id.startsWith('essence_') ? id : `item:${id}`);

/** Lively Concoction & Alchemic Precursor recipes are seed secrets. */
export const ALCHEMY_KEY = 'secret:alchemy';

/** The full reaction table, secret materials included. */
export const ALCHEMY_ALL_KEY = 'secret:alchemy-all';
