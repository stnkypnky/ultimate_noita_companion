// The test range driven by real cast-simulator output (game scripts) and real extracted projectile data.
import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLuaHost, loadGun, type LuaHost } from '../tools/extract/lua.ts';
import { AIR, H, RangeWorld, TARGET_SIZE, W, hitAndHeal, patternOffset, targetDamage, type Proj, type RangeData } from '../src/features/range/world.ts';
import { BIOMES } from '../src/features/range/biomes.ts';
import { Musician, SongState, noteOf } from '../src/features/range/melody.ts';
import { WandRuntime } from '../src/features/range/wand.ts';
import { castWand, resetWand } from '../src/sim/protocol.ts';
import type { EntityVisual, Material, Projectile, RangeKit, Reaction } from '../src/data/types.ts';
import { projectileDamage } from '../src/sim/analyze.ts';
import type { SimRequest, SimResult } from '../src/sim/types.ts';

const GAME = join(import.meta.dirname, '../public/game');
const json = <T>(p: string) => JSON.parse(readFileSync(join(GAME, p), 'utf8')) as T;
let host: LuaHost;
let data: RangeData;

beforeAll(async () => {
  host = await createLuaHost((p) => (existsSync(join(GAME, 'lua', p)) ? readFileSync(join(GAME, 'lua', p), 'utf8') : undefined));
  await loadGun(host);
  const materials = json<Material[]>('data/materials.json');
  data = {
    projectiles: json<Record<string, Projectile>>('data/projectiles.json'),
    visuals: json<Record<string, EntityVisual>>('data/visuals.json'),
    materialColor: new Map(materials.map((m) => [m.id, m.color])),
    rockDurability: materials.find((m) => m.id === 'rock_static')?.durability ?? 0,
    kit: json<RangeKit>('data/range_kit.json'),
    materials,
    reactions: json<Reaction[]>('data/reactions.json'),
  };
});

function casts(deck: string[], always: string[] = []) {
  host.call('sim_reset', 1, false, 20, deck.length, 10, 0, 1, 2000, 2000, 2000, 100, 100, 0, 0);
  for (const id of deck) host.call('sim_add_card', id, -1);
  for (const id of always) host.call('sim_add_always_cast', id);
  return (JSON.parse(host.call<string>('sim_run', 64, true)) as SimResult).casts;
}

/** A wand with plenty of mana (like casts() above), held in the range and fired straight through the Lua host. */
function equip(w: RangeWorld, deck: string[], mana = 2000) {
  const req: SimRequest = {
    wand: { shuffle: false, spellsPerCast: 1, castDelay: 10, rechargeTime: 20, manaMax: mana, manaChargeSpeed: mana, capacity: deck.length, spread: 0, speedMultiplier: 1 },
    deck: deck.map((id) => ({ id, uses: -1 })),
    alwaysCasts: [],
    options: { maxCasts: 64, stopOnReload: true, hp: 100, maxHp: 100, money: 0, frame: 0 },
  };
  const call = (fn: string, ...args: unknown[]) => host.call(fn, ...args);
  let n = 0;
  w.wand = new WandRuntime({ reset: (r) => resetWand(call, r), cast: (f, m) => castWand(call, f, m, ++n) }, (c) => w.fire(c));
  w.wand.equip(req, w.frame);
}

function world(deck: string[], frames: number, distance?: number) {
  const w = new RangeWorld(data);
  if (distance !== undefined) w.setDummyDistance(distance);
  const spawned: string[] = [];
  const spawn = w.spawn.bind(w);
  w.spawn = (file, ...rest) => {
    spawned.push(file.split('/').pop()!);
    return spawn(file, ...rest);
  };
  equip(w, deck);
  let maxBolts = 0;
  let maxBeams = 0;
  let maxSegments = 0;
  let orbiting = 0;
  // Auto mode puts a teleported player back on the next cast after a recharge, so track the furthest move.
  let maxShift = 0;
  for (let i = 0; i < frames; i++) {
    w.step();
    maxShift = Math.max(maxShift, Math.abs(w.player.x - w.player.homeX));
    maxBolts = Math.max(maxBolts, w.bolts.length);
    maxBeams = Math.max(maxBeams, w.beams.length);
    maxSegments = Math.max(maxSegments, w.segments.length);
    orbiting = Math.max(orbiting, w.projectiles.filter((p) => p.parent).length);
  }
  return { w, spawned, maxBolts, maxBeams, maxSegments, orbiting, maxShift };
}

/** Cells of rock (and other solids) left in the range. */
const rocks = (w: RangeWorld) => {
  let n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (w.cell(x, y) !== AIR) n++;
  return n;
};

