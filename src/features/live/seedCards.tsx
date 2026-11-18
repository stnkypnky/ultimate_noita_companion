// Run page cards that need the mod's newer fields (position, stats, fungal cooldown) and this seed's report:
// where you are on the map, the next Holy Mountain, the next fungal shift, and the run's numbers.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Clock, Crosshair, Hand, Loader2, Package, Skull } from 'lucide-react';
import { useData } from '@/data/store';
import type { WorldMap } from '@/data/types';
import { useProgress, useSpoilers } from '@/store/progress';
import { Section } from '@/ui/controls';
import { useNow } from '@/ui/time';
import { MapView } from '@/features/map/MapView';
import { MaterialName, PerkChip, ShopView } from '@/features/map/SeedPanel';
import { loadMap, makeVisibility } from '@/features/map/world';
import { useSeedLayers } from '@/features/map/useSeedLayers';
import { clock, nextMountain, picksBefore } from './runMath';
import { materialTable } from '@/seed/seed';
import { seedReport } from '@/seed/client';
import type { SeedReport } from '@/seed/worker';
import type { LiveRun } from './parse';

const MAX_SHIFTS = 20;

export function useWorldMap() {
  const [map, setMap] = useState<WorldMap | null>(null);
  useEffect(() => {
    let live = true;
    loadMap().then((m) => live && setMap(m), () => {});
    return () => {
      live = false;
    };
  }, []);
  return map;
}

