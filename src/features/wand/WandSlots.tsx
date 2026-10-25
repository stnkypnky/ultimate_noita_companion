import { useDraggable, useDroppable } from '@dnd-kit/core';
import { motion } from 'motion/react';
import { Plus, Trash2 } from 'lucide-react';
import { gameUrl, useData } from '@/data/store';
import { SpellIcon } from '@/ui/GameIcon';
import { useWand } from './store';

export type DragData =
  | { source: 'palette'; spellId: string }
  | { source: 'slot'; slot: number; spellId: string }
  | { source: 'always'; index: number; spellId: string };

export type DropData = { target: 'slot'; slot: number } | { target: 'always' } | { target: 'trash' };

/** The wand's spell slots. */
export function WandSlots({
  scale,
  highlight,
  selected,
  onSelect,
}: {
  scale: number;
  highlight: Set<number>;
  selected: number | null;
  onSelect: (slot: number | null) => void;
}) {
  const spells = useWand((s) => s.wand.spells);
  return (
    <div className="flex flex-wrap gap-1.5" role="list" aria-label="Wand slots">
      {spells.map((id, i) => (
        <Slot key={i} slot={i} spellId={id} scale={scale} lit={highlight.has(i)} selected={selected === i} onSelect={onSelect} />
      ))}
    </div>
  );
}

function Slot({
  slot,
  spellId,
  scale,
  lit,
  selected,
  onSelect,
}: {
  slot: number;
  spellId: string | null;
  scale: number;
  lit: boolean;
  selected: boolean;
  onSelect: (slot: number | null) => void;
}) {
  const { spellById } = useData();
  const unlimited = useWand((s) => s.options.unlimitedSpells);
  const spell = spellId ? spellById.get(spellId) : undefined;
  const drop = useDroppable({ id: `drop-slot:${slot}`, data: { target: 'slot', slot } satisfies DropData });
  const drag = useDraggable({
    id: `slot:${slot}`,
    disabled: !spell,
    data: spell ? ({ source: 'slot', slot, spellId: spell.id } satisfies DragData) : undefined,
  });
  const size = 20 * scale + 8;
  const charges = spell && spell.maxUses !== null && (!unlimited || spell.neverUnlimited) ? spell.maxUses : null;

  return (
    <div
      ref={drop.setNodeRef}
      role="listitem"
      className={`relative grid place-items-center rounded-lg transition-[box-shadow,background] ${
        drop.isOver ? 'bg-ember/20 ring-2 ring-ember' : selected ? 'ring-2 ring-gold' : lit ? 'ring-2 ring-ember/70' : ''
      }`}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${gameUrl('ui/quick_inventory_box.png')})`,
        backgroundSize: '100% 100%',
        imageRendering: 'pixelated',
      }}
    >
      {spell ? (
        <button
          ref={drag.setNodeRef}
          {...drag.listeners}
          {...drag.attributes}
          onClick={() => onSelect(selected ? null : slot)}
          aria-label={`${spell.name}, slot ${slot + 1}`}
          className={`touch-manipulation select-none ${drag.isDragging ? 'opacity-30' : ''}`}
        >
          <SpellIcon type={spell.type} icon={spell.icon} scale={scale} />
          {charges !== null && (
            <span className="absolute right-0.5 bottom-0.5 rounded bg-bg/80 px-1 text-[10px] leading-tight font-semibold text-gold tabular-nums">{charges}</span>
          )}
        </button>
      ) : (
        <button
          onClick={() => onSelect(selected ? null : slot)}
          aria-label={`Empty slot ${slot + 1}`}
          className="grid h-full w-full place-items-center text-faint/40 hover:text-faint"
        >
          <Plus size={14} />
        </button>
      )}
      {lit && <span className="pointer-events-none absolute inset-0 rounded-lg bg-ember/10" />}
    </div>
  );
}

/** Always-cast spells: dropping a spell here makes it fire on every cast. */
export function AlwaysCasts({ scale }: { scale: number }) {
  const { spellById } = useData();
  const always = useWand((s) => s.wand.alwaysCasts);
  const drop = useDroppable({ id: 'drop-always', data: { target: 'always' } satisfies DropData });
  return (
    <div
      ref={drop.setNodeRef}
      className={`flex min-h-12 flex-wrap items-center gap-1.5 rounded-[var(--radius-sm)] border border-dashed p-2 transition-colors ${
        drop.isOver ? 'border-ember bg-ember/10' : 'border-line-strong'
      }`}
    >
      {always.length === 0 && <span className="px-1 text-xs text-faint">Drop spells here to always cast them</span>}
      {always.map((id, i) => {
        const spell = spellById.get(id);
        return spell ? <AlwaysItem key={`${id}-${i}`} index={i} spellId={id} scale={scale} /> : null;
      })}
    </div>
  );
}

function AlwaysItem({ index, spellId, scale }: { index: number; spellId: string; scale: number }) {
  const { spellById } = useData();
  const spell = spellById.get(spellId)!;
  const drag = useDraggable({ id: `ac:${index}`, data: { source: 'always', index, spellId } satisfies DragData });
  return (
    <button ref={drag.setNodeRef} {...drag.listeners} {...drag.attributes} aria-label={`Always cast ${spell.name}`} className={`touch-manipulation select-none ${drag.isDragging ? 'opacity-30' : ''}`}>
      <SpellIcon type={spell.type} icon={spell.icon} scale={scale} />
    </button>
  );
}

/** Appears while dragging; dropping here (or anywhere off the wand) removes the spell. */
export function TrashZone({ visible }: { visible: boolean }) {
  const drop = useDroppable({ id: 'drop-trash', data: { target: 'trash' } satisfies DropData });
  return (
    <motion.div
      ref={drop.setNodeRef}
      initial={false}
      animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : 16, pointerEvents: visible ? 'auto' : 'none' }}
      className={`fixed bottom-[calc(var(--nav-h)+env(safe-area-inset-bottom)+16px)] left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-full border px-5 py-3 text-sm font-medium shadow-[var(--shadow)] md:bottom-8 ${
        drop.isOver ? 'border-blood bg-blood text-white' : 'border-blood/50 bg-surface-2 text-blood'
      }`}
    >
      <Trash2 size={17} /> Drop to remove
    </motion.div>
  );
}
