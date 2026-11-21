// How things are unlocked or obtained. The detail pages keep this behind its own "Show how to unlock"
// toggle, separate from hidden mechanics, because it names bosses, rooms and quests outright.
// Read from the game's scripts (path given) or noita.wiki.gg.
import type { MechanicNote } from './mechanics';

const WIKI = 'https://noita.wiki.gg/wiki/';
const n = (text: string, source: string): MechanicNote => ({ text, source });

const boss = (name: string, file: string) => n(`Beat ${name}. The unlock carries over to every future run.`, file);
const orb = (where: string) => n(`Pick up the Orb of True Knowledge ${where}. Every orb you collect unlocks its spells for future runs.`, `${WIKI}Orb_of_True_Knowledge`);
const TOWER = 'data/scripts/magic/towercheck.lua';
const HUT = (tablet: string, what: string) =>
  n(
    `Throw ${tablet} into the Alchemist’s hut on the east edge of the Lake, then take the portal that opens: it leads to a room below with ${what}. Picking them up unlocks them.`,
    `${WIKI}Red_Glimmer`,
  );

/** One note per `card_unlocked_*` persistent flag (a spell's `requiresFlag`, or an item's flag). */
export const FLAG_UNLOCKS: Record<string, MechanicNote> = {
  card_unlocked_duplicate: boss('Ylialkemisti', 'data/entities/animals/boss_alchemist/death.lua'),
  card_unlocked_pyramid: boss('Kolmisilmän koipi', 'data/entities/animals/boss_limbs/boss_limbs_death.lua'),
  card_unlocked_rain: boss('Sauvojen tuntija', 'data/entities/animals/boss_pit/boss_pit_death.lua'),
  card_unlocked_mestari: boss('Mestarien mestari', 'data/entities/animals/boss_wizard/death.lua'),
  card_unlocked_homing_wand: n('Kill Mestarien mestari by drowning it in swamp water.', 'data/entities/animals/boss_wizard/death.lua'),
  card_unlocked_polymorph: boss('Tapion vasalli', 'data/entities/animals/boss_spirit/islandspirit.lua'),
  card_unlocked_dragon: boss('Suomuhauki', 'data/scripts/animals/boss_dragon_death.lua'),
  card_unlocked_alchemy: n('Open the Dark chest with the Alchemist’s key. It drops these spells the first time.', 'data/scripts/buildings/chest_dark.lua'),
  card_unlocked_musicbox: n('Open the Coral chest with the Alchemist’s key. It drops these spells the first time.', 'data/scripts/buildings/chest_light.lua'),
  card_unlocked_everything: n('Open the steel chest inside the Robotic Egg, at the end of The End of Everything quest.', `${WIKI}The_End_of_Everything`),
  card_unlocked_fish: n('Throw a Leukaluu (jawbone) onto the Hiisi Anvil: it turns into this spell.', 'data/scripts/buildings/forge_item_convert.lua'),
  card_unlocked_piss: n('Use an outhouse: the first time, it gives this spell; afterwards it gives gold.', 'data/scripts/buildings/huussi.lua'),
  card_unlocked_destruction: n('Stand at the altar on the Moon after taking the four elemental essences (fire, air, water and earth) in the same run.', 'data/scripts/magic/moon_altar.lua'),
  card_unlocked_nukegiga: n('Bring Kauhuhirviö (on foot or driving the racing cart) to the Avarice Diamond in The Tower.', TOWER),
  card_unlocked_bomb_holy_giga: n('Bring a Toveri to the Avarice Diamond in The Tower.', TOWER),
  card_unlocked_divide: n('Reach the Avarice Diamond in The Tower yourself while the Greed curse is on.', TOWER),
  card_unlocked_touch_grass: n('Fill the pool in the Ominous Temple with Ominous Liquid; Sea of Mimicium is the easiest way.', `${WIKI}Touch_of_Grass`),
  card_unlocked_cessation: n('Cast Touch of Grass at the sigil in the Barren Temple.', `${WIKI}Cessation`),
  card_unlocked_sea_mimic: n('Awaken 10 Potion mimics in the Henkevä Temple; the spell appears once the tenth wakes.', 'data/biome_impl/static_tile/puzzle_logic_potion_mimics.lua'),
  card_unlocked_black_hole: n('Finish the Sun quest for both the Sun and the Dark Sun. The spells then appear on the Celestial Scale east of the Pyramid.', 'data/scripts/biomes/scale.lua'),
  card_unlocked_crumbling_earth: orb('on top of the Pyramid'),
  card_unlocked_sea_lava: orb('on the floating island with the Mountain Altar, above the Mines entrance'),
  card_unlocked_tentacle: orb('beneath the Frozen Vault, left of the Giant Tree'),
  card_unlocked_nuke: orb('below the Lava Lake'),
  card_unlocked_necromancy: orb('at the bottom of the Sandcave, below the Pyramid'),
  card_unlocked_bomb_holy: orb('in the orb room left of the Magical Temple'),
  card_unlocked_spiral_shot: orb('in the Lukki Lair, west of the Underground Jungle'),
  card_unlocked_cloud_thunder: orb('in the orb room past the abyss right of the Lava Lake'),
  card_unlocked_firework: orb('in the centre of The Work (Hell)'),
  card_unlocked_exploding_deer: orb('at the bottom of the Snowy Chasm'),
  card_unlocked_material_cement: orb('at the bottom of the Wizard’s Den, east of the Temple of the Art'),
  card_unlocked_paint: HUT('an Emerald Tablet', 'an Experimental Wand and the Glimmer spells'),
  card_unlocked_maths: HUT('a Stone Tablet (a reforged Emerald Tablet)', 'an Experimental Wand and the Requirement spells'),
  card_unlocked_funky: n('Find it on the Experimental Wand in the Power Plant. Picking it up unlocks it.', `${WIKI}%3F%3F%3F_(Spell)`),
  card_unlocked_ocarina: n('Found with the Huilu wand on a platform in the upper right of the Cloudscape, above the bridge over the Frozen Vault chasm.', `${WIKI}Ocarina`),
  card_unlocked_kantele: n('Found with the Kantele wand inside the Giant Tree.', `${WIKI}Kantele`),
  card_unlocked_rainbow_trail: n('Found on a floating platform high in the sky, straight above the wooden figure on the Lake island.', `${WIKI}Rainbow_Trail`),
};

