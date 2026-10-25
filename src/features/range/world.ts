// Test-range simulation: replays the cast simulator's output as moving projectiles in a small pixel world.
// Pure logic (no DOM) so it can be unit-tested; rendering lives in render.ts.
//
// Fidelity notes: motion uses each projectile's own component data (speed, gravity, air friction, bounces,
// lifetime, homing, sine waves) and ports the game's Lua for common path modifiers. The engine's C++ internals
// (exact homing maths, friction integration, falling-sand materials) are approximated.
import type { EntityVisual, Projectile } from '@/data/types';
import { CRIT_MULT, projectileDamage } from '@/sim/analyze';
import type { SimCast, SimShot } from '@/sim/types';

export const W = 420;
export const H = 236;
const DT = 1 / 60;
const MAX_PROJECTILES = 700;
const MAX_PARTICLES = 3000;

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

type Script = { script: string; every: number; times: number; runs: number; onAdded: boolean };

export type Proj = {
  file: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  lifetime: number;
  gravity: number;
  airFriction: number;
  bounces: number;
  bounceEnergy: number;
  collideWorld: boolean;
  penetrateWorld: boolean;
  penetrateEntities: boolean;
  dieOnCollision: boolean;
  dieOnLowVelocity: boolean;
  rotate: boolean;
  hit: number;
  critChance: number;
  explosion: { damage: number; radius: number; onDeath: boolean; onTimeout: boolean; digs: boolean; digDurability: number } | null;
  damageEveryFrames: number;
  trigger?: { kind: 'hit' | 'timer' | 'death'; delay?: number; shot: SimShot };
  hitDummy: boolean;
  stuck: boolean;
  visual?: EntityVisual;
  homing?: NonNullable<EntityVisual['homing']>;
  sine?: NonNullable<EntityVisual['sine']>;
  cellEater: number;
  trails: string[];
  light?: { color: string; radius: number };
  scripts: Script[];
  vars: Record<string, number>;
  dead: boolean;
};

export type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; glow: boolean };
export type Flash = { x: number; y: number; r: number; age: number; color: string };
export type Floater = { x: number; y: number; text: string; age: number; crit: boolean };

/** Scripts whose effect is purely cosmetic or already covered elsewhere; never reported as missing. */
const COSMETIC = new Set(['colour_spell', 'orbit_shot_init', 'spells_to_power_tag']);

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1));
const speedOf = (p: { vx: number; vy: number }) => Math.hypot(p.vx, p.vy);

export class RangeWorld {
  readonly terrain = new Uint8Array(W * H);
  terrainVersion = 0;
  projectiles: Proj[] = [];
  particles: Particle[] = [];
  flashes: Flash[] = [];
  floaters: Floater[] = [];
  frame = 0;
  /** Floor height (y of the first solid row under the player). */
  readonly floorY = H - 34;
  readonly player = { x: 34, y: H - 34 };
  readonly muzzle = { x: 44, y: H - 34 - 11 };
  // ~215px from the muzzle: inside a spark bolt's natural range (speed 800, friction 1.7, ~40 frames).
  readonly dummy = { x: 262, y: H - 34, w: 14, h: 24, flash: 0 };
  readonly unsupported = new Set<string>();
  damageEvents: { frame: number; amount: number }[] = [];
  totalDamage = 0;
  castsFired = 0;

  private casts: SimCast[] = [];
  private cycleFrames = 0;
  private cycleStart = 0;

  constructor(private data: RangeData) {
    this.resetTerrain();
  }