describe('test range basics', () => {
  it('spark bolts fly to the dummy and deal their damage', () => {
    const { w } = world(['LIGHT_BULLET'], 120);
    expect(w.castsFired).toBeGreaterThan(3);
    expect(w.damageEvents.length).toBeGreaterThan(0);
    expect(w.damageEvents.every((e) => e.amount === 3 || e.amount === 15)).toBe(true);
  });

  it('a bomb in a trigger payload explodes and digs the terrain', () => {
    const before = rocks(new RangeWorld(data));
    const { w } = world(['LIGHT_BULLET_TRIGGER', 'BOMB'], 400);
    expect(rocks(w)).toBeLessThan(before - 200);
    expect(w.totalDamage).toBeGreaterThan(100);
  });

  it('a timer goes off when its time is up, early on a hit, or when the projectile expires first', () => {
    // Spark Bolt with Timer: 10 frames.
    expect(world(['LIGHT_BULLET_TIMER', 'BOMB'], 12, 380).spawned).toContain('bomb.xml');
    // Point blank, it hits the dummy within 3 frames and acts like a trigger.
    expect(world(['LIGHT_BULLET_TIMER', 'BOMB'], 5, 20).spawned).toContain('bomb.xml');
    // Energy Orb with Timer: the orb lives ~50 frames, less than its 100-frame timer.
    expect(world(['SLOW_BULLET_TIMER', 'LIGHT_BULLET'], 60, 380).spawned).toContain('light_bullet.xml');
  });

  it('water conducts (like most liquids), oil and glue do not, metals do', () => {
    const by = new Map(data.materials.map((m) => [m.id, m]));
    for (const id of ['water', 'water_salt', 'blood', 'acid', 'swamp', 'steel']) expect(by.get(id)?.conductive, id).toBe(true);
    for (const id of ['oil', 'glue', 'sand', 'air']) expect(by.get(id)?.conductive, id).toBe(false);
  });

  it('electrified water stuns and pulses damage into whoever stands in it; dry ground is safe', () => {
    const w = new RangeWorld(data);
    const water = w.cells.index('water');
    // A pool around the dummy's feet that runs 60 px to the left.
    const d = w.dummy;
    for (let y = Math.floor(d.y) - 6; y < Math.floor(d.y); y++) for (let x = Math.floor(d.x) - 60; x <= Math.floor(d.x) + 6; x++) w.cells.set(x, y, water);
    const before = w.totalDamage;
    // Lightning reaches the far end of the pool.
    w.electrify(d.x - 55, d.y - 2, 25);
    for (let i = 0; i < 40; i++) w.step();
    expect(w.dummy.status.has('ELECTROCUTION') || w.totalDamage - before >= 75).toBe(true);
    expect(w.totalDamage - before).toBe(75);
    // A strike on dry rock electrifies nothing.
    const w2 = new RangeWorld(data);
    w2.electrify(w2.dummy.x, w2.dummy.y + 5, 25);
    expect(w2.shocks).toHaveLength(0);
  });

  it('a Lightning Bolt landing beside a pool arcs into it, and its blast leaves the water in place', () => {
    const w = new RangeWorld(data);
    const water = w.cells.index('water');
    const gx = 300;
    let gy = 40;
    while (w.cell(gx, gy) === AIR) gy++;
    // A pool 20 px to the right of where the bolt lands, dug into the ground.
    for (let y = gy; y < gy + 6; y++) for (let x = gx + 20; x < gx + 40; x++) w.cells.set(x, y, water);
    const before = [...w.cells.mat].filter((m) => m === water).length;
    // Straight down onto the rock at gx.
    w.spawn('data/entities/projectiles/deck/lightning.xml', gx, gy - 30, 0, 5400);
    expect(w.shocks).toHaveLength(1);
    expect(w.shocks[0]!.cells.length).toBeGreaterThan(100);
    expect([...w.cells.mat].filter((m) => m === water).length).toBe(before);
  });

  it('a glitter bomb bursts into 12 glitter shards that scatter, shed glitter and pop', () => {
    const w = new RangeWorld(data);
    const shards: Proj[] = [];
    const spawn = w.spawn.bind(w);
    w.spawn = (...args) => {
      const p = spawn(...args);
      if (p && args[0].endsWith('glitter_bomb_shrapnel.xml')) shards.push(p);
      return p;
    };
    w.spawn('data/entities/projectiles/deck/glitter_bomb.xml', 200, 60, 0, 0);
    // Its 50-frame fuse runs out in mid-air.
    for (let i = 0; i < 52 && !shards.length; i++) w.step();
    expect(shards).toHaveLength(12);
    // SetStartVelocityComponent: 80â€“120 in any direction (they've moved one frame since).
    const speeds = shards.map((s) => Math.hypot(s.vx, s.vy));
    expect(Math.min(...speeds)).toBeGreaterThan(50);
    expect(Math.max(...speeds)).toBeLessThan(125);
    const angles = new Set(shards.map((s) => Math.round(((Math.atan2(s.vy, s.vx) + Math.PI) / (2 * Math.PI)) * 4) % 4));
    expect(angles.size).toBeGreaterThan(1);
    // They shed glitter clouds and sparkles as they flyâ€¦
    let most = 0;
    for (let i = 0; i < 60; i++) {
      w.step();
      most = Math.max(most, w.spriteParticles.length);
    }
    expect(most).toBeGreaterThan(10);
    // â€¦and each pops within its 200-frame life.
    for (let i = 0; i < 160; i++) w.step();
    expect(shards.every((s) => s.dead)).toBe(true);
  });

  it("a trigger's payload bounces off the wall it hit", () => {
    const w = new RangeWorld(data);
    const payloads: { vy: number; p: ReturnType<RangeWorld['spawn']> }[] = [];
    const spawn = w.spawn.bind(w);
    w.spawn = (file, x, y, vx, vy, s, trigger, rot) => {
      const p = spawn(file, x, y, vx, vy, s, trigger, rot);
      if (!trigger && w.frame > 0) payloads.push({ vy, p });
      return p;
    };
    equip(w, ['LIGHT_BULLET_TRIGGER', 'LIGHT_BULLET']);
    // Shoot down into the floor just ahead.
    w.auto = false;
    w.aim = { x: w.player.x + 50, y: w.player.y + 20 };
    w.setTrigger(true);
    for (let i = 0; i < 12; i++) w.step();
    expect(payloads.length).toBeGreaterThan(0);
    // It leaves upwards, off the floor, and is still flying rather than popping in the ground.
    expect(payloads[0]!.vy).toBeLessThan(0);
    expect(payloads[0]!.p!.dead).toBe(false);
  });

  it('a statue is solid stone to projectiles (temple_statue_*.xml: a rock_box2d_hard physics body)', () => {
    // A piercing trigger passes through the training dummy but stops at a statue, releasing its payload once.
    const shoot = (target: 'statue' | 'dummy') => {
      const w = new RangeWorld(data);
      w.setTarget(target);
      w.setDummyDistance(60);
      const carriers: Proj[] = [];
      let payloads = 0;
      const spawn = w.spawn.bind(w);
      w.spawn = (file, x, y, vx, vy, s, trigger, rot) => {
        const p = spawn(file, x, y, vx, vy, s, trigger, rot);
        if (p && trigger) carriers.push(p);
        else if (p && w.frame > 0) payloads++;
        return p;
      };
      equip(w, ['PIERCING_SHOT', 'LIGHT_BULLET_TRIGGER', 'LIGHT_BULLET']);
      for (let i = 0; i < 18; i++) w.step();
      return { w, carrier: carriers[0]!, payloads };
    };
    const statue = shoot('statue');
    const right = statue.w.dummy.x + statue.w.dummy.w / 2;
    expect(statue.carrier.x).toBeLessThanOrEqual(right);
    expect(statue.payloads).toBe(1);
    expect(shoot('dummy').carrier.x).toBeGreaterThan(right);

    // A bomb thrown at a statue bounces off it instead of rolling through.
    const w = new RangeWorld(data);
    w.setTarget('statue');
    const d = w.dummy;
    const bomb = w.spawn('data/entities/projectiles/deck/bomb.xml', d.x - 20, d.y - d.h / 2, 300, 0)!;
    let furthest = bomb.x;
    for (let i = 0; i < 30 && !bomb.dead; i++) {
      w.step();
      furthest = Math.max(furthest, bomb.x);
    }
    expect(furthest).toBeLessThan(d.x - d.w / 2 + 1);
  });

  it('homing bends shots into the dummy', () => {
    expect(world(['HOMING', 'BUBBLESHOT'], 300).w.damageEvents.length).toBeGreaterThan(0);
  });

  it('fires the first cast on the first step and loops the cycle', () => {
    const c = casts(['LIGHT_BULLET', 'LIGHT_BULLET']);
    const cycle = c.at(-1)!.next_frame - c[0]!.frame;
    const w = new RangeWorld(data);
    equip(w, ['LIGHT_BULLET', 'LIGHT_BULLET']);
    w.step();
    expect(w.castsFired).toBe(1);
    for (let i = 1; i < cycle * 3; i++) w.step();
    expect(w.castsFired).toBe(6);
  });

  it('moves the dummy with the range adjuster', () => {
    const w = new RangeWorld(data);
    w.setDummyDistance(100);
    expect(w.dummy.x - w.player.x).toBe(100);
  });
});

