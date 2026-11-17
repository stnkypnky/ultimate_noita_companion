// What the files don't say about a place, from the wiki (each note links its page). Shown in an area's details, so
// only once the area itself is visible (revealed, or spoilers shown).
import type { MapBiome } from '@/data/types';

export type AreaNote = { text: string; source: string };

export function areaNotes(b: MapBiome, cx: number, mapWidth: number): AreaNote[] {
  if (b.id === 'gold') {
    const east = cx >= mapWidth / 2;
    return [
      {
        text: 'A whole chunk of gold powder: about 258,674 gold, enough to swim in, and to drown in (move or levitate to breathe). Swimming collects it faster than standing still.',
        source: 'https://noita.wiki.gg/wiki/The_Gold',
      },
      {
        text: east
          ? 'The East Gold: embedded in the eastern wall past the Desert, behind Extremely Dense Rock. From the top-right corner of the Essence of Earth cave, dig toward the top left.'
          : 'The West Gold: at the bottom of the western Lake, below the Essence of Spirits, covered by Extremely Dense Rock and lava. Digging down from the lake bottom lets the water cool the lava.',
        source: 'https://noita.wiki.gg/wiki/The_Gold',
      },
      {
        text: 'Every world has these two, and so does every parallel world (at the same places in it).',
        source: 'https://noita.wiki.gg/wiki/The_Gold',
      },
    ];
  }
  return [];
}
