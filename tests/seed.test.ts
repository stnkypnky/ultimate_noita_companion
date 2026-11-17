// The seed tool: the game's own scripts with the engine's RNG, checked against noita-tools' game-verified answers
// (TwoAbove/noita-tools, src/services/SeedInfo/infoHandler/InfoProviders/*.spec.ts).
import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLuaHost, seedSource, type LuaHost } from '../tools/extract/lua.ts';
import type { Material } from '../src/data/types.ts';
import { SHOP_SPOTS, biomeModifiers, fungalShifts, generateWand, holyMountainPerks, holyMountainShops, materialTable, setupSeed } from '../src/seed/seed.ts';

const GAME = join(import.meta.dirname, '../public/game');
let host: LuaHost;
let mats: string;

beforeAll(async () => {
  host = await createLuaHost((p) => (existsSync(join(GAME, 'lua', p)) ? readFileSync(join(GAME, 'lua', p), 'utf8') : undefined));
  await host.lua.doString(seedSource);
  mats = materialTable(JSON.parse(readFileSync(join(GAME, 'data/materials.json'), 'utf8')) as Material[]);
});

const use = (seed: number) => setupSeed(host.call, { seed, materials: mats, allUnlocked: true, flags: [] });

const WATER = 'water,water_static,water_salt,water_ice';
const TOXIC = 'radioactive_liquid,poison,material_darkness';
const OIL = 'oil,swamp,peat';
const POLY = 'magic_liquid_polymorph,magic_liquid_unstable_polymorph';
const GAS = 'acid_gas,acid_gas_static,poison_gas,fungal_gas,radioactive_gas,radioactive_gas_static';

// [flask side, from, to, flask-of-gold result, flask-of-holy-grass result]
const SEED_123: [string, string, string, string, string][] = [
  ['from', 'lava', 'sand', 'gold', 'grass_holy'],
  ['from', POLY, 'blood', 'gold', 'grass_holy'],
  ['from', TOXIC, 'water', 'gold', 'grass_holy'],
  ['from', WATER, 'radioactive_liquid', 'gold', 'grass_holy'],
  ['from', 'lava', 'blood', 'gold', 'grass_holy'],
  ['to', TOXIC, 'acid', 'mammi', 'grass'],
  ['from', OIL, 'water', 'gold', 'grass_holy'],
  ['from', WATER, 'pea_soup', 'gold', 'grass_holy'],
  ['from', 'acid', 'lava', 'gold', 'grass_holy'],
  ['to', WATER, 'blood_fungi', 'mammi', 'grass'],
  ['to', OIL, 'acid', 'mammi', 'grass'],
  ['to', OIL, 'vomit', 'acid_gas', 'grass'],
  ['none', 'acid', 'fungi', 'gold', 'grass_holy'],
  ['to', GAS, 'gunpowder', 'brass', 'grass'],
  ['none', 'silver,brass,copper', 'acid', 'gold', 'grass_holy'],
  ['none', OIL, 'silver', 'gold', 'grass_holy'],
  ['from', 'diamond', 'silver', 'gold', 'grass_holy'],
  ['from', 'diamond', 'radioactive_liquid', 'gold', 'grass_holy'],
  ['to', 'lava', 'radioactive_liquid', 'acid_gas', 'grass'],
  ['none', 'lava', 'water', 'gold', 'grass_holy'],
];

describe('biome modifiers (biome_modifiers.lua)', () => {
  it('seed 123: no main biome rolls one; the overworld gets its fixed ones (noita-tools BiomeModifier.spec)', () => {
    use(123);
    const got = biomeModifiers(host.call);
    expect(Object.keys(got).sort()).toEqual(
      ['mountain_top', 'mountain_floating_island', 'winter', 'lavalake', 'desert', 'pyramid_entrance', 'pyramid_left', 'pyramid_top', 'pyramid_right', 'watercave'].sort(),
    );
    expect(got.desert!.id).toBe('HOT');
    expect(got.winter!.id).toBe('FREEZING');
  });

  it('some seeds give the main biomes modifiers; the Mines only after 8 deaths', () => {
    const main = ['coalmine', 'excavationsite', 'snowcave', 'snowcastle', 'rainforest', 'vault', 'crypt'];
    let mines = 0;
    let any = 0;
    let minesEarly = 0;
    for (let seed = 1; seed <= 200; seed++) {
      setupSeed(host.call, { seed, materials: mats, allUnlocked: true, flags: [], deaths: 20 });
      const m = biomeModifiers(host.call);
      if (main.some((b) => m[b])) any++;
      if (m.coalmine) mines++;
      setupSeed(host.call, { seed, materials: mats, allUnlocked: true, flags: [], deaths: 0 });
      if (biomeModifiers(host.call).coalmine) minesEarly++;
    }
    expect(any).toBeGreaterThan(50);
    expect(mines).toBeGreaterThan(10);
    expect(minesEarly).toBe(0);
  });
});

