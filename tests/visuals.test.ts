// The test range's picture of each spell, checked against the game files it's extracted from (visuals.json).
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import type { EntityVisual, Material } from '../src/data/types.ts';
import { bakeEmitterImage, emitterImagePath } from '../src/features/range/emitterImages.ts';

const gameJson = <T>(name: string): T => JSON.parse(readFileSync(join(import.meta.dirname, '../public/game/data', name), 'utf8')) as T;
const visuals = gameJson<Record<string, EntityVisual>>('visuals.json');
const materials = gameJson<Material[]>('materials.json');
const deck = (name: string) => visuals[`data/entities/projectiles/deck/${name}.xml`];

describe('glow from gfx_glow', () => {
  it("Concentrated Light's trail is plasma_fading_green, which glows at gfx_glow 254 (a liquid, not a fire)", () => {
    const trail = deck('laser')?.emitters?.find((e) => e.trail);
    expect(trail?.material).toBe('plasma_fading_green');
    expect(trail?.glow).toBe(true);
    expect(trail?.glowStrength).toBeGreaterThanOrEqual(254 / 255);
  });

  it('materials keep their gfx_glow: plasma_fading_green glows, spark_purple at 60', () => {
    const m = (id: string) => materials.find((x) => x.id === id);
    expect(m('plasma_fading_green')?.glow).toBe(true);
    expect(m('spark_purple')?.glowStrength).toBe(60);
    const purple = Object.values(visuals)
      .flatMap((v) => v.emitters ?? [])
      .find((e) => e.material === 'spark_purple' && !e.ultrabright);
    expect(purple?.glowStrength).toBeCloseTo(60 / 255, 5);
  });
});

describe('switched-off components', () => {
  it('Megalaser beams keep their sprite and both trails, switched off until megalaser_launch', () => {
    const v = deck('megalaser_beam');
    expect(v?.sprites).toHaveLength(1);
    expect(v?.sprites?.[0]?.enabled).toBe(false);
    expect(v?.emitters).toHaveLength(2);
    expect(v?.emitters?.every((e) => e.enabled === false)).toBe(true);
    expect(v?.held).toBe(true);
  });
});

describe('lasers', () => {
  it('orb_laseremitter_four has four beams a quarter turn apart', () => {
    const lasers = deck('orb_laseremitter_four')?.lasers ?? [];
    expect(lasers).toHaveLength(4);
    expect(lasers.map((l) => l.angleAdd)).toEqual([0, 1.570796, 3.14159, 4.712]);
    expect(lasers[0]).toMatchObject({ maxLength: 112, beamRadius: 3.5, beamParticleChance: 90, hitParticleChance: 20, damageToCells: 12000, maxDurability: 11, material: 'plasma_fading', glow: true });
  });
});

describe('image emitters', () => {
  it('Circle of Fire emits the shape of circle_256.png, baked with its time in green', async () => {
    const img = deck('circle_fire')?.emitters?.find((e) => e.image)?.image;
    expect(img?.file).toBe('data/particles/image_emitters/circle_256.png');
    const { data, info } = await sharp(join(import.meta.dirname, '../public/game', emitterImagePath(img!.file))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const baked = bakeEmitterImage(data, info.width, info.height);
    expect(baked.w).toBe(512);
    // Green rises outward: the pixels at time 0 sit near the centre, those at 250 near the rim.
    const dist = (g: number) => {
      const b = baked!.buckets[g]!;
      return Math.hypot(b[0]!, b[1]!);
    };
    expect(dist(0)).toBeLessThan(10);
    expect(dist(250)).toBeGreaterThan(200);
  });

  it('every image emitter has its picture under game/emitters/', () => {
    const files = new Set(Object.values(visuals).flatMap((v) => (v.emitters ?? []).flatMap((e) => (e.image ? [e.image.file] : []))));
    expect(files.size).toBeGreaterThan(0);
    for (const f of files) expect(existsSync(join(import.meta.dirname, '../public/game', emitterImagePath(f))), f).toBe(true);
  });
});
