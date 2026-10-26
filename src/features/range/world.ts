// Test-range simulation: the player casts the live wand (wand.ts) as moving projectiles in a small pixel world.
// Pure logic (no DOM) so it can be unit-tested; rendering lives in render.ts.
//
// Fidelity notes: motion uses each projectile's own component data (speed, gravity, air friction, bounces,
// lifetime, homing, sine waves, lasers, area damage, lightning) and ports the game's Lua for path modifiers,
// bounce effects, orbits, the giga disc, chain bolt and teleports. Approximated: the engine's C++ internals
// (exact homing maths, friction integration, Box2D physics for thrown bombs, arc damage) and falling-sand materials.
import type { EntityVisual, ExplosionVisual, Material, Projectile, RangeKit, Reaction, WandSprite } from '@/data/types';
import { Cells, K_LIQUID, K_POWDER, K_STATIC } from './cells';
import { emitterStates, layerFrames, runEmitters, simpleParticle, stepParticles, type EmitterState, type Particle } from './particles';
import { CRIT_MULT, projectileDamage } from '@/sim/analyze';
import { HP_UNIT } from '@/data/format';
import type { ShotState, SimCast, SimShot } from '@/sim/types';
import { DEFAULT_FLIGHT, DEFAULT_MOVE, newPlayerState, stepPlayer, wandPose, type Controls, type PlayerState } from './player';
import type { WandRuntime } from './wand';

/** The game's internal screen size, so distances and speeds read 1:1. */
export const W = 427;
export const H = 242;
/** Frames the player lies dead before respawning. */
const DEATH_FRAMES = 90;
/** Frames before a shot made friendly-fire by a modifier can hit its caster (clear of the wand). */
const SHOT_FRIENDLY_GRACE = 6;
/**
 * Blasts whose config_explosion leaves max_durability_to_destroy unset (most) dig up to this durability.
 * The engine default isn't documented; 9 lets them blow sand, soil and liquids away but not rock (10), as small blasts do.
 */
const EXPLOSION_DIG_DEFAULT = 9;
/** Frames between checks of what actors are touching. */
const MATERIAL_CHECK_FRAMES = 3;
/** A material's stain (status_list id) and the GameEffect it is. */
const STAIN_EFFECT: Record<string, string> = { POISONED: 'POISON' };
/** Explosion push at the blast's centre, px/s per point (the engine's blast push isn't documented; a guess). */
const BLAST_PUSH = 15;
const DT = 1 / 60;
const MAX_PROJECTILES = 700;
const MAX_PARTICLES = 6000;
const MAX_EFFECTS = 200;
const GRAVITY = 400;

export const AIR = 0;
export const ROCK = 1;
export const BEDROCK = 2;

export type RangeData = {
  projectiles: Record<string, Projectile>;
  visuals: Record<string, EntityVisual>;
  materialColor: Map<string, string>;
  /** Durability of the terrain material (rock_static); explosions dig only if their max_durability_to_destroy reaches it. */
  rockDurability: number;
  /** Player sprites and movement constants; without it the player uses player_base.xml defaults. */
  kit?: RangeKit;
  /** The game's materials and reactions, for the falling-sand terrain. */
  materials: Material[];
  reactions: Reaction[];
};

/** A scheduled LuaComponent, remembering which entity (projectile or modifier effect) it belongs to. */
type Script = { script: string; every: number; times: number; runs: number; onAdded: boolean; onRemoved?: boolean; from?: EntityVisual };

export type Actor = {
  id: 'player' | 'dummy';
  x: number;
  /** Feet. */
  y: number;
  w: number;
  h: number;
  homeX: number;
  vy: number;
  flash: number;
  /** Continuous damage (lasers, saw blades, arcs) is summed and shown every few frames. */
  pending: number;
  pendingCrit: boolean;
  /** Status effects (GameEffect name) and frames left. */
  status: Map<string, number>;
  /** Wading or swimming in a liquid. */
  inLiquid?: boolean;
};

export type Proj = {
  id: number;
  file: string;
  state: ShotState;
  x: number;
  y: number;
  /** Position last frame (for streaks). */
  px: number;
  py: number;
  spawnX: number;
  spawnY: number;
  vx: number;
  vy: number;
  /** Facing (radians) — follows velocity unless a script sets it (orbits, lasers). */
  rot: number;
  age: number;
  lifetime: number;
  gravity: number;
  airFriction: number;
  bounces: number;
  bounceEnergy: number;
  bounceFx?: string;
  collideWorld: boolean;
  penetrateWorld: boolean;
  /** Speed multiplier while inside terrain when penetrating it. */
  penetrateCoeff: number;
  penetrateEntities: boolean;
  dieOnCollision: boolean;
  dieOnLiquid: boolean;
  dieOnLowVelocity: boolean;
  rotate: boolean;
  streak: boolean;
  /** No sprite and only a few frames long: drawn as a short beam from where it started. */
  beamLike: boolean;
  hit: number;
  critChance: number;
  explosion: { damage: number; radius: number; onDeath: boolean; onTimeout: boolean; digs: boolean; digDurability: number; color?: string } | null;
  spareShooter: boolean;
  friendlyFire: boolean;
  /** knockback_force of the projectile plus the shot's (Knockback modifier). */
  knockback: number;
  /** Status effect entities applied to whatever it damages. */
  effects: string[];
  shooterGrace: number;
  damageEveryFrames: number;
  trigger?: { kind: 'hit' | 'timer' | 'death'; delay?: number; shot: SimShot };
  /** Actors already hit (once each, unless re-hittable). */
  hitActors: Set<string>;
  rehitCooldown: number;
  stuck: boolean;
  visual?: EntityVisual;
  homing?: NonNullable<EntityVisual['homing']>;
  sine?: NonNullable<EntityVisual['sine']>;
  cellEater: number;
  groundPen?: NonNullable<NonNullable<EntityVisual['physics']>['groundPenetration']>;
  physicsBody: boolean;
  spin: number;
  laser?: NonNullable<EntityVisual['laser']> & { on: boolean };
  area?: NonNullable<EntityVisual['areaDamage']>;
  arc?: NonNullable<EntityVisual['arc']> & { target?: Proj };
  teleport: boolean;
  hitEffect?: NonNullable<EntityVisual['hitEffect']>;
  /** Material trail colours from trail modifiers (fire trail, acid trail...). */
  trails: string[];
  /** The trail modifier's material and amount. */
  trail?: { material: string; amount: number };
  /** The projectile's own particle emitters and those of its modifiers. */
  emit: EmitterState[];
  light?: { color: string; radius: number };
  scripts: Script[];
  vars: Record<string, number>;
  /** on_collision_spawn_entity: what it leaves where it hits (Random Explosion). */
  spawnOnHit?: string;
  /** Orbiting children (orbit spells) and the parent they circle. */
  children: Proj[];
  parent?: Proj;
  orbitIndex: number;
  orbitGroup?: string;
  /** Made with its ProjectileComponent off (Megalaser beams): sits still, unaged, until a script launches it. */
  held?: boolean;
  /** MaterialSuckerComponent (vacuum fields): what it pulls in, how fast, from how far, and what it holds. */
  sucker?: { kind: number; perFrame: number; reach: number; held: Map<number, number> };
  /** A haunted wand (Summon Taikasauva) drawn with one of the game's wand sprites. */
  wand?: WandSprite;
  /** Where a worm's head has been, newest first; its body segments follow this path. */
  body?: { x: number; y: number }[];
  dead: boolean;
};

export type { Particle };
/** A burst of light (explosions, muzzle flashes) that fades over `life` frames. */
export type Flash = { x: number; y: number; r: number; age: number; life: number; color: string };
/** A short-lived entity with no physics: muzzle flashes, explosion sprites, blast leftovers. */
export type Effect = { x: number; y: number; rot: number; vis: EntityVisual; age: number; life: number; emit: EmitterState[]; flip: number };
export type Floater = { x: number; y: number; text: string; age: number; crit: boolean; self: boolean };
/** A fading line (luminous drill beams, chain-bolt hops). */
export type Segment = { x0: number; y0: number; x1: number; y1: number; age: number; life: number; color: string; width: number };
/** Jagged lightning (bolts, electric arcs). */
export type Bolt = { points: [number, number][]; age: number; life: number; color: string };
/** A laser beam this frame. */
export type Beam = { x0: number; y0: number; x1: number; y1: number; color: string; radius: number };

/** Scripts whose effect is purely cosmetic or covered by data; never reported as missing. */
const COSMETIC = new Set([
  'colour_spell', 'orbit_shot_init', 'spells_to_power_tag',
  // Sound only (the instruments), seeing through walls, and sky checks that don't apply on the range.
  'ocarina', 'kantele', 'xray_effect', 'touch_grass', 'duck_init', 'friend_fly_init',
  // Summon Portal only opens near a particular place in the game world, which the range doesn't have; what's
  // left is the portal throbbing.
  'summon_portal_vibrate', 'summon_portal_position_check',
]);

/** bounce_fx_file each bounce modifier sets (from data/scripts/projectiles/bounce_*.lua). */
const BOUNCE_FX: Record<string, string> = {
  bounce_explosion: 'data/entities/projectiles/deck/bounce_explosion.xml',
  bounce_spark: 'data/entities/projectiles/deck/bounce_spark_main.xml',
  bounce_laser: 'data/entities/projectiles/deck/bounce_laser_launcher.xml',
  bounce_laser_emitter: 'data/entities/projectiles/deck/orb_laseremitter_weak_opposite.xml',
  bounce_larpa: 'data/entities/misc/bounce_larpa_launcher.xml',
  bounce_small_explosion: 'data/entities/projectiles/deck/bounce_small_explosion.xml',
  bounce_lightning: 'data/entities/projectiles/deck/bounce_lightning_launcher.xml',
  bounce_hole: 'data/entities/projectiles/deck/bounce_hole.xml',
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1));
const speedOf = (p: { vx: number; vy: number }) => Math.hypot(p.vx, p.vy);
const num = (s: ShotState, k: string) => (typeof s[k] === 'number' ? (s[k] as number) : 0);

function segmentHitsBox(x0: number, y0: number, x1: number, y1: number, l: number, t: number, r: number, b: number) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2));
  for (let i = 0; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const y = y0 + ((y1 - y0) * i) / steps;
    if (x >= l && x <= r && y >= t && y <= b) return true;
  }
  return false;
}

export class RangeWorld {
  /** The falling-sand world: rock, liquids, gases, fire. */
  readonly cells: Cells;
  private bedrock: number;
  /** Bumped when terrain is carved or rebuilt. */
  terrainVersion = 0;
  projectiles: Proj[] = [];
  particles: Particle[] = [];
  flashes: Flash[] = [];
  effects: Effect[] = [];
  floaters: Floater[] = [];
  segments: Segment[] = [];
  bolts: Bolt[] = [];
  beams: Beam[] = [];
  /** Camera shake strength (explosions, heavy casts); decays every frame. */
  shake = 0;
  frame = 0;
  readonly floorY = H - 34;
  readonly player: Actor;
  /** Movement, levitation and health of the player. */
  readonly body: PlayerState;
  readonly dummy: Actor = { id: 'dummy', x: 262, y: H - 34, w: 14, h: 24, homeX: 262, vy: 0, flash: 0, pending: 0, pendingCrit: false, status: new Map() };
  /** Walk / levitate keys. */
  controls: Controls = { left: false, right: false, up: false };
  /** Which of the game's wand sprites is in hand (its tip is where spells leave). */
  wandSprite: WandSprite | undefined;
  readonly unsupported = new Set<string>();
  /** Most cosmetic particles alive at once (performance mode lowers it). */
  particleBudget = MAX_PARTICLES;
  damageEvents: { frame: number; amount: number }[] = [];
  totalDamage = 0;
  selfDamage = 0;
  castsFired = 0;

  /** The wand in hand; it fires through fire() while the trigger is held. */
  wand: WandRuntime | null = null;
  /** Trigger held (mouse, touch or key). */
  trigger = false;
  /** Auto-fire: hold the trigger and aim at the dummy. */
  auto = true;
  /** Where the player aims, in world pixels (manual mode). */
  aim: { x: number; y: number } | null = null;
  /** Draw the game's cursor at the aim (the pointer is over the range). */
  showCursor = false;

  /** Auto mode puts teleported or swapped actors back after each recharge, so the range stays usable. */
  private homeAfterReload = false;
  /** The player walked or levitated since the actors were last put back (auto mode then leaves the player be). */
  private steered = false;
  /** A press since the last frame, so a click shorter than a frame still pulls the trigger. */
  private tapped = false;
  private nextId = 1;
  private lastArc: Proj | null = null;

  constructor(private data: RangeData) {
    const k = data.kit?.player;
    const hb = k?.hitbox ?? { minX: -3, maxX: 3, minY: -12, maxY: 4 };
    // The damage hitbox, measured from the feet (it hangs from the entity position, a few pixels above them).
    const feetBelowEntity = (k?.feet ?? 17) - (k?.pivot[1] ?? 14);
    this.player = { id: 'player', x: 34, y: H - 34, w: hb.maxX - hb.minX, h: feetBelowEntity - hb.minY, homeX: 34, vy: 0, flash: 0, pending: 0, pendingCrit: false, status: new Map() };
    this.body = newPlayerState(k?.flight ?? DEFAULT_FLIGHT, k?.hp ?? 100);
    this.cells = new Cells(W, H, data.materials, data.reactions);
    this.bedrock = this.cells.addHard('range_bedrock', 'rock_hard_border');
    this.resetTerrain();
  }

  get actors(): Actor[] {
    return [this.player, this.dummy];
  }

  get maxHp() {
    return this.data.kit?.player.hp ?? 100;
  }

  get flightMax() {
    return (this.data.kit?.player.flight ?? DEFAULT_FLIGHT).timeMax;
  }

  get kit() {
    return this.data.kit;
  }

  private get manual() {
    return !this.auto && this.aim;
  }

  /** Where the player aims: the cursor, or (auto) the dummy's upper chest so gravity-affected shots arc into it. */
  private get aimPoint() {
    return this.manual ? this.aim! : { x: this.dummy.x, y: this.dummy.y - this.dummy.h * 0.8 };
  }

  get facing() {
    return this.aimPoint.x >= this.player.x ? 1 : -1;
  }

  /** Arm, hand and wand tip, rotated toward the target. */
  get pose() {
    const f = this.facing;
    const root = wandPose(this.data.kit, this.body, this.player, f, f > 0 ? 0 : Math.PI, this.wandSprite).armRoot;
    const angle = Math.atan2(this.aimPoint.y - root.y, this.aimPoint.x - root.x);
    return { angle, ...wandPose(this.data.kit, this.body, this.player, f, angle, this.wandSprite) };
  }

  /** Where shots leave the wand: its tip. */
  get muzzle() {
    return this.pose.tip;
  }

  get aimAngle() {
    return this.pose.angle;
  }

  get dummyDistance() {
    return this.dummy.homeX - this.player.homeX;
  }

