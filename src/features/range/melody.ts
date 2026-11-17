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

/**
 * The scripts' song tables, in the order the game's `pairs()` walks them when a note starts a new song.
 * Measured by running the tables through Noita's own lua51.dll (LuaJIT 2.0.4, no hash seed, so it is the
 * same every time): worm, alchemy, portal, bomb. The alchemy songs are written in another key (ALT_NOTES).
 */
const SONGS: Record<Instrument, [Song, string[]][]> = {
  kantele: [
    ['worm', ['d', 'e', 'a', 'e', 'dis']],
    ['alchemy', ['f', 'g', 'f', 'a2', 'c']],
    ['portal', ['a', 'dis', 'e', 'g']],
    ['bomb', ['g', 'd', 'e', 'd']],
  ],
  ocarina: [
    ['worm', ['gsharp', 'f', 'e', 'b', 'd']],
    ['alchemy', ['a2', 'd', 'dis', 'e', 'a']],
    ['portal', ['a', 'f', 'd', 'e', 'a2']],
    ['bomb', ['f', 'c', 'd', 'c']],
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
 * The game follows a single song, a line-by-line port of the script. On the kantele the translated alchemy
 * song and the bomb song both open on G; alchemy comes first in table order, so G always starts alchemy and
 * the kantele bomb song can never be finished (the wiki calls it unreliable).
 */
export class SongState {
  /** The song being played (kantele_song) and how many of its notes have been heard (kantele_song_pos). */
  song: Song | null = null;
  pos = 0;

  constructor(readonly instrument: Instrument) {}

  /** Play a note; returns the song it completes, if any. */
  play(note: string): Song | null {
    const songs = SONGS[this.instrument];
    let found = false;
    let done: Song | null = null;
    const current = this.song && songs.find(([s]) => s === this.song);
    if (current) {
      const [song, notes] = current;
      if (note === noteAt(song, notes, this.pos)) {
        if (this.pos + 1 < notes.length) {
          this.pos++;
          found = true;
        } else done = song;
      }
    }
    if (!found) {
      this.song = null;
      this.pos = 0;
    }
    // A note that breaks the tune may begin a new one: the first song (in table order) that opens on it.
    if (!this.song && !done) {
      const start = songs.find(([song, notes]) => note === noteAt(song, notes, 0));
      if (start) {
        this.song = start[0];
        this.pos = 1;
      }
    }
    return done;
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