describe('Holy Mountain perks (perk.lua)', () => {
  it('seed 123: the perks at all seven mountains (noita-tools Perk.spec)', () => {
    use(123);
    expect(holyMountainPerks(host.call).mountains).toEqual([
      ['LOW_HP_DAMAGE_BOOST', 'PROJECTILE_HOMING', 'MOLD'],
      ['BLEED_GAS', 'RADAR_ENEMY', 'FASTER_LEVITATION'],
      ['GLASS_CANNON', 'PROJECTILE_REPULSION_SECTOR', 'ORBIT'],
      ['TELEPORTITIS', 'REMOVE_FOG_OF_WAR', 'SAVING_GRACE'],
      ['RESPAWN', 'PERSONAL_LASER', 'TELEKINESIS'],
      ['FAST_PROJECTILES', 'BOUNCE', 'BLEED_OIL'],
      ['HOMUNCULUS', 'PEACE_WITH_GODS', 'PROJECTILE_EATER_SECTOR'],
    ]);
  });

  it('seed 806: taking Bleed Gas at the first mountain changes the second (a non-stacking perk leaves the deck)', () => {
    use(806);
    expect(holyMountainPerks(host.call, [], 2).mountains).toEqual([
      ['BLEED_GAS', 'PROTECTION_ELECTRICITY', 'VAMPIRISM'],
      ['BLEED_OIL', 'EXTRA_PERK', 'PROTECTION_RADIOACTIVITY'],
    ]);
    expect(holyMountainPerks(host.call, [['BLEED_GAS']], 2).mountains).toEqual([
      ['BLEED_GAS', 'PROTECTION_ELECTRICITY', 'VAMPIRISM'],
      ['BLEED_OIL', 'EXTRA_PERK', 'TELEPORTITIS'],
    ]);
  });

  it('seed 1879996134: Gamble at the sixth mountain hands over Bleed Oil and Genome More Love, and the seventh follows on', () => {
    use(1879996134);
    const r = holyMountainPerks(host.call, [[], [], [], [], [], ['GAMBLE']]);
    expect(r.mountains[5]).toEqual(['GAMBLE', 'TRICK_BLOOD_MONEY', 'REVENGE_EXPLOSION']);
    expect(r.gambles[5]).toEqual(['BLEED_OIL', 'GENOME_MORE_LOVE']);
    expect(r.mountains[6]).toEqual(['EXTRA_SLOTS', 'HUNGRY_GHOST', 'DISSOLVE_POWDERS']);
    expect(r.mountains[0]).toEqual(['MEGA_BEAM_STONE', 'PROTECTION_RADIOACTIVITY', 'PERKS_LOTTERY']);
  });

  it('Extra Perk adds a slot to the next mountains; rerolls come from the far end of the deck', () => {
    use(806);
    const r = holyMountainPerks(host.call, [[], ['EXTRA_PERK']], 3, 2);
    expect(r.mountains.map((m) => m.length)).toEqual([3, 3, 4]);
    expect(r.rerolls).toHaveLength(2);
    expect(r.rerolls[0]).toHaveLength(4);
  });
});