  /** Move the dummy's spot (range adjuster). */
  setDummyDistance(d: number) {
    this.dummy.homeX = Math.round(Math.max(30, Math.min(W - 40 - this.player.homeX, d)) + this.player.homeX);
    this.placeHome(this.dummy);
  }

  // ---------- terrain ----------

  /**
   * The cave: rock with a mound and a floating island, bedrock walls, and some of the game's materials
   * to play with: a water pool, an oil puddle, sand on the island and a wooden ledge.
   */
  resetTerrain() {
    const c = this.cells;
    c.clear();
    const rock = c.index('rock_static');
    const pool = (x0: number, x1: number, depth: number, m: number) => {
      for (let x = x0; x <= x1; x++) {
        // a rounded basin, filled to the floor
        const d = Math.round(depth * Math.sqrt(Math.max(0, 1 - ((2 * (x - x0)) / (x1 - x0) - 1) ** 2)));
        for (let y = this.floorY; y < this.floorY + d; y++) c.set(x, y, m);
      }
    };
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let solid = y >= this.floorY || y < 16 || x >= W - 26;
        if (((x - 150) / 22) ** 2 + ((y - this.floorY) / 9) ** 2 < 1) solid = true;
        if (((x - 200) / 34) ** 2 + ((y - 64) / 8) ** 2 < 1) solid = true;
        if (x < 3 || y < 3 || x >= W - 3 || y >= H - 3) c.set(x, y, this.bedrock);
        else if (solid) c.set(x, y, rock);
      }
    }
    pool(92, 126, 10, c.index('water'));
    pool(178, 198, 6, c.index('oil'));
    const sand = c.index('sand');
    for (let x = 186; x <= 214; x++) for (let y = 56 - Math.round(4 * (1 - Math.abs(x - 200) / 14)); y < 57; y++) c.place(x, y, sand);
    const wood = c.index('wood_static');
    for (let x = 300; x <= 346; x++) for (let y = 150; y < 153; y++) c.set(x, y, wood);
    this.terrainVersion++;
    for (const a of this.actors) this.placeHome(a);
  }

  /** What a cell is to things moving through it: AIR (empty, liquid, gas, fire), ROCK (solid, powder) or BEDROCK. */
  cell(x: number, y: number): number {
    const m = this.cells.at(x, y);
    if (m < 0) return BEDROCK;
    const info = this.cells.mats[m]!;
    if (info.kind === K_STATIC || info.kind === K_POWDER) return info.hard ? BEDROCK : ROCK;
    return AIR;
  }

  /** A liquid cell (projectiles with die_on_liquid_collision stop here; actors get wet). */
  isLiquid(x: number, y: number) {
    return this.cells.kindAt(x, y) === K_LIQUID;
  }

  /** Durability of the material at a point (what digging and drills have to beat). */
  durabilityAt(x: number, y: number) {
    const m = this.cells.at(x, y);
    return m < 0 ? Infinity : this.cells.mats[m]!.hard ? Infinity : this.cells.mats[m]!.durability;
  }

  /** Remove terrain in a circle, up to a material durability (digging spells, explosions, beams). */
  carve(cx: number, cy: number, r: number, probability = 100, maxDurability = Infinity) {
    if (r <= 0) return;
    const removed = this.cells.carve(cx, cy, r, probability, maxDurability);
    for (let i = 0; i < removed * 0.08; i++) this.spark(cx + rand(-r, r), cy + rand(-r, r), '#6b5d52', false, 30);
    if (removed) this.terrainVersion++;
  }

  /** First solid cell along a segment (for scripts that raytrace surfaces). */
  raycast(x0: number, y0: number, x1: number, y1: number): { x: number; y: number } | null {
    const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
    for (let i = 1; i <= steps; i++) {
      const x = x0 + ((x1 - x0) * i) / steps;
      const y = y0 + ((y1 - y0) * i) / steps;
      if (this.cell(x, y) !== AIR) return { x, y };
    }
    return null;
  }

  // ---------- actors ----------

  private groundBelow(x: number, fromY = 20) {
    for (let y = fromY; y < H; y++) if (this.cell(x, y) !== AIR) return y;
    return H - 3;
  }

  private placeHome(a: Actor) {
    a.x = a.homeX;
    a.y = this.groundBelow(a.x);
    a.vy = 0;
  }

  private actorBox(a: Actor, pad = 0) {
    return { l: a.x - a.w / 2 - pad, r: a.x + a.w / 2 + pad, t: a.y - a.h - pad, b: a.y + pad };
  }

  private inActor(a: Actor, x: number, y: number, pad = 0) {
    const bx = this.actorBox(a, pad);
    return x >= bx.l && x <= bx.r && y >= bx.t && y <= bx.b;
  }

  private center(a: Actor) {
    return { x: a.x, y: a.y - a.h / 2 };
  }

  /** Move an actor (teleport), keeping it out of solid terrain. */
  private moveActor(a: Actor, x: number, y: number) {
    this.puff(a.x, a.y - a.h / 2, '#82dcff');
    a.x = Math.max(8, Math.min(W - 30, x));
    a.y = Math.max(a.h + 4, Math.min(H - 4, y));
    while (a.y > a.h + 4 && this.cell(a.x, a.y - 1) !== AIR) a.y--;
    a.vy = 0;
    if (a.id === 'player') this.body.vx = this.body.vy = 0;
    this.puff(a.x, a.y - a.h / 2, '#82dcff');
  }

  /** The player: walks, jumps and levitates under the controls; lies down for a moment after dying. */
  private updatePlayer() {
    const a = this.player;
    const b = this.body;
    if (b.dead > 0) {
      if (--b.dead === 0) this.respawn();
    } else {
      const k = this.data.kit?.player;
      if (this.controls.left || this.controls.right || this.controls.up) this.steered = true;
      // Frozen or electrocuted (disable_movement): no walking or levitating until it wears off.
      const controls = this.stopped(a) ? { left: false, right: false, up: false } : this.controls;
      const pos = stepPlayer(b, a, controls, k?.move ?? DEFAULT_MOVE, k?.flight ?? DEFAULT_FLIGHT, (x, y) => this.cell(x, y) !== AIR, DT);
      a.x = Math.max(6, Math.min(W - 6, pos.x));
      a.y = pos.y;
      // In a liquid: CharacterPlatformingComponent swim_drag (and extra horizontal drag) each frame, and up
      // swims instead of needing levitation.
      if (a.inLiquid) {
        const drag = k?.swimDrag ?? 0.95;
        b.vx *= drag * (k?.swimDragX ?? 0.9);
        b.vy *= drag;
        if (controls.up) b.vy = Math.max(b.vy - 15, -70);
      }
    }
    this.actorTick(a);
  }

  /** Back on the mark with full health and levitation, briefly invincible (as at the start of a run). */
  respawn() {
    const b = this.body;
    Object.assign(b, newPlayerState(this.data.kit?.player.flight ?? DEFAULT_FLIGHT, this.maxHp));
    this.player.status.clear();
    this.moveActor(this.player, this.player.homeX, this.groundBelow(this.player.homeX));
    this.steered = false;
  }

  private updateActor(a: Actor) {
    const grounded = this.cell(a.x, a.y) !== AIR || this.cell(a.x - 2, a.y) !== AIR || this.cell(a.x + 2, a.y) !== AIR;
    if (grounded && a.vy >= 0) {
      a.vy = 0;
      while (a.y > a.h + 4 && this.cell(a.x, a.y - 1) !== AIR) a.y--;
    } else {
      a.vy = Math.min(300, a.vy + GRAVITY * DT);
      const steps = Math.ceil(Math.abs(a.vy * DT));
      for (let i = 0; i < steps; i++) {
        if (this.cell(a.x, a.y + 1) !== AIR) {
          a.vy = 0;
          break;
        }
        a.y += (a.vy * DT) / steps;
      }
    }
    this.actorTick(a);
  }

  /** Hit flash, status effects wearing off (and burning), batched damage numbers. */
  private actorTick(a: Actor) {
    if (a.flash > 0) a.flash--;
    if (this.frame % MATERIAL_CHECK_FRAMES === 0) a.inLiquid = this.touchMaterials(a);
    this.tickStatus(a);
    if (a.pending > 0 && this.frame % 10 === 0) {
      this.floater(a, a.pending, a.pendingCrit);
      a.pending = 0;
      a.pendingCrit = false;
    }
  }

  private displaced() {
    return this.actors.some((a) => Math.abs(a.x - a.homeX) > 2);
  }

  // ---------- status effects ----------

  /**
   * Apply status effect entities (game_effect_entities of the shot, damage_game_effect_entities of the
   * projectile) for their GameEffectComponent frames. Wet puts fire out and keeps it from catching.
   */
  applyEffects(a: Actor, files: string[]) {
    const effects = this.data.kit?.effects;
    if (!effects) return;
    for (const f of files) {
      const fx = effects[f.split('/').pop()!.replace('.xml', '')];
      if (!fx || fx.effect === 'NONE') continue;
      if (fx.effect === 'ON_FIRE' && a.status.has('WET')) continue;
      if (fx.effect === 'WET') a.status.delete('ON_FIRE');
      const frames = fx.frames < 0 ? Infinity : fx.frames;
      a.status.set(fx.effect, Math.max(a.status.get(fx.effect) ?? 0, frames));
    }
  }

  /**
   * What the actor is standing in: materials_that_damage hurt (acid, lava...), stains (water, oil,
   * poison) apply their status for the usual 720 frames, fire and lava set it alight unless wet.
   * Returns whether it's in a liquid.
   */
  private touchMaterials(a: Actor): boolean {
    const box = this.actorBox(a);
    const seen = new Set<number>();
    for (let y = Math.floor(box.t); y < box.b; y += 2) for (let x = Math.floor(box.l); x <= box.r; x += 2) {
      const m = this.cells.at(x, y);
      if (m > 0) seen.add(m);
    }
    let liquid = false;
    for (const m of seen) {
      const info = this.cells.mats[m]!;
      // Nearly any liquid (oil too) puts out a fire (wiki: Status Effects).
      if (info.kind === K_LIQUID) {
        liquid = true;
        if (!info.hot) a.status.delete('ON_FIRE');
      }
      const dmg = this.data.kit?.player.materialDamage[info.id];
      if (dmg) this.tick(a, dmg * MATERIAL_CHECK_FRAMES);
      for (const s of info.stains) {
        const effect = STAIN_EFFECT[s] ?? s;
        if (effect === 'WET') a.status.delete('ON_FIRE');
        a.status.set(effect, Math.max(a.status.get(effect) ?? 0, 720));
      }
      if (info.hot && !a.status.has('WET')) a.status.set('ON_FIRE', Math.max(a.status.get('ON_FIRE') ?? 0, 720));
    }
    return liquid;
  }

  /** Frozen or electrocuted: the effect has disable_movement. */
  private stopped(a: Actor) {
    const effects = this.data.kit?.effects;
    if (!effects || !a.status.size) return false;
    for (const fx of Object.values(effects)) if (fx.stops && a.status.has(fx.effect)) return true;
    return false;
  }

  private tickStatus(a: Actor) {
    if (!a.status.size) return;
    const c = this.center(a);
    for (const [effect, left] of a.status) {
      if (left <= 1) a.status.delete(effect);
      else a.status.set(effect, left - 1);
      // What each effect looks like on the actor, in the game's material colours.
      const r = () => ({ x: c.x + rand(-a.w / 2, a.w / 2), y: c.y + rand(-a.h / 2, a.h / 2) });
      if (effect === 'ON_FIRE') {
        if (this.frame % 2 === 0) {
          const p = r();
          this.addParticle({ ...simpleParticle(p.x, p.y, Math.random() < 0.5 ? '#ff6000' : '#ffac0f', true, randInt(12, 24), 6, -40) });
        }
        // Burning takes 2% of max HP a second (wiki: Status Effects), in small steps. The dummy counts as 100 HP.
        if (this.frame % 10 === 0) this.tick(a, ((a.id === 'player' ? this.maxHp : 100) * 0.02) / 6);
      } else if (effect === 'ELECTROCUTION' && this.frame % 2 === 0) {
        const p = r();
        this.spark(p.x, p.y, '#27b4f6', true, randInt(4, 10), 40);
      } else if ((effect === 'WET' || effect === 'OILED' || effect === 'POISON' || effect === 'BLOODY') && this.frame % 8 === 0) {
        const p = r();
        const color = { WET: '#376259', OILED: '#3d3728', POISON: '#6ac300', BLOODY: '#830000' }[effect];
        this.addParticle({ ...simpleParticle(p.x, p.y, color, false, randInt(15, 30), 2, 120), fade: false });
      }
    }
  }

  // ---------- casting ----------

  /** Press or release the trigger. */
  setTrigger(down: boolean) {
    this.trigger = down;
    if (down) this.tapped = true;
  }

  /** A different wand: projectiles in flight go away, terrain stays. */
  clearShots() {
    this.projectiles = [];
    this.lastArc = null;
    this.unsupported.clear();
  }

  /** Put both actors back on their marks. */
  resetActors() {
    for (const a of this.actors) this.moveActor(a, a.homeX, this.groundBelow(a.homeX));
    this.steered = false;
  }

  /** The wand cast: its projectiles leave the wand tip along the aim, and the wand kicks back. */
  fire(cast: SimCast) {
    if (this.body.dead > 0) return;
    if (this.auto && this.homeAfterReload && this.displaced()) {
      // Teleports and swaps are undone, but a player who walked somewhere stays there.
      if (this.steered) this.moveActor(this.dummy, this.dummy.homeX, this.groundBelow(this.dummy.homeX));
      else this.resetActors();
    }
    this.homeAfterReload = cast.reload !== undefined;
    this.castsFired++;
    const { tip, angle } = this.pose;
    // Each kind of projectile cast brings its muzzle flash and a flash of light at the tip.
    const seen = new Set<string>();
    for (const sp of cast.shot.projectiles) {
      const vis = this.data.visuals[sp.file];
      if (vis?.muzzle && !seen.has(vis.muzzle)) {
        seen.add(vis.muzzle);
        this.addEffect(vis.muzzle, tip.x, tip.y, angle, this.facing);
      }
      if (vis?.shootLight && !seen.has(`light:${sp.file}`)) {
        seen.add(`light:${sp.file}`);
        this.flashes.push({ x: tip.x, y: tip.y, r: Math.min(40, vis.shootLight.radius * 0.5), age: 0, life: 6, color: vis.shootLight.color });
      }
    }
    // shot_effects.recoil_knockback pushes the caster away from the aim; c.screenshake shakes the camera.
    if (cast.recoil) {
      this.body.vx -= Math.cos(angle) * cast.recoil;
      this.body.vy -= Math.sin(angle) * cast.recoil;
    }
    const shake = num(cast.shot.state, 'screenshake');
    if (shake > 0) this.shake = Math.min(6, this.shake + shake / 12);
    this.spawnShot(cast.shot, tip.x, tip.y, angle);
  }

  /** A trigger's payload leaves the carrier along its heading, slowed by its child_speed_multiplier (grenades, mines). */
  private payload(p: Proj, shot: SimShot) {
    const childSpeed = typeof p.state.child_speed_multiplier === 'number' ? p.state.child_speed_multiplier : 1;
    this.spawnShot(shot, p.x, p.y, this.heading(p), childSpeed);
  }

  /** Fire every projectile of a (sub)shot from a point, with the shot's spread, pattern and speed modifiers. */
  spawnShot(shot: SimShot, x: number, y: number, angle: number, speedScale = 1) {
    const s = shot.state;
    const n = shot.projectiles.length;
    const pattern = num(s, 'pattern_degrees');
    shot.projectiles.forEach((sp, i) => {
      const base = this.data.projectiles[sp.file];
      const vis = this.data.visuals[sp.file];
      const spread = Math.max(0, num(s, 'spread_degrees') + (base?.spread ?? 0));
      let a = angle + (rand(-spread, spread) * Math.PI) / 180;
      if (pattern > 0 && n > 1) a += ((-pattern + (2 * pattern * i) / (n - 1)) * Math.PI) / 180;
      const speedMul = (typeof s.speed_multiplier === 'number' ? s.speed_multiplier : 1) * speedScale;
      let speed = rand(base?.speed[0] ?? 60, base?.speed[1] ?? 60) * speedMul;
      // Thrown physics bodies (bombs) go by their throw force, not their projectile speed. Box2D isn't
      // available here, so this keeps them in the lob range they have in-game.
      if (vis?.physicsBody) speed = Math.max(110, Math.min(220, 100 + speed * vis.physicsBody.throwCoeff * 0.08));
      this.spawn(sp.file, x, y, Math.cos(a) * speed, Math.sin(a) * speed, s, sp.trigger);
    });
  }

  /** Create any entity the range knows about (spell projectile, payload, bounce effect, script spawn). */
  spawn(file: string, x: number, y: number, vx: number, vy: number, s: ShotState = {}, trigger?: Proj['trigger'], rot?: number): Proj | null {
    if (this.projectiles.length >= MAX_PROJECTILES) return null;
    const base = this.data.projectiles[file];
    const vis = this.data.visuals[file];
    const dmg = projectileDamage(base, s);
    const life = !base || base.lifetime < 0 ? -1 : Math.max(1, base.lifetime + num(s, 'lifetime_add') + randInt(-base.lifetimeRandom, base.lifetimeRandom));
    const extras = String(s.extra_entities ?? '')
      .split(',')
      .filter(Boolean)
      .map((f) => this.data.visuals[f])
      .filter((v): v is EntityVisual => !!v);
    const all = [vis, ...extras].filter((v): v is EntityVisual => !!v);
    const trailId = typeof s.trail_material === 'string' && s.trail_material ? s.trail_material.split(',')[0]! : '';
    const trailMat = trailId ? this.data.materialColor.get(trailId)?.slice(0, 7) : undefined;
    const arc = all.find((v) => v.arc)?.arc;
    const laser = vis?.laser;

    const p: Proj = {
      id: this.nextId++,
      file,
      state: s,
      x,
      y,
      px: x,
      py: y,
      spawnX: x,
      spawnY: y,
      vx,
      vy,
      rot: rot ?? Math.atan2(vy, vx),
      age: 0,
      lifetime: life,
      gravity: (base?.gravity ?? GRAVITY) + num(s, 'gravity'),
      airFriction: base?.airFriction ?? 0.55,
      bounces: (base?.bounces ?? 0) + num(s, 'bounces'),
      bounceEnergy: vis?.physics?.bounceEnergy ?? 0.5,
      collideWorld: vis?.physics?.collideWithWorld ?? true,
      penetrateWorld: base?.penetrateWorld ?? false,
      penetrateCoeff: base?.penetrateWorldCoeff ?? 0.6,
      penetrateEntities: base?.penetrateEntities ?? false,
      dieOnCollision: base?.dieOnCollision ?? true,
      dieOnLiquid: base?.dieOnLiquid ?? false,
      dieOnLowVelocity: vis?.physics?.dieOnLowVelocity ?? false,
      rotate: vis?.physics?.rotate ?? true,
      streak: vis?.physics?.streak ?? false,
      beamLike: !vis?.sprites?.length && life > 0 && life <= 4 && speedOf({ vx, vy }) > 300,
      hit: dmg.hit,
      critChance: dmg.critChance,
      explosion:
        base?.explosion && dmg.explosion
          ? {
              damage: dmg.explosion.damage,
              radius: dmg.explosion.radius,
              onDeath: base.explosion.onDeath,
              onTimeout: base.explosion.onTimeout,
              digs: vis?.physics?.digs ?? true,
              digDurability: vis?.physics?.digDurability ?? 0,
              color: vis?.physics?.explosionColor,
            }
          : null,
      spareShooter: vis?.physics?.spareShooter ?? false,
      friendlyFire: base?.friendlyFire ?? false,
      knockback: (base?.knockback ?? 0) + num(s, 'knockback_force'),
      effects: [...(base?.effects ?? []), ...String(s.game_effect_entities ?? '').split(',').filter(Boolean)],
      shooterGrace: vis?.physics?.shooterGrace ?? -1,
      damageEveryFrames: base?.damageEveryFrames ?? -1,
      ...(trigger ? { trigger } : {}),
      hitActors: new Set(),
      rehitCooldown: 0,
      stuck: false,
      visual: vis,
      // Copied: scripts like Accelerating Homing tune them per projectile.
      homing: ((h) => (h ? { ...h } : undefined))(all.find((v) => v.homing && v.homing.enabled !== false)?.homing),
      sine: all.find((v) => v.sine)?.sine,
      cellEater: Math.max(0, ...all.map((v) => v.cellEater?.radius ?? 0)),
      groundPen: vis?.physics?.groundPenetration,
      physicsBody: !!vis?.physicsBody,
      spin: 0,
      ...(laser ? { laser: { ...laser, on: laser.emitting } } : {}),
      ...(vis?.areaDamage ? { area: { ...vis.areaDamage } } : {}),
      ...(arc ? { arc: { ...arc, target: this.lastArc && !this.lastArc.dead ? this.lastArc : undefined } } : {}),
      teleport: !!vis?.teleport,
      hitEffect: vis?.hitEffect,
      trails: trailMat ? [trailMat] : [],
      ...(trailId ? { trail: { material: trailId, amount: num(s, 'trail_material_amount') } } : {}),
      emit: all.flatMap((v) => emitterStates(v)),
      light: all.find((v) => v.light && v.light.radius > 0)?.light,
      scripts: all.flatMap((v) => (v.scripts ?? []).map((sc) => ({ ...sc, runs: 0, from: v }))),
      vars: {},
      children: [],
      orbitIndex: 0,
      ...(vis?.held ? { held: true } : {}),
      dead: false,
    };
    if (p.arc) this.lastArc = p;
    // Entities with no projectile or velocity (Matosade's spawner) sit where they're made for their lifetime.
    if (vis?.inert) {
      p.vx = p.vy = 0;
      p.gravity = 0;
      p.collideWorld = false;
      p.dieOnCollision = false;
      p.hit = 0;
      p.lifetime = vis.lifetime ?? -1;
    }

    // Lightning bolts strike instantly along their path.
    if (vis?.lightning?.isProjectile) {
      this.strike(p, vis.lightning);
      return null;
    }
    this.projectiles.push(p);
    // Scripts that adjust or spawn things as the entity is created take effect immediately.
    for (const sc of p.scripts) if (ONCE.has(sc.script) || sc.onAdded) this.runScript(p, sc);
    return p;
  }

  // ---------- per-frame update ----------

  step() {
    this.frame++;
    this.wand?.tick(this.frame, (this.auto || this.trigger || this.tapped) && !this.polymorphed);
    this.tapped = false;

    this.beams = [];
    // Copy: updates may spawn new projectiles (they start moving next frame).
    for (const p of [...this.projectiles]) if (!p.dead && p.age >= 0 && !p.held) this.update(p);
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    this.updatePlayer();
    this.updateActor(this.dummy);

    this.updateEffects();
    this.particles = stepParticles(this.particles, (x, y) => this.cell(x, y) !== AIR || this.isLiquid(x, y), (x, y, m) => this.cells.place(x, y, this.cells.index(m)));
    this.cells.step();
    for (const f of this.flashes) f.age++;
    this.flashes = this.flashes.filter((f) => f.age < f.life);
    this.shake *= 0.85;
    if (this.shake < 0.05) this.shake = 0;
    for (const s of this.segments) s.age++;
    this.segments = this.segments.filter((s) => s.age < s.life);
    for (const b of this.bolts) b.age++;
    this.bolts = this.bolts.filter((b) => b.age < b.life);
    for (const f of this.floaters) {
      f.age++;
      f.y -= 0.35;
    }
    this.floaters = this.floaters.filter((f) => f.age < 60);
    const cutoff = this.frame - 300;
    while (this.damageEvents.length && this.damageEvents[0]!.frame < cutoff) this.damageEvents.shift();
  }

  /** Damage per second to the dummy over the last 5 seconds of simulated time. */
  get dps() {
    const window = Math.min(300, this.frame);
    return window ? this.damageEvents.reduce((s, e) => s + e.amount, 0) / (window / 60) : 0;
  }

  private update(p: Proj) {
    p.age++;
    p.px = p.x;
    p.py = p.y;
    if (p.rehitCooldown > 0) p.rehitCooldown--;
    // Nothing runs on the frame its lifetime ends (a 10-frame barrier builder lays 9 pieces: 19 per barrier).
    const lastFrame = p.lifetime > 0 && p.age >= p.lifetime;
    for (const sc of lastFrame ? [] : p.scripts) {
      if (ONCE.has(sc.script) || sc.onAdded || sc.onRemoved || sc.every < 0 || (sc.times > 0 && sc.runs >= sc.times)) continue;
      if (p.age % Math.max(1, sc.every) === 0) this.runScript(p, sc);
    }
    if (p.dead) return;

    if (p.parent) {
      // Orbiting child: positioned by its parent's orbit_projectile_rotation; only checks what it touches.
      if (p.parent.dead) {
        p.dead = true;
        return;
      }
      if (this.cell(p.x, p.y) !== AIR && p.dieOnCollision && p.explosion) return this.die(p, 'hit');
      this.touchActors(p);
    } else if (!p.stuck) {
      this.applyHoming(p);
      if (p.sine) {
        const d = p.sine.m * (Math.sin(p.sine.freq * p.age) - Math.sin(p.sine.freq * (p.age - 1)));
        const c = Math.cos(d);
        const s = Math.sin(d);
        [p.vx, p.vy] = [p.vx * c - p.vy * s, p.vx * s + p.vy * c];
      }
      p.vy += p.gravity * DT;
      const f = Math.max(0, 1 - p.airFriction * DT);
      p.vx *= f;
      p.vy *= f;
      // VelocityComponent terminal_velocity caps the speed.
      const sp = speedOf(p);
      const cap = this.data.projectiles[p.file]?.terminalVelocity ?? 1000;
      if (sp > cap) {
        p.vx *= cap / sp;
        p.vy *= cap / sp;
      }
      this.move(p);
      if (p.physicsBody) p.spin += p.vx * DT * 0.15;
      else if (p.rotate && speedOf(p) > 1) p.rot = Math.atan2(p.vy, p.vx);
    }
    if (p.dead) return;

    this.updateLaser(p);
    this.updateArea(p);
    this.updateArc(p);
    if (p.damageEveryFrames > 0 && p.age % p.damageEveryFrames === 0) {
      for (const a of this.actors) {
        if (!this.canHit(p, a) || !this.inActor(a, p.x, p.y, 8)) continue;
        this.hurt(a, p.hit, p.critChance, p);
        this.applyEffects(a, p.effects);
      }
    }
    if (p.cellEater > 0 && p.age % 2 === 0) this.carve(p.x, p.y, p.cellEater, p.visual?.cellEater?.probability ?? 100);
    if (p.sucker) this.suck(p);
    if (p.trigger?.kind === 'timer' && p.age === (p.trigger.delay ?? 0)) {
      const t = p.trigger;
      delete p.trigger;
      this.payload(p, t.shot);
    }
    if (p.dieOnLowVelocity && p.age > 5 && speedOf(p) < 40 && !p.parent) return this.die(p, 'timeout');
    if (p.lifetime > 0 && p.age >= p.lifetime) return this.die(p, 'timeout');

    // Particle emitters of the projectile and its modifiers, and material trails from trail modifiers.
    runEmitters(p.emit, p.age, p.x, p.y, p.px, p.py, p.rot, this.addParticle);
    // Trail modifiers lay real material along the path (trail_material_amount, taken as cells per 10 frames).
    if (p.trail) {
      const m = this.cells.index(p.trail.material);
      const n = Math.max(1, Math.round(p.trail.amount / 10));
      for (let k = 0; k < n; k++) {
        const t = Math.random();
        const x = p.px + (p.x - p.px) * t;
        const y = p.py + (p.y - p.py) * t;
        if (m > 0) this.cells.place(x, y, m);
        else this.spark(x, y, p.trails[0] ?? '#ffffff', true, randInt(10, 26), 8);
      }
    }
  }

  /** Effects: play their sprite, run their emitters, then go. */
  private updateEffects() {
    for (const fx of this.effects) {
      fx.age++;
      runEmitters(fx.emit, fx.age, fx.x, fx.y, fx.x, fx.y, fx.rot, this.addParticle);
    }
    this.effects = this.effects.filter((fx) => fx.age < fx.life);
  }

  /**
   * Show an effect entity (muzzle flash, blast leftovers) at a point. It lasts for its LifetimeComponent,
   * else its sprite's play-through (kill_entity_after_finished) or the longest emitter, else half a second.
   */
  addEffect(file: string, x: number, y: number, rot = 0, flip = 1, vis = this.data.visuals[file]) {
    if (!vis || this.effects.length >= MAX_EFFECTS) return;
    const sprite = vis.sprites?.[0];
    const emitLife = Math.max(0, ...(vis.emitters ?? []).map((e) => (e.lifetimeFrames >= 0 ? e.delayFrames + e.lifetimeFrames + e.lifetimeMax * 60 : 0)));
    const life = vis.lifetime ?? (sprite && (vis.killAfterAnim || !sprite.loop) ? layerFrames(sprite) : emitLife || 30);
    this.effects.push({ x, y, rot, vis, age: 0, life: Math.max(1, life), emit: emitterStates(vis), flip });
  }

  addParticle = (q: Particle) => {
    if (this.particles.length < this.particleBudget) this.particles.push(q);
  };

  private heading(p: Proj) {
    return speedOf(p) > 1 ? Math.atan2(p.vy, p.vx) : p.rot;
  }

  /**
   * Friendly-fire projectiles can hit their caster once their grace frames are over. A projectile's own
   * friendly_fire needs collide_with_shooter_frames >= 0 (-1 means never, per the component docs); modifiers
   * that turn friendly fire on for the shot (Piercing Shot, Bloodlust) hurt the caster once clear of the wand.
   */
  private canHit(p: Proj, a: Actor) {
    if (a.id === 'dummy') return true;
    if (p.state.friendly_fire === true) return p.age > Math.max(SHOT_FRIENDLY_GRACE, p.shooterGrace);
    return p.friendlyFire && p.shooterGrace >= 0 && p.age > p.shooterGrace;
  }

  private target(p: Proj) {
    return p.homing?.targetShooter ? this.center(this.player) : this.center(this.dummy);
  }

  private applyHoming(p: Proj) {
    const h = p.homing;
    if (!h) return;
    const t = this.target(p);
    const dx = t.x - p.x;
    const dy = t.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist > h.detectDistance || dist < 1) return;
    if (h.rotateOnly) {
      const cur = Math.atan2(p.vy, p.vx);
      let diff = Math.atan2(dy, dx) - cur;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const a = cur + Math.max(-h.maxTurnRate, Math.min(h.maxTurnRate, diff));
      const sp = speedOf(p);
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
    } else {
      p.vx = p.vx * h.velocityMultiplier + (dx / dist) * h.coeff;
      p.vy = p.vy * h.velocityMultiplier + (dy / dist) * h.coeff;
    }
  }

  private move(p: Proj) {
    const dist = speedOf(p) * DT;
    const steps = Math.max(1, Math.ceil(dist));
    for (let i = 0; i < steps; i++) {
      const nx = p.x + (p.vx * DT) / steps;
      const ny = p.y + (p.vy * DT) / steps;
      const c = this.cell(nx, ny);
      if (p.dieOnLiquid && this.isLiquid(nx, ny)) return this.die(p, 'hit');
      if (c !== AIR && p.collideWorld) {
        if (c === ROCK && p.groundPen && p.groundPen.maxDurability >= this.durabilityAt(nx, ny)) {
          // Luminous drill: bores through rock it can break.
          this.carve(nx, ny, 2, 100, p.groundPen.maxDurability);
          p.x = nx;
          p.y = ny;
          continue;
        }
        if (p.penetrateWorld) {
          // penetrate_world: through the ground at penetrate_world_velocity_coeff of its speed (Clipping Shot: 0.1).
          p.x += (nx - p.x) * p.penetrateCoeff;
          p.y += (ny - p.y) * p.penetrateCoeff;
          continue;
        }
        if (p.physicsBody) {
          this.bounce(p, nx, ny, 0.35, false);
          return;
        }
        if (p.bounces > 0) {
          this.bounce(p, nx, ny, p.bounceEnergy, true);
          return;
        }
        if (!p.dieOnCollision) {
          p.stuck = true;
          p.vx = p.vy = 0;
          return;
        }
        if (p.trigger) this.aimPayloadOffWall(p, nx, ny);
        return this.die(p, 'hit');
      }
      p.x = nx;
      p.y = ny;
      if (!p.physicsBody && p.damageEveryFrames <= 0 && this.touchActors(p)) return;
    }
    // Gone once well off the range. Things that pass through the ground get more room: in the game the world
    // goes on, so a Worm Launcher worm that dips under the floor can still turn back for its caster.
    const margin = p.collideWorld && !p.penetrateWorld ? 40 : 200;
    if (p.x < -margin || p.x > W + margin || p.y < -margin || p.y > H + margin) p.dead = true;
  }

  /**
   * Where a payload goes when its carrier dies against terrain: trigger and timer payloads bounce off the
   * surface (seen in-game); an expiration payload goes in a random direction, because the carrier counts as
   * stopped (wiki: Expiration Trigger).
   */
  private aimPayloadOffWall(p: Proj, nx: number, ny: number) {
    if (p.trigger?.kind === 'death') {
      p.rot = Math.random() * Math.PI * 2;
      p.vx = p.vy = 0;
      return;
    }
    const n = this.normalAt(nx, ny);
    const into = n ? p.vx * n.x + p.vy * n.y : 0;
    if (n && into < 0) {
      p.vx -= 2 * into * n.x;
      p.vy -= 2 * into * n.y;
    } else {
      p.vx = -p.vx;
      p.vy = -p.vy;
    }
  }

  /** Outward surface normal at a point, from the solid cells around it. */
  private normalAt(x: number, y: number): { x: number; y: number } | null {
    let nx = 0;
    let ny = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (this.cell(x + dx, y + dy) !== AIR) {
          nx -= dx;
          ny -= dy;
        }
      }
    }
    const len = Math.hypot(nx, ny);
    return len > 0 ? { x: nx / len, y: ny / len } : null;
  }

  /** Bounce off the surface: reflect the velocity over its normal, keeping bounce_energy of it. */
  private bounce(p: Proj, nx: number, ny: number, energy: number, counts: boolean) {
    const n = this.normalAt(nx, ny);
    const into = n ? p.vx * n.x + p.vy * n.y : 0;
    if (n && into < 0) {
      p.vx -= 2 * into * n.x;
      p.vy -= 2 * into * n.y;
    } else {
      // Rough or enclosed spot: fall back to flipping the blocked axes.
      const bx = this.cell(nx, p.y) !== AIR;
      const by = this.cell(p.x, ny) !== AIR;
      if (bx || !by) p.vx = -p.vx;
      if (by || !bx) p.vy = -p.vy;
    }
    p.vx *= energy;
    p.vy *= energy;
    if (p.physicsBody && n && n.y < -0.5) p.vx *= 0.8; // ground friction: thrown bombs settle and roll to a stop
    if (counts) {
      p.bounces--;
      if (p.bounceFx) this.spawnBounceFx(p);
    }
  }

  /** Hit test against actors along the projectile's path; returns true if the projectile died. */
  private touchActors(p: Proj): boolean {
    for (const a of this.actors) {
      if (!this.canHit(p, a) || !this.inActor(a, p.x, p.y)) continue;
      if (p.parent) {
        // Orbiting blades/orbs keep hitting as they sweep through; explosive ones blow up.
        if (p.rehitCooldown > 0) continue;
        this.hurt(a, p.hit, p.critChance, p);
        this.applyEffects(a, p.effects);
        p.rehitCooldown = 20;
        if (p.explosion) {
          this.die(p, 'hit');
          return true;
        }
        continue;
      }
      if (p.hitActors.has(a.id)) continue;
      p.hitActors.add(a.id);
      this.hurt(a, p.hit, p.critChance, p);
      this.applyEffects(a, p.effects);
      // ProjectileComponent: final_knockback = knockback_force × velocity × mass / who_we_hit.mass.
      if (a.id === 'player' && p.knockback > 0) {
        const mass = this.data.projectiles[p.file]?.mass ?? 0.05;
        this.push(Math.atan2(p.vy, p.vx), (p.knockback * speedOf(p) * mass) / (this.data.kit?.player.mass ?? 1));
      }
      this.applyHitEffect(p, a);
      // A timer that hits something before it runs out acts like a trigger; a piercing one keeps
      // releasing copies into each enemy it passes through until its time is up.
      if (p.trigger?.kind === 'hit' || p.trigger?.kind === 'timer') {
        const t = p.trigger;
        if (t.kind === 'hit' || !p.penetrateEntities) delete p.trigger;
        this.payload(p, t.shot);
      }
      if (!p.penetrateEntities && p.dieOnCollision) {
        this.die(p, 'hit');
        return true;
      }
    }
    return false;
  }

  /** Swapper and Homebringer move whatever they hit. */
  private applyHitEffect(p: Proj, a: Actor) {
    const fx = p.hitEffect;
    if (!fx) return;
    if (fx.effect === 'SWAPPER' && a.id === 'dummy') {
      const px = this.player.x;
      const py = this.player.y;
      this.moveActor(this.player, a.x, a.y);
      this.moveActor(a, px, py);
    } else if (fx.entity?.endsWith('teleport_projectile_closer_hit.xml') && p.vars.ox !== undefined) {
      this.moveActor(a, p.vars.ox, p.vars.oy! + a.h / 2);
    }
  }

  private die(p: Proj, reason: 'hit' | 'timeout') {
    if (p.dead) return;
    p.dead = true;
    for (const c of p.children) c.dead = true;
    if (p.beamLike) {
      const color = p.trails[0] ?? p.visual?.trail?.color ?? p.light?.color ?? '#ffffff';
      this.segments.push({ x0: p.spawnX, y0: p.spawnY, x1: p.x, y1: p.y, age: 0, life: 8, color, width: 1.5 });
    }
    const e = p.explosion;
    if (e && (reason === 'hit' ? e.onDeath : e.onTimeout || e.onDeath)) {
      this.explode(p.x, p.y, e.radius, e.damage, e.digs ? e.digDurability || EXPLOSION_DIG_DEFAULT : -1, p.critChance, e.color, p.spareShooter, p.visual?.explosion);
    }
    if (p.teleport) this.teleportPlayer(p);
    if (p.sucker) this.spill(p);
    if (p.spawnOnHit && reason === 'hit') this.spawn(p.spawnOnHit, p.x, p.y, 0, 0);
    // execute_on_removed scripts (Larpa death, chain shot) run as it goes.
    for (const sc of p.scripts) if (sc.onRemoved) this.runScript(p, sc);
    if (p.vars.quantum !== undefined) for (const q of this.projectiles) if (q !== p && q.vars.quantum === p.vars.quantum && !q.dead) this.die(q, 'timeout');
    // A timer still pending goes off as the projectile ends: on a hit like a trigger, or when its lifetime runs out.
    if (p.trigger && (p.trigger.kind !== 'hit' || reason === 'hit')) this.payload(p, p.trigger.shot);
  }

  /** Teleport bolts move the caster to where they end, backed off from walls (TeleportProjectileComponent). */
  private teleportPlayer(p: Proj) {
    const min = p.visual?.teleport?.minDistanceFromWall ?? 4;
    const h = this.heading(p);
    let x = p.x;
    let y = p.y;
    for (let i = 0; i < 40 && (this.cell(x, y) !== AIR || this.raycast(x, y, x + Math.cos(h) * min, y + Math.sin(h) * min)); i++) {
      x -= Math.cos(h);
      y -= Math.sin(h);
    }
    this.moveActor(this.player, x, y + this.player.h / 2);
  }

  /**
   * A blast: damage in the radius and digging, drawn from its config_explosion when known (the animated
   * explosion sprite, its sparks, light, camera shake and the entities it leaves) or a generic flash.
   */
  explode(x: number, y: number, r: number, damage: number, digDurability: number, crit = 0, color?: string, spareShooter = false, vis?: ExplosionVisual) {
    const c = color ?? (r > 20 ? '#ffb347' : '#fff1c2');
    if (vis) {
      if (vis.sprite) this.addEffect('', x, y, vis.randomRotation ? Math.random() * Math.PI * 2 : 0, 1, { sprites: [vis.sprite], killAfterAnim: true });
      const sparks = vis.sparks ? randInt(vis.sparks.min, vis.sparks.max) : 0;
      for (let i = 0; i < Math.min(80, sparks); i++) this.spark(x, y, vis.sparks!.color, vis.sparks!.glow, randInt(10, 30), 60 + r * 5);
      if (vis.light) this.flashes.push({ x, y, r: Math.max(6, r * 1.6), age: 0, life: Math.max(8, Math.round(vis.light.fadeTime * 60)), color: vis.light.color });
      this.shake = Math.min(6, this.shake + vis.cameraShake / 12);
      for (const f of vis.entities) {
        if (this.data.projectiles[f]) this.spawn(f, x, y, 0, 0);
        else this.addEffect(f, x, y);
      }
    } else {
      this.flashes.push({ x, y, r: Math.max(3, r), age: 0, life: 14, color: c });
      for (let i = 0; i < Math.min(60, 4 + r * 1.5); i++) this.spark(x, y, i % 3 ? c : '#fff1c2', true, randInt(8, 28), 60 + r * 4);
    }
    // max_durability_to_destroy against each cell's material; liquids are blown away regardless.
    if (digDurability >= 0) this.carve(x, y, r, 100, digDurability);
    // create_cell_material: the blast leaves fire, smoke, slime... in the hole.
    if (vis?.cell) {
      const m = this.cells.index(vis.cell.material);
      for (let i = 0; i < r * r * 3 && m > 0; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * r;
        if (Math.random() * 100 < vis.cell.probability) this.cells.place(x + Math.cos(a) * d, y + Math.sin(a) * d, m);
      }
    }
    // Blasts throw the player about, strongest at the centre (the engine's explosion push, approximated).
    const pc = this.center(this.player);
    const d = Math.hypot(pc.x - x, pc.y - y);
    const reach = r * 1.5 + 4;
    if (r > 0 && d < reach && this.body.dead === 0) this.push(Math.atan2(pc.y - y, pc.x - x), (1 - d / reach) * (4 + r * 0.25) * BLAST_PUSH);
    if (damage <= 0) return;
    for (const a of this.actors) {
      if (a.id === 'player' && spareShooter) continue;
      const ac = this.center(a);
      if (Math.hypot(ac.x - x, ac.y - y) <= r + a.w / 2) this.hurt(a, damage, crit);
    }
  }

  private hurt(a: Actor, amount: number, critChance: number, source?: Proj) {
    if (amount <= 0) return;
    const crit = critChance > 0 && Math.random() * 100 < critChance;
    const dealt = crit ? amount * CRIT_MULT : amount;
    if (a.id === 'dummy') {
      this.totalDamage += dealt;
      this.damageEvents.push({ frame: this.frame, amount: dealt });
    } else if (!this.harmPlayer(dealt)) {
      return;
    }
    a.flash = 6;
    if (source && (source.parent || source.area || source.laser || source.damageEveryFrames > 0)) {
      a.pending += dealt;
      a.pendingCrit ||= crit;
    } else {
      this.floater(a, dealt, crit);
    }
  }

  /** Continuous damage (lasers, arcs) that isn't tied to one projectile hit. */
  private tick(a: Actor, amount: number) {
    if (amount <= 0) return;
    if (a.id === 'dummy') {
      this.totalDamage += amount;
      this.damageEvents.push({ frame: this.frame, amount });
    } else if (!this.harmPlayer(amount)) {
      return;
    }
    a.flash = 4;
    a.pending += amount;
  }

  /** Shove the player (knockback, blasts). */
  private push(angle: number, speed: number) {
    this.body.vx += Math.cos(angle) * speed;
    this.body.vy += Math.sin(angle) * speed;
  }

  /** Take health from the player (not while invincible or already dead); false if nothing was taken. */
  private harmPlayer(amount: number) {
    const b = this.body;
    if (b.dead > 0 || b.invincible > 0) return false;
    this.selfDamage += amount;
    b.hp = Math.max(0, b.hp - amount);
    if (b.hp === 0) {
      b.dead = DEATH_FRAMES;
      b.vx = b.vy = 0;
      this.puff(this.player.x, this.player.y - this.player.h / 2, '#ff5a5a');
    }
    return true;
  }

  private floater(a: Actor, dealt: number, crit: boolean) {
    // Stack numbers that land close together in time so they don't overprint.
    const same = this.floaters.filter((f) => f.age < 10 && f.self === (a.id === 'player')).length;
    this.floaters.push({
      x: a.x + rand(-8, 8),
      y: a.y - a.h - 4 - same * 7,
      text: dealt >= 10 ? String(Math.round(dealt)) : String(Number(dealt.toFixed(1))),
      age: 0,
      crit,
      self: a.id === 'player',
    });
    if (this.floaters.length > 40) this.floaters.shift();
  }

  // ---------- lasers, area damage, arcs, lightning ----------

  private updateLaser(p: Proj) {
    const l = p.laser;
    if (!l?.on) return;
    const a = p.rot + l.angleAdd;
    const x1 = p.x + Math.cos(a) * l.maxLength;
    const y1 = p.y + Math.sin(a) * l.maxLength;
    const hit = this.raycast(p.x, p.y, x1, y1);
    const ex = hit?.x ?? x1;
    const ey = hit?.y ?? y1;
    if (hit) this.carve(ex, ey, l.beamRadius + 1, 100, l.digDurability);
    this.beams.push({ x0: p.x, y0: p.y, x1: ex, y1: ey, color: l.color, radius: l.beamRadius });
    for (const act of this.actors) {
      if (act.id === 'player' && p.spareShooter) continue;
      const b = this.actorBox(act, l.beamRadius);
      if (segmentHitsBox(p.x, p.y, ex, ey, b.l, b.t, b.r, b.b)) this.tick(act, l.damage);
    }
    if (p.age % 2 === 0) this.spark(ex, ey, l.color, true, randInt(6, 14), 30);
  }

  private updateArea(p: Proj) {
    const a = p.area;
    if (!a?.enabled || p.age % a.every) return;
    for (const act of this.actors) {
      const b = this.actorBox(act);
      if (p.x + a.maxX >= b.l && p.x + a.minX <= b.r && p.y + a.maxY >= b.t && p.y + a.minY <= b.b) {
        // AreaDamageComponent hits anything "hittable" — including the caster.
        this.hurt(act, a.damage, 0, p);
      }
    }
  }

  /** ArcComponent: lightning (or a material stream) to the previous arc-carrying projectile. */
  private updateArc(p: Proj) {
    const arc = p.arc;
    const t = arc?.target;
    if (!arc || !t || t.dead || p.age > arc.lifetime) return;
    if (arc.kind === 'lightning') {
      if (p.age % 2 === 0) this.bolts.push({ points: this.jagged(p.x, p.y, t.x, t.y, 6), age: 0, life: 3, color: arc.color });
      for (const a of this.actors) {
        if (a.id === 'player') continue;
        const b = this.actorBox(a, 2);
        if (segmentHitsBox(p.x, p.y, t.x, t.y, b.l, b.t, b.r, b.b)) this.tick(a, 0.5);
      }
    } else if (p.age % 3 === 0) {
      for (let i = 0; i < 6; i++) {
        const k = Math.random();
        this.spark(p.x + (t.x - p.x) * k, p.y + (t.y - p.y) * k, arc.color, arc.material === 'fire', randInt(10, 30), 6);
      }
    }
  }

  /** LightningComponent projectiles: an instant jagged strike that explodes where it lands. */
  private strike(p: Proj, l: NonNullable<EntityVisual['lightning']>) {
    const a = Math.atan2(p.vy, p.vx);
    const range = 280;
    let ex = p.x + Math.cos(a) * range;
    let ey = p.y + Math.sin(a) * range;
    let struck: Actor | null = null;
    for (let d = 2; d <= range; d += 2) {
      const x = p.x + Math.cos(a) * d;
      const y = p.y + Math.sin(a) * d;
      const hitActor = this.actors.find((act) => act.id === 'dummy' && this.inActor(act, x, y));
      if (this.cell(x, y) !== AIR || hitActor) {
        ex = x;
        ey = y;
        struck = hitActor ?? null;
        break;
      }
    }
    this.bolts.push({ points: this.jagged(p.x, p.y, ex, ey, 10), age: 0, life: 10, color: l.color });
    this.segments.push({ x0: p.x, y0: p.y, x1: ex, y1: ey, age: 0, life: 6, color: '#ffffff', width: 0.6 });
    if (struck) this.hurt(struck, p.hit, p.critChance);
    this.explode(ex, ey, l.radius, l.damage, l.radius > 0 ? (p.visual?.explosion?.maxDurability ?? 12) : -1, p.critChance, l.color, true, p.visual?.explosion);
  }

  private jagged(x0: number, y0: number, x1: number, y1: number, amp: number): [number, number][] {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(2, Math.ceil(len / 8));
    const nx = -(y1 - y0) / (len || 1);
    const ny = (x1 - x0) / (len || 1);
    const pts: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const j = i === 0 || i === n ? 0 : rand(-amp, amp) * Math.sin(Math.PI * t);
      pts.push([x0 + (x1 - x0) * t + nx * j, y0 + (y1 - y0) * t + ny * j]);
    }
    return pts;
  }

  private spawnBounceFx(p: Proj) {
    const fx = this.spawn(p.bounceFx!, p.x, p.y, 0, 0, {}, undefined, Math.atan2(p.vy, p.vx));
    if (fx) fx.vars.source = p.id;
  }

  spark(x: number, y: number, color: string, glow: boolean, life: number, speed = 20) {
    this.addParticle(simpleParticle(x, y, color, glow, life, speed));
  }

  private puff(x: number, y: number, color: string) {
    for (let i = 0; i < 24; i++) this.spark(x, y, color, true, randInt(10, 30), 50);
  }

  // ---------- ported projectile scripts (data/scripts/projectiles/*.lua) ----------

  private runScript(p: Proj, sc: Script) {
    sc.runs++;
    const fn = SCRIPTS[sc.script];
    if (fn) fn(p, this, sc);
    else if (BOUNCE_FX[sc.script]) p.bounceFx = BOUNCE_FX[sc.script];
    else if (!COSMETIC.has(sc.script)) this.unsupported.add(sc.script);
  }

  /** For scripts: remove a projectile the way EntityKill would (its death effects play). */
  kill(p: Proj, reason: 'hit' | 'timeout' = 'timeout') {
    this.die(p, reason);
  }

  /** For scripts: the player's hitbox centre (the projectile's mWhoShot). */
  get playerCenter() {
    return this.center(this.player);
  }

  /**
   * Black / white hole pull (black_hole_gravity.lua): every projectile within 150 px gets
   * 196 × (1 - distance/150) px/s added toward the hole (away from it when `sign` is -1).
   * Physics bodies feel a fifth of that as a force.
   */
  gravityWell(hole: Proj, sign: number, range = 150, coeff = 196) {
    for (const q of this.projectiles) {
      if (q === hole || q.dead || q.visual?.tags?.includes('black_hole')) continue;
      const dx = hole.x - q.x;
      const dy = hole.y - q.y;
      const d = Math.hypot(dx, dy);
      if (d >= range || d < 0.5) continue;
      const f = (sign * coeff * (range - d)) / range / d;
      const k = q.physicsBody ? 0.2 * DT : 1;
      q.vx += dx * f * k;
      q.vy += dy * f * k;
    }
  }

  /**
   * MaterialSuckerComponent: each frame it tries `perFrame` random cells within `reach` (a square, as in the
   * component's randomized_position) and takes those of its kind (powder or liquid) into its barrel.
   */
  private suck(p: Proj) {
    const s = p.sucker!;
    for (let i = 0; i < s.perFrame; i++) {
      const x = Math.floor(p.x + randInt(-s.reach, s.reach));
      const y = Math.floor(p.y + randInt(-s.reach, s.reach));
      const m = this.cells.at(x, y);
      if (m <= 0 || this.cells.mats[m]!.kind !== s.kind) continue;
      this.cells.set(x, y, AIR);
      s.held.set(m, (s.held.get(m) ?? 0) + 1);
      // A grain of it streaking into the field.
      if (i % 4 === 0) {
        const a = Math.atan2(p.y - y, p.x - x);
        const d = Math.hypot(p.x - x, p.y - y);
        const color = this.data.materialColor.get(this.cells.mats[m]!.id)?.slice(0, 7) ?? '#ffffff';
        this.addParticle({ ...simpleParticle(x, y, color, false, 10, 0, 0), vx: Math.cos(a) * d * 6, vy: Math.sin(a) * d * 6 });
      }
    }
  }

  /** MaterialInventoryComponent on_death_spill: everything it held pours out where it is. */
  spill(p: Proj) {
    const held = p.sucker?.held;
    if (!held?.size) return;
    const cx = Math.round(p.x);
    const cy = Math.round(p.y);
    for (const [m, n] of held) {
      let left = n;
      for (let r = 0; left > 0 && r < 60; r++) {
        for (let dy = -r; dy <= r && left > 0; dy++) {
          for (let dx = -r; dx <= r && left > 0; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            if (this.cells.place(cx + dx, cy + dy, m)) left--;
          }
        }
      }
    }
    held.clear();
  }

  /**
   * Earthquake (loose_chunks_projectile: LooseGroundComponent, max_distance 96, probability 0.2): chunks of the
   * solid ground around the point break off and fall. The game drops them as physics chunks shaped by its
   * collapse images; here each chunk becomes a falling copy of the rock it was made of.
   */
  crumble(x: number, y: number) {
    for (let i = 0; i < 60; i++) {
      if (Math.random() >= 0.2) continue;
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * 96;
      const cx = Math.round(x + Math.cos(a) * d);
      const cy = Math.round(y + Math.sin(a) * d);
      const r = randInt(3, 7);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const m = this.cells.at(cx + dx, cy + dy);
          if (m <= 0) continue;
          const info = this.cells.mats[m]!;
          if (info.kind !== K_STATIC || info.hard) continue;
          this.cells.set(cx + dx, cy + dy, this.cells.loose(m));
        }
      }
    }
    this.shake = Math.min(6, this.shake + 3);
  }

  /** Chaotic Transmutation: the cells tagged [chaotic_transmutation] within `radius` become material `to`. */
  transmute(x: number, y: number, radius: number, to: number) {
    if (to <= 0) return;
    const r2 = radius * radius;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const m = this.cells.at(x + dx, y + dy);
        if (m <= 0 || m === to || !this.cells.mats[m]!.tags.has('chaotic_transmutation')) continue;
        this.cells.set(Math.floor(x + dx), Math.floor(y + dy), to);
      }
    }
  }

  materialIndex(id: string) {
    return this.cells.index(id);
  }

  /** A projectile's top launch speed from its file. */
  launchSpeed(file: string) {
    return this.data.projectiles[file]?.speed[1] ?? 300;
  }

  /** The game's wand sprites (for haunted wands). */
  get wandSprites() {
    return this.data.kit?.wands ?? [];
  }

  /** The nearest actor to a point (worms hunt whatever is closest). */
  nearestActor(x: number, y: number) {
    let best = this.dummy;
    let bd = Infinity;
    for (const a of this.actors) {
      if (a.id === 'player' && this.body.dead > 0) continue;
      const c = this.center(a);
      const d = Math.hypot(c.x - x, c.y - y);
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    return { actor: best, at: this.center(best), dist: bd };
  }

  /** A bite or a blow from a creature (worm, rock spirit): damage to an actor, honouring invincibility. */
  strikeActor(a: Actor, amount: number) {
    this.hurt(a, amount, 0);
  }

  /** Vacuum Field: hittable things and projectiles within `radius` are yanked to (x, y). */
  pullTo(x: number, y: number, radius: number, except: Proj) {
    for (const a of this.actors) {
      const c = this.center(a);
      if (Math.hypot(c.x - x, c.y - y) < radius) this.moveActor(a, x, y + a.h / 2);
    }
    for (const q of this.projectiles) {
      if (q === except || q.dead || Math.hypot(q.x - x, q.y - y) >= radius) continue;
      q.x = q.px = x;
      q.y = q.py = y;
    }
  }

  /** Destruction: the dummy is wiped out (no damage number, it just goes), the caster loses 7.5% (at least 12.5). */
  destroy(x: number, y: number) {
    const d = this.dummy;
    if (Math.abs(d.x - x) + Math.abs(d.y - d.h / 2 - y) < 300) {
      this.addEffect('data/entities/particles/destruction.xml', d.x, d.y - d.h / 2);
      this.puff(d.x, d.y - d.h / 2, '#ffffff');
      this.floaters.push({ x: d.x, y: d.y - d.h - 4, text: 'destroyed', age: 0, crit: true, self: false });
      d.flash = 30;
    }
    const b = this.body;
    if (b.dead === 0) {
      const p = this.player;
      this.addEffect('data/entities/particles/destruction.xml', p.x, p.y - p.h / 2);
      const loss = Math.max(b.hp * 0.075, HP_UNIT * 0.5);
      const hp = Math.max(HP_UNIT * 0.04, b.hp - loss);
      this.selfDamage += b.hp - hp;
      b.hp = hp;
      p.flash = 6;
    }
    this.shake = 6;
  }

  /** Mass Polymorph: everything within reach (the caster too) is polymorphed. */
  polymorphNear(x: number, y: number) {
    for (const a of this.actors) {
      const c = this.center(a);
      if (Math.hypot(c.x - x, c.y - y) <= 200 && Math.abs(c.x - x) + Math.abs(c.y - y) < 300) this.applyEffects(a, ['data/entities/misc/effect_polymorph.xml']);
    }
    this.shake = 6;
  }

  /** A sheep can't use a wand: the caster is polymorphed (any polymorph effect). */
  get polymorphed() {
    for (const s of this.player.status.keys()) if (s.startsWith('POLYMORPH')) return true;
    return false;
  }

  /** For scripts: the projectile with this id, if it's still flying. */
  find(id: number | undefined) {
    return id === undefined ? undefined : this.projectiles.find((q) => q.id === id && !q.dead);
  }

  get dummyCenter() {
    return this.center(this.dummy);
  }

  visual(file: string): EntityVisual | undefined {
    return this.data.visuals[file];
  }
}

