// Prepare brand assets for the web: transparent circular badge + optimized banner.
// Sources live in ../ (the fifa.archv working folder). Outputs to public/brand/.
// NEVER add to the "build" chain: reads OUTSIDE the repo, founder's workspace only — in CI it is
// a guaranteed ENOENT (CLAUDE.md trap 0). Rewrites committed binaries in public/brand/, so run
// deliberately, not as a side effect of a dependency bump.
import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', '..');
const OUT = join(__dirname, '..', 'public', 'brand');
if (!existsSync(join(SRC, 'THEARCHV_LOGO.png')) || !existsSync(join(SRC, 'ARCHV_BANNER.png'))) {
  console.error(`[brand-assets] sources not found under ${SRC} — this script reads outside the repo and only runs in the founder's workspace; never add it to the build chain.`);
  process.exit(1);
}
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
