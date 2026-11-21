// What a world seed gives, from the game's own scripts run in Lua (seed.lua) with the engine's RNG (sim/rng.ts).
import type { Material } from '@/data/types';
import type { LuaCall } from '@/sim/protocol';

export type FungalShift = {
  /** Materials it turns (with no flask in hand). */
  from: string[];
  to: string;
  /** A held flask's material takes this side instead (75% of the time the game checks; 'none' = flask ignored). */
  flask: 'none' | 'from' | 'to';
  /** When the flask is the target: what a flask of gold or holy grass turns things into instead (the game's joke). */
  goldTo: string;
  grassHolyTo: string;
};

/** Lua's view of the materials: "id:tag,tag|…", plus a stand-in for "the flask you're holding". */
export function materialTable(materials: Material[]) {
  return [...materials.map((m) => `${m.id}:${m.tags.map((t) => t.replace(/^\[|\]$/g, '')).join(',')}`), '__flask:'].join('|');
}

/** deaths: from the synced save; the Mines can only get a modifier from the 8th death on (assumed when unknown). */
export type SeedSetup = { seed: number; materials: string; allUnlocked: boolean; flags: string[]; deaths?: number };

export function setupSeed(call: LuaCall, s: SeedSetup) {
  call('sim_set_world_seed', s.seed >>> 0);
  call('seed_set_materials', s.materials);
  call('seed_set_flags', s.allUnlocked, s.flags.join(','));
  call('seed_set_deaths', s.deaths ?? 8);
}

/** Modifiers that only change how an area looks or reveals itself (not shown as a modifier in the game). */
const COSMETIC = new Set(['FOG_OF_WAR_CLEAR_AT_PLAYER', 'FREEZING_COSMETIC']);

/** decoration: the banner the game shows on entering (game/ui/modifiers/<name>.png); empty when it has none. */
export type BiomeModifier = { id: string; description: string; decoration?: string };

/** Biome id → its modifier this run (MOIST, HOT, GAS_FLOODED…), as get_modifier_mappings() decides. */
export function biomeModifiers(call: LuaCall): Record<string, BiomeModifier> {
  const raw = JSON.parse(call('seed_biome_modifiers') as string) as Record<string, BiomeModifier>;
  return Object.fromEntries(Object.entries(raw).filter(([, m]) => !COSMETIC.has(m.id)));
}

type RawShift = { from: string[]; to: string; flask: FungalShift['flask']; gold_to: string; grass_holy_to: string };

/** gambles[i]: the two perks Gamble gave at mountain i+1, when you took it there. */
export type HolyMountainPerks = { mountains: string[][]; rerolls: string[][]; gambles: string[][] };

/**
 * Perks at each Holy Mountain (7 on the way down), given the perks you took at each (picks[i] = ids taken at
 * mountain i+1), plus the first reroll results.
 */
export function holyMountainPerks(call: LuaCall, picks: string[][] = [], levels = 7, rerolls = 4): HolyMountainPerks {
  const r = JSON.parse(call('seed_perks', levels, picks.map((p) => p.join(',')).join(';'), rerolls) as string) as Partial<HolyMountainPerks>;
  // An empty Lua table comes back as [] either way; keep the shape.
  return { mountains: r.mountains ?? [], rerolls: r.rerolls ?? [], gambles: r.gambles ?? [] };
}

/** A shop wand in the builder's terms (fields of features/wand/model Wand). */
export type ShopWand = {
  name: string;
  shuffle: boolean;
  spellsPerCast: number;
  castDelay: number;
  rechargeTime: number;
  manaMax: number;
  manaChargeSpeed: number;
  capacity: number;
  spread: number;
  speedMultiplier: number;
  spells: (string | null)[];
  alwaysCasts: string[];
  /** The sprite GetWand() gave it (data/items_gfx/wands/wand_XXXX.png), when known. */
  sprite?: string;
  /** A rare wand (is_rare in gun_procedural.lua): extra cost budget, and it glows purple. */
  rare?: boolean;
};

export type ShopItem =
  | { kind: 'spell'; spell: string; cost: number; sale: boolean; row: 'top' | 'bottom' }
  | { kind: 'wand'; wand: ShopWand; cost: number; sale: boolean };

