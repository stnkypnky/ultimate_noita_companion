// Companion descriptions for items whose in-game text is missing, a placeholder ("Lorem ipsum") or too thin
// to help. Each one is read from the game's own scripts (path given) or checked against noita.wiki.gg.
// Health in the game files is in units of 25 HP; gold timers are in frames at 60 fps.

export type LootRow = {
  /** Chance of this row on one roll, e.g. "33%". */
  odds: string;
  what: string;
  /** Names a late-game item: shown only after a tap. */
  secret?: boolean;
};

export type ItemInfo = {
  text: string;
  /** A noita.wiki.gg URL, or the data.wak path of the script it was read from. */
  source: string;
  /** Spoiler part: shown only after a tap. */
  secret?: string;
  loot?: { title: string; rows: LootRow[]; note?: string };
};

const WIKI = 'https://noita.wiki.gg/wiki/';

/** Nolla's placeholder for "no description yet". */
export const isPlaceholder = (text: string) => !text.trim() || /^lorem ipsum/i.test(text.trim());

const OPEN = 'Open it by picking it up, or break it with a kick or an explosion.';

const GOLD_TIMER = 'Like all gold it vanishes after 15 seconds on the ground unless you have Gold Is Forever. Greed doubles what each pickup is worth.';
const gold = (value: string, extra = ''): ItemInfo => ({
  text: `Worth ${value} gold, picked up by touching it. ${extra}${GOLD_TIMER}`,
  source: 'data/scripts/items/gold_pickup.lua',
});
const BLOOD =
  'Blood money only drops with Trick Blood Money (for accidental kills: enemies killed by the world, other enemies or themselves), with No Wand Tinkering (a 20% chance of a 50-gold one per kill), or from a Cruel Orb.';
const blood = (value: string, heal: string): ItemInfo => ({
  text: `Worth ${value} gold, and it heals ${heal} when picked up. ${BLOOD} It also vanishes after 15 seconds unless you have Gold Is Forever.`,
  source: 'data/scripts/items/drop_money.lua',
});


