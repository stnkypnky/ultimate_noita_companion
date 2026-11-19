// Run history on the Run page: what this run discovered, its timeline, and the switcher between runs.
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Flag, Gem, HeartCrack, MapPin, Package, Play, Skull, Sparkles, Star, Wand2 } from 'lucide-react';
import { useData } from '@/data/store';
import { CollapsibleSection } from '@/ui/controls';
import { AtlasIcon, SpellIcon } from '@/ui/GameIcon';
import { LiveCrystal } from '@/ui/LiveCrystal';
import { timeAgo, useNow } from '@/ui/time';
import { MaterialSwatch } from '@/features/materials/MaterialSwatch';
import { titleCase } from '@/features/materials/MaterialsPage';
import type { RunEvent, RunRecord } from './history';
import type { LiveRun } from './parse';
import type { OpenDetail } from './parts';
import { clock, killedByText } from './runMath';
import { useRuns } from './runs';
import { useWorldMap } from './seedCards';
import { biomeKey, biomeName } from '@/features/map/world';

/** The history record of the run on screen (synced from the PC on other devices). */
export function useRunRecord(run: LiveRun | null): RunRecord | undefined {
  const records = useRuns((s) => s.records);
  return run ? records.find((r) => r.seed === run.seed && r.ngPlus === run.ngPlus) : undefined;
}

type Named = { name: string; icon: ReactNode; to?: string; detail?: Parameters<OpenDetail>[0] };

/** A spoiler key ("action_bomb", "enemy:zombie", "item:moon", "map:lavalake"…) as something to show. */
function useNamer() {
  const { spells, perks, enemyById, items, materialById } = useData();
  const map = useWorldMap();
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
      if (key.startsWith('map:') && map) {
        const k = map.biomes.findIndex((b) => biomeKey(b) === key);
        const at = map.cells.indexOf(k);
        if (k < 0 || at < 0) return null;
        return { name: biomeName(map.biomes[k]!), icon: <MapPin size={14} className="text-ember" />, to: `/map/${at % map.w}-${Math.floor(at / map.w)}` };
      }
      return null;
    };
  }, [spells, perks, enemyById, items, materialById, map]);
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
  { label: 'Areas', test: (k) => k.startsWith('map:') },
];

/** Everything this run found for the first time: now unlocked across the app. */
export function FoundThisRun({ rec, onOpen }: { rec: RunRecord | undefined; onOpen?: OpenDetail }) {
  const summary = rec?.found.length
    ? GROUPS.flatMap((g) => {
        const n = rec.found.filter(g.test).length;
        return n ? [`+${n} ${g.label.toLowerCase()}`] : [];
      }).join(' · ')
    : 'nothing new yet';
  return (
    <CollapsibleSection id="run-found" title="Found this run" summary={<span className={rec?.found.length ? 'text-toxic' : ''}>{summary}</span>}>
      {!rec?.found.length ? (
        <p className="text-sm text-muted">Nothing new yet. Spells, perks, creatures, secret items and hidden areas you find for the first time show up here, and open up across the companion.</p>
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
    </CollapsibleSection>
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

const killer = killedByText;

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
    <CollapsibleSection id="run-timeline" title="Timeline" summary={`${events.length} event${events.length === 1 ? '' : 's'}`}>
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
    </CollapsibleSection>
  );
}


/**
 * Pick a run to look at: the live one (while a game runs) and the recent ones, newest first. Each opens in the
 * same Run page, as it was when it ended.
 */
export function RunSwitcher({ selected, liveId, active }: { selected: string | 'live'; liveId?: string; active: boolean }) {
  const records = useRuns((s) => s.records);
  const now = useNow(60_000);
  const past = records.filter((r) => !(active && r.id === liveId));
  if (!past.length && !active) return null;
  const chip = (on: boolean) =>
    `slot slot-hover inline-flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 text-xs whitespace-nowrap ${on ? 'text-ink ring-1 ring-gold/60' : 'text-muted'}`;
  return (
    <nav aria-label="Runs" className="scrollbar-thin -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {active && (
        <Link to="/run" className={chip(selected === 'live')} aria-current={selected === 'live' ? 'page' : undefined}>
          <LiveCrystal size={14} /> <span className="text-toxic">Live</span>
        </Link>
      )}
      {past.map((r) => (
        <Link key={r.id} to={`/run/${encodeURIComponent(r.id)}`} className={chip(selected === r.id)} aria-current={selected === r.id ? 'page' : undefined}>
          {r.outcome === 'died' ? <Skull size={13} className="text-blood" /> : r.outcome === 'ongoing' ? <LiveCrystal size={14} off /> : <Flag size={13} className="text-faint" />}
          <span>{r.deepest ?? `Seed ${r.seed}`}</span>
          {r.playtime !== undefined && <span className="text-faint">{clock(r.playtime)}</span>}
          <span className="text-faint">· {timeAgo(r.endedAt ?? r.updatedAt, now)}</span>
        </Link>
      ))}
    </nav>
  );
}

