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

/** Lively Concoction & Alchemic Precursor recipes are seed secrets. */
export const ALCHEMY_KEY = 'secret:alchemy';
