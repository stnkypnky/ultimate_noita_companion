import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/store/db';
import { decodeWand, pickOtherWands } from './model';

const NONE: string[][] = [];

/** The saved builds standing in for the other wands you carry (for Zeta), as spell id lists. Empty with no saved builds. */
export function useOtherWands(current: string): string[][] {
  const builds = useLiveQuery(() => db.builds.orderBy('updatedAt').reverse().toArray(), []);
  const [wands, setWands] = useState(NONE);

  useEffect(() => {
    let off = false;
    void Promise.all(
      (builds ?? []).map((b) =>
        decodeWand(b.code).then(
          (wand) => ({ name: b.name, wand }),
          () => null,
        ),
      ),
    ).then((decoded) => {
      if (off) return;
      const next = pickOtherWands(
        decoded.filter((d) => d !== null),
        current,
      );
      setWands((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next.length ? next : NONE));
    });
    return () => {
      off = true;
    };
  }, [builds, current]);

  return wands;
}
