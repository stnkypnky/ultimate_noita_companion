// Renders the PWA icons from public/favicon.svg. Run: npm run icons
import sharp from 'sharp';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const svg = await readFile(join(root, 'public/favicon.svg'));
const out = join(root, 'public/icons');
await mkdir(out, { recursive: true });

for (const size of [192, 512]) {
  await sharp(svg, { density: 512 }).resize(size, size).png().toFile(join(out, `icon-${size}.png`));
}

// Maskable: art inside the 80% safe zone on a full-bleed background.
const inner = await sharp(svg, { density: 512 }).resize(380, 380).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#0d0b10' } })
  .composite([{ input: inner, gravity: 'center' }])
  .png()
  .toFile(join(out, 'icon-maskable-512.png'));

console.log('icons written to public/icons');
