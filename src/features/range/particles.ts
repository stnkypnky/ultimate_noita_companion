// Cosmetic particles, after Noita's ParticleEmitterComponent: emitters on projectiles and effects shed
// coloured pixels with their own velocity, gravity, lifetime and fade. Pure logic, no DOM.
import type { Emitter, EntityVisual, SpriteLayer } from '@/data/types';

const DT = 1 / 60;

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Frames lived, and frames to live. */
  life: number;
  max: number;
  color: string;
  alpha: number;
  glow: boolean;
  /** The material's gfx_glow / 255 (×3 ultrabright), from emitters; absent on simple sparks. */
  glowStrength?: number;
  /** Alpha follows the remaining lifetime. */
  fade: boolean;
  gx: number;
  gy: number;
  /** Drawn as a streak along the velocity. */
  long: boolean;
  friction: number;
  airflow: number;
  /** Real particles (create_real_particles, trail materials) become this material where they land. */
  material?: string;
};

/**
 * Per-entity bookkeeping for one emitter. `on`: switched on (emitters off in the XML wait for a script).
 * Trails: `lastX/lastY` is where the emitter last emitted, and `via` the bounce points passed since (x, y pairs).
 */
export type EmitterState = { e: Emitter; next: number; on: boolean; lastX?: number; lastY?: number; via?: number[] };

/** Most trail particles one emitter lays in a frame (performance mode: TRAIL_CAP_LITE). */
export const TRAIL_CAP = 120;
export const TRAIL_CAP_LITE = 40;
/** A trail longer than this in one go is a teleport, not motion: it restarts instead of drawing a line across. */
const TRAIL_JUMP = 400;

export const emitterStates = (vis: EntityVisual | undefined): EmitterState[] => (vis?.emitters ?? []).map((e) => ({ e, next: e.delayFrames, on: e.enabled !== false }));

/** Emitters that run when the entity appears: switched on, and not image emitters (not run yet). */
export const liveEmitters = (vis: EntityVisual | undefined) => (vis?.emitters ?? []).filter((e) => e.enabled !== false && !e.image);

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const randInt = (a: number, b: number) => Math.floor(rand(Math.min(a, b), Math.max(a, b) + 1));

/** A particle with sensible defaults (sparks from hits, digging dust, explosions). */
export function simpleParticle(x: number, y: number, color: string, glow: boolean, life: number, speed: number, gravity = 30): Particle {
  const a = Math.random() * Math.PI * 2;
  const s = Math.random() * speed;
  return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: life, color, alpha: 1, glow, fade: true, gx: 0, gy: gravity, long: false, friction: 0, airflow: 0 };
}

/**
 * velocity_sets_scale: the sprite is stretched along its motion so its length is the distance moved this frame
 * × velocity_sets_scale_coeff (Concentrated Light's 8 px laser_green: ~2 px at launch, ~17 px at full speed).
 * It can shrink below its own size; the floor keeps a still bolt visible, the cap stops teleport-length spikes.
 */
export function boltStretch(moved: number, coeff: number, frameW: number, scale: number) {
  return Math.min(8, Math.max(0.1, (moved * coeff) / Math.max(1, frameW * scale)));
}

/** A bounce: trail emitters that haven't emitted since run their next trail through the bounce point. */
export function trailBend(states: EmitterState[], x: number, y: number) {
  for (const st of states) {
    if (!st.e.trail || st.lastX === undefined) continue;
    (st.via ??= []).push(x, y);
  }
}

/**
 * Run an entity's emitters for this frame. `age` is the entity's age in frames, (px, py) where it was
 * last frame and `rot` its rotation: offsets and velocities turn with the entity, which is what makes
 * muzzle flashes spray forward. Trails run from where the emitter last emitted (through any bounce
 * since), so an emitter that fires every 2 frames still lays an unbroken line; `trailCap` limits the
 * particles one emitter lays per frame.
 */
