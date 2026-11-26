// How creatures fight when the extracted game data can't tell: their attacks live in child entities (Munkki's
// hands, a spider's legs) or in Lua the extractor doesn't read, so enemies.json lists no attacks and the
// Bestiary would call them harmless. Each entry was checked against the noita.wiki.gg page it links to.
// Creatures that really don't attack (fish, sheep, Skorpioni...) are left out on purpose.

export type CuratedAttack = { kind: 'melee' | 'ranged'; what: string; damage?: string };

export type FightOverride = {
  label: string;
  blurb: string;
  /** Shown in the attack table in place of the extracted attacks. */
  attacks?: CuratedAttack[];
  source: string;
};

const WIKI = 'https://noita.wiki.gg/wiki/';

const BRAWLER = 'Has to get close to hurt you.';
const SHOOTER = 'Shoots from range and fights up close too.';
const BOSS = 'A unique fight with its own rules.';

const spider = (damage: string): FightOverride => ({
  label: 'Brawler',
  blurb: BRAWLER,
  attacks: [{ kind: 'melee', what: 'Leg jab, with heavy knockback', damage }],
  source: `${WIKI}H%C3%A4m%C3%A4h%C3%A4kki`,
});

const spirit = (page: string): FightOverride => ({
  label: 'Hexer',
  blurb: 'Puts a status effect on every creature near it, you included.',
  source: `${WIKI}${page}`,
});

const tank: FightOverride = {
  label: 'Shooter',
  blurb: SHOOTER,
  attacks: [
    { kind: 'ranged', what: 'Machine gun (can stun you)', damage: '3.75 + 10 blast' },
    { kind: 'ranged', what: 'Grenade, at close range', damage: '32.5' },
    { kind: 'melee', what: 'Explodes when destroyed', damage: '75' },
  ],
  source: `${WIKI}KK-Tankki`,
};

