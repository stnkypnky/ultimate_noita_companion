import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { idbStorage } from '@/store/kv';
import { DEFAULT_OPTIONS, DEFAULT_WAND, MAX_CAPACITY, resize, type SimOptions, type Wand } from './model';

const HISTORY = 50;

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
        get().edit((w) => ({ ...w, capacity, spells: resize(w.spells, capacity) }));
      },
      place: (slot, id) => get().edit((w) => ({ ...w, spells: w.spells.map((s, i) => (i === slot ? id : s)) })),
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
          return { ...w, spells };
        }),
      remove: (slot) => get().edit((w) => ({ ...w, spells: w.spells.map((s, i) => (i === slot ? null : s)) })),
      clear: () => get().edit((w) => ({ ...w, spells: w.spells.map(() => null), alwaysCasts: [] })),
      addAlwaysCast: (id) => get().edit((w) => ({ ...w, alwaysCasts: [...w.alwaysCasts, id] })),
      removeAlwaysCast: (index) => get().edit((w) => ({ ...w, alwaysCasts: w.alwaysCasts.filter((_, i) => i !== index) })),
      load: (w) => get().edit(() => ({ ...w, spells: resize(w.spells, w.capacity) })),
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
