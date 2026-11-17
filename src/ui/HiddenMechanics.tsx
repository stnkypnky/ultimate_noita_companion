import { ExternalLink } from 'lucide-react';
import { fmtNum, seconds } from '@/data/format';
import { mechanicsFor, type MechanicKind, type MechanicNote } from '@/data/mechanics';
import type { Item, Projectile } from '@/data/types';
import { Section } from '@/ui/controls';
import { InlineSpoiler } from '@/ui/Spoiler';

const DOCS = 'https://noita.wiki.gg/wiki/Modding:_Component_documentation';

/** Notes read straight from the game files: things the in-game tooltip never shows. */
export function projectileNotes(projs: Projectile[]): MechanicNote[] {
  const notes: MechanicNote[] = [];
  const add = (text: string) => !notes.some((n) => n.text === text) && notes.push({ text, source: DOCS });
  for (const p of projs) {
    if (p.speedDamage) {
      add(
        p.speedDamage.maxSpeed
          ? `Its damage scales with speed: full damage at ${fmtNum(p.speedDamage.maxSpeed)} px/s, more when faster, less when slower.`
          : 'Its Projectile damage scales with speed: × its current speed ÷ its speed at the end of its first frame. It weakens as it slows down, and anything that speeds it up afterwards makes it hit harder.',
      );
    }
    if (p.lowVelocityLimit !== undefined && p.speedDamage) add(`It fizzles out if it slows below ${fmtNum(p.lowVelocityLimit)} px/s.`);
    if (p.throwCoeff !== undefined) {
      add(
        `Thrown as a physical object: launch speed ${fmtNum(p.speed[1])} × throw strength ${fmtNum(p.throwCoeff, 2)}${p.lifetime > 0 ? `, on a ${seconds(p.lifetime)} fuse` : ''}.`,
      );
    }
    if (p.hurtsCaster && p.explosion) add(`Its blast (radius ${fmtNum(p.explosion.radius)}) hurts you as well.`);
  }
  return notes;
}

export function itemNotes(item: Item): MechanicNote[] {
  const t = item.thrown;
  if (!t) return [];
  return [
    {
      text: `Throw it at enemies: it deals ${fmtNum(t.damage)} melee damage at ${fmtNum(t.maxSpeed)} px/s, more the faster it flies.${t.hitsPlayer ? '' : ' It never hurts you.'}`,
      source: DOCS,
    },
  ];
}

/** The "Hidden mechanics" section of a detail page: game-file facts plus curated wiki notes. Renders nothing when empty. */
export function HiddenMechanics({ kind, id, auto = [] }: { kind: MechanicKind; id: string; auto?: MechanicNote[] }) {
  const notes = [...auto, ...mechanicsFor(kind, id)];
  if (!notes.length) return null;
  const open = notes.filter((n) => !n.secret);
  const secret = notes.filter((n) => n.secret);
  return (
    <Section title="Hidden mechanics">
      <ul className="panel space-y-2.5 px-4 py-3">
        {open.map((n) => (
          <Note key={n.text} note={n} />
        ))}
        {secret.length > 0 && (
          <li>
            <InlineSpoiler label={`Show ${secret.length} late-game ${secret.length === 1 ? 'secret' : 'secrets'}`}>
              <ul className="space-y-2.5">
                {secret.map((n) => (
                  <Note key={n.text} note={n} />
                ))}
              </ul>
            </InlineSpoiler>
          </li>
        )}
      </ul>
    </Section>
  );
}

function Note({ note }: { note: MechanicNote }) {
  const fromFiles = note.source === DOCS;
  return (
    <li className="flex gap-2 text-[14px] leading-relaxed text-muted">
      <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 bg-gold/70" />
      <span>
        {note.text}{' '}
        {fromFiles ? (
          <span className="text-[11px] whitespace-nowrap text-faint">(game files)</span>
        ) : (
          <a href={note.source} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-[11px] whitespace-nowrap text-faint hover:text-gold">
            wiki <ExternalLink size={10} />
          </a>
        )}
      </span>
    </li>
  );
}
