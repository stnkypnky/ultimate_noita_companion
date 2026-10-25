// Shapes of the JSON files the extractor writes to public/game/. Shared by the app and tools/extract.

/** Written to public/game/version.json. */
export type GameVersion = {
  gameHash: string;
  branch: string;
  extractedAt: string;
  counts: Record<string, number>;
  /** Pixel size of each sprite atlas in game/sprites/. */
  atlases: Record<string, [number, number]>;
};

export const SPELL_TYPES = ['projectile', 'static', 'modifier', 'multicast', 'material', 'other', 'utility', 'passive'] as const;
export type SpellType = (typeof SPELL_TYPES)[number];

export const DAMAGE_TYPES = [
  'projectile', 'explosion', 'melee', 'slice', 'fire', 'electricity', 'ice', 'drill',
  'curse', 'holy', 'healing', 'radioactive', 'poison', 'physics_hit', 'overeating',
] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

/** Position of an icon inside a sprite atlas (pixels). */
export type Icon = { x: number; y: number; w: number; h: number };

export type Projectile = {
  file: string;
  /** Damage on hit, in HP (the game's internal units ×25). */
  damage: Partial<Record<DamageType, number>>;
  explosion?: { damage: number; radius: number; onDeath: boolean; onTimeout: boolean };
  /** Frames; -1 = endless. */
  lifetime: number;
  lifetimeRandom: number;
  speed: [number, number];
  /** Random direction spread, degrees. */
  spread: number;
  bounces: number;
  gravity: number;
  airFriction: number;
  knockback: number;
  penetrateWorld: boolean;
  penetrateEntities: boolean;
  dieOnCollision: boolean;
  friendlyFire: boolean;
  /** Seconds a damage field ticks for, when damage_every_x_frames is set. */
  damageEveryFrames: number;
  /** Status effects applied on hit (entity basenames). */
  effects: string[];
  /** Real material the projectile emits, if any. */
  material?: string;
};

export type Spell = {
  id: string;
  /** Position in gun_actions.lua (the game's own ordering). */
  index: number;
  name: string;
  description: string;
  type: SpellType;
  icon: Icon;
  mana: number;
  /** null = unlimited. */
  maxUses: number | null;
  neverUnlimited: boolean;
  price: number;
  spawn: { level: number; prob: number }[];
  /** Persistent flag needed before it can appear (secret unlocks). */
  requiresFlag?: string;
  recursive: boolean;
  /** How many extra spells it draws (multicasts, modifiers). */
  draw: number;
  /** Trigger spells: when the payload fires and how many spells it carries. */
  trigger?: { kind: 'hit' | 'timer' | 'death'; draw: number; delay?: number };
  /** Effect on the shot state, as seen by reflection (fire_rate_wait, spread_degrees, damage_*_add, ...). */
  stats: Record<string, number | string>;
  /** Frames added to recharge time. */
  reloadDelta: number;
  /** Projectile entity files (keys into projectiles.json). */
  projectiles: string[];
  extraEntities: string[];
  /** Persistent flag the game sets when you first pick this spell up. */
  discoverFlag: string;
};

export type Perk = {
  id: string;
  name: string;
  description: string;
  icon: Icon;
  stackable: boolean;
  stackableRare: boolean;
  maxStack?: number;
  maxInPool?: number;
  usableByEnemies: boolean;
  inDefaultPool: boolean;
  oneOff: boolean;
  removesOtherPerks: boolean;
  gameEffect?: string;
  discoverFlag: string;
};

export type Enemy = {
  /** Matches save00/stats/stats_<id>.xml. */
  id: string;
  name: string;
  icon: Icon;
  hp?: number;
  tags?: string[];
};

