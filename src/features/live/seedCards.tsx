// Run page cards that need the mod's newer fields (position, stats, fungal cooldown) and this seed's report:
// where you are on the map, the next Holy Mountain, the next fungal shift, and the run's numbers.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Clock, Crosshair, Hand, Loader2, Package, Skull } from 'lucide-react';
import { useData } from '@/data/store';
import type { WorldMap } from '@/data/types';
import { useProgress, useSpoilers } from '@/store/progress';
import { CollapsibleSection } from '@/ui/controls';
import { AtlasIcon } from '@/ui/GameIcon';
import { useNow } from '@/ui/time';
import { MapView, POI_COLOR, type MarkerKind } from '@/features/map/MapView';
import { poiCentre, poiDirection } from '@/features/map/pois';
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

/**
 * The cards that know where you are. Shown only with the newer mod (it sends a position). A past run shows
 * where it ended and what it went through instead of what's next.
 */
export function useSeedCards(run: LiveRun, at: number, past: boolean) {
  const map = useWorldMap();
  const next = map && run.y !== undefined ? nextMountain(map, run.y) : null;
  const picks = useMemo(() => (next ? picksBefore(run, next) : []), [run, next]);
  const report = useRunReport(run.seed, picks, map);
  if (run.x === undefined || run.y === undefined) return { map: null, mountain: null, fungal: null };
  const marker = past ? (run.status === 'dead' ? 'died' : 'last') : 'here';
  return {
    map: map && <MiniMap map={map} x={run.x} y={run.y} seed={run.seed} kind={marker} biome={run.biome?.name} />,
    mountain: past ? <MountainsReached next={next} seed={run.seed} /> : <NextMountain next={next} report={report} />,
    fungal: run.fungal ? past ? <FungalsDone count={run.fungal.count} report={report} /> : <NextFungal fungal={run.fungal} at={at} report={report} /> : null,
  };
}

const mapSpoilersShown = () => {
  try {
    return localStorage.getItem('map-spoilers') === '1';
  } catch {
    return false;
  }
};

const MARKER_TITLE = { here: 'Where you are', died: 'Where you died', last: 'Where you left off' } as const;

function MiniMap({ map, x, y, seed, kind, biome }: { map: WorldMap; x: number; y: number; seed: number; kind: MarkerKind; biome?: string }) {
  const { materialById } = useData();
  const { mode, visible } = useSpoilers();
  const orbs = useProgress((s) => s.progress?.orbs);
  const enemies = useProgress((s) => s.progress?.enemies);
  const navigate = useNavigate();
  const vis = useMemo(() => {
    // The World Map's own "Show spoilers" switch counts here too, so both maps show the same.
    const base = makeVisibility(map, { all: mode === 'all' || mapSpoilersShown(), visible, orbs: orbs ?? [], enemies });
    const here = base.chunkAt(x, y);
    // Where you're standing isn't a secret.
    return { ...base, biome: (b: Parameters<typeof base.biome>[0]) => b === here || base.biome(b) };
  }, [map, mode, visible, orbs, enemies, x, y]);
  const { layouts, wangColors, pois } = useSeedLayers(seed > 0 ? seed : null, map);
  // The closest points of interest you could see on the map (spoilers stay hidden), nearest first.
  const near = useMemo(() => {
    if (!pois) return [];
    return pois
      .filter((p) => {
        const c = poiCentre(p);
        const at = base(map, c.x, c.y);
        return at !== null && vis.biome(at) && (!p.scene || vis.scene(p.scene));
      })
      .map((p) => ({ p, d: Math.hypot(poiCentre(p).x - x, poiCentre(p).y - y) }))
      .filter((n) => n.d < NEAR_PX)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3);
  }, [pois, map, vis, x, y]);
  const summary = near[0] ? `${near[0].p.name} · ${poiDirection({ x, y }, near[0].p)}` : biome;
  return (
    <CollapsibleSection id="run-map" title={MARKER_TITLE[kind]} summary={summary}>
      {/* As tall as the map's own minimum height, so it doesn't spill over the list below. */}
      <div className="h-[320px]">
        <MapView
          map={map}
          vis={vis}
          materialById={materialById}
          selected={null}
          onSelect={(cx, cy) => navigate(`/map/${cx}-${cy}?seed=${seed}`)}
          marker={{ x, y }}
          markerKind={kind}
          follow
          layouts={layouts}
          wangColors={wangColors}
          pois={pois}
        />
      </div>
      {near.length > 0 && (
        <ul className="mt-2 space-y-1">
          {near.map(({ p }) => (
            <li key={p.id} className="flex items-baseline gap-2 text-sm" title={p.text}>
              <span className="h-2 w-2 shrink-0 translate-y-[-1px] rotate-45" style={{ background: POI_COLOR[p.kind] }} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-ink">{p.name}</span>
              <span className="shrink-0 text-xs text-muted">{poiDirection({ x, y }, p)}</span>
            </li>
          ))}
        </ul>
      )}
    </CollapsibleSection>
  );
}

