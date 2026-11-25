// How a creature fights, in plain words, from its extracted game data. Pure, so it's easy to test.
import type { Enemy } from '@/data/types';
import { FIGHTS } from '@/data/enemyFights';

export type CombatStyle = { label: string; blurb: string };

const ranged = (e: Enemy) => e.attacks?.find((a) => a.kind === 'ranged');
const closeIn = (e: Enemy) => e.attacks?.some((a) => a.kind === 'melee' || a.kind === 'dash' || a.kind === 'bite');

/** One label for how it fights. */
export function combatStyle(e: Enemy): CombatStyle {
  const curated = FIGHTS[e.id];
  if (curated) return { label: curated.label, blurb: curated.blurb };
  const b = e.behavior ?? {};
  const shot = ranged(e);
  if (e.boss) return { label: 'Boss', blurb: 'A unique fight with its own rules.' };
  if (e.moves?.digs) return { label: 'Digger', blurb: 'Tunnels through the ground and strikes from below.' };
  if (b.helpsFriends) return { label: 'Support', blurb: 'Stays back and casts on its allies.' };
  if (b.explodes && !shot) return { label: 'Kamikaze', blurb: 'Rushes in and blows up.' };
  if (b.immobile || (e.moves && !e.moves.flies && !e.moves.digs && e.moves.speed === 0 && shot))
    return { label: 'Turret', blurb: "Doesn't move: it holds its spot and fires." };
  if (shot && (shot.range ?? 0) >= 300) return { label: 'Sniper', blurb: 'Shoots from far beyond where you can see it.' };
  if (shot && b.wand) return { label: 'Wand user', blurb: 'Fights with a wand, like you do.' };
  if (shot) return { label: 'Shooter', blurb: closeIn(e) ? 'Shoots from range and fights up close too.' : 'Keeps its distance and shoots.' };
  if (e.attacks?.some((a) => a.kind === 'dash')) return { label: 'Charger', blurb: 'Leaps at you from a distance.' };
  if (closeIn(e)) return { label: 'Brawler', blurb: 'Has to get close to hurt you.' };
  if (b.aura) return { label: 'Aura', blurb: 'Hurts whatever comes near it.' };
  return { label: 'Harmless', blurb: "Doesn't attack." };
}

/** effect_frozen → "freezes you" etc.; unknown ones are humanised. */
const EFFECT: Record<string, string> = {
  frozen: 'freezes you',
  freeze: 'freezes you',
  on_fire: 'sets you on fire',
  poison: 'poisons you',
  confusion: 'confuses you',
  slimy: 'slimes you (you take more damage)',
  weaken: 'weakens you (you take more damage)',
  electrocution: 'electrocutes you',
  teleportation: 'teleports you',
  teleportation_enemy: 'teleports you',
  blindness: 'blinds you',
  radioactive: 'makes you toxic',
  wet: 'soaks you',
  oiled: 'covers you in oil',
  bloody: 'covers you in blood',
  charm: 'charms you',
  polymorph: 'polymorphs you',
  polymorph_random: 'polymorphs you',
  movement_slower: 'slows you down',
  movement_faster: 'speeds you up',
  berserk: 'drives you berserk',
  drunk: 'makes you drunk',
  homing_shooter: 'makes projectiles home in on you',
  curse_cloud_01: 'curses you',
};
export const effectText = (id: string) => {
  const k = id.replace(/^effect_/, '').replace(/_(enemy|short|long|temporary)$/, '');
  return EFFECT[k] ?? EFFECT[id.replace(/^effect_/, '')] ?? `${k.replace(/_/g, ' ')} effect`;
};

/** Short plain sentences about how it behaves. */
export function behaviorLines(e: Enemy): string[] {
  const b = e.behavior ?? {};
  const out: string[] = [];
  const shot = ranged(e);
  if (e.moves?.flies) out.push('Flies.');
  if (e.moves?.digs) out.push('Digs through solid ground.');
  if (b.swims) out.push('Lives in water.');
  if (b.immobile) out.push("Doesn't move.");
  if (b.sight) out.push(`Spots prey up to ${b.sight} px away${b.throughWalls ? ', even through walls' : ''}.`);
  if (shot) {
    const range = shot.range ? `up to ${shot.range} px` : 'range';
    out.push(b.minRange ? `Shoots from ${range}, but not when you're closer than ${b.minRange} px.` : `Shoots from ${range}.`);
  }
  if (b.predicts) out.push("Leads its shots: it aims where you're going.");
  if (b.wand) out.push('Fires a wand.');
  if (b.picksUp) out.push('Picks up wands and items it finds, and uses them.');
  if (b.helpsFriends) out.push('Aims its spells at its allies.');
  if (b.flees) out.push(`Sometimes runs away when hurt (${b.flees}% chance).`);
  if (b.hides) out.push('Hides after it hits you.');
  if (b.teleports) out.push('Teleports.');
  if (b.shield) out.push('Protected by an energy shield.');
  if (b.physics) out.push('A floating physics body: knockback and explosions push it around.');
  if (b.invisible) out.push('Invisible.');
  if (b.aura) out.push(`Hurts anything within ${b.aura.radius} px: ${b.aura.damage} ${b.aura.type} damage at a time.`);
  if (b.eats && !e.moves?.digs) out.push('Eats through terrain.');
  if (b.explodes) out.push('Explodes.');
  // A support's spells land on its friends, not on you.
  if (!b.helpsFriends) for (const fx of b.inflicts ?? []) out.push(`Getting hit by it ${effectText(fx)}.`);
  return out;
}
