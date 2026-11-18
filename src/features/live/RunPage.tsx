// The live companion for the run you're playing: everything in hand, simulated and explained, plus what
// this seed holds. Data comes from the companion mod, read on the PC or relayed by a paired device.
import { useState } from 'react';
import { Link } from 'react-router';
import { Check, ClipboardCopy, Coins, Eye, Heart, Map as MapIcon, MapPin, Skull } from 'lucide-react';
import { ALCHEMY_KEY } from '@/data/spoilers';
import { useSpoilers } from '@/store/progress';
import { Page } from '@/ui/Page';
import { Section } from '@/ui/controls';
import { HudBar } from '@/ui/game';
import { LiveCrystal } from '@/ui/LiveCrystal';
import { timeAgo, useNow } from '@/ui/time';
import { RecipeCard } from '@/features/alchemy/AlchemyPage';
import { alchemyRecipes } from '@/features/alchemy/aplc';
import { ModInstall } from './ModInstall';
import { RunStats, SeedCards } from './seedCards';
import { DetailSheet, Flasks, Perks, SpellButton, Wands, type Detail } from './parts';
import type { LiveRun } from './parse';
import { useLiveRun } from './state';

export function RunPage() {
  const { run, at, from, active } = useLiveRun();
  const [detail, setDetail] = useState<Detail | null>(null);
  if (!run) return <NoRun />;
  return (
    <Page title="Current run" subtitle={<RunStatus run={run} at={at} from={from} active={active} />} toolbar={run.status !== 'no_player' && <Hud run={run} />}>
      {run.status === 'no_player' ? (
        <p className="panel mt-2 p-6 text-center text-sm text-muted">Noita is open — waiting for a run to start.</p>
      ) : (
        <div className="grid gap-x-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
          <div>
            <Section title="Wands">
              <Wands run={run} onOpen={setDetail} />
            </Section>
            {run.spells.length > 0 && (
              <Section title="Spells in your bag">
                <div className="flex flex-wrap gap-0.5">
                  {run.spells.map((s, i) => (
                    <SpellButton key={i} spell={s} onOpen={setDetail} />
                  ))}
                </div>
              </Section>
            )}
          </div>
          <div>
            <RunStats run={run} at={at} active={active} />
            <Section title="Flasks">
              <Flasks run={run} onOpen={setDetail} />
            </Section>
            <Section title="Perks">
              <Perks run={run} onOpen={setDetail} />
            </Section>
            <SeedCards run={run} at={at} />
            {run.seed > 0 && <ThisSeed seed={run.seed} />}
            {!run.mod && (
              <p className="mt-4 text-xs text-faint">
                Update the companion mod (<Link to="/settings" className="text-muted underline hover:text-ink">Settings</Link>) for a live map, the next
                Holy Mountain, the fungal shift timer, run stats and creatures met.
              </p>
            )}
          </div>
        </div>
      )}
      <DetailSheet detail={detail} onClose={() => setDetail(null)} />
    </Page>
  );
}

function RunStatus({ run, at, from, active }: { run: LiveRun; at: number; from: string | null; active: boolean }) {
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

/** Health, gold and where you are: sticks under the title while you scroll. */
function Hud({ run }: { run: LiveRun }) {
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
          {run.depth !== undefined && <span className="shrink-0 text-faint">· {Math.round(run.depth)} m</span>}
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
    <Section title="This seed">
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
    </Section>
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
          this seed's secrets. Paired phones see it too.
        </p>
      </div>
      <Section title="Set up the companion mod">
        <ModInstall />
      </Section>
    </Page>
  );
}
