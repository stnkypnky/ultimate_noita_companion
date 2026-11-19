// Points of interest worth a pin on the map, by the pixel scene file the game loads for them. Where the wiki
// describes a room it's named and described from there (each links its biome page); otherwise a plain name from
// the game's own file name, with no claims. Filler (chamfers, pillars, pipes, rubble, catwalks…) is left out.
import type { PoiKind } from '../../src/seed/poi.ts';

type Entry = { name: string; kind: PoiKind; text?: string };
const W = 'https://noita.wiki.gg/wiki/';
const I = 'data/biome_impl/';

const groups: { wiki: string; scenes: Record<string, Entry> }[] = [
  {
    wiki: `${W}Mines`,
    scenes: {
      'coalmine/laboratory': { name: 'Alchemy laboratory', kind: 'room', text: 'Potions on the shelves and a lava basin. An alchemist, Ukko or Stendari is always here.' },
      'coalmine/physics_swing_puzzle': { name: 'Rope-swing puzzle', kind: 'puzzle', text: 'Electrify the platform on the right for a chest.' },
      'coalmine/receptacle_oil': { name: 'Oil basin puzzle', kind: 'puzzle', text: 'Fill the hidden basin with oil for the Ruusu wand.' },
      'coalmine/oiltank_puzzle': { name: 'Basin puzzle', kind: 'puzzle' },
      'coalmine/slimepit': { name: 'Toxic cavity', kind: 'hazard', text: 'Toxic sludge and toxic slimes; sometimes a chest or max health at the bottom.' },
      'coalmine/radioactivecave': { name: 'Toxic rock passage', kind: 'hazard', text: 'Toxic rock walls; may hold a chest or max health in the middle.' },
      'coalmine/shrine01': { name: 'Shrine', kind: 'room' },
      'coalmine/shrine02': { name: 'Shrine', kind: 'room' },
      'coalmine/shrine01_alt': { name: 'Shrine', kind: 'room' },
      'coalmine/shrine02_alt': { name: 'Shrine', kind: 'room' },
      'coalmine/swarm': { name: 'Swarm room', kind: 'room' },
      'coalmine/swarm_alt': { name: 'Swarm room', kind: 'room' },
      'coalmine/symbolroom': { name: 'Symbol room', kind: 'room' },
      'coalmine/symbolroom_alt': { name: 'Symbol room', kind: 'room' },
      'coalmine/shop': { name: 'Shop', kind: 'shop' },
      'coalmine/shop_alt': { name: 'Shop', kind: 'shop' },
      ...Object.fromEntries(
        ['01', '02', '03', '04', '06', '07'].map((n) => [
          `coalmine/wandtrap_h_${n}`,
          { name: 'Trapped wand room', kind: 'treasure', text: 'Taking the wand sets off a trap. Kicking the trap box down disarms it.' } as Entry,
        ]),
      ),
      ...Object.fromEntries(
        ['oiltank_1', 'oiltank_2', 'oiltank_3', 'oiltank_4', 'oiltank_5', 'oiltank_alt'].map((n) => [
          `coalmine/${n}`,
          { name: 'Liquid vat', kind: 'hazard', text: 'A wooden vat of a random liquid or powder; some hide a chest or max health beneath.' } as Entry,
        ]),
      ),
    },
  },
  {
    wiki: `${W}Coal_Pits`,
    scenes: {
      'excavationsite/receptacle_steam': { name: 'Steam capsule puzzle', kind: 'puzzle', text: 'Turn its water to steam, or fill it with smoke, for the Kiekurakeppi wand.' },
      'excavationsite/meditation_cube': { name: 'Meditation cube', kind: 'secret', text: 'Stand by it for about 10 seconds: a portal opens to a chamber with a wand.' },
      ...Object.fromEntries(['01', '02', '03', '04'].map((n) => [`excavationsite/gunpowderpool_${n}`, { name: 'Gunpowder vat', kind: 'hazard', text: 'Catches fire easily.' } as Entry])),
      'excavationsite/shop': { name: 'Shop', kind: 'shop' },
      'excavationsite/shop_alt': { name: 'Shop', kind: 'shop' },
      'excavationsite/puzzleroom_01': { name: 'Puzzle room', kind: 'puzzle' },
      'excavationsite/puzzleroom_02': { name: 'Puzzle room', kind: 'puzzle' },
      'excavationsite/puzzleroom_03': { name: 'Puzzle room', kind: 'puzzle' },
    },
  },
  {
    wiki: `${W}Snowy_Depths`,
    scenes: {
      'snowcave/receptacle_water': { name: 'Water capsule puzzle', kind: 'puzzle', text: 'Pour in about 1¾ flasks of water for the Valtikka wand.' },
      'snowcave/buried_eye': { name: 'Buried Eye', kind: 'secret', text: 'Fill it with teleportatium: a portal opens to a snowy cavern with two wands.' },
      'snowcave/statue_hand': { name: 'Hand statue', kind: 'secret', text: 'One of eight the game hides in Snowy Depths; destroying three completes a secret.' },
      'snowcave/puzzle_capsule': { name: 'Capsule puzzle', kind: 'puzzle' },
      'snowcave/puzzle_capsule_b': { name: 'Capsule puzzle', kind: 'puzzle' },
      'snowcave/shop': { name: 'Shop', kind: 'shop', text: 'Sells four spells.' },
      'snowcave/snowcastle': { name: 'Hiisi outpost', kind: 'room', text: 'Snow and metal, with Hiisi and explosives inside.' },
      acidtank: { name: 'Acid container', kind: 'hazard', text: 'A large glass container full of acid.' },
      acidtank_2: { name: 'Acid container', kind: 'hazard', text: 'A large glass container full of acid.' },
      'snowcave/symbolroom': { name: 'Symbol room', kind: 'room' },
      'snowcave/camp': { name: 'Camp', kind: 'room' },
      'snowcave/verticalobservatory': { name: 'Observatory', kind: 'room' },
      'snowcave/verticalobservatory2': { name: 'Observatory', kind: 'room' },
      'snowcave/verticalobservatory_alt': { name: 'Observatory', kind: 'room' },
      'snowcave/verticalobservatory2_alt': { name: 'Observatory', kind: 'room' },
      'snowcave/horizontalobservatory': { name: 'Observatory', kind: 'room' },
      'snowcave/horizontalobservatory2': { name: 'Observatory', kind: 'room' },
      'snowcave/horizontalobservatory3': { name: 'Observatory', kind: 'room' },
      'snowcave/tinyobservatory': { name: 'Observatory', kind: 'room' },
      'snowcave/tinyobservatory2': { name: 'Observatory', kind: 'room' },
    },
  },
  {
    wiki: `${W}Hiisi_Base`,
    scenes: {
      'snowcastle/bar': { name: 'Hiisi Bar', kind: 'room', text: 'Breakable bottles, usually some whiskey flasks.' },
      'snowcastle/sauna': { name: 'Sauna', kind: 'treasure', text: 'A Kiuaskivi and the Vasta or Vihta wand.' },
      'snowcastle/kitchen': { name: 'Hiisi Kitchen', kind: 'room', text: 'Oil, sausages and cooked meat, always with a Kokkihiisi.' },
      'snowcastle/drill': { name: 'Drill', kind: 'hazard', text: 'Oil and gold in a glass chamber: lighting the oil fires a plasma beam.' },
      'snowcastle/teleroom': { name: 'Teleportatium vats', kind: 'room', text: 'Huge vats of teleportatium in dense steel.' },
      'snowcastle/polymorphroom': { name: 'Polymorph room', kind: 'hazard' },
      'snowcastle/acidpool': { name: 'Acid pool', kind: 'hazard' },
      'snowcastle/greenhouse': { name: 'Greenhouse', kind: 'room' },
      'snowcastle/cargobay': { name: 'Cargo bay', kind: 'room' },
      'snowcastle/bedroom': { name: 'Bedroom', kind: 'room' },
    },
  },
  {
    wiki: `${W}The_Vault`,
    scenes: {
      'vault/lab_puzzle': { name: 'Vat puzzle', kind: 'puzzle', text: 'Fill it with the liquid its two symbols ask for: the Varpuluuta or Arpaluu wand.' },
      'vault/brain_room': { name: 'Brain vat', kind: 'treasure', text: 'A brain in a vat of blood: a possible max health or chest spot.' },
      'vault/acidtank': { name: 'Acid vat', kind: 'hazard', text: 'The glass breaks easily and lets the acid out.' },
      'vault/shop': { name: 'Shop', kind: 'shop' },
      'vault/lab': { name: 'Laboratory', kind: 'room' },
      'vault/lab2': { name: 'Laboratory', kind: 'room' },
      'vault/lab3': { name: 'Laboratory', kind: 'room' },
      'vault/electric_tunnel_room': { name: 'Electric tunnel', kind: 'hazard' },
      'vault/symbolroom': { name: 'Symbol room', kind: 'room' },
    },
  },
  {
    wiki: `${W}Temple_of_the_Art`,
    scenes: {
      'crypt/cathedral': { name: 'Cathedral', kind: 'room' },
      'crypt/mining': { name: 'Mining hall', kind: 'room' },
      'crypt/polymorphroom': { name: 'Polymorph room', kind: 'hazard' },
      'crypt/lavaroom': { name: 'Lava room', kind: 'hazard' },
      'crypt/pit': { name: 'Pit', kind: 'hazard' },
      'crypt/symbolroom': { name: 'Symbol room', kind: 'room' },
      'crypt/shop': { name: 'Shop', kind: 'shop' },
      'crypt/shop_b': { name: 'Shop', kind: 'shop' },
      'crypt/room_liquid_funnel': { name: 'Liquid funnel room', kind: 'room' },
      'crypt/room_liquid_funnel_b': { name: 'Liquid funnel room', kind: 'room' },
      'crypt/room_gate_drop': { name: 'Gate room', kind: 'room' },
      'crypt/room_gate_drop_b': { name: 'Gate room', kind: 'room' },
    },
  },
  {
    wiki: `${W}Underground_Jungle`,
    scenes: {
      'rainforest/rainforest_statue_01': { name: 'Hint statue', kind: 'secret', text: 'Points its staff toward where a portal can be summoned.' },
      'rainforest/rainforest_statue_02': { name: 'Hint statue', kind: 'secret', text: 'Points its staff toward where a portal can be summoned.' },
      'rainforest/hut01': { name: 'Hut', kind: 'room' },
      'rainforest/hut02': { name: 'Hut', kind: 'room' },
      'rainforest/hut03': { name: 'Hut', kind: 'room' },
      'rainforest/base': { name: 'Base', kind: 'room' },
      'rainforest/symbolroom': { name: 'Symbol room', kind: 'room' },
      'rainforest/oiltank_01': { name: 'Liquid vat', kind: 'hazard' },
    },
  },
];

