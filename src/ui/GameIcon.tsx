import type { CSSProperties } from 'react';
import type { Icon, SpellType } from '@/data/types';
import { gameUrl, useGameData } from '@/data/store';

/** The game's inventory frame for each spell type (data/ui_gfx/inventory/item_bg_*.png). */
const FRAME: Record<SpellType, string> = {
  projectile: 'item_bg_projectile.png',
  static: 'item_bg_static_projectile.png',
  modifier: 'item_bg_modifier.png',
  multicast: 'item_bg_draw_many.png',
  material: 'item_bg_material.png',
  other: 'item_bg_other.png',
  utility: 'item_bg_utility.png',
  passive: 'item_bg_passive.png',
};

export const TYPE_LABEL: Record<SpellType, string> = {
  projectile: 'Projectile',
  static: 'Static projectile',
  modifier: 'Projectile modifier',
  multicast: 'Multicast',
  material: 'Material',
  other: 'Other',
  utility: 'Utility',
  passive: 'Passive',
};

export const TYPE_SHORT: Record<SpellType, string> = {
  projectile: 'Projectile',
  static: 'Static',
  modifier: 'Modifier',
  multicast: 'Multicast',
  material: 'Material',
  other: 'Other',
  utility: 'Utility',
  passive: 'Passive',
};

export const TYPE_COLOR: Record<SpellType, string> = {
  projectile: '#e2445c',
  static: '#ff9b3d',
  modifier: '#5aa7ff',
  multicast: '#e8c25a',
  material: '#7bd65c',
  other: '#b48bff',
  utility: '#d77bd6',
  passive: '#9aa7b4',
};

/** One icon from a sprite atlas, pixel-perfect at an integer scale. */
export function AtlasIcon({ atlas, icon, scale = 2, style }: { atlas: 'spells' | 'perks' | 'items' | 'enemies' | 'bestiary'; icon: Icon; scale?: number; style?: CSSProperties }) {
  const [aw, ah] = useGameData((s) => s.version?.atlases[atlas]) ?? [0, 0];
  return (
    <span
      aria-hidden
      className="pixelated inline-block shrink-0"
      style={{
        width: icon.w * scale,
        height: icon.h * scale,
        backgroundImage: `url(${gameUrl(`sprites/${atlas}.png`)})`,
        backgroundPosition: `-${icon.x * scale}px -${icon.y * scale}px`,
        backgroundSize: `${aw * scale}px ${ah * scale}px`,
        ...style,
      }}
    />
  );
}

/** Spell icon inside its in-game type frame (20×20 frame, 16×16 icon). Hidden spells show a silhouette. */
export function SpellIcon({ type, icon, scale = 2, hidden }: { type: SpellType; icon: Icon; scale?: number; hidden?: boolean }) {
  return (
    <span
      className="pixelated relative inline-grid shrink-0 place-items-center"
      style={{
        width: 20 * scale,
        height: 20 * scale,
        backgroundImage: `url(${gameUrl(`ui/${hidden ? 'full_inventory_box.png' : FRAME[type]}`)})`,
        backgroundSize: '100% 100%',
      }}
    >
      {hidden ? (
        <span className="font-game text-muted" style={{ fontSize: 8 * scale }}>
          ?
        </span>
      ) : (
        <AtlasIcon atlas="spells" icon={icon} scale={scale} />
      )}
    </span>
  );
}