export function runEmitters(states: EmitterState[], age: number, x: number, y: number, px: number, py: number, rot: number, out: (p: Particle) => void, trailCap = TRAIL_CAP) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (const st of states) {
    const e = st.e;
    // Image emitters (Circle and Sea spells) emit an image's shape; they're not run as plain emitters.
    // While an emitter is silent (off, not started, or done), its trail start follows the entity.
    if (!st.on || e.image || !e.emitting || age < e.delayFrames || (e.lifetimeFrames >= 0 && age > e.delayFrames + e.lifetimeFrames)) {
      st.lastX = x;
      st.lastY = y;
      if (st.via) st.via.length = 0;
      continue;
    }
    // First run: the trail starts where the entity was last frame (its spawn point on its first frame).
    if (st.lastX === undefined) {
      st.lastX = px;
      st.lastY = py;
    }
    if (age < st.next) continue;
    st.next = age + Math.max(1, randInt(e.intervalMin, e.intervalMax));

    const make = (bx: number, by: number) => {
      let ox = e.offset[0] + rand(e.posMin[0], e.posMax[0]);
      let oy = e.offset[1] + rand(e.posMin[1], e.posMax[1]);
      if (e.area) {
        const a = Math.random() * Math.PI * 2;
        const r = rand(e.area[0], e.area[1]);
        ox += Math.cos(a) * r;
        oy += Math.sin(a) * r;
      }
      let vx = rand(e.velMin[0], e.velMax[0]);
      let vy = rand(e.velMin[1], e.velMax[1]);
      if (e.awayFromCenter && (ox || oy)) {
        const sp = Math.hypot(vx, vy);
        const d = Math.hypot(ox, oy);
        vx = (ox / d) * sp;
        vy = (oy / d) * sp;
      }
      out({
        x: bx + ox * c - oy * s,
        y: by + ox * s + oy * c,
        vx: vx * c - vy * s,
        vy: vx * s + vy * c,
        life: 0,
        max: Math.max(1, Math.round(rand(e.lifetimeMin, e.lifetimeMax) * 60)),
        color: e.color,
        alpha: e.alpha,
        glow: e.glow,
        glowStrength: e.glowStrength,
        fade: e.fade,
        gx: e.gravity[0],
        gy: e.gravity[1],
        long: e.long,
        friction: e.friction,
        airflow: e.airflow,
        ...(e.real ? { material: e.material } : {}),
      });
    };

    if (e.trail) {
      // The path since the last emission: last emit point → bounce points → here.
      const via = st.via;
      const pts = via && via.length ? via : null;
      let fx = st.lastX!;
      let fy = st.lastY!;
      let dist = 0;
      if (pts) {
        let ax = fx;
        let ay = fy;
        for (let k = 0; k < pts.length; k += 2) {
          dist += Math.hypot(pts[k]! - ax, pts[k + 1]! - ay);
          ax = pts[k]!;
          ay = pts[k + 1]!;
        }
        dist += Math.hypot(x - ax, y - ay);
      } else dist = Math.hypot(x - fx, y - fy);
      if (dist > TRAIL_JUMP) {
        fx = px;
        fy = py;
        dist = Math.hypot(x - fx, y - fy);
        if (via) via.length = 0;
      }
      // A point `d` px along the path.
      const along = (d: number) => {
        let ax = fx;
        let ay = fy;
        const n = via ? via.length : 0;
        for (let k = 0; k <= n; k += 2) {
          const bx = k < n ? via![k]! : x;
          const by = k < n ? via![k + 1]! : y;
          const len = Math.hypot(bx - ax, by - ay);
          if (d <= len || k === n) {
            const t = len > 0 ? Math.min(1, d / len) : 1;
            make(ax + (bx - ax) * t, ay + (by - ay) * t);
            return;
          }
          d -= len;
          ax = bx;
          ay = by;
        }
      };
      if (e.trailGap > 0) {
        // One particle every trail_gap px, ending here (at least one, so a slow emitter still sheds).
        const n = Math.min(trailCap, Math.max(1, Math.floor(dist / e.trailGap)));
        for (let i = 1; i <= n; i++) along((dist * i) / n);
      } else {
        const n = randInt(e.countMin, e.countMax);
        for (let i = 0; i < n; i++) along(dist * Math.random());
      }
      st.lastX = x;
      st.lastY = y;
      if (via) via.length = 0;
    } else {
      const n = randInt(e.countMin, e.countMax);
      for (let i = 0; i < n; i++) make(x, y);
    }
  }
}

/** Move particles one frame; ones that hit rock stop there and burn out, real ones settling as material. */
export function stepParticles(ps: Particle[], solid: (x: number, y: number) => boolean, settle?: (x: number, y: number, material: string) => void): Particle[] {
  for (const q of ps) {
    q.vx += q.gx * DT;
    q.vy += q.gy * DT;
    if (q.friction > 0) {
      const f = Math.max(0, 1 - q.friction * DT);
      q.vx *= f;
      q.vy *= f;
    }
    if (q.airflow > 0) {
      q.vx += rand(-1, 1) * q.airflow * 4;
      q.vy += rand(-1, 1) * q.airflow * 4;
    }
    const nx = q.x + q.vx * DT;
    const ny = q.y + q.vy * DT;
    if (solid(nx, ny)) {
      if (q.material && settle) {
        settle(q.x, q.y, q.material);
        q.life = q.max;
        continue;
      }
      q.vx = q.vy = 0;
      q.life = Math.max(q.life, q.max - 6);
    } else {
      q.x = nx;
      q.y = ny;
    }
    q.life++;
    if (q.life >= q.max && q.material && settle) settle(q.x, q.y, q.material);
  }
  return ps.filter((q) => q.life < q.max);
}

/** Frame of a sprite layer `age` frames after the entity appeared. */
export function layerFrame(l: SpriteLayer, age: number) {
  const i = Math.floor(age / 60 / Math.max(0.001, l.wait));
  return l.frames[l.loop ? i % l.frames.length : Math.min(i, l.frames.length - 1)]!;
}

/** Frames a non-looping sprite takes to play through. */
export const layerFrames = (l: SpriteLayer) => Math.ceil(l.frames.length * l.wait * 60);