/** Points of interest further than this (world pixels, about two chunks) aren't "nearby". */
const NEAR_PX = 1100;
/** The biome at a world position, or null outside the map. */
function base(map: WorldMap, x: number, y: number) {
  const cx = Math.floor(x / map.chunk + map.w / 2);
  const cy = Math.floor(y / map.chunk + map.offsetY);
  return cx < 0 || cy < 0 || cx >= map.w || cy >= map.h ? null : map.biomes[map.cells[cy * map.w + cx]!]!;
}

/** A past run: how far down it got, with this seed's mountains a tap away. */
function MountainsReached({ next, seed }: { next: number | null; seed: number }) {
  const reached = next === null ? 7 : next - 1;
  return (
    <CollapsibleSection id="run-mountains" title="Holy Mountains" summary={`${reached} reached`}>
      <p className="text-sm text-muted">
        {reached ? `Reached ${reached} of the 7 Holy Mountains.` : 'Ended before the first Holy Mountain.'}{' '}
        <Link to={`/map?seed=${seed}#seed`} className="text-gold hover:underline">
          This seed's perks and shops
        </Link>
      </p>
    </CollapsibleSection>
  );
}

/** A past run: the fungal shifts it went through. */
function FungalsDone({ count, report }: { count: number; report: SeedReport | null }) {
  const done = report?.fungal.slice(0, count) ?? [];
  return (
    <CollapsibleSection id="run-fungal" title="Fungal shifts" summary={`${count} this run`}>
      {!count ? (
        <p className="text-sm text-muted">No fungal shifts this run.</p>
      ) : (
        <ol className="space-y-1.5">
          {done.map((shift, i) => (
            <li key={i} className="slot flex flex-wrap items-center gap-x-2 gap-y-1 p-2 text-sm">
              <span className="w-6 text-faint">{i + 1}.</span>
              {shift.from.map((m) => (
                <MaterialName key={m} id={m} />
              ))}
              <span className="text-faint">→</span>
              <MaterialName id={shift.to} />
            </li>
          ))}
          {!report && <li className="text-faint">Reading this seed…</li>}
        </ol>
      )}
    </CollapsibleSection>
  );
}

function NextMountain({ next, report }: { next: number | null; report: SeedReport | null }) {
  const { perkById } = useData();
  if (next === null) return null;
  const offered = report?.perks.mountains[next - 1];
  const shop = report?.shops[next - 1];
  const summary = offered?.slice(0, 6).map((p, i) => {
    const perk = perkById.get(p);
    return perk ? <AtlasIcon key={`${p}${i}`} atlas="perks" icon={perk.icon} scale={1} /> : null;
  });
  return (
    <CollapsibleSection id="run-next-mountain" title={`Next: Holy Mountain ${next}`} summary={summary}>
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
    </CollapsibleSection>
  );
}

function NextFungal({ fungal, at, report }: { fungal: NonNullable<LiveRun['fungal']>; at: number; report: SeedReport | null }) {
  const now = useNow(1000);
  const left = Math.max(0, Math.round(fungal.readyIn - (now - at) / 1000));
  const shift = report?.fungal[fungal.count];
  const summary = fungal.count >= MAX_SHIFTS ? 'all used' : left ? `ready in ${clock(left)}` : <span className="text-toxic">ready now</span>;
  return (
    <CollapsibleSection id="run-fungal" title="Next fungal shift" summary={summary}>
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
    </CollapsibleSection>
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
  const summary = [playtime !== undefined && clock(playtime), run.kills !== undefined && `${run.kills} kills`].filter(Boolean).join(' · ');
  return (
    <CollapsibleSection id="run-stats" title="This run" summary={summary}>
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
    </CollapsibleSection>
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
