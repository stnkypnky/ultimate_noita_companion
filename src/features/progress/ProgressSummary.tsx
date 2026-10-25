import { useData } from '@/data/store';
import type { Progress } from '@/store/progress';

export function useProgressCounts(progress: Progress | null) {
  const { spells, perks, enemies } = useData();
  const flags = new Set(progress?.flags ?? []);
  const seen = new Set(progress?.enemies ?? []);
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
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Fact label="Orbs found" value={String(c.orbs)} />
        {progress.runs && (
          <>
            <Fact label="Runs" value={progress.runs.runs.toLocaleString()} />
            <Fact label="Play time" value={hours(progress.runs.playtimeSec)} />
            <Fact label="Kills" value={progress.runs.kills.toLocaleString()} />
          </>
        )}
      </div>
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="slot px-3 py-2">
      <div className="text-[11px] tracking-wide text-faint uppercase">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}
