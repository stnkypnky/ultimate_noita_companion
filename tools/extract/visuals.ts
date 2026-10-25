// What the test range needs to draw and move projectiles and modifier effects, read from their entity XML.
import { basename } from 'node:path';
import sharp from 'sharp';
import type { EntityVisual } from '../../src/data/types.ts';
import { comp, comps, num, parseXml, type El, type EntityLoader } from './entity.ts';
import type { Wak } from './wak.ts';

const MAX_SPRITE = 64;
const HP = 25;

type SpriteFrame = { png: Buffer; ox: number; oy: number };
/** A material's colour and its texture's path inside data.wak. */
export type MaterialLook = { color: string; texture?: string };

/** First frame of a SpriteComponent's image (.png or <Sprite> .xml), with its pivot. */
async function spriteFrame(wak: Wak, sc: El): Promise<SpriteFrame | null> {
  const file = String(sc.attrs.image_file ?? '');
  if (!file || !wak.has(file)) return null;
  let png: Buffer;
  let ox = num(sc.attrs.offset_x, 0);
  let oy = num(sc.attrs.offset_y, 0);
  if (file.endsWith('.png')) {
    png = wak.bytes(file);
  } else if (file.endsWith('.xml')) {
    const sprite = parseXml(wak.text(file)).find((e) => e.tag === 'Sprite');
    const img = sprite?.attrs.filename;
    if (!sprite || !img || !wak.has(img)) return null;
    ox = num(sprite.attrs.offset_x, ox);
    oy = num(sprite.attrs.offset_y, oy);
    const anims = comps(sprite, 'RectAnimation');
    const rect = anims.find((a) => a.attrs.name === sprite.attrs.default_animation) ?? anims[0];
    png = wak.bytes(img);
    if (rect) {
      const meta = await sharp(png).metadata();
      const w = num(rect.attrs.frame_width, meta.width ?? 1);
      const h = num(rect.attrs.frame_height, meta.height ?? 1);
      const left = num(rect.attrs.pos_x, 0);
      const top = num(rect.attrs.pos_y, 0);
      if (left + w <= (meta.width ?? 0) && top + h <= (meta.height ?? 0)) png = await sharp(png).extract({ left, top, width: w, height: h }).png().toBuffer();
    }
  } else {
    return null;
  }
  const meta = await sharp(png).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) return null;
  if (w > MAX_SPRITE || h > MAX_SPRITE) {
    const k = MAX_SPRITE / Math.max(w, h);
    png = await sharp(png).resize(Math.round(w * k), Math.round(h * k), { kernel: 'nearest' }).png().toBuffer();
    ox *= k;
    oy *= k;
  }
  return { png, ox, oy };
}

/**
 * Physics bodies (bombs) are drawn by the game as their material poured into a shape mask.
 * The mask image's colours are just a shape key, so paint the material's texture (or colour) into it.
 */
async function materialShape(wak: Wak, maskFile: string, look: MaterialLook | undefined): Promise<SpriteFrame | null> {
  if (!wak.has(maskFile)) return null;
  const { data, info } = await sharp(wak.bytes(maskFile)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let tex: { data: Buffer; w: number; h: number } | null = null;
  const texFile = look?.texture;
  if (texFile && wak.has(texFile)) {
    const t = await sharp(wak.bytes(texFile)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    tex = { data: t.data, w: t.info.width, h: t.info.height };
  }
  const hex = (look?.color ?? '#606060ff').slice(1);
  const base = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      if (!data[i + 3]) continue;
      // edge pixels slightly lighter, like the game's lit rims
      const edge = y === 0 || !data[((y - 1) * info.width + x) * 4 + 3] ? 1.25 : 1;
      for (let c = 0; c < 3; c++) {
        const v = tex ? tex.data[((y % tex.h) * tex.w + (x % tex.w)) * 4 + c]! : base[c]!;
        data[i + c] = Math.min(255, v * edge);
      }
      data[i + 3] = 255;
    }
  }
  const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  return { png, ox: info.width / 2, oy: info.height / 2 };
}

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
const ENTITY_REF = /data\/entities\/[\w/]+\.xml/g;

/** Every Lua source an entity runs (LuaComponent script_* attributes). */
function luaFiles(e: El): string[] {
  return comps(e, 'LuaComponent').flatMap((l) => Object.entries(l.attrs).filter(([k, v]) => k.startsWith('script_') && String(v).endsWith('.lua')).map(([, v]) => String(v)));
}

/**
 * Visual/behaviour data for the given entities, plus every projectile/effect entity they spawn
 * (found in their Lua scripts and orbit-type variables), so the range can spawn those too.
 */