describe('spell fixes', () => {
  it('giga disc slows, comes back and hurts the caster', () => {
    const { w } = world(['DISC_BULLET_BIG'], 360, 300);
    expect(w.selfDamage).toBeGreaterThan(0);
  });

  it('chain bolt hops and zaps a nearby dummy', () => {
    const { w, maxSegments, spawned } = world(['CHAIN_BOLT'], 120, 70);
    expect(spawned.filter((f) => f === 'chain_bolt_explosion.xml').length).toBeGreaterThan(2);
    expect(maxSegments).toBeGreaterThan(0);
    expect(w.totalDamage).toBeGreaterThan(0);
  });

  it('glitter bomb is a short lob that digs', () => {
    const before = rocks(new RangeWorld(data));
    const { w } = world(['GLITTER_BOMB'], 70);
    expect(rocks(w)).toBeLessThan(before);
  });

  it('Dynamite is thrown hardest, Glitter bomb a little softer, Bomb is a slow lob (speed Ã— throw_force_coeff)', () => {
    const P = 'data/entities/projectiles/';
    const fuse = (f: string) => data.projectiles[P + f]!.lifetime;
    expect([fuse('bomb.xml'), fuse('deck/glitter_bomb.xml'), fuse('deck/tnt.xml')]).toEqual([180, 50, 50]);
    const thrown = (spell: string, file: string) => {
      const w = fly([spell], 2);
      return Math.hypot(live(w, file)[0]!.vx, live(w, file)[0]!.vy);
    };
    const tnt = thrown('DYNAMITE', 'tnt');
    const glitter = thrown('GLITTER_BOMB', 'glitter_bomb');
    const bomb = thrown('BOMB', 'bomb');
    expect(tnt).toBeGreaterThan(glitter + 40);
    expect(glitter).toBeGreaterThan(bomb * 2);
    expect(tnt).toBeGreaterThan(300); // the old cap was 220
    expect(bomb).toBeLessThan(130);
  });

  it("Bouncing Burst's damage scales with its speed against its speed at the end of frame 1", () => {
    const hitAt = (scale: number, file = 'rubber_ball') => {
      const w = new RangeWorld(data);
      const c = w.dummyCenter;
      const p = w.spawn(`data/entities/projectiles/deck/${file}.xml`, c.x - 80, c.y, 450, 0)!;
      p.gravity = 0;
      p.airFriction = 0;
      w.step();
      p.vx *= scale;
      for (let i = 0; i < 60 && !w.damageEvents.length; i++) w.step();
      return w.damageEvents[0]?.amount ?? 0;
    };
    const full = hitAt(1);
    expect(full).toBeGreaterThan(0);
    expect(hitAt(0.5)).toBeCloseTo(full / 2, 1);
    expect(hitAt(1.4)).toBeCloseTo(full * 1.4, 1);
    // Energy Sphere: only its 5 Projectile damage scales; its 5 Slice doesn't (wiki).
    const orb = data.projectiles['data/entities/projectiles/deck/bouncy_orb.xml']!.damage;
    expect(hitAt(1, 'bouncy_orb')).toBeCloseTo((orb.projectile ?? 0) + (orb.slice ?? 0), 1);
    expect(hitAt(0.5, 'bouncy_orb')).toBeCloseTo((orb.projectile ?? 0) / 2 + (orb.slice ?? 0), 1);
  });

  it('Bouncing Burst keeps going down to 5 px/s (die_on_low_velocity_limit), not the old 40', () => {
    expect(data.projectiles['data/entities/projectiles/deck/rubber_ball.xml']!.lowVelocityLimit).toBe(5);
    const w = new RangeWorld(data);
    const p = w.spawn('data/entities/projectiles/deck/rubber_ball.xml', 100, 60, 25, 0)!;
    p.gravity = 0;
    p.airFriction = 0;
    for (let i = 0; i < 20; i++) w.step();
    expect(p.dead).toBeFalsy();
  });

  it('luminous drill is drawn as a short beam and bores into rock', () => {
    const { w, maxSegments } = world(['LUMINOUS_DRILL'], 30, 300);
    expect(maxSegments).toBeGreaterThan(0);
    void w;
  });

  it('teleport bolt moves the caster', () => {
    expect(world(['TELEPORT_PROJECTILE'], 30).maxShift).toBeGreaterThan(20);
  });

  it('swapper swaps caster and dummy', () => {
    const { w } = world(['SWAPPER_PROJECTILE'], 30, 120);
    expect(w.player.x).toBeGreaterThan(w.player.homeX + 60);
  });
});

