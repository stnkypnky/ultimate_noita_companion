// Cosmetic particles, after Noita's ParticleEmitterComponent: emitters on projectiles and effects shed
// coloured pixels with their own velocity, gravity, lifetime and fade. Pure logic, no DOM.
import type { Emitter, EntityVisual, SpriteLayer } from '@/data/types';
import type { EmitterImage } from './emitterImages';

const DT = 1 / 60;

/**
 * attractor_force: "If > 0, an attractor is created at the position of the entity that owns this component"
 * (component_documentation.txt); the strength's unit isn't documented. Taken as a constant pull of
 * force × ATTRACT_K px/s² toward the entity's current position, on that emitter's own particles. K = 15 was tuned
 * so the spells read as in the game: Giga Black Hole's sparks (force 16, flung out at up to ~110 px/s from 24–72 px)
 * turn within ~0.25 s and streak back into the core inside their 1.4 s; Vacuum's (force 4–8, still, 64 px out) are
 * drawn most of the way in over their 1.5–2.5 s. [inferred: unit, falloff (none) and which particles it pulls]
 */
export const ATTRACT_K = 15;

/** Where an attractor is: the emitting entity itself, so a moving black hole drags its sparks along. */
export type AttractSource = { x: number; y: number; dead?: boolean };

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
  /** airflow_force, and the field's airflow_scale / airflow_time (default 1; see airflowField). */
  airflow: number;
  afs?: number;
  aft?: number;
  /** render_back="0": drawn in front of entities (default: behind them). */
  front?: true;
  /** collide_with_grid="0": passes through the world. */
  ghost?: true;
  /** Real particles (create_real_particles, trail materials) become this material where they land. */
  material?: string;
  /** attractor_force and the entity it pulls toward (see ATTRACT_K). */
  attract?: number;
  src?: AttractSource;
};

/**
 * Per-entity bookkeeping for one emitter. `on`: switched on (emitters off in the XML wait for a script).
 * Trails: `lastX/lastY` is where the emitter last emitted, and `via` the bounce points passed since (x, y pairs).
 * Image emitters: `imgT` is the animation time (green level), `rays` how far each ray from the centre gets
 * before terrain (image_animation_raytrace_from_center), measured at frame `rayAge` from (rayX, rayY).
 */
export type EmitterState = {
  e: Emitter;
  next: number;
  on: boolean;
  lastX?: number;
  lastY?: number;
  via?: number[];
  imgT?: number;
  rays?: Float32Array;
  rayAge?: number;
  rayX?: number;
  rayY?: number;
};

/**
 * What the world lends emitters beyond `out`: the baked pictures, real cells, the terrain image rays stop at, the
 * caps, and the entity being run (the attractor's source). The world keeps one and updates `source` per entity.
 */
export type EmitHost = {
  /** The baked picture, or undefined while it loads (the emitter waits; its animation starts when it arrives). */
  image(file: string): EmitterImage | undefined;
  /** create_real_particles: "creates these particles in the grid, ... velocity and lifetime are ignored". */
  place(x: number, y: number, material: string): void;
  /** Stops image_animation_raytrace_from_center. */
  blocks(x: number, y: number): boolean;
  /** The world's size: picture pixels outside it are skipped before anything else. */
  w: number;
  h: number;
  /** Most cosmetic particles / real cells one image emitter makes in a frame. */
  imageCap: number;
  cellCap: number;
  /** Cosmetic particles that still fit in the world's budget, and real cells left in this frame's. */
  room(): number;
  cellRoom(): number;
  source?: AttractSource;
};

/** Most trail particles one emitter lays in a frame (performance mode: TRAIL_CAP_LITE). */
export const TRAIL_CAP = 120;
export const TRAIL_CAP_LITE = 40;
/**
 * Most particles one image emitter makes in a frame, and real cells it places (performance mode: the _LITE ones).
 * Circle of Fire's ring is ~6 × its radius pixels a frame (1500+ near the rim) and a Sea's first frame 900; over the
 * cap every pixel's chance is scaled down evenly, so the shape thins instead of being cut off.
 */
export const IMAGE_CAP = 600;
export const IMAGE_CAP_LITE = 200;
export const IMAGE_CELL_CAP = 700;
export const IMAGE_CELL_CAP_LITE = 250;
/**
 * Real cells all image emitters together place in a frame (the world's EmitHost.cellRoom): a wand spamming Circle of
 * Fire keeps a dozen rings going, and the burning cells, not the emitting, are what cost (in Node, 16 rings:
 * 1.1 ms a step at 400, 1.7 at 800, 2.4 at 1500). One ring (≤ ~600 cells a frame in view) is never thinned by it.
 */
