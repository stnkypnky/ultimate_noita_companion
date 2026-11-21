// The live companion for the run you're playing: everything in hand, simulated and explained, plus what
// this seed holds. Data comes from the companion mod, read on the PC or relayed by a paired device.
// A recent run opens in the same view, as it was when it ended (/run/:id).
import { useMemo, useState, type ReactNode } from 'react';
import { mergeSurface } from '@/features/map/ground';
import { Link, Navigate, useParams } from 'react-router';
import { Check, ClipboardCopy, Clock, Coins, Eye, Heart, Map as MapIcon, MapPin, Skull } from 'lucide-react';
import { ALCHEMY_KEY } from '@/data/spoilers';
import { useSpoilers } from '@/store/progress';
import { Page } from '@/ui/Page';
import { CollapsibleSection, Section, SectionStyleContext } from '@/ui/controls';
import { HudBar } from '@/ui/game';
import { useElementWidth, useIsDesktop, useIsShortLandscape, useIsTablet, useIsWide } from '@/ui/hooks';
import { LiveCrystal } from '@/ui/LiveCrystal';
import { timeAgo, useNow } from '@/ui/time';
import { RecipeCard } from '@/features/alchemy/AlchemyPage';
import { alchemyRecipes } from '@/features/alchemy/aplc';
import { ModInstall } from './ModInstall';
import { CarriedItems, RunStats, fungalLeft, playtimeNow, useSeedCards } from './seedCards';
import { FoundThisRun, RunSwitcher, Timeline, useRunRecord } from './historyParts';
import { DetailSheet, FlaskSummary, Flasks, PerkSummary, Perks, SpellButton, SpellSummary, Wands, type Detail } from './parts';
import { MAX_RUNS, snapshotOf, type RunRecord } from './history';
import { clock } from './runMath';
import { KilledBy } from './KilledBy';
import type { LiveRun } from './parse';
import { useRuns } from './runs';
import { useLiveRun } from './state';

/** /run: the game being played; with none, the latest recorded run. */
export function RunPage() {
  const { run, at, from, active } = useLiveRun();
  const rec = useRunRecord(run);
  const { records, loaded } = useRuns();
  if (!run) {
    if (!loaded) return null;
    return records[0] ? <Navigate to={`/run/${encodeURIComponent(records[0].id)}`} replace /> : <NoRun />;
  }
  return (
    <RunView
      run={run}
      at={at}
      rec={rec}
      past={false}
      status={<LiveStatus run={run} at={at} from={from} active={active} />}
      switcher={<RunSwitcher selected="live" liveId={rec?.id} active={active} />}
    />
  );
}

/** /run/:id: a recorded run, as it was when it ended (or was last seen). */
export function PastRunPage() {
  const { id = '' } = useParams();
  const { records, loaded } = useRuns();
  const { active, run } = useLiveRun();
  const liveRec = useRunRecord(run);
  const rec = records.find((r) => r.id === id);
  if (!loaded) return null;
  // The run being played right now lives at /run.
  if (rec && active && liveRec?.id === rec.id) return <Navigate to="/run" replace />;
  if (!rec)
    return (
      <Page title="Run" subtitle="Not kept any more">
        <p className="panel mt-2 p-6 text-center text-sm text-muted">
          Only the {MAX_RUNS} most recent runs are kept.{' '}
          <Link to="/run" className="text-gold hover:underline">
            Back to runs
          </Link>
        </p>
      </Page>
    );
  const snap = snapshotOf(rec);
  return (
    <RunView
      run={snap}
      at={rec.updatedAt}
      rec={rec}
      past
      status={<PastStatus rec={rec} />}
      switcher={<RunSwitcher selected={rec.id} liveId={liveRec?.id} active={active} />}
    />
  );
}

