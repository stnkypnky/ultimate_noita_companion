// Run history on the Run page: what this run discovered, its timeline, and past runs.
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { Gem, HeartCrack, MapPin, Package, Play, Skull, Sparkles, Star, Wand2 } from 'lucide-react';
import { useData } from '@/data/store';
import { Section } from '@/ui/controls';
import { AtlasIcon, SpellIcon } from '@/ui/GameIcon';
import { Sheet } from '@/ui/Sheet';
import { timeAgo, useNow } from '@/ui/time';
import { MaterialSwatch } from '@/features/materials/MaterialSwatch';
import { titleCase } from '@/features/materials/MaterialsPage';
import { encodeWand } from '@/features/wand/model';
import type { RunEvent, RunRecord } from './history';
import type { LiveRun, LiveWand } from './parse';
import type { OpenDetail } from './parts';
import { clock } from './runMath';
import { toBuilderWand } from './toBuilder';
import { useRuns } from './runs';

/** The history record of the run on screen (synced from the PC on other devices). */
export function useRunRecord(run: LiveRun | null): RunRecord | undefined {
  const records = useRuns((s) => s.records);
  return run ? records.find((r) => r.seed === run.seed && r.ngPlus === run.ngPlus) : undefined;
}

type Named = { name: string; icon: ReactNode; to?: string; detail?: Parameters<OpenDetail>[0] };

/** A spoiler key ("action_bomb", "enemy:zombie", "item:moon"…) as something to show. */
function useNamer() {
  const { spells, perks, enemyById, items, materialById } = useData();
  return useMemo(() => {
    const spellByFlag = new Map(spells.map((s) => [s.discoverFlag, s]));
    const perkByFlag = new Map(perks.map((p) => [p.discoverFlag, p]));
    const itemById = new Map(items.map((i) => [i.id, i]));
    return (key: string): Named | null => {
      const spell = spellByFlag.get(key);
      if (spell) return { name: spell.name, icon: <SpellIcon type={spell.type} icon={spell.icon} scale={1.5} />, detail: { kind: 'spell', id: spell.id } };
      const perk = perkByFlag.get(key);
      if (perk) return { name: perk.name, icon: <AtlasIcon atlas="perks" icon={perk.icon} scale={1} />, detail: { kind: 'perk', id: perk.id } };
      if (key.startsWith('enemy:')) {
        const e = enemyById.get(key.slice(6));
        return e ? { name: e.name, icon: <AtlasIcon atlas="enemies" icon={e.icon} scale={1} />, to: `/bestiary/${e.id}` } : null;
      }
      if (key.startsWith('item:') || key.startsWith('essence_')) {
        const it = itemById.get(key.startsWith('item:') ? key.slice(5) : key);
        return it ? { name: it.name, icon: it.icon.w ? <AtlasIcon atlas="items" icon={it.icon} scale={1} /> : <Package size={14} />, to: `/items/${it.id}` } : null;
      }
      if (key.startsWith('material:')) {
        const m = materialById.get(key.slice(9));
        return m ? { name: titleCase(m.name), icon: <MaterialSwatch material={m} size={16} />, detail: { kind: 'material', id: m.id } } : null;
      }
      return null;
    };
  }, [spells, perks, enemyById, items, materialById]);
}

function FoundChip({ k, onOpen }: { k: string; onOpen?: OpenDetail }) {
  const named = useNamer()(k);
  if (!named) return null;
  const cls = 'slot slot-hover inline-flex items-center gap-1.5 px-2 py-1 text-xs text-ink';
  if (named.detail && onOpen)
    return (
      <button onClick={() => onOpen(named.detail!)} className={cls}>
        {named.icon} {named.name}
      </button>
    );
  return (
    <Link to={named.to ?? (named.detail ? `/${named.detail.kind === 'spell' ? 'spells' : named.detail.kind === 'perk' ? 'perks' : 'materials'}/${named.detail.id}` : '#')} className={cls}>
      {named.icon} {named.name}
    </Link>
  );
}

const GROUPS: { label: string; test: (k: string) => boolean }[] = [
  { label: 'Spells', test: (k) => k.startsWith('action_') },
  { label: 'Perks', test: (k) => k.startsWith('perk_picked_') },
  { label: 'Creatures', test: (k) => k.startsWith('enemy:') },
  { label: 'Items', test: (k) => k.startsWith('item:') || k.startsWith('essence_') },
  { label: 'Materials', test: (k) => k.startsWith('material:') },
];