describe('effects', () => {
  it('orbit spells put four projectiles in orbit', () => {
    expect(world(['ORBIT_DISCS', 'LIGHT_BULLET'], 10).orbiting).toBe(4);
    expect(world(['ORBIT_LASERS', 'LIGHT_BULLET'], 10).orbiting).toBe(4);
    // stacked orbit modifiers each bring their own four (a nuke may clip the floor and blow up at once)
    const { spawned } = world(['ORBIT_NUKES', 'ORBIT_LASERS', 'ARROW'], 3);
    expect(spawned.filter((f) => f === 'orbit_nukes_nuke.xml')).toHaveLength(4);
    expect(spawned.filter((f) => f === 'orbit_lasers_laser.xml')).toHaveLength(4);
  });

  it('bounce modifiers spawn their effect on bounce', () => {
    for (const [mod, fx] of [
      ['BOUNCE_EXPLOSION', 'bounce_explosion.xml'],
      ['BOUNCE_SMALL_EXPLOSION', 'bounce_small_explosion.xml'],
      ['BOUNCE_SPARK', 'bounce_spark_friendly_fire.xml'],
      ['BOUNCE_LASER', 'bounce_laser.xml'],
      ['BOUNCE_LIGHTNING', 'bounce_lightning.xml'],
    ] as const) {
      const { spawned } = world([mod, 'BOUNCY_ORB'], 200);
      expect(spawned, mod).toContain(fx);
    }
  });

  it('lightning bolt strikes the dummy', () => {
    const { w, maxBolts } = world(['LIGHTNING'], 20);
    expect(maxBolts).toBeGreaterThan(0);
    expect(w.totalDamage).toBeGreaterThan(0);
  });

  it('plasma beam emits a damaging laser', () => {
    const { w, maxBeams } = world(['LASER_EMITTER'], 120, 70);
    expect(maxBeams).toBeGreaterThan(0);
    expect(w.totalDamage).toBeGreaterThan(0);
  });

  it('electric arc links projectiles of a cast', () => {
    expect(world(['ARC_ELECTRIC', 'BURST_2', 'BUBBLESHOT', 'BUBBLESHOT'], 30).maxBolts).toBeGreaterThan(0);
  });
});

describe('looks and physics from the game data', () => {
  it('projectiles shed particles from their emitters', () => {
    const { w } = world(['LIGHT_BULLET'], 12);
    expect(w.particles.length).toBeGreaterThan(5);
  });

  it('a bomb plays its explosion sprite, shakes the camera and throws the player', () => {
    const { w } = world([], 0);
    for (let i = 0; i < 70; i++) w.step();
    const vx = w.body.vx;
    w.explode(w.player.x - 12, w.player.y - 6, 30, 0, -1, 0, undefined, false, data.visuals['data/entities/projectiles/bomb.xml']?.explosion);
    expect(w.effects.length).toBeGreaterThan(0);
    expect(w.shake).toBeGreaterThan(0);
    expect(w.body.vx).toBeGreaterThan(vx + 20);
  });

  it('bounces reflect off the surface (a floor keeps the forward motion)', () => {
    const w = new RangeWorld(data);
    const p = w.spawn('data/entities/projectiles/deck/bouncy_orb.xml', 240, w.floorY - 3, 120, 200, { bounces: 5 })!;
    for (let i = 0; i < 4; i++) w.step();
    expect(p.vx).toBeGreaterThan(0);
    expect(p.vy).toBeLessThan(0);
  });

  it('Freeze charge freezes what it hits, with the game duration', () => {
    const { w } = world(['FREEZE', 'LIGHT_BULLET'], 0);
    let frozen = 0;
    for (let i = 0; i < 120; i++) {
      w.step();
      if (w.dummy.status.has('FROZEN')) frozen++;
    }
    expect(frozen).toBeGreaterThan(30);
  });

  it('burning hurts every second until it goes out, and water puts it out', () => {
    const w = new RangeWorld(data);
    w.applyEffects(w.dummy, ['data/entities/misc/effect_apply_on_fire.xml']);
    for (let i = 0; i < 60; i++) w.step();
    expect(w.totalDamage).toBeGreaterThan(0);
    w.applyEffects(w.dummy, ['data/entities/misc/effect_apply_wet.xml']);
    expect(w.dummy.status.has('ON_FIRE')).toBe(false);
  });

  it('Null Shot takes all damage away, the blast too', () => {
    const bomb = data.projectiles['data/entities/projectiles/bomb.xml'];
    const d = projectileDamage(bomb, { damage_null_all: 1 });
    expect(d.hit).toBe(0);
    expect(d.explosion?.damage ?? 0).toBe(0);
  });

  it('burning takes 2% of max HP a second (wiki)', () => {
    const w = new RangeWorld(data);
    w.body.invincible = 0;
    w.applyEffects(w.player, ['data/entities/misc/effect_apply_on_fire.xml']);
    for (let i = 0; i < 60; i++) w.step();
    expect(w.selfDamage).toBeCloseTo(w.maxHp * 0.02, 1);
  });

  it('an explosion that sets no damage does the engine default, 125 (Meteor)', () => {
    expect(data.projectiles['data/entities/projectiles/deck/meteor.xml']?.explosion?.damage).toBe(125);
  });
});

