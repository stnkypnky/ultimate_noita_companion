import { Link } from 'react-router';
import { ArrowRight, Trophy } from 'lucide-react';
import { useData } from '@/data/store';
import { countedEnemies, type Progress, type RunWin } from '@/store/progress';
import { useRuns } from '@/features/live/runs';
import { clock } from '@/features/live/runMath';

export function useProgressCounts(progress: Progress | null) {
  const { spells, perks, enemies } = useData();
  const flags = new Set(progress?.flags ?? []);
  const seen = new Set(countedEnemies(progress));
  return {
    spells: [spells.filter((s) => flags.has(s.discoverFlag)).length, spells.length] as const,
    perks: [perks.filter((p) => flags.has(p.discoverFlag)).length, perks.length] as const,
    enemies: [enemies.filter((e) => seen.has(e.id)).length, enemies.length] as const,
    orbs: progress?.orbs.length ?? 0,
  };
}

const hours = (sec: number) => (sec >= 3600 ? `${Math.floor(sec / 3600)}h ${Math.round((sec % 3600) / 60)}m` : `${Math.round(sec / 60)}m`);

export function ProgressSummary({ progress }: { progress: Progress }) {
  const c = useProgressCounts(progress);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Meter label="Spells" value={c.spells[0]} max={c.spells[1]} color="var(--arcane)" />
        <Meter label="Perks" value={c.perks[0]} max={c.perks[1]} color="var(--gold)" />
        <Meter label="Creatures" value={c.enemies[0]} max={c.enemies[1]} color="var(--blood)" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Fact label="Orbs found" value={String(c.orbs)} />
        {progress.runs && (
          <>
            <Fact label="Runs" value={progress.runs.runs.toLocaleString()} />
            {progress.runs.wins && <Fact label="Wins" value={progress.runs.wins.length.toLocaleString()} gold={progress.runs.wins.length > 0} />}
            <Fact label="Play time" value={hours(progress.runs.playtimeSec)} />
            <Fact label="Kills" value={progress.runs.kills.toLocaleString()} />
          </>
        )}
      </div>
      {!!progress.runs?.wins?.length && <WinList wins={progress.runs.wins} />}
    </div>
  );
}

/** Every won run in the save, newest first; the ones the companion recorded open on the Run page. */
function WinList({ wins }: { wins: RunWin[] }) {
  const records = useRuns((s) => s.records);
  return (
    <div className="slot p-3">
      <h3 className="font-game-caps mb-2 flex items-center gap-1.5 text-[16px] text-gold">
        <Trophy size={15} /> Wins
      </h3>
      <ol className="space-y-1">
        {wins.map((w) => {
          const at = Date.parse(w.date);
          // The record whose start matches the save's session (within a few minutes: the session starts at the menu).
          const same = records.filter((r) => r.outcome === 'won' && r.seed === w.seed);
          const rec = same.find((r) => Math.abs(r.startedAt - at) < 15 * 60_000) ?? (same.length === 1 ? same[0] : undefined);
          const row = (
            <>
              <span className="text-ink">{Number.isFinite(at) ? new Date(at).toLocaleDateString(undefined, { dateStyle: 'medium' }) : w.date}</span>
              <span className="text-faint">
                Seed {w.seed} · {clock(w.playtimeSec)} · {w.kills.toLocaleString()} kills
              </span>
              {rec && <ArrowRight size={14} className="ml-auto text-muted" />}
            </>
          );
          return (
            <li key={`${w.date}-${w.seed}`}>
              {rec ? (
                <Link to={`/run/${encodeURIComponent(rec.id)}`} className="flex flex-wrap items-center gap-x-3 rounded px-1 py-0.5 text-sm hover:bg-surface-2">
                  {row}
                </Link>
              ) : (
                <div className="flex flex-wrap items-center gap-x-3 px-1 py-0.5 text-sm">{row}</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Meter({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max ? (value / max) * 100 : 0;
  return (
    <div className="slot p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted">{label}</span>
        <span className="font-semibold tabular-nums">
          {value}
          <span className="text-faint"> / {max}</span>
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function Fact({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="slot px-3 py-2">
      <div className="text-[11px] tracking-wide text-faint uppercase">{label}</div>
      <div className={`font-semibold tabular-nums ${gold ? 'text-gold' : ''}`}>{value}</div>
    </div>
  );
}
