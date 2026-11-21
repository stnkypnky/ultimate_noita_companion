// What each biome modifier actually does, read from data/scripts/biome_modifiers.lua and the entities it spawns. The
// game itself only shows a line of flavour ("The air feels heavy..."); this is the companion's short, plain version.
import type { StatIconName } from '@/ui/game';

/** A small picture for an effect: a game stat icon, a material swatch, or a simple glyph. */
export type ModifierIcon =
  | { stat: StatIconName }
  | { material: string }
  | { glyph: 'heavy' | 'light' | 'dark' | 'invisible' | 'field' | 'ghost' | 'plant' | 'furniture' | 'tunnel' | 'shield' | 'orb' };

export type ModifierEffect = { icon: ModifierIcon; text: string; /** Creatures it adds (Bestiary ids). */ creatures?: string[] };

export type ModifierInfo = { name: string; effects: ModifierEffect[] };

const SRC = 'data/scripts/biome_modifiers.lua';
export const MODIFIER_SOURCE = SRC;

export const BIOME_MODIFIERS: Record<string, ModifierInfo> = {
  MOIST: {
    name: 'Humid',
    effects: [
      { icon: { stat: 'damage_fire' }, text: 'Fire goes out easily' },
      { icon: { stat: 'speed_multiplier' }, text: 'Projectiles lose speed as they fly' },
      { icon: { material: 'water' }, text: 'You get wet stains now and then' },
    ],
  },
  FOG_OF_WAR_REAPPEARS: {
    name: 'Lingering darkness',
    effects: [{ icon: { glyph: 'dark' }, text: 'Places you have seen slowly go dark again' }],
  },
  HIGH_GRAVITY: {
    name: 'Heavy',
    effects: [{ icon: { glyph: 'heavy' }, text: '1.5× gravity on you, creatures and projectiles (not physics objects or particles)' }],
  },
  LOW_GRAVITY: {
    name: 'Light',
    effects: [{ icon: { glyph: 'light' }, text: 'Half gravity on you, creatures and projectiles (not physics objects or particles)' }],
  },
  CONDUCTIVE: {
    name: 'Conductive',
    effects: [
      { icon: { stat: 'damage_electricity' }, text: 'Every material conducts electricity' },
      { icon: { stat: 'danger' }, text: 'Electric and laser traps, hanging wires' },
      { icon: { stat: 'damage_electricity' }, text: 'More of', creatures: ['thunderskull'] },
    ],
  },
  FREEZING: {
    name: 'Freezing',
    effects: [
      { icon: { stat: 'damage_ice' }, text: 'Liquids freeze' },
      { icon: { material: 'grass_ice' }, text: 'Grass and moss grow as ice' },
    ],
  },
  HOT: {
    name: 'Hot',
    effects: [
      { icon: { stat: 'damage_fire' }, text: 'Frozen things melt' },
      { icon: { material: 'grass_dry' }, text: 'Grass is dry and no mushrooms grow' },
      { icon: { material: 'water' }, text: 'Water barrels lie around' },
    ],
  },
  GOLD_VEIN: {
    name: 'Gold vein',
    effects: [{ icon: { material: 'gold' }, text: 'More gold in the rock' }],
  },
  GOLD_VEIN_SUPER: {
    name: 'Rich gold vein',
    effects: [{ icon: { material: 'gold' }, text: 'Gold all through the rock' }],
  },
  PLANT_INFESTED: {
    name: 'Overgrown',
    effects: [
      { icon: { glyph: 'plant' }, text: 'Root growers, hanging roots, patches of swamp and grass' },
      { icon: { glyph: 'plant' }, text: 'More of', creatures: ['shooterflower', 'bloom'] },
    ],
  },
  FURNISHED: {
    name: 'Furnished',
    effects: [
      { icon: { glyph: 'furniture' }, text: 'Beds, chairs, tables, wardrobes and more' },
      { icon: { glyph: 'furniture' }, text: 'A chest among them may bite', creatures: ['chest_mimic'] },
    ],
  },
  BOOBY_TRAPPED: {
    name: 'Booby-trapped',
    effects: [{ icon: { stat: 'damage_explosion' }, text: 'Mines lie around' }],
  },
  PERFORATED: {
    name: 'Perforated',
    effects: [
      { icon: { glyph: 'tunnel' }, text: 'Holes and tunnels through the rock' },
      { icon: { glyph: 'tunnel' }, text: 'More of', creatures: ['worm_tiny', 'worm', 'worm_big'] },
    ],
  },
  SPOOKY: {
    name: 'Spooky',
    effects: [
      { icon: { glyph: 'ghost' }, text: 'Tombstones, and spots that spawn little ghosts' },
      { icon: { glyph: 'ghost' }, text: 'More of', creatures: ['confusespirit', 'berserkspirit', 'slimespirit'] },
    ],
  },
  GRAVITY_FIELDS: {
    name: 'Gravity fields',
    effects: [{ icon: { glyph: 'field' }, text: 'Glowing fields that pull you in, or push you away' }],
  },
  FUNGAL: {
    name: 'Fungal',
    effects: [
      { icon: { glyph: 'plant' }, text: 'Fungus growths everywhere' },
      { icon: { glyph: 'plant' }, text: 'More of', creatures: ['fungus', 'blob', 'fungus_big'] },
    ],
  },
  FLOODED: {
    name: 'Flooded',
    effects: [
      { icon: { material: 'water' }, text: 'Leaky pipes and pockets of water' },
      { icon: { material: 'water' }, text: 'More of', creatures: ['shaman'] },
    ],
  },
  GAS_FLOODED: {
    name: 'Gas-flooded',
    effects: [
      { icon: { material: 'acid_gas' }, text: 'Pipes leaking acid gas' },
      { icon: { material: 'acid_gas' }, text: 'More of', creatures: ['acidshooter', 'giantshooter'] },
    ],
  },
  SHIELDED: {
    name: 'Shielded',
    effects: [{ icon: { glyph: 'shield' }, text: 'Creatures get energy shields; forcefield generators stand around' }],
  },
  PROTECTION_FIELDS: {
    name: 'Sunlit',
    effects: [{ icon: { glyph: 'shield' }, text: 'Glowing fields make anything inside them briefly immune to all damage' }],
  },
  OMINOUS: {
    name: 'Ominous',
    effects: [{ icon: { glyph: 'orb' }, text: 'Dark orbs that open a big black hole when you touch one' }],
  },
  INVISIBILITY: {
    name: 'Unseen',
    effects: [{ icon: { glyph: 'invisible' }, text: 'Creatures here turn invisible' }],
  },
  WORMY: {
    name: 'Wormy',
    effects: [{ icon: { glyph: 'tunnel' }, text: 'More of', creatures: ['worm_tiny', 'worm', 'worm_big'] }],
  },
};
