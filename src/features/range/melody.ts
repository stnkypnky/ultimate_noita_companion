/**
 * Note spells and the songs they play, ported from the game's data/scripts/magic/kantele.lua and ocarina.lua.
 *
 * Every note projectile runs the script once as it appears. If the player is within 24 px of it, the note
 * either continues the song in progress, or (when it doesn't) the song resets and the note may start a new
 * one. Finishing a song does its thing once per instrument per run; after that the game only says the
 * energy is gone.
 */

export type Instrument = 'kantele' | 'ocarina';
export type Song = 'portal' | 'bomb' | 'worm' | 'alchemy';

/** As the scripts list them. The alchemy songs are written in another key (ALT_NOTES). */
const SONGS: Record<Instrument, [Song, string[]][]> = {
  kantele: [
    ['portal', ['a', 'dis', 'e', 'g']],
    ['bomb', ['g', 'd', 'e', 'd']],
    ['worm', ['d', 'e', 'a', 'e', 'dis']],
    ['alchemy', ['f', 'g', 'f', 'a2', 'c']],
  ],
  ocarina: [
    ['portal', ['a', 'f', 'd', 'e', 'a2']],
    ['bomb', ['f', 'c', 'd', 'c']],
    ['worm', ['gsharp', 'f', 'e', 'b', 'd']],
    ['alchemy', ['a2', 'd', 'dis', 'e', 'a']],
  ],
};

/** utilities.lua alt_notes: the alchemy song is written in another key and translated note by note. */
const ALT_NOTES: Record<string, string> = { a: 'f', b: 'a2', c: 'a', d: 'c', dis: 'b', e: 'gsharp', f: 'g', g: 'dis', gsharp: 'd', a2: 'e' };

/** How close (px) the player must be to the note when it appears. */
export const NOTE_REACH = 24;

/** "data/entities/projectiles/deck/kantele/kantele_dis.xml" -> { instrument: 'kantele', note: 'dis' } */
export function noteOf(file: string): { instrument: Instrument; note: string } | null {
  const m = /\/(kantele|ocarina)_([a-z0-9]+)\.xml$/.exec(file);
  return m ? { instrument: m[1] as Instrument, note: m[2]! } : null;
}

const noteAt = (song: Song, notes: string[], i: number) => (song === 'alchemy' ? ALT_NOTES[notes[i]!] : notes[i]);

/**
 * One instrument's song progress, as the player's VariableStorageComponents keep it.
 *
 * The game follows a single song. Two kantele songs open on the same note once the alchemy song is translated
 * (G), and which one the game follows then comes down to Lua's table order, which the files don't pin down
 * (the wiki notes the kantele bomb song is unreliable for this reason). The range follows every song that
 * fits, so either one can be completed here.
 */
export class SongState {
  /** Songs still in play and how many of their notes have been heard. */
  tracks: { song: Song; pos: number }[] = [];

  constructor(readonly instrument: Instrument) {}

  /** Play a note; returns the song it completes, if any. */
  play(note: string): Song | null {
    const songs = SONGS[this.instrument];
    const next: { song: Song; pos: number }[] = [];
    for (const t of this.tracks) {
      const notes = songs.find(([s]) => s === t.song)![1];
      if (note !== noteAt(t.song, notes, t.pos)) continue;
      if (t.pos + 1 === notes.length) {
        this.tracks = [];
        return t.song;
      }
      next.push({ song: t.song, pos: t.pos + 1 });
    }
    // A note that continues no song breaks the tune, and may begin a new one.
    this.tracks = next.length ? next : songs.filter(([song, notes]) => note === noteAt(song, notes, 0)).map(([song]) => ({ song, pos: 1 }));
    return null;
  }
}

/** Both instruments plus which songs this run has already used. */
export class Musician {
  private states = { kantele: new SongState('kantele'), ocarina: new SongState('ocarina') };
  private done = new Set<string>();

  /** A note appeared near the player: what happens, in the game's words. */
  hear(instrument: Instrument, note: string): { song: Song; first: boolean } | null {
    const song = this.states[instrument].play(note);
    if (!song) return null;
    // The alchemy song works on something nearby rather than once per run.
    if (song === 'alchemy') return { song, first: true };
    const key = `${instrument}:${song}`;
    const first = !this.done.has(key);
    this.done.add(key);
    return { song, first };
  }

  reset() {
    this.states = { kantele: new SongState('kantele'), ocarina: new SongState('ocarina') };
    this.done.clear();
  }
}

/** The game's own messages (translations: log_kantele / logdesc_kantele / log_kantele_done / log_alchemist_key_invalid). */
export function songMessage(r: { song: Song; first: boolean }): string {
  if (r.song === 'alchemy') return 'Nothing seemed to happen...';
  return r.first ? 'The world around you changes! Your music released strange energies' : 'Seems like the musical energy is gone...';
}