type Tab = 'wands' | 'inventory' | 'seed' | 'log';
const TABS: { id: Tab; label: string }[] = [
  { id: 'wands', label: 'Wands' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'seed', label: 'Seed' },
  { id: 'log', label: 'Log' },
];
/** A remembered tab: the phone's tab, or the side pane's on a landscape tablet. */
function useStoredTab(key: string, fallback: Tab): [Tab, (t: Tab) => void] {
  const [tab, setTab] = useState<Tab>(() => {
    try {
      const t = localStorage.getItem(key);
      return TABS.some((x) => x.id === t) ? (t as Tab) : fallback;
    } catch {
      return fallback;
    }
  });
  const set = (t: Tab) => {
    setTab(t);
    try {
      localStorage.setItem(key, t);
    } catch {
      /* this visit only */
    }
  };
  return [tab, set];
}

/** The landscape dashboard's columns scroll on their own, filling the height under the title bar. */
const PANE = 'scrollbar-thin sticky top-[calc(var(--page-header-h,88px)+4px)] h-[calc(100dvh-var(--page-header-h,88px)-16px)] min-w-0 overflow-y-auto overscroll-contain pr-1';
/** Wide enough (after the menu) for wands, inventory and the seed side by side. */
const THREE_PANES = 1100;

function RunView({ run, at, rec, past, status, switcher }: { run: LiveRun; at: number; rec?: RunRecord; past: boolean; status: ReactNode; switcher: ReactNode }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [tab, setTabState] = useStoredTab('run-tab', 'wands');
  const setTab = (t: Tab) => {
    setTabState(t);
    scrollTo({ top: 0 });
  };
  const [sideTabState, setSideTab] = useStoredTab('run-side-tab', 'inventory');
  const desktop = useIsDesktop();
  const wide = useIsWide();
  const tablet = useIsTablet();
  const landscape = useIsShortLandscape();
  const [measure, width] = useElementWidth();
  const three = width >= THREE_PANES;
  // With three panes the inventory has a column of its own, so the side pane holds only the seed and the log.
  const sideTabs = three ? TABS.filter((t) => t.id === 'seed' || t.id === 'log') : TABS.filter((t) => t.id !== 'wands');
  const sideTab = sideTabs.some((t) => t.id === sideTabState) ? sideTabState : sideTabs[0]!.id;
  const { active } = useLiveRun();
  const now = useNow(1000);
  // The ground line sampled this run, kept on the record across game restarts.
  const recGround = rec?.seed === run.seed ? rec.last?.surface : undefined;
  const ground = useMemo(() => mergeSurface(recGround, run.surface), [recGround, run.surface]);
  // On a phone the map has a tab of its own, so it can take most of the screen.
  // In the landscape dashboard it shares a short column, so about half the height.
  const mapHeight = landscape ? Math.max(260, Math.round(innerHeight * 0.5)) : desktop ? 320 : Math.max(280, Math.round(innerHeight * 0.55));
  const seed = useSeedCards(run, at, past, mapHeight, ground);
  const waiting = !past && run.status === 'no_player';

  const wands = <Wands run={run} onOpen={setDetail} past={past} />;
  const bag = run.spells.length > 0 && (
    <CollapsibleSection id="run-bag" title="Spells in your bag" summary={<SpellSummary run={run} />}>
      <div className="flex flex-wrap gap-0.5">
        {run.spells.map((s, i) => (
          <SpellButton key={i} spell={s} onOpen={setDetail} />
        ))}
      </div>
    </CollapsibleSection>
  );
  const stats = <RunStats run={run} at={at} active={!past && active} />;
  const flasks = (
    <CollapsibleSection id="run-flasks" title="Flasks" summary={<FlaskSummary run={run} />}>
      <Flasks run={run} onOpen={setDetail} />
    </CollapsibleSection>
  );
  const perks = (
    <CollapsibleSection id="run-perks" title="Perks" summary={<PerkSummary run={run} />}>
      <Perks run={run} onOpen={setDetail} />
    </CollapsibleSection>
  );
  const found = <FoundThisRun rec={rec} onOpen={setDetail} />;
  const timeline = <Timeline rec={rec} />;
  const thisSeed = run.seed > 0 && <ThisSeed seed={run.seed} />;
  const update = !run.mod && !past && (
    <p className="mt-4 text-xs text-faint">
      Update the companion mod (<Link to="/settings" className="text-muted underline hover:text-ink">Settings</Link>) for a live map, the next Holy
      Mountain, the fungal shift timer, run stats and creatures met.
    </p>
  );

  const items = <CarriedItems run={run} />;
  const fungal = fungalLeft(run, at, now);
  const badges: Partial<Record<Tab, 'dot' | number>> = { seed: fungal === 0 ? 'dot' : undefined, log: rec?.found.length || undefined };
  const seedBlocks = (
    <>
      {seed.mountain}
      {seed.fungal}
      {seed.map}
      {thisSeed}
    </>
  );

  let body: ReactNode;
  if (waiting) {
    body = <p className="panel mt-2 p-6 text-center text-sm text-muted">Noita is open — waiting for a run to start.</p>;
  } else if (landscape) {
    // A landscape tablet: everything on one screen, no page scrolling. The wands always show; each column scrolls
    // by itself; the side column switches between the rest with its own tabs.
    const inventory = (
      <>
        {flasks}
        {perks}
        {items}
      </>
    );
    body = (
      <div
        ref={measure}
        className={`grid items-start gap-x-4 ${three ? 'grid-cols-[minmax(0,1fr)_300px_360px]' : 'grid-cols-[minmax(0,1fr)_minmax(340px,42%)]'}`}
      >
        <div className={PANE}>
          <Section title={`Wands (${run.wands.length})`}>{wands}</Section>
          {bag}
          {update}
        </div>
        {three && <div className={PANE}>{inventory}</div>}
        <div className={PANE}>
          <div className="sticky top-0 z-10 bg-bg pt-2 pr-1.5 pb-1">
            <RunTabBar tabs={sideTabs} tab={sideTab} onTab={setSideTab} badges={badges} />
          </div>
          {sideTab === 'inventory' && inventory}
          {sideTab === 'seed' && (
            <>
              {seed.mountain}
              {seed.fungal}
              {seed.map}
              {thisSeed}
            </>
          )}
          {sideTab === 'log' && (
            <>
              {stats}
              {found}
              {timeline}
            </>
          )}
        </div>
      </div>
    );
  } else if (desktop) {
    // A dashboard: everything open at once. Wands take the free width (side by side as it grows); inventory and
    // the seed get columns of their own on wide screens.
    body = (
      <div className={`grid gap-x-6 ${wide ? 'grid-cols-[minmax(0,1fr)_340px_380px]' : 'grid-cols-[minmax(0,1fr)_340px]'}`}>
        <div className="min-w-0">
          <Section title={`Wands (${run.wands.length})`}>{wands}</Section>
          {bag}
          {found}
          {timeline}
        </div>
        <div className="min-w-0">
          {stats}
          {flasks}
          {perks}
          {items}
          {!wide && seedBlocks}
          {!wide && update}
        </div>
        {wide && (
          <div className="min-w-0">
            {seedBlocks}
            {update}
          </div>
        )}
      </div>
    );
  } else {
    // Phones and tablets: one topic per tab, the tabs pinned under the HUD; a tablet lays a tab out in two columns.
    const two = tablet ? 'grid grid-cols-2 items-start gap-x-6' : '';
    body = (
      <div className="pt-1">
        {tab === 'wands' && wands}
        {tab === 'inventory' && (
          <div className={two}>
            <div className="min-w-0">
              {flasks}
              {items}
            </div>
            <div className="min-w-0">
              {perks}
              {bag}
            </div>
          </div>
        )}
        {tab === 'seed' && (
          <div className={two}>
            <div className="min-w-0">
              {seed.mountain}
              {seed.fungal}
              {thisSeed}
            </div>
            <div className="min-w-0">{seed.map}</div>
          </div>
        )}
        {tab === 'log' && (
          <div className={two}>
            <div className="min-w-0">
              {stats}
              {found}
            </div>
            <div className="min-w-0">{timeline}</div>
          </div>
        )}
        {update}
      </div>
    );
  }

  const toolbar = landscape ? (
    // The landscape dashboard fills the height, so the run picker moves up beside the HUD, all on one line.
    <div className="flex items-center gap-4">
      <div className="min-w-0 flex-1">{!waiting && <Hud run={run} at={at} past={past} fungal={fungal} oneLine />}</div>
      <div className="max-w-[40%] min-w-0 [&>nav]:mt-0 [&>nav]:pb-0">{switcher}</div>
    </div>
  ) : (
    !waiting && (
      <>
        <Hud run={run} at={at} past={past} fungal={fungal} />
        {!desktop && <RunTabBar tabs={TABS} tab={tab} onTab={setTab} badges={badges} />}
      </>
    )
  );

  return (
    <Page full dense={landscape} title={past ? 'Run' : 'Current run'} subtitle={status} toolbar={toolbar}>
      {!landscape && switcher}
      <SectionStyleContext.Provider value="card">{body}</SectionStyleContext.Provider>
      <DetailSheet detail={detail} onClose={() => setDetail(null)} />
    </Page>
  );
}

