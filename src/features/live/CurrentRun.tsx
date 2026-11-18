// "Current run" on Home: health, gold, biome, wands, flasks and perks from the companion mod, live.
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { Coins, Heart, MapPin, Skull, Wand2 } from 'lucide-react';
import { useData } from '@/data/store';
import { AtlasIcon, SpellIcon } from '@/ui/GameIcon';
import { HudBar } from '@/ui/game';
import { timeAgo, useNow } from '@/ui/time';
import { encodeWand, resize, type Wand } from '@/features/wand/model';
import type { LiveRun, LiveWand } from './parse';
import { useLiveRun } from './state';

/** Quieter than this and the game is probably closed (the mod rewrites at least every 30 s). */
const STALE_MS = 90_000;

export function toBuilderWand(w: LiveWand): Wand {
  const capacity = Math.max(1, w.capacity);
  const spells: (string | null)[] = Array(capacity).fill(null);
  const charges: (number | null)[] = Array(capacity).fill(null);
  let next = 0;
  for (const s of w.spells) {
    const slot = s.slot !== undefined && s.slot < capacity && spells[s.slot] === null ? s.slot : spells.indexOf(null, next);
    if (slot < 0) break;
    spells[slot] = s.id;
    if (s.uses !== undefined) charges[slot] = s.uses;
    next = slot + 1;
  }
  return {
    name: w.name === 'Wand' ? 'Wand from my run' : w.name,
    shuffle: w.shuffle,
    spellsPerCast: Math.max(1, Math.round(w.spellsPerCast)),
    castDelay: Math.round(w.castDelay),
    rechargeTime: Math.round(w.rechargeTime),
    manaMax: Math.round(w.manaMax),
    manaChargeSpeed: Math.round(w.manaChargeSpeed),
    capacity,
    spread: Math.round(w.spread * 10) / 10,
    speedMultiplier: Math.round(w.speedMultiplier * 1000) / 1000,
    spells: resize(spells, capacity),
    alwaysCasts: w.alwaysCasts,
    ...(charges.some((c) => c !== null) ? { charges } : {}),
  };
}

export function CurrentRun() {
  const { run, at, from } = useLiveRun();
  const now = useNow(10_000);
  if (!run) return null;
  const stale = now - at > STALE_MS;
  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="panel mt-6 p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-game-caps text-[16px] text-gold">Current run</h2>
        <span className="inline-flex items-center gap-1.5 text-xs text-faint">
          <span className={`h-2 w-2 rounded-full ${stale ? 'bg-faint' : run.status === 'dead' ? 'bg-blood' : 'animate-pulse bg-toxic'}`} aria-hidden />
          {stale ? `Game closed? Last seen ${timeAgo(at, now)}` : run.status === 'dead' ? 'You died' : run.status === 'paused' ? 'Paused' : 'Live'}
          {from ? ` · from ${from}` : ''}
          {run.seed ? ` · seed ${run.seed}` : ''}
          {run.ngPlus ? ` · NG+${run.ngPlus > 1 ? run.ngPlus : ''}` : ''}
        </span>
      </div>
      {run.status === 'no_player' ? <p className="mt-2 text-sm text-muted">Waiting for a run to start.</p> : <RunBody run={run} />}
    </motion.section>
  );
}

function RunBody({ run }: { run: LiveRun }) {
  const { perkById } = useData();
  return (
    <div className="mt-3 space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {run.hp !== undefined && run.maxHp ? (
          <div className="text-sm">
            <div className="flex items-center gap-1.5 text-muted">
              {run.status === 'dead' ? <Skull size={14} /> : <Heart size={14} className="text-blood" />}
              <span className="font-game text-[16px] text-ink">
                {Math.max(0, Math.round(run.hp))} / {Math.round(run.maxHp)}
              </span>
            </div>
            <HudBar value={run.hp / run.maxHp} color="#c3332b" className="mt-1.5" label="Health" />
          </div>
        ) : null}
        {run.gold !== undefined && (
          <div className="flex items-center gap-1.5 text-sm text-muted">
            <Coins size={14} className="text-gold" /> <span className="font-game text-[16px] text-ink">{run.gold}</span> gold
          </div>
        )}
        {run.biome && (
          <div className="flex items-center gap-1.5 text-sm text-muted">
            <MapPin size={14} className="text-ember" /> <span className="text-ink">{run.biome.name}</span>
            {run.depth !== undefined && <span className="text-faint">· {Math.round(run.depth)} m</span>}
          </div>
        )}
      </div>

      {run.wands.length > 0 && (
        <div className="space-y-2">
          {run.wands.map((w, i) => (
            <WandRow key={i} wand={w} />
          ))}
        </div>
      )}

      {run.flasks.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs text-muted">
          {run.flasks.map((f, i) => (
            <span key={i} className="slot px-2.5 py-1.5">
              {f.contents.length ? f.contents.map((c) => `${c.material.replace(/_/g, ' ')} ${c.amount}`).join(', ') : 'empty flask'}
              {f.capacity ? <span className="text-faint"> / {f.capacity}</span> : null}
            </span>
          ))}
        </div>
      )}

      {run.perks.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {run.perks.map((p) => {
            const perk = perkById.get(p.id);
            return (
              <span key={p.id} title={perk?.name ?? p.id} className="slot relative grid h-10 w-10 place-items-center">
                {perk ? <AtlasIcon atlas="perks" icon={perk.icon} scale={2} /> : <span className="text-[10px]">{p.id}</span>}
                {p.count > 1 && <span className="absolute -right-1 -bottom-1 font-game text-[8px] text-gold">×{p.count}</span>}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WandRow({ wand }: { wand: LiveWand }) {
  const { spellById } = useData();
  const navigate = useNavigate();
  const open = async () => navigate(`/wand#w=${await encodeWand(toBuilderWand(wand))}`);
  const slots = resize(
    Array.from({ length: wand.capacity }, (_, i) => wand.spells.find((s) => s.slot === i) ?? null),
    Math.max(wand.capacity, 1),
  );
  return (
    <div className={`flex flex-wrap items-center gap-2 p-2 ${wand.active ? 'slot' : ''}`} data-active={wand.active || undefined}>
      <div className="flex min-w-0 basis-full flex-wrap gap-0.5 sm:basis-0 sm:flex-1">
        {wand.alwaysCasts.map((id, i) => {
          const s = spellById.get(id);
          return s ? (
            <span key={`a${i}`} title={`Always casts ${s.name}`} className="grid h-[34px] w-[34px] place-items-center ring-1 ring-gold/60">
              <SpellIcon type={s.type} icon={s.icon} scale={2} />
            </span>
          ) : null;
        })}
        {slots.map((slot, i) => {
          const s = slot && spellById.get(slot.id);
          return (
            <span key={i} className="relative grid h-[34px] w-[34px] place-items-center bg-surface-2/60" title={s ? `${s.name}${slot?.uses !== undefined ? ` (${slot.uses} left)` : ''}` : 'Empty'}>
              {s && <SpellIcon type={s.type} icon={s.icon} scale={2} />}
              {s && slot?.uses !== undefined && <span className="absolute right-0 bottom-0 font-game text-[8px] text-gold">{slot.uses}</span>}
            </span>
          );
        })}
      </div>
      <button onClick={() => void open()} className="inline-flex items-center gap-1.5 btn-game quiet font-game text-[16px] px-2.5 py-1">
        <Wand2 size={14} /> Open in builder
      </button>
    </div>
  );
}
