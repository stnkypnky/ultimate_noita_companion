// "How to beat it": tactics read off a creature's data. Pure, so it's easy to test.
import type { DamageType, Enemy } from '@/data/types';

export const DAMAGE_LABEL: Record<DamageType, string> = {
  projectile: 'Projectile', explosion: 'Explosion', melee: 'Melee', slice: 'Slice', fire: 'Fire', electricity: 'Electric',
  ice: 'Ice', drill: 'Drill', curse: 'Curse', holy: 'Holy', healing: 'Healing', radioactive: 'Toxic', poison: 'Poison',
  physics_hit: 'Physics', overeating: 'Overeating',
};

export type Tactic = { text: string; tone?: 'good' | 'bad' };

const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const pct = (m: number) => `${Math.round(m * 100)}%`;

export function howToBeat(e: Enemy): Tactic[] {
  const out: Tactic[] = [];
  const resist = Object.entries(e.resist ?? {}) as [DamageType, number][];
  const b = e.behavior ?? {};
  const immune = new Set(e.immune ?? []);

  const weak = resist.filter(([t, m]) => m > 1 && t !== 'healing').sort((x, y) => y[1] - x[1]);
  if (weak.length) out.push({ text: `Weak to ${list(weak.map(([t, m]) => `${DAMAGE_LABEL[t]} (${pct(m)})`))}.`, tone: 'good' });
  const zero = resist.filter(([t, m]) => m === 0 && t !== 'healing').map(([t]) => DAMAGE_LABEL[t]);
  if (zero.length) out.push({ text: `${list(zero)} damage does nothing to it.`, tone: 'bad' });
  const tough = resist.filter(([t, m]) => m > 0 && m < 0.5 && t !== 'healing').map(([t, m]) => `${DAMAGE_LABEL[t]} (${pct(m)})`);
  if (tough.length) out.push({ text: `Shrugs off ${list(tough)}.`, tone: 'bad' });
  if (resist.some(([t, m]) => t === 'healing' && m < 0)) out.push({ text: 'Healing spells hurt it.', tone: 'good' });

  const shot = e.attacks?.find((a) => a.kind === 'ranged');
  const close = e.attacks?.some((a) => a.kind === 'melee' || a.kind === 'dash' || a.kind === 'bite');
  if (!shot && close && !e.moves?.flies && !e.moves?.digs) out.push({ text: 'It can only hurt you up close: keep your distance and shoot.' });
  if (b.minRange) out.push({ text: `Get closer than ${b.minRange} px and it can't shoot you.` });
  if (b.predicts) out.push({ text: 'Change direction often: it aims where you are going.' });
  if (shot?.range && shot.range >= 300) out.push({ text: 'Use cover: it can hit you from off-screen.' });
  if (b.aura) out.push({ text: `Don't stand within ${b.aura.radius} px of it.` });
  if (b.explodes) out.push({ text: 'Stay back when it dies: it explodes.' });
  if (b.picksUp) out.push({ text: "Don't leave good wands lying around it: it will pick them up and use them." });
  if (b.helpsFriends) out.push({ text: 'Kill it first: it makes the creatures around it stronger.' });
  if (b.flees) out.push({ text: 'Finish it off quickly: wounded, it may run.' });

  // Melee on a frozen creature kills it outright (wiki: Status Effects). Bosses and the freeze-proof are spared.
  if (!e.boss && !immune.has('Freezing') && (e.hp ?? 0) > 0) out.push({ text: 'Freeze it, then any melee hit (even a kick) kills it outright.', tone: 'good' });
  if (e.hurtBy?.some((h) => h.material !== 'acid')) out.push({ text: 'Some materials hurt it badly: see Hurt by below.', tone: 'good' });
  if (immune.has('Polymorph')) out.push({ text: "Polymorph doesn't work on it.", tone: 'bad' });
  return out;
}
