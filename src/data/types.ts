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
  /** VelocityComponent terminal_velocity: top speed, px/s. */
  terminalVelocity?: number;
  knockback: number;
  penetrateWorld: boolean;
  /** penetrate_world_velocity_coeff: speed multiplier while inside terrain (default 0.6). */
  penetrateWorldCoeff?: number;
  penetrateEntities: boolean;
  dieOnCollision: boolean;
  /** die_on_liquid_collision */
  dieOnLiquid?: boolean;
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

/** One SpriteComponent: its animation frames in the projectile atlas, played from the entity's birth. */
export type SpriteLayer = {
  frames: Icon[];
  /** Seconds per frame. */
  wait: number;
  loop: boolean;
  /** Pivot inside a frame, in game pixels. */
  ox: number;
  oy: number;
  additive: boolean;
  emissive: boolean;
  alpha: number;
  /** Game pixels per atlas pixel (frames larger than the atlas allows are stored shrunk). */
  scale: number;
  /** special_scale_x/y */
  sx?: number;
  sy?: number;
};

/** ParticleEmitterComponent: cosmetic particles (and, with real_particles, material cells) an entity sheds. */
export type Emitter = {
  material: string;
  /** #rrggbb of the material. */
  color: string;
  alpha: number;
  /** Fire-type materials (sparks, plasma) glow. */
  glow: boolean;
  /** Also puts real material into the world. */
  real: boolean;
  countMin: number;
  countMax: number;
  /** Frames between emissions. */
  intervalMin: number;
  intervalMax: number;
  /** Seconds a particle lives. */
  lifetimeMin: number;
  lifetimeMax: number;
  offset: [number, number];
  posMin: [number, number];
  posMax: [number, number];
  velMin: [number, number];
  velMax: [number, number];
  gravity: [number, number];
  airflow: number;
  fade: boolean;
  /** Emits along the path moved since last frame, one batch every trail_gap pixels. */
  trail: boolean;
  trailGap: number;
  /** Spawns within a ring around the entity. */
  area?: [number, number];
  awayFromCenter: boolean;
  /** Drawn as a streak along its velocity. */
  long: boolean;
  /** Emits while the entity lives (is_emitting). */
  emitting: boolean;
  delayFrames: number;
  /** Frames the emitter keeps going (-1 = for the entity's life). */
  lifetimeFrames: number;
  friction: number;
};

/** config_explosion: how a projectile's explosion looks and what it leaves. */
export type ExplosionVisual = {
  sprite?: SpriteLayer;
  randomRotation: boolean;
  sparks: { min: number; max: number; color: string; glow: boolean } | null;
  light?: { color: string; fadeTime: number };
  cameraShake: number;
  /** Material the blast fills its hole with (fire, smoke, slime...). */
  cell?: { material: string; probability: number };
  /** Entities spawned at the blast (fire, smoke clouds, particle swirls). */
  entities: string[];
  rayEnergy: number;
  maxDurability: number;
  hole: boolean;
};

/** How the test range draws and moves an entity (spell projectile or modifier effect), keyed by entity file. */
export type EntityVisual = {
  /** Sprite layers, back to front. */
  sprites?: SpriteLayer[];
  /** Made with its ProjectileComponent switched off: waits in place until a script launches it. */
  held?: boolean;
  /** No ProjectileComponent or VelocityComponent: it stays where it's made, for its LifetimeComponent. */
  inert?: boolean;
  emitters?: Emitter[];
  explosion?: ExplosionVisual;
  /** Muzzle flash entity shown at the wand tip when cast, and the flash of light. */
  muzzle?: string;
  shootLight?: { color: string; radius: number };
  /** Plays its sprite once, then removes itself (kill_entity_after_finished). */
  killAfterAnim?: boolean;
  /** LifetimeComponent: frames until the entity removes itself. */
  lifetime?: number;
  trail?: { color: string; count: number };
  light?: { color: string; radius: number };
  homing?: { coeff: number; velocityMultiplier: number; detectDistance: number; rotateOnly: boolean; maxTurnRate: number; targetShooter: boolean; enabled?: false };
  sine?: { freq: number; m: number };
  cellEater?: { radius: number; probability: number };
  /** LuaComponents: script basename + schedule. The range implements the common ones. */
  scripts?: { script: string; every: number; onAdded: boolean; onRemoved?: boolean; times: number }[];
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

/** A RectAnimation on the player's sprite sheet. */
export type RangeAnim = {
  x: number;
  y: number;
  w: number;
  h: number;
  count: number;
  perRow: number;
  /** Seconds per frame. */
  wait: number;
  loop: boolean;
  /** The arm's root (right_arm_start hotspot) on each frame, from the frame's top-left. */
  arm: [number, number][];
};

/** One of the game's wand sprites (data/scripts/gun/procedural/wands.lua), in the stat space the game matches wands with. */
export type WandSprite = {
  name: string;
  icon: Icon;
  grip: [number, number];
  tip: [number, number];
  fireRateWait: number;
  actionsPerRound: number;
  shuffle: number;
  deckCapacity: number;
  spreadDegrees: number;
  reloadTime: number;
};

/** The player in the test range: game sprites and player_base.xml constants (data/range_kit.json). */
export type RangeKit = {
  player: {
    anims: Record<string, RangeAnim>;
    /** Entity position on a frame (the sprite's offset_x/offset_y). */
    pivot: [number, number];
    /** Rows from a frame's top to just below the feet. */
    feet: number;
    /** CharacterPlatformingComponent (px/s, px/s², per-frame blend factors). */
    move: {
      runVelocity: number;
      accelX: number;
      gravity: number;
      jumpVelocityY: number;
      jumpVelocityX: number;
      velocityMinX: number;
      velocityMaxX: number;
      velocityMinY: number;
      velocityMaxY: number;
      flyVelocityX: number;
      flySpeedMaxUp: number;
      flySpeedMaxDown: number;
      flySpeedMult: number;
      flySpeedChangeSpd: number;
      climbOverY: number;
    };
    /** CharacterDataComponent levitation: seconds of flight, refill per second in the air / on ground. */
    flight: { timeMax: number; rechargeAir: number; rechargeGround: number; airWaitFrames: number; needsRecharge: boolean };
    /** Max HP. */
    hp: number;
    /** DamageModelComponent fire_damage_amount, in HP: what burning takes per second. */
    fireDamage: number;
    /** materials_that_damage → materials_how_much_damage, in HP per frame of contact. */
    materialDamage: Record<string, number>;
    /** Damage hitbox around the entity position. */
    hitbox: { minX: number; maxX: number; minY: number; maxY: number };
  };
  arm: { w: number; h: number; ox: number; oy: number; hand: [number, number] };
  wands: WandSprite[];
  cursor: { w: number; h: number };
  /**
   * Status effect entities (data/entities/misc/effect_*.xml, by basename): the GameEffect they apply,
   * for how many frames (-1 = until removed), whether it stops movement, and the game's indicator icon.
   */
  effects: Record<string, { effect: string; frames: number; stops: boolean; icon?: Icon }>;
};

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
  /** Frames a cell lasts before vanishing (gases, fire); 0 = forever. */
  lifetime?: number;
  /** gfx_glow: drawn glowing. */
  glow?: boolean;
  /** How strongly the liquid/powder falls. */
  liquidGravity?: number;
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
  /** Only with the second material on this side of the first (moss grows on top of rock). */
  direction?: string;
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
