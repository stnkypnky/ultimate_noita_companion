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

/** Per-entity bookkeeping for one emitter. */
export type EmitterState = { e: Emitter; next: number };

export const emitterStates = (vis: EntityVisual | undefined): EmitterState[] => (vis?.emitters ?? []).map((e) => ({ e, next: e.delayFrames }));

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const randInt = (a: number, b: number) => Math.floor(rand(Math.min(a, b), Math.max(a, b) + 1));

/** A particle with sensible defaults (sparks from hits, digging dust, explosions). */
export function simpleParticle(x: number, y: number, color: string, glow: boolean, life: number, speed: number, gravity = 30): Particle {
  const a = Math.random() * Math.PI * 2;
  const s = Math.random() * speed;
  return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: life, color, alpha: 1, glow, fade: true, gx: 0, gy: gravity, long: false, friction: 0, airflow: 0 };
}

/**
 * Run an entity's emitters for this frame. `age` is the entity's age in frames, (px, py) where it was
 * last frame (for trails) and `rot` its rotation: offsets and velocities turn with the entity, which
 * is what makes muzzle flashes spray forward.
 */
export function runEmitters(states: EmitterState[], age: number, x: number, y: number, px: number, py: number, rot: number, out: (p: Particle) => void) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (const st of states) {
    const e = st.e;
    if (!e.emitting || age < e.delayFrames) continue;
    if (e.lifetimeFrames >= 0 && age > e.delayFrames + e.lifetimeFrames) continue;
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
      const dist = Math.hypot(x - px, y - py);
      if (e.trailGap > 0) {
        const n = Math.min(40, Math.floor(dist / e.trailGap));
        for (let i = 1; i <= n; i++) make(px + ((x - px) * i) / (n + 1), py + ((y - py) * i) / (n + 1));
        make(x, y);
      } else {
        const n = randInt(e.countMin, e.countMax);
        for (let i = 0; i < n; i++) {
          const t = Math.random();
          make(px + (x - px) * t, py + (y - py) * t);
        }
      }
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