/** The seed report for this run, recomputed only when the seed or the picks change. */
function useRunReport(seed: number, picks: string[][], map: WorldMap | null) {
  const { materials } = useData();
  const progress = useProgress((s) => s.progress);
  const [report, setReport] = useState<SeedReport | null>(null);
  const matTable = useMemo(() => materialTable(materials), [materials]);
  const picksKey = JSON.stringify(picks);
  useEffect(() => {
    if (!map || !seed) return;
    let live = true;
    seedReport({
      seed,
      materials: matTable,
      allUnlocked: !progress,
      flags: progress?.flags ?? [],
      deaths: progress?.runs?.deaths,
      picks: JSON.parse(picksKey) as string[][],
      shopSpots: map.shops,
    }).then(
      (r) => live && setReport(r),
      () => live && setReport(null),
    );
    return () => {
      live = false;
    };
    // progress is read for unlocks only; a re-sync mid-run shouldn't recompute the seed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, picksKey, map, matTable]);
  return report;
}

/** The cards that know where you are. Shown only with the newer mod (it sends a position). */
export function SeedCards({ run, at }: { run: LiveRun; at: number }) {
  const map = useWorldMap();
  const next = map && run.y !== undefined ? nextMountain(map, run.y) : null;
  const picks = useMemo(() => (next ? picksBefore(run, next) : []), [run, next]);
  const report = useRunReport(run.seed, picks, map);
  if (run.x === undefined || run.y === undefined) return null;
  return (
    <>
      {map && <MiniMap map={map} x={run.x} y={run.y} seed={run.seed} />}
      <NextMountain next={next} report={report} />
      {run.fungal && <NextFungal fungal={run.fungal} at={at} report={report} />}
    </>
  );
}

const mapSpoilersShown = () => {
  try {
    return localStorage.getItem('map-spoilers') === '1';
  } catch {
    return false;
  }
};

function MiniMap({ map, x, y, seed }: { map: WorldMap; x: number; y: number; seed: number }) {
  const { materialById } = useData();
  const { mode, visible } = useSpoilers();
  const orbs = useProgress((s) => s.progress?.orbs);
  const navigate = useNavigate();
  const vis = useMemo(() => {
    // The World Map's own "Show spoilers" switch counts here too, so both maps show the same.
    const base = makeVisibility(map, { all: mode === 'all' || mapSpoilersShown(), visible, orbs: orbs ?? [] });
    const here = base.chunkAt(x, y);
    // Where you're standing isn't a secret.
    return { ...base, biome: (b: Parameters<typeof base.biome>[0]) => b === here || base.biome(b) };
  }, [map, mode, visible, orbs, x, y]);
  const { layouts, wangColors } = useSeedLayers(seed > 0 ? seed : null);
  return (
    <Section title="Where you are">
      <div className="h-[300px]">
        <MapView
          map={map}
          vis={vis}
          materialById={materialById}
          selected={null}
          onSelect={(cx, cy) => navigate(`/map/${cx}-${cy}?seed=${seed}`)}
          marker={{ x, y }}
          follow
          layouts={layouts}
          wangColors={wangColors}
        />
      </div>
    </Section>
  );
}

function NextMountain({ next, report }: { next: number | null; report: SeedReport | null }) {
  if (next === null) return null;
  const offered = report?.perks.mountains[next - 1];
  const shop = report?.shops[next - 1];
  return (
    <Section title={`Next: Holy Mountain ${next}`}>
      {!report ? (
        <p className="flex items-center gap-2 text-sm text-faint">
          <Loader2 size={14} className="animate-spin" /> Reading this seed…
        </p>
      ) : (
        <div className="space-y-3">
          {offered && (
            <div className="flex flex-wrap gap-1.5">
              {offered.map((p, i) => (
                <PerkChip key={`${p}${i}`} id={p} />
              ))}
            </div>
          )}
          {shop && (
            <div>
              <div className="mb-1.5 text-xs text-muted">Shop: {shop.type === 'wand' ? 'wands' : 'spells'}</div>
              <ShopView items={shop.items} type={shop.type} />
            </div>
          )}
          <p className="text-[11px] text-faint">From the game's own scripts for this seed. After Extra Perk or Gamble the perks may differ.</p>
        </div>
      )}
    </Section>
  );
}

function NextFungal({ fungal, at, report }: { fungal: NonNullable<LiveRun['fungal']>; at: number; report: SeedReport | null }) {
  const now = useNow(1000);
  const left = Math.max(0, Math.round(fungal.readyIn - (now - at) / 1000));
  const shift = report?.fungal[fungal.count];
  return (
    <Section title="Next fungal shift">
      {fungal.count >= MAX_SHIFTS ? (
        <p className="text-sm text-muted">All {MAX_SHIFTS} shifts used this run.</p>
      ) : (
        <div className="slot space-y-2 p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted">
              Shift {fungal.count + 1} of {MAX_SHIFTS}
            </span>
            <span className={`font-game text-[16px] ${left ? 'text-muted' : 'text-toxic'}`}>{left ? `ready in ${clock(left)}` : 'ready now'}</span>
          </div>
          {shift ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {shift.from.map((m) => (
                <MaterialName key={m} id={m} />
              ))}
              <span className="text-faint">→</span>
              <MaterialName id={shift.to} />
              {shift.flask !== 'none' && (
                <span className="text-[11px] text-ember">holding a flask: it becomes {shift.flask === 'from' ? 'what changes' : 'what it turns into'}</span>
              )}
            </div>
          ) : (
            <p className="text-faint">Reading this seed…</p>
          )}
        </div>
      )}
    </Section>
  );
}

/** Play time, kills, orbs and carried items (mod 2). */
export function RunStats({ run, at, active }: { run: LiveRun; at: number; active: boolean }) {
  const { items } = useData();
  const now = useNow(1000);
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  if (run.playtime === undefined && run.kills === undefined && !run.items?.length) return null;
  const ticking = active && run.status === 'alive';
  const playtime = run.playtime !== undefined ? run.playtime + (ticking ? Math.max(0, (now - at) / 1000) : 0) : undefined;
  return (
    <Section title="This run">
      <div className="grid grid-cols-3 gap-2">
        {playtime !== undefined && <Stat icon={<Clock size={13} />} label="Time" value={clock(playtime)} />}
        {run.kills !== undefined && <Stat icon={<Crosshair size={13} />} label="Kills" value={String(run.kills)} />}
        {run.orbs !== undefined && <Stat icon={<span className="text-[11px]">◉</span>} label="Orbs" value={String(run.orbs)} />}
      </div>
      {run.status === 'dead' && run.killedBy && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-blood">
          <Skull size={14} /> Killed by {run.killedBy.replace(/^\$animal_/, '').replace(/_/g, ' ')}
        </p>
      )}
      {run.items && run.items.length > 0 && (
        <ul className="mt-3 space-y-1">
          {run.items.map((it, i) => {
            const known = itemById.get(it.id);
            return (
              <li key={i}>
                <Link to={known ? `/items/${it.id}` : '/items'} className="flex items-center gap-2 text-sm text-muted hover:text-ink">
                  {it.held ? <Hand size={14} className="text-toxic" /> : <Package size={14} className="text-faint" />}
                  <span className="truncate">{known?.name ?? (it.name && !it.name.startsWith('$') ? it.name : it.id.replace(/_/g, ' '))}</span>
                  {it.held && <span className="text-[11px] text-toxic">in hand</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="slot px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] tracking-wide text-faint uppercase">
        {icon}
        {label}
      </div>
      <div className="font-game mt-1 text-[20px] leading-none tabular-nums">{value}</div>
    </div>
  );
}
