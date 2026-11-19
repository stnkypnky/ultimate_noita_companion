// Turns raw simulation output into what the wand builder shows: per-projectile damage, per-cast totals, cycle summary.
import type { DamageType, Projectile, Spell } from '@/data/types';
import { DAMAGE_TYPES } from '@/data/types';
import { HP_UNIT } from '@/data/format';
import type { ShotState, SimCast, SimProjectile, SimResult, SimShot, SimStep } from './types';
import { perkForModifier, type BoostPart } from './perks';

/** Noita critical hits deal 5× damage. */
const CRIT_MULT = 5;

/**
 * One line of "where the damage comes from": the projectile's own damage, a spell or perk that adds to it
 * (hit damage, blast damage, crit chance), or a perk multiplying it. Additions are summed, then multiplied.
 */
export type DamageSource = {
  /** The projectile's own spell, a modifier spell, or the wand ('wand'). */
  spell?: Spell;
  perkId?: string;
  wand?: boolean;
  /** The projectile itself (base damage). */
  base?: boolean;
  damage: number;
  explosion: number;
  crit: number;
  /** A multiplier (Glass Cannon); 0 for Null Shot. */
  mult?: number;
};

/** How the projectile flies, once its shot's modifiers are applied. */
export type ProjectileStats = {
  /** px/s, [min, max]. */
  speed: [number, number];
  /** Frames, [min, max]; undefined = until it hits something. */
  lifetime?: [number, number];
  /** Degrees of random direction spread (wand + spells + the projectile's own). */
  spread: number;
  bounces: number;
  knockback: number;
  gravity: number;
  piercesEnemies: boolean;
  goesThroughWalls: boolean;
  effects: string[];
};

export type ProjectileView = {
  file: string;
  spell?: Spell;
  /** 0 = cast directly, 1+ = inside that many trigger payloads. */
  depth: number;
  damage: Partial<Record<DamageType, number>>;
  explosion?: { damage: number; radius: number };
  /** Hit damage including explosion, before crits. */
  total: number;
  critChance: number;
  sources: DamageSource[];
  stats: ProjectileStats;
  trigger?: { kind: 'hit' | 'timer' | 'death'; delay?: number; children: ProjectileView[] };
};

/** One line of how a cast's delay, recharge and mana add up. */
export type TimingRow = {
  spell?: Spell;
  perkId?: string;
  wand?: boolean;
  /** Played inside a trigger's payload. */
  payload: boolean;
  /** Frames. */
  delay: number;
  /** Frames added to the recharge. */
  reload: number;
  mana: number;
};

export type CastView = {
  cast: SimCast;
  projectiles: ProjectileView[];
  projectileCount: number;
  /** Projectiles made by trigger payloads. */
  payloadCount: number;
  /** Expected damage of everything the cast produces (one hit each, crits averaged). */
  damage: number;
  /** Of `damage`: what the directly cast projectiles do, and what their payloads do. */
  carrierDamage: number;
  payloadDamage: number;
  manaUsed: number;
  timing: TimingRow[];
};

export type Summary = {
  casts: number;
  /** Frames from the first cast until the wand can fire again. */
  cycleFrames: number;
  manaUsed: number;
  damage: number;
  carrierDamage: number;
  payloadDamage: number;
  payloadCount: number;
  dps: number;
  skippedForMana: number;
  recharged: boolean;
};

const DAMAGE_ADD: Partial<Record<DamageType, string>> = {
  projectile: 'damage_projectile_add',
  fire: 'damage_fire_add',
  electricity: 'damage_electricity_add',
  ice: 'damage_ice_add',
  slice: 'damage_slice_add',
  melee: 'damage_melee_add',
  drill: 'damage_drill_add',
  curse: 'damage_curse_add',
  healing: 'damage_healing_add',
};

const n = (s: ShotState, k: string) => (typeof s[k] === 'number' ? (s[k] as number) : 0);

/**
 * What the caster's perks do to every projectile, beyond what gun.lua already put in the shot (src/sim/perks.ts):
 * a damage multiplier (Glass Cannon, Living on the Edge) and extra crit chance (Critical Hit +).
 */
