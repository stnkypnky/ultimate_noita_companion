// What the test range needs to put the player in it: Mina's animations, arm and movement constants,
// the game's wand sprites (with grips and tips), the HUD icons and the mouse cursor.
import sharp from 'sharp';
import type { RangeAnim, RangeKit } from '../../src/data/types.ts';
import { buildAtlas } from './sprites.ts';
import { comp, comps, num, parseXml, type El } from './entity.ts';
import type { Wak } from './wak.ts';

type Raw = { data: Buffer; width: number; height: number };
const raw = async (png: Buffer): Promise<Raw> => {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
};
const rgbAt = (img: Raw, x: number, y: number) => {
  const i = (y * img.width + x) * 4;
  return img.data[i + 3] ? (img.data[i]! << 16) | (img.data[i + 1]! << 8) | img.data[i + 2]! : -1;
};

/** First pixel of a hotspot colour inside a frame rectangle, relative to the frame. */
function findHotspot(img: Raw, color: number, x0: number, y0: number, w: number, h: number): [number, number] | null {
  for (let y = y0; y < Math.min(img.height, y0 + h); y++) for (let x = x0; x < Math.min(img.width, x0 + w); x++) if (rgbAt(img, x, y) === color) return [x - x0, y - y0];
  return null;
}

const sprite = (wak: Wak, file: string) => parseXml(wak.text(file)).find((e) => e.tag === 'Sprite')!;
const entity = (wak: Wak, file: string) => parseXml(wak.text(file)).find((e) => e.tag === 'Entity')!;
const attrsOf = (e: El | undefined) => e?.attrs ?? {};

