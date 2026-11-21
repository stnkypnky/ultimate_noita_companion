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
  'greed_curse', 'physics_gold_orb_greed', 'physics_greed_die', 'summon_portal_broken',
  // Not here: Broken wand, Kiuaskivi and Ukkoskivi, which the flask spawn list puts all over the main path,
  // and the rare-but-ordinary finds (Kammi, Kuu, Paha Silmä…), which are RARE_ITEMS instead.
  'beamstone', 'musicstone', 'poopstone', 'stonestone', 'wandstone', 'waterstone',
  'newsun', 'newsun_dark', 'sunbaby', 'sunegg', 'sunseed', 'sunstone', 'potion_mimic', 'bloodmoney_x',
  'chest_leggy', 'goldnugget_x', 'physics_die',
]);

const CURIO = 'About 1 in 130 Treasure chests and Utility boxes holds one.';
const RUNE = 'About 1 in 640 flask spots (item pedestals included) holds this runestone, and about 1 in 930 Treasure chests.';

/**
 * Rare world items: nothing to spoil, so they're never hidden, but few runs turn one up. Each says how rare.
 * Curiosities are a 6% chest roll, then 1 in 8 (chest_random.lua, utility_box.lua); a runestone takes 1 in 91 flask
 * spots, split seven ways (item_spawnlists.lua); a Great chest takes 1 chest spot in 1000 (biome_scripts.lua, coalmine.lua),
 * 2 in 100 in the Tower and the_end, and Syväolento drops one (boss_fish/death.lua).
 */
export const RARE_ITEMS: Record<string, string> = {
  safe_haven: 'Only Treasure chests and Utility boxes hold one: about 1 in 130 of them.',
  moon: `${CURIO} A few also turn up off the main path.`,
  evil_eye: `${CURIO} One also waits at a fixed spot in every world.`,
  runestone_disc: RUNE, runestone_fireball: RUNE, runestone_laser: RUNE, runestone_lava: RUNE,
  runestone_metal: RUNE, runestone_null: RUNE, runestone_slow: RUNE,
  chest_random_super: 'About 1 chest spot in 1000 holds one (1 in 50 in a few late areas), and one boss always drops one.',
};

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
