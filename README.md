# Ultimate Noita Companion

A mobile-first (and laptop-friendly) PWA companion for [Noita](https://noitagame.com/):

- **Wand Builder & Simulator**: drag and drop spells onto a wand, then simulate each cast using the game's own `gun.lua` deck logic.
- **Spells, Perks & Items database**: built from the game files, with search and filters.
- **Materials & Alchemy**: material properties, reactions, and Lively Concoction / Alchemic Precursor recipes for a given seed.
- **Spoiler protection**: shows only what you've discovered in-game, synced from your save files on your PC and sent to your phone by QR code.
- **Offline**: install it to your phone or desktop and use it with no connection.

> **Disclaimer:** This is an unofficial fan project and is not affiliated with or endorsed by Nolla Games.
> Game data, art and scripts under `public/game/` are © Nolla Games and are included for reference.

## Development

```bash
npm install
npm run dev          # local dev server
npm run extract      # regenerate public/game/ from your local Noita install
npm test             # unit tests
npm run build        # production build
```

`npm run extract` looks for Noita in the default Steam library folder. If yours is elsewhere, set `NOITA_PATH` to the game folder.

## License

The source code is under the MIT license. Extracted game content is not covered; see [LICENSE](LICENSE).
