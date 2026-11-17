import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { idbStorage } from '@/store/kv';
import { DEFAULT_OPTIONS, DEFAULT_WAND, MAX_CAPACITY, resize, type SimOptions, type Wand } from './model';

const HISTORY = 50;

/** The wand with one slot's charges set (null = full); a wand with nothing spent keeps no charges list. */
function withCharge(w: Wand, slot: number, n: number | null): Wand {
  if (!w.charges && n === null) return w;
  const charges = resize(w.charges ?? [], w.capacity);
  charges[slot] = n;
  return charges.some((c) => c !== null) ? { ...w, charges } : { ...w, charges: undefined };
}

type WandState = {
  wand: Wand;
  options: SimOptions;
  past: Wand[];
  future: Wand[];
  /** Replace the wand (recorded in undo history). */
  edit: (fn: (w: Wand) => Wand) => void;
  setStat: <K extends keyof Wand>(key: K, value: Wand[K]) => void;
  setCapacity: (n: number) => void;
  place: (slot: number, id: string) => void;
  /** Put a spell in the first empty slot; returns false if the wand is full. */
  addToFirstEmpty: (id: string) => boolean;
  swap: (a: number, b: number) => void;
  remove: (slot: number) => void;
  clear: () => void;
  addAlwaysCast: (id: string) => void;
  removeAlwaysCast: (index: number) => void;
  load: (w: Wand) => void;
  /** Set a slot's charges left (null = full); recorded in undo history. */
  setCharges: (slot: number, n: number | null) => void;
  /** Charges spent by casting in the test range (not an edit, so not in undo history). */
  spendCharges: (charges: (number | null)[]) => void;
  /** Every spell back to full charges. */
  refillCharges: () => void;
  /** Bumped on every refill, so the test range refills its live deck even when the wand was already full. */
  refills: number;
  setOptions: (o: Partial<SimOptions>) => void;
  undo: () => void;
  redo: () => void;
};

export const useWand = create<WandState>()(
  persist(
    (set, get) => ({
      wand: DEFAULT_WAND,
      options: DEFAULT_OPTIONS,
      past: [],
      future: [],
      edit: (fn) =>
        set((s) => {
          const next = fn(s.wand);
          if (next === s.wand) return s;
          return { wand: next, past: [...s.past, s.wand].slice(-HISTORY), future: [] };
        }),
      setStat: (key, value) => get().edit((w) => ({ ...w, [key]: value })),
      setCapacity: (n) => {
        const capacity = Math.max(1, Math.min(MAX_CAPACITY, Math.round(n)));
        get().edit((w) => ({ ...w, capacity, spells: resize(w.spells, capacity), ...(w.charges ? { charges: resize(w.charges, capacity) } : {}) }));
      },
      // A spell put in a slot arrives with full charges.
      place: (slot, id) => get().edit((w) => withCharge({ ...w, spells: w.spells.map((s, i) => (i === slot ? id : s)) }, slot, null)),
      addToFirstEmpty: (id) => {
        const slot = get().wand.spells.indexOf(null);
        if (slot < 0) return false;
        get().place(slot, id);
        return true;
      },
      swap: (a, b) =>
        get().edit((w) => {
          if (a === b) return w;
          const spells = [...w.spells];
          [spells[a], spells[b]] = [spells[b] ?? null, spells[a] ?? null];
          if (!w.charges) return { ...w, spells };
          // Charges travel with their spell.
          const charges = resize(w.charges, w.capacity);
          [charges[a], charges[b]] = [charges[b] ?? null, charges[a] ?? null];
          return { ...w, spells, charges };
        }),
      remove: (slot) => get().edit((w) => withCharge({ ...w, spells: w.spells.map((s, i) => (i === slot ? null : s)) }, slot, null)),
      clear: () => get().edit((w) => ({ ...w, spells: w.spells.map(() => null), alwaysCasts: [], charges: undefined })),
      addAlwaysCast: (id) => get().edit((w) => ({ ...w, alwaysCasts: [...w.alwaysCasts, id] })),
      removeAlwaysCast: (index) => get().edit((w) => ({ ...w, alwaysCasts: w.alwaysCasts.filter((_, i) => i !== index) })),
      load: (w) => get().edit(() => ({ ...w, spells: resize(w.spells, w.capacity), ...(w.charges ? { charges: resize(w.charges, w.capacity) } : {}) })),
      setCharges: (slot, n) => get().edit((w) => withCharge(w, slot, n)),
      spendCharges: (charges) =>
        set((s) => ({ wand: { ...s.wand, charges: charges.some((c) => c !== null) ? resize(charges, s.wand.capacity) : undefined } })),
      refillCharges: () => set((s) => ({ wand: { ...s.wand, charges: undefined }, refills: s.refills + 1 })),
      refills: 0,
      setOptions: (o) => set((s) => ({ options: { ...s.options, ...o } })),
      undo: () =>
        set((s) => {
          const prev = s.past.at(-1);
          return prev ? { wand: prev, past: s.past.slice(0, -1), future: [s.wand, ...s.future] } : s;
        }),
      redo: () =>
        set((s) => {
          const next = s.future[0];
          return next ? { wand: next, past: [...s.past, s.wand], future: s.future.slice(1) } : s;
        }),
    }),
    {
      name: 'wand',
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({ wand: s.wand, options: s.options }),
      version: 1,
    },
  ),
);