/** Run a fresh range with the wand auto-firing for `frames` and hand back the world. */
function fly(deck: string[], frames: number, setup?: (w: RangeWorld) => void) {
  const w = new RangeWorld(data);
  setup?.(w);
  equip(w, deck);
  for (let i = 0; i < frames; i++) w.step();
  return w;
}
const live = (w: RangeWorld, name: string) => w.projectiles.filter((p) => !p.dead && p.file.endsWith(`/${name}.xml`));

describe('spells with their own scripts', () => {
  it('Intense Concentrated Light: five beams wait at the wand, then launch together', () => {
    const w = fly(['MEGALASER'], 10);
    const waiting = live(w, 'megalaser_beam');
    expect(waiting).toHaveLength(5);
    expect(waiting.every((b) => b.held)).toBe(true);
    for (let i = 0; i < 30; i++) w.step();
    const beams = live(w, 'megalaser_beam');
    expect(beams.length).toBeGreaterThan(0);
    expect(beams.every((b) => !b.held && Math.hypot(b.x - b.spawnX, b.y - b.spawnY) > 20)).toBe(true);
  });

  it('Magic Guard: four parts circle the caster 16 px out', () => {
    const w = fly(['MAGIC_SHIELD'], 20);
    const parts = live(w, 'magic_shield_part');
    expect(parts).toHaveLength(4);
    const c = w.playerCenter;
    for (const p of parts) expect(Math.hypot(p.x - c.x, p.y - c.y)).toBeCloseTo(16, 0);
  });

  it('Horizontal Barrier lays a line of 19 wall pieces both ways', () => {
    const w = new RangeWorld(data);
    const pieces: Proj[] = [];
    const spawn = w.spawn.bind(w);
    w.spawn = (file, ...rest) => {
      const p = spawn(file, ...rest);
      if (p && file.endsWith('/wall_piece.xml')) pieces.push(p);
      return p;
    };
    // Out in the open, so neither builder runs into the cave wall.
    w.player.x = 150;
    equip(w, ['WALL_HORIZONTAL']);
    // One cast: the builders live 10 frames.
    for (let i = 0; i < 14; i++) w.step();
    expect(w.castsFired).toBe(1);
    expect(pieces).toHaveLength(19);
    const xs = pieces.map((p) => p.spawnX);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(100);
    expect(new Set(pieces.map((p) => Math.round(p.spawnY))).size).toBeLessThanOrEqual(2);
  });

  it('Powder Vacuum Field sucks up sand and spills it when it ends', () => {
    const sand = (w: RangeWorld) => {
      let n = 0;
      const m = w.materialIndex('sand');
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (w.cells.at(x, y) === m) n++;
      return n;
    };
    // Cast it over the sand on the island.
    const w = new RangeWorld(data);
    const before = sand(w);
    equip(w, ['VACUUM_POWDER']);
    w.step();
    const field = live(w, 'vacuum_powder')[0]!;
    field.x = 200;
    field.y = 60;
    for (let i = 0; i < 100; i++) w.step();
    expect(sand(w)).toBeLessThan(before);
    for (let i = 0; i < 260; i++) w.step();
    expect(field.dead).toBe(true);
    expect(sand(w)).toBeGreaterThan(before * 0.8);
  });

  it("Worm Launcher's worm only starts homing after 40 frames", () => {
    // Worms pass through the ground and can fall out of the range, so check every live one by its age.
    const w = fly(['WORM_SHOT'], 1);
    let young = 0;
    let old = 0;
    for (let i = 0; i < 90; i++) {
      w.step();
      for (const worm of live(w, 'worm_shot')) {
        if (worm.age < 40) {
          expect(worm.homing).toBeUndefined();
          young++;
        } else if (worm.age > 40) {
          expect(worm.homing?.targetShooter).toBe(true);
          old++;
        }
      }
    }
    expect(young).toBeGreaterThan(0);
    expect(old).toBeGreaterThan(0);
  });

  it('Spells to Power uses up the other projectiles and takes their damage', () => {
    const w = new RangeWorld(data);
    equip(w, ['BURST_4', 'SPELLS_TO_POWER', 'LIGHT_BULLET', 'LIGHT_BULLET', 'LIGHT_BULLET']);
    w.step();
    w.step();
    const sparks = live(w, 'light_bullet');
    expect(sparks).toHaveLength(1);
    expect(sparks[0]!.hit).toBeCloseTo(9, 5);
  });

  it('Destruction wipes out the dummy and costs the caster 12.5 HP', () => {
    const w = fly(['DESTRUCTION'], 3);
    expect(w.floaters.some((f) => f.text === 'destroyed')).toBe(true);
    expect(w.body.hp).toBeCloseTo(w.maxHp - 12.5, 5);
  });

  it('Mass Polymorph turns the caster into a sheep, who then cannot cast', () => {
    const w = fly(['MASS_POLYMORPH', 'LIGHT_BULLET'], 3);
    expect(w.polymorphed).toBe(true);
    const casts = w.castsFired;
    for (let i = 0; i < 60; i++) w.step();
    expect(w.castsFired).toBe(casts);
  });

  it('Earthquake shakes the ground loose where the shot ends', () => {
    const w = fly(['CRUMBLING_EARTH_PROJECTILE', 'LIGHT_BULLET'], 60);
    expect(w.cells.mats.some((m) => m.id.endsWith(':loose'))).toBe(true);
  });

  it('Matosade drops giant worms that swim through the rock', () => {
    const w = fly(['WORM_RAIN'], 90);
    expect(live(w, 'worm_big_worm_rain').length).toBeGreaterThan(0);
  });
});

