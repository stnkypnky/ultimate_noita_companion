// Lively Concoction (LC) & Alchemic Precursor (AP) recipes for a world seed.
// The game picks these in C++ (not in the Lua files), so this follows the community's reverse-engineered
// algorithm — ported from lamas_stats' aplc.lua (WTFPL) and cross-checked against TwoAbove/noita-tools (MIT).

const LIQUIDS = [
  'acid', 'alcohol', 'blood', 'blood_fungi', 'blood_worm', 'cement', 'lava', 'magic_liquid_berserk', 'magic_liquid_charm',
  'magic_liquid_faster_levitation', 'magic_liquid_faster_levitation_and_movement', 'magic_liquid_invisibility',
  'magic_liquid_mana_regeneration', 'magic_liquid_movement_faster', 'magic_liquid_protection_all', 'magic_liquid_teleportation',
  'magic_liquid_unstable_polymorph', 'magic_liquid_unstable_teleportation', 'magic_liquid_worm_attractor', 'material_confusion',
  'mud', 'oil', 'poison', 'radioactive_liquid', 'swamp', 'urine', 'water', 'water_ice', 'water_swamp', 'magic_liquid_random_polymorph',
];

const ORGANICS = [
  'bone', 'brass', 'coal', 'copper', 'diamond', 'fungi', 'gold', 'grass', 'gunpowder', 'gunpowder_explosive', 'rotten_meat', 'sand',
  'silver', 'slime', 'snow', 'soil', 'wax', 'honey',
];

export type Recipe = {
  /** The three ingredient material ids. */
  materials: [string, string, string];
  /** Reaction probability, percent. */
  probability: number;
  result: string;
};

/** Park–Miller minimal standard generator (Schrage's method), as used by the engine. */
function next(v: number): number {
  const hi = Math.floor(v / 127773);
  const lo = v % 127773;
  let r = 16807 * lo - 2836 * hi;
  if (r <= 0) r += 2147483647;
  return r;
}

const unit = (v: number) => v / 2 ** 31;

function shuffle<T>(t: T[], seed: number) {
  let v = next(Math.floor(seed / 2) + 12534);
  for (let i = t.length - 1; i >= 0; i--) {
    v = next(v);
    const j = Math.floor(unit(v) * (i + 1));
    [t[i], t[j]] = [t[j]!, t[i]!];
  }
}

function pick(state: number, pool: (string | null)[]): [number, string] {
  for (let attempt = 0; attempt < 1000; attempt++) {
    state = next(state);
    const idx = Math.floor(pool.length * unit(state));
    const m = pool[idx];
    if (m) {
      pool[idx] = null;
      return [state, m];
    }
  }
  throw new Error('alchemy: could not pick a material');
}

function recipe(state: number, seed: number, result: string): [number, Recipe] {
  const liquids: (string | null)[] = [...LIQUIDS];
  const organics: (string | null)[] = [...ORGANICS];
  const mats: string[] = [];
  for (let i = 0; i < 3; i++) {
    let m: string;
    [state, m] = pick(state, liquids);
    mats.push(m);
  }
  let organic: string;
  [state, organic] = pick(state, organics);
  mats.push(organic);

  state = next(state);
  const probability = 10 + Math.floor(unit(state) * 91);
  state = next(state);

  // Four candidates are shuffled and the first three are the recipe.
  shuffle(mats, seed);
  return [state, { materials: [mats[0]!, mats[1]!, mats[2]!], probability, result }];
}

export function alchemyRecipes(seed: number): { lc: Recipe; ap: Recipe } {
  let state = Math.floor(seed * 0.17127 + 1323.5903);
  for (let i = 0; i < 6; i++) state = next(state);
  let lc: Recipe, ap: Recipe;
  [state, lc] = recipe(state, seed, 'magic_liquid_hp_regeneration_unstable');
  [state, ap] = recipe(state, seed, 'midas_precursor');
  return { lc, ap };
}

export const MAX_SEED = 4294967295;
