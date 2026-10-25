// Test-range simulation: replays the cast simulator's output as moving projectiles in a small pixel world.
// Pure logic (no DOM) so it can be unit-tested; rendering lives in render.ts.
//
// Fidelity notes: motion uses each projectile's own component data (speed, gravity, air friction, bounces,
// lifetime, homing, sine waves, lasers, area damage, lightning) and ports the game's Lua for path modifiers,
// bounce effects, orbits, the giga disc, chain bolt and teleports. Approximated: the engine's C++ internals
// (exact homing maths, friction integration, Box2D physics for thrown bombs, arc damage) and falling-sand materials.
import type { EntityVisual, Projectile } from '@/data/types';
import { CRIT_MULT, projectileDamage } from '@/sim/analyze';
import type { ShotState, SimCast, SimShot } from '@/sim/types';

export const W = 420;
export const H = 236;
const DT = 1 / 60;
const MAX_PROJECTILES = 700;
const MAX_PARTICLES = 3000;
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
};

/** A scheduled LuaComponent, remembering which entity (projectile or modifier effect) it belongs to. */
type Script = { script: string; every: number; times: number; runs: number; onAdded: boolean; from?: EntityVisual };

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
  penetrateEntities: boolean;
  dieOnCollision: boolean;
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
  trails: string[];
  light?: { color: string; radius: number };
  scripts: Script[];
  vars: Record<string, number>;
  /** Orbiting children (orbit spells) and the parent they circle. */
  children: Proj[];
  parent?: Proj;
  orbitIndex: number;
  orbitGroup?: string;
  dead: boolean;
};

export type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; glow: boolean };
export type Flash = { x: number; y: number; r: number; age: number; color: string };
export type Floater = { x: number; y: number; text: string; age: number; crit: boolean; self: boolean };
/** A fading line (luminous drill beams, chain-bolt hops). */
export type Segment = { x0: number; y0: number; x1: number; y1: number; age: number; life: number; color: string; width: number };
/** Jagged lightning (bolts, electric arcs). */
export type Bolt = { points: [number, number][]; age: number; life: number; color: string };
/** A laser beam this frame. */
export type Beam = { x0: number; y0: number; x1: number; y1: number; color: string; radius: number };