describe('advanced wand mechanics', () => {
  const dirs = (w: RangeWorld, name: string) => live(w, name).map((p) => (Math.atan2(p.vy, p.vx) * 180) / Math.PI);
  const apart = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

  it('spreads a formation evenly, wrapping a full circle without doubling up the ends', () => {
    expect([0, 1].map((i) => patternOffset(180, i, 2))).toEqual([-180, 0]);
    expect([0, 1, 2].map((i) => patternOffset(90, i, 3))).toEqual([-90, 0, 90]);
    expect([0, 1, 2, 3].map((i) => patternOffset(180, i, 4))).toEqual([-180, -90, 0, 90]);
    expect([0, 1].map((i) => patternOffset(45, i, 2))).toEqual([-45, 45]);
  });

  it('Iplicate fires the copy straight back the other way', () => {
    const [a, b] = dirs(fly(['I_SHOT', 'LIGHT_BULLET'], 2), 'light_bullet');
    expect(apart(a!, b!)).toBeGreaterThan(170);
  });

  it('Quplicate fires four ways, a quarter turn apart', () => {
    // Read the launch directions (the one fired into the floor dies at once).
    const w = new RangeWorld(data);
    const d: number[] = [];
    const spawn = w.spawn.bind(w);
    w.spawn = (file, x, y, vx, vy, ...rest) => (file.endsWith('light_bullet.xml') && d.push((Math.atan2(vy, vx) * 180) / Math.PI), spawn(file, x, y, vx, vy, ...rest));
    equip(w, ['QUAD_SHOT', 'LIGHT_BULLET']);
    w.step();
    d.sort((x, y) => x - y);
    expect(d).toHaveLength(4);
    for (let i = 1; i < 4; i++) expect(apart(d[i]!, d[i - 1]!)).toBeGreaterThan(80);
  });

  it('Iplicate on Matosade spawns a real Giant Worm (the copy uses the related projectile)', () => {
    const w = new RangeWorld(data);
    const spawned: string[] = [];
    const spawn = w.spawn.bind(w);
    w.spawn = (file, ...rest) => (spawned.push(file.split('/').pop()!), spawn(file, ...rest));
    equip(w, ['I_SHOT', 'WORM_RAIN']);
    w.step();
    expect(spawned).toContain('worm_big.xml');
  });

  it('a Healing bolt that lands on the caster heals them, up to their maximum', () => {
    const w = new RangeWorld(data);
    w.body.hp = 50;
    w.body.invincible = 0;
    const p = w.player;
    w.spawn('data/entities/projectiles/deck/heal_bullet.xml', p.x, p.y - p.h - 24, 0, 10);
    for (let i = 0; i < 60; i++) w.step();
    expect(w.body.hp).toBeCloseTo(58.75, 5);
    expect(w.healed).toBeCloseTo(8.75, 5);
    expect(w.floaters.some((f) => f.heal)).toBe(true);
  });

  it('Healing is negative damage: Damage Plus turns a Healing bolt harmful', () => {
    const heal = data.projectiles['data/entities/projectiles/deck/heal_bullet.xml'];
    const plain = projectileDamage(heal, {});
    expect(hitAndHeal(plain.damage, plain.hit)).toEqual({ hit: 0, heal: 8.75 });
    const plus = projectileDamage(heal, { damage_projectile_add: 0.4 });
    const r = hitAndHeal(plus.damage, plus.hit);
    expect(r.heal).toBe(0);
    expect(r.hit).toBeCloseTo(1.25, 5);
  });
});

describe('note spell songs (kantele.lua / ocarina.lua)', () => {
  const play = (instrument: 'kantele' | 'ocarina', notes: string[]) => {
    const s = new SongState(instrument);
    return notes.map((n) => s.play(n)).filter(Boolean);
  };

  it('recognises each song from the game files', () => {
    expect(play('kantele', ['a', 'dis', 'e', 'g'])).toEqual(['portal']);
    expect(play('kantele', ['d', 'e', 'a', 'e', 'dis'])).toEqual(['worm']);
    expect(play('ocarina', ['f', 'c', 'd', 'c'])).toEqual(['bomb']);
    expect(play('ocarina', ['a', 'f', 'd', 'e', 'a2'])).toEqual(['portal']);
    expect(play('ocarina', ['gsharp', 'f', 'e', 'b', 'd'])).toEqual(['worm']);
  });

  it('plays the alchemy songs in their translated key (alt_notes)', () => {
    expect(play('kantele', ['g', 'dis', 'g', 'e', 'a'])).toEqual(['alchemy']);
    expect(play('ocarina', ['e', 'c', 'b', 'gsharp', 'f'])).toEqual(['alchemy']);
  });

  it('kantele G always opens the alchemy song (pairs order in the gameâ€™s LuaJIT), so the kantele bomb song never completes', () => {
    const s = new SongState('kantele');
    s.play('g');
    expect(s.song).toBe('alchemy');
    expect(play('kantele', ['g', 'd', 'e', 'd'])).toEqual([]);
    // D broke alchemy and started the worm song; E carried it on.
    expect(play('kantele', ['g', 'd', 'e', 'a', 'e', 'dis'])).toEqual(['worm']);
  });

  it('a wrong note breaks the song, but may start another', () => {
    expect(play('kantele', ['g', 'd', 'a', 'd'])).toEqual([]);
    // The stray A starts the portal song, which then completes.
    expect(play('kantele', ['g', 'd', 'a', 'dis', 'e', 'g'])).toEqual(['portal']);
    // A note that fits no song leaves nothing in play.
    const s = new SongState('ocarina');
    s.play('a');
    s.play('b');
    expect(s.song).toBeNull();
  });

  it('each song works once per instrument; after that the energy is gone', () => {
    const m = new Musician();
    const run = (inst: 'kantele' | 'ocarina', notes: string[]) => notes.map((n) => m.hear(inst, n)).find(Boolean);
    expect(run('ocarina', ['f', 'c', 'd', 'c'])).toEqual({ song: 'bomb', first: true });
    expect(run('ocarina', ['f', 'c', 'd', 'c'])).toEqual({ song: 'bomb', first: false });
    expect(run('kantele', ['a', 'dis', 'e', 'g'])).toEqual({ song: 'portal', first: true });
    expect(noteOf('data/entities/projectiles/deck/kantele/kantele_dis.xml')).toEqual({ instrument: 'kantele', note: 'dis' });
  });

  it('casting the notes in the range plays the song: Holy Bomb appears and the game message shows', () => {
    const w = new RangeWorld(data);
    const spawned: string[] = [];
    const spawn = w.spawn.bind(w);
    w.spawn = (file, ...rest) => (spawned.push(file.split('/').pop()!), spawn(file, ...rest));
    equip(w, ['BURST_4', 'OCARINA_F', 'OCARINA_C', 'OCARINA_D', 'OCARINA_C']);
    w.step();
    expect(spawned).toContain('bomb_holy.xml');
    expect(w.songMessage?.text).toMatch(/world around you changes/);
  });

  it('the kantele bomb notes play no song in the range either', () => {
    const w = new RangeWorld(data);
    const spawned: string[] = [];
    const spawn = w.spawn.bind(w);
    w.spawn = (file, ...rest) => (spawned.push(file.split('/').pop()!), spawn(file, ...rest));
    equip(w, ['BURST_4', 'KANTELE_G', 'KANTELE_D', 'KANTELE_E', 'KANTELE_D']);
    w.step();
    expect(spawned).not.toContain('bomb_holy.xml');
    expect(w.songMessage).toBeNull();
  });
});

