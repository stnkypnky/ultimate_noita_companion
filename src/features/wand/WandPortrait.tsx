import { useEffect, useState } from 'react';
import { fetchJson, gameUrl } from '@/data/store';
import type { RangeKit, WandSprite } from '@/data/types';
import { pickWandSprite } from '@/features/range/player';
import type { Wand } from './model';

// The game's 1000 wand sprites (wands.lua), packed by the extractor for the test range.
let kit: Promise<RangeKit> | null = null;
const loadKit = () => (kit ??= fetchJson<RangeKit>('data/range_kit.json'));

/** The sprite this wand shows: the one the game rolled for it, or else the one its stats would get. */
export function useWandSprite(wand: Wand): WandSprite | undefined {
  const [sprites, setSprites] = useState<WandSprite[] | null>(null);
  useEffect(() => {
    let live = true;
    loadKit().then(
      (k) => live && setSprites(k.wands),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);
  if (!sprites) return undefined;
  return (wand.sprite && sprites.find((s) => s.file === wand.sprite)) || pickWandSprite(sprites, wand);
}

/** The wand as it looks in the game, scaled up with crisp pixels. Rare wands glow purple, as in the game. */
export function WandPortrait({ wand, scale = 4 }: { wand: Wand; scale?: number }) {
  const sprite = useWandSprite(wand);
  const [atlas, setAtlas] = useState<[number, number] | null>(null);
  useEffect(() => {
    const img = new Image();
    img.onload = () => setAtlas([img.naturalWidth, img.naturalHeight]);
    img.src = gameUrl('sprites/range_wands.png');
  }, []);
  const box = { width: 40 * scale, height: 14 * scale };
  if (!sprite || !atlas) return <span className="block shrink-0" style={box} aria-hidden />;
  const { icon } = sprite;
  return (
    <span className="grid shrink-0 place-items-center" style={box} title={wand.rare ? 'Rare wand' : undefined}>
      <span className={wand.rare ? 'secret-icon' : undefined}>
        <span
          role="img"
          aria-label={wand.rare ? 'Rare wand sprite' : 'Wand sprite'}
          className="pixelated block"
          style={{
            width: icon.w * scale,
            height: icon.h * scale,
            backgroundImage: `url(${gameUrl('sprites/range_wands.png')})`,
            backgroundPosition: `-${icon.x * scale}px -${icon.y * scale}px`,
            backgroundSize: `${atlas[0] * scale}px ${atlas[1] * scale}px`,
          }}
        />
      </span>
    </span>
  );
}
