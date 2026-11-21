/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';
import { execSync } from 'node:child_process';

// GitHub Pages serves the app from /<repo>/; local dev uses /.
const base = process.env.GITHUB_PAGES ? '/ultimate_noita_companion/' : '/';

/** Which version of the app this is: the commit and its time, so paired devices can tell who is out of date. */
function appBuild() {
  try {
    const [sha, time] = execSync('git log -1 --format=%h_%ct', { encoding: 'utf8' }).trim().split('_');
    return { commit: sha!, time: Number(time) * 1000 };
  } catch {
    return { commit: 'dev', time: Date.now() };
  }
}
const build = appBuild();

export default defineConfig({
  base,
  define: {
    __APP_BUILD__: JSON.stringify(build.time),
    __APP_COMMIT__: JSON.stringify(build.commit),
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Ultimate Noita Companion',
        short_name: 'Noita Companion',
        description: 'Wand simulator, spell & perk database, materials and alchemy for Noita.',
        theme_color: '#0a0807',
        background_color: '#0a0807',
        display: 'standalone',
        orientation: 'any',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Everything the app needs offline: shell, game data, sprites, Lua sources, wasm.
        globPatterns: ['**/*.{js,css,html,svg,png,webp,json,lua,wasm,woff2,otf}'],
        // The world map's room pictures (~3 MB) are only fetched when the map is opened, then kept for offline.
        globIgnores: ['**/game/map/**'],
        runtimeCaching: [{ urlPattern: /\/game\/map\/.+\.png$/, handler: 'CacheFirst', options: { cacheName: 'map-pictures', expiration: { maxEntries: 400 } } }],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  worker: { format: 'es' },
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    passWithNoTests: true,
  },
});