  /** Aim at the dummy's upper chest so gravity-affected shots arc into it rather than skimming the floor. */
  get aimAngle() {
    return Math.atan2(this.dummy.y - this.dummy.h * 0.8 - this.muzzle.y, this.dummy.x - this.muzzle.x);
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
        // Indestructible footing so the dummy and the player don't end up floating over craters.
        if (y >= this.floorY && (Math.abs(x - this.dummy.x) <= 6 || Math.abs(x - this.player.x) <= 9)) v = BEDROCK;
        t[y * W + x] = v;
      }
    }
    this.terrainVersion++;
  }

  cell(x: number, y: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= W || iy >= H) return BEDROCK;
    return this.terrain[iy * W + ix]!;
  }

  /** Remove diggable terrain in a circle. */
  carve(cx: number, cy: number, r: number) {
    if (r <= 0) return;
    let changed = false;
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(H - 1, Math.ceil(cy + r)); y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(W - 1, Math.ceil(cx + r)); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
        const i = y * W + x;
        if (this.terrain[i] === ROCK) {
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
    this.unsupported.clear();
  }

  private fire(cast: SimCast) {
    this.castsFired++;
    for (let i = 0; i < 6; i++) this.spark(this.muzzle.x, this.muzzle.y, '#ffd27a', true, 12);
    this.spawnShot(cast.shot, this.muzzle.x, this.muzzle.y, this.aimAngle);
  }

  spawnShot(shot: SimShot, x: number, y: number, angle: number) {
    const s = shot.state;
    const num = (k: string) => (typeof s[k] === 'number' ? (s[k] as number) : 0);
    const n = shot.projectiles.length;
    const pattern = num('pattern_degrees');
    shot.projectiles.forEach((sp, i) => {
      if (this.projectiles.length >= MAX_PROJECTILES) return;
      const base = this.data.projectiles[sp.file];
      const vis = this.data.visuals[sp.file];
      const spread = Math.max(0, num('spread_degrees') + (base?.spread ?? 0));
      let a = angle + (rand(-spread, spread) * Math.PI) / 180;
      if (pattern > 0 && n > 1) a += ((-pattern + (2 * pattern * i) / (n - 1)) * Math.PI) / 180;
      const speedMul = typeof s.speed_multiplier === 'number' ? s.speed_multiplier : 1;
      const speed = rand(base?.speed[0] ?? 60, base?.speed[1] ?? 60) * speedMul;
      const dmg = projectileDamage(base, s);
      const life = base && base.lifetime > 0 ? Math.max(1, base.lifetime + num('lifetime_add') + randInt(-base.lifetimeRandom, base.lifetimeRandom)) : -1;
      const extras = String(s.extra_entities ?? '')
        .split(',')
        .filter(Boolean)
        .map((f) => this.data.visuals[f])
        .filter((v): v is EntityVisual => !!v);
      const all = [vis, ...extras].filter((v): v is EntityVisual => !!v);
      const trailMat = typeof s.trail_material === 'string' && s.trail_material ? this.data.materialColor.get(s.trail_material.split(',')[0]!) : undefined;

      const p: Proj = {
        file: sp.file,
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        age: 0,
        lifetime: life,
        gravity: (base?.gravity ?? 400) + num('gravity'),
        airFriction: base?.airFriction ?? 0.55,
        bounces: (base?.bounces ?? 0) + num('bounces'),
        bounceEnergy: vis?.physics?.bounceEnergy ?? 0.5,
        collideWorld: vis?.physics?.collideWithWorld ?? true,
        penetrateWorld: base?.penetrateWorld ?? false,
        penetrateEntities: base?.penetrateEntities ?? false,
        dieOnCollision: base?.dieOnCollision ?? true,
        dieOnLowVelocity: vis?.physics?.dieOnLowVelocity ?? false,
        rotate: vis?.physics?.rotate ?? true,
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
              }
            : null,
        damageEveryFrames: base?.damageEveryFrames ?? -1,
        ...(sp.trigger ? { trigger: sp.trigger } : {}),
        hitDummy: false,
        stuck: false,
        visual: vis,
        homing: all.find((v) => v.homing)?.homing,
        sine: all.find((v) => v.sine)?.sine,
        cellEater: Math.max(0, ...all.map((v) => v.cellEater?.radius ?? 0)),
        trails: [...new Set([trailMat, ...all.map((v) => v.trail?.color)].filter((c): c is string => !!c))],
        light: all.find((v) => v.light && v.light.radius > 0)?.light,
        scripts: all.flatMap((v) => (v.scripts ?? []).map((sc) => ({ ...sc, runs: 0 }))),
        vars: {},
        dead: false,
      };
      // Scripts that only adjust the projectile once take effect immediately.
      for (const sc of p.scripts) if (ONCE.has(sc.script)) this.runScript(p, sc);
      this.projectiles.push(p);
    });
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
      const f0 = this.casts[0]!.frame;
      for (const c of this.casts) if (c.frame - f0 === t) this.fire(c);
    }

    for (const p of this.projectiles) if (!p.dead) this.update(p);
    this.projectiles = this.projectiles.filter((p) => !p.dead);

    for (const q of this.particles) {
      q.vy += 30 * DT;
      q.x += q.vx * DT;
      q.y += q.vy * DT;
      q.life++;
    }
    this.particles = this.particles.filter((q) => q.life < q.max);
    for (const f of this.flashes) f.age++;
    this.flashes = this.flashes.filter((f) => f.age < 14);
    for (const f of this.floaters) {
      f.age++;
      f.y -= 0.35;
    }
    this.floaters = this.floaters.filter((f) => f.age < 60);
    if (this.dummy.flash > 0) this.dummy.flash--;
    const cutoff = this.frame - 300;
    while (this.damageEvents.length && this.damageEvents[0]!.frame < cutoff) this.damageEvents.shift();
  }

  /** Damage per second over the last 5 seconds of simulated time. */
  get dps() {
    const window = Math.min(300, this.frame);
    return window ? this.damageEvents.reduce((s, e) => s + e.amount, 0) / (window / 60) : 0;
  }

  private update(p: Proj) {
    p.age++;
    for (const sc of p.scripts) {
      if (ONCE.has(sc.script) || (sc.times > 0 && sc.runs >= sc.times)) continue;
      if (p.age % Math.max(1, sc.every) === 0) this.runScript(p, sc);
    }
    if (p.dead) return;

    if (!p.stuck) {
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
    }
    if (p.dead) return;

    if (p.damageEveryFrames > 0 && p.age % p.damageEveryFrames === 0 && this.inDummy(p.x, p.y, 8)) this.damage(p.hit, p.critChance, p.x, p.y);
    if (p.cellEater > 0 && p.age % 2 === 0) this.carve(p.x, p.y, p.cellEater);
    if (p.trigger?.kind === 'timer' && p.age === (p.trigger.delay ?? 0)) {
      const t = p.trigger;
      delete p.trigger;
      this.spawnShot(t.shot, p.x, p.y, this.heading(p));
    }
    if (p.dieOnLowVelocity && p.age > 5 && speedOf(p) < 40) return this.die(p, 'timeout');
    if (p.lifetime > 0 && p.age >= p.lifetime) return this.die(p, 'timeout');

    // trail
    for (let i = 0; i < p.trails.length; i++) {
      if (i > 0 && p.age % 3) continue;
      this.spark(p.x - p.vx * DT * Math.random(), p.y - p.vy * DT * Math.random(), p.trails[i]!, true, randInt(10, 26), 8);
    }
  }

  private heading(p: Proj) {
    return speedOf(p) > 1 ? Math.atan2(p.vy, p.vx) : this.aimAngle;
  }

  private target(p: Proj) {
    return p.homing?.targetShooter ? { x: this.player.x, y: this.player.y - 10 } : { x: this.dummy.x, y: this.dummy.y - this.dummy.h / 2 };
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

  private inDummy(x: number, y: number, pad = 0) {
    const d = this.dummy;
    return x >= d.x - d.w / 2 - pad && x <= d.x + d.w / 2 + pad && y >= d.y - d.h - pad && y <= d.y + pad;
  }

  private move(p: Proj) {
    const dist = speedOf(p) * DT;
    const steps = Math.max(1, Math.ceil(dist));
    for (let i = 0; i < steps; i++) {
      const nx = p.x + (p.vx * DT) / steps;
      const ny = p.y + (p.vy * DT) / steps;
      const c = this.cell(nx, ny);
      if (c !== AIR && p.collideWorld) {
        if (p.penetrateWorld && c === ROCK) {
          // Drilling shot: moves through rock at a tenth of its speed.
          p.x += ((nx - p.x) * 0.1);
          p.y += ((ny - p.y) * 0.1);
          continue;
        }
        if (p.bounces > 0) {
          const bx = this.cell(nx, p.y) !== AIR;
          const by = this.cell(p.x, ny) !== AIR;
          if (bx || !by) p.vx = -p.vx;
          if (by || !bx) p.vy = -p.vy;
          p.vx *= p.bounceEnergy;
          p.vy *= p.bounceEnergy;
          p.bounces--;
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
      if (!p.hitDummy && p.damageEveryFrames <= 0 && this.inDummy(p.x, p.y)) {
        p.hitDummy = true;
        this.damage(p.hit, p.critChance, p.x, p.y);
        if (p.trigger?.kind === 'hit') {
          const t = p.trigger;
          delete p.trigger;
          this.spawnShot(t.shot, p.x, p.y, this.heading(p));
        }
        if (!p.penetrateEntities && p.dieOnCollision) return this.die(p, 'hit');
      }
    }
    if (p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40) p.dead = true;
  }

  private die(p: Proj, reason: 'hit' | 'timeout') {
    if (p.dead) return;
    p.dead = true;
    const e = p.explosion;
    if (e && (reason === 'hit' ? e.onDeath : e.onTimeout || e.onDeath)) this.explode(p.x, p.y, e.radius, e.damage, e.digs && e.digDurability >= this.data.rockDurability, p.critChance);
    if (p.trigger && (p.trigger.kind === 'death' || (p.trigger.kind === 'hit' && reason === 'hit'))) this.spawnShot(p.trigger.shot, p.x, p.y, this.heading(p));
  }

  explode(x: number, y: number, r: number, damage: number, digs: boolean, crit = 0) {
    this.flashes.push({ x, y, r: Math.max(3, r), age: 0, color: r > 20 ? '#ffb347' : '#fff1c2' });
    for (let i = 0; i < Math.min(40, 4 + r * 1.5); i++) this.spark(x, y, i % 3 ? '#ffb347' : '#fff1c2', true, randInt(8, 24), 60 + r * 4);
    if (digs) this.carve(x, y, r);
    if (damage > 0 && this.inDummy(x, y, r)) this.damage(damage, crit, x, y);
  }

  private damage(amount: number, critChance: number, x: number, y: number) {
    if (amount <= 0) return;
    const crit = critChance > 0 && Math.random() * 100 < critChance;
    const dealt = crit ? amount * CRIT_MULT : amount;
    this.totalDamage += dealt;
    this.damageEvents.push({ frame: this.frame, amount: dealt });
    this.dummy.flash = 6;
    // Stagger numbers that land on the same frame so they don't overprint.
    const sameFrame = this.floaters.filter((f) => f.age === 0).length;
    this.floaters.push({
      x: this.dummy.x + rand(-10, 10),
      y: this.dummy.y - this.dummy.h - 4 - sameFrame * 7,
      text: dealt >= 10 ? String(Math.round(dealt)) : dealt.toFixed(1),
      age: 0,
      crit,
    });
    if (this.floaters.length > 40) this.floaters.shift();
    void x;
    void y;
  }

  spark(x: number, y: number, color: string, glow: boolean, life: number, speed = 20) {
    if (this.particles.length >= MAX_PARTICLES) return;
    const a = Math.random() * Math.PI * 2;
    const s = Math.random() * speed;
    this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: life, color, glow });
  }

  // ---------- ported projectile scripts (data/scripts/projectiles/*.lua) ----------

  private runScript(p: Proj, sc: Script) {
    sc.runs++;
    const fn = SCRIPTS[sc.script];
    if (fn) fn(p, this);
    else if (!COSMETIC.has(sc.script)) this.unsupported.add(sc.script);
  }
}