export type DamageBoost = { mult: number; crit: number; parts?: BoostPart[] };
export const NO_BOOST: DamageBoost = { mult: 1, crit: 0 };

/** A shot-state field, with the game's default when the shot didn't change it. */
const num = (s: ShotState, k: string, def = 0) => (typeof s[k] === 'number' ? (s[k] as number) : def);

/** Hit damage (HP) a shot-state change adds to every damage type the game adds to. */
const addedHit = (d: Record<string, number>) => Object.values(DAMAGE_ADD).reduce((a, k) => a + (d[k!] ?? 0) * HP_UNIT, 0);

const round2 = (v: number) => Math.round(v * 100) / 100;

/** The projectile's own damage, each spell and perk's additions, the wand's, then the perk multipliers. */
export function damageSources(
  base: Projectile | undefined,
  state: ShotState,
  steps: SimStep[] | undefined,
  spellFor: (step: SimStep) => Spell | undefined,
  own: Spell | undefined,
  boost: DamageBoost = NO_BOOST,
): DamageSource[] {
  const hasBlast = !!base?.explosion;
  const out: DamageSource[] = [];
  const baseHit = Object.values(base?.damage ?? {}).reduce((a, b) => a + Math.max(0, b ?? 0), 0);
  out.push({ spell: own, base: true, damage: baseHit, explosion: base?.explosion?.damage ?? 0, crit: 0 });
  const left: Record<string, number> = {};
  for (const k of [...Object.values(DAMAGE_ADD), 'damage_explosion_add', 'damage_critical_chance']) left[k!] = num(state, k!);
  let nulledBy: DamageSource | undefined;
  for (const st of steps ?? []) {
    for (const k in left) left[k] = left[k]! - (st.d[k] ?? 0);
    const who = st.mod ? { perkId: perkForModifier(st.mod) } : { spell: spellFor(st) };
    if ((st.d.damage_null_all ?? 0) > 0) nulledBy ??= { ...who, damage: 0, explosion: 0, crit: 0, mult: 0 };
    const row = { ...who, damage: round2(addedHit(st.d)), explosion: hasBlast ? round2((st.d.damage_explosion_add ?? 0) * HP_UNIT) : 0, crit: st.d.damage_critical_chance ?? 0 };
    if (!(row.damage || row.explosion || row.crit)) continue;
    // The projectile's own spell adding to its shot (Spark bolt's 5% crit) belongs on its first line.
    const first = out[0]!;
    if (own && st.id === own.id && !st.mod) {
      first.damage = round2(first.damage + row.damage);
      first.explosion = round2(first.explosion + row.explosion);
      first.crit += row.crit;
    } else out.push(row);
  }
  // Whatever no step accounts for came with the shot: the wand (root shot) or the payload's defaults.
  const rest = { wand: true, damage: round2(addedHit(left)), explosion: hasBlast ? round2((left.damage_explosion_add ?? 0) * HP_UNIT) : 0, crit: round2(left.damage_critical_chance ?? 0) };
  if (Math.abs(rest.damage) > 1e-6 || Math.abs(rest.explosion) > 1e-6 || Math.abs(rest.crit) > 1e-6) out.push(rest);
  for (const p of boost.parts ?? []) out.push({ perkId: p.perkId, damage: 0, explosion: 0, crit: p.crit ?? 0, ...(p.mult ? { mult: p.mult } : {}) });
  if (nulledBy || num(state, 'damage_null_all') > 0) out.push(nulledBy ?? { damage: 0, explosion: 0, crit: 0, mult: 0 });
  return out;
}