export type Shop = { type: 'spell' | 'wand'; items: ShopItem[] };

type RawShopItem = {
  kind: 'spell' | 'wand';
  spell?: string;
  cost?: number;
  sale: boolean;
  row: 'top' | 'bottom';
  file?: string;
  stats?: Record<string, string | number>;
  spells?: string[];
  always?: string[];
  sprite?: string;
};

const num = (v: string | number | undefined, d = 0) => (v === undefined || v === '' ? d : Number(v));

/** gun_procedural writes some integer fields as fractions ("7.12"); the engine stores them as whole numbers. */
const int = (v: string | number | undefined, d = 0) => Math.trunc(num(v, d));

function shopWand(r: RawShopItem): ShopWand {
  const s = r.stats ?? {};
  const capacity = Math.max(1, int(s.deck_capacity, 1));
  const spells: (string | null)[] = (r.spells ?? []).slice(0, capacity);
  while (spells.length < capacity) spells.push(null);
  return {
    name: String(s.ui_name ?? 'Shop wand').replace(/^\$/, '') || 'Shop wand',
    shuffle: num(s.shuffle_deck_when_empty) === 1 || s.shuffle_deck_when_empty === 'true',
    spellsPerCast: int(s.actions_per_round, 1),
    castDelay: int(s.fire_rate_wait),
    rechargeTime: int(s.reload_time),
    manaMax: num(s.mana_max),
    manaChargeSpeed: num(s.mana_charge_speed),
    capacity,
    spread: num(s.spread_degrees),
    speedMultiplier: num(s.speed_multiplier, 1),
    spells,
    alwaysCasts: r.always ?? [],
    ...(r.sprite ? { sprite: r.sprite } : {}),
    // make_wand_from_gun_data lights rare wands purple (LightComponent r 128, g 0, b 255).
    ...(num(s.b) === 255 && num(s.r) === 128 ? { rare: true } : {}),
  };
}

/** One wand as generate_gun makes it at (x, y): raw component values and the spells it was given. */
export function generateWand(call: LuaCall, x: number, y: number, cost: number, level: number, unshuffle = false) {
  const r = JSON.parse(call('seed_wand', x, y, cost, level, unshuffle) as string) as RawShopItem;
  return { raw: r, wand: shopWand(r) };
}

/**
 * The Holy Mountain shops at these spots (map.json shops), given perks that change them: Extra Shop Item (one
 * more item each) and No More Shuffle (every wand unshuffled).
 */
export function holyMountainShops(call: LuaCall, spots: { x: number; y: number }[], extraItems = 0, noShuffle = false): Shop[] {
  const raw = JSON.parse(call('seed_shops', spots.map((p) => `${p.x},${p.y}`).join(';'), extraItems, noShuffle) as string) as { type: 'spell' | 'wand'; items: RawShopItem[] }[];
  return raw.map((s) => ({
    type: s.type,
    items: s.items.map((r): ShopItem =>
      r.kind === 'wand' ? { kind: 'wand', wand: shopWand(r), cost: r.cost ?? 0, sale: r.sale } : { kind: 'spell', spell: r.spell!, cost: r.cost ?? 0, sale: r.sale, row: r.row },
    ),
  }));
}

/** Where the shops are when map.json isn't at hand (the same values the extractor finds). */
export const SHOP_SPOTS = [
  { x: -331, y: 1395 },
  { x: -331, y: 2931 },
  { x: -331, y: 4979 },
  { x: -331, y: 6515 },
  { x: -331, y: 8563 },
  { x: -331, y: 10611 },
  { x: 2261, y: 13166 },
];

/** Everything the seed tool shows (also run once at extract time, to find the game scripts it needs). */
export function runAllSeedInfo(call: LuaCall) {
  return { fungal: fungalShifts(call), modifiers: biomeModifiers(call), perks: holyMountainPerks(call), shops: holyMountainShops(call, SHOP_SPOTS) };
}

/** The 20 fungal shifts a run can have, in order. */
export function fungalShifts(call: LuaCall, n = 20): FungalShift[] {
  return (JSON.parse(call('seed_fungal', n) as string) as RawShift[]).map((r) => ({ from: r.from, to: r.to, flask: r.flask, goldTo: r.gold_to, grassHolyTo: r.grass_holy_to }));
}