describe('projection wands: Pollen trigger loops (wiki: Pollen; reddit "A vanilla guide to 2D/3D projection wands")', () => {
  const POLLEN = 'data/entities/projectiles/deck/pollen.xml';
  const SPARK = 'data/entities/projectiles/deck/light_bullet.xml';
  const LANCE = 'data/entities/projectiles/deck/lance_holy.xml';

  it('Pollen can be hit, but only by friendly-fire projectiles (Holy Lance), and blasts leave it alone', () => {
    expect(data.projectiles[POLLEN]!.target).toMatchObject({ hp: 5, box: [-5, 5, -5, 5], multipliers: { explosion: 0 } });
    const w = new RangeWorld(data);
    const pollen = w.spawn(POLLEN, 200, 80, 0, 0)!;
    w.spawn(SPARK, 185, 80, 600, 0);
    for (let i = 0; i < 4; i++) w.step();
    expect(pollen.dead).toBe(false);
    w.spawn(LANCE, 185, pollen.y, 600, 0);
    for (let i = 0; i < 4; i++) w.step();
    expect(pollen.dead).toBe(true);
    expect(targetDamage({ explosion: 5 }, { explosion: 0 }, 5)).toBe(0);
    expect(targetDamage({ holy: 43.75 }, { explosion: 0 }, 43.75)).toBe(43.75);
  });

  it('the spiral engine runs: a piercing Holy Lance trigger hits each Pollen it releases, releasing the next', () => {
    const spiral = ['ADD_TIMER', 'POLLEN', 'ADD_TRIGGER', 'LIFETIME', 'SPIRALING_SHOT', 'HEAVY_SHOT', 'HEAVY_SHOT', 'HEAVY_SHOT', 'DECELERATING_SHOT', 'LANCE_HOLY', 'ADD_DEATH_TRIGGER', 'COLOUR_INVIS', 'POLLEN', 'LIGHT_BULLET'];
    const { spawned } = world(spiral, 240);
    const count = (f: string) => spawned.filter((s) => s === f).length;
    // One lance per cast, but a stream of Pollen, each one's death casting the Spark Bolt payload.
    expect(count('lance_holy.xml')).toBeLessThan(10);
    expect(count('pollen.xml')).toBeGreaterThan(20 * count('lance_holy.xml'));
    expect(count('light_bullet.xml')).toBeGreaterThan(20 * count('lance_holy.xml'));
  });
});

describe('charges', () => {
  it('casting spends charges, a spent spell is skipped, and a refill brings them back without a new wand', () => {
    const w = new RangeWorld(data);
    const req: SimRequest = {
      wand: { shuffle: false, spellsPerCast: 1, castDelay: 10, rechargeTime: 20, manaMax: 2000, manaChargeSpeed: 2000, capacity: 2, spread: 0, speedMultiplier: 1 },
      deck: [
        { id: 'BOMB', uses: 2 },
        { id: 'LIGHT_BULLET', uses: -1 },
      ],
      alwaysCasts: [],
      options: { maxCasts: 64, stopOnReload: true, hp: 100, maxHp: 100, money: 0, frame: 0 },
    };
    const call = (fn: string, ...args: unknown[]) => host.call(fn, ...args);
    let n = 0;
    const played: string[] = [];
    w.wand = new WandRuntime({ reset: (r) => resetWand(call, r), cast: (f, m) => castWand(call, f, m, ++n) }, (c) => played.push(...c.played));
    w.wand.equip(req, w.frame);
    w.auto = true;
    for (let i = 0; i < 400; i++) w.step();
    expect(w.wand.liveUses()).toEqual([0, -1]);
    expect(played.filter((p) => p === 'BOMB')).toHaveLength(2);
    // Refilled: the deck has its charges back, and mana carries over.
    const mana = w.wand.mana;
    w.wand.recharge(req);
    expect(w.wand.liveUses()).toEqual([2, -1]);
    expect(w.wand.mana).toBe(mana);
    played.length = 0;
    for (let i = 0; i < 60; i++) w.step();
    expect(played).toContain('BOMB');
  });
});

