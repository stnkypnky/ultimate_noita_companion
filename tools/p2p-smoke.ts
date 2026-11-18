// Real-network check of device sync: two isolated browsers pair with the same key, one reads a save,
// the other should receive it over WebRTC. Needs `npm run build && npx vite preview --port 4173` running.
// Usage: npx tsx tools/p2p-smoke.ts <path to a folder containing save00>
import { chromium } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:4173/';
const saveDir = process.argv[2];
if (!saveDir) throw new Error('Pass the folder that contains save00');
const key = randomBytes(16).toString('base64url');

const browser = await chromium.launch();
const open = async (name: string) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript((n) => localStorage.setItem('device-name', n), name);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${name}] pageerror`, e.message));
  page.on('console', (m) => m.type() === 'error' && console.log(`[${name}] console`, m.text()));
  await page.goto(`${BASE}pair#k=${key}`);
  try {
    await page.getByText('Paired', { exact: true }).waitFor({ timeout: 30000 });
  } catch (e) {
    console.log(`[${name}] url ${page.url()} page text:`, (await page.locator('body').innerText()).slice(0, 600));
    throw e;
  }
  return page;
};

const [pc, phone] = await Promise.all([open('Test PC'), open('Test Phone')]);
const t0 = Date.now();
await phone.getByText('Connected to Test PC').waitFor({ timeout: 60000 });
console.log(`connected in ${Date.now() - t0} ms`);

await pc.goto(`${BASE}progress`);
await pc.locator('input[type=file]').first().setInputFiles(join(saveDir, 'save00'));
await pc.getByText('Progress synced on this device').waitFor({ timeout: 15000 });

await phone.goto(`${BASE}progress`);
const t1 = Date.now();
try {
  await phone.getByText(/Save from .* · Test PC/).waitFor({ timeout: 30000 });
} catch (e) {
  console.log('phone text:', (await phone.locator('main').innerText()).slice(0, 800));
  console.log('pc text:', (await pc.locator('main').innerText()).slice(0, 800));
  throw e;
}
console.log(`phone received the PC's save in ${Date.now() - t1} ms`);
console.log('phone page says:', (await phone.locator('main').innerText()).split('\n').slice(0, 12).join(' | '));

// Reveal sync: hide-all on phone is hard to drive generically; check settings round trip instead.
await phone.evaluate(() => localStorage.setItem('wand-view', 'preview'));
await pc.waitForFunction(() => localStorage.getItem('wand-view') === 'preview', null, { timeout: 30000 });
console.log('setting synced phone -> PC');

if (process.env.SHOTS) {
  await pc.getByRole('button', { name: 'Pair another device' }).click();
  await pc.waitForTimeout(800);
  await pc.screenshot({ path: join(process.env.SHOTS, 'pc-progress.png'), fullPage: true });
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.waitForTimeout(500);
  await phone.screenshot({ path: join(process.env.SHOTS, 'phone-progress.png'), fullPage: true });
}
await browser.close();
