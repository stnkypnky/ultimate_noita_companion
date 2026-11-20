// The live companion for the run you're playing: everything in hand, simulated and explained, plus what
// this seed holds. Data comes from the companion mod, read on the PC or relayed by a paired device.
// A recent run opens in the same view, as it was when it ended (/run/:id).
import { useState, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { Check, ClipboardCopy, Coins, Eye, Heart, Map as MapIcon, MapPin, Skull } from 'lucide-react';
import { ALCHEMY_KEY } from '@/data/spoilers';
import { useSpoilers } from '@/store/progress';
import { Page } from '@/ui/Page';
import { CollapsibleSection } from '@/ui/controls';
import { HudBar } from '@/ui/game';
import { useIsDesktop } from '@/ui/hooks';
import { LiveCrystal } from '@/ui/LiveCrystal';
import { timeAgo, useNow } from '@/ui/time';
import { RecipeCard } from '@/features/alchemy/AlchemyPage';
import { alchemyRecipes } from '@/features/alchemy/aplc';
import { ModInstall } from './ModInstall';
import { RunStats, useSeedCards } from './seedCards';
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

function RunView({ run, at, rec, past, status, switcher }: { run: LiveRun; at: number; rec?: RunRecord; past: boolean; status: ReactNode; switcher: ReactNode }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const desktop = useIsDesktop();
  const { active } = useLiveRun();
  const seed = useSeedCards(run, at, past);
  const waiting = !past && run.status === 'no_player';

  const wands = (
    <CollapsibleSection id="run-wands" title="Wands" defaultOpen summary={`${run.wands.length} wand${run.wands.length === 1 ? '' : 's'}`}>
      <Wands run={run} onOpen={setDetail} past={past} />
    </CollapsibleSection>
  );
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

  return (
    <Page title={past ? 'Run' : 'Current run'} subtitle={status} toolbar={!waiting && <Hud run={run} past={past} />}>
      {switcher}
      {waiting ? (
        <p className="panel mt-2 p-6 text-center text-sm text-muted">Noita is open — waiting for a run to start.</p>
      ) : desktop ? (
        <div className="grid gap-x-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
          <div>
            {wands}
            {bag}
            {found}
            {timeline}
          </div>
          <div>
            {stats}
            {flasks}
            {perks}
            {seed.map}
            {seed.mountain}
            {seed.fungal}
            {thisSeed}
            {update}
          </div>
        </div>
      ) : (
        // Phones and tablets: one column, what matters mid-fight first; everything but the wands starts folded.
        <div>
          {wands}
          {stats}
          {flasks}
          {perks}
          {bag}
          {seed.mountain}
          {seed.fungal}
          {seed.map}
          {found}
          {timeline}
          {thisSeed}
          {update}
        </div>
      )}
      <DetailSheet detail={detail} onClose={() => setDetail(null)} />
    </Page>
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

/** Health, gold and where you are: sticks under the title while you scroll. */
function Hud({ run, past }: { run: LiveRun; past: boolean }) {
  return (
    <div className="grid grid-cols-2 items-center gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,2fr)_auto_minmax(0,1.5fr)]">
      {run.hp !== undefined && run.maxHp ? (
        <div className="col-span-2 text-sm sm:col-span-1">
          <div className="flex items-center gap-1.5 text-muted">
            {run.status === 'dead' ? <Skull size={14} /> : <Heart size={14} className="text-blood" />}
            <span className="font-game text-[16px] text-ink">
              {Math.max(0, Math.round(run.hp))} / {Math.round(run.maxHp)}
            </span>
          </div>
          <HudBar value={Math.max(0, run.hp / run.maxHp)} color="#c3332b" className="mt-1.5" label="Health" />
        </div>
      ) : null}
      {run.gold !== undefined && (
        <div className="flex items-center gap-1.5 text-sm text-muted">
          <Coins size={14} className="text-gold" /> <span className="font-game text-[16px] text-ink">{run.gold}</span>
        </div>
      )}
      {run.biome && (
        <div className="flex min-w-0 items-center gap-1.5 text-sm text-muted">
          <MapPin size={14} className="shrink-0 text-ember" /> <span className="truncate text-ink">{run.biome.name}</span>
          {run.depth !== undefined && <span className="shrink-0 text-faint">· {Math.round(run.depth)} m{past ? ' deep' : ''}</span>}
        </div>
      )}
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