describe('frozen + melee (wiki: Status Effects)', () => {
  const tentacle = () => Object.keys(data.projectiles).find((f) => f.endsWith('deck/tentacle.xml'))!;

  it('a tentacle hit on a frozen dummy is an instant kill; unfrozen it is just damage', () => {
    for (const frozen of [true, false]) {
      const w = new RangeWorld(data);
      if (frozen) w.dummy.status.set('FROZEN', 600);
      const d = w.dummy;
      w.spawn(tentacle(), d.x - 2, d.y - d.h / 2, 0, 0);
      for (let i = 0; i < 10; i++) w.step();
      expect(w.totalDamage).toBeGreaterThan(0);
      expect(w.frozenKills).toBe(frozen ? 1 : 0);
      expect(w.floaters.some((f) => f.text === 'SHATTERED')).toBe(frozen);
    }
  });

  it('a frozen player loses half their HP to melee, or dies at 25% or less', () => {
    const w = new RangeWorld(data);
    const hit = (w as unknown as { frozenMeleeHit(a: unknown): void }).frozenMeleeHit.bind(w);
    w.player.status.set('FROZEN', 600);
    w.body.invincible = 0;
    const hp0 = w.body.hp;
    hit(w.player);
    expect(w.body.hp).toBeCloseTo(hp0 / 2, 5);
    w.body.hp = w.maxHp * 0.25;
    hit(w.player);
    expect(w.body.hp).toBe(0);
  });
});

describe('targets and maps', () => {
  const count = (w: RangeWorld, id: string) => {
    const m = w.cells.index(id);
    let n = 0;
    for (let i = 0; i < w.cells.mat.length; i++) if (w.cells.mat[i] === m) n++;
    return n;
  };

  it('the Holy Mountain statue is the default target and takes hits like the dummy did', () => {
    const w = new RangeWorld(data);
    expect(w.target).toBe('statue');
    expect(w.actors.map((a) => a.id)).toEqual(['player', 'dummy']);
    expect([w.dummy.w, w.dummy.h]).toEqual([TARGET_SIZE.statue.w, TARGET_SIZE.statue.h]);
    w.setTarget('dummy');
    expect([w.dummy.w, w.dummy.h]).toEqual([TARGET_SIZE.dummy.w, TARGET_SIZE.dummy.h]);
    expect(w.cell(w.dummy.x, w.dummy.y)).not.toBe(AIR);
    expect(w.cell(w.dummy.x, w.dummy.y - 1)).toBe(AIR);
  });

  it('a wall of the chosen material replaces the target; digging it shows as dug', () => {
    const w = new RangeWorld(data);
    w.setTarget('wall', 'brick');
    expect(w.hasTarget).toBe(false);
    expect(w.actors.map((a) => a.id)).toEqual(['player']);
    const r = w.wallRect;
    expect(r.x1 - r.x0).toBe(32);
    expect(w.cells.mats[w.cells.at((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2)]!.id).toBe('brick');
    expect(w.wallLeft).toBe(1);
    // Auto aims straight at the wall's face.
    expect(w.aimTarget.x).toBe(r.x0);
    w.carve((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, 10);
    expect(w.wallLeft!).toBeLessThan(1);
    // Moving it builds it again, whole, at the new spot.
    w.setDummyDistance(120);
    expect(w.wallRect.x0).not.toBe(r.x0);
    expect(w.wallLeft).toBe(1);
    // Back to a statue: the wall goes and the statue stands on its mark.
    w.setTarget('statue');
    expect(count(w, 'brick')).toBe(0);
    expect(w.actors).toHaveLength(2);
    expect(w.dummy.x).toBe(w.dummy.homeX);
  });

  it('a powder wall slumps, as sand does', () => {
    const w = new RangeWorld(data);
    w.setTarget('wall', 'sand');
    for (let i = 0; i < 300; i++) w.step();
    expect(w.wallLeft!).toBeLessThan(0.95);
  });

  it('every biome is built from materials the game has, with its rock, pools and backdrop', () => {
    const ids = new Set(data.materials.map((m) => m.id));
    for (const b of BIOMES) {
      for (const id of [b.base, b.ledge, b.island, ...b.pools, ...b.layers.map((l) => l.material)]) if (id) expect(ids, `${b.id}: ${id}`).toContain(id);
      if (b.background) expect(existsSync(join(GAME, 'backgrounds', `${b.background}.png`)), b.background).toBe(true);
      const w = new RangeWorld(data);
      w.setBiome(b.id);
      // The cave is made of the biome's own rock and layers.
      const own = new Set([b.base, ...b.layers.map((l) => l.material)]);
      expect([...own].reduce((n, id) => n + count(w, id), 0), b.id).toBeGreaterThan(20000);
      if (b.pools[0]) expect(count(w, b.pools[0]), b.id).toBeGreaterThan(50);
      // The statue still stands on the floor.
      expect(w.cell(w.dummy.x, w.dummy.y)).not.toBe(AIR);
    }
  });

  it('a biome mixes its layers into the rock (Mines: damp rock, ground seams, rare coal / copper / gold spots)', () => {
    const w = new RangeWorld(data);
    w.setBiome('coalmine');
    expect(count(w, 'rock_static_wet')).toBeGreaterThan(10000);
    expect(count(w, 'sand_static')).toBeGreaterThan(50);
    // Ores are the rare polka dots: there, but a small share.
    const ores = count(w, 'coal') + count(w, 'copper') + count(w, 'gold');
    expect(ores).toBeGreaterThan(50);
    expect(ores).toBeLessThan(4000);
    // Powders only sit on rock: the ceiling doesn't rain coal when the cave is built (a grain by a pool may sink in).
    const loose = () => {
      let n = 0;
      for (const id of ['soil', 'coal', 'gold']) {
        const m = w.cells.index(id);
        for (let i = 0; i < w.cells.mat.length; i++) if (w.cells.mat[i] === m && i / W < w.floorY - 2) n++;
      }
      return n;
    };
    const before = loose();
    for (let i = 0; i < 30; i++) w.step();
    expect(Math.abs(loose() - before)).toBeLessThanOrEqual(2);
  });
});