describe('Holy Mountain shops (temple_altar.lua, generate_shop_item.lua, gun_procedural.lua)', () => {
  it('a wand made by generate_gun matches (noita-tools Wand.spec, seed 123 at 10, 10, cost 20, level 1)', () => {
    use(123);
    const { raw, wand } = generateWand(host.call, 10, 10, 20, 1);
    expect(raw.spells).toEqual(['BURST_2', 'HEAVY_SPREAD', 'DYNAMITE', 'DYNAMITE', 'DYNAMITE']);
    expect([wand.capacity, wand.castDelay, wand.rechargeTime, wand.manaMax, wand.manaChargeSpeed, wand.spread, wand.spellsPerCast, wand.shuffle]).toEqual([6, 18, 28, 80, 245, 2, 1, true]);
    expect(wand.speedMultiplier).toBeCloseTo(1.08233642578125, 6);
  });

  it('a level 6 wand gets its 16 spells, and its fractional capacity is cut to a whole number', () => {
    use(123);
    const { raw, wand } = generateWand(host.call, 155, 6161, 200, 6);
    expect(raw.spells).toHaveLength(16);
    expect(raw.spells!.slice(0, 4)).toEqual(['EXPLODING_DEER', 'GRENADE_LARGE', 'ROCKET_TIER_3', 'GRENADE_TIER_3']);
    expect([wand.spellsPerCast, wand.castDelay, wand.rechargeTime, wand.manaMax]).toEqual([4, 13, 38, 980]);
    expect(Number.isInteger(wand.capacity)).toBe(true);
  });

  it('seed 123: which shops sell wands, and the spells in the third (noita-tools Shop.spec)', () => {
    use(123);
    const shops = holyMountainShops(host.call, SHOP_SPOTS);
    expect(shops).toHaveLength(7);
    expect(shops[0]!.type).toBe('wand');
    expect(shops[0]!.items).toHaveLength(5);
    const spells = (i: number) => shops[i]!.items.flatMap((it) => (it.kind === 'spell' ? [it.spell] : [])).sort();
    expect(shops[2]!.type).toBe('spell');
    expect(spells(2)).toEqual(['RECHARGE', 'CLOUD_ACID', 'TELEPORT_PROJECTILE_CLOSER', 'MANA_REDUCE', 'EXPLOSION_TINY', 'ROCKET_OCTAGON', 'PROPANE_TANK', 'GRENADE_TRIGGER', 'BULLET_TIMER', 'LIGHTNING'].sort());
    expect(shops[6]!.type).toBe('spell');
    expect(spells(6)).toEqual(['RANDOM_EXPLOSION', 'ROCKET_TIER_3', 'HOMING_CURSOR', 'CURSE_WITHER_MELEE', 'RECHARGE', 'RECOIL_DAMPER', 'BLACK_HOLE_BIG', 'HEAVY_SPREAD', 'BULLET_TIMER', 'MINE'].sort());
    // One item per shop is on sale, at half price.
    for (const s of shops) expect(s.items.filter((it) => it.sale).length).toBe(1);
  });

  it('other seeds: shop 5 of seed 5151515 and shop 7 of seed 123435616 sell spells', () => {
    use(5151515);
    expect(holyMountainShops(host.call, SHOP_SPOTS)[4]!.type).toBe('spell');
    use(123435616);
    expect(holyMountainShops(host.call, SHOP_SPOTS)[6]!.type).toBe('spell');
  });

  it('Extra Shop Item adds one to every shop', () => {
    use(123);
    const shops = holyMountainShops(host.call, SHOP_SPOTS, 1);
    expect(shops[0]!.items).toHaveLength(6);
    expect(shops[2]!.items).toHaveLength(12);
  });
});

describe('fungal shifts (fungal_shift.lua)', () => {
  it('seed 123: all 20 shifts, what a held flask does, and the flask-of-gold joke', () => {
    use(123);
    const got = fungalShifts(host.call).map((s) => [s.flask, s.from.join(','), s.to, s.goldTo, s.grassHolyTo]);
    expect(got).toEqual(SEED_123);
  });

  it('seed 1307857905 opens differently', () => {
    use(1307857905);
    const got = fungalShifts(host.call, 4).map((s) => [s.flask, s.from.join(','), s.to]);
    expect(got).toEqual([
      ['none', OIL, 'steam'],
      ['none', 'diamond', 'silver'],
      ['none', 'diamond', 'silver'],
      ['from', 'diamond', 'mimic_liquid'],
    ]);
  });
});
