import { basename } from 'node:path';
import type { DamageType, Projectile, Spell, SpellType } from '../../src/data/types.ts';
import { DAMAGE_TYPES, SPELL_TYPES } from '../../src/data/types.ts';
import { comp, comps, num, type EntityLoader } from './entity.ts';
import { tr, type Translations } from './translations.ts';

/** Shape returned by reflect_actions() in driver.lua. */
export type RawAction = {
  id: string;
  index: number;
  name: string;
  description: string;
  sprite: string;
  type: number;
  spawn_level?: string;
  spawn_probability?: string;
  price?: number;
  mana?: number;
  max_uses?: number;
  never_unlimited?: boolean;
  recursive?: boolean;
  spawn_requires_flag?: string;
  related_projectiles?: string[];
  related_extra_entities?: string[];
  stats?: Record<string, number | string> | [];
  reload_delta?: number;
  draw?: number;
  projectiles?: string[];
  reflect_error?: string;
};

const HP = 25;
// Copied into the shot state by set_current_action(), not effects of the spell.
const NON_STAT_KEYS = new Set(['custom_xml_file', 'sound_loop_tag', 'reload_time']);
const round = (n: number) => Math.round(n * 1000) / 1000;
const obj = <T extends object>(v: T | [] | undefined): T => (Array.isArray(v) || !v ? ({} as T) : v);

const list = (s: string | undefined) =>
  (s ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

export function buildSpells(raw: RawAction[], t: Translations, icons: Map<string, Spell['icon']>): Spell[] {
  return raw.map((a) => {
    const levels = list(a.spawn_level).map(Number);
    const probs = list(a.spawn_probability).map(Number);
    const stats = obj(a.stats);
    for (const k of Object.keys(stats)) {
      const v = stats[k];
      if (NON_STAT_KEYS.has(k)) delete stats[k];
      else if (typeof v === 'number') stats[k] = round(v);
    }
    // related_projectiles may be {file, count}; keep the file names.
    const related = (a.related_projectiles ?? []).filter((p): p is string => typeof p === 'string');
    const projectiles = [...new Set([...(a.projectiles ?? []), ...related])];
    return {
      id: a.id,
      index: a.index,
      name: tr(t, a.name),
      description: tr(t, a.description),
      type: (SPELL_TYPES[a.type] ?? 'other') as SpellType,
      icon: icons.get(a.sprite) ?? { x: 0, y: 0, w: 0, h: 0 },
      mana: a.mana ?? 10,
      maxUses: a.max_uses !== undefined && a.max_uses >= 0 ? a.max_uses : null,
      neverUnlimited: !!a.never_unlimited,
      price: a.price ?? 0,
      spawn: levels.map((level, i) => ({ level, prob: probs[i] ?? 0 })),
      ...(a.spawn_requires_flag ? { requiresFlag: a.spawn_requires_flag } : {}),
      recursive: !!a.recursive,
      draw: a.draw ?? 0,
      stats,
      reloadDelta: round(a.reload_delta ?? 0),
      projectiles,
      extraEntities: (a.related_extra_entities ?? []).filter((p): p is string => typeof p === 'string'),
      discoverFlag: `action_${a.id.toLowerCase()}`,
    };
  });
}

export function buildProjectile(file: string, loader: EntityLoader): Projectile | null {
  const e = loader.load(file);
  if (!e) return null;
  const pc = comps(e, 'ProjectileComponent').find((c) => c.attrs._enabled !== '0') ?? comp(e, 'ProjectileComponent');
  const vel = comp(e, 'VelocityComponent');
  const life = comp(e, 'LifetimeComponent');

  const damage: Partial<Record<DamageType, number>> = {};
  if (pc) {
    const base = num(pc.attrs.damage, 1);
    if (base) damage.projectile = round(base * HP);
    const byType = comp(pc, 'damage_by_type');
    for (const [k, v] of Object.entries(byType?.attrs ?? {})) {
      const n = num(v, 0);
      if (n && (DAMAGE_TYPES as readonly string[]).includes(k)) damage[k as DamageType] = round((damage[k as DamageType] ?? 0) + n * HP);
    }
  }

  const ex = comp(pc, 'config_explosion');
  const onDeath = pc?.attrs.on_death_explode === '1';
  const onTimeout = pc?.attrs.on_lifetime_out_explode === '1';
  const explosion =
    ex && (onDeath || onTimeout)
      ? { damage: round(num(ex.attrs.damage, 0) * HP), radius: num(ex.attrs.explosion_radius, 0), onDeath, onTimeout }
      : undefined;

  let lifetime = num(pc?.attrs.lifetime, -1);
  if (lifetime < 0 && life) lifetime = num(life.attrs.lifetime, -1);

  const emitter = comps(e, 'ParticleEmitterComponent').find((p) => p.attrs.create_real_particles === '1' && p.attrs.emitted_material_name);
  const effects = list(pc?.attrs.damage_game_effect_entities).map((f) => basename(f, '.xml'));

  return {
    file,
    damage,
    ...(explosion ? { explosion } : {}),
    lifetime,
    lifetimeRandom: num(pc?.attrs.lifetime_randomness, 0),
    speed: [num(pc?.attrs.speed_min, 60), num(pc?.attrs.speed_max, num(pc?.attrs.speed_min, 60))],
    spread: round((num(pc?.attrs.direction_random_rad, 0) * 180) / Math.PI),
    bounces: num(pc?.attrs.bounces_left, 0),
    gravity: num(vel?.attrs.gravity_y, 400),
    airFriction: num(vel?.attrs.air_friction, 0.55),
    knockback: num(pc?.attrs.knockback_force, 0),
    penetrateWorld: pc?.attrs.penetrate_world === '1',
    penetrateEntities: pc?.attrs.penetrate_entities === '1',
    dieOnCollision: pc ? pc.attrs.on_collision_die !== '0' : false,
    friendlyFire: pc?.attrs.friendly_fire === '1',
    damageEveryFrames: num(pc?.attrs.damage_every_x_frames, -1),
    effects,
    ...(emitter ? { material: emitter.attrs.emitted_material_name } : {}),
  };
}
