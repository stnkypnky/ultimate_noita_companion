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
  /** `strike`: a lightning projectile's blast where its strike lands (LightningComponent), not on death. */
  explosion?: { damage: number; radius: number; onDeath: boolean; onTimeout: boolean; strike?: boolean };
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
  /** VelocityComponent mass (knockback scales with it). */
  mass?: number;
  knockback: number;
  penetrateWorld: boolean;
  /** penetrate_world_velocity_coeff: speed multiplier while inside terrain (default 0.6). */
  penetrateWorldCoeff?: number;
  penetrateEntities: boolean;
  dieOnCollision: boolean;
  /** die_on_liquid_collision */
  dieOnLiquid?: boolean;
  friendlyFire: boolean;
  /** damage_scaled_by_speed: hit damage × speed / initial speed (or / maxSpeed when set). */
  speedDamage?: { maxSpeed?: number };
  /** die_on_low_velocity: it fizzles below this speed, px/s. */
  lowVelocityLimit?: number;
  /** Its blast can hurt the caster (explosion_dont_damage_shooter is off). */
  hurtsCaster?: boolean;
  /** Thrown physics body (bombs): PhysicsThrowableComponent throw_force_coeff. */
  throwCoeff?: number;
  /** Seconds a damage field ticks for, when damage_every_x_frames is set. */
  damageEveryFrames: number;
  /** Status effects applied on hit (entity basenames). */
  effects: string[];
  /** Real material the projectile emits, if any. */
  material?: string;
  /**
   * Tagged `hittable` with a DamageModelComponent (Pollen, mines, pipe bombs, summoned flies): other
   * projectiles collide with it and can kill it. HP, hitbox (min x, max x, min y, max y) and damage multipliers.
   */
  target?: { hp: number; box: [number, number, number, number]; multipliers?: Partial<Record<DamageType, number>> };
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
  /** The Progress-screen icon (enemies atlas). */
  icon: Icon;
  /** The creature's own sprite, first frame (bestiary atlas). */
  portrait?: Icon;
  /** Entity file it was read from. */
  file?: string;
  hp?: number;
  tags?: string[];
  boss?: boolean;
  /** Damage multipliers other than 1 (0.5 = takes half, 0 = immune, 2 = double). */
  resist?: Partial<Record<DamageType, number>>;
  /** materials_that_damage: HP lost per second of contact (or % of max HP a second when ofMaxHp). */
  hurtBy?: { material: string; perSecond: number; ofMaxHp?: boolean }[];
  /** Status immunities and things that don't work on it. */
  immune?: string[];
  /** Plain-word traits: doesn't breathe, doesn't burn, resists critical hits… */
  traits?: string[];
  /** What it bleeds: the spray when hit (blood_spray_material) and blood_material's particles. */
  bleeds?: { hit: string; spray?: string };
  /** Gold dropped when killed (before perks). */
  gold?: number;
  attacks?: { kind: 'melee' | 'dash' | 'ranged' | 'bite'; damage?: [number, number]; projectile?: string; count?: [number, number]; range?: number }[];
  moves?: { speed?: number; flies?: boolean; digs?: boolean };
  /** GenomeDataComponent herd (who it fights alongside). */
  herd?: string;
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

/** SpriteParticleEmitterComponent: animated sprite particles an entity sheds (glitter clouds, sparkles). */
export type SpriteEmitter = {
  sprite: SpriteLayer;
  /** Frames between emissions, and how many each time (count_min defaults to 0 in the engine). */
  intervalMin: number;
  intervalMax: number;
  countMin: number;
  countMax: number;
  /** Seconds: lifetime + randomize_lifetime. 0 means the sprite's own play-through. */
  lifetime: [number, number];
  velocity: [number, number];
  velMin: [number, number];
  velMax: [number, number];
  posMin: [number, number];
  posMax: [number, number];
  gravity: [number, number];
  /** sprite_random_rotation: turned a random multiple of 90°. */
  randomRotation: boolean;
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
  /** hole_destroy_liquid="0": the blast leaves liquids alone (Lightning Bolt, physics bombs). */
  keepLiquid?: boolean;
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
  spriteEmitters?: SpriteEmitter[];
  /** LoadEntitiesComponent: entities made when this one appears (Glitter bomb's blast makes 12 shards). */
  loads?: { file: string; min: number; max: number }[];
  /** SetStartVelocityComponent: velocity + a random direction and speed, set when it appears. */
  startVelocity?: { velocity: [number, number]; speed: [number, number]; angle: [number, number] };
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
  /** Its game path (data/items_gfx/wands/wand_XXXX.png), as gun_procedural's SetWandSprite gets it. */
  file?: string;
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
    /** CharacterDataComponent mass (knockback divides by it). */
    mass?: number;
    /** In liquid, velocity *= swimDrag each frame, and x also *= swimDragX. */
    swimDrag?: number;
    swimDragX?: number;
    /** DamageModelComponent fire_damage_amount, in HP (kept for reference; burning is 2% of max HP a second). */
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
  /** Thrown, it hurts what it hits: melee damage (HP) at maxSpeed px/s, scaled by speed. */
  thrown?: { damage: number; maxSpeed: number; hitsPlayer: boolean };
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
  /** What it looks like on the whole: its texture's average colour (#rrggbb), when it has a texture. */
  look?: string;
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

/** A biome on the world map (data/biome/<id>.xml). */
export type MapBiome = {
  id: string;
  file: string;
  /** In-game name, '' for the unnamed filler biomes. */
  name: string;
  /** Its colour in biome_map.png. */
  color: string;
  /** Main rock material (widest <MaterialComponent>). */
  material?: string;
  /** data/weather_gfx/<background>.png. */
  background?: string;
  /** Generated from wang tiles (a cave biome). */
  wang: boolean;
  /** game/wang/<wangTemplate>.png: its wang tile template (for the seed's cave layout). */
  wangTemplate?: string;
  /** <RandomMaterials>: a colour in the layout that becomes one of these (rrggbb). */
  randomMaterials?: { from: string; to: string[] }[];
};

/** A pixel scene placed at a fixed world position. */
export type MapScene = {
  id: string;
  file: string;
  /** Which list placed it (pixel_scenes, background_images, or a spliced scene's name). */
  from: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Key of its picture under game/map/. */
  image?: string;
  background?: string;
  /** The image is a material file (wang key colours), not a picture: recolour it as its materials to show it. */
  materials?: boolean;
};

/** The main world (biome_map.png): w×h chunks of `chunk` px; world x = (cx − w/2)·chunk, y = (cy − offsetY)·chunk. */
export type WorldMap = {
  w: number;
  h: number;
  offsetY: number;
  chunk: number;
  /** Biome index per chunk, row by row. */
  cells: number[];
  biomes: MapBiome[];
  scenes: MapScene[];
  /** Where each Holy Mountain's shop spawns (spawn_all_shopitems), top to bottom. */
  shops: { x: number; y: number }[];
  /** Patches of cave biomes (chunk bounding boxes, inclusive): one generated layout each. */
  areas: { biome: number; x1: number; y1: number; x2: number; y2: number }[];
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
