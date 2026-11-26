// Phase 6 of the range visuals: render_back layers, emitter colour and spawn shape, sprite variants and follow-on
// animations, smooth airflow, sprite-particle colour/scale/spin, MATERIAL_* data.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Emitter, EntityVisual, Icon, SpriteLayer } from '../src/data/types.ts';
import { AIRFLOW_K, airflowField, layerFrame, layerFrames, particleLayer, pickVariant, runEmitters, stepParticles, type Particle } from '../src/features/range/particles.ts';
import { spriteFx, stepSpriteFx, type Effect } from '../src/features/range/world.ts';

const visuals = JSON.parse(readFileSync(join(import.meta.dirname, '../public/game/data/visuals.json'), 'utf8')) as Record<string, EntityVisual>;

const emitter = (over: Partial<Emitter> = {}): Emitter => ({
  material: 'spark',
  color: '#ff6024',
  alpha: 1,
  glow: false,
  glowStrength: 0,
  real: false,
  countMin: 1,
  countMax: 1,
  intervalMin: 1,
  intervalMax: 1,
  lifetimeMin: 1,
  lifetimeMax: 1,
  offset: [0, 0],
  posMin: [0, 0],
  posMax: [0, 0],
  velMin: [100, 0],
  velMax: [100, 0],
  gravity: [0, 0],
  airflow: 0,
  fade: false,
  trail: false,
  trailGap: 0,
  awayFromCenter: false,
  long: false,
  emitting: true,
  delayFrames: 0,
  lifetimeFrames: -1,
  friction: 0,
  ...over,
});

/** `n` emissions of one emitter at the origin, facing +x. */
function emit(e: Emitter, n = 1) {
  const out: Particle[] = [];
  const st = [{ e, next: 0, on: true }];
  for (let age = 0; age < n; age++) runEmitters(st, age, 0, 0, 0, 0, 0, (p) => out.push(p));
  return out;
}

const icon = (x: number): Icon => ({ x, y: 0, w: 1, h: 1 });

describe('render_back', () => {
  it('puts particles behind entities by default and in front with render_back="0"', () => {
    const [back] = emit(emitter());
    const [front] = emit(emitter({ renderBack: false }));
    expect(particleLayer(back!)).toBe('back');
    expect(particleLayer(front!)).toBe('front');
  });

  it('keeps the black hole sparks behind its core', () => {
    const v = visuals['data/entities/projectiles/deck/black_hole_giga.xml']!;
    expect(v.emitters!.length).toBeGreaterThan(0);
    for (const e of v.emitters!) expect(particleLayer(emit(e)[0]!)).toBe('back');
  });
});

describe('emitter colour and spawn shape', () => {
  it('uses the color attribute over the material colour when set', () => {
    expect(emit(emitter({ customColor: '#40ff2080' }))[0]!.color).toBe('#40ff20');
    expect(emit(emitter())[0]!.color).toBe('#ff6024');
  });

  it('turns velocities by at most direction_random_deg', () => {
    const ps = emit(emitter({ directionRandom: 10, countMin: 400, countMax: 400 }));
    let spread = 0;
    for (const p of ps) {
      const a = (Math.abs(Math.atan2(p.vy, p.vx)) * 180) / Math.PI;
      expect(a).toBeLessThanOrEqual(10 + 1e-9);
      expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(100, 6);
      spread = Math.max(spread, a);
    }
    expect(spread).toBeGreaterThan(5);
  });

  it('spawns a ring only on area_circle_sector_degrees, centred on the facing', () => {
    const ps = emit(emitter({ area: [10, 12], areaSector: 90, countMin: 400, countMax: 400 }));
    for (const p of ps) {
      expect((Math.abs(Math.atan2(p.y, p.x)) * 180) / Math.PI).toBeLessThanOrEqual(45 + 1e-9);
      expect(Math.hypot(p.x, p.y)).toBeGreaterThanOrEqual(10 - 1e-9);
    }
  });

  it('skips emissions by emission_chance', () => {
    expect(emit(emitter({ emissionChance: 0 }), 50)).toHaveLength(0);
    expect(emit(emitter({ emissionChance: 100 }), 50)).toHaveLength(50);
  });
});

describe('sprite variants and follow-on animations', () => {
  const layer = (over: Partial<SpriteLayer> = {}): SpriteLayer => ({ frames: [icon(0)], wait: 1 / 60, loop: false, ox: 0, oy: 0, additive: false, emissive: false, alpha: 1, scale: 1, ...over });

  it('picks a variant within range, deterministic per seed, every one in use', () => {
    const l = layer({ variants: [[icon(0)], [icon(1)], [icon(2)], [icon(3)], [icon(4)]] });
    const seen = new Set<number>();
    for (let s = 0; s < 2000; s++) {
      const v = pickVariant(l, (s * 2654435761) >>> 0);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(5);
      expect(pickVariant(l, (s * 2654435761) >>> 0)).toBe(v);
      seen.add(v);
      expect(layerFrame(l, 0, v)).toEqual(icon(v));
    }
    expect(seen.size).toBe(5);
    expect(pickVariant(layer(), 12345)).toBe(0);
  });

  it('muzzle flashes carry their five variants', () => {
    const l = visuals['data/entities/particles/muzzle_flashes/muzzle_flash_small.xml']!.sprites![0]!;
    expect(l.variants).toHaveLength(5);
  });

  it('plays next_rect_animation when a non-looping animation ends', () => {
    const l = layer({ frames: [icon(0), icon(1)], next: { frames: [icon(10), icon(11), icon(12)], wait: 2 / 60, loop: true } });
    const seq = Array.from({ length: 10 }, (_, age) => layerFrame(l, age).x);
    expect(seq).toEqual([0, 1, 10, 10, 11, 11, 12, 12, 10, 10]);
    const once = layer({ frames: [icon(0)], next: { frames: [icon(5), icon(6)], wait: 1 / 60, loop: false } });
    expect(Array.from({ length: 5 }, (_, age) => layerFrame(once, age).x)).toEqual([0, 5, 6, 6, 6]);
    expect(layerFrames(once)).toBe(3);
    // A looping animation never moves on.
    expect(layerFrame(layer({ loop: true, frames: [icon(0), icon(1)], next: { frames: [icon(9)], wait: 1, loop: true } }), 5).x).toBe(1);
  });
});

