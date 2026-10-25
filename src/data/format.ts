// Turns raw game numbers into the units the in-game tooltip uses.

export const FPS = 60;
export const HP_UNIT = 25;

const trim = (n: number, digits = 2) => {
  const s = n.toFixed(digits);
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
};

export const seconds = (frames: number) => `${trim(frames / FPS)} s`;
export const signed = (s: string, n: number) => (n > 0 ? `+${s}` : s);

export type StatLine = { label: string; value: string; good?: boolean; bad?: boolean };

type Rule = { label: string; fmt: (v: number) => string; goodWhenNegative?: boolean };

const damage = (label: string): Rule => ({ label: `${label} damage`, fmt: (v) => signed(trim(v * HP_UNIT), v) });

/** Shot-state fields (from gunaction_generated.lua) that a spell changes. */
const RULES: Record<string, Rule> = {
  fire_rate_wait: { label: 'Cast delay', fmt: (v) => signed(seconds(v), v), goodWhenNegative: true },
  spread_degrees: { label: 'Spread', fmt: (v) => signed(`${trim(v, 1)}°`, v), goodWhenNegative: true },
  pattern_degrees: { label: 'Pattern', fmt: (v) => `${trim(v, 1)}°` },
  speed_multiplier: { label: 'Speed', fmt: (v) => `×${trim(v)}` },
  child_speed_multiplier: { label: 'Child speed', fmt: (v) => `×${trim(v)}` },
  damage_projectile_add: damage('Projectile'),
  damage_explosion_add: damage('Explosion'),
  damage_fire_add: damage('Fire'),
  damage_electricity_add: damage('Electric'),
  damage_ice_add: damage('Ice'),
  damage_slice_add: damage('Slice'),
  damage_melee_add: damage('Melee'),
  damage_drill_add: damage('Drill'),
  damage_curse_add: damage('Curse'),
  damage_healing_add: damage('Healing'),
  damage_critical_chance: { label: 'Critical chance', fmt: (v) => signed(`${trim(v)}%`, v) },
  damage_critical_multiplier: { label: 'Critical multiplier', fmt: (v) => signed(`×${trim(v)}`, v) },
  explosion_radius: { label: 'Explosion radius', fmt: (v) => signed(trim(v), v) },
  lifetime_add: { label: 'Lifetime', fmt: (v) => signed(seconds(v), v) },
  bounces: { label: 'Bounces', fmt: (v) => signed(trim(v), v) },
  knockback_force: { label: 'Knockback', fmt: (v) => signed(trim(v), v) },
  recoil: { label: 'Recoil', fmt: (v) => signed(trim(v), v), goodWhenNegative: true },
  gravity: { label: 'Gravity', fmt: (v) => signed(trim(v), v) },
  friendly_fire: { label: 'Friendly fire', fmt: () => 'Yes' },
  lightning_count: { label: 'Lightning', fmt: (v) => signed(trim(v), v) },
  material_amount: { label: 'Material amount', fmt: (v) => trim(v) },
  trail_material_amount: { label: 'Trail amount', fmt: (v) => trim(v) },
  dampening: { label: 'Dampening', fmt: (v) => `×${trim(v)}` },
};

const HIDDEN = new Set(['screenshake', 'gore_particles', 'ragdoll_fx', 'blood_count_multiplier', 'light', 'physics_impulse_coeff', 'explosion_damage_to_materials']);

export function spellStatLines(stats: Record<string, number | string>, reloadDelta: number): StatLine[] {
  const lines: StatLine[] = [];
  for (const [k, raw] of Object.entries(stats)) {
    if (HIDDEN.has(k)) continue;
    const rule = RULES[k];
    if (!rule) continue;
    const v = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(v) && k !== 'friendly_fire') continue;
    const good = rule.goodWhenNegative ? v < 0 : v > 0;
    lines.push({ label: rule.label, value: rule.fmt(v), good, bad: !good && v !== 0 });
  }
  if (reloadDelta) lines.push({ label: 'Recharge time', value: signed(seconds(reloadDelta), reloadDelta), good: reloadDelta < 0, bad: reloadDelta > 0 });
  // Cast delay and recharge first, like the game's tooltip.
  const order = ['Cast delay', 'Recharge time', 'Spread'];
  return lines.sort((a, b) => (order.indexOf(a.label) + 1 || 99) - (order.indexOf(b.label) + 1 || 99));
}

/** Basename without extension, prettified: "data/entities/misc/effect_frozen.xml" -> "Frozen". */
export function prettyEntity(file: string): string {
  const base = file.split('/').pop()!.replace(/\.xml$/, '').replace(/^effect_/, '');
  return base.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export const list = (s: string | number | undefined) =>
  String(s ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

export { trim as fmtNum };