export const ITEM_INFO: Record<string, ItemInfo> = {
  // ── Chests ──────────────────────────────────────────────────────────────────────────────
  chest_random: {
    text: `A wooden chest with a random reward inside. ${OPEN}`,
    source: 'data/scripts/items/chest_random.lua',
    loot: {
      title: 'What’s inside',
      note: 'One roll of 1–100. A bomb gives the red “bad” sparkle instead of the gold one.',
      rows: [
        { odds: '7%', what: 'A lit bomb' },
        { odds: '33%', what: 'Gold: 7–20 small nuggets plus a 50, 200 or 1000 nugget (rarely a pile of all three)' },
        { odds: '10%', what: 'Potion (94%), powder pouch (4%) or a rare potion (2%)' },
        { odds: '4%', what: 'Spell refresher (98%) or an illusion of a Wind shaman (2%)' },
        { odds: '6%', what: 'A curiosity: Kammi, Kuu, Ukkoskivi, Paha Silmä, Kiuaskivi, a runestone, a Chaos die or a Shiny orb', secret: true },
        { odds: '5%', what: '1–5 random spells' },
        { odds: '19%', what: 'A wand: tier 1–2 most of the time, tier 3 (8%), tier 4 (2%)' },
        { odds: '11%', what: 'Extra max HP (88%), Large extra max HP (10%), Full health regeneration (1%) or a Dark alchemist illusion (1%)' },
        { odds: '3%', what: 'The chest itself turns into a block of gold' },
        { odds: '1%', what: 'Two more rolls' },
        { odds: '1%', what: 'Three more rolls' },
      ],
    },
  },
  chest_random_super: {
    text: `A rare glittering chest with much better loot than the ordinary one. ${OPEN}`,
    source: 'data/scripts/items/chest_random_super.lua',
    loot: {
      title: 'What’s inside',
      note: '40% of rolls give extra rolls, so it often drops several rewards. No bombs.',
      rows: [
        { odds: '10%', what: '3 potions, at least one of them rare' },
        { odds: '5%', what: 'A rain of gold' },
        { odds: '3%', what: 'Vuoksikivi (1 in 30: Kakkakikkare)', secret: true },
        { odds: '21%', what: 'A wand: tier 4–5 most of the time, tier 6 (9%), tier 10 (1%)' },
        { odds: '21%', what: 'Extra max HP (89%), Large extra max HP (10%) or Full health regeneration (1%)' },
        { odds: '38%', what: 'Two more rolls' },
        { odds: '2%', what: 'Three more rolls' },
      ],
    },
  },
  chest_leggy: {
    text: 'Looks exactly like a Treasure chest. It isn’t one.',
    source: 'data/scripts/items/chest_leggy.lua',
  },
  utility_box: {
    text: 'A crate that opens like a chest, mostly full of utility and modifier spells.',
    source: 'data/scripts/items/utility_box.lua',
    loot: {
      title: 'What’s inside',
      rows: [
        { odds: '2%', what: 'A lit bomb' },
        { odds: '3%', what: 'Spell refresher (98%) or a Wind shaman illusion (2%)' },
        { odds: '6%', what: 'A curiosity (same list as the Treasure chest)', secret: true },
        { odds: '86%', what: '2–6 random utility or modifier spells' },
        { odds: '2%', what: 'Two more rolls' },
        { odds: '1%', what: 'Three more rolls' },
      ],
    },
  },

  // ── Health ──────────────────────────────────────────────────────────────────────────────
  heart: {
    text:
      'Raises your max HP by 25. It doesn’t heal you. Found in chest spots (30% of them), and dropped by some bosses and by orbs. Stronger Hearts multiplies it: ×2 with one stack, then +0.25 per extra stack up to ×4.',
    source: 'data/scripts/items/heart.lua',
  },
  heart_better: {
    text: 'Raises your max HP by 50 (Stronger Hearts multiplies it). It doesn’t heal you. Mostly from chests: 10% of chest hearts are this one.',
    source: 'data/scripts/items/heart_better.lua',
  },
  heart_fullhp: {
    text:
      'Heals you to full health. Bosses drop one when they die. Every Holy Mountain also has one, and that version adds +10 max HP on top.',
    source: 'data/scripts/items/heart_fullhp_temple.lua',
  },

  // ── Holy Mountain ───────────────────────────────────────────────────────────────────────
  spell_refresh: {
    text: 'Refills the charges of every spell in every wand you carry. One sits in each Holy Mountain; chests and utility boxes also drop them.',
    source: 'data/scripts/items/spell_refresh.lua',
  },

  // ── Containers ──────────────────────────────────────────────────────────────────────────
  potion: {
    text:
      'Holds up to 1000 units of one or more liquids. Use it to drink, spray (right click) or throw it so it shatters; walk into a pool with it selected to fill it.',
    source: `${WIKI}Flask`,
  },
  jar: {
    text: 'Works like a flask and holds 1000 units: drink, spray or throw it. It’s rare: none of the regular spawn lists place it.',
    source: `${WIKI}Jar`,
  },
  powder_stash: {
    text:
      'A cloth pouch for powders (sand, gunpowder, gold…), holding 1500 units and filling twice as fast as a flask. Found in chests and in potion spots.',
    source: `${WIKI}Powder_Pouch`,
  },
  potion_mimic: {
    text: 'Looks like a full flask of healthium.',
    source: 'data/scripts/items/potion_mimic.lua',
    secret:
      'It’s a mimic: picking it up, touching it or breaking it turns it into a Potion mimic. Hover over it first; it shows as full of Mimicium. 1 in 200 potion spots below the first few areas hold one, and the Barren Temple always has one.',
  },
  egg_monster: {
    text: 'Throw it and it hatches where it breaks.',
    source: 'data/scripts/items/egg_hatch.lua',
  },

  // ── Gold ────────────────────────────────────────────────────────────────────────────────
  goldnugget: gold('10', 'Enemies drop 10 gold for every full 25 max HP they had (at least 10). '),
  goldnugget_50: gold('50'),
  goldnugget_200: gold('200'),
  goldnugget_1000: gold('1000'),
  goldnugget_10000: gold('10,000'),
  goldnugget_200000: gold('200,000'),
  bloodmoney_10: blood('10', '2 HP'),
  bloodmoney_50: blood('50', '5 HP'),
  bloodmoney_200: blood('200', '7.5 HP'),
  bloodmoney_1000: blood('1000', '7.5 HP'),
  bloodmoney_10000: blood('10,000', '7.5 HP'),
  bloodmoney_200000: blood('200,000', '20 HP'),
  goldnugget_x: {
    text:
      'When a single kill drops more than 2.2 million gold, everything above 2,000,000 comes as one golden statue instead of a pile of idols. ' + GOLD_TIMER,
    source: 'data/scripts/items/drop_money.lua',
  },
  bloodmoney_x: {
    text: 'The blood-money statue: it holds everything above 2,000,000 gold from one huge kill, and heals 1250 HP when picked up. ' + BLOOD,
    source: 'data/scripts/items/drop_money.lua',
  },

  // Runestones, dice, eggs and the gold orbs keep only the game's own hint ("You feel like kicking it");
  // what they actually do is in their hidden mechanics (src/data/itemMechanics.ts), behind the toggle.
  // Loot tables are shown there too.

  // ── Odds and ends ───────────────────────────────────────────────────────────────────────
  cape: {
    text:
      'A cape that would give a permanent effect: fire protection, radioactivity protection or underwater breathing, chosen at random, and recolour your cape to match. It doesn’t spawn in the current game: the shop line that placed it is commented out.',
    source: 'data/scripts/items/spawn_random_shop_item.lua',
  },

  // ── The Sun quest (all secret items) ────────────────────────────────────────────────────
  sunegg: {
    text:
      'The third stage of the Sun quest, made by setting off a big explosion next to an Aurinkokivi at the Moon or Dark Moon. It slowly dissolves, so feed it quickly: once 100 creatures die within 260 px of it, it hatches into Tähdenpoikanen.',
    source: 'data/scripts/buildings/sun/spot_3.lua',
  },
  sunbaby: {
    text:
      'The fourth stage of the Sun quest. It doesn’t dissolve. Bring it the four elemental stones (Kiuaskivi, Ukkoskivi, Tannerkivi, Vuoksikivi) at the Moon to make Uusi Aurinko; add a Kakkakikkare first at the Dark Moon to make Pimeä Aurinko.',
    source: `${WIKI}Sun_Quest`,
  },
  newsun: {
    text: 'The finished Sun: Tähdenpoikanen fed the four elemental stones at the Moon. Making it is one of the achievement pillars.',
    source: `${WIKI}Sun_Quest`,
  },
  newsun_dark: {
    text:
      'The Dark Sun: Tähdenpoikanen fed a Kakkakikkare and the four elemental stones at the Dark Moon. Making both suns, one at each moon, earns the crown.',
    source: `${WIKI}Sun_Quest`,
  },
};

export const itemInfo = (id: string): ItemInfo | undefined => ITEM_INFO[id];
