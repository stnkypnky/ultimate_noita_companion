import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const STEAM_DEFAULT = 'C:/Program Files (x86)/Steam';

/** Finds the Noita install: $NOITA_PATH, the default Steam library, or any library in libraryfolders.vdf. */
export function findNoita(): string {
  const candidates: string[] = [];
  if (process.env.NOITA_PATH) candidates.push(process.env.NOITA_PATH);
  candidates.push(join(STEAM_DEFAULT, 'steamapps/common/Noita'));

  const vdf = join(STEAM_DEFAULT, 'steamapps/libraryfolders.vdf');
  if (existsSync(vdf)) {
    for (const m of readFileSync(vdf, 'utf8').matchAll(/"path"\s+"([^"]+)"/g)) {
      candidates.push(join(m[1]!.replace(/\\\\/g, '/'), 'steamapps/common/Noita'));
    }
  }
  candidates.push(join(process.env.HOME ?? '', '.steam/steam/steamapps/common/Noita'));

  const found = candidates.find((p) => existsSync(join(p, 'data/data.wak')));
  if (!found) {
    throw new Error(`Noita not found. Tried:\n  ${candidates.join('\n  ')}\nSet NOITA_PATH to the game folder.`);
  }
  return found;
}
