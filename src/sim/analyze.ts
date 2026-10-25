// Turns raw simulation output into what the wand builder shows: per-projectile damage, per-cast totals, cycle summary.
import type { DamageType, Projectile, Spell } from '@/data/types';
import { DAMAGE_TYPES } from '@/data/types';
import { HP_UNIT } from '@/data/format';
import type { ShotState, SimCast, SimProjectile, SimResult, SimShot } from './types';

/** Noita critical hits deal 5× damage. */
const CRIT_MULT = 5;

export type ProjectileView = {
  file: string;
  spell?: Spell;
  damage: Partial<Record<DamageType, number>>;
  explosion?: { damage: number; radius: number };
  /** Hit damage including explosion, before crits. */
  total: number;
  critChance: number;
  trigger?: { kind: 'hit' | 'timer' | 'death'; delay?: number; children: ProjectileView[] };
};

export type CastView = {
  cast: SimCast;
  projectiles: ProjectileView[];
  projectileCount: number;
  /** Expected damage of everything the cast produces (one hit each, crits averaged). */
  damage: number;
  manaUsed: number;
};

export type Summary = {
  casts: number;
  /** Frames from the first cast until the wand can fire again. */
  cycleFrames: number;
  manaUsed: number;
  damage: number;
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

/** A projectile's hit damage, explosion and crit chance once its shot's modifiers are applied. */
export function projectileDamage(base: Projectile | undefined, state: ShotState) {
  const damage: Partial<Record<DamageType, number>> = {};
  for (const t of DAMAGE_TYPES) {
    const add = DAMAGE_ADD[t] ? n(state, DAMAGE_ADD[t]!) * HP_UNIT : 0;
    const v = (base?.damage[t] ?? 0) + add;
    if (Math.abs(v) > 1e-6) damage[t] = Math.round(v * 100) / 100;
  }
  let explosion: { damage: number; radius: number } | undefined;
  if (base?.explosion) {
    const ed = base.explosion.damage + n(state, 'damage_explosion_add') * HP_UNIT;
    const er = base.explosion.radius + n(state, 'explosion_radius');
    if (ed > 0 || er > 4) explosion = { damage: Math.round(ed * 100) / 100, radius: Math.round(er) };
  }
  const hit = Object.values(damage).reduce((a, b) => a + Math.max(0, b ?? 0), 0);
  return { damage, explosion, hit, critChance: Math.max(0, Math.min(100, n(state, 'damage_critical_chance'))) };
}

export { CRIT_MULT };

export class Analyzer {
  private byProjectile = new Map<string, Spell[]>();

  constructor(
    private projectiles: Record<string, Projectile>,
    spells: Spell[],
  ) {
    for (const s of spells) for (const f of s.projectiles) this.byProjectile.set(f, [...(this.byProjectile.get(f) ?? []), s]);
  }

  /**
   * Best guess at which spell fired a projectile file (several share one, e.g. Spark bolt and Spark bolt with trigger):
   * prefer one played this cast whose trigger-ness matches.
   */
  spellFor(file: string, played: Set<string>, triggered: boolean): Spell | undefined {
    const c = this.byProjectile.get(file) ?? [];
    const matches = (s: Spell) => !!s.trigger === triggered;
    return c.find((s) => played.has(s.id) && matches(s)) ?? c.find((s) => played.has(s.id)) ?? c.find(matches) ?? c[0];
  }

  private view(p: SimProjectile, state: ShotState, played: Set<string>): ProjectileView {
    const { damage, explosion, hit, critChance } = projectileDamage(this.projectiles[p.file], state);
    return {
      file: p.file,
      spell: this.spellFor(p.file, played, !!p.trigger),
      damage,
      ...(explosion ? { explosion } : {}),
      total: hit + (explosion?.damage ?? 0),
      critChance,
      ...(p.trigger
        ? { trigger: { kind: p.trigger.kind, ...(p.trigger.delay !== undefined ? { delay: p.trigger.delay } : {}), children: this.shot(p.trigger.shot, played) } }
        : {}),
    };
  }

  shot(s: SimShot, played: Set<string>): ProjectileView[] {
    return s.projectiles.map((p) => this.view(p, s.state, played));
  }

  cast(c: SimCast): CastView {
    const projectiles = this.shot(c.shot, new Set(c.played));
    let count = 0;
    let damage = 0;
    const walk = (list: ProjectileView[]) => {
      for (const p of list) {
        count++;
        damage += p.total * (1 + ((CRIT_MULT - 1) * p.critChance) / 100);
        if (p.trigger) walk(p.trigger.children);
      }
    };
    walk(projectiles);
    return { cast: c, projectiles, projectileCount: count, damage, manaUsed: c.mana_before - c.mana_after };
  }

  run(r: SimResult): { casts: CastView[]; summary: Summary } {
    const casts = r.casts.map((c) => this.cast(c));
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
        dps: cycleFrames > 0 ? damage / (cycleFrames / 60) : 0,
        skippedForMana: r.casts.reduce((s, c) => s + c.no_mana, 0),
        recharged: r.casts.some((c) => c.reload !== undefined),
      },
    };
  }
}