/** Speed, lifetime, spread and the rest, from the projectile file and its shot's modifiers. */
export function projectileStats(base: Projectile | undefined, state: ShotState): ProjectileStats {
  const sm = num(state, 'speed_multiplier', 1);
  const life = base && base.lifetime >= 0 ? base.lifetime + num(state, 'lifetime_add') : undefined;
  return {
    speed: [Math.round((base?.speed[0] ?? 0) * sm), Math.round((base?.speed[1] ?? 0) * sm)],
    ...(life !== undefined ? { lifetime: [Math.max(0, life - (base?.lifetimeRandom ?? 0)), Math.max(0, life + (base?.lifetimeRandom ?? 0))] as [number, number] } : {}),
    spread: round2((base?.spread ?? 0) + num(state, 'spread_degrees')),
    bounces: Math.max(0, (base?.bounces ?? 0) + num(state, 'bounces')),
    knockback: round2((base?.knockback ?? 0) + num(state, 'knockback_force')),
    gravity: round2((base?.gravity ?? 0) + num(state, 'gravity')),
    piercesEnemies: !!base?.penetrateEntities,
    goesThroughWalls: !!base?.penetrateWorld,
    effects: base?.effects ?? [],
  };
}

/** A projectile's hit damage, explosion and crit chance once its shot's modifiers are applied. */
export function projectileDamage(base: Projectile | undefined, state: ShotState, boost: DamageBoost = NO_BOOST) {
  // Null Shot (damage_null_all) takes every kind of damage away, the blast's included.
  const nulled = n(state, 'damage_null_all') > 0;
  const damage: Partial<Record<DamageType, number>> = {};
  for (const t of DAMAGE_TYPES) {
    const add = DAMAGE_ADD[t] ? n(state, DAMAGE_ADD[t]!) * HP_UNIT : 0;
    const v = nulled ? 0 : ((base?.damage[t] ?? 0) + add) * boost.mult;
    if (Math.abs(v) > 1e-6) damage[t] = Math.round(v * 100) / 100;
  }
  let explosion: { damage: number; radius: number } | undefined;
  if (base?.explosion) {
    const ed = nulled ? 0 : (base.explosion.damage + n(state, 'damage_explosion_add') * HP_UNIT) * boost.mult;
    const er = base.explosion.radius + n(state, 'explosion_radius');
    if (ed > 0 || er > 4) explosion = { damage: Math.round(ed * 100) / 100, radius: Math.round(er) };
  }
  const hit = Object.values(damage).reduce((a, b) => a + Math.max(0, b ?? 0), 0);
  return { damage, explosion, hit, critChance: Math.max(0, Math.min(100, n(state, 'damage_critical_chance') + boost.crit)) };
}

export { CRIT_MULT };

export class Analyzer {
  private byProjectile = new Map<string, Spell[]>();
  private byId = new Map<string, Spell>();

  constructor(
    private projectiles: Record<string, Projectile>,
    spells: Spell[],
  ) {
    for (const s of spells) {
      this.byId.set(s.id, s);
      for (const f of s.projectiles) this.byProjectile.set(f, [...(this.byProjectile.get(f) ?? []), s]);
    }
  }

  private stepSpell = (st: SimStep) => (st.id ? this.byId.get(st.id) : undefined);

  /**
   * Best guess at which spell fired a projectile file (several share one, e.g. Spark bolt and Spark bolt with trigger):
   * prefer one played this cast whose trigger-ness matches.
   */
  spellFor(file: string, played: Set<string>, triggered: boolean): Spell | undefined {
    const c = this.byProjectile.get(file) ?? [];
    const matches = (s: Spell) => !!s.trigger === triggered;
    return c.find((s) => played.has(s.id) && matches(s)) ?? c.find((s) => played.has(s.id)) ?? c.find(matches) ?? c[0];
  }

  /** The caster's perk boost for the result being analysed (set by run()). */
  private boost: DamageBoost = NO_BOOST;