/** The Run page's sections on phones and tablets, pinned under the HUD (or atop the landscape side column). */
function RunTabBar({ tabs, tab, onTab, badges }: { tabs: typeof TABS; tab: Tab; onTab: (t: Tab) => void; badges: Partial<Record<Tab, 'dot' | number>> }) {
  return (
    <div role="tablist" aria-label="Run sections" className="grid auto-cols-fr grid-flow-col gap-1">
      {tabs.map((t) => {
        const b = badges[t.id];
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => onTab(t.id)}
            className={`btn-game font-game relative flex min-h-10 items-center justify-center px-1 text-[16px] ${tab === t.id ? '' : 'quiet'}`}
          >
            {t.label}
            {b === 'dot' && <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-toxic" aria-label="(ready)" />}
            {typeof b === 'number' && <span className="absolute -top-1 -right-1 rounded-full bg-toxic px-1 text-[10px] leading-4 text-bg">{b}</span>}
          </button>
        );
      })}
    </div>
  );
}

function LiveStatus({ run, at, from, active }: { run: LiveRun; at: number; from: string | null; active: boolean }) {
  const now = useNow(10_000);
  const label = !active ? `Game closed? Last seen ${timeAgo(at, now)}` : run.status === 'dead' ? 'You died' : run.status === 'paused' ? 'Paused' : 'Live';
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <LiveCrystal size={16} off={!active || run.status === 'dead'} />
      <span className={active && run.status === 'alive' ? 'text-toxic' : run.status === 'dead' ? 'text-blood' : ''}>{label}</span>
      {from && <span className="text-faint">· from {from}</span>}
      {run.ngPlus > 0 && <span className="text-faint">· NG+{run.ngPlus > 1 ? run.ngPlus : ''}</span>}
    </span>
  );
}

