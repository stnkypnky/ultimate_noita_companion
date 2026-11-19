// The perks a wand is simulated with (Concentrated Spells, Glass Cannon…): saved with the wand and its share
// code, and brought along when a wand is opened from the Run page.
import { useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { useData } from '@/data/store';
import { useSpoilers } from '@/store/progress';
import { AtlasIcon } from '@/ui/GameIcon';
import { PERK_EFFECTS } from '@/sim/perks';
import { useWand } from './store';

const SIM_PERKS = Object.keys(PERK_EFFECTS);

export function WandPerks() {
  const { perkById } = useData();
  const { visible } = useSpoilers();
  const perks = useWand((s) => s.wand.perks);
  const lowHp = useWand((s) => !!s.wand.lowHp);
  const setPerk = useWand((s) => s.setPerk);
  const setLowHp = useWand((s) => s.setLowHp);
  const [picking, setPicking] = useState(false);

  const picked = Object.entries(perks ?? {}).filter(([id]) => perkById.has(id));
  // Undiscovered perks stay out of the list (no spoilers); one already on the wand still shows.
  const available = SIM_PERKS.filter((id) => {
    const p = perkById.get(id);
    return p && !perks?.[id] && visible(p.discoverFlag);
  });
  const notes = picked.flatMap(([id]) => (PERK_EFFECTS[id]?.note ? [`${perkById.get(id)!.name}: ${PERK_EFFECTS[id]!.note}`] : []));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {picked.map(([id, n]) => {
          const perk = perkById.get(id)!;
          const stackable = perk.stackable && (PERK_EFFECTS[id]?.maxStacks ?? perk.maxStack ?? 99) > 1;
          return (
            <span key={id} className="slot inline-flex items-center gap-1.5 py-1 pr-1 pl-2 text-xs text-ink">
              <AtlasIcon atlas="perks" icon={perk.icon} scale={1} />
              <span>{perk.name}</span>
              {stackable && (
                <span className="inline-flex items-center" role="group" aria-label={`${perk.name} pickups`}>
                  <button onClick={() => setPerk(id, n - 1)} aria-label="One less" className="grid h-6 w-6 place-items-center text-muted hover:text-ink">
                    <Minus size={12} />
                  </button>
                  <span className="font-game min-w-4 text-center text-[16px] text-gold tabular-nums">{n}</span>
                  <button onClick={() => setPerk(id, n + 1)} aria-label="One more" className="grid h-6 w-6 place-items-center text-muted hover:text-ink">
                    <Plus size={12} />
                  </button>
                </span>
              )}
              {id === 'LOW_HP_DAMAGE_BOOST' && (
                <label className="inline-flex cursor-pointer items-center gap-1 text-muted" title="Its damage boost counts only under 25 HP or 25% of max health">
                  <input type="checkbox" checked={lowHp} onChange={(e) => setLowHp(e.target.checked)} className="accent-[var(--ember)]" />
                  low health
                </label>
              )}
              <button onClick={() => setPerk(id, 0)} aria-label={`Remove ${perk.name}`} className="grid h-6 w-6 place-items-center text-faint hover:text-blood">
                <X size={13} />
              </button>
            </span>
          );
        })}
        {available.length > 0 && (
          <button
            onClick={() => setPicking(!picking)}
            aria-expanded={picking}
            className="inline-flex min-h-9 items-center gap-1 rounded-md bg-surface-2 px-2.5 py-1 text-xs text-muted hover:text-ink"
          >
            <Plus size={13} /> Perk
          </button>
        )}
        {!picked.length && !picking && <span className="text-xs text-faint">None. Add the perks you have, so the numbers match your run.</span>}
      </div>
      {picking && (
        <div className="flex flex-wrap gap-1.5" role="list" aria-label="Perks that change spells">
          {available.map((id) => {
            const perk = perkById.get(id)!;
            return (
              <button
                key={id}
                role="listitem"
                onClick={() => {
                  setPerk(id, 1);
                  setPicking(false);
                }}
                title={perk.description}
                className="slot slot-hover inline-flex items-center gap-1.5 px-2 py-1 text-xs text-ink"
              >
                <AtlasIcon atlas="perks" icon={perk.icon} scale={1} /> {perk.name}
              </button>
            );
          })}
        </div>
      )}
      {notes.map((n) => (
        <p key={n} className="text-xs text-faint">
          {n}
        </p>
      ))}
    </div>
  );
}
