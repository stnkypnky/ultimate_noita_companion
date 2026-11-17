// The discovery bar under each page title: how much of this screen's content you've found.
import { useMemo } from 'react';
import { Link } from 'react-router';
import { useGameData } from '@/data/store';
import { SECRET_ITEMS, SECRET_MATERIALS, itemKey, materialKey } from '@/data/spoilers';
import { useProgress, useSpoilers } from '@/store/progress';
import { HudBar } from '@/ui/game';
import { isSafe } from '@/features/alchemy/lookup';

export type DiscoveryKind = 'overall' | 'spells' | 'perks' | 'enemies' | 'items' | 'materials' | 'alchemy';

type Count = { label: string; value: number; max: number; color: string; fromSave: boolean };

const SPEC: Record<DiscoveryKind, { label: string; color: string; fromSave: boolean }> = {
  overall: { label: 'Discovered', color: 'var(--ember)', fromSave: true },
  spells: { label: 'Spells discovered', color: 'var(--arcane)', fromSave: true },
  perks: { label: 'Perks discovered', color: 'var(--gold)', fromSave: true },
  enemies: { label: 'Creatures met', color: 'var(--blood)', fromSave: true },
  items: { label: 'Secret items found', color: 'var(--gold)', fromSave: false },
  materials: { label: 'Secret materials found', color: 'var(--toxic)', fromSave: false },
  alchemy: { label: 'Reactions known', color: 'var(--toxic)', fromSave: false },
};

/** Found / total for one kind of content. Spells, perks and creatures count the save; secrets count what's visible. */
export function useDiscovery(kind: DiscoveryKind): Count | null {
  const data = useGameData((s) => s.data);
  const progress = useProgress((s) => s.progress);
  const { visible } = useSpoilers();

  return useMemo(() => {
    if (!data) return null;
    const flags = new Set(progress?.flags ?? []);
    const met = new Set(progress?.enemies ?? []);
    const materialVisible = (id: string) => !SECRET_MATERIALS.has(id) || visible(materialKey(id));
    const counts = {
      spells: [data.spells.filter((s) => flags.has(s.discoverFlag)).length, data.spells.length],
      perks: [data.perks.filter((p) => flags.has(p.discoverFlag)).length, data.perks.length],
      enemies: [data.enemies.filter((e) => met.has(e.id)).length, data.enemies.length],
      items: [[...SECRET_ITEMS].filter((id) => visible(itemKey(id))).length, SECRET_ITEMS.size],
      materials: [[...SECRET_MATERIALS].filter((id) => visible(materialKey(id))).length, SECRET_MATERIALS.size],
      alchemy: [data.reactions.filter((r) => isSafe(r, materialVisible)).length, data.reactions.length],
    } as const;
    const [value, max] =
      kind === 'overall'
        ? (['spells', 'perks', 'enemies'] as const).reduce<[number, number]>((a, k) => [a[0] + counts[k][0], a[1] + counts[k][1]], [0, 0])
        : counts[kind];
    return { ...SPEC[kind], value, max };
  }, [data, progress, visible, kind]);
}

export function DiscoveryBar({ kind }: { kind: DiscoveryKind }) {
  const c = useDiscovery(kind);
  const synced = useProgress((s) => !!s.progress);
  if (!c || !c.max) return null;
  const pct = Math.round((c.value / c.max) * 100);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="font-game shrink-0 text-[16px] text-muted">{c.label}</span>
      <HudBar className="min-w-[96px] flex-1"value={c.value / c.max} color={c.color} label={`${c.label}: ${pct}%`} />
      <span className="font-game shrink-0 text-[16px] tabular-nums">
        {c.value}
        <span className="text-faint">/{c.max}</span>
      </span>
      {c.fromSave && !synced && (
        <Link to="/progress" className="shrink-0 text-xs text-ember hover:underline">
          Sync your save
        </Link>
      )}
    </div>
  );
}