/** Everything this run found for the first time: now unlocked across the app. */
export function FoundThisRun({ rec, onOpen }: { rec: RunRecord | undefined; onOpen?: OpenDetail }) {
  return (
    <Section title="Found this run">
      {!rec?.found.length ? (
        <p className="text-sm text-muted">Nothing new yet. Spells, perks, creatures and secret items you find for the first time show up here, and open up across the companion.</p>
      ) : (
        <div className="space-y-2">
          {GROUPS.map((g) => {
            const keys = rec.found.filter(g.test);
            return keys.length ? (
              <div key={g.label}>
                <div className="mb-1 text-[11px] tracking-wide text-faint uppercase">
                  {g.label} <span className="text-toxic">+{keys.length}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {keys.map((k) => (
                    <FoundChip key={k} k={k} onOpen={onOpen} />
                  ))}
                </div>
              </div>
            ) : null;
          })}
        </div>
      )}
    </Section>
  );
}

function useEventText() {
  const { spellById, perkById } = useData();
  const namer = useNamer();
  return (e: RunEvent): { icon: ReactNode; text: string; tone?: string } => {
    switch (e.k) {
      case 'start':
        return { icon: <Play size={13} />, text: 'Run started' };
      case 'biome':
        return { icon: <MapPin size={13} className="text-ember" />, text: `Entered ${e.text ?? 'a new area'}` };
      case 'perk':
        return { icon: <Gem size={13} className="text-gold" />, text: `Took ${perkById.get(e.id ?? '')?.name ?? e.id}` };
      case 'spell':
        return { icon: <Sparkles size={13} className="text-arcane" />, text: `Picked up ${spellById.get(e.id ?? '')?.name ?? e.id}` };
      case 'wand':
        return { icon: <Wand2 size={13} />, text: 'Picked up a wand' };
      case 'item':
        return { icon: <Package size={13} />, text: `Picked up ${e.text && !e.text.startsWith('$') ? e.text : (e.id ?? 'an item').replace(/_/g, ' ')}` };
      case 'found':
        return { icon: <Star size={13} className="text-toxic" />, text: `Discovered ${namer(e.id ?? '')?.name ?? 'something new'}`, tone: 'text-toxic' };
      case 'hp_low':
        return { icon: <HeartCrack size={13} className="text-blood" />, text: 'Low health', tone: 'text-blood' };
      case 'died':
        return { icon: <Skull size={13} className="text-blood" />, text: e.text ? `Died, killed by ${killer(e.text)}` : 'Died', tone: 'text-blood' };
    }
  };
}

const killer = (s: string) => s.replace(/^\$animal_/, '').replace(/_/g, ' ');

