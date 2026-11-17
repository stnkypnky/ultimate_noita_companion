import { ExternalLink } from 'lucide-react';
import { isPlaceholder, itemInfo, type ItemInfo, type LootRow } from '@/data/itemInfo';
import type { Item } from '@/data/types';
import { Section } from '@/ui/controls';
import { InlineSpoiler } from '@/ui/Spoiler';

/** The game's own description, then the companion's note (src/data/itemInfo.ts). Loot odds go in hidden mechanics. */
export function ItemDescription({ item }: { item: Item }) {
  const info = itemInfo(item.id);
  const game = isPlaceholder(item.description) ? '' : item.description;
  return (
    <>
      {game && <p className="mt-4 text-[15px] leading-relaxed whitespace-pre-line text-muted">{game}</p>}
      {info ? <CompanionNote info={info} quiet={!!game} /> : !game && <p className="mt-4 text-[15px] text-faint">No in-game description.</p>}
    </>
  );
}

function CompanionNote({ info, quiet }: { info: ItemInfo; quiet: boolean }) {
  return (
    <div className="mt-4">
      <p className={`text-[15px] leading-relaxed whitespace-pre-line ${quiet ? 'text-faint' : 'text-muted'}`}>
        {info.text} <Source source={info.source} />
      </p>
      {info.secret && (
        <div className="mt-2">
          <InlineSpoiler label="Show late-game secret">
            <p className="text-[15px] leading-relaxed text-muted">{info.secret}</p>
          </InlineSpoiler>
        </div>
      )}
    </div>
  );
}

/** "(companion note)" with where it came from: a wiki link or the script path. */
function Source({ source }: { source: string }) {
  if (source.startsWith('http'))
    return (
      <a href={source} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-[11px] whitespace-nowrap text-faint hover:text-gold">
        (companion note, wiki <ExternalLink size={10} />)
      </a>
    );
  return (
    <span className="text-[11px] whitespace-nowrap text-faint" title={source}>
      (companion note, game files)
    </span>
  );
}

/** A chest's loot odds; shown inside the hidden mechanics panel. */
export function LootTable({ loot }: { loot: NonNullable<ItemInfo['loot']> }) {
  const open = loot.rows.filter((r) => !r.secret);
  const secret = loot.rows.filter((r) => r.secret);
  return (
    <Section title={loot.title}>
      <div className="panel px-3 py-2">
        <ul className="divide-y divide-line">
          {open.map((r) => (
            <Row key={r.what} row={r} />
          ))}
        </ul>
        {secret.length > 0 && (
          <div className="py-2">
            <InlineSpoiler label={`Show ${secret.length} late-game ${secret.length === 1 ? 'row' : 'rows'}`}>
              <ul className="divide-y divide-line">
                {secret.map((r) => (
                  <Row key={r.what} row={r} />
                ))}
              </ul>
            </InlineSpoiler>
          </div>
        )}
        {loot.note && <p className="border-t border-line pt-2 pb-1 text-[13px] text-faint">{loot.note}</p>}
      </div>
    </Section>
  );
}

function Row({ row }: { row: LootRow }) {
  return (
    <li className="flex items-baseline gap-3 py-1.5">
      <span className="font-game w-10 shrink-0 text-right text-[16px] text-gold tabular-nums">{row.odds}</span>
      <span className="text-[14px] leading-snug text-muted">{row.what}</span>
    </li>
  );
}
