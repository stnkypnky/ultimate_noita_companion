// Pieces of the game's own UI: stat icons, HUD bars, rune text and the embers drifting through the cave.
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { gameUrl } from '@/data/store';
import { useReducedMotion } from 'motion/react';

/** The inventory stat icons from data/ui_gfx/inventory/icon_*.png. */
export type StatIconName =
  | 'action_max_uses'
  | 'action_type'
  | 'bounces'
  | 'damage_critical_chance'
  | 'damage_curse'
  | 'damage_drill'
  | 'damage_electricity'
  | 'damage_explosion'
  | 'damage_fire'
  | 'damage_healing'
  | 'damage_holy'
  | 'damage_ice'
  | 'damage_melee'
  | 'damage_projectile'
  | 'damage_slice'
  | 'danger'
  | 'explosion_radius'
  | 'fire_rate_wait'
  | 'gun_actions_per_round'
  | 'gun_capacity'
  | 'gun_charge'
  | 'gun_permanent_actions'
  | 'gun_reload_time'
  | 'gun_shuffle'
  | 'hud_health'
  | 'hud_money'
  | 'info'
  | 'knockback'
  | 'mana_charge_speed'
  | 'mana_drain'
  | 'mana_max'
  | 'no_cards'
  | 'reload_time'
  | 'speed_multiplier'
  | 'spread_degrees'
  | 'warning';

const ICON_BY_LABEL: Record<string, StatIconName> = {
  Mana: 'mana_drain',
  'Mana drain': 'mana_drain',
  'Mana max': 'mana_max',
  'Mana charge': 'mana_charge_speed',
  Uses: 'action_max_uses',
  'Cast delay': 'fire_rate_wait',
  'Recharge time': 'gun_reload_time',
  Recharge: 'gun_reload_time',
  Spread: 'spread_degrees',
  Speed: 'speed_multiplier',
  'Child speed': 'speed_multiplier',
  'Critical chance': 'damage_critical_chance',
  'Critical multiplier': 'damage_critical_chance',
  Explosion: 'damage_explosion',
  'Explosion radius': 'explosion_radius',
  Bounces: 'bounces',
  Knockback: 'knockback',
  'Spells/cast': 'gun_actions_per_round',
  Capacity: 'gun_capacity',
  Shuffle: 'gun_shuffle',
  'Always casts': 'gun_permanent_actions',
};
const DAMAGE_ICON: Record<string, StatIconName> = {
  Projectile: 'damage_projectile',
  Explosion: 'damage_explosion',
  Fire: 'damage_fire',
  Electric: 'damage_electricity',
  Ice: 'damage_ice',
  Slice: 'damage_slice',
  Melee: 'damage_melee',
  Drill: 'damage_drill',
  Curse: 'damage_curse',
  Healing: 'damage_healing',
  Holy: 'damage_holy',
};

/** The game's icon for a stat line, by its label ("Cast delay", "Fire damage", …). */
export function statIconFor(label: string): StatIconName | undefined {
  const dmg = label.match(/^(\w+) damage$/);
  return dmg ? DAMAGE_ICON[dmg[1]!] : ICON_BY_LABEL[label];
}

/** A stat icon at a whole-pixel scale (the icons are 7–9 game pixels). */
export function StatIcon({ name, scale = 2, className = '' }: { name: StatIconName; scale?: number; className?: string }) {
  return (
    <img
      src={gameUrl(`ui/icons/${name}.png`)}
      alt=""
      aria-hidden
      className={`pixelated inline-block shrink-0 ${className}`}
      style={{ zoom: scale }}
      draggable={false}
    />
  );
}

/** A HUD bar in the game's look; `value` is 0..1. */
export function HudBar({ value, color, className = '', label }: { value: number; color: string; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div
      className={`hud-bar ${className}`}
      style={{ '--bar': color } as CSSProperties}
      role={label ? 'meter' : undefined}
      aria-label={label}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label ? 100 : undefined}
      aria-valuenow={label ? Math.round(v * 100) : undefined}
    >
      <span style={{ width: `${v * 100}%` }} />
    </div>
  );
}

/** Words written in Noita's runes; decoration only, so screen readers skip them. */
export function Runes({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span aria-hidden className={`font-runes select-none ${className}`}>
      {children}
    </span>
  );
}

/** A section divider: a gold rule with a line of runes in the middle. */
export function RuneDivider({ text = 'the wand remembers', className = '' }: { text?: string; className?: string }) {
  return (
    <div aria-hidden className={`flex items-center gap-3 text-gold/50 ${className}`}>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-current" />
      <Runes className="text-[16px] leading-none">{text}</Runes>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-current" />
    </div>
  );
}

type Ember = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; phase: number };
const EMBER_COLORS = ['#f89000', '#ffcf4a', '#e27100', '#ff6a1a', '#ffb347'];

/**
 * Embers drifting up through the cave behind the app. Snapped to game pixels, paused while the tab is hidden,
 * and not drawn at all when the device asks for reduced motion.
 */
export function Embers() {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || reduced) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const PX = 2;
    let w = 0;
    let h = 0;
    const embers: Ember[] = [];
    const resize = () => {
      w = canvas.width = Math.ceil(innerWidth / PX);
      h = canvas.height = Math.ceil(innerHeight / PX);
    };
    resize();
    addEventListener('resize', resize);

    const spawn = (anywhere: boolean): Ember => {
      const max = 6 + Math.random() * 10;
      return {
        x: Math.random() * w,
        y: anywhere ? Math.random() * h : h + 2,
        vx: (Math.random() - 0.5) * 3,
        vy: -(4 + Math.random() * 9),
        life: anywhere ? Math.random() * max : 0,
        max,
        size: Math.random() < 0.15 ? 2 : 1,
        color: EMBER_COLORS[(Math.random() * EMBER_COLORS.length) | 0]!,
        phase: Math.random() * Math.PI * 2,
      };
    };
    const count = () => Math.round(Math.min(60, (w * h) / 2600));
    for (let i = 0; i < count(); i++) embers.push(spawn(true));

    let raf = 0;
    let last = performance.now();
    let resting = false;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      if (dt < 1 / 30) return;
      last = now;
      // Resting (and gone) while the test range runs.
      if (document.documentElement.dataset.rangeRunning) {
        // Hidden altogether, so the page has one less full-screen layer to composite.
        if (!resting) canvas.style.visibility = 'hidden';
        resting = true;
        return;
      }
      if (resting) canvas.style.visibility = '';
      resting = false;
      while (embers.length < count()) embers.push(spawn(false));
      ctx.clearRect(0, 0, w, h);
      for (let i = embers.length - 1; i >= 0; i--) {
        const e = embers[i]!;
        e.life += dt;
        e.x += (e.vx + Math.sin(e.life * 1.3 + e.phase) * 2.5) * dt;
        e.y += e.vy * dt;
        if (e.life >= e.max || e.y < -2) {
          embers.splice(i, 1);
          continue;
        }
        const t = e.life / e.max;
        const flicker = 0.75 + 0.25 * Math.sin(e.life * 9 + e.phase);
        ctx.globalAlpha = Math.min(1, t * 6) * (1 - t) * flicker * 0.8;
        ctx.fillStyle = e.color;
        ctx.fillRect(Math.round(e.x), Math.round(e.y), e.size, e.size);
      }
      ctx.globalAlpha = 1;
    };
    const visibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener('visibilitychange', visibility);
    visibility();
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [reduced]);

  if (reduced) return null;
  return <canvas ref={ref} aria-hidden className="pixelated pointer-events-none fixed inset-0 z-[-1] h-full w-full" />;
}