export const FIGHTS: Record<string, FightOverride> = {
  monk: {
    label: 'Shooter',
    blurb: 'Its two floating hands shoot slow orbs at you.',
    attacks: [{ kind: 'ranged', what: 'Green orbs from its hands', damage: '20' }],
    source: `${WIKI}Munkki`,
  },
  lukki: spider('12.5'),
  lukki_longleg: spider('12.5'),
  lukki_tiny: spider('12.5'),
  lukki_creepy_long: spider('12.5'),
  lukki_dark: {
    label: 'Brawler',
    blurb: 'Grabs you in its jaws.',
    attacks: [{ kind: 'melee', what: 'Bite: damage every moment you’re in its jaws', damage: '52.5 / s' }],
    source: `${WIKI}Kammolukki`,
  },
  icer: {
    label: 'Shooter',
    blurb: 'Hits hard up close with an ice flamethrower.',
    attacks: [{ kind: 'ranged', what: 'Icethrower, leaves freezing vapour', damage: '25 blast' }],
    source: `${WIKI}J%C3%A4%C3%A4hdytyslaite`,
  },
  tank,
  tank_super: tank,
  tank_rocket: {
    label: 'Shooter',
    blurb: 'Fires homing rockets that knock you back.',
    attacks: [
      { kind: 'ranged', what: 'Homing rocket, about every 3 s', damage: '25 + 12.5 blast' },
      { kind: 'melee', what: 'Explodes when destroyed', damage: '75' },
    ],
    source: `${WIKI}IT-Tankki`,
  },
  tentacler: {
    label: 'Brawler',
    blurb: 'Whips you with a long tentacle and freezes anything that gets too close.',
    attacks: [
      { kind: 'melee', what: 'Tentacle whip, long reach', damage: '25' },
      { kind: 'melee', what: 'Freeze field when you come close' },
    ],
    source: `${WIKI}Turso`,
  },
  boss_ghost_polyp: {
    label: 'Kamikaze',
    blurb: 'Rushes in and blows up.',
    attacks: [{ kind: 'melee', what: 'Explodes when close to you', damage: '75 blast + 75 holy' }],
    source: `${WIKI}Unohdettu`,
  },
  bloodcrystal_physics: {
    label: 'Shooter',
    blurb: 'Drifts close, then fires energy spheres in every direction.',
    attacks: [{ kind: 'ranged', what: 'Eight energy spheres in all directions' }],
    source: `${WIKI}Verikristalli`,
  },
  failed_alchemist_b: {
    label: 'Aura',
    blurb: 'Hurts whatever stands in its field.',
    attacks: [{ kind: 'melee', what: 'Field that hurts you while you stand in it' }],
    source: `${WIKI}Ep%C3%A4alkemisti`,
  },
  // No attack of their own, but far from harmless.
  coward: { label: 'Support', blurb: 'Its shots teleport other creatures to where they land.', source: `${WIKI}Raukka` },
  hpcrystal: { label: 'Support', blurb: 'Heals a creature near it to full and briefly shields it.', source: `${WIKI}Elvytyskristalli` },
  snowcrystal: { label: 'Summoner', blurb: 'Summons ghostly creatures that do the fighting.', source: `${WIKI}Haamukivi` },
  berserkspirit: spirit('Viha-Aave'),
  confusespirit: spirit('Utu-Aave'),
  slimespirit: spirit('Neva-Aave'),
  weakspirit: spirit('Kaamo-Aave'),
  // Bosses the data doesn't flag as bosses.
  boss_dragon: {
    label: 'Boss',
    blurb: BOSS,
    attacks: [
      { kind: 'melee', what: 'Bite, close to instant death' },
      { kind: 'ranged', what: 'Fireballs and slow green orbs' },
    ],
    source: `${WIKI}Suomuhauki`,
  },
  fish_giga: {
    label: 'Boss',
    blurb: BOSS,
    attacks: [{ kind: 'ranged', what: 'Piercing orbs in eight directions, and shoots back when hurt' }],
    source: `${WIKI}Syv%C3%A4olento`,
  },
  maggot_tiny: {
    label: 'Boss',
    blurb: BOSS,
    attacks: [
      { kind: 'melee', what: 'Bite' },
      { kind: 'ranged', what: 'Homing shots from its body' },
    ],
    source: `${WIKI}Limatoukka`,
  },
  parallel_tentacles: {
    label: 'Boss',
    blurb: BOSS,
    attacks: [{ kind: 'ranged', what: 'Polymorphing, neutralizing, teleporting and blinding blasts; summons wands' }],
    source: `${WIKI}Sauvojen_tuntija`,
  },
};

/**
 * The Moves tile when the extracted data has no movement for a creature (it would say "Walks").
 * Only creatures whose wiki page says how they move; checked 2026-11-25.
 */
export const MOVES: Record<string, { moves: string; source: string }> = {
  boss_dragon: { moves: 'Flies, digs', source: `${WIKI}Suomuhauki` },
  boss_pit: { moves: 'Flies, digs', source: `${WIKI}Sauvojen_tuntija` },
  boss_centipede: { moves: 'Crawls', source: `${WIKI}Kolmisilm%C3%A4` },
  maggot_tiny: { moves: 'Flies', source: `${WIKI}Limatoukka` },
  ghost: { moves: 'Through walls', source: `${WIKI}Houre` },
  lukki: { moves: 'Climbs, digs', source: `${WIKI}H%C3%A4m%C3%A4h%C3%A4kki` },
  lukki_longleg: { moves: 'Climbs', source: `${WIKI}H%C3%A4m%C3%A4h%C3%A4kki` },
  lukki_dark: { moves: 'Climbs, digs', source: `${WIKI}Kammolukki` },
  fish_giga: { moves: 'Still', source: `${WIKI}Syv%C3%A4olento` },
  hpcrystal: { moves: 'Still', source: `${WIKI}Elvytyskristalli` },
  snowcrystal: { moves: 'Still', source: `${WIKI}Haamukivi` },
  shooterflower: { moves: 'Still', source: `${WIKI}Plasmakukka` },
};
