import type { Material } from '@/data/types';
import { gameUrl } from '@/data/store';

/** Material tile: its in-game texture when it has one, otherwise its colour. Secret materials glow purple. */
export function MaterialSwatch({ material, size = 32, hidden, secret }: { material: Material; size?: number; hidden?: boolean; secret?: boolean }) {
  if (hidden) {
    return (
      <span
        className={`grid shrink-0 place-items-center rounded-md border border-dashed bg-raised font-display ${secret ? 'secret-name border-arcane/70' : 'border-line-strong text-faint'}`}
        style={{ width: size, height: size, fontSize: size * 0.45 }}
      >
        ?
      </span>
    );
  }
  const swatch = (
    <span
      aria-hidden
      className="pixelated inline-block shrink-0 rounded-md border border-white/10"
      style={{
        width: size,
        height: size,
        backgroundColor: material.color,
        backgroundImage: material.texture ? `url(${gameUrl(`materials/${material.texture}`)})` : undefined,
        backgroundSize: material.texture ? `${size * 2}px` : undefined,
        boxShadow: material.state === 'fire' || material.onFire ? `0 0 ${size / 3}px ${material.color}` : undefined,
      }}
    />
  );
  return secret ? <span className="secret-icon inline-flex shrink-0">{swatch}</span> : swatch;
}