/** How the test range draws and moves an entity (spell projectile or modifier effect), keyed by entity file. */
export type EntityVisual = {
  sprite?: { icon: Icon; ox: number; oy: number; additive: boolean };
  trail?: { color: string; count: number };
  light?: { color: string; radius: number };
  homing?: { coeff: number; velocityMultiplier: number; detectDistance: number; rotateOnly: boolean; maxTurnRate: number; targetShooter: boolean };
  sine?: { freq: number; m: number };
  cellEater?: { radius: number; probability: number };
  /** LuaComponents: script basename + schedule. The range implements the common ones. */
  scripts?: { script: string; every: number; onAdded: boolean; times: number }[];
  physics?: {
    bounceEnergy: number;
    collideWithWorld: boolean;
    rotate: boolean;
    dieOnLowVelocity: boolean;
    /** velocity_sets_scale: drawn stretched along its motion. */
    streak: boolean;
    /** collide_with_shooter_frames: frames before friendly fire can hit the caster (-1 = never). */
    shooterGrace: number;
    /** explosion_dont_damage_shooter */
    spareShooter: boolean;
    groundPenetration?: { coeff: number; maxDurability: number };
    digs?: boolean;
    digDurability?: number;
    explosionColor?: string;
  };
  /** LaserEmitterComponent beam (plasma beams). damage is HP per frame. */
  laser?: { maxLength: number; beamRadius: number; damage: number; angleAdd: number; digDurability: number; color: string; emitting: boolean };
  /** AreaDamageComponent: damage (HP) per update to anything inside the box. */
  areaDamage?: { minX: number; minY: number; maxX: number; maxY: number; damage: number; every: number; enabled: boolean };
  /** LightningComponent: lightning bolts strike instantly along their path. */
  lightning?: { isProjectile: boolean; radius: number; damage: number; color: string };
  /** ArcComponent: an arc to the previous arc-carrying projectile. */
  arc?: { kind: 'lightning' | 'material'; color: string; material?: string; lifetime: number };
  teleport?: { minDistanceFromWall: number };
  hitEffect?: { effect: string; entity?: string };
  physicsBody?: { throwCoeff: number };
  vars?: Record<string, string>;
  tags?: string[];
};

/** Backdrop sprites for the test range (game/sprites/range_<key>.png). */
export type RangeProp = { w: number; h: number; ox: number; oy: number };

/** World pickups from data/entities/items/pickup/. */
export type Item = {
  id: string;
  name: string;
  description: string;
  icon: Icon;
  tags?: string[];
};

export type CellType = 'liquid' | 'gas' | 'solid' | 'fire' | 'powder' | 'sand' | string;

export type Material = {
  id: string;
  name: string;
  parent?: string;
  cellType: CellType;
  /** "liquid" can be static or sand-like; this is the finer-grained state the UI groups by. */
  state: 'liquid' | 'powder' | 'solid' | 'gas' | 'fire';
  tags: string[];
  /** #rrggbbaa */
  color: string;
  /** Path under game/materials/ to the texture tile, when there is one. */
  texture?: string;
  density: number;
  burnable: boolean;
  fireHp: number;
  hp: number;
  durability: number;
  conductive: boolean;
  electricalConductivity: boolean;
  onFire: boolean;
  temperatureOfFire: number;
  autoignitionTemperature: number;
  stickiness: number;
  liquidSand: boolean;
  liquidStatic: boolean;
  /** Status effects from contact / ingestion. */
  stains: string[];
  ingestion: string[];
  showInCreative: boolean;
};

/** One side of a reaction is either a material id or a "[tag]". */
export type Reaction = {
  probability: number;
  inputs: string[];
  outputs: string[];
  fast: boolean;
  requiresLifetime?: number;
  explosion?: boolean;
  /** Entity spawned by the reaction, if any. */
  entity?: string;
};

export type GameData = {
  spells: Spell[];
  projectiles: Record<string, Projectile>;
  perks: Perk[];
  enemies: Enemy[];
  items: Item[];
  materials: Material[];
  reactions: Reaction[];
  /** Default shot state from gunaction_generated.lua. */
  defaultState: Record<string, number | string | boolean>;
};
