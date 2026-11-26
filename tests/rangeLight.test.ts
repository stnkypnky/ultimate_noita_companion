// The range's light and dark (src/features/range/light.ts): post_final.frag's lights, the light map built from
// lights and glow, and how the renderer applies it per map.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AMBIENT_FLOOR, LIGHT_ENCODE, LightMap, fogOfWar, shade } from '../src/features/range/light.ts';
import { RangeWorld, type RangeData } from '../src/features/range/world.ts';
import { biomeById } from '../src/features/range/biomes.ts';
import type { EntityVisual, Material, Projectile, RangeKit, Reaction } from '../src/data/types.ts';

/** A seeded generator, so the random cases are the same every run. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

describe('post_final lights', () => {
  it('leaves an explored cave at the 0.35 floor, untinted', () => {
    // 2 × 1.4 × (0.6, 0.5, 0.45) is over 1 in every channel: the warm tint only shows at fog-of-war edges.
    expect(fogOfWar(0)).toEqual([1, 1, 1]);
    expect(shade(0, 0, 0)).toBeCloseTo(AMBIENT_FLOOR, 6);
    // the glow's −0.008 floor
    expect(shade(0, 0.008, 0)).toBeCloseTo(AMBIENT_FLOOR, 6);
  });

  it('lights a cave by (0.8·light)^1.5 + glow, clamped to 1, gamma 1/2.2, plus the floor', () => {
    expect(shade(1, 0, 0)).toBeCloseTo(Math.pow(Math.pow(0.8, 1.5), 1 / 2.2) + 0.35, 6);
    expect(shade(0.5, 0.2, 0)).toBeCloseTo(Math.pow(Math.pow(0.4, 1.5) + 0.192, 1 / 2.2) + 0.35, 6);
    // a light and the glow together clamp at 1 before the gamma: 1.35 at most
    expect(shade(1, 1, 0)).toBeCloseTo(1.35, 6);
    expect(shade(1, 50, 0)).toBeCloseTo(1.35, 6);
    // the light texture is 8-bit: more than 1 counts as 1
    expect(shade(3, 0, 0)).toBeCloseTo(shade(1, 0, 0), 6);
  });

  it('under open sky lights everything to exactly 1, so lights and glow change nothing', () => {
    expect(fogOfWar(1)).toEqual([1, 1, 1]);
    for (const [t, g] of [[0, 0], [1, 0], [0.3, 0.7], [1, 5]] as const) expect(shade(t, g, 1)).toBeCloseTo(1, 6);
  });
});

describe('LightMap', () => {
  it('draws a light falling off linearly to its radius, and nothing beyond', () => {
    const m = new LightMap(40, 20, 4);
    m.add(80, 40, 40, 0xff8000);
    const at = (tx: number, ty: number, c = 0) => m.tex[(ty * 40 + tx) * 3 + c]!;
    // texel (19, 9) has its centre at (78, 38): 2√2 px from the light
    expect(at(19, 9)).toBeCloseTo(1 - Math.hypot(2, 2) / 40, 5);
    expect(at(19, 9, 1)).toBeCloseTo((128 / 255) * (1 - Math.hypot(2, 2) / 40), 5);
    expect(at(19, 9, 2)).toBe(0);
    // centre (98, 38) is 18.1 px away, (122, 38) 42 px (outside)
    expect(at(24, 9)).toBeCloseTo(1 - Math.hypot(18, 2) / 40, 5);
    expect(at(30, 9)).toBe(0);
    expect(at(0, 0)).toBe(0);
  });

  it('adds overlapping lights and fades them, and the map clamps the sum as the 8-bit texture does', () => {
    const m = new LightMap(10, 10, 4);
    m.add(20, 20, 400, 0x999999, 1);
    m.add(20, 20, 400, 0x999999, 0.5);
    const i = (4 * 10 + 4) * 3;
    const one = (0x99 / 255) * (1 - Math.hypot(-2, -2) / 400);
    expect(m.tex[i]).toBeCloseTo(one * 1.5, 5);
    m.add(20, 20, 400, 0xffffff);
    expect(m.tex[i]!).toBeGreaterThan(1);
    const out = new Uint8ClampedArray(10 * 10 * 4);
    m.build(null, 0, out);
    expect(out[(4 * 10 + 4) * 4]).toBe(Math.round(shade(1, 0, 0) * LIGHT_ENCODE));
    expect(out[(4 * 10 + 4) * 4 + 3]).toBe(255);
  });

  it('builds the shader’s lights per texel from the light texture and the glow (stored ÷ 2)', () => {
    const rnd = lcg(7);
    for (const sky of [0, 1]) {
      const m = new LightMap(23, 17, 4);
      const glow = new Float32Array(23 * 17 * 3);
      for (let i = 0; i < m.tex.length; i++) {
        m.tex[i] = rnd() * 1.3;
        glow[i] = rnd() < 0.3 ? 0 : rnd() * 1.2;
      }
      const out = new Uint8ClampedArray(23 * 17 * 4);
      m.build(glow, sky, out);
      for (let i = 0; i < 23 * 17; i++) {
        for (let c = 0; c < 3; c++) {
          const want = shade(m.tex[i * 3 + c]!, glow[i * 3 + c]!, sky) * LIGHT_ENCODE;
          expect(Math.abs(out[i * 4 + c]! - want)).toBeLessThanOrEqual(0.6);
        }
      }
    }
  });
});

describe('the renderer per map', () => {
  const GAME = join(import.meta.dirname, '../public/game');
  const json = <T>(p: string) => JSON.parse(readFileSync(join(GAME, p), 'utf8')) as T;
  const materials = json<Material[]>('data/materials.json');
  const data: RangeData = {
    projectiles: json<Record<string, Projectile>>('data/projectiles.json'),
    visuals: json<Record<string, EntityVisual>>('data/visuals.json'),
    materialColor: new Map(materials.map((m) => [m.id, m.color])),
    rockDurability: materials.find((m) => m.id === 'rock_static')?.durability ?? 0,
    kit: json<RangeKit>('data/range_kit.json'),
    materials,
    reactions: json<Reaction[]>('data/reactions.json'),
  };

  afterEach(() => vi.unstubAllGlobals());

  /** Draw one frame on a canvas that records every call and composite mode, in order. */
  async function frame(biome: string, lite: boolean) {
    const log: string[] = [];
    const ctx: object = new Proxy({} as Record<string | symbol, unknown>, {
      get(t, k) {
        if (k in t) return t[k];
        if (k === 'getImageData') return (_x: number, _y: number, cw: number, ch: number) => ({ data: new Uint8ClampedArray(cw * ch * 4) });
        if (k === 'createImageData') return (cw: number, ch: number) => new ImageData(cw, ch);
        if (k === 'createPattern' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
        return (..._a: unknown[]) => void log.push(String(k));
      },
      set(t, k, v) {
        if (k === 'globalCompositeOperation') log.push(`op:${String(v)}`);
        t[k] = v;
        return true;
      },
    });
    vi.stubGlobal(
      'ImageData',
      class {
        data: Uint8ClampedArray;
        constructor(
          readonly width: number,
          readonly height: number,
        ) {
          this.data = new Uint8ClampedArray(width * height * 4);
        }
      },
    );
    vi.stubGlobal('Image', class {});
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) });
    const { RangeRenderer } = await import('../src/features/range/render.ts');
    const anything: object = new Proxy({}, { get: (_t, k) => (k === 'rock' || k === 'bedrock' ? new ImageData(1, 1) : k === 'props' ? {} : {}) });
    const r = new RangeRenderer(ctx as CanvasRenderingContext2D, anything as never);
    r.lite = lite;
    const w = new RangeWorld(data);
    w.biome = biomeById.get(biome)!;
    w.step();
    log.length = 0;
    r.draw(w);
    return { log, light: (r as unknown as { lightImg: ImageData }).lightImg.data, w };
  }

  it('darkens a cave map: the picture is multiplied by the map and doubled, then the glow, then the HUD unlit', async () => {
    const { log, light, w } = await frame('coalmine', false);
    const mul = log.indexOf('op:multiply');
    expect(mul).toBeGreaterThan(0);
    // the scene was drawn before it
    expect(log.slice(0, mul)).toContain('drawImage');
    // ×2 right after (the map holds lights ÷ 2)
    expect(log.slice(mul, mul + 6)).toContain('op:lighter');
    // the HUD's health number is drawn after, unlit
    expect(log.lastIndexOf('fillText')).toBeGreaterThan(mul);
    // The player's own light (player_base.xml: white, radius 350) is brightest at her and fades to the floor.
    const at = (x: number, y: number) => light[(Math.floor(y / 4) * 107 + Math.floor(x / 4)) * 4]! / LIGHT_ENCODE;
    const near = at(w.player.x, w.player.y - 4);
    expect(near).toBeGreaterThan(1.1);
    expect(near).toBeLessThanOrEqual(1.36);
    expect(at(w.player.x + 200, w.player.y - 4)).toBeLessThan(near);
    expect(at(w.player.x + 200, w.player.y - 4)).toBeGreaterThan(AMBIENT_FLOOR + 0.05);
  });

  it('leaves the lit test cave and performance mode as they were: no light map', async () => {
    expect(biomeById.get('range')!.sky).toBe(1);
    for (const [biome, lite] of [['range', false], ['coalmine', true], ['holymountain', true]] as const) {
      const { log } = await frame(biome, lite);
      expect(log).not.toContain('op:multiply');
    }
  });

  it('counts every game biome as underground', () => {
    for (const [id, b] of biomeById) if (id !== 'range') expect(b.sky ?? 0).toBe(0);
  });
});