/** Scripts the game runs once, as the entity is created (setting tweaks, or spawning things). */
const ONCE = new Set([
  'accelerating_shot', 'decelerating_shot', 'piercing_shot', 'clipping_shot', 'explosion_remove', 'explosion_tiny', 'remove_bounce',
  'fly_downwards', 'fly_upwards', 'autoaim', 'teleport_projectile_closer_init', 'orbit_projectile',
  'bounce_spark_main', 'bounce_laser_launch', 'bounce_larpa_launch', 'bounce_lightning_launch',
  ...Object.keys(BOUNCE_FX),
]);

/** Noita's get_direction(x1, y1, x2, y2) from utilities.lua. */
const getDirection = (x1: number, y1: number, x2: number, y2: number) => Math.PI - Math.atan2(y2 - y1, x2 - x1);

const SCRIPTS: Record<string, (p: Proj, w: RangeWorld, sc: Script) => void> = {
  // "Orbiting Arc" — turns 0.33 rad every run (towards the caster's facing).
  spiraling_shot: (p, w) => {
    const angle = -Math.atan2(p.vy, p.vx);
    const d = speedOf(p);
    p.vx = Math.cos(angle + w.facing * 0.33) * d;
    p.vy = -Math.sin(angle + w.facing * 0.33) * d;
  },
  // "Spiral Arc" — circles the point it was fired from.
  orbit_shot: (p) => {
    if (p.vars.orbit === undefined) {
      p.vars.orbit = 1;
      p.vars.ox = p.x;
      p.vars.oy = p.y;
      p.vars.spd = randInt(30, 70) * (randInt(0, 1) * 2 - 1);
      p.vars.rspd = speedOf(p);
    }
    const dir = getDirection(p.x, p.y, p.vars.ox!, p.vars.oy!);
    const spd = (p.vars.spd! * Math.PI) / 180;
    p.vx = Math.cos(dir + spd) * p.vars.rspd!;
    p.vy = -Math.sin(dir + spd) * p.vars.rspd!;
  },
  pingpong_path: (p) => {
    if (p.vars.ppOff) return;
    const vel = speedOf(p);
    if (vel < 60) {
      p.vars.ppOff = 1;
      return;
    }
    const sc = p.scripts.find((s) => s.script === 'pingpong_path');
    if (sc) sc.every = Math.floor(Math.max(4, Math.min(50, ((vel - 60) * (4 - 50)) / (600 - 60) + 50)));
    p.vx = -p.vx * 0.85;
    p.vy = -p.vy * 0.85 - vel * 0.1;
  },
  chaotic_arc: (p) => {
    const scale = Math.max(Math.abs(p.vx), Math.abs(p.vy)) * 0.4;
    const r = rand(-scale, scale);
    p.vx += r;
    p.vy += r;
  },
  horizontal_arc: (p) => {
    p.vy = 0;
  },
  line_arc: (p) => {
    const d = speedOf(p);
    const deg = Math.floor(((-Math.atan2(p.vy, p.vx) * 180) / Math.PI + 22.5) / 45) * 45;
    const a = (deg * Math.PI) / 180;
    p.vx = Math.cos(a) * d;
    p.vy = -Math.sin(a) * d;
  },
  floating_arc: (p, w) => {
    const hit = w.raycast(p.x, p.y, p.x, p.y + 30);
    if (!hit) return;
    const pvy = p.vy;
    let vy = -(p.y - hit.y + 12) * 60;
    vy = Math.max(-240, Math.min(240, vy));
    p.vy = vy * 0.5 + pvy * 0.5;
    p.vx *= 0.98;
  },
  fly_downwards: (p) => {
    const v = speedOf(p);
    p.vx = 0;
    p.vy = v * 2;
  },
  fly_upwards: (p) => {
    const v = speedOf(p);
    p.vx = 0;
    p.vy = -v * 2;
  },
  accelerating_shot: (p) => {
    p.airFriction -= 3;
  },
  decelerating_shot: (p) => {
    p.airFriction += 6;
  },
  piercing_shot: (p) => {
    p.dieOnCollision = false;
    p.penetrateEntities = true;
  },
  clipping_shot: (p) => {
    p.penetrateWorld = true;
    p.penetrateCoeff = 0.1;
    p.airFriction = Math.max(0, p.airFriction);
  },
  explosion_remove: (p) => {
    p.explosion = null;
  },
  explosion_tiny: (p) => {
    if (p.explosion) p.explosion.radius = 5;
  },
  remove_bounce: (p) => {
    p.bounces = 0;
  },
  phasing_arc: (p) => {
    const v = speedOf(p);
    if (v < 1) return;
    p.x += (p.vx / v) * 28;
    p.y += (p.vy / v) * 28;
  },
  avoiding_arc: (p, w) => {
    let nx = 0;
    let ny = 0;
    for (const [dx, dy] of [
      [1, 0],
      [0, -1],
      [-1, 0],
      [0, 1],
    ] as const) {
      const hit = w.raycast(p.x, p.y, p.x + dx * 20, p.y + dy * 20);
      if (hit) {
        nx -= (400 - (hit.x - p.x) ** 2) * dx * 0.3;
        ny -= (400 - (hit.y - p.y) ** 2) * dy * 0.3;
      }
    }
    p.vx += nx;
    p.vy += ny;
  },
  true_orbit: (p, w) => {
    const px = w.player.x;
    const py = w.player.y - 10;
    if (p.vars.dist === undefined) {
      p.vars.dist = Math.max(16, speedOf(p) * 0.05);
      p.collideWorld = false;
      p.dieOnLowVelocity = false;
    }
    const dist = p.vars.dist;
    const dir = getDirection(px, py, p.x, p.y);
    const dir2 = dir + 0.33 * w.facing;
    const oldx = px + Math.cos(dir) * dist;
    const oldy = py - Math.sin(dir) * dist;
    const newx = px - Math.cos(dir2) * dist;
    const newy = py + Math.sin(dir2) * dist;
    p.x = newx;
    p.y = newy;
    p.vx = newx - oldx;
    p.vy = newy - oldy;
  },
  // Aiming arc / auto-aim steer toward the mouse or the nearest enemy; on the range that's the dummy.
  homing_cursor: (p, w) => {
    const t = w.dummyCenter;
    const cur = Math.atan2(p.vy, p.vx);
    let diff = Math.atan2(t.y - p.y, t.x - p.x) - cur;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const a = cur + Math.max(-0.1, Math.min(0.1, diff));
    const sp = speedOf(p);
    p.vx = Math.cos(a) * sp;
    p.vy = Math.sin(a) * sp;
  },
  autoaim: (p, w) => {
    const sp = speedOf(p);
    const t = w.dummyCenter;
    const a = Math.atan2(t.y - p.y, t.x - p.x);
    p.vx = Math.cos(a) * sp;
    p.vy = Math.sin(a) * sp;
  },

  // ----- Giga disc: decelerates, reverses and comes back (disc_bullet_big_trajectory.lua) -----
  disc_bullet_big_trajectory: (p) => {
    let angle = p.vars.dAngle ?? -1;
    let speed = p.vars.dSpeed ?? -1;
    if (speed !== -1 && speed > -200) speed -= 60;
    if (angle === -1 || speed === -1) {
      angle = Math.floor((-Math.atan2(p.vy, p.vx) * 180) / Math.PI);
      speed = speedOf(p);
    }
    p.vars.dAngle = angle;
    p.vars.dSpeed = speed;
    const r = (angle * Math.PI) / 180;
    p.vx += Math.cos(r) * speed * 0.1;
    p.vy -= Math.sin(r) * speed * 0.1;
  },
  disc_bullet_big_damage: (p) => {
    if (p.area) p.area.enabled = true;
  },

  // ----- Chain bolt: hops 30px, or snaps to an enemy within 48px, leaving a small blast (chain_bolt.lua) -----
  chain_bolt: (p, w) => {
    const DUMMY = 1;
    const ox = p.x;
    const oy = p.y;
    const t = w.dummyCenter;
    if (Math.hypot(t.x - p.x, t.y - p.y) <= 48 && p.vars.prev !== DUMMY && p.vars.prevPrev !== DUMMY) {
      p.vars.prevPrev = p.vars.prev ?? 0;
      p.vars.prev = DUMMY;
      p.x = t.x;
      p.y = t.y;
    } else {
      p.vars.prevPrev = p.vars.prev ?? 0;
      p.vars.prev = 0;
      p.x += Math.cos(p.rot) * 30;
      p.y += Math.sin(p.rot) * 30;
    }
    w.segments.push({ x0: ox, y0: oy, x1: p.x, y1: p.y, age: 0, life: 10, color: '#a37cff', width: 1 });
    w.spawn('data/entities/projectiles/deck/chain_bolt_explosion.xml', p.x, p.y, 0, 0, {});
  },

  // ----- Teleports -----
  teleport_projectile_closer_init: (p) => {
    p.vars.ox = p.x;
    p.vars.oy = p.y;
  },

  // ----- Orbit spells: four copies circle the projectile (orbit_projectile*.lua) -----
  // Each orbit modifier (its own entity) spawns and spins its own group of four.
  orbit_projectile: (p, w, sc) => {
    const type = sc.from?.vars?.orbit_projectile_type;
    if (!type) return;
    const file = type === 'orbit_larpa' ? p.file : `data/entities/misc/${type}.xml`;
    let speed = 0;
    while (speed === 0) speed = randInt(-1, 1) * 0.1;
    p.vars[`orbitSpeed:${type}`] = speed;
    for (let i = 0; i < 4; i++) {
      const c = w.spawn(file, p.x, p.y, 0, 0, type === 'orbit_larpa' ? { ...p.state, extra_entities: '' } : {});
      if (!c) continue;
      c.parent = p;
      c.orbitIndex = i;
      c.orbitGroup = type;
      c.lifetime = -1;
      c.scripts = c.scripts.filter((s) => s.script !== 'orbit_projectile' && s.script !== 'orbit_projectile_rotation');
      p.children.push(c);
    }
  },
  orbit_projectile_rotation: (p, w, sc) => {
    const type = sc.from?.vars?.orbit_projectile_type;
    const speed = p.vars[`orbitSpeed:${type}`] ?? 0;
    for (const c of p.children) {
      if (c.dead || c.orbitGroup !== type) continue;
      const angle = Math.PI * 0.5 * c.orbitIndex + w.frame * speed;
      const dist = c.visual?.tags?.includes('orbit_laser') ? 8 : 24;
      c.px = c.x;
      c.py = c.y;
      c.x = p.x + Math.cos(angle) * dist;
      c.y = p.y - Math.sin(angle) * dist;
      c.rot = -(angle - Math.PI * 0.5);
      c.vx = p.vx;
      c.vy = p.vy;
    }
  },
  laser_emitter_start: (p) => {
    if (p.laser) p.laser.on = true;
  },

  // ----- Bounce effect launchers (spawned at a bounce) -----
  bounce_spark_main: (p, w) => {
    const n = 1 + Math.max(0, randInt(-2, 1));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = randInt(200, 300);
      w.spawn(`data/entities/projectiles/deck/bounce_spark_friendly_fire${i ? '_silent' : ''}.xml`, p.x, p.y, Math.cos(a) * s, -Math.sin(a) * s, {});
    }
    p.dead = true;
  },
  bounce_laser_launch: (p, w) => {
    let a = Math.PI * 0.5;
    for (let i = 0; i < 4; i++) {
      const vx = Math.cos(a) * 150;
      const vy = -Math.sin(a) * 150;
      a += Math.PI / 2;
      w.spawn('data/entities/projectiles/deck/bounce_laser.xml', p.x + vx * 0.05, p.y + vy * 0.05, vx, vy, {});
    }
    p.dead = true;
  },
  bounce_larpa_launch: (p, w) => {
    const src = w.find(p.vars.source);
    if (src && Math.abs(src.vx) + Math.abs(src.vy) > 50) {
      let a = -Math.atan2(src.vy, src.vx) + Math.PI / 4;
      // Clones copy the projectile but not its modifiers, so a Larpa bounce can't cascade forever.
      const state = { ...src.state, extra_entities: '' };
      for (let i = 0; i < 4; i++) {
        const vx = Math.cos(a) * 250;
        const vy = -Math.sin(a) * 250;
        a += Math.PI / 2;
        w.spawn(src.file, p.x + vx * 0.05, p.y + vy * 0.05, vx, vy, state);
      }
    }
    p.dead = true;
  },
  bounce_lightning_launch: (p, w) => {
    const a = Math.random() * Math.PI * 2;
    const vx = Math.cos(a) * 1000;
    const vy = -Math.sin(a) * 1000;
    w.spawn('data/entities/projectiles/deck/bounce_lightning.xml', p.x + vx * 0.05, p.y + vy * 0.05, vx, vy, {});
    p.dead = true;
  },

  // ----- Black and white holes (black_hole_gravity.lua, white_hole_gravity.lua, *_big.lua) -----
  black_hole_gravity: (p, w) => w.gravityWell(p, 1),
  white_hole_gravity: (p, w) => w.gravityWell(p, -1),
  // The giant ones grow (BlackHoleComponent radius + 1 per run, up to 64): they eat a widening hole.
  black_hole_big: (p) => {
    p.cellEater = Math.min(64, Math.max(1, p.cellEater) + 1);
  },
  white_hole_big: () => {},

  // ----- Expanding Orb: damage falls from full to 0.1 over 115 runs (orb_expanding.lua) -----
  orb_expanding: (p, _w, sc) => {
    p.vars.baseHit ??= p.hit;
    const t = Math.min(1, (sc.runs - 1) / 115);
    p.hit = p.vars.baseHit + (0.1 * 25 - p.vars.baseHit) * t;
  },

  // ----- Spiral Shot: four parts circle the projectile at 16 px, turning 0.1 rad a run -----
  spiral_shot_start: (p, w) => {
    let theta = (6 * Math.PI) / 180 - w.frame / 10;
    for (let i = 0; i < 4; i++) {
      const c = w.spawn('data/entities/projectiles/deck/spiral_part.xml', p.x + Math.cos(theta) * 16, p.y + Math.sin(theta) * 16, 0, 0, {});
      if (c) {
        c.parent = p;
        c.orbitGroup = 'spiral';
        c.lifetime = -1;
        c.vars.theta = theta;
        p.children.push(c);
      }
      theta += (2 * Math.PI) / 4;
    }
  },
  spiral_shot: (p) => {
    for (const c of p.children) {
      if (c.dead || c.orbitGroup !== 'spiral') continue;
      c.px = c.x;
      c.py = c.y;
      c.x = p.x + Math.cos(c.vars.theta!) * 16;
      c.y = p.y + Math.sin(c.vars.theta!) * 16;
      c.vars.theta! += 0.1;
    }
  },

  // ----- Homing variants -----
  homing_accelerating: (p) => {
    if (!p.homing) return;
    p.homing.coeff = Math.min(800, p.homing.coeff + 2);
    p.homing.velocityMultiplier = Math.min(2, p.homing.velocityMultiplier + 0.01);
  },
  // Homing Area: snaps onto a target within 32 px.
  homing_area: (p, w) => {
    const t = w.dummyCenter;
    if (Math.hypot(t.x - p.x, t.y - p.y) <= 32) {
      p.x = t.x;
      p.y = t.y;
    }
  },
  teleport_cast: (p, w) => {
    const t = w.dummyCenter;
    if (Math.hypot(t.x - p.x, t.y - p.y) <= 96) {
      p.x = t.x;
      p.y = t.y;
    }
  },
  caster_cast: (p, w) => {
    const c = w.playerCenter;
    p.x = c.x;
    p.y = c.y;
  },

  // ----- Modifiers that shoot extra projectiles as they fly (*_ray.lua) -----
  lightning_ray: (p, w) => shootRandom(w, p, 'data/entities/projectiles/deck/lightning_extra_arcs.xml', 3000),
  fireball_ray: (p, w) => shootRandom(w, p, 'data/entities/projectiles/deck/fireball_ray.xml', 3000),
  tentacle_ray: (p, w) => shootRandom(w, p, 'data/entities/projectiles/deck/tentacle.xml', 3000),
  laser_emitter_ray: (p, w) => shootRandom(w, p, 'data/entities/projectiles/deck/orb_laseremitter_weak.xml', 40),
  fireball_ray_line: (p, w) => {
    if (!p.vx && !p.vy) return;
    const a = Math.atan2(p.vy, p.vx);
    for (const side of [-1, 1]) {
      const b = a + (side * Math.PI) / 2;
      w.spawn('data/entities/projectiles/deck/fireball_ray_small.xml', p.x, p.y, Math.cos(b) * 2000, Math.sin(b) * 2000, {});
    }
  },
  darkflame: (p, w) => {
    w.spawn('data/entities/projectiles/darkflame_stationary.xml', p.x + randInt(-8, 8), p.y + randInt(-8, 8), 0, 0, {});
  },
  tentacle_portal: (p, w) => {
    if (randInt(1, 4) === 1) return;
    let a = Math.random() * Math.PI * 2;
    const t = w.dummyCenter;
    if (randInt(1, 4) > 1 && Math.abs(t.x - p.x) + Math.abs(t.y - p.y) < 72) a = Math.atan2(t.y - p.y, t.x - p.x);
    const len = randInt(400, 700);
    w.spawn('data/entities/projectiles/deck/tentacle.xml', p.x, p.y, Math.cos(a) * len, Math.sin(a) * len, {});
  },
  purple_explosion_field: (p, w) => {
    let x = p.x + randInt(-70, 70);
    let y = p.y + randInt(-70, 70);
    const t = w.dummyCenter;
    if (Math.hypot(t.x - p.x, t.y - p.y) <= 70 && randInt(1, 5) === 2) {
      x = t.x;
      y = t.y;
    }
    w.spawn('data/entities/projectiles/deck/purple_explosion.xml', x, y, 0, 0, {});
  },
  meteor_rain: (p, w) => {
    for (let i = randInt(1, 3); i > 0; i--) {
      const a = Math.PI * randInt(1, 200) * 0.01;
      // Noita's y axis points up in these formulas: the meteors come from above.
      w.spawn('data/entities/projectiles/deck/meteor_rain_meteor.xml', p.x + Math.cos(a) * 300, p.y - Math.sin(a) * 300, -Math.cos(a) * 900, Math.sin(a) * 900, {});
    }
    w.shake = Math.min(6, w.shake + 15 / 12);
  },
  death_cross_big_explosion: (p, w) => {
    for (let i = 0; i < 4; i++) {
      const th = (i * Math.PI) / 2;
      for (let j = 1; j <= 4; j++) w.spawn('data/entities/projectiles/deck/death_cross_big_laser.xml', p.x, p.y, Math.cos(th) * (200 * j + 300), Math.sin(th) * (200 * j + 300), {});
    }
  },
  lightning_explosion_small: (p, w) => {
    let th = 0;
    for (let i = 0; i < 4; i++) {
      w.spawn('data/entities/projectiles/deck/lightning.xml', p.x, p.y, Math.cos(th) * 2500, Math.sin(th) * 2500, {});
      th += Math.PI / 2 + rand(-0.5, 0.5) * (Math.PI / 180) * 30;
    }
  },
  electrocution_blast: (p, w) => {
    const a = Math.random() * Math.PI * 2;
    w.spawn('data/entities/misc/electricity.xml', p.x + randInt(-28, 28), p.y + randInt(-28, 28), Math.cos(a) * 5000, Math.sin(a) * 5000, {});
  },

  // ----- Larpa: copies of the projectile (no modifiers, so they can't cascade) -----
  larpa_chaos: (p, w) => clone(w, p, Math.random() * Math.PI * 2, 1500),
  larpa_chaos_2: (p, w) => clone(w, p, Math.random() * Math.PI * 2, 10),
  larpa_downwards: (p, w) => clone(w, p, Math.PI / 2, 1700),
  larpa_upwards: (p, w) => clone(w, p, -Math.PI / 2, 1700),
  larpa_death: (p, w) => {
    let a = Math.random() * Math.PI * 2;
    for (let i = 0; i < 8; i++, a += Math.PI / 4) clone(w, p, a, 1500);
  },
  quantum_split: (p, w) => {
    const group = p.id;
    p.vars.quantum = group;
    const a = Math.atan2(p.vy, p.vx);
    const sp = speedOf(p) * 0.8;
    for (const side of [-1, 1]) {
      const c = w.spawn(p.file, p.x, p.y, Math.cos(a + side * Math.PI * 0.04) * sp, Math.sin(a + side * Math.PI * 0.04) * sp, { ...p.state, extra_entities: '' });
      if (!c) continue;
      c.penetrateWorld = false;
      c.penetrateEntities = false;
      c.vars.quantum = group;
    }
  },
  // Chain Shot: when it ends, it fires itself on, up to four more times.
  chain_shot_init: (p) => {
    p.vars.chain ??= 1;
  },
  chain_shot_launch: (p, w) => {
    const it = p.vars.chain ?? 0;
    if (it < 1 || it >= 5 || p.file.includes('exploding_deer') || p.file.includes('pebble')) return;
    let vx = p.vx;
    let vy = p.vy;
    if (Math.abs(vx) + Math.abs(vy) < 20) {
      vx += randInt(-400, 400);
      vy += randInt(-400, 400);
    }
    const c = w.spawn(p.file, p.x, p.y, vx + randInt(-10, 10), vy + randInt(-10, 10), { ...p.state, extra_entities: 'data/entities/misc/chain_shot.xml' });
    if (c) c.vars.chain = it + 1;
  },

  // ----- Rockets and other path changes -----
  rocket_downwards: (p, w) => {
    if (p.vy <= 10) return;
    for (const [vx, vy] of [
      [-100, 100],
      [-50, 140],
      [0, 160],
      [50, 140],
      [100, 100],
    ] as const)
      w.spawn('data/entities/projectiles/deck/rocket_downwards.xml', p.x + vx * 0.05, p.y + vy * 0.05, vx, vy, {});
    w.kill(p);
  },
  rocket_octagon: (p, w) => {
    if (speedOf(p) >= 50) return;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      w.spawn('data/entities/projectiles/deck/rocket_downwards.xml', p.x + Math.cos(a) * 7.5, p.y - Math.sin(a) * 7.5, Math.cos(a) * 150, -Math.sin(a) * 150, {});
    }
    w.kill(p);
  },
  fizzle: (p, w) => {
    if (randInt(1, 10) !== 1) return;
    for (let i = 0; i < 5; i++) w.spawn('data/entities/projectiles/deck/fizzle.xml', p.x, p.y, p.vx, p.vy, {});
    w.kill(p);
  },
  // Anti-gravity Grenade falls away from the caster: gravity 600 toward wherever the caster isn't.
  grenade_anti_gravity: (p, w) => {
    const py = w.playerCenter.y;
    if (py > p.y) p.gravity = 600;
    else if (py < p.y) p.gravity = -600;
  },
  // Summon Giga Disc... and the bigger one: pulled back toward the caster.
  disc_bullet_bigger_trajectory: (p, w) => {
    const o = w.playerCenter;
    const dir = getDirection(o.x, o.y, p.x, p.y);
    const dist = Math.hypot(p.x - o.x, p.y - o.y);
    p.vx += Math.cos(dir) * dist * 0.33;
    p.vy -= Math.sin(dir) * dist * 0.33;
  },
  worm_shot_slowdown: (p) => {
    if (Math.abs(p.vx) + Math.abs(p.vy) > 450) {
      p.vx *= 0.86;
      p.vy *= 0.86;
    }
  },
  swarm_fly: (p) => {
    p.vx += randInt(-20, 20);
    p.vy += randInt(-20, 20);
  },
  // Clouds hang at the ceiling, or 40 px above where they were cast.
  cloud_position: (p, w) => {
    const hit = w.raycast(p.x, p.y, p.x, p.y - 40);
    p.y = hit ? hit.y + 1 : p.y - 40;
  },
  // Random explosion: hits leave one of these projectiles behind.
  random_explosion: (p) => {
    const opts = ['acidshot', 'alcohol_blast', 'black_hole_big', 'cloud_thunder', 'cloud_acid', 'cloud_blood', 'cloud_water', 'death_cross', 'death_cross_big', 'fireball', 'firebomb', 'grenade', 'grenade_tier_2', 'grenade_tier_3', 'lightning', 'meteor', 'nuke', 'regeneration_field', 'rocket', 'rocket_tier_2', 'rocket_tier_3', 'tentacle_portal', 'thunder_blast', 'wall_square', 'xray'];
    p.spawnOnHit = `data/entities/projectiles/deck/${opts[randInt(0, opts.length - 1)]}.xml`;
  },
  // Null Shot also switches off explosions, area damage and lightning on the projectile itself.
  zero_damage: (p) => {
    p.hit = 0;
    p.explosion = null;
    p.area = undefined;
  },
  laser_emitter_wider: (p) => {
    if (!p.laser) return;
    p.laser.beamRadius += 2;
    p.laser.damage += 0.025 * 25;
    p.laser.maxLength += 36;
  },

  // ----- Spells that act on every projectile in flight -----
  bomb_detonator: (p, w) => {
    for (const q of [...w.projectiles]) {
      if (q === p || q.dead) continue;
      if (q.explosion) q.explosion.onDeath = q.explosion.onTimeout = true;
      w.kill(q, 'hit');
    }
  },
  all_nukes: (p, w) => convertAll(w, p, 'data/entities/projectiles/deck/nuke.xml', 'nuke'),
  all_discs: (p, w) => convertAll(w, p, 'data/entities/projectiles/deck/disc_bullet_big.xml', 'disc_bullet_big'),
  all_rockets: (p, w) => convertAll(w, p, 'data/entities/projectiles/deck/rocket.xml', 'rocket'),
  all_deathcrosses: (p, w) => convertAll(w, p, 'data/entities/projectiles/deck/death_cross.xml', 'death_cross'),
  all_blackholes: (p, w) => convertAll(w, p, 'data/entities/projectiles/deck/black_hole.xml', 'black_hole'),
  all_acid: (p, w) => convertAll(w, p, 'data/entities/projectiles/deck/acidshot.xml', 'acidshot'),
  clusterbomb_new: (p, w) => {
    if (speedOf(p) >= 50) return;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      w.spawn('data/entities/projectiles/deck/grenade_small.xml', p.x + Math.cos(a) * 7.5, p.y - Math.sin(a) * 7.5, Math.cos(a) * 150, -Math.sin(a) * 150, {});
    }
  },
  meteor_collide: (p) => {
    p.penetrateWorld = false;
  },
  // Hook: yanks the caster toward it at 800 px/s.
  hook: (p, w) => {
    const o = w.playerCenter;
    const a = Math.atan2(p.y - o.y, p.x - o.x);
    w.body.vx = Math.cos(a) * 800;
    w.body.vy = Math.sin(a) * 800;
  },
  // Long-Distance Cast: the payload jumps 120 px ahead (or to the first platform in the way).
  super_teleport_cast: (p, w) => {
    const a = Math.atan2(p.vy, p.vx);
    const ex = p.x + Math.cos(a) * 120;
    const ey = p.y + Math.sin(a) * 120;
    const hit = w.raycast(p.x, p.y, ex, ey);
    p.x = hit?.x ?? ex;
    p.y = hit?.y ?? ey;
  },
  // Nolla: the projectile lives one frame.
  nolla: (p) => {
    p.lifetime = Math.min(p.lifetime > 0 ? p.lifetime : Infinity, p.age + 1);
  },
  // Exploding ducks commit to dying on contact once a target is within 12 px.
  duck: (p, w) => {
    const t = w.dummyCenter;
    if (Math.hypot(t.x - p.x, t.y - p.y) <= 12) p.dieOnCollision = true;
  },
  // Projectile Gravity Well: everything within 96 px is pulled in (96 × closeness px/s a run).
  projectile_gravity: (p, w) => w.gravityWell(p, 1, 96, 96),
  // Projectile Thunder Field: nearby projectiles turn into lightning flying out from it.
  projectile_thunder: (p, w) => {
    for (const q of [...w.projectiles]) {
      if (q === p || q.dead || Math.hypot(q.x - p.x, q.y - p.y) >= 48) continue;
      const a = Math.atan2(q.y - p.y, q.x - p.x);
      q.explosion = null;
      w.spawn('data/entities/projectiles/deck/projectile_thunder_lightning.xml', q.x, q.y, Math.cos(a) * 6000, Math.sin(a) * 6000, {});
      w.kill(q);
    }
  },

  // ----- Magic Guard / Big Magic Guard: shield parts circle the caster (magic_shield_start.lua, *_part.lua) -----
  magic_shield_start: (p, w) => magicShield(w, p, 'magic_shield_part', 4, 16, 12, 5, 40),
  big_magic_shield_start: (p, w) => magicShield(w, p, 'big_magic_shield_part', 8, 40, 10, 4, 20),
  magic_shield_part: (p, w) => shieldPart(w, p, 16, 0.02),
  big_magic_shield_part: (p, w) => shieldPart(w, p, 40, 0.015),

  // ----- Barriers: builders fly out laying a line of wall pieces (wall_*.lua, wall_builder.lua) -----
  wall_horizontal: (p, w) => buildWall(w, p, [[0, 0, 500, 0]]),
  wall_vertical: (p, w) => buildWall(w, p, [[0, 0, 0, 500]]),
  wall_square: (p, w) =>
    buildWall(w, p, [
      [0, -40, 250, 0],
      [0, 40, 250, 0],
      [-40, 0, 0, 250],
      [40, 0, 0, 250],
    ]),
  wall_builder: (p, w) => {
    w.spawn(WALL_PIECE, p.x, p.y, 0, 0, {});
  },

  // ----- Intense Concentrated Light: five beams wait at the wand, then launch together (megalaser_*.lua) -----
  // The beams are found when they launch (megalaser_init only notes which ones are within 5 px).
  megalaser_init: () => {},
  megalaser_launch: (p, w) => {
    const sp = speedOf(p);
    if (sp === 0) return;
    const vx = (p.vx / sp) * 20;
    const vy = (p.vy / sp) * 20;
    // Perpendicular to the flight, for the side-by-side spread.
    const ox = -p.vy / sp;
    const oy = p.vx / sp;
    let offset = -2;
    for (const b of w.projectiles.filter((q) => q.held && !q.dead && Math.hypot(q.x - p.x, q.y - p.y) <= 5).slice(0, 5)) {
      b.held = false;
      b.x = b.px = p.x + ox * offset;
      b.y = b.py = p.y + oy * offset;
      // The outer beams are slower, for an arrowhead.
      const brake = 1 - Math.abs(offset) * 0.16;
      b.vx = vx * brake;
      b.vy = vy * brake;
      b.rot = Math.atan2(vy, vx);
      offset++;
    }
  },

  // ----- Vacuum fields -----
  // Powder / Liquid Vacuum Field: a MaterialSuckerComponent (100 powder or 200 liquid cells a frame from a
  // 64 px square); the init script moves the spill to the last frame of its life.
  vacuum_powder_init: (p) => {
    const liquid = p.file.endsWith('vacuum_liquid.xml');
    p.sucker = { kind: liquid ? K_LIQUID : K_POWDER, perFrame: liquid ? 200 : 100, reach: 64, held: new Map() };
    const helper = p.scripts.find((s) => s.script === 'vacuum_powder');
    if (helper && p.lifetime > 1) helper.every = p.lifetime - 1;
  },
  vacuum_powder: (p, w) => {
    w.spill(p);
    w.kill(p);
  },
  // Vacuum Field: everything hittable and every projectile within 64 px is pulled to its centre.
  vacuum_entities: (p, w) => w.pullTo(p.x, p.y, 64, p),

  // ----- Creatures and summons -----
  // Worm Launcher: after 40 frames the worm's homing switches on, and it turns back for its caster.
  worm_shot_homing: (p) => {
    const h = p.visual?.homing;
    if (!h) return;
    p.homing = { ...h };
    delete p.homing.enabled;
  },
  // Summon Friendly Fly: hangs around the caster; goes for an enemy within 64 px of them, gives up when
  // the chase strays too far (friend_fly.lua; distances are the script's |dx| + |dy|).
  friend_fly: (p, w) => {
    if (!p.homing) return;
    const o = w.playerCenter;
    const t = w.dummyCenter;
    const far = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    if (!p.homing.targetShooter) {
      if (far(o, p) > 64 * 2.5 || far(t, p) > 64 * 2 || far(t, o) > 64 * 3) p.homing = { ...p.homing, targetShooter: true };
    } else if (Math.hypot(t.x - o.x, t.y - o.y) <= 64) {
      p.homing = { ...p.homing, targetShooter: false };
    }
  },
  // Summon Rock Spirit: where the pebble lands, a rock spirit wakes; it seeks the nearest enemy and blows up
  // on touching it (125 explosion damage, radius 14), or after 400 frames.
  pebble_player_spawn: (p, w) => {
    const r = w.spawn('data/entities/projectiles/deck/pebble_player_physics.xml', p.x, p.y - 2, 0, -30, {});
    if (!r) return;
    r.physicsBody = false;
    r.gravity = 0;
    r.airFriction = 1.5;
    r.lifetime = 400;
    r.bounces = 999;
    r.bounceEnergy = 0.5;
    r.dieOnCollision = true;
    r.explosion = { damage: 125, radius: 14, onDeath: true, onTimeout: true, digs: true, digDurability: EXPLOSION_DIG_DEFAULT };
    r.homing = { coeff: 9, velocityMultiplier: 0.95, detectDistance: 400, rotateOnly: false, maxTurnRate: 0.05, targetShooter: false };
  },
  // Summon Taikasauva: a haunted wand (the game hands the ghost a random level-3 wand) that hovers by its
  // summoner and fires at enemies in range. Which spells that wand rolls is random in the game; here each
  // ghost picks one of a few common level-3 projectiles.
  wand_ghost: (p, w) => {
    const wands = w.wandSprites;
    if (wands.length) p.wand = wands[randInt(0, wands.length - 1)];
    p.physicsBody = false;
    p.gravity = 0;
    p.airFriction = 0;
    p.collideWorld = false;
    p.dieOnCollision = false;
    p.penetrateEntities = true;
    p.hit = 0;
    p.lifetime = 30 * 60;
    p.vars.ghostShot = randInt(0, GHOST_SHOTS.length - 1);
    p.vars.ghostSide = Math.random() < 0.5 ? -1 : 1;
    p.scripts.push({ script: 'wand_ghost_fly', every: 1, times: 0, runs: 0, onAdded: false });
  },
  wand_ghost_fly: (p, w) => {
    const o = w.playerCenter;
    const hx = o.x + 20 * p.vars.ghostSide!;
    const hy = o.y - 24 + Math.sin(p.age / 18) * 3;
    p.vx = (hx - p.x) * 4;
    p.vy = (hy - p.y) * 4;
    const t = w.dummyCenter;
    const aim = Math.atan2(t.y - p.y, t.x - p.x);
    p.rot = aim;
    if (p.age % 45 === 0 && Math.hypot(t.x - p.x, t.y - p.y) < 260) {
      const file = GHOST_SHOTS[p.vars.ghostShot!]!;
      const sp = w.launchSpeed(file);
      w.spawn(file, p.x, p.y, Math.cos(aim) * sp, Math.sin(aim) * sp, {});
    }
  },
  // Matosade: every 40 frames a giant worm drops in from above, 200 px either side (worm_rain.lua).
  worm_rain: (p, w) => {
    // The game world goes on past the range's walls; here they drop in within the range.
    const x = Math.max(12, Math.min(W - 12, p.x + randInt(-200, 200)));
    const y = p.y + randInt(-300, -160);
    const worm = w.spawn('data/entities/misc/worm_big_worm_rain.xml', x, Math.max(-20, y), 0, 120, {});
    if (!worm) return;
    worm.physicsBody = false;
    worm.gravity = 0;
    worm.airFriction = 0;
    worm.collideWorld = false;
    worm.dieOnCollision = false;
    worm.penetrateEntities = true;
    worm.hit = 0;
    worm.cellEater = 9;
    worm.lifetime = 600;
    worm.body = [];
    worm.scripts.push({ script: 'worm_hunt', every: 1, times: 0, runs: 0, onAdded: false });
    w.shake = Math.min(6, w.shake + 10 / 12);
  },
  // A giant worm (WormComponent / WormAIComponent): swims through the ground at about 4-5 px a frame,
  // turning toward the nearest creature, falls in the open air, and bites what it reaches.
  worm_hunt: (p, w) => {
    const t = w.nearestActor(p.x, p.y);
    const hunting = t.dist < 256;
    const cur = Math.atan2(p.vy, p.vx);
    let diff = Math.atan2(t.at.y - p.y, t.at.x - p.x) - cur;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    if (w.cell(p.x, p.y) !== AIR) {
      // In the ground it swims at its own speed, turning toward its target.
      const turn = hunting ? 0.04 : 0.01;
      const a = cur + Math.max(-turn, Math.min(turn, diff));
      const speed = (hunting ? 5 : 4) * 60;
      p.vx = Math.cos(a) * speed;
      p.vy = Math.sin(a) * speed;
    } else {
      // Out in the open it falls, and can only twist a little.
      const sp = speedOf(p);
      const a = cur + Math.max(-0.015, Math.min(0.015, diff));
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp + 600 * DT;
    }
    p.body!.unshift({ x: p.x, y: p.y });
    if (p.body!.length > 160) p.body!.length = 160;
    if (t.dist < 10 && (p.vars.nextBite ?? 0) <= p.age) {
      w.strikeActor(t.actor, HP_UNIT);
      p.vars.nextBite = p.age + 30;
    }
  },
  // Bomb Cart: rolls away from its caster along the ground, then blows up (bomb_cart*.lua). The game drives
  // two wheel motors at 15 on a physics body; here it rolls at the speed those wheels give.
  bomb_cart_init: (p, w) => {
    const dir = Math.sign(p.x - w.player.x) || w.facing;
    p.vars.dir = dir;
    p.vx = dir * 70;
    p.vy = -40;
    p.physicsBody = false;
    p.collideWorld = false;
    p.rotate = false;
  },
  bomb_cart: (p, w) => {
    const dir = p.vars.dir ?? 1;
    if (w.cell(p.x, p.y + 5) !== AIR) {
      while (w.cell(p.x, p.y + 4) !== AIR && p.y > 0) p.y--;
      p.vy = Math.min(0, p.vy);
      p.vx = w.cell(p.x + dir * 8, p.y) !== AIR ? 0 : dir * 45;
    }
  },
  // Earthquake: where the shot ends, the ground around it breaks loose.
  crumbling_earth_projectile: (p, w) => w.crumble(p.x, p.y),

  // ----- Spells that act on the world around them -----
  destruction: (p, w) => {
    w.destroy(p.x, p.y);
    w.kill(p);
  },
  mass_polymorph: (p, w) => {
    w.polymorphNear(p.x, p.y);
    w.kill(p);
  },
  // Projectile Transmutation Field: projectiles within 48 px turn into small animals (duck, sheep...) without
  // exploding. The range has no animals, so they just vanish in the transmutation sparkle.
  projectile_transmutation: (p, w) => {
    for (const q of [...w.projectiles]) {
      if (q === p || q.dead || Math.abs(q.x - p.x) + Math.abs(q.y - p.y) >= 64 || Math.hypot(q.x - p.x, q.y - p.y) >= 48) continue;
      q.explosion = null;
      for (let i = 0; i < 10; i++) w.spark(q.x, q.y, i % 2 ? '#ff9cf4' : '#ffffff', true, randInt(10, 20), 30);
      w.kill(q);
    }
  },
  // Chaotic Transmutation: picks a material (1 in 50 a rare one) and turns what's around the shot into it.
  transmutation: (p, w) => {
    const pool = randInt(1, 100) > 98 ? TRANSMUTE_RARE : TRANSMUTE_COMMON;
    p.vars.transmute = w.materialIndex(pool[randInt(0, pool.length - 1)]!);
    p.scripts.push({ script: 'transmutation_convert', every: 1, times: 0, runs: 0, onAdded: false });
  },
  transmutation_convert: (p, w) => w.transmute(p.x, p.y, 32, p.vars.transmute ?? -1),
  // Spells to Power: the caster's other projectiles within 160 px are used up; their damage adds to this
  // one's, and its blast grows (spells_to_power.lua).
  spells_to_power: (p, w) => {
    let count = 0;
    let expcount = 0;
    for (const q of [...w.projectiles]) {
      if (q === p || q.dead || q.parent || Math.hypot(q.x - p.x, q.y - p.y) > 160) continue;
      count += q.hit;
      expcount += q.explosion?.damage ?? 0;
      q.explosion = null;
      for (let i = 0; i < 4; i++) w.spark(q.x, q.y, '#ff5040', true, randInt(6, 12), 20);
      w.kill(q);
    }
    p.hit += count;
    if (p.explosion) {
      p.explosion.damage += expcount;
      // The script works in the game's units (25 HP each) times 10.
      const total = ((count + expcount) / HP_UNIT) * 10;
      if (total > 0) p.explosion.radius = Math.min(120, Math.floor(p.explosion.radius + Math.log(total * 10.5)));
    }
  },
  // Essence to Power: every creature within 160 px (the dummy) adds max(0.5, max_hp / 4) of "essence";
  // a quarter of that, up to 120, goes onto the damage and the blast. The dummy is taken at 100 HP.
  essence_to_power: (p, w) => {
    const t = w.dummyCenter;
    const count = Math.hypot(t.x - p.x, t.y - p.y) <= 160 ? Math.max(0.5, (100 / HP_UNIT) * 0.25) : 0;
    if (!count) return;
    const add = Math.min(120, count * 0.25) * HP_UNIT;
    p.hit += add;
    if (p.explosion) {
      p.explosion.damage += add;
      p.explosion.radius = Math.max(p.explosion.radius, Math.min(120, Math.floor(p.explosion.radius + Math.log(count * 5.5))));
    }
    for (let i = 0; i < 6; i++) w.spark(p.x, p.y, '#5ab4ff', true, randInt(8, 16), 30);
  },
};