function PastStatus({ rec }: { rec: RunRecord }) {
  const now = useNow(60_000);
  const label =
    rec.outcome === 'died'
      ? 'Died'
      : rec.outcome === 'ended'
        ? 'Ended'
        : `Game closed · last seen ${timeAgo(rec.updatedAt, now)}`;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {rec.outcome === 'died' ? <Skull size={15} className="text-blood" /> : <LiveCrystal size={16} off />}
      <span className={rec.outcome === 'died' ? 'text-blood' : ''}>
        {label}
        {rec.outcome === 'died' && rec.killedBy && (
          <>
            {' · killed by '}
            <KilledBy text={rec.killedBy} seed={rec.seed} at={rec.endedAt ?? rec.startedAt} />
          </>
        )}
      </span>
      <span className="text-faint">
        · {new Date(rec.startedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
        {rec.playtime !== undefined && ` · ${clock(rec.playtime)}`}
        {rec.ngPlus > 0 && ` · NG+${rec.ngPlus > 1 ? rec.ngPlus : ''}`}
      </span>
    </span>
  );
}

/**
 * Health, gold, where you are, play time and the fungal shift: sticks under the title while you scroll. Two lines
 * on a phone, one on a wide screen.
 */
function Hud({ run, at, past, fungal, oneLine }: { run: LiveRun; at: number; past: boolean; fungal: number | null; oneLine?: boolean }) {
  const { active } = useLiveRun();
  const now = useNow(1000);
  const playtime = playtimeNow(run, at, now, !past && active);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted">
      {run.hp !== undefined && run.maxHp ? (
        <div className={`flex flex-1 items-center gap-2 ${oneLine ? 'max-w-xs min-w-[140px]' : 'min-w-[220px] lg:max-w-md'}`}>
          {run.status === 'dead' ? <Skull size={14} className="shrink-0" /> : <Heart size={14} className="shrink-0 text-blood" />}
          <span className="font-game shrink-0 text-[16px] text-ink tabular-nums">
            {Math.max(0, Math.round(run.hp))}/{Math.round(run.maxHp)}
          </span>
          <HudBar value={Math.max(0, run.hp / run.maxHp)} color="#c3332b" className="flex-1" label="Health" />
        </div>
      ) : null}
      {run.gold !== undefined && (
        <span className="inline-flex items-center gap-1.5">
          <Coins size={14} className="text-gold" /> <span className="font-game text-[16px] text-ink tabular-nums">{run.gold}</span>
        </span>
      )}
      {/* The second line on a phone: place, time, fungal shift. */}
      <div className={`flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 ${oneLine ? 'basis-auto' : 'basis-full lg:basis-auto'}`}>
        {run.biome && (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <MapPin size={14} className="shrink-0 text-ember" /> <span className="truncate text-ink">{run.biome.name}</span>
            {run.depth !== undefined && <span className="shrink-0 text-faint">· {Math.round(run.depth)} m{past ? ' deep' : ''}</span>}
          </span>
        )}
        {playtime !== undefined && (
          <span className="inline-flex items-center gap-1.5">
            <Clock size={14} className="text-faint" /> <span className="text-ink tabular-nums">{clock(playtime)}</span>
          </span>
        )}
        {!past && fungal !== null && (
          <span className={`rounded px-1.5 py-0.5 text-xs ${fungal === 0 ? 'bg-toxic/15 text-toxic' : 'bg-surface-2 text-muted'}`} title="Next fungal shift">
            {fungal === 0 ? 'Shift ready' : `Shift in ${clock(fungal)}`}
          </span>
        )}
      </div>
    </div>
  );
}