  private view(p: SimProjectile, shot: SimShot, played: Set<string>, depth: number): ProjectileView {
    const base = this.projectiles[p.file];
    const { damage, explosion, hit, critChance } = projectileDamage(base, shot.state, this.boost);
    const spell = this.spellFor(p.file, played, !!p.trigger);
    return {
      file: p.file,
      spell,
      depth,
      damage,
      ...(explosion ? { explosion } : {}),
      total: hit + (explosion?.damage ?? 0),
      critChance,
      sources: damageSources(base, shot.state, shot.steps, this.stepSpell, spell, this.boost),
      stats: projectileStats(base, shot.state),
      ...(p.trigger
        ? { trigger: { kind: p.trigger.kind, ...(p.trigger.delay !== undefined ? { delay: p.trigger.delay } : {}), children: this.shot(p.trigger.shot, played, depth + 1) } }
        : {}),
    };
  }

  shot(s: SimShot, played: Set<string>, depth = 0): ProjectileView[] {
    return s.projectiles.map((p) => this.view(p, s, played, depth));
  }

  /** The wand's own delay first, then every played spell and perk modifier, payloads included, in play order. */
  private timing(c: SimCast): TimingRow[] {
    const rows: TimingRow[] = [];
    const walk = (s: SimShot, payload: boolean) => {
      // Steps of this shot and its payloads interleave in play order: a payload is drawn while its trigger plays,
      // so its rows go right after the trigger's.
      const payloads = s.projectiles.flatMap((p) => (p.trigger ? [p.trigger.shot] : []));
      for (const st of s.steps ?? []) {
        rows.push({
          ...(st.mod ? { perkId: perkForModifier(st.mod) } : { spell: this.stepSpell(st) }),
          payload,
          delay: st.d.fire_rate_wait ?? 0,
          reload: st.reload,
          mana: st.mana,
        });
        if (st.id && this.byId.get(st.id)?.trigger && payloads.length) walk(payloads.shift()!, true);
      }
      for (const p of payloads) walk(p, true);
    };
    walk(c.shot, false);
    const stepDelay = rows.reduce((a, r) => a + r.delay, 0);
    const stepMana = rows.reduce((a, r) => a + r.mana, 0);
    rows.unshift({ wand: true, payload: false, delay: c.cast_delay - stepDelay, reload: 0, mana: c.mana_before - c.mana_after - stepMana });
    return rows;
  }

  cast(c: SimCast): CastView {
    const projectiles = this.shot(c.shot, new Set(c.played));
    let count = 0;
    let payloads = 0;
    let carrier = 0;
    let payload = 0;
    const walk = (list: ProjectileView[]) => {
      for (const p of list) {
        count++;
        const d = p.total * (1 + ((CRIT_MULT - 1) * p.critChance) / 100);
        if (p.depth > 0) {
          payloads++;
          payload += d;
        } else carrier += d;
        if (p.trigger) walk(p.trigger.children);
      }
    };
    walk(projectiles);
    return {
      cast: c,
      projectiles,
      projectileCount: count,
      payloadCount: payloads,
      damage: carrier + payload,
      carrierDamage: carrier,
      payloadDamage: payload,
      manaUsed: c.mana_before - c.mana_after,
      timing: c.shot.steps ? this.timing(c) : [],
    };
  }

  run(r: SimResult, boost: DamageBoost = NO_BOOST): { casts: CastView[]; summary: Summary } {
    this.boost = boost;
    const casts = r.casts.map((c) => this.cast(c));
    this.boost = NO_BOOST;
    const first = r.casts[0];
    const last = r.casts.at(-1);
    const cycleFrames = first && last ? last.next_frame - first.frame : 0;
    const damage = casts.reduce((s, c) => s + c.damage, 0);
    return {
      casts,
      summary: {
        casts: casts.length,
        cycleFrames,
        manaUsed: casts.reduce((s, c) => s + Math.max(0, c.manaUsed), 0),
        damage,
        carrierDamage: casts.reduce((s, c) => s + c.carrierDamage, 0),
        payloadDamage: casts.reduce((s, c) => s + c.payloadDamage, 0),
        payloadCount: casts.reduce((s, c) => s + c.payloadCount, 0),
        dps: cycleFrames > 0 ? damage / (cycleFrames / 60) : 0,
        skippedForMana: r.casts.reduce((s, c) => s + c.no_mana, 0),
        recharged: r.casts.some((c) => c.reload !== undefined),
      },
    };
  }
}