/** Scripts the game runs to tweak a projectile's settings when it's created. */
const ONCE = new Set(['accelerating_shot', 'decelerating_shot', 'piercing_shot', 'clipping_shot', 'explosion_remove', 'explosion_tiny', 'remove_bounce', 'fly_downwards', 'fly_upwards', 'autoaim']);

/** Noita's get_direction(x1, y1, x2, y2) from utilities.lua. */
const getDirection = (x1: number, y1: number, x2: number, y2: number) => Math.PI - Math.atan2(y2 - y1, x2 - x1);

const SCRIPTS: Record<string, (p: Proj, w: RangeWorld) => void> = {
  // "Orbiting Arc" — turns 0.33 rad every run.
  spiraling_shot: (p) => {
    const angle = -Math.atan2(p.vy, p.vx);
    const d = speedOf(p);
    p.vx = Math.cos(angle + 0.33) * d;
    p.vy = -Math.sin(angle + 0.33) * d;
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
    const dir2 = dir + 0.33;
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
    const t = { x: w.dummy.x, y: w.dummy.y - w.dummy.h / 2 };
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
    const a = Math.atan2(w.dummy.y - w.dummy.h / 2 - p.y, w.dummy.x - p.x);
    p.vx = Math.cos(a) * sp;
    p.vy = Math.sin(a) * sp;
  },
};
