// What the test range needs to draw and move projectiles and modifier effects, read from their entity XML.
import { basename } from 'node:path';
import sharp from 'sharp';
import type { Emitter, EntityVisual, ExplosionVisual, SpriteLayer } from '../../src/data/types.ts';
import { comp, comps, num, parseXml, type El, type EntityLoader } from './entity.ts';
import type { Wak } from './wak.ts';

const MAX_SPRITE = 64;
/** Animation frames are kept up to this size; bigger ones are stored shrunk and drawn scaled back up. */
const MAX_FRAME = 128;
const MAX_FRAMES = 32;
const HP = 25;

type SpriteFrame = { png: Buffer; ox: number; oy: number };
/** A material's colour, whether it glows (fire-type cells: sparks, plasma) and its texture's path inside data.wak. */
export type MaterialLook = { color: string; glow?: boolean; texture?: string };

/** A sprite layer whose frames are keys into the atlas images collected alongside. */
export type LayerOut = Omit<SpriteLayer, 'frames'> & { frames: string[] };
export type ExplosionOut = Omit<ExplosionVisual, 'sprite'> & { sprite?: LayerOut };

/** Files named like `muzzle_0$[1-5].png` are picked at random by the game; use the first. */
const variant = (f: string) => f.replace(/\$\[(\d+)-\d+\]/g, '$1');

/**
 * Every frame of a sprite's animation (the named one, else its default), as atlas images under stable keys,
 * so two entities using the same sprite share frames.
 */
async function spriteLayer(
  wak: Wak,
  imageFile: string,
  opts: { anim?: string; ox?: number; oy?: number; additive?: boolean; emissive?: boolean; alpha?: number; sx?: number; sy?: number },
  images: Map<string, Buffer>,
): Promise<LayerOut | null> {
  const file = variant(imageFile);
  if (!file || !wak.has(file)) return null;
  let ox = opts.ox ?? 0;
  let oy = opts.oy ?? 0;
  let pngs: Buffer[] = [];
  let wait = 0.1;
  let loop = true;
  let keyBase = file;
  if (file.endsWith('.png')) {
    pngs = [wak.bytes(file)];
  } else if (file.endsWith('.xml')) {
    const sprite = parseXml(wak.text(file)).find((e) => e.tag === 'Sprite');
    const img = variant(sprite?.attrs.filename ?? '');
    if (!sprite || !img || !wak.has(img)) return null;
    ox = num(sprite.attrs.offset_x, ox);
    oy = num(sprite.attrs.offset_y, oy);
    const anims = comps(sprite, 'RectAnimation');
    const rect = (opts.anim && anims.find((a) => a.attrs.name === opts.anim)) || anims.find((a) => a.attrs.name === sprite.attrs.default_animation) || anims[0];
    const sheet = wak.bytes(img);
    if (!rect) {
      pngs = [sheet];
    } else {
      const meta = await sharp(sheet).metadata();
      const fw = num(rect.attrs.frame_width, meta.width ?? 1);
      const fh = num(rect.attrs.frame_height, meta.height ?? 1);
      const shrink = rect.attrs.shrink_by_one_pixel === '1' ? 1 : 0;
      const count = Math.min(MAX_FRAMES, Math.max(1, num(rect.attrs.frame_count, 1)));
      const perRow = Math.max(1, num(rect.attrs.frames_per_row, count));
      const px = num(rect.attrs.pos_x, 0);
      const py = num(rect.attrs.pos_y, 0);
      if (rect.attrs.has_offset === '1') {
        ox = num(rect.attrs.offset_x, ox);
        oy = num(rect.attrs.offset_y, oy);
      }
      for (let i = 0; i < count; i++) {
        const left = px + (i % perRow) * fw;
        const top = py + Math.floor(i / perRow) * fh;
        const width = fw - shrink;
        const height = fh - shrink;
        if (width < 1 || height < 1 || left + width > (meta.width ?? 0) || top + height > (meta.height ?? 0)) break;
        pngs.push(await sharp(sheet).extract({ left, top, width, height }).png().toBuffer());
      }
      wait = num(rect.attrs.frame_wait, 0.1);
      loop = rect.attrs.loop !== '0';
      keyBase = `${file}#${rect.attrs.name ?? ''}`;
    }
  } else {
    return null;
  }
  if (!pngs.length) return null;
  const meta = await sharp(pngs[0]).metadata();
  const big = Math.max(meta.width ?? 1, meta.height ?? 1);
  const k = big > MAX_FRAME ? MAX_FRAME / big : 1;
  const frames: string[] = [];
  for (let i = 0; i < pngs.length; i++) {
    const key = `${keyBase}|${i}`;
    if (!images.has(key)) {
      let png = pngs[i]!;
      if (k < 1) {
        const m = await sharp(png).metadata();
        png = await sharp(png).resize(Math.max(1, Math.round((m.width ?? 1) * k)), Math.max(1, Math.round((m.height ?? 1) * k)), { kernel: 'nearest' }).png().toBuffer();
      }
      images.set(key, png);
    }
    frames.push(key);
  }
  return {
    frames,
    wait,
    loop,
    ox,
    oy,
    additive: !!opts.additive,
    emissive: !!opts.emissive,
    alpha: opts.alpha ?? 1,
    scale: 1 / k,
    ...(opts.sx !== undefined && opts.sx !== 1 ? { sx: opts.sx } : {}),
    ...(opts.sy !== undefined && opts.sy !== 1 ? { sy: opts.sy } : {}),
  };
}