export const IMAGE_CELLS_FRAME = 800;
export const IMAGE_CELLS_FRAME_LITE = 300;
/** Rays cast from an image emitter's centre, and how often (frames) they're recast as terrain changes. */
const RAYS = 720;
const RAY_REFRESH = 30;
/** A trail longer than this in one go is a teleport, not motion: it restarts instead of drawing a line across. */
const TRAIL_JUMP = 400;

export const emitterStates = (vis: EntityVisual | undefined): EmitterState[] => (vis?.emitters ?? []).map((e) => ({ e, next: e.delayFrames, on: e.enabled !== false }));

/** Emitters that run when the entity appears: switched on. */
export const liveEmitters = (vis: EntityVisual | undefined) => (vis?.emitters ?? []).filter((e) => e.enabled !== false);

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const randInt = (a: number, b: number) => Math.floor(rand(Math.min(a, b), Math.max(a, b) + 1));

/**
 * Where a cosmetic particle is drawn: ParticleEmitterComponent render_back defaults to 1 ("for cosmetic particles,
 * if they are rendered on front or in the back"), behind every entity sprite; render_back="0" in front of them.
 */
export const particleLayer = (q: Pick<Particle, 'front'>): 'back' | 'front' => (q.front ? 'front' : 'back');

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
 * particles one emitter lays per frame. Image emitters, real cells and attractors need `host`; without one
 * image emitters stay silent.
 */