const ESS = `${WIKI}Essences`;
/** The flask spawn list also fills item pedestals; `odds` of its 91 rolls give this item. */
const spots = (odds: string) => n(`Takes ${odds} of the spots where a flask could lie, item pedestals included.`, 'data/scripts/item_spawnlists.lua');
const curio = n('Treasure chests and Utility boxes can hold one: a 6% curiosity roll, then 1 in 8.', 'data/scripts/items/chest_random.lua');
const RUNE = [
  n('Takes 1 in 91 of the spots where a flask could lie (item pedestals included), split between the seven runestones. 1 in 10 of those are already switched on.', 'data/scripts/item_spawnlists.lua'),
  n('Treasure chests and Utility boxes can hold one too: a 6% curiosity roll, then 1 in 8, then 1 in 7.', 'data/scripts/items/chest_random.lua'),
];
const eater = (essence: string) => n(`Or take ${essence}, then let an Essence Eater draw it out of you: it leaves this stone behind.`, `${WIKI}Items`);
const SUN = `${WIKI}Sun_Quest`;

/** How to get each item that's hard to find. Flag-gated items also get their flag's note. */
export const ITEM_UNLOCKS: Record<string, MechanicNote[]> = {
  physics_die: [FLAG_UNLOCKS.card_unlocked_duplicate!, n('After that, it turns up on item pedestals and in chests.', 'data/scripts/item_spawnlists.lua')],
  physics_greed_die: [n('Replaces the Chaos die while the Greed curse is on, so you need both: Ylialkemisti beaten, and the curse taken.', 'data/scripts/item_spawnlists.lua')],
  physics_gold_orb_greed: [n('Replaces the Shiny orb on pedestals and in chests while the Greed curse is on.', 'data/scripts/item_spawnlists.lua')],
  greed_curse: [n('Always on a Diamond Brickwork pedestal near the first branch of the Giant Tree.', `${WIKI}Eternal_Wealth`)],
  essence_fire: [n('In a small pocket of water underground, below the wooden figure on the Lake island.', ESS)],
  essence_laser: [n('In a grey brickwork diamond in a hidden room along the east edge of the world.', ESS)],
  essence_air: [n('In a grey brickwork diamond floating in a hidden room in the middle of the western Cloudscape.', ESS)],
  essence_water: [n('In a grey brickwork diamond in a hidden room at the far west of The Work (Hell).', ESS)],
  essence_alcohol: [n('In a hidden room in the deepest part of the Lake.', ESS)],
  evil_eye: [n('One always sits on a small spire left of the Giant Tree.', `${WIKI}Paha_Silm%C3%A4`), curio],
  moon: [curio, n('Flask spots in the Ancient Laboratory hold one 6 times in 86.', 'data/scripts/item_spawnlists.lua')],
  safe_haven: [curio],
  ...Object.fromEntries(['disc', 'fireball', 'laser', 'lava', 'metal', 'null', 'slow'].map((r) => [`runestone_${r}`, RUNE])),
  broken_wand: [spots('4 in 91')],
  brimstone: [spots('4 in 91'), curio, eater('Essence of Fire')],
  waterstone: [n('Great treasure chests hold one 3% of the time.', 'data/scripts/items/chest_random_super.lua'), eater('Essence of Water')],
  thunderstone: [spots('2 in 91'), curio, eater('Essence of Air')],
  poopstone: [n('Great treasure chests very rarely hold one: 1 in 30 of their Vuoksikivi rolls.', 'data/scripts/items/chest_random_super.lua'), eater('Essence of Spirits')],
  stonestone: [eater('Essence of Earth')],
  wandstone: [n('Dropped by Mestarien mestari.', `${WIKI}Items`)],
  musicstone: [n('In a hidden room above the Magical Temple in the Snowy Depths. It can also turn up in parallel worlds.', `${WIKI}Kuulokivi`)],
  beamstone: [n('Appears when you take the Summon Sädekivi perk.', `${WIKI}Items`)],
  summon_portal_broken: [n('Kick the three hand statues in the Snowy Depths.', `${WIKI}Broken_Spell`)],
  potion_mimic: [n('Always found in the Barren Temple, and 1 in 200 potions on pedestals is one.', `${WIKI}Potion_Mimic`)],
  chest_leggy: [n('Takes 1 in 20 of the chest spots that become mimics, deeper than the first few areas.', 'data/scripts/biome_scripts.lua')],
  sunseed: [n('Dropped by Unohdettu, the ghost that appears in parallel worlds.', SUN)],
  sunstone: [n('Drop an Auringonsiemen on top of the Pyramid.', SUN)],
  sunegg: [n('Set off a big enough explosion next to an Aurinkokivi.', SUN)],
  sunbaby: [n('Feed an Auringonmuna 100 kills and it grows into this.', SUN)],
  newsun: [n('Take the grown Tähdenpoikanen to the Moon and add the four elemental stones.', SUN)],
  newsun_dark: [n('As for Uusi Aurinko, but at the Dark Moon, adding a Kakkakikkare before the last elemental stone.', SUN)],
};