/** The `{ key = value, ... }` entries of data/scripts/gun/procedural/wands.lua. */
function wandTable(src: string) {
  return [...src.matchAll(/\{([^{}]*)\}/g)]
    .map((m) => Object.fromEntries([...m[1]!.matchAll(/(\w+)\s*=\s*("([^"]*)"|-?[\d.]+)/g)].map((kv) => [kv[1]!, kv[3] ?? Number(kv[2])])))
    .filter((w) => typeof w.file === 'string');
}

const ANIMS = ['stand', 'walk', 'jump_up', 'jump_fall', 'land', 'fly_idle', 'fly_move', 'knockback'];
const HUD_ICONS = { health: 'health', mana: 'mana', reload: 'reload', flying: 'jetpack', delay: 'fire_rate_wait' } as const;

export async function rangeKit(wak: Wak): Promise<{ kit: RangeKit; files: Record<string, Buffer> }> {
  const files: Record<string, Buffer> = {};

  // ----- Mina: sprite sheet, animations and the arm's root on every frame -----
  const ps = sprite(wak, 'data/enemies_gfx/player.xml');
  const sheet = wak.bytes(ps.attrs.filename!);
  const hot = await raw(wak.bytes(ps.attrs.hotspots_filename!));
  const armColor = parseInt(comps(ps, 'Hotspot').find((h) => h.attrs.name === 'right_arm_start')!.attrs.color!, 16);
  const anims: Record<string, RangeAnim> = {};
  for (const name of ANIMS) {
    const a = comps(ps, 'RectAnimation').find((r) => r.attrs.name === name);
    if (!a) continue;
    const w = num(a.attrs.frame_width, 12);
    const h = num(a.attrs.frame_height, 19);
    const count = num(a.attrs.frame_count, 1);
    const perRow = num(a.attrs.frames_per_row, 8);
    const x = num(a.attrs.pos_x, 0);
    const y = num(a.attrs.pos_y, 0);
    const arm: [number, number][] = [];
    for (let i = 0; i < count; i++) {
      const fx = x + (i % perRow) * w;
      const fy = y + Math.floor(i / perRow) * h;
      arm.push(findHotspot(hot, armColor, fx, fy, w, h) ?? arm[0] ?? [5, 9]);
    }
    anims[name] = { x, y, w, h, count, perRow, wait: num(a.attrs.frame_wait, 0.1), loop: a.attrs.loop !== '0', arm };
  }
  // Where the feet are: the lowest opaque row of the first standing frame.
  const img = await raw(sheet);
  const st = anims.stand!;
  let feet = st.h;
  outer: for (let yy = st.y + st.h - 1; yy >= st.y; yy--) for (let xx = st.x; xx < st.x + st.w; xx++) if (rgbAt(img, xx, yy) >= 0) { feet = yy - st.y + 1; break outer; }
  files['sprites/range_player_sheet.png'] = sheet;

  // ----- Arm (rotates to aim) with the hand the wand hangs from -----
  const as = sprite(wak, 'data/enemies_gfx/player_arm.xml');
  const ar = comps(as, 'RectAnimation').find((r) => r.attrs.name === 'default')!;
  const aw = num(ar.attrs.frame_width, 5);
  const ah = num(ar.attrs.frame_height, 5);
  const armHot = await raw(wak.bytes(as.attrs.hotspots_filename!));
  const handColor = parseInt(comps(as, 'Hotspot').find((h) => h.attrs.name === 'hand')!.attrs.color!, 16) & 0xffffff;
  const hand = findHotspot(armHot, handColor, num(ar.attrs.pos_x, 0), num(ar.attrs.pos_y, 0), aw, ah) ?? [aw - 1, 2];
  files['sprites/range_arm.png'] = await sharp(wak.bytes(as.attrs.filename!)).extract({ left: num(ar.attrs.pos_x, 0), top: num(ar.attrs.pos_y, 0), width: aw, height: ah }).png().toBuffer();

  // ----- Movement, flight and health from player_base.xml -----
  const pb = entity(wak, 'data/entities/player_base.xml');
  const cp = attrsOf(comp(pb, 'CharacterPlatformingComponent'));
  const cd = attrsOf(comp(pb, 'CharacterDataComponent'));
  const dm = attrsOf(comp(pb, 'DamageModelComponent'));
  const hb = attrsOf(comps(pb, 'HitboxComponent')[0]);

  // ----- Every wand sprite the game can give a wand, with grip and tip -----
  const table = wandTable(wak.text('data/scripts/gun/procedural/wands.lua')).filter((w) => wak.has(String(w.file)));
  const atlas = await buildAtlas(table.map((w) => ({ key: String(w.file), png: wak.bytes(String(w.file)) })), 40);
  files['sprites/range_wands.png'] = atlas.png;

  // ----- Status effects: what each effect entity does and for how long, with the game's indicator icon -----
  const gameEffect = (file: string) => {
    if (!wak.has(file)) return null;
    const e = parseXml(wak.text(file)).find((x) => x.tag === 'Entity');
    const g = comp(e, 'GameEffectComponent');
    return g ? { effect: g.attrs.effect ?? 'NONE', frames: num(g.attrs.frames, -1), stops: g.attrs.disable_movement === '1' } : null;
  };
  const iconOf = new Map<string, string>();
  for (const m of wak.text('data/scripts/status_effects/status_list.lua').matchAll(/\{([^{}]*)\}/g)) {
    const icon = /ui_icon\s*=\s*"([^"]+)"/.exec(m[1]!)?.[1];
    const ent = /effect_entity\s*=\s*"([^"]+)"/.exec(m[1]!)?.[1];
    // Built-in effects (ON_FIRE) have no entity; their id is the effect.
    const effect = ent ? gameEffect(ent)?.effect : /id\s*=\s*"([^"]+)"/.exec(m[1]!)?.[1];
    if (icon && effect && effect !== 'NONE' && effect !== 'CUSTOM' && !iconOf.has(effect) && wak.has(icon)) iconOf.set(effect, icon);
  }
  // Effects with no status_list entry (FROZEN, ELECTROCUTION) use the indicator of the same name.
  for (const f of wak.list('data/ui_gfx/status_indicators/')) {
    const effect = f.split('/').pop()!.replace('.png', '').toUpperCase();
    if (!iconOf.has(effect)) iconOf.set(effect, f);
  }
  const statusAtlas = await buildAtlas([...new Set(iconOf.values())].map((f) => ({ key: f, png: wak.bytes(f) })), 16);
  files['sprites/range_status.png'] = statusAtlas.png;
  const effects: RangeKit['effects'] = {};
  for (const f of wak.list('data/entities/misc/')) {
    if (!/\/effect_[\w]+\.xml$/.test(f)) continue;
    const g = gameEffect(f);
    if (!g) continue;
    const icon = iconOf.get(g.effect);
    effects[f.split('/').pop()!.replace('.xml', '')] = { ...g, ...(icon ? { icon: statusAtlas.rects.get(icon)! } : {}) };
  }

  for (const [key, name] of Object.entries(HUD_ICONS)) files[`sprites/hud_${key}.png`] = wak.bytes(`data/ui_gfx/hud/${name}.png`);
  files['sprites/range_cursor.png'] = wak.bytes('data/ui_gfx/mouse_cursor.png');
  const cursor = await sharp(files['sprites/range_cursor.png']).metadata();

  const kit: RangeKit = {
    player: {
      anims,
      pivot: [num(ps.attrs.offset_x, 6), num(ps.attrs.offset_y, 14)],
      feet,
      move: {
        runVelocity: num(cp.run_velocity, 154),
        accelX: num(cp.accel_x, 0.15),
        gravity: num(cp.pixel_gravity, 350),
        jumpVelocityY: num(cp.jump_velocity_y, -95),
        jumpVelocityX: num(cp.jump_velocity_x, 56),
        velocityMinX: num(cp.velocity_min_x, -57),
        velocityMaxX: num(cp.velocity_max_x, 57),
        velocityMinY: num(cp.velocity_min_y, -200),
        velocityMaxY: num(cp.velocity_max_y, 350),
        flyVelocityX: num(cp.fly_velocity_x, 52),
        flySpeedMaxUp: num(cp.fly_speed_max_up, 95),
        flySpeedMaxDown: num(cp.fly_speed_max_down, 85),
        flySpeedMult: num(cp.fly_speed_mult, 20),
        flySpeedChangeSpd: num(cp.fly_speed_change_spd, 0.25),
        climbOverY: num(cd.climb_over_y, 4),
      },
      flight: {
        timeMax: num(cd.fly_time_max, 3),
        rechargeAir: num(cd.fly_recharge_spd, 0.4),
        rechargeGround: num(cd.fly_recharge_spd_ground, 6),
        airWaitFrames: num(cd.flying_in_air_wait_frames, 38),
        needsRecharge: cd.flying_needs_recharge === '1',
      },
      // CharacterDataComponent mass (1 = the player) and the swim drags (velocity *= swim_drag each frame in
      // liquid, x also *= swim_extra_horizontal_drag), with the documented defaults.
      mass: num(cd.mass, 1),
      swimDrag: num(cp.swim_drag, 0.95),
      swimDragX: num(cp.swim_extra_horizontal_drag, 0.9),
      hp: num(dm.hp, 4) * 25,
      fireDamage: num(dm.fire_damage_amount, 0.2) * 25,
      materialDamage: Object.fromEntries(
        (dm.materials_that_damage ?? '').split(',').map((m, i) => [m.trim(), num((dm.materials_how_much_damage ?? '').split(',')[i], 0) * 25] as const).filter(([m]) => m),
      ),
      hitbox: { minX: num(hb.aabb_min_x, -3), maxX: num(hb.aabb_max_x, 3), minY: num(hb.aabb_min_y, -12), maxY: num(hb.aabb_max_y, 3) },
    },
    arm: { w: aw, h: ah, ox: num(as.attrs.offset_x, 0), oy: num(as.attrs.offset_y, 2), hand },
    wands: table.map((w) => ({
      name: String(w.name ?? ''),
      icon: atlas.rects.get(String(w.file))!,
      grip: [Number(w.grip_x ?? 0), Number(w.grip_y ?? 0)],
      tip: [Number(w.tip_x ?? 0), Number(w.tip_y ?? 0)],
      fireRateWait: Number(w.fire_rate_wait ?? 0),
      actionsPerRound: Number(w.actions_per_round ?? 0),
      shuffle: Number(w.shuffle_deck_when_empty ?? 0),
      deckCapacity: Number(w.deck_capacity ?? 0),
      spreadDegrees: Number(w.spread_degrees ?? 0),
      reloadTime: Number(w.reload_time ?? 0),
    })),
    cursor: { w: cursor.width ?? 0, h: cursor.height ?? 0 },
    effects,
  };
  return { kit, files };
}