export function runEmitters(
  states: EmitterState[],
  age: number,
  x: number,
  y: number,
  px: number,
  py: number,
  rot: number,
  out: (p: Particle) => void,
  trailCap = TRAIL_CAP,
  host?: EmitHost,
) {
  const rc = Math.cos(rot);
  const rs = Math.sin(rot);
  const src = host?.source;
  for (const st of states) {
    const e = st.e;
    // While an emitter is silent (off, not started, or done), its trail start follows the entity.
    if (!st.on || !e.emitting || age < e.delayFrames || (e.lifetimeFrames >= 0 && age > e.delayFrames + e.lifetimeFrames)) {
      st.lastX = x;
      st.lastY = y;
      if (st.via) st.via.length = 0;
      continue;
    }
    // Image emitters (Circle, Sea, Cloud and Mist spells, the Megalaser charge-up) emit a picture's shape.
    if (e.image) {
      if (host) runImage(st, e, age, x, y, rot, out, host);
      continue;
    }
    // A child entity that inherits only the position doesn't turn with this one.
    const c = e.noRotate ? 1 : rc;
    const s = e.noRotate ? 0 : rs;
    // First run: the trail starts where the entity was last frame (its spawn point on its first frame).
    if (st.lastX === undefined) {
      st.lastX = px;
      st.lastY = py;
    }
    if (age < st.next) continue;
    st.next = age + Math.max(1, randInt(e.intervalMin, e.intervalMax));
    // emission_chance: % chance this emission happens. A skipped trail emission leaves that stretch empty.
    if (e.emissionChance !== undefined && Math.random() * 100 >= e.emissionChance) {
      st.lastX = x;
      st.lastY = y;
      if (st.via) st.via.length = 0;
      continue;
    }

    const make = (bx: number, by: number) => emitOne(e, bx, by, c, s, out, src, host);

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

/**
 * The colour an emitter's particles take: its `color` attribute when set (not 0), else its material's. Only its
 * rgb: the alpha stays the material's (or custom_alpha). [inferred: the docs say nothing about `color`]
 */
export const emitterColor = (e: Emitter) => (e.customColor ? e.customColor.slice(0, 7) : e.color);

/**
 * One particle from emitter `e` at (bx, by), its offset and velocity turned by (c, s) = cos/sin of the rotation.
 * - area_circle_sector_degrees: the ring is that arc, centred on the entity's facing (+x before turning).
 *   [inferred: the docs give no orientation; Energy Shield's 90° shots are the only users]
 * - direction_random_deg: the velocity turned by up to ± that many degrees, after velocity_always_away_from_center.
 *   [inferred: the order]
 * - cosmetic_force_create (default 1): "cosmetic particles are created inside grid cells"; with 0 a particle whose
 *   spawn point is in solid terrain isn't made. [inferred: what "inside grid cells" rules out]
 */
function emitOne(e: Emitter, bx: number, by: number, c: number, s: number, out: (p: Particle) => void, src: AttractSource | undefined, host?: EmitHost) {
  let ox = e.offset[0] + rand(e.posMin[0], e.posMax[0]);
  let oy = e.offset[1] + rand(e.posMin[1], e.posMax[1]);
  if (e.area) {
    const sector = e.areaSector !== undefined ? (Math.min(360, e.areaSector) * Math.PI) / 180 : Math.PI * 2;
    const a = (Math.random() - 0.5) * sector;
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
  if (e.directionRandom) {
    const t = ((Math.random() * 2 - 1) * e.directionRandom * Math.PI) / 180;
    const tc = Math.cos(t);
    const ts = Math.sin(t);
    const nx = vx * tc - vy * ts;
    vy = vx * ts + vy * tc;
    vx = nx;
  }
  const x = bx + ox * c - oy * s;
  const y = by + ox * s + oy * c;
  if (e.forceCreate === false && host && host.blocks(x, y)) return;
  const q: Particle = {
    x,
    y,
    vx: vx * c - vy * s,
    vy: vx * s + vy * c,
    life: 0,
    max: Math.max(1, Math.round(rand(e.lifetimeMin, e.lifetimeMax) * 60)),
    color: emitterColor(e),
    alpha: e.alpha,
    glow: e.glow,
    glowStrength: e.glowStrength,
    fade: e.fade,
    gx: e.gravity[0],
    gy: e.gravity[1],
    long: e.long,
    friction: e.friction,
    airflow: e.airflow,
    afs: e.airflowScale ?? 1,
    aft: e.airflowTime ?? 1,
  };
  // render_back (default 1): "for cosmetic particles, if they are rendered on front or in the back".
  if (e.renderBack === false) q.front = true;
  if (e.collideWithGrid === false) q.ghost = true;
  if (e.real) q.material = e.material;
  if (e.attractorForce && src) {
    q.attract = e.attractorForce;
    q.src = src;
  }
  out(q);
}

/**
 * image_animation_file: the picture's pixels emit at the animation time their green gives, each with chance
 * red / 255 × image_animation_emission_probability, centred on the entity.
 * - Time: image_animation_speed green levels per game frame ("0.5 means two game frames per one animation frame.
 *   2.0 means two animation frames per one game frame ... 0 means we always emit at time 0"), starting at
 *   image_animation_phase of the way through. An emission covers every level the clock passes this frame, or the
 *   level it stays on.
 * - The animation is as long as the picture's highest green + 1: looping wraps there, otherwise it stops after it.
 *   [inferred: the Cloud and Mist pictures are all green 0, and their rain and mist are steady in the game, so a
 *   one-level animation emits every time; a 256-level clock would make them puff once every 4 s. circle_256.png
 *   runs to 255, matching circle_fire.xml's 260-frame lifetime at speed 1.]
 * - The emission interval gates emissions as for any emitter (the Clouds rain every 3 frames), and the clock runs
 *   between them, skipping levels passed on a frame without an emission. count_min/max is not used: each pixel is
 *   one particle. [inferred: the docs don't say. Every shipped image emitter with more than one level emits every
 *   frame; Circle of Fire's count 1 with a pixel each makes its dense ring.]
 * - image_animation_use_entity_rotation turns the picture; the emitter's offset and velocity turn as usual.
 * - image_animation_raytrace_from_center: pixels the centre can't see past solid terrain don't emit.
 * - create_real_particles puts the material straight into the world; otherwise a cosmetic particle with the
 *   emitter's material, velocity, lifetime and glow. image_animation_colors_file isn't used: no spell has one.
 * Pixels outside the world are skipped; over the per-frame cap every chance is scaled down evenly.
 */
function runImage(st: EmitterState, e: Emitter, age: number, x: number, y: number, rot: number, out: (p: Particle) => void, host: EmitHost) {
  const im = e.image!;
  const pic = host.image(im.file);
  if (!pic) return;
  const N = pic.frames;
  let t0 = st.imgT ?? im.phase * N;
  if (im.loop) t0 %= N;
  st.imgT = t0 + im.speed;
  if (age < st.next) return;
  st.next = age + Math.max(1, randInt(e.intervalMin, e.intervalMax));
  const from = Math.floor(t0);
  let to = Math.max(from + 1, Math.floor(t0 + im.speed));
  if (!im.loop) {
    if (from >= N) return;
    to = Math.min(to, N);
  } else to = Math.min(to, from + N);
  const turn = im.useEntityRotation && !e.noRotate;
  const c = turn ? Math.cos(rot) : 1;
  const s = turn ? Math.sin(rot) : 0;
  const ec = e.noRotate ? 1 : Math.cos(rot);
  const es = e.noRotate ? 0 : Math.sin(rot);
  const W = host.w;
  const H = host.h;
  // The emitter's offset moves the picture's centre.
  const ox = e.offset[0] * ec - e.offset[1] * es;
  const oy = e.offset[0] * es + e.offset[1] * ec;
  x += ox;
  y += oy;
  // What the levels would make inside the world, for the cap.
  let expected = 0;
  for (let L = from; L < to; L++) {
    const b = pic.buckets[L % N];
    if (!b) continue;
    for (let k = 0; k < b.length; k += 3) {
      const wx = x + b[k]! * c - b[k + 1]! * s;
      const wy = y + b[k]! * s + b[k + 1]! * c;
      if (wx >= 0 && wy >= 0 && wx < W && wy < H) expected += b[k + 2]!;
    }
  }
  expected *= im.probability;
  if (expected <= 0) return;
  const cap = e.real ? Math.min(host.cellCap, host.cellRoom()) : Math.min(host.imageCap, host.room());
  if (cap <= 0) return;
  const chance = im.probability * (expected > cap ? cap / expected : 1);
  const rays = im.raytraceFromCenter ? imageRays(st, pic, x, y, age, host) : null;
  for (let L = from; L < to; L++) {
    const b = pic.buckets[L % N];
    if (!b) continue;
    for (let k = 0; k < b.length; k += 3) {
      const dx = b[k]! * c - b[k + 1]! * s;
      const dy = b[k]! * s + b[k + 1]! * c;
      const wx = x + dx;
      const wy = y + dy;
      if (wx < 0 || wy < 0 || wx >= W || wy >= H || Math.random() >= b[k + 2]! * chance) continue;
      if (rays) {
        // The pixel lies between two rays: the shorter of them bounds it, so nothing lands inside the wall that
        // either ray stopped at (the nearest ray alone lets grazing pixels a pixel or two past it).
        let a = (Math.atan2(dy, dx) / (Math.PI * 2)) * RAYS;
        if (a < 0) a += RAYS;
        const i = Math.floor(a) % RAYS;
        if (Math.hypot(dx, dy) > Math.min(rays[i]!, rays[(i + 1) % RAYS]!)) continue;
      }
      if (e.real) host.place(wx, wy, e.material);
      // emitOne adds the offset (and the x/y_pos_offset spread) itself.
      else emitOne(e, wx - ox, wy - oy, ec, es, out, host.source, host);
    }
  }
}

/** How far each of RAYS rays from (x, y) gets before solid terrain, recast every RAY_REFRESH frames or when it moves. */
function imageRays(st: EmitterState, pic: EmitterImage, x: number, y: number, age: number, host: EmitHost) {
  if (st.rays && age - st.rayAge! < RAY_REFRESH && Math.abs(x - st.rayX!) < 1 && Math.abs(y - st.rayY!) < 1) return st.rays;
  const rays = (st.rays ??= new Float32Array(RAYS));
  st.rayAge = age;
  st.rayX = x;
  st.rayY = y;
  const reach = pic.reach + 1;
  for (let i = 0; i < RAYS; i++) {
    const a = (i / RAYS) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let r = 0;
    for (; r < reach; r++) {
      const wx = x + dx * r;
      const wy = y + dy * r;
      // Past the world's edge nothing is emitted anyway.
      if (wx < 0 || wy < 0 || wx >= host.w || wy >= host.h) {
        r = reach;
        break;
      }
      if (host.blocks(wx, wy)) break;
    }
    rays[i] = r;
  }
  return rays;
}

/**
 * airflow_force / airflow_scale / airflow_time: the names (and Noita's look: embers drifting in slow, coherent
 * swirls, not shaking) say particles ride a smooth wind field that changes over space and time; the engine's own
 * field isn't documented. Here: two sine waves per axis over (x, y) × airflow_scale and seconds × airflow_time,
 * summing to at most 1, pushing a particle at airflow_force × AIRFLOW_K px/s². K = 30 was tuned by eye: a Spark
 * Bolt's 0.1–0.2 s trail sparks (force 10.5) drift ~2 px, its 0.7 s embers (1.5) and Energy Orb's (0.5) a few.
 * The scale 0.05 most spells use gives swirls ~60 px across; the default 1, a few px (close to the old jitter).
 * [inferred: the field's shape and K]
 */
export const AIRFLOW_K = 30;
/** A sine table: four lookups per particle instead of four Math.sin calls (6000 particles in a busy frame). */
const SIN_N = 4096;
const SIN = new Float32Array(SIN_N);
for (let i = 0; i < SIN_N; i++) SIN[i] = Math.sin((i / SIN_N) * Math.PI * 2);
const SIN_K = SIN_N / (Math.PI * 2);
const sinT = (v: number) => SIN[((v * SIN_K) | 0) & (SIN_N - 1)]!;
/** The field's last sample (no allocation per particle). */
export const airflowOut = { x: 0, y: 0 };

/** The wind at (x, y) at time `t` seconds, each axis in [-1, 1], into airflowOut. */
export function airflowField(x: number, y: number, t: number, scale: number, time: number) {
  const X = x * scale;
  const Y = y * scale;
  const T = t * time;
  airflowOut.x = 0.6 * sinT(1.7 * X + 0.9 * Y + 2.3 * T) + 0.4 * sinT(2.6 * Y - 1.1 * X - 3.1 * T + 1.3);
  airflowOut.y = 0.6 * sinT(0.8 * X - 1.9 * Y + 2.9 * T + 2.1) + 0.4 * sinT(2.3 * X + 1.2 * Y + 1.7 * T + 4.2);
  return airflowOut;
}

/**
 * Move particles one frame; ones that hit rock stop there and burn out, real ones settling as material.
 * Particles with an attractor are pulled toward its source while it lives; airflow blows them along the wind
 * field at time `t` (seconds: the world's frame / 60). Compacts `ps` in place and returns it.
 */
export function stepParticles(ps: Particle[], solid: (x: number, y: number) => boolean, settle?: (x: number, y: number, material: string) => void, t = 0): Particle[] {
  let n = 0;
  for (let i = 0; i < ps.length; i++) {
    const q = ps[i]!;
    if (stepOne(q, solid, settle, t)) ps[n++] = q;
  }
  ps.length = n;
  return ps;
}

/** One particle's frame; false once it's gone. */
function stepOne(q: Particle, solid: (x: number, y: number) => boolean, settle: ((x: number, y: number, material: string) => void) | undefined, t: number) {
  {
    q.vx += q.gx * DT;
    q.vy += q.gy * DT;
    if (q.attract && q.src && !q.src.dead) {
      const dx = q.src.x - q.x;
      const dy = q.src.y - q.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.5) {
        const a = (q.attract * ATTRACT_K * DT) / d;
        q.vx += dx * a;
        q.vy += dy * a;
      }
    }
    if (q.friction > 0) {
      const f = Math.max(0, 1 - q.friction * DT);
      q.vx *= f;
      q.vy *= f;
    }
    if (q.airflow > 0) {
      const f = airflowField(q.x, q.y, t, q.afs ?? 1, q.aft ?? 1);
      const k = q.airflow * AIRFLOW_K * DT;
      q.vx += f.x * k;
      q.vy += f.y * k;
    }
    const nx = q.x + q.vx * DT;
    const ny = q.y + q.vy * DT;
    if (!q.ghost && solid(nx, ny)) {
      if (q.material && settle) {
        settle(q.x, q.y, q.material);
        q.life = q.max;
        return false;
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
  return q.life < q.max;
}

/**
 * Which of a layer's `$[a-b]` variants an entity shows: the game picks one at random per entity. `seed` is a random
 * 32-bit number the entity drew when it was made, `k` the layer's index, so each layer picks on its own.
 */
export function pickVariant(l: SpriteLayer, seed: number, k = 0) {
  const n = l.variants?.length ?? 0;
  if (n < 2) return 0;
  let h = Math.imul((seed ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) % n;
}

/** A fresh variant seed for an entity. */
export const variantSeed = () => (Math.random() * 0x100000000) >>> 0;

/**
 * Frame of a sprite layer `age` frames after the entity appeared, in variant `v`. A non-looping animation with a
 * next_rect_animation goes on with that one when it ends (looping or holding its last frame as its own loop says).
 */
export function layerFrame(l: SpriteLayer, age: number, v = 0) {
  const frames = (v && l.variants?.[v]) || l.frames;
  const wait = Math.max(0.001, l.wait);
  // (The epsilon keeps a frame boundary that lands exactly on a game frame from rounding down a frame early.)
  const i = Math.floor(age / 60 / wait + 1e-9);
  if (l.loop) return frames[i % frames.length]!;
  if (i < frames.length || !l.next?.frames.length) return frames[Math.min(i, frames.length - 1)]!;
  const nx = l.next;
  const j = Math.floor((age / 60 - frames.length * wait) / Math.max(0.001, nx.wait) + 1e-9);
  return nx.frames[nx.loop ? j % nx.frames.length : Math.min(j, nx.frames.length - 1)]!;
}

/** Frames a non-looping sprite takes to play through (with a non-looping next animation, both). */
export const layerFrames = (l: SpriteLayer) => Math.ceil((l.frames.length * l.wait + (l.next && !l.next.loop ? l.next.frames.length * l.next.wait : 0)) * 60);
