// Home's "Run in progress" strip while a game is running; the full view is on the Run page.
import { Link } from 'react-router';
import { motion } from 'motion/react';
import { ArrowRight, Coins, MapPin, Skull } from 'lucide-react';
import { HudBar } from '@/ui/game';
import { LiveCrystal } from '@/ui/LiveCrystal';
import { timeAgo, useNow } from '@/ui/time';
import { clock, killedByText } from './runMath';
import { useRuns } from './runs';
import { useLiveRun } from './state';

export function RunBanner() {
  const { run, active, from } = useLiveRun();
  if (!run || !active) return <LastRunBanner />;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
      <Link to="/run" className="panel group flex flex-wrap items-center gap-x-4 gap-y-2 p-4 ring-1 ring-toxic/30 hover:ring-toxic/60">
        <LiveCrystal size={28} off={run.status === 'dead'} />
        <span className="min-w-0 flex-1">
          <span className="font-game block text-[16px]">
            {run.status === 'dead' ? 'You died' : run.status === 'no_player' ? 'Noita is open' : 'Run in progress'}
            {from && <span className="ml-2 text-xs text-faint">from {from}</span>}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted">
            {run.biome && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={12} className="text-ember" /> {run.biome.name}
              </span>
            )}
            {run.gold !== undefined && (
              <span className="inline-flex items-center gap-1">
                <Coins size={12} className="text-gold" /> {run.gold}
              </span>
            )}
          </span>
          {run.hp !== undefined && run.maxHp ? <HudBar value={Math.max(0, run.hp / run.maxHp)} color="#c3332b" className="mt-2 max-w-xs" label="Health" /> : null}
        </span>
        <span className="inline-flex items-center gap-1.5 btn-game font-game text-[16px] px-3 py-1.5">
          Open live view <ArrowRight size={15} />
        </span>
      </Link>
    </motion.div>
  );
}

/** No game running: the latest recorded run, to look back on in the Run page. */
function LastRunBanner() {
  const last = useRuns((s) => s.records[0]);
  const now = useNow(60_000);
  if (!last) return null;
  const died = last.outcome === 'died';
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
      <Link to={`/run/${encodeURIComponent(last.id)}`} className="panel group flex flex-wrap items-center gap-x-4 gap-y-2 p-4 hover:ring-1 hover:ring-gold/40">
        {died ? <Skull size={26} className="text-blood" /> : <LiveCrystal size={28} off />}
        <span className="min-w-0 flex-1">
          <span className="font-game block text-[16px]">
            Last run · {died ? <span className="text-blood">Died</span> : last.outcome === 'ended' ? 'Ended' : 'Game closed'}
            {died && last.killedBy && <span className="ml-1 text-xs text-muted">killed by {killedByText(last.killedBy)}</span>}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted">
            {last.deepest && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={12} className="text-ember" /> {last.deepest}
              </span>
            )}
            {last.playtime !== undefined && <span>{clock(last.playtime)}</span>}
            <span className="inline-flex items-center gap-1">
              <Coins size={12} className="text-gold" /> {last.gold}
            </span>
            <span className="text-faint">{timeAgo(last.endedAt ?? last.updatedAt, now)}</span>
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5 btn-game quiet font-game text-[16px] px-3 py-1.5">
          Look back <ArrowRight size={15} />
        </span>
      </Link>
    </motion.div>
  );
}
