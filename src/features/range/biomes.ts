// What the test range's cave can look like: some of the game's biomes, from their data/biome/*.xml.
//
// A biome's rock is filled the way the game's <Materials> list fills the white of its wang tiles: each
// MaterialComponent takes the cells where the noise of its material_index lies between material_min and
// material_max (first match wins). The game's noise functions aren't documented; here each index gets a smooth
// value noise stretched sideways, so the bands come out as strata. Entries with is_rare="1" (ores, ice, coal
// seams) are rare_use_polka dots instead: small round spots scattered with rare_polka_probability 0.2. Liquid
// entries (pockets in the rock) are left out: the range has its own pools. The backdrop is the biome's Topology
// background_image.

export type BiomeLayer = { material: string; index: number; min: number; max: number; rare?: boolean };

export type Biome = {
  id: string;
  /** In-game name (data/translations/common.csv). */
  name: string;
  /** data/weather_gfx/<background>.png, copied to game/backgrounds/. */
  background: string | null;
  /** Rock where no layer matches. */
  base: string;
  layers: BiomeLayer[];
  /** The two floor pools (left, right); null for none. */
  pools: [string | null, string | null];
  /** Heaped on the floating island. */
  island: string | null;
  /** The ledge on the right. */
  ledge: string;
  /**
   * How much open sky lights it (post_final.frag's sky_ambient_amount): 1 lights everything fully, 0 leaves a
   * cave dark but for its lights (light.ts). The engine works it out from the world around the camera, and fades
   * it out 250–350 px below the surface; every game biome here lies far deeper, so they're all 0 (the default).
   * The test cave isn't a game place and stays fully lit, as the range always was.
   */
  sky?: number;
};

const L = (material: string, index: number, min: number, max: number): BiomeLayer => ({ material, index, min, max });
const R = (material: string, index: number, min: number, max: number): BiomeLayer => ({ material, index, min, max, rare: true });

