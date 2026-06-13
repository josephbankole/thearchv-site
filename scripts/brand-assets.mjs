// Prepare brand assets for the web: transparent circular badge + optimized banner.
// Sources live in ../ (the fifa.archv working folder). Outputs to public/brand/.
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', '..');
const OUT = join(__dirname, '..', 'public', 'brand');
await mkdir(OUT, { recursive: true });

// --- Badge: circle-crop the 1024² logo so the cream background becomes transparent ---
const SIZE = 1024;
const R = 398; // crop tight to the navy emblem edge (the source has a cream halo to remove)
const mask = Buffer.from(
  `<svg width="${SIZE}" height="${SIZE}"><circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${R}" fill="#fff"/></svg>`,
);
const badgeBuf = await sharp(join(SRC, 'THEARCHV_LOGO.png'))
  .resize(SIZE, SIZE, { fit: 'cover' })
  .composite([{ input: mask, blend: 'dest-in' }])
  .png()
  .toBuffer();
await sharp(badgeBuf).resize(512).toFile(join(OUT, 'logo-badge.png'));
await sharp(badgeBuf).resize(192).toFile(join(OUT, 'logo-badge@192.png'));
console.log('✓ logo-badge.png (transparent circle)');

// --- Banner: the wide "The ARCHV" banner, web-optimized ---
await sharp(join(SRC, 'ARCHV_BANNER.png')).resize({ width: 2000 }).webp({ quality: 74 }).toFile(join(OUT, 'banner.webp'));
await sharp(join(SRC, 'ARCHV_BANNER.png')).resize({ width: 1100 }).webp({ quality: 72 }).toFile(join(OUT, 'banner-sm.webp'));
console.log('✓ banner.webp + banner-sm.webp');
