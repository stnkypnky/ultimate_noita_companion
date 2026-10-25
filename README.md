# Ultimate Noita Companion

A mobile-first PWA companion for [Noita](https://noitagame.com/) that also works properly on a laptop. It installs on your phone or desktop and works offline.

**Live app:** https://stnkypnky.github.io/ultimate_noita_companion/

## Features

- **Wand Builder & Simulator**: drag spells onto a wand (mouse, touch long-press, or tap-to-place). Every cast is simulated by running the game's own `gun.lua` / `gun_actions.lua` in Lua-in-WASM, so multicasts, triggers and payloads, modifiers, wrapping, Always Cast, mana, cast delay and recharge all behave as they do in-game. You can save builds on the device and share them as links or QR codes.
- **Spells, Perks & Items**: everything comes from the game files. Spell stats use the same reflection the game uses for its tooltips, joined with each spell's projectile data (damage types, explosions, lifetime, speed, bounces) and its spawn tiers.
- **Materials & Alchemy**: material properties, textures and every reaction in `materials.xml`; a "mix two materials" tool; and Lively Concoction / Alchemic Precursor recipes for any world seed.
- **Spoiler protection**: only shows what you've discovered in-game. On your PC, choose your `save00` folder (it's read locally and nothing is uploaded), then scan the QR code with your phone. You can reveal individual items or turn protection off.
- **Offline**: every page, all the game data, the Lua sources and the WASM runtime are precached.

> **Disclaimer:** This is an unofficial fan project and is not affiliated with or endorsed by Nolla Games.
> Game data, art and scripts under `public/game/` are © Nolla Games and are included for reference.

## Development

```bash
npm install
npm run dev          # local dev server
npm run extract      # regenerate public/game/ from your local Noita install
npm test             # unit + simulator golden tests (use the committed game scripts)
npm run build        # production build
```

`npm run extract` looks for Noita in your Steam libraries. If it's installed elsewhere, set `NOITA_PATH` to the game folder. The extractor reads `data/data.wak` directly and runs the game's Lua with a small fake engine (`src/sim/lua/engine.lua`). The browser simulator uses the same code.

## Credits

- Seed alchemy algorithm: ported from [lamas_stats](https://github.com/lamia-zamia/lamas_stats) (WTFPL) and cross-checked against [noita-tools](https://github.com/TwoAbove/noita-tools) (MIT).
- Lua runtime: [wasmoon](https://github.com/ceifa/wasmoon).

## License

The source code is under the MIT license. Extracted game content is not covered; see [LICENSE](LICENSE).