const pair = (a: Record<string, string>, k: string, fx: number, fy: number): [number, number] => [num(a[`${k}.x`], fx), num(a[`${k}.y`], fy)];

/** ParticleEmitterComponent, with the documented defaults for anything the XML leaves out. */
function emitter(p: El, look: (m: string) => MaterialLook | undefined): Emitter | null {
  const a = p.attrs;
  const material = a.emitted_material_name;
  if (!material || a._enabled === '0' || a.image_animation_file) return null;
  const l = look(material);
  const col = l?.color ?? '#ffffffff';
  const customAlpha = num(a.custom_alpha, -1);
  const areaMax = num(a['area_circle_radius.max'], 0);
  return {
    material,
    color: col.slice(0, 7),
    alpha: customAlpha >= 0 ? customAlpha : parseInt(col.slice(7, 9) || 'ff', 16) / 255,
    glow: !!l?.glow,
    real: a.create_real_particles === '1' || a.emit_real_particles === '1',
    countMin: num(a.count_min, 5),
    countMax: num(a.count_max, num(a.count_min, 5)),
    intervalMin: num(a.emission_interval_min_frames, 5),
    intervalMax: num(a.emission_interval_max_frames, 10),
    lifetimeMin: num(a.lifetime_min, 5),
    lifetimeMax: num(a.lifetime_max, 10),
    offset: pair(a, 'offset', 0, 0),
    posMin: [num(a.x_pos_offset_min, 0), num(a.y_pos_offset_min, 0)],
    posMax: [num(a.x_pos_offset_max, 0), num(a.y_pos_offset_max, 0)],
    velMin: [num(a.x_vel_min, 0), num(a.y_vel_min, 0)],
    velMax: [num(a.x_vel_max, 0), num(a.y_vel_max, 0)],
    gravity: pair(a, 'gravity', 0, 100),
    airflow: num(a.airflow_force, 0),
    fade: a.fade_based_on_lifetime === '1',
    trail: a.is_trail === '1',
    trailGap: num(a.trail_gap, 0),
    ...(areaMax > 0 ? { area: [num(a['area_circle_radius.min'], 0), areaMax] as [number, number] } : {}),
    awayFromCenter: num(a.velocity_always_away_from_center, 0) !== 0,
    long: a.draw_as_long === '1',
    emitting: a.is_emitting !== '0',
    delayFrames: num(a.delay_frames, 0),
    lifetimeFrames: num(a.emitter_lifetime_frames, -1),
    friction: num(a.friction, 0),
  };
}