const WALL_PIECE = 'data/entities/projectiles/deck/wall_piece.xml';
const WALL_BUILDER = 'data/entities/projectiles/deck/wall_builder.xml';

/** A wall piece where the barrier was cast, and a builder each way along it, per side. */
function buildWall(w: RangeWorld, p: Proj, sides: [number, number, number, number][]) {
  for (const [dx, dy, vx, vy] of sides) {
    w.spawn(WALL_PIECE, p.x + dx, p.y + dy, 0, 0, {});
    w.spawn(WALL_BUILDER, p.x + dx, p.y + dy, vx, vy, {});
    w.spawn(WALL_BUILDER, p.x + dx, p.y + dy, -vx, -vy, {});
  }
}

/** Shield parts spaced around the caster, all spinning the same random way (fast, 1 time in 20). */
function magicShield(w: RangeWorld, p: Proj, part: string, n: number, length: number, maxSpin: number, minSpin: number, rareSpin: number) {
  let theta = (6 * Math.PI) / 180 - w.frame / 10;
  let spin = 0;
  while (Math.abs(spin) < minSpin) spin = randInt(-maxSpin, maxSpin);
  if (randInt(1, 20) === 5) spin = rareSpin;
  for (let i = 0; i < n; i++) {
    const c = w.spawn(`data/entities/projectiles/deck/${part}.xml`, p.x + Math.cos(theta) * length, p.y - Math.sin(theta) * length, 0, 0, {});
    if (c) {
      c.vars.angle = theta;
      c.vars.spin = spin;
      c.collideWorld = false;
    }
    theta += (2 * 3.14159) / n;
  }
  w.kill(p);
}

