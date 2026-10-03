// Genera le icone PNG dell'app a partire da un SVG.
import { chromium } from 'playwright-core';
const heart = (fill) => `<path fill="${fill}" d="M12 21s-7.5-4.6-10-9.4C.3 8.3 2.2 4 6.3 4c2.2 0 3.7 1.3 4.7 2.8C12 5.3 13.5 4 15.7 4 19.8 4 21.7 8.3 20 11.6 17.5 16.4 12 21 12 21z"/>`;
const svg = (size, pad, round) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd1e1"/><stop offset="1" stop-color="#ffe7a8"/></linearGradient></defs>
  <rect width="100" height="100" rx="${round}" fill="url(#g)"/>
  <g transform="translate(${18 + pad} ${24 + pad}) scale(${(2.3 - pad / 20)})">${heart('#f48fb1')}</g>
  <g transform="translate(${38 + pad * 0.6} ${34 + pad * 0.6}) scale(${(1.9 - pad / 25)})">${heart('#f6c445')}</g>
</svg>`;
const badge = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24">${heart('#000')}</svg>`;
const out = [
  ['icon-192.png', svg(192, 0, 22), 192], ['icon-512.png', svg(512, 0, 22), 512],
  ['apple-touch-icon.png', svg(180, 0, 0), 180], ['icon-maskable.png', svg(512, 8, 0), 512], ['badge.png', badge, 96],
];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
for (const [name, s, size] of out) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${s}</body></html>`);
  await page.screenshot({ path: `public/icons/${name}`, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