export async function collectVisuals(roots: string[], wak: Wak, loader: EntityLoader, materials: Map<string, MaterialLook>) {
  const visuals: Record<string, Omit<EntityVisual, 'sprite'> & { sprite?: Omit<NonNullable<EntityVisual['sprite']>, 'icon'> & { key: string } }> = {};
  const images: { key: string; png: Buffer }[] = [];
  const queue = [...roots];
  const seen = new Set<string>();
  const color = (m: string | undefined) => (m ? materials.get(m)?.color.slice(0, 7) : undefined);

  while (queue.length) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const e = loader.load(file);
    if (!e) continue;
    const v: (typeof visuals)[string] = {};

    // Follow what this entity spawns.
    for (const l of luaFiles(e)) {
      if (!wak.has(l)) continue;
      for (const m of wak.text(l).matchAll(ENTITY_REF)) {
        const ref = m[0];
        if (!ref.includes('/particles/') && !seen.has(ref) && wak.has(ref)) queue.push(ref);
      }
    }
    const vars: Record<string, string> = {};
    for (const vs of comps(e, 'VariableStorageComponent')) {
      const name = vs.attrs.name;
      const val = vs.attrs.value_string ?? vs.attrs.value_float ?? vs.attrs.value_int;
      if (name && val !== undefined) vars[name] = String(val);
    }
    if (vars.orbit_projectile_type && vars.orbit_projectile_type !== 'orbit_larpa') queue.push(`data/entities/misc/${vars.orbit_projectile_type}.xml`);
    if (vars.orbit_projectile_type) v.vars = { orbit_projectile_type: vars.orbit_projectile_type };

    // Sprite: a SpriteComponent, or a physics body's material-filled shape.
    const sc = comps(e, 'SpriteComponent').find((s) => s.attrs._enabled !== '0' && s.attrs.image_file && !String(s.attrs.image_file).includes('/ui_gfx/'));
    const shape = comp(e, 'PhysicsImageShapeComponent');
    let frame: SpriteFrame | null = null;
    let additive = false;
    if (sc) {
      frame = await spriteFrame(wak, sc);
      additive = sc.attrs.additive === '1' || sc.attrs.emissive === '1';
    } else if (shape?.attrs.image_file) {
      frame = await materialShape(wak, shape.attrs.image_file, materials.get(shape.attrs.material ?? ''));
    }
    if (frame) {
      images.push({ key: file, png: frame.png });
      v.sprite = { key: file, ox: frame.ox, oy: frame.oy, additive };
    }

    const emitters = comps(e, 'ParticleEmitterComponent').filter((p) => p.attrs.emitted_material_name && p.attrs._enabled !== '0');
    // Prefer the cosmetic trail emitter: that's what you see streaming behind the projectile.
    const trail = emitters.find((p) => p.attrs.is_trail === '1') ?? emitters.find((p) => p.attrs.emit_cosmetic_particles === '1') ?? emitters[0];
    const trailColor = color(trail?.attrs.emitted_material_name);
    if (trail && trailColor) v.trail = { color: trailColor, count: Math.max(1, num(trail.attrs.count_max, 1)) };

    const light = comp(e, 'LightComponent');
    if (light && light.attrs._enabled !== '0') {
      v.light = { color: `#${hex2(num(light.attrs.r, 255))}${hex2(num(light.attrs.g, 255))}${hex2(num(light.attrs.b, 255))}`, radius: num(light.attrs.radius, 0) };
    }

    const homing = comp(e, 'HomingComponent');
    if (homing) {
      v.homing = {
        coeff: num(homing.attrs.homing_targeting_coeff, 160),
        velocityMultiplier: num(homing.attrs.homing_velocity_multiplier, 0.9),
        detectDistance: num(homing.attrs.detect_distance, 150),
        rotateOnly: homing.attrs.just_rotate_towards_target === '1',
        maxTurnRate: num(homing.attrs.max_turn_rate, 0.05),
        targetShooter: homing.attrs.target_who_shot === '1',
      };
    }

    const sine = comp(e, 'SineWaveComponent');
    if (sine) v.sine = { freq: num(sine.attrs.sinewave_freq, 1), m: num(sine.attrs.sinewave_m, 0.6) };

    const eater = comp(e, 'CellEaterComponent');
    if (eater) v.cellEater = { radius: num(eater.attrs.radius, 10), probability: num(eater.attrs.eat_probability, 100) };

    const scripts = comps(e, 'LuaComponent')
      .filter((l) => l.attrs.script_source_file)
      .map((l) => ({
        script: basename(String(l.attrs.script_source_file), '.lua'),
        every: num(l.attrs.execute_every_n_frame, 1),
        onAdded: l.attrs.execute_on_added === '1',
        times: l.attrs.remove_after_executed === '1' ? 1 : num(l.attrs.execute_times, 0),
      }));
    if (scripts.length) v.scripts = scripts;

    const laser = comp(e, 'LaserEmitterComponent');
    const lc = comp(laser, 'laser');
    if (laser && lc) {
      v.laser = {
        maxLength: num(lc.attrs.max_length, 64),
        beamRadius: num(lc.attrs.beam_radius, 1),
        damage: num(lc.attrs.damage_to_entities, 0) * HP,
        angleAdd: num(laser.attrs.laser_angle_add_rad, 0),
        digDurability: num(lc.attrs.max_cell_durability_to_destroy, 0),
        color: color(lc.attrs.beam_particle_type) ?? '#34bfff',
        emitting: laser.attrs.is_emitting !== '0',
      };
    }

    const area = comp(e, 'AreaDamageComponent');
    if (area) {
      v.areaDamage = {
        minX: num(area.attrs['aabb_min.x'], -8),
        minY: num(area.attrs['aabb_min.y'], -8),
        maxX: num(area.attrs['aabb_max.x'], 8),
        maxY: num(area.attrs['aabb_max.y'], 8),
        damage: num(area.attrs.damage_per_frame, 10) * HP,
        every: Math.max(1, num(area.attrs.update_every_n_frame, 1)),
        enabled: area.attrs._enabled !== '0',
      };
    }

    const lightning = comp(e, 'LightningComponent');
    if (lightning) {
      const ex = comp(lightning, 'config_explosion');
      v.lightning = {
        isProjectile: lightning.attrs.is_projectile === '1',
        radius: num(ex?.attrs.explosion_radius, 0),
        damage: num(ex?.attrs.damage, 0) * HP,
        color: color(ex?.attrs.spark_material) ?? '#9fd8ff',
      };
    }

    const arc = comp(e, 'ArcComponent');
    if (arc) {
      const lightningArc = arc.attrs.type === 'LIGHTNING' || !!lightning;
      v.arc = { kind: lightningArc ? 'lightning' : 'material', color: lightningArc ? '#9fd8ff' : (color(arc.attrs.material) ?? '#ffffff'), material: arc.attrs.material || undefined, lifetime: num(arc.attrs.lifetime, 60) };
    }

    if (comp(e, 'TeleportProjectileComponent')) v.teleport = { minDistanceFromWall: num(comp(e, 'TeleportProjectileComponent')!.attrs.min_distance_from_wall, 16) };

    const hit = comp(e, 'HitEffectComponent');
    if (hit?.attrs.effect_hit) v.hitEffect = { effect: hit.attrs.effect_hit, ...(hit.attrs.value_string ? { entity: hit.attrs.value_string } : {}) };

    const body = comp(e, 'PhysicsBodyComponent');
    if (body) v.physicsBody = { throwCoeff: num(comp(e, 'PhysicsThrowableComponent')?.attrs.throw_force_coeff, 1) };

    if (e.attrs.tags) v.tags = String(e.attrs.tags).split(',').filter(Boolean);

    const pc = comp(e, 'ProjectileComponent');
    if (pc) {
      const ex = comp(pc, 'config_explosion');
      v.physics = {
        bounceEnergy: num(pc.attrs.bounce_energy, 0.5),
        collideWithWorld: pc.attrs.collide_with_world !== '0',
        rotate: pc.attrs.velocity_sets_rotation !== '0',
        dieOnLowVelocity: pc.attrs.die_on_low_velocity === '1',
        streak: pc.attrs.velocity_sets_scale === '1',
        shooterGrace: num(pc.attrs.collide_with_shooter_frames, -1),
        spareShooter: pc.attrs.explosion_dont_damage_shooter === '1',
        ...(num(pc.attrs.ground_penetration_coeff, 0) > 0
          ? { groundPenetration: { coeff: num(pc.attrs.ground_penetration_coeff, 0), maxDurability: num(pc.attrs.ground_penetration_max_durability_to_destroy, 0) } }
          : {}),
        ...(ex
          ? {
              digs: ex.attrs.hole_enabled !== '0',
              digDurability: num(ex.attrs.max_durability_to_destroy, 0),
              explosionColor: color(ex.attrs.spark_material) ?? color(ex.attrs.create_cell_material),
            }
          : {}),
      };
    }

    if (Object.keys(v).length) visuals[file] = v;
  }
  return { visuals, images, entities: [...seen] };
}

/** The game's own target dummy and the player sprite, for the range backdrop. */
export async function rangeProps(wak: Wak) {
  const out: Record<string, { png: Buffer; ox: number; oy: number }> = {};
  for (const [key, file] of [
    ['dummy', 'data/props_gfx/dummy_target.xml'],
    ['player', 'data/enemies_gfx/player.xml'],
  ] as const) {
    const f = await spriteFrame(wak, { tag: 'SpriteComponent', attrs: { image_file: wak.has(file) ? file : file.replace('.xml', '.png') }, children: [] });
    if (f) out[key] = f;
  }
  return out;
}
