import { useEffect, useMemo, useState } from 'react';
import { useData } from '@/data/store';
import { Analyzer, type CastView, type Summary } from '@/sim/analyze';
import { simulate } from '@/sim/client';
import type { SimResult } from '@/sim/types';
import { useDebounced } from '@/ui/hooks';
import { toSimRequest, type SimOptions, type Wand } from './model';

export type SimState = {
  status: 'idle' | 'running' | 'done' | 'error';
  error?: string;
  casts: CastView[];
  summary: Summary | null;
  /** Deck card number (1-based) → wand slot index. */
  slotOfCard: number[];
  missing: string[];
};

/** Re-simulates (debounced) whenever the wand or options change; keeps the previous result while running. */
export function useSimulation(wand: Wand, options: SimOptions): SimState {
  const { spells, spellById, projectiles } = useData();
  const analyzer = useMemo(() => new Analyzer(projectiles, spells), [projectiles, spells]);
  const input = useDebounced(
    useMemo(() => ({ wand, options }), [wand, options]),
    120,
  );
  const [state, setState] = useState<SimState>({ status: 'idle', casts: [], summary: null, slotOfCard: [], missing: [] });

  useEffect(() => {
    let cancelled = false;
    const { req, slotOfCard } = toSimRequest(input.wand, input.options, spellById);
    if (!req.deck.length && !req.alwaysCasts.length) {
      setState({ status: 'idle', casts: [], summary: null, slotOfCard: [], missing: [] });
      return;
    }
    setState((s) => ({ ...s, status: 'running' }));
    simulate(req).then(
      (r: SimResult) => {
        if (cancelled) return;
        const { casts, summary } = analyzer.run(r);
        setState({ status: 'done', casts, summary, slotOfCard, missing: r.missing });
      },
      (e: Error) => !cancelled && setState((s) => ({ ...s, status: 'error', error: e.message })),
    );
    return () => {
      cancelled = true;
    };
  }, [input, spellById, analyzer]);

  return state;
}