/**
 * Points of interest at fixed spots (data/biome/_pixel_scenes.xml, already in map.json's scenes): by scene file,
 * or `group:<name>` for a spliced scene made of several pieces (one pin over all of them).
 */
export const FIXED_POIS: Record<string, Entry & { wiki: string }> = {
  [`${I}snowcastle/forge.png`]: { name: 'Anvil', kind: 'secret', text: 'Throw an item marked broken onto it to repair it.', wiki: `${W}Hiisi_Base` },
  'group:tree': { name: 'The Tree', kind: 'secret', wiki: `${W}Tree` },
  'group:gourd_room': { name: 'Gourd room', kind: 'secret', wiki: `${W}Gourd` },
  'group:lake_statue': { name: 'Lake statue', kind: 'secret', wiki: `${W}Lake` },
  'group:skull_in_desert': { name: 'Skull in the desert', kind: 'secret', wiki: `${W}Desert` },
  'group:watercave': { name: 'Water cave', kind: 'secret', wiki: `${W}Mysteries_and_Oddities` },
  [`${I}huussi.png`]: { name: 'Outhouse', kind: 'secret', wiki: `${W}Mysteries_and_Oddities` },
  [`${I}fishing_hut.png`]: { name: 'Fishing hut', kind: 'room', wiki: `${W}Lake` },
  [`${I}bunker.png`]: { name: 'Bunker', kind: 'room', wiki: `${W}Lake` },
  [`${I}bunker2.png`]: { name: 'Bunker', kind: 'room', wiki: `${W}Lake` },
  [`${I}overworld/essence_altar.png`]: { name: 'Essence altar', kind: 'secret', wiki: `${W}Essences` },
  [`${I}overworld/essence_altar_desert.png`]: { name: 'Essence altar', kind: 'secret', wiki: `${W}Essences` },
  [`${I}overworld/music_machine_stand.png`]: { name: 'Music machine', kind: 'secret', wiki: `${W}Mysteries_and_Oddities` },
  [`${I}rainbow_cloud.png`]: { name: 'Rainbow cloud', kind: 'secret', wiki: `${W}Mysteries_and_Oddities` },
  [`${I}greed_treasure.png`]: { name: 'Greed treasure', kind: 'treasure', wiki: `${W}Mysteries_and_Oddities` },
  [`${I}tower_start.png`]: { name: 'Tower entrance', kind: 'room', wiki: `${W}Tower` },
};

