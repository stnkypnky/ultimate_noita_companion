import { Link } from 'react-router';
import { useGameData } from '@/data/store';
import { useProgress } from '@/store/progress';
import { killerLabel, resolveKiller } from './runMath';

/**
 * What killed you, named as the Bestiary names it and linked to it. `seed`/`at` let an unnamed killer
 * (the game writes " | bite") be found in the save's deaths.
 */
export function KilledBy({ text, seed, at, className, plain }: { text: string; seed?: number; at?: number; className?: string; plain?: boolean }) {
  const enemies = useGameData((s) => s.data?.enemies);
  const deaths = useProgress((s) => s.progress?.deaths);
  const k = resolveKiller(text, enemies ?? [], { seed, at, deaths });
  if (!k.enemy || plain) return <span className={className}>{killerLabel(k)}</span>;
  return (
    <Link to={`/bestiary/${k.enemy.id}`} className={`underline decoration-dotted underline-offset-2 hover:text-gold ${className ?? ''}`}>
      {killerLabel(k)}
    </Link>
  );
}
