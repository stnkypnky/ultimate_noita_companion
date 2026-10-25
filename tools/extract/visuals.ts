// What the test range needs to draw and move projectiles and modifier effects, read from their entity XML.
import { basename } from 'node:path';
import sharp from 'sharp';
import type { EntityVisual } from '../../src/data/types.ts';
import { comp, comps, num, parseXml, type El, type EntityLoader } from './entity.ts';
import type { Wak } from './wak.ts';

const MAX_SPRITE = 64;

type SpriteFrame = { png: Buffer; ox: number; oy: number };

/** First frame of a SpriteComponent's image (.png or <Sprite> .xml), with its pivot. */
async function spriteFrame(wak: Wak, sc: El): Promise<SpriteFrame | null> {
  const file = sc.attrs.image_file ?? '';
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

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

export async function collectVisuals(files: string[], wak: Wak, loader: EntityLoader, materialColor: Map<string, string>) {
  const visuals: Record<string, Omit<EntityVisual, 'sprite'> & { sprite?: Omit<NonNullable<EntityVisual['sprite']>, 'icon'> & { key: string } }> = {};
  const images: { key: string; png: Buffer }[] = [];

  for (const file of files) {
    const e = loader.load(file);
    if (!e) continue;
    const v: (typeof visuals)[string] = {};

    const sc = comps(e, 'SpriteComponent').find((s) => s.attrs._enabled !== '0' && s.attrs.image_file && !s.attrs.image_file.includes('/ui_gfx/'));
    // Physics projectiles (bombs, etc.) are drawn from their body shape image, centred.
    const body = comp(e, 'PhysicsImageShapeComponent')?.attrs.image_file;
    const shape: El | undefined = sc ?? (body ? { tag: 'SpriteComponent', attrs: { image_file: body }, children: [] } : undefined);
    if (shape) {
      const frame = await spriteFrame(wak, shape);
      if (frame && !sc) {
        const m = await sharp(frame.png).metadata();
        frame.ox = (m.width ?? 0) / 2;
        frame.oy = (m.height ?? 0) / 2;
      }
      if (frame) {
        images.push({ key: file, png: frame.png });
        v.sprite = { key: file, ox: frame.ox, oy: frame.oy, additive: shape.attrs.additive === '1' || shape.attrs.emissive === '1' };
      }
    }

    // Trail: the material its particle emitter sprays, preferring the dense trail emitter.
    const emitters = comps(e, 'ParticleEmitterComponent').filter((p) => p.attrs.emitted_material_name);
    const trail = emitters.find((p) => p.attrs.is_trail === '1') ?? emitters[0];
    const trailColor = trail && materialColor.get(trail.attrs.emitted_material_name!);
    if (trail && trailColor) v.trail = { color: trailColor.slice(0, 7), count: Math.max(1, num(trail.attrs.count_max, 1)) };

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
    if (eater) v.cellEater = { radius: num(eater.attrs.radius, 10) };

    const scripts = comps(e, 'LuaComponent')
      .filter((l) => l.attrs.script_source_file)
      .map((l) => ({
        script: basename(l.attrs.script_source_file!, '.lua'),
        every: num(l.attrs.execute_every_n_frame, 1),
        onAdded: l.attrs.execute_on_added === '1',
        times: num(l.attrs.execute_times, 0),
      }));
    if (scripts.length) v.scripts = scripts;

    const pc = comp(e, 'ProjectileComponent');
    if (pc) {
      const ex = comp(pc, 'config_explosion');
      v.physics = {
        bounceEnergy: num(pc.attrs.bounce_energy, 0.5),
        collideWithWorld: pc.attrs.collide_with_world !== '0',
        rotate: pc.attrs.velocity_sets_rotation !== '0',
        dieOnLowVelocity: pc.attrs.die_on_low_velocity === '1',
        ...(ex ? { digs: ex.attrs.hole_enabled === '1', digDurability: num(ex.attrs.max_durability_to_destroy, 0) } : {}),
      };
    }

    if (Object.keys(v).length) visuals[file] = v;
  }
  return { visuals, images };
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
