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
]);

export const itemKey = (id: string) => (id.startsWith('essence_') ? id : `item:${id}`);

/** Lively Concoction & Alchemic Precursor recipes are seed secrets. */
export const ALCHEMY_KEY = 'secret:alchemy';