/** Scripts whose effect is purely cosmetic or covered by data; never reported as missing. */
const COSMETIC = new Set(['colour_spell', 'orbit_shot_init', 'spells_to_power_tag']);

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
  readonly terrain = new Uint8Array(W * H);
  terrainVersion = 0;
  projectiles: Proj[] = [];
  particles: Particle[] = [];
  flashes: Flash[] = [];
  floaters: Floater[] = [];
  segments: Segment[] = [];
  bolts: Bolt[] = [];
  beams: Beam[] = [];
  frame = 0;
  readonly floorY = H - 34;
  readonly player: Actor = { id: 'player', x: 34, y: H - 34, w: 8, h: 17, homeX: 34, vy: 0, flash: 0, pending: 0, pendingCrit: false };
  readonly dummy: Actor = { id: 'dummy', x: 262, y: H - 34, w: 14, h: 24, homeX: 262, vy: 0, flash: 0, pending: 0, pendingCrit: false };
  readonly unsupported = new Set<string>();
  damageEvents: { frame: number; amount: number }[] = [];
  totalDamage = 0;
  selfDamage = 0;
  castsFired = 0;

  private casts: SimCast[] = [];
  private cycleFrames = 0;
  private cycleStart = 0;
  private nextId = 1;
  private lastArc: Proj | null = null;

  constructor(private data: RangeData) {
    this.resetTerrain();
  }

  get actors(): Actor[] {
    return [this.player, this.dummy];
  }

  /** Where shots leave the wand: in front of the player, facing the dummy. */
  get muzzle() {
    const f = this.facing;
    return { x: this.player.x + f * 10, y: this.player.y - 11 };
  }

  get facing() {
    return this.dummy.x >= this.player.x ? 1 : -1;
  }

  /** Aim at the dummy's upper chest so gravity-affected shots arc into it rather than skimming the floor. */
  get aimAngle() {
    const m = this.muzzle;
    return Math.atan2(this.dummy.y - this.dummy.h * 0.8 - m.y, this.dummy.x - m.x);
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

  resetTerrain() {
    const t = this.terrain;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let v = AIR;
        if (y >= this.floorY || y < 16 || x >= W - 26) v = ROCK;
        // a low mound mid-range and a floating island, for bounces and digging
        if (((x - 150) / 22) ** 2 + ((y - this.floorY) / 9) ** 2 < 1) v = ROCK;
        if (((x - 200) / 34) ** 2 + ((y - 64) / 8) ** 2 < 1) v = ROCK;
        if (x < 3 || y < 3 || x >= W - 3 || y >= H - 3) v = BEDROCK;
        t[y * W + x] = v;
      }
    }
    this.terrainVersion++;
    for (const a of this.actors) this.placeHome(a);
  }

  cell(x: number, y: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= W || iy >= H) return BEDROCK;
    return this.terrain[iy * W + ix]!;
  }

  /** Remove diggable terrain in a circle. */
  carve(cx: number, cy: number, r: number, probability = 100) {
    if (r <= 0) return;
    let changed = false;
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(H - 1, Math.ceil(cy + r)); y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(W - 1, Math.ceil(cx + r)); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
        const i = y * W + x;
        if (this.terrain[i] === ROCK && (probability >= 100 || Math.random() * 100 < probability)) {
          this.terrain[i] = AIR;
          changed = true;
          if (Math.random() < 0.08) this.spark(x, y, '#6b5d52', false, 30);
        }
      }
    }
    if (changed) this.terrainVersion++;
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
    this.puff(a.x, a.y - a.h / 2, '#82dcff');
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
    if (a.flash > 0) a.flash--;
    if (a.pending > 0 && this.frame % 10 === 0) {
      this.floater(a, a.pending, a.pendingCrit);
      a.pending = 0;
      a.pendingCrit = false;
    }
  }

  private displaced() {
    return this.actors.some((a) => Math.abs(a.x - a.homeX) > 2);
  }

  // ---------- casting ----------

  /** Replace the wand's cast cycle (from the cast simulator). Keeps terrain; clears projectiles in flight. */
  setCycle(casts: SimCast[]) {
    this.casts = casts;
    const first = casts[0];
    const last = casts.at(-1);
    this.cycleFrames = first && last ? Math.max(1, last.next_frame - first.frame) : 0;
    // step() advances the frame before scheduling, so the first cast lands on the very next step.
    this.cycleStart = this.frame + 1;
    this.projectiles = [];
    this.lastArc = null;
    this.unsupported.clear();
  }

  private fire(cast: SimCast) {
    this.castsFired++;
    const m = this.muzzle;
    for (let i = 0; i < 6; i++) this.spark(m.x, m.y, '#ffd27a', true, 12);
    this.spawnShot(cast.shot, m.x, m.y, this.aimAngle);
  }

  /** Fire every projectile of a (sub)shot from a point, with the shot's spread, pattern and speed modifiers. */
  spawnShot(shot: SimShot, x: number, y: number, angle: number) {
    const s = shot.state;
    const n = shot.projectiles.length;
    const pattern = num(s, 'pattern_degrees');
    shot.projectiles.forEach((sp, i) => {
      const base = this.data.projectiles[sp.file];
      const vis = this.data.visuals[sp.file];
      const spread = Math.max(0, num(s, 'spread_degrees') + (base?.spread ?? 0));
      let a = angle + (rand(-spread, spread) * Math.PI) / 180;
      if (pattern > 0 && n > 1) a += ((-pattern + (2 * pattern * i) / (n - 1)) * Math.PI) / 180;
      const speedMul = typeof s.speed_multiplier === 'number' ? s.speed_multiplier : 1;
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
    const trailMat = typeof s.trail_material === 'string' && s.trail_material ? this.data.materialColor.get(s.trail_material.split(',')[0]!) : undefined;
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
      penetrateEntities: base?.penetrateEntities ?? false,
      dieOnCollision: base?.dieOnCollision ?? true,
      dieOnLowVelocity: vis?.physics?.dieOnLowVelocity ?? false,
      rotate: vis?.physics?.rotate ?? true,
      streak: vis?.physics?.streak ?? false,
      beamLike: !vis?.sprite && life > 0 && life <= 4 && speedOf({ vx, vy }) > 300,
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
      shooterGrace: vis?.physics?.shooterGrace ?? -1,
      damageEveryFrames: base?.damageEveryFrames ?? -1,
      ...(trigger ? { trigger } : {}),
      hitActors: new Set(),
      rehitCooldown: 0,
      stuck: false,
      visual: vis,
      homing: all.find((v) => v.homing)?.homing,
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
      trails: [...new Set([trailMat, ...all.map((v) => v.trail?.color)].filter((c): c is string => !!c))],
      light: all.find((v) => v.light && v.light.radius > 0)?.light,
      scripts: all.flatMap((v) => (v.scripts ?? []).map((sc) => ({ ...sc, runs: 0, from: v }))),
      vars: {},
      children: [],
      orbitIndex: 0,
      dead: false,
    };
    if (p.arc) this.lastArc = p;

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
    if (this.cycleFrames > 0) {
      let t = this.frame - this.cycleStart;
      if (t >= this.cycleFrames) {
        this.cycleStart += this.cycleFrames;
        t -= this.cycleFrames;
      }
      // Teleports and swaps are undone at the start of each cycle so the range stays usable.
      if (t === 0 && this.displaced()) for (const a of this.actors) this.moveActor(a, a.homeX, this.groundBelow(a.homeX));
      const f0 = this.casts[0]!.frame;
      for (const c of this.casts) if (c.frame - f0 === t) this.fire(c);
    }

    this.beams = [];
    // Copy: updates may spawn new projectiles (they start moving next frame).
    for (const p of [...this.projectiles]) if (!p.dead && p.age >= 0) this.update(p);
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    for (const a of this.actors) this.updateActor(a);

    for (const q of this.particles) {
      q.vy += 30 * DT;
      q.x += q.vx * DT;
      q.y += q.vy * DT;
      q.life++;
    }
    this.particles = this.particles.filter((q) => q.life < q.max);
    for (const f of this.flashes) f.age++;
    this.flashes = this.flashes.filter((f) => f.age < 14);
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
    for (const sc of p.scripts) {
      if (ONCE.has(sc.script) || sc.onAdded || (sc.times > 0 && sc.runs >= sc.times)) continue;
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
      this.move(p);
      if (p.physicsBody) p.spin += p.vx * DT * 0.15;
      else if (p.rotate && speedOf(p) > 1) p.rot = Math.atan2(p.vy, p.vx);
    }
    if (p.dead) return;

    this.updateLaser(p);
    this.updateArea(p);
    this.updateArc(p);
    if (p.damageEveryFrames > 0 && p.age % p.damageEveryFrames === 0) {
      for (const a of this.actors) if (this.canHit(p, a) && this.inActor(a, p.x, p.y, 8)) this.hurt(a, p.hit, p.critChance, p);
    }
    if (p.cellEater > 0 && p.age % 2 === 0) this.carve(p.x, p.y, p.cellEater, p.visual?.cellEater?.probability ?? 100);
    if (p.trigger?.kind === 'timer' && p.age === (p.trigger.delay ?? 0)) {
      const t = p.trigger;
      delete p.trigger;
      this.spawnShot(t.shot, p.x, p.y, this.heading(p));
    }
    if (p.dieOnLowVelocity && p.age > 5 && speedOf(p) < 40 && !p.parent) return this.die(p, 'timeout');
    if (p.lifetime > 0 && p.age >= p.lifetime) return this.die(p, 'timeout');

    // trail
    for (let i = 0; i < p.trails.length; i++) {
      if (i > 0 && p.age % 3) continue;
      const fast = speedOf(p) * DT;
      const n = p.beamLike ? Math.min(12, Math.ceil(fast / 4)) : 1;
      for (let k = 0; k < n; k++) {
        const t = Math.random();
        this.spark(p.px + (p.x - p.px) * t, p.py + (p.y - p.py) * t, p.trails[i]!, true, randInt(10, 26), 8);
      }
    }
  }

  private heading(p: Proj) {
    return speedOf(p) > 1 ? Math.atan2(p.vy, p.vx) : p.rot;
  }

  /** Friendly-fire projectiles can hit their caster once their grace frames are over. */
  private canHit(p: Proj, a: Actor) {
    if (a.id === 'dummy') return true;
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
      if (c !== AIR && p.collideWorld) {
        if (c === ROCK && p.groundPen && p.groundPen.maxDurability >= this.data.rockDurability) {
          // Luminous drill: bores through rock it can break.
          this.carve(nx, ny, 2);
          p.x = nx;
          p.y = ny;
          continue;
        }
        if (p.penetrateWorld && c === ROCK) {
          // Drilling shot: moves through rock at a tenth of its speed.
          p.x += (nx - p.x) * 0.1;
          p.y += (ny - p.y) * 0.1;
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
        return this.die(p, 'hit');
      }
      p.x = nx;
      p.y = ny;
      if (!p.physicsBody && p.damageEveryFrames <= 0 && this.touchActors(p)) return;
    }
    if (p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40) p.dead = true;
  }

  private bounce(p: Proj, nx: number, ny: number, energy: number, counts: boolean) {
    const bx = this.cell(nx, p.y) !== AIR;
    const by = this.cell(p.x, ny) !== AIR;
    if (bx || !by) p.vx = -p.vx;
    if (by || !bx) p.vy = -p.vy;
    p.vx *= energy;
    p.vy *= energy;
    if (p.physicsBody && by) p.vx *= 0.8; // ground friction: thrown bombs settle and roll to a stop
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
      this.applyHitEffect(p, a);
      if (p.trigger?.kind === 'hit') {
        const t = p.trigger;
        delete p.trigger;
        this.spawnShot(t.shot, p.x, p.y, this.heading(p));
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
      const color = p.trails[0] ?? p.light?.color ?? '#ffffff';
      this.segments.push({ x0: p.spawnX, y0: p.spawnY, x1: p.x, y1: p.y, age: 0, life: 8, color, width: 1.5 });
    }
    const e = p.explosion;
    if (e && (reason === 'hit' ? e.onDeath : e.onTimeout || e.onDeath)) {
      this.explode(p.x, p.y, e.radius, e.damage, e.digs && e.digDurability >= this.data.rockDurability, p.critChance, e.color, p.spareShooter);
    }
    if (p.teleport) this.teleportPlayer(p);
    if (p.trigger && (p.trigger.kind === 'death' || (p.trigger.kind === 'hit' && reason === 'hit'))) this.spawnShot(p.trigger.shot, p.x, p.y, this.heading(p));
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

  explode(x: number, y: number, r: number, damage: number, digs: boolean, crit = 0, color?: string, spareShooter = false) {
    const c = color ?? (r > 20 ? '#ffb347' : '#fff1c2');
    this.flashes.push({ x, y, r: Math.max(3, r), age: 0, color: c });
    for (let i = 0; i < Math.min(60, 4 + r * 1.5); i++) this.spark(x, y, i % 3 ? c : '#fff1c2', true, randInt(8, 28), 60 + r * 4);
    if (digs) this.carve(x, y, r);
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
    } else {
      this.selfDamage += dealt;
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
    } else {
      this.selfDamage += amount;
    }
    a.flash = 4;
    a.pending += amount;
  }

  private floater(a: Actor, dealt: number, crit: boolean) {
    // Stack numbers that land close together in time so they don't overprint.
    const same = this.floaters.filter((f) => f.age < 10 && f.self === (a.id === 'player')).length;
    this.floaters.push({
      x: a.x + rand(-8, 8),
      y: a.y - a.h - 4 - same * 7,
      text: dealt >= 10 ? String(Math.round(dealt)) : dealt.toFixed(1),
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
    if (hit && l.digDurability >= this.data.rockDurability) this.carve(ex, ey, l.beamRadius + 1);
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
    this.explode(ex, ey, l.radius, l.damage, l.radius > 0 && 12 >= this.data.rockDurability, p.critChance, l.color, true);
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
    if (this.particles.length >= MAX_PARTICLES) return;
    const a = Math.random() * Math.PI * 2;
    const s = Math.random() * speed;
    this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: life, color, glow });
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
};
