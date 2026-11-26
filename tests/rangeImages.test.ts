// Image emitters (Circle, Sea, Cloud spells, the Megalaser charge-up), attractor_force and the Seas' real liquid,
// run on the game's own pictures (decoded with sharp) and extracted emitters.
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import type { Emitter, EntityVisual, Material, Projectile, RangeKit, Reaction } from '../src/data/types.ts';
import { bakeEmitterImage, emitterImagePath, type EmitterImage } from '../src/features/range/emitterImages.ts';
import { ATTRACT_K, emitterStates, runEmitters, stepParticles, type EmitHost, type Particle } from '../src/features/range/particles.ts';
import { AIR, H, RangeWorld, W, type RangeData } from '../src/features/range/world.ts';

const GAME = join(import.meta.dirname, '../public/game');
const json = <T>(p: string) => JSON.parse(readFileSync(join(GAME, p), 'utf8')) as T;
const visuals = json<Record<string, EntityVisual>>('data/visuals.json');
const deck = (name: string) => visuals[`data/entities/projectiles/deck/${name}.xml`]!;
const images = new Map<string, EmitterImage>();

beforeAll(async () => {
  const files = new Set(Object.values(visuals).flatMap((v) => (v.emitters ?? []).flatMap((e) => (e.image ? [e.image.file] : []))));
  for (const f of files) {
    const { data, info } = await sharp(join(GAME, emitterImagePath(f))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    images.set(f, bakeEmitterImage(data, info.width, info.height));
  }
});

/** A host over an open (or partly walled) world of `w` × `h`, recording real cells placed. */
function host(over: Partial<EmitHost> = {}, cells: { x: number; y: number }[] = []): EmitHost {
  return {
    image: (f) => images.get(f),
    place: (x, y) => void cells.push({ x, y }),
    blocks: () => false,
    w: 600,
    h: 600,
    imageCap: 1e9,
    cellCap: 1e9,
    room: () => 1e9,
    cellRoom: () => 1e9,
    ...over,
  };
}

/** Run an entity's emitters for `frames` frames at (x, y); per frame, the cells placed and particles made. */
function run(vis: EntityVisual, frames: number, h: EmitHost, x = 300, y = 300, cells?: { x: number; y: number }[]) {
  const states = emitterStates(vis);
  const perFrame: { cells: { x: number; y: number }[]; parts: Particle[] }[] = [];
  for (let age = 1; age <= frames; age++) {
    const before = cells?.length ?? 0;
    const parts: Particle[] = [];
    runEmitters(states, age, x, y, x, y, 0, (q) => parts.push(q), undefined, h);
    perFrame.push({ cells: cells ? cells.slice(before) : [], parts });
  }
  return perFrame;
}

const meanDist = (ps: { x: number; y: number }[], x = 300, y = 300) => ps.reduce((s, p) => s + Math.hypot(p.x - x, p.y - y), 0) / Math.max(1, ps.length);

describe('image emitters (image_animation_file)', () => {
  it('Circle of Fire lays an expanding ring of real fire, one pixel of radius a frame', () => {
    const cells: { x: number; y: number }[] = [];
    const frames = run(deck('circle_fire'), 120, host({}, cells), 300, 300, cells);
    const r = frames.map((f) => meanDist(f.cells));
    for (let i = 10; i < 120; i += 10) expect(r[i]!).toBeGreaterThan(r[i - 10]!);
    // circle_256.png's green ≈ radius: frame k (level k−1) is the ring of radius ~k.
    expect(r[99]!).toBeGreaterThan(95);
    expect(r[99]!).toBeLessThan(103);
    // A ring, not a disc: nearly every cell of a frame sits within a couple of pixels of that radius (the picture
    // has a few stray pixels).
    const ring = frames[99]!.cells;
    expect(ring.filter((c) => Math.abs(Math.hypot(c.x - 300, c.y - 300) - 99.5) < 3).length / ring.length).toBeGreaterThan(0.95);
    // Real (create_real_particles): cells, no cosmetic particles.
    expect(frames.every((f) => f.parts.length === 0)).toBe(true);
  });

  it('stops after its last level when it does not loop, and repeats when it does', () => {
    const cells: { x: number; y: number }[] = [];
    const circle = run(deck('circle_fire'), 300, host({}, cells), 300, 300, cells);
    expect(circle.slice(0, 256).filter((f) => f.cells.length > 0).length).toBeGreaterThan(250);
    expect(circle.slice(256).every((f) => f.cells.length === 0)).toBe(true);
    // Megalaser's charge-up: wand_64.png (505 pixels, red ~0.7) at 12 levels a frame × 0.8, no loop: done in 22 frames.
    const mega = run({ emitters: deck('megalaser').emitters!.filter((e) => e.image) }, 60, host());
    expect(mega.slice(0, 22).reduce((s, f) => s + f.parts.length, 0)).toBeGreaterThan(200);
    expect(mega.slice(22).every((f) => f.parts.length === 0)).toBe(true);
    // Temporary Wall loops (temporary_wall.png's 205 levels at 10 a frame): still going a minute later.
    const wall = run(deck('temporary_wall'), 400, host());
    expect(wall.slice(380).reduce((s, f) => s + f.parts.length, 0)).toBeGreaterThan(50);
  });

  it('rains from a one-level cloud picture every emission (Cloud of Water: cloud_bottom.png, every 3 frames)', () => {
    const cells: { x: number; y: number }[] = [];
    const frames = run(deck('cloud_water'), 90, host({}, cells), 300, 300, cells);
    const ticks = frames.filter((f) => f.cells.length > 0).length;
    expect(ticks).toBeGreaterThan(25);
    // The outline's sparks are cosmetic.
    expect(frames.some((f) => f.parts.length > 0)).toBe(true);
  });

  it('raytrace_from_center: nothing behind a wall', () => {
    const cells: { x: number; y: number }[] = [];
    run(deck('circle_fire'), 200, host({ blocks: (x) => x >= 340 }, cells), 300, 300, cells);
    expect(cells.length).toBeGreaterThan(1000);
    expect(cells.every((c) => c.x < 341)).toBe(true);
  });

  it('skips pixels outside the world and holds the per-frame caps', () => {
    const cells: { x: number; y: number }[] = [];
    const frames = run(deck('circle_fire'), 200, host({ cellCap: 150, w: W, h: H }, cells), 40, 200, cells);
    expect(cells.every((c) => c.x >= 0 && c.y >= 0 && c.x < W && c.y < H)).toBe(true);
    // Over the cap the ring thins evenly: about the cap, never far over.
    for (const f of frames.slice(40)) expect(f.cells.length).toBeLessThan(150 * 1.4);
    expect(frames.slice(100).reduce((s, f) => s + f.cells.length, 0) / 100).toBeGreaterThan(100);
    // Sea of Water's first frame is ~900 pixels: held to the cap, and to the room left in the particle budget.
    const sea = run(deck('sea_water'), 1, host({ imageCap: 200 }));
    expect(sea[0]!.parts.length).toBeLessThan(260);
    expect(sea[0]!.parts.length).toBeGreaterThan(140);
    const full = run(deck('sea_water'), 1, host({ room: () => 30 }));
    expect(full[0]!.parts.length).toBeLessThan(50);
  });

  it('waits for its picture: nothing until it has loaded, then the animation starts from the beginning', () => {
    const cells: { x: number; y: number }[] = [];
    let loaded = false;
    const h = host({ image: (f) => (loaded ? images.get(f) : undefined) }, cells);
    const states = emitterStates(deck('circle_fire'));
    for (let age = 1; age <= 30; age++) runEmitters(states, age, 300, 300, 300, 300, 0, () => {}, undefined, h);
    expect(cells.length).toBe(0);
    loaded = true;
    for (let age = 31; age <= 40; age++) runEmitters(states, age, 300, 300, 300, 300, 0, () => {}, undefined, h);
    expect(meanDist(cells)).toBeLessThan(10);
  });
});

describe('attractor_force', () => {
  it('pulls the particles toward the emitting entity, wherever it is now', () => {
    const vis = deck('black_hole_giga');
    expect(vis.emitters!.every((e) => e.attractorForce === 16)).toBe(true);
    const src = { x: 300, y: 300 };
    const ps: Particle[] = [];
    runEmitters(emitterStates(vis), 1, src.x, src.y, src.x, src.y, 0, (q) => ps.push(q), undefined, host({ source: src }));
    expect(ps.length).toBeGreaterThan(50);
    expect(ps.every((q) => q.src === src && q.attract === 16)).toBe(true);
    // Make them live long enough to watch, and start every one flying outward.
    for (const q of ps) q.max = 1000;
    const start = meanDist(ps);
    let live = ps;
    for (let f = 0; f < 10; f++) live = stepParticles(live, () => false);
    // Flung out first (velocity_always_away_from_center)...
    const out = meanDist(live);
    expect(out).toBeGreaterThan(start);
    for (let f = 0; f < 40; f++) live = stepParticles(live, () => false);
    // ...then hauled back in past where they started.
    expect(meanDist(live)).toBeLessThan(start);
    // The source moving drags them with it.
    src.x = 400;
    for (let f = 0; f < 60; f++) live = stepParticles(live, () => false);
    expect(live.reduce((s, q) => s + q.x, 0) / live.length).toBeGreaterThan(330);
  });

  it('is force × ATTRACT_K px/s², and stops when the source is gone', () => {
    const src = { x: 0, y: 0, dead: false };
    const q: Particle = { x: 50, y: 0, vx: 0, vy: 0, life: 0, max: 1000, color: '#fff', alpha: 1, glow: false, fade: false, gx: 0, gy: 0, long: true, friction: 0, airflow: 0, attract: 8, src };
    stepParticles([q], () => false);
    expect(q.vx).toBeCloseTo((-8 * ATTRACT_K) / 60, 6);
    src.dead = true;
    const v = q.vx;
    stepParticles([q], () => false);
    expect(q.vx).toBe(v);
  });
});

describe('the range runs them', () => {
  const materials = json<Material[]>('data/materials.json');
  const data = (): RangeData => ({
    projectiles: json<Record<string, Projectile>>('data/projectiles.json'),
    visuals,
    materialColor: new Map(materials.map((m) => [m.id, m.color])),
    rockDurability: materials.find((m) => m.id === 'rock_static')?.durability ?? 0,
    kit: json<RangeKit>('data/range_kit.json'),
    materials,
    reactions: json<Reaction[]>('data/reactions.json'),
  });
  const count = (w: RangeWorld, id: string) => {
    const m = w.cells.index(id);
    let n = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (w.cells.at(x, y) === m) n++;
    return n;
  };

  it('Circle of Water floods the cave from its centre, loading its picture on cast', async () => {
    const w = new RangeWorld(data());
    const asked: string[] = [];
    w.loadImage = async (f) => (asked.push(f), images.get(f)!);
    w.spawn('data/entities/projectiles/deck/circle_water.xml', 120, 150, 0, 0, {});
    expect(asked).toEqual(['data/particles/image_emitters/circle_256.png']);
    await Promise.resolve();
    await Promise.resolve();
    for (let i = 0; i < 60; i++) w.step();
    expect(count(w, 'water')).toBeGreaterThan(2000);
  });

  it('a Sea pours real liquid under where it was cast, capped per frame', () => {
    const w = new RangeWorld(data());
    // Clear a basin under the cast point for it to fill.
    for (let y = 60; y < H - 10; y++) for (let x = 40; x < 380; x++) w.cells.set(x, y, AIR);
    w.seaCap = 1000;
    w.spawn('data/entities/projectiles/deck/sea_water.xml', 200, 20, 0, 0, {});
    w.step();
    const first = count(w, 'water');
    expect(first).toBeGreaterThan(500);
    // The cap is checked between columns pairs, so it can run over by one pair (2 × 256 rows at most).
    expect(first).toBeLessThan(1000 + 512);
    for (let i = 0; i < 40; i++) w.step();
    expect(count(w, 'water')).toBeGreaterThan(30000);
    // Nothing above the sea's top (30 px below the cast point, give or take the 5 px wave).
    let above = 0;
    for (let y = 0; y < 44; y++) for (let x = 0; x < W; x++) if (w.cells.at(x, y) === w.cells.index('water')) above++;
    expect(above).toBe(0);
  });
});

// The emitters these tests rely on, as extracted.
it('extracts the image emitters the tests use', () => {
  const img = (e: Emitter[] | undefined) => e?.find((x) => x.image)?.image;
  expect(img(deck('circle_fire').emitters)).toMatchObject({ speed: 1, loop: false, raytraceFromCenter: true });
  expect(img(deck('megalaser').emitters)).toMatchObject({ speed: 12, loop: false, useEntityRotation: true });
  expect(deck('cloud_water').emitters?.filter((e) => e.image && e.noRotate).length).toBe(5);
  expect(deck('sea_water').sea).toMatchObject({ material: 'water', w: 300, h: 256, oy: 158, speed: 10 });
});
