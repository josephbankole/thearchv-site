// Build the 1200x630 social share image from the Lusail 2022 poster on a navy field.
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', '..', 'POSTERS', 'FINAL',
  'hf_20260606_040404_3f0b7abf-122d-4e13-af04-38fdccb00068.jpeg');
const OUT = join(__dirname, '..', 'public', 'og.jpg');

const NAVY = { r: 12, g: 42, b: 62, alpha: 1 }; // #0C2A3E

// Poster panel on the right, brand lockup space on the left.
const poster = await sharp(SRC).resize({ height: 600 }).toBuffer();
const meta = await sharp(poster).metadata();

const label = Buffer.from(
  `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
     <text x="80" y="300" font-family="Georgia, serif" font-size="64" fill="#F2EAD3" letter-spacing="-2">Football has a</text>
     <text x="80" y="372" font-family="Georgia, serif" font-size="64" fill="#F2EAD3" letter-spacing="-2">memory.</text>
     <text x="80" y="470" font-family="Arial, sans-serif" font-size="22" fill="#C9A14A" letter-spacing="6">THE ARCHV</text>
   </svg>`
);

await sharp({ create: { width: 1200, height: 630, channels: 4, background: NAVY } })
  .composite([
    { input: poster, top: 15, left: 1200 - (meta.width ?? 400) - 40 },
    { input: label, top: 0, left: 0 },
  ])
  .jpeg({ quality: 86 })
  .toFile(OUT);

console.log('Wrote public/og.jpg');
