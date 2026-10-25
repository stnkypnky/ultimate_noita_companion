import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { BookOpen, Dices, Eraser, FolderHeart, Info, Plus, Redo2, Repeat, Trash2, Undo2, X } from 'lucide-react';
import { useData } from '@/data/store';
import { warmUpSimulator } from '@/sim/client';
import type { CastView } from '@/sim/analyze';
import { Page } from '@/ui/Page';
import { Section } from '@/ui/controls';
import { SpellIcon } from '@/ui/GameIcon';
import { Sheet } from '@/ui/Sheet';
import { useIsDesktop } from '@/ui/hooks';
import { BuildsPanel } from './BuildsPanel';
import { CastResults } from './CastResults';
import { decodeWand } from './model';
import { SpellPalette } from './SpellPalette';
import { useWand } from './store';
import { RangePreview } from '@/features/range/RangePreview';
import { fmtNum } from '@/data/format';
import { useSimulation } from './useSimulation';
import { AlwaysCasts, TrashZone, WandSlots, type DragData, type DropData } from './WandSlots';
import { WandStats } from './WandStats';

export function WandPage() {
  const { spellById } = useData();
  const desktop = useIsDesktop();
  const wand = useWand((s) => s.wand);
  const options = useWand((s) => s.options);
  const store = useWand.getState;
  const canUndo = useWand((s) => s.past.length > 0);
  const canRedo = useWand((s) => s.future.length > 0);
  const sim = useSimulation(wand, options);

  const [selected, setSelected] = useState<number | null>(null);
  const [dragging, setDragging] = useState<DragData | null>(null);
  const [hoverCast, setHoverCast] = useState<CastView | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [buildsOpen, setBuildsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [view, setView] = useState<'casts' | 'preview'>(() => {
    try {
      return localStorage.getItem('wand-view') === 'preview' ? 'preview' : 'casts';
    } catch {
      return 'casts';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('wand-view', view);
    } catch {
      /* storage unavailable: the choice just isn't remembered */
    }
  }, [view]);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1600);
  }, []);

  useEffect(() => void warmUpSimulator().catch(() => {}), []);

  // ?add=SPELL from the spell pages, #w=CODE from share links.
  const [params, setParams] = useSearchParams();
  const { hash } = useLocation();
  const navigate = useNavigate();
  // Effects can run twice (StrictMode, fast re-renders) before the param is cleared; act once per URL.
  const handled = useRef<string | null>(null);
  useEffect(() => {
    const add = params.get('add');
    if (add && handled.current !== `add:${add}` && spellById.has(add)) {
      handled.current = `add:${add}`;
      flash(store().addToFirstEmpty(add) ? `Added ${spellById.get(add)!.name}` : 'The wand is full');
      setParams({}, { replace: true });
    }
  }, [params, setParams, spellById, store, flash]);
  useEffect(() => {
    const code = new URLSearchParams(hash.slice(1)).get('w');
    if (!code || handled.current === `w:${code}`) return;
    handled.current = `w:${code}`;
    decodeWand(code).then(
      (w) => {
        store().load(w);
        flash(`Loaded “${w.name}”`);
      },
      () => flash("That wand link couldn't be read"),
    );
    navigate('/wand', { replace: true });
  }, [hash, navigate, store, flash]);

  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, Delete removes the selected slot, Esc deselects.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) store().redo();
        else store().undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        store().redo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected !== null) {
        store().remove(selected);
      } else if (e.key === 'Escape') {
        setSelected(null);
      }
    };
    addEventListener('keydown', h);
    return () => removeEventListener('keydown', h);
  }, [selected, store]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const onDragStart = (e: DragStartEvent) => {
    setDragging(e.active.data.current as DragData);
    navigator.vibrate?.(10);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const src = e.active.data.current as DragData | undefined;
    const dst = e.over?.data.current as DropData | undefined;
    if (!src) return;
    const s = store();
    if (dst?.target === 'slot') {
      if (src.source === 'palette') s.place(dst.slot, src.spellId);
      else if (src.source === 'slot') s.swap(src.slot, dst.slot);
      else {
        s.place(dst.slot, src.spellId);
        s.removeAlwaysCast(src.index);
      }
    } else if (dst?.target === 'always') {
      if (src.source === 'palette') s.addAlwaysCast(src.spellId);
      else if (src.source === 'slot') {
        s.addAlwaysCast(src.spellId);
        s.remove(src.slot);
      }
    } else if (src.source === 'slot') {
      // Dropped on the trash or anywhere off the wand.
      s.remove(src.slot);
    } else if (src.source === 'always') {
      s.removeAlwaysCast(src.index);
    }
  };

  /** Tap-to-place: into the selected empty slot, else the first empty one. */
  const pick = useCallback(
    (id: string) => {
      const s = store();
      if (selected !== null && s.wand.spells[selected] === null) {
        s.place(selected, id);
        setSelected(Math.min(selected + 1, s.wand.capacity - 1));
      } else if (!s.addToFirstEmpty(id)) {
        flash('The wand is full — drag onto a slot to replace');
      }
    },
    [selected, store, flash],
  );

  const highlight = useMemo(() => {
    const set = new Set<number>();
    if (hoverCast) for (const card of hoverCast.cast.slots) if (card > 0) set.add(sim.slotOfCard[card - 1] ?? -1);
    return set;
  }, [hoverCast, sim.slotOfCard]);

  const scale = desktop ? 3 : 2;
  const selectedSpell = selected !== null ? (wand.spells[selected] ? spellById.get(wand.spells[selected]!) : null) : undefined;
  const dragSpell = dragging ? spellById.get(dragging.spellId) : undefined;

  const toolbar = (
    <div className="flex items-center gap-1">
      <IconButton label="Undo (Ctrl+Z)" onClick={() => store().undo()} disabled={!canUndo}>
        <Undo2 size={17} />
      </IconButton>
      <IconButton label="Redo (Ctrl+Shift+Z)" onClick={() => store().redo()} disabled={!canRedo}>
        <Redo2 size={17} />
      </IconButton>
      <IconButton label="Clear spells" onClick={() => store().clear()}>
        <Eraser size={17} />
      </IconButton>
      <button onClick={() => setBuildsOpen(true)} className="ml-1 inline-flex items-center gap-2 btn-game quiet font-game text-[16px] px-3 py-2">
        <FolderHeart size={16} /> <span className="hidden sm:inline">Builds &amp; share</span>
      </button>
    </div>
  );

  const builder = (
    <>
      <WandStats collapsible={!desktop} />
      <Section title={`Spells (${wand.spells.filter(Boolean).length}/${wand.capacity})`} aside={<SimToggles />}>
        <WandSlots scale={scale} highlight={highlight} selected={selected} onSelect={setSelected} />
        <AnimatePresence>
          {selected !== null && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="panel mt-2 flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
            >
              {selectedSpell ? (
                <>
                  <SpellIcon type={selectedSpell.type} icon={selectedSpell.icon} scale={1} />
                  <span className="font-medium">{selectedSpell.name}</span>
                  <span className="text-faint">· {selectedSpell.mana} mana</span>
                  <span className="ml-auto flex gap-1">
                    <Link to={`/spells/${selectedSpell.id}`} className="rounded-lg p-1.5 text-muted hover:text-ink" title="Spell details">
                      <Info size={16} />
                    </Link>
                    <button
                      className="rounded-lg p-1.5 text-muted hover:text-ink"
                      title="Make always cast"
                      onClick={() => {
                        store().addAlwaysCast(selectedSpell.id);
                        store().remove(selected);
                      }}
                    >
                      <Repeat size={16} />
                    </button>
                    <button className="rounded-lg p-1.5 text-muted hover:text-blood" title="Remove (Delete)" onClick={() => store().remove(selected)}>
                      <Trash2 size={16} />
                    </button>
                  </span>
                </>
              ) : (
                <span className="text-muted">Slot {selected + 1} selected — tap a spell to place it here.</span>
              )}
              <button className="rounded-lg p-1.5 text-faint hover:text-ink" onClick={() => setSelected(null)} aria-label="Deselect">
                <X size={15} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </Section>
      <Section title="Always cast">
        <AlwaysCasts scale={scale} />
      </Section>
    </>
  );

  const results = (
    <Section
      title="Simulation"
      aside={
        <div role="tablist" aria-label="Simulation view" className="inline-flex gap-1">
          {(['casts', 'preview'] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              data-active={view === v || undefined}
              onClick={() => setView(v)}
              className={`slot slot-hover font-game px-3 py-1 text-[16px] ${view === v ? 'text-ink' : 'text-muted hover:text-ink'}`}
            >
              {v === 'casts' ? 'Casts' : 'Preview'}
            </button>
          ))}
        </div>
      }
    >
      {view === 'preview' ? (
        <div className="space-y-3">
          <RangePreview wand={wand} options={options} active />
          {sim.summary && (
            <p className="text-xs text-faint">
              Simulated: {sim.summary.casts} cast{sim.summary.casts === 1 ? '' : 's'} per {fmtNum(sim.summary.cycleFrames / 60)}s cycle, ≈{fmtNum(sim.summary.dps, 0)} DPS
              expected. The range measures what actually lands on the dummy.
            </p>
          )}
        </div>
      ) : (
        <CastResults sim={sim} onHoverCast={setHoverCast} />
      )}
    </Section>
  );

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      <Page
        wide
        title="Wand Builder"
        subtitle={desktop ? "Drag spells onto the wand — every cast is simulated with Noita's own code" : 'Simulated with Noita’s own code'}
        actions={toolbar}
      >
        {desktop ? (
          <div className="grid grid-cols-[260px_minmax(0,1fr)_minmax(340px,420px)] gap-6">
            <aside className="panel sticky top-[calc(var(--page-header-h,88px)+4px)] h-[calc(100vh-var(--page-header-h,88px)-24px)] p-3">
              <SpellPalette onPick={pick} scale={2} compact />
            </aside>
            <div className="min-w-0">{builder}</div>
            <div className="min-w-0">{results}</div>
          </div>
        ) : (
          <div style={{ paddingBottom: paletteOpen ? '48vh' : 0 }}>
            {builder}
            {results}
          </div>
        )}
      </Page>

      {!desktop && (
        <>
          <AnimatePresence>
            {paletteOpen && (
              <motion.div
                className="fixed inset-x-0 bottom-[calc(var(--nav-h)+env(safe-area-inset-bottom))] z-30 h-[46vh] border-t-2 border-gold/60 bg-[#0d0a09f2] px-3 pt-2 shadow-[0_-10px_40px_#0009]"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-game flex items-center gap-2 text-[16px]">
                    <BookOpen size={15} className="text-ember" /> Spells
                  </span>
                  <span className="text-[11px] text-faint">Tap to add · hold &amp; drag to place</span>
                  <button onClick={() => setPaletteOpen(false)} aria-label="Close spell list" className="slot p-1.5 text-muted">
                    <X size={15} />
                  </button>
                </div>
                <div className="h-[calc(100%-36px)]">
                  <SpellPalette onPick={pick} scale={2} compact />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {!paletteOpen && (
            <motion.button
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              onClick={() => setPaletteOpen(true)}
              className="fixed right-4 bottom-[calc(var(--nav-h)+env(safe-area-inset-bottom)+16px)] z-30 inline-flex items-center gap-2 btn-game font-game text-[16px] px-5 py-3.5"
            >
              <Plus size={19} /> Add spells
            </motion.button>
          )}
        </>
      )}

      <TrashZone visible={!!dragging && dragging.source !== 'palette'} />
      <DragOverlay dropAnimation={{ duration: 160 }}>
        {dragSpell && (
          <div className="scale-110 drop-shadow-[0_8px_16px_#000a]">
            <SpellIcon type={dragSpell.type} icon={dragSpell.icon} scale={scale} />
          </div>
        )}
      </DragOverlay>

      <Sheet open={buildsOpen} onClose={() => setBuildsOpen(false)} title="Builds & share">
        <BuildsPanel onLoaded={() => setBuildsOpen(false)} />
      </Sheet>

      <AnimatePresence>
        {toast && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="panel fixed top-4 left-1/2 z-[80] -translate-x-1/2 px-4 py-2 text-sm shadow-[var(--shadow)]"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </DndContext>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} title={label} aria-label={label} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-30">
      {children}
    </button>
  );
}

function SimToggles() {
  const options = useWand((s) => s.options);
  const shuffle = useWand((s) => s.wand.shuffle);
  const setOptions = useWand((s) => s.setOptions);
  return (
    <div className="flex items-center gap-2 text-xs">
      <label className="inline-flex cursor-pointer items-center gap-1.5 text-muted">
        <input type="checkbox" checked={options.unlimitedSpells} onChange={(e) => setOptions({ unlimitedSpells: e.target.checked })} className="accent-[var(--ember)]" />
        Unlimited spells
      </label>
      {shuffle && (
        <button onClick={() => setOptions({ frame: options.frame + 1 })} title="Re-roll the shuffle" className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-muted hover:text-ink">
          <Dices size={13} /> Shuffle
        </button>
      )}
    </div>
  );
}