function ThisSeed({ seed }: { seed: number }) {
  const { visible, reveal } = useSpoilers();
  const [copied, setCopied] = useState(false);
  const recipes = visible(ALCHEMY_KEY) ? alchemyRecipes(seed) : null;
  return (
    <CollapsibleSection id="run-seed" title="This seed" summary={<span className="font-mono">{seed}</span>}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              void navigator.clipboard.writeText(String(seed));
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-raised px-3 py-1.5 font-mono text-sm text-muted hover:text-ink"
            title="Copy seed"
          >
            {seed} {copied ? <Check size={14} className="text-toxic" /> : <ClipboardCopy size={14} />}
          </button>
          <Link to={`/map?seed=${seed}`} className="inline-flex items-center gap-1.5 btn-game quiet font-game text-[16px] px-3 py-1.5">
            <MapIcon size={15} /> Holy Mountains & shops
          </Link>
        </div>
        {recipes ? (
          <>
            <RecipeCard title="Lively Concoction" recipe={recipes.lc} />
            <RecipeCard title="Alchemic Precursor" recipe={recipes.ap} />
          </>
        ) : (
          <button onClick={() => reveal(ALCHEMY_KEY)} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
            <Eye size={14} /> Reveal this seed's secret alchemy recipes
          </button>
        )}
      </div>
    </CollapsibleSection>
  );
}

function NoRun() {
  return (
    <Page title="Run" subtitle="The live view of the run you're playing">
      <div className="panel mt-2 flex flex-col items-center p-6 text-center">
        <LiveCrystal size={40} off />
        <h2 className="mt-3 font-game text-[24px]">No game running</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">
          Start Noita with the companion mod and this page lights up: your health, wands with their damage simulated, flasks, perks and
          this seed's secrets. Paired phones see it too, and your last {MAX_RUNS} runs stay here to look back on.
        </p>
      </div>
      <section className="mt-5">
        <h3 className="font-game-caps mb-2 text-[16px] text-gold/80">Set up the companion mod</h3>
        <ModInstall />
      </section>
    </Page>
  );
}