/** config_explosion: the blast's sprite, sparks, light and what it leaves behind. */
async function explosionVisual(wak: Wak, ex: El, look: (m: string) => MaterialLook | undefined, images: Map<string, Buffer>): Promise<ExplosionOut> {
  const a = ex.attrs;
  const sprite = a.explosion_sprite
    ? await spriteLayer(wak, a.explosion_sprite, { additive: a.explosion_sprite_additive === '1', emissive: a.explosion_sprite_emissive === '1' }, images)
    : null;
  const sparkMat = a.spark_material || 'spark';
  const sl = look(sparkMat);
  const sparks = a.sparks_enabled === '0' ? null : { min: num(a.sparks_count_min, 20), max: num(a.sparks_count_max, 30), color: (sl?.color ?? '#ff6024').slice(0, 7), glow: sl?.glow ?? true };
  const lightOn = a.light_enabled !== '0';
  return {
    ...(sprite ? { sprite } : {}),
    randomRotation: a.explosion_sprite_random_rotation === '1',
    sparks,
    ...(lightOn
      ? { light: { color: `#${hex2(num(a.light_r, 255))}${hex2(num(a.light_g, 200))}${hex2(num(a.light_b, 120))}`, fadeTime: num(a.light_fade_time, 0.25) } }
      : {}),
    cameraShake: num(a.camera_shake, 0),
    ...(a.create_cell_material ? { cell: { material: a.create_cell_material, probability: num(a.create_cell_probability, 0) } } : {}),
    entities: (a.load_this_entity ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    rayEnergy: num(a.ray_energy, 0),
    maxDurability: num(a.max_durability_to_destroy, 0),
    hole: a.hole_enabled !== '0',
  };
}

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
  const visuals: Record<string, Omit<EntityVisual, 'sprites' | 'explosion'> & { sprites?: LayerOut[]; explosion?: ExplosionOut }> = {};
  const images = new Map<string, Buffer>();
  const queue = [...roots];
  const seen = new Set<string>();
  const color = (m: string | undefined) => (m ? materials.get(m)?.color.slice(0, 7) : undefined);
  const look = (m: string) => materials.get(m);
  /** Effect entities (muzzle flashes, blast leftovers) are drawn too, so queue them. */
  const follow = (ref: string | undefined) => {
    const f = ref && variant(ref);
    if (f && !seen.has(f) && wak.has(f)) queue.push(f);
  };

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

    // Sprites: every enabled SpriteComponent (drawn back to front by z_index), or a physics body's material-filled shape.
    const layers: { z: number; layer: LayerOut }[] = [];
    for (const sc of comps(e, 'SpriteComponent')) {
      const a = sc.attrs;
      if (a._enabled === '0' || a.visible === '0' || a.is_text_sprite === '1' || !a.image_file || a.image_file.includes('/ui_gfx/')) continue;
      const special = a.has_special_scale === '1';
      const layer = await spriteLayer(
        wak,
        a.image_file,
        {
          anim: a.rect_animation || undefined,
          ox: num(a.offset_x, 0),
          oy: num(a.offset_y, 0),
          additive: a.additive === '1',
          emissive: a.emissive === '1',
          alpha: num(a.alpha, 1),
          ...(special ? { sx: num(a.special_scale_x, 1), sy: num(a.special_scale_y, 1) } : {}),
        },
        images,
      );
      if (layer) layers.push({ z: num(a.z_index, 0), layer });
      if (a.kill_entity_after_finished === '1') v.killAfterAnim = true;
    }
    const shape = comp(e, 'PhysicsImageShapeComponent');
    if (!layers.length && shape?.attrs.image_file) {
      const f = await materialShape(wak, shape.attrs.image_file, materials.get(shape.attrs.material ?? ''));
      if (f) {
        images.set(`${file}|shape`, f.png);
        layers.push({ z: 0, layer: { frames: [`${file}|shape`], wait: 1, loop: true, ox: f.ox, oy: f.oy, additive: false, emissive: false, alpha: 1, scale: 1 } });
      }
    }
    // In Noita a lower z_index is nearer the viewer, so draw the highest first.
    if (layers.length) v.sprites = layers.sort((a, b) => b.z - a.z).map((l) => l.layer);

    const emitters = comps(e, 'ParticleEmitterComponent')
      .map((p) => emitter(p, look))
      .filter((p): p is Emitter => !!p);
    if (emitters.length) v.emitters = emitters;
    // The main trail colour, for effects that only need one (beams, chain-bolt hops).
    const trail = emitters.find((p) => p.trail) ?? emitters[0];
    if (trail) v.trail = { color: trail.color, count: Math.max(1, trail.countMax) };

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

    const lifetime = comp(e, 'LifetimeComponent');
    if (lifetime) v.lifetime = num(lifetime.attrs.lifetime, 60);

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
    // The blast: from the projectile, a lightning strike or a plain ExplosionComponent (bounce explosions).
    const blast = comp(pc, 'config_explosion') ?? comp(lightning, 'config_explosion') ?? comp(comp(e, 'ExplosionComponent'), 'config_explosion');
    if (blast) {
      v.explosion = await explosionVisual(wak, blast, look, images);
      v.explosion.entities.forEach(follow);
    }
    if (pc?.attrs.muzzle_flash_file) {
      v.muzzle = variant(pc.attrs.muzzle_flash_file);
      follow(v.muzzle);
    }
    const flash = num(pc?.attrs.shoot_light_flash_radius, 0);
    if (pc && flash > 0) {
      v.shootLight = { radius: flash, color: `#${hex2(num(pc.attrs.shoot_light_flash_r, 255))}${hex2(num(pc.attrs.shoot_light_flash_g, 180))}${hex2(num(pc.attrs.shoot_light_flash_b, 150))}` };
    }
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
  return { visuals, images: [...images].map(([key, png]) => ({ key, png })), entities: [...seen] };
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