export const BIOMES: Biome[] = [
  // The range as it always was: plain rock, a water pool, an oil puddle, sand and a wooden ledge.
  { id: 'range', name: 'Test cave', background: null, base: 'rock_static', layers: [], pools: ['water', 'oil'], island: 'sand', ledge: 'wood_static', sky: 1 },
  {
    id: 'coalmine',
    name: 'Mines',
    background: 'background_coalmine',
    base: 'rock_static',
    layers: [R('coal', 10, 0.51, 0.55), L('soil', 10, 0.45, 0.53), L('sand_static', 10, 0.53, 0.95), R('coal', 10, 1.1, 1.2), R('copper', 10, 1.05, 1.25), R('gold', 9, 1.05, 1.2), L('rock_static_wet', 10, 0.9, 3.5)],
    pools: ['water', 'oil'],
    island: 'sand',
    ledge: 'wood_static',
  },
  {
    id: 'excavationsite',
    name: 'Coal Pits',
    background: 'background_excavationsite',
    base: 'rock_static',
    layers: [R('coal', 10, 0.51, 0.55), L('diamond', 10, 0.45, 0.53), L('rock_static_grey', 10, 0.53, 1.55), R('coal', 10, 1.1, 1.2), R('diamond', 10, 1.05, 1.25), R('gold', 9, 1.05, 1.2), L('coal_static', 9, 0.8, 3.5)],
    pools: ['water', 'oil'],
    island: 'coal',
    ledge: 'wood_static',
  },
  {
    id: 'snowcave',
    name: 'Snowy Depths',
    background: 'background_snowcave',
    base: 'snowrock_static',
    layers: [L('snowrock_static', 9, 0.9, 3.6), L('snow_static', 10, 0.53, 1.05), L('snow_sticky', 9, 0.1, 0.58), R('ice_static', 5, 0.9, 3.5)],
    pools: ['water', 'water'],
    island: 'snow',
    ledge: 'ice_static',
  },
  {
    id: 'snowcastle',
    name: 'Hiisi Base',
    background: 'background_snowcastle',
    base: 'snowrock_static',
    layers: [L('snowrock_static', 9, 0.9, 3.6), L('snow_static', 10, 0.53, 1.05), L('snow_sticky', 9, 0.1, 0.9), R('ice_static', 5, 0.9, 3.5)],
    pools: ['water', 'oil'],
    island: 'snow',
    ledge: 'steel_static',
  },
  {
    id: 'rainforest',
    name: 'Underground Jungle',
    background: 'background_rainforest',
    base: 'sand_static_rainforest',
    layers: [R('gold', 10, 0.443701, 0.46), L('soil_lush', 8, 0.7, 0.86), L('sand_static_rainforest', 10, 0.86, 1.65)],
    pools: ['water', 'swamp'],
    island: 'soil_lush',
    ledge: 'wood_static',
  },
  {
    id: 'vault',
    name: 'The Vault',
    background: 'background_vault',
    base: 'rock_static',
    layers: [R('gold', 10, 0.443701, 0.46), L('soil', 10, 0.45, 0.53), L('rock_vault', 10, 0.53, 0.95), L('rock_static', 10, 0.9, 3.5)],
    pools: ['radioactive_liquid', 'water'],
    island: 'soil',
    ledge: 'steelmoss_static',
  },
  {
    id: 'crypt',
    name: 'Temple of the Art',
    background: 'background_crypt',
    base: 'templebrickdark_static',
    layers: [L('sand_static', 10, 0.45, 0.55), R('diamond', 10, 1.1, 1.2), L('rock_hard', 10, 0.6, 1.0), L('templebrickdark_static', 11, 0.8, 3.6)],
    pools: ['water', 'oil'],
    island: 'sand',
    ledge: 'templebrick_static',
  },
  {
    id: 'fungicave',
    name: 'Fungal Caverns',
    background: 'background_fungicave_01',
    base: 'rock_static',
    layers: [R('gold', 10, 0.443701, 0.46), L('fungisoil', 10, 0.57, 0.66), L('sand_static', 10, 0.66, 0.95), R('gold', 10, 1.1, 1.2), L('rock_static', 10, 0.9, 3.5)],
    pools: ['water', 'oil'],
    island: 'fungisoil',
    ledge: 'wood_static',
  },
  {
    id: 'wizardcave',
    name: "Wizards' Den",
    background: 'background_wizardcave',
    base: 'rock_static_purple',
    layers: [R('coal', 10, 0.51, 0.55), L('soil', 10, 0.45, 0.53), L('rock_static_purple', 10, 0.53, 2.0), R('coal', 10, 1.1, 1.2), R('copper', 10, 1.05, 1.25), R('gold', 9, 1.05, 1.2)],
    pools: ['water', 'oil'],
    island: 'sand',
    ledge: 'wizardstone',
  },
  {
    id: 'vault_frozen',
    name: 'Frozen Vault',
    background: 'background_vault_frozen',
    base: 'snowrock_static',
    layers: [L('snowrock_static', 9, 0.9, 3.6), L('snow_static', 10, 0.53, 1.05), L('snow_sticky', 9, 0.1, 0.58), R('ice_static', 5, 0.9, 3.5)],
    pools: ['water', null],
    island: 'snow',
    ledge: 'steelfrost_static',
  },
  {
    id: 'robobase',
    name: 'Power Plant',
    background: 'background_robobase',
    base: 'rock_static',
    layers: [R('gold', 10, 0.443701, 0.46), L('soil', 10, 0.45, 0.53), L('rock_static_grey', 10, 0.53, 0.95), L('rock_static', 10, 0.9, 3.5)],
    pools: ['radioactive_liquid', 'oil'],
    island: 'sand',
    ledge: 'steel_grey_static',
  },
  {
    id: 'sandcave',
    name: 'Sandcave',
    background: 'background_cave_09',
    base: 'rock_static',
    layers: [R('silver', 10, 0.443701, 0.46), L('soil', 10, 0.45, 0.53), L('sandstone', 10, 0.53, 1.45), L('sand_static_red', 9, 1.0, 1.7), R('rock_hard', 8, 0.53, 1.05), R('silver', 10, 1.05, 1.25), R('sand', 5, 0.9, 3.5)],
    pools: ['water', null],
    island: 'sand',
    ledge: 'wood_static',
  },
  // solid_wall_temple.xml: the brickwork around the Holy Mountain.
  {
    id: 'holymountain',
    name: 'Holy Mountain',
    background: 'background_cave_02',
    base: 'templebrick_static',
    layers: [],
    pools: ['water', null],
    island: null,
    ledge: 'templebrick_static',
  },
];

export const biomeById = new Map(BIOMES.map((b) => [b.id, b]));

const hasher = (seed: number) => (x: number, y: number) => {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Rare materials' polka dots: in each 20 px cell, a 1-in-5 chance of a round spot 2–5 px across its radius. */
export function biomePolka(seed: number) {
  const hash = hasher(seed);
  const CELL = 20;
  return (x: number, y: number) => {
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    // A spot can spill into the next cell: check the neighbours too.
    for (let j = cy - 1; j <= cy + 1; j++) {
      for (let i = cx - 1; i <= cx + 1; i++) {
        if (hash(i, j) >= 0.2) continue;
        const sx = (i + hash(i + 7777, j)) * CELL;
        const sy = (j + hash(i, j + 7777)) * CELL;
        const r = 2 + hash(i - 7777, j) * 3;
        if ((x - sx) ** 2 + (y - sy) ** 2 <= r * r) return true;
      }
    }
    return false;
  };
}

/** Smooth value noise in [0, 1]: two octaves, stretched sideways into strata. */
export function biomeNoise(seed: number) {
  const hash = hasher(seed);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const at = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const tx = smooth(x - xi);
    const ty = smooth(y - yi);
    const a = hash(xi, yi);
    const b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1);
    const d = hash(xi + 1, yi + 1);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
  return (x: number, y: number) => at(x / 56, y / 22) * 0.65 + at(x / 22 + 17.3, y / 9 + 5.1) * 0.35;
}

/**
 * A noise sample in the units of the biome files' min/max. Their last, widest entry (e.g. 0.9â€“3.5) is the main
 * rock and the narrow bands below ~1.25 are seams and ores, so values centre near 1.9 and only the low tails
 * reach the bands.
 */
export const noiseValue = (v: number) => 1.9 + (v - 0.5) * 6;