describe('airflow', () => {
  it('is a bounded, smooth field over space and time', () => {
    let max = 0;
    let moved = 0;
    for (let i = 0; i < 4000; i++) {
      const x = (i * 37) % 427;
      const y = (i * 53) % 242;
      const t = i / 60;
      const a = { ...airflowField(x, y, t, 0.05, 1.4) };
      max = Math.max(max, Math.abs(a.x), Math.abs(a.y));
      const b = airflowField(x + 1, y, t, 0.05, 1.4);
      expect(Math.abs(b.x - a.x)).toBeLessThan(0.15);
      expect(Math.abs(b.y - a.y)).toBeLessThan(0.15);
      const c = airflowField(x, y, t + 1 / 60, 0.05, 1.4);
      expect(Math.abs(c.x - a.x)).toBeLessThan(0.15);
      expect(Math.abs(c.y - a.y)).toBeLessThan(0.15);
      moved = Math.max(moved, Math.abs(c.x - a.x));
    }
    expect(max).toBeLessThanOrEqual(1);
    // It does vary.
    expect(max).toBeGreaterThan(0.5);
    expect(moved).toBeGreaterThan(0);
  });

  it('blows particles the same way at the same place and time, no jitter', () => {
    const make = (): Particle => ({ x: 100, y: 100, vx: 0, vy: 0, life: 0, max: 60, color: '#fff', alpha: 1, glow: false, fade: false, gx: 0, gy: 0, long: false, friction: 0, airflow: 10.5, afs: 0.05, aft: 1.4 });
    const a = [make()];
    const b = [make()];
    for (let f = 0; f < 9; f++) {
      stepParticles(a, () => false, undefined, f / 60);
      stepParticles(b, () => false, undefined, f / 60);
    }
    expect(a[0]!.x).toBe(b[0]!.x);
    expect(a[0]!.y).toBe(b[0]!.y);
    // At most force × K px/s² for 9 frames.
    const cap = (10.5 * AIRFLOW_K * 9) / 60;
    expect(Math.hypot(a[0]!.vx, a[0]!.vy)).toBeLessThanOrEqual(cap * Math.SQRT2 + 1e-9);
  });

  it('lets collide_with_grid="0" particles through the world', () => {
    const [p] = emit(emitter({ collideWithGrid: false }));
    stepParticles([p!], () => true);
    expect(p!.x).toBeGreaterThan(1);
  });
});

describe('sprite particles', () => {
  it('fades by color_change, grows by scale_velocity, spins, and goes once invisible', () => {
    const e = visuals['data/entities/projectiles/deck/tentacle_portal.xml']!.spriteEmitters![0]!;
    expect(e.renderBack).toBe(true);
    const sp = spriteFx(e);
    expect(sp.a).toBeCloseTo(0.75);
    expect(sp.back).toBe(true);
    const fx: Effect = { x: 0, y: 0, rot: 0, vis: { sprites: [e.sprite] }, age: 0, life: 600, emit: [], flip: 1, vx: 0, vy: 0, sp };
    for (let f = 0; f < 60; f++) {
      fx.age++;
      stepSpriteFx(fx);
    }
    expect(sp.a).toBeCloseTo(0.75 - 0.8, 5);
    expect(sp.sx).toBeCloseTo(1 + 1.0075, 5);
    expect(Math.abs(fx.rot)).toBeGreaterThan(0);
    expect(fx.life).toBeLessThanOrEqual(fx.age);
  });

  it('leaves the Glitter bomb shards untinted at about their own size', () => {
    for (const e of visuals['data/entities/projectiles/deck/glitter_bomb_shrapnel.xml']!.spriteEmitters!) {
      const sp = spriteFx(e);
      expect([sp.r, sp.g, sp.b, sp.a]).toEqual([1, 1, 1, 1]);
      expect(sp.sx).toBeGreaterThanOrEqual(0.9);
      expect(sp.sx).toBeLessThanOrEqual(1.1);
      expect(sp.da).toBe(0);
    }
  });
});

describe('MATERIAL_* spells', () => {
  it('know the material they leave and its colour', () => {
    const v = visuals['data/entities/projectiles/deck/material_water.xml']!;
    expect(v.projectileType).toBe('MATERIAL_PARTICLE');
    expect(v.deathEmit?.material).toBe('water');
    expect(v.deathEmit?.color).toMatch(/^#[0-9a-f]{6}$/);
  });
});