/** A shield part's place on its circle around the caster (y up, as in the game's script). */
function shieldPart(w: RangeWorld, p: Proj, length: number, speed: number) {
  const spin = p.vars.spin ?? 0;
  p.vars.angle = (p.vars.angle ?? 0) + spin * speed;
  const a = p.vars.angle + spin;
  const o = w.playerCenter;
  p.px = p.x;
  p.py = p.y;
  p.x = o.x + Math.cos(a) * length;
  p.y = o.y - Math.sin(a) * length;
}

/** What a haunted wand might shoot (its random level-3 wand's projectiles). */
const GHOST_SHOTS = [
  'data/entities/projectiles/deck/light_bullet.xml',
  'data/entities/projectiles/deck/bullet.xml',
  'data/entities/projectiles/deck/bullet_slow.xml',
  'data/entities/projectiles/deck/bubbleshot.xml',
  'data/entities/projectiles/deck/bouncy_orb.xml',
];

/** Chaotic Transmutation's materials (transmutation.lua). */
const TRANSMUTE_COMMON = ['water', 'oil', 'lava', 'acid', 'radioactive_liquid', 'slime', 'sand', 'alcohol', 'blood', 'snow', 'blood_worm', 'blood_fungi', 'burning_powder', 'honey', 'fungi', 'diamond', 'brass', 'silver'];
const TRANSMUTE_RARE = ['acid', 'magic_liquid_teleportation', 'magic_liquid_polymorph', 'magic_liquid_random_polymorph', 'magic_liquid_berserk', 'magic_liquid_charm', 'magic_liquid_invisibility'];

/** shoot_projectile_from_projectile in a random direction at a fixed speed. */
function shootRandom(w: RangeWorld, p: Proj, file: string, speed: number) {
  const a = Math.random() * Math.PI * 2;
  w.spawn(file, p.x, p.y, Math.cos(a) * speed, Math.sin(a) * speed, {});
}

/** A copy of the projectile (its projectile_file) without modifiers, as the Larpa spells make. */
function clone(w: RangeWorld, p: Proj, angle: number, speed: number) {
  w.spawn(p.file, p.x, p.y, Math.cos(angle) * speed, Math.sin(angle) * speed, { ...p.state, extra_entities: '' });
}

/** The "all_*" spells: every other projectile becomes `file` (keeping its velocity), without exploding. */
function convertAll(w: RangeWorld, p: Proj, file: string, tag: string) {
  for (const q of [...w.projectiles]) {
    if (q === p || q.dead || q.file === file || q.visual?.tags?.includes(tag)) continue;
    q.explosion = null;
    w.spawn(file, q.x, q.y, q.vx, q.vy, {});
    w.kill(q);
  }
}
