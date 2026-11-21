// A biome modifier as the game announces it (its banner, with the emblems on either side) and, under it, what it
// actually does: a few short lines, each with a small picture (a stat icon, a material, or the creatures it adds).
import { CircleDashed, Feather, Weight, EyeOff, Ghost, Magnet, Moon, Orbit, Shield, Sofa, Sprout, type LucideIcon } from 'lucide-react';
import type { CSSProperties } from 'react';
import { gameUrl, useData } from '@/data/store';
import { BIOME_MODIFIERS, type ModifierIcon } from '@/data/biomeModifiers';
import type { BiomeModifier } from '@/seed/seed';
import { StatIcon } from '@/ui/game';
import { MaterialSwatch } from '@/features/materials/MaterialSwatch';
import { CreatureChip } from '@/features/bestiary/EnemyDetail';

const GLYPHS: Record<Extract<ModifierIcon, { glyph: string }>['glyph'], LucideIcon> = {
  heavy: Weight,
  light: Feather,
  dark: Moon,
  invisible: EyeOff,
  field: Magnet,
  ghost: Ghost,
  plant: Sprout,
  furniture: Sofa,
  tunnel: CircleDashed,
  shield: Shield,
  orb: Orbit,
};

/** The banner (72 × 24): its 17 px ends hold the emblems; the plain middle stretches to fit the name. */
const BANNER_END = 17;

function Banner({ decoration, name, scale }: { decoration?: string; name: string; scale: number }) {
  const h = 24 * scale;
  const end = BANNER_END * scale;
  const style: CSSProperties = decoration
    ? {
        height: h,
        minWidth: 72 * scale,
        borderStyle: 'solid',
        borderWidth: `0 ${end}px`,
        borderImage: `url(${gameUrl(`ui/modifiers/${decoration}.png`)}) 0 ${BANNER_END} fill / 0 ${end}px / 0 stretch`,
        imageRendering: 'pixelated',
      }
    : { height: h };
  return (
    <div className="inline-flex items-center justify-center px-1" style={style}>
      <span className="font-game text-[16px] leading-none whitespace-nowrap text-ink [text-shadow:0_1px_0_#000]">{name}</span>
    </div>
  );
}

function EffectIcon({ icon }: { icon: ModifierIcon }) {
  const { materialById } = useData();
  if ('stat' in icon) return <StatIcon name={icon.stat} scale={2} />;
  if ('material' in icon) {
    const m = materialById.get(icon.material);
    return m ? <MaterialSwatch material={m} size={16} /> : <span className="inline-block h-4 w-4" />;
  }
  const G = GLYPHS[icon.glyph];
  return <G size={16} className="shrink-0 text-gold" aria-hidden />;
}

/** What a modifier does. `flavour` is the game's own line for it; `compact` drops it (lists). */
export function ModifierCard({ modifier, flavour, compact }: { modifier: BiomeModifier; flavour?: string; compact?: boolean }) {
  const info = BIOME_MODIFIERS[modifier.id];
  return (
    <div>
      <Banner decoration={modifier.decoration || undefined} name={info?.name ?? modifier.id.toLowerCase().replace(/_/g, ' ')} scale={compact ? 2 : 3} />
      {flavour && !compact && <p className="mt-1.5 text-xs text-faint italic">“{flavour}”</p>}
      {info && (
        <ul className={`${compact ? 'mt-1' : 'mt-2'} space-y-1.5`}>
          {info.effects.map((e, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-muted">
              <span className="grid h-6 w-6 shrink-0 place-items-center">
                <EffectIcon icon={e.icon} />
              </span>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 pt-0.5">
                <span>{e.text}</span>
                {e.creatures?.map((id) => <CreatureChip key={id} id={id} />)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