/** How big a portal's pin box is (world pixels): about the size of its swirl in the game. */
export const PORTAL_SIZE = 48;
const B = 'data/entities/buildings/';
const portal = (name: string, wiki: string, text?: string): Entry & { wiki: string; w: number; h: number } => ({ name, kind: 'portal', wiki: `${W}${wiki}`, w: PORTAL_SIZE, h: PORTAL_SIZE, ...(text ? { text } : {}) });

/**
 * Portals, by their entity file (the game spawns them as entities, not scenes). Where they lead is worked out from
 * each one's TeleportComponent (map.json portalTargets), so the text only says what it is.
 */
export const PORTALS: Record<string, Entry & { wiki: string; w: number; h: number }> = {
  [`${B}teleport_liquid_powered.xml`]: portal('Holy Mountain portal', 'Holy_Mountain', 'At the bottom of each area: it takes you into the Holy Mountain below.'),
  [`${B}teleport_boss_arena.xml`]: portal('Portal to the Laboratory', 'The_Laboratory'),
  [`${B}teleport_ending.xml`]: portal('Portal to the Laboratory', 'The_Laboratory', 'The last mountain’s portals lead to the final boss.'),
  [`${B}teleport_lavalake.xml`]: portal('Lava Lake portal', 'Lava_Lake'),
  [`${B}teleport_hourglass.xml`]: portal('Hourglass portal', 'Hiisi_Base'),
  [`${B}teleport_hourglass_return.xml`]: portal('Way back from the Hourglass', 'Hiisi_Base'),
  [`${B}teleport_meditation_cube.xml`]: portal('Meditation cube portal', 'Coal_Pits'),
  [`${B}teleport_meditation_cube_return.xml`]: portal('Way back from the Meditation cube', 'Coal_Pits'),
  [`${B}teleport_snowcave_buried_eye.xml`]: portal('Buried eye portal', 'Snowy_Depths'),
  [`${B}teleport_snowcave_buried_eye_return.xml`]: portal('Way back from the Buried eye', 'Snowy_Depths'),
  [`${B}teleport_robot_egg_return.xml`]: portal('Way back from the Robot egg', 'Mysteries_and_Oddities'),
  [`${B}teleport_bunker_back.xml`]: portal('Bunker portal', 'Lake'),
  [`${B}teleport_lake.xml`]: portal('Portal to the Lake', 'Desert'),
  [`${B}teleport_desert.xml`]: portal('Portal to the Desert', 'Lake'),
  [`${B}teleport_end_wall.xml`]: portal('Portal back to the surface', 'Mysteries_and_Oddities'),
  [`${B}mystery_teleport.xml`]: portal('Mysterious portal', 'Mysteries_and_Oddities'),
  [`${B}mystery_teleport_back.xml`]: portal('Way back from the Tower', 'Tower'),
  ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`${B}teleport_teleroom_${n}.xml`, portal(`Portal room: portal ${n}`, 'Mysteries_and_Oddities')])),
  'data/entities/misc/summon_portal_target.xml': portal('Summon Portal opens here', 'Underground_Jungle', 'Where the Summon Portal spell opens a way, for this seed; hint statues stand around it.'),
};

/** The table, keyed by the full scene file as the scripts load it (portals by entity file). */
export const POI_TABLE: Record<string, Entry & { wiki: string; w?: number; h?: number }> = {
  ...Object.fromEntries(groups.flatMap((g) => Object.entries(g.scenes).map(([k, e]) => [`${I}${k}.png`, { ...e, wiki: g.wiki }]))),
  ...PORTALS,
};