/** Health over the run, as a thin line. */
function HpLine({ hp }: { hp: RunRecord['hp'] }) {
  if (hp.length < 2) return null;
  const t0 = hp[0]![0];
  const span = Math.max(1, hp.at(-1)![0] - t0);
  const pts = hp.map(([t, v, max]) => `${(((t - t0) / span) * 100).toFixed(2)},${(30 - (Math.min(1, v / Math.max(1, max)) * 28 + 1)).toFixed(2)}`).join(' ');
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-10 w-full" aria-label="Health over the run">
      <polyline points={pts} fill="none" stroke="#c3332b" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Timeline({ rec, limit = 40 }: { rec: RunRecord | undefined; limit?: number }) {
  const text = useEventText();
  const [all, setAll] = useState(false);
  if (!rec) return null;
  const events = [...rec.events].reverse();
  const shown = all ? events : events.slice(0, limit);
  return (
    <Section title="Timeline">
      <HpLine hp={rec.hp} />
      <ol className="mt-2 space-y-1">
        {shown.map((e, i) => {
          const t = text(e);
          return (
            <li key={i} className={`flex items-center gap-2 text-sm ${t.tone ?? 'text-muted'}`}>
              <span className="w-12 shrink-0 text-right font-mono text-[11px] text-faint tabular-nums">{clock((e.t - rec.startedAt) / 1000)}</span>
              <span className="grid w-4 place-items-center">{t.icon}</span>
              <span className="min-w-0 truncate">{t.text}</span>
            </li>
          );
        })}
      </ol>
      {events.length > shown.length && (
        <button onClick={() => setAll(true)} className="mt-2 text-xs text-muted hover:text-ink">
          Show all {events.length}
        </button>
      )}
    </Section>
  );
}

function Outcome({ rec }: { rec: RunRecord }) {
  if (rec.outcome === 'died') return <span className="text-blood">Died{rec.killedBy ? ` · ${killer(rec.killedBy)}` : ''}</span>;
  if (rec.outcome === 'ongoing') return <span className="text-toxic">In progress</span>;
  return <span className="text-muted">Ended</span>;
}

/** Earlier runs, newest first; tap one for its wands, perks, finds and timeline. */
export function PastRuns({ exclude }: { exclude?: string }) {
  const records = useRuns((s) => s.records);
  const { perkById } = useData();
  const now = useNow(60_000);
  const [open, setOpen] = useState<RunRecord | null>(null);
  const list = records.filter((r) => r.id !== exclude);
  if (!list.length) return null;
  return (
    <Section title="Past runs">
      <ul className="space-y-1.5">
        {list.map((r) => (
          <li key={r.id}>
            <button onClick={() => setOpen(r)} className="slot slot-hover w-full p-3 text-left">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <Outcome rec={r} />
                <span className="text-xs text-faint">
                  {timeAgo(r.startedAt, now)} · seed {r.seed}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                {r.deepest && (
                  <span>
                    {r.deepest} · {Math.round(r.maxDepth)} m
                  </span>
                )}
                {r.playtime !== undefined && <span>{clock(r.playtime)}</span>}
                {r.found.length > 0 && <span className="text-toxic">{r.found.length} discovered</span>}
                <span className="flex gap-0.5">
                  {r.perks.slice(0, 10).map((p) => {
                    const perk = perkById.get(p.id);
                    return perk ? <AtlasIcon key={p.id} atlas="perks" icon={perk.icon} scale={1} /> : null;
                  })}
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? `Run on seed ${open.seed}` : ''}>
        {open && <RunDetail rec={open} />}
      </Sheet>
    </Section>
  );
}

function RunDetail({ rec }: { rec: RunRecord }) {
  const { perkById } = useData();
  return (
    <div className="space-y-1">
      <p className="text-sm">
        <Outcome rec={rec} />
        <span className="text-faint">
          {' '}
          · {new Date(rec.startedAt).toLocaleString()} · on {rec.device}
        </span>
      </p>
      <p className="text-sm text-muted">
        {[
          rec.deepest && `${rec.deepest}, ${Math.round(rec.maxDepth)} m`,
          rec.playtime !== undefined && clock(rec.playtime),
          `${rec.gold} gold`,
          rec.kills !== undefined && `${rec.kills} kills`,
          rec.orbs ? `${rec.orbs} orb${rec.orbs > 1 ? 's' : ''}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {rec.wands.length > 0 && (
        <Section title="Wands">
          <div className="space-y-2">
            {rec.wands.map((w, i) => (
              <PastWand key={i} wand={w} />
            ))}
          </div>
        </Section>
      )}
      {rec.perks.length > 0 && (
        <Section title="Perks">
          <div className="flex flex-wrap gap-1.5">
            {rec.perks.map((p) => {
              const perk = perkById.get(p.id);
              return (
                <Link key={p.id} to={`/perks/${p.id}`} title={perk?.name ?? p.id} className="slot slot-hover relative grid h-10 w-10 place-items-center">
                  {perk ? <AtlasIcon atlas="perks" icon={perk.icon} scale={2} /> : <span className="text-[8px]">{p.id}</span>}
                  {p.count > 1 && <span className="absolute right-0.5 bottom-0 font-game text-[8px] text-gold">×{p.count}</span>}
                </Link>
              );
            })}
          </div>
        </Section>
      )}
      {rec.found.length > 0 && <FoundThisRun rec={rec} />}
      <Timeline rec={rec} limit={25} />
    </div>
  );
}

function PastWand({ wand }: { wand: LiveWand }) {
  const { spellById } = useData();
  const navigate = useNavigate();
  return (
    <div className="slot flex flex-wrap items-center gap-2 p-2">
      <div className="flex min-w-0 flex-1 flex-wrap gap-0.5">
        {[...wand.alwaysCasts, ...wand.spells.map((s) => s.id)].map((id, i) => {
          const s = spellById.get(id);
          return s ? (
            <span key={i} title={s.name} className="grid h-7 w-7 place-items-center bg-surface-2/60">
              <SpellIcon type={s.type} icon={s.icon} scale={1.5} />
            </span>
          ) : null;
        })}
        {!wand.spells.length && !wand.alwaysCasts.length && <span className="text-xs text-faint">Empty</span>}
      </div>
      <button
        onClick={() => void encodeWand(toBuilderWand(wand)).then((c) => navigate(`/wand#w=${c}`))}
        className="inline-flex items-center gap-1.5 btn-game quiet font-game text-[16px] px-2.5 py-1"
      >
        <Wand2 size={14} /> Open in builder
      </button>
    </div>
  );
}
