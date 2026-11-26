// Range visuals: unbroken trails, velocity_sets_scale stretch, and the port of Noita's glow shaders.
import { describe, expect, it } from 'vitest';
import type { Emitter } from '../src/data/types.ts';
import { boltStretch, runEmitters, trailBend, type EmitterState, type Particle } from '../src/features/range/particles.ts';
import { GlowBuffer, tapKernel } from '../src/features/range/glow.ts';

/** A trail emitter like laser.xml's plasma_fading_green one: a particle every `gap` px, every `interval` frames. */
const trailEmitter = (gap: number, interval: number): Emitter => ({
  material: 'plasma_fading_green',
  color: '#78f050',
  alpha: 1,
  glow: true,
  glowStrength: 254 / 255,
  real: false,
  countMin: 1,
  countMax: 1,
  intervalMin: interval,
  intervalMax: interval,
  lifetimeMin: 1,
  lifetimeMax: 1,
  offset: [0, 0],
  posMin: [0, 0],
  posMax: [0, 0],
  velMin: [0, 0],
  velMax: [0, 0],
  gravity: [0, 0],
  airflow: 0,
  fade: false,
  trail: true,
  trailGap: gap,
  awayFromCenter: false,
  long: false,
  emitting: true,
  delayFrames: 0,
  lifetimeFrames: -1,
  friction: 0,
});

describe('trails (ParticleEmitterComponent is_trail)', () => {
  it('lays an unbroken line at 1000 px/s from an emitter that fires every 2 frames', () => {
    const gap = 0.5;
    const states: EmitterState[] = [{ e: trailEmitter(gap, 2), next: 0, on: true }];
    const v = 1000 / 60;
    const batches: { from: number; to: number; xs: number[] }[] = [];
    let x = 0;
    let lastEmit = 0;
    for (let age = 1; age <= 12; age++) {
      const px = x;
      x += v;
      const got: Particle[] = [];
      runEmitters(states, age, x, 0, px, 0, 0, (q) => got.push(q));
      if (got.length) {
        batches.push({ from: lastEmit, to: x, xs: got.map((q) => q.x) });
        lastEmit = x;
      }
    }
    expect(batches.length).toBeGreaterThanOrEqual(5);
    const all = batches.flatMap((b) => b.xs).sort((a, b) => a - b);
    for (const b of batches) {
      // Each emission covers the whole path since the last one, not just the last frame.
      expect(b.xs.length).toBeGreaterThanOrEqual((b.to - b.from) / gap - 1);
      expect(Math.min(...b.xs)).toBeLessThanOrEqual(b.from + gap * 1.05);
    }
    for (let i = 1; i < all.length; i++) expect(all[i]! - all[i - 1]!).toBeLessThanOrEqual(gap * 1.05);
  });

  it('runs through the bounce point', () => {
    const states: EmitterState[] = [{ e: trailEmitter(1, 2), next: 0, on: true }];
    const got: Particle[] = [];
    // Frame 1 emits from (0,0) to (10,0); frame 2 bounces at (20,0) and ends at (20,10) without emitting.
    runEmitters(states, 1, 10, 0, 0, 0, 0, (q) => got.push(q));
    trailBend(states, 20, 0);
    runEmitters(states, 2, 20, 10, 20, 0, 0, (q) => got.push(q));
    got.length = 0;
    runEmitters(states, 3, 20, 20, 20, 10, 0, (q) => got.push(q));
    // 10 px to the corner, 20 px down from it: a particle every px, the corner included.
    expect(got.length).toBe(30);
    expect(got.some((q) => Math.abs(q.x - 20) < 1e-6 && Math.abs(q.y) < 1e-6)).toBe(true);
    expect(got.every((q) => q.y < 1e-6 || Math.abs(q.x - 20) < 1e-6)).toBe(true);
  });

  it('caps the particles one emitter lays in a frame', () => {
    const states: EmitterState[] = [{ e: trailEmitter(0.5, 1), next: 0, on: true }];
    const got: Particle[] = [];
    runEmitters(states, 1, 0, 0, 0, 0, 0, () => {});
    runEmitters(states, 2, 100, 0, 0, 0, 0, (q) => got.push(q), 40);
    expect(got.length).toBe(40);
  });
});

describe('velocity_sets_scale', () => {
  it('stretches a sprite to the distance moved this frame', () => {
    // Concentrated Light's 8 px laser_green: ~2 px at launch (130 px/s), ~17 px at the 1000 px/s cap.
    expect(boltStretch(2, 1, 8, 1)).toBeCloseTo(0.25, 5);
    expect(boltStretch(1000 / 60, 1, 8, 1) * 8).toBeCloseTo(16.7, 1);
    expect(boltStretch(0, 1, 8, 1)).toBe(0.1);
    expect(boltStretch(500, 1, 8, 1)).toBe(8);
  });
});

describe('glow (post_glow1.frag + post_glow2.frag)', () => {
  it('spreads 11 taps over integer texels without changing their total', () => {
    const k = tapKernel(1.5 / 4);
    expect(k.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(11, 5);
    const k1 = tapKernel(1.5);
    expect(k1.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(11, 5);
    expect(Math.max(...k1.offsets)).toBe(8);
  });

  it('settles at about 3× a steady source and fades below 5% within ~50 frames', () => {
    const g = new GlowBuffer(60, 40);
    const centre = (20 * 60 + 30) * 3 + 1;
    for (let f = 0; f < 400; f++) {
      g.clear();
      for (let i = 0; i < g.src.length; i++) g.src[i] = 0.1;
      g.fed = true;
      g.step();
    }
    const settled = g.acc[centre]!;
    // 0.175 / (1 − 1.1 × 11/12.2 × 0.95) ≈ 3.01
    expect(settled / 0.1).toBeGreaterThan(2.9);
    expect(settled / 0.1).toBeLessThan(3.1);
    let frames = 0;
    while (g.acc[centre]! > settled * 0.05 && frames < 200) {
      g.clear();
      g.step();
      frames++;
    }
    expect(frames).toBeLessThanOrEqual(52);
    expect(frames).toBeGreaterThan(30);
  });

  it('keeps about 0.942 of the glow each frame away from the edges', () => {
    const g = new GlowBuffer(80, 60);
    g.src[(30 * 80 + 40) * 3] = 1;
    g.fed = true;
    g.step();
    const sum = () => g.acc.reduce((a, b) => a + b, 0);
    const before = sum();
    g.clear();
    g.step();
    expect(sum() / before).toBeCloseTo(1.1 * (11 / 12.2) * 0.95, 3);
  });

  it('goes idle once faded out, and writes opaque bytes after the −0.008 floor', () => {
    const g = new GlowBuffer(8, 8);
    g.src[0] = 1;
    g.fed = true;
    g.step();
    expect(g.idle).toBe(false);
    for (let i = 0; i < 300 && !g.idle; i++) {
      g.clear();
      g.step();
    }
    expect(g.idle).toBe(true);
    const out = new Uint8ClampedArray(8 * 8 * 4);
    g.toRGBA(out);
    expect(out[0]).toBe(0);
    expect(out[3]).toBe(255);
  });
});
