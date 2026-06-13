// Optimize the cleared poster set for web delivery.
// Source: ../POSTERS/FINAL (7246x10800 JPEGs). Output: public/posters/*.webp + lqip.json
// Moscow 2018 is intentionally EXCLUDED (trophy silhouette = registered design-mark risk).
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', '..', 'POSTERS', 'FINAL');
const OUT = join(__dirname, '..', 'public', 'posters');

// hash -> slug (chronological). Moscow 2018 omitted by design.
const MAP = [
  ['hf_20260606_040322_870c6a6d-9657-4ba2-8bc3-3f857bd64337.jpeg', 'mexico-1970'],
  ['hf_20260606_040325_316823a8-bffc-4270-accc-f578e4a42dee.jpeg', 'azteca-1986'],
  ['hf_20260606_040329_89c1c0f4-cb3b-4882-86e6-be88a9a6d635.jpeg', 'italia-1990'],
  ['hf_20260606_040334_7511e792-a966-4489-b8d7-682780339336.jpeg', 'paris-1998'],
  ['hf_20260606_040336_7dd999b0-8bfb-43e6-9dc9-568a0ee0b297.jpeg', 'yokohama-2002'],
  ['hf_20260606_040349_f1db9d6d-f1ec-47e9-9430-45efbe155e1a.jpeg', 'berlin-2006'],
  ['hf_20260606_040353_fffa9b08-6327-4d50-9a91-dcbbb0c5d8d5.jpeg', 'johannesburg-2010'],
  ['hf_20260606_040356_fa20b1bf-f906-4a64-b506-0bd3b6199979.jpeg', 'maracana-2014'],
  ['hf_20260606_040404_3f0b7abf-122d-4e13-af04-38fdccb00068.jpeg', 'lusail-2022'],
];

await mkdir(OUT, { recursive: true });
const lqip = {};

for (const [file, slug] of MAP) {
  const src = join(SRC, file);
  // Full gallery image: 1200px wide WebP (2:3 -> 1200x1800), quality 72.
  await sharp(src).resize({ width: 1200 }).webp({ quality: 72 }).toFile(join(OUT, `${slug}.webp`));
  // 2x for retina lightbox.
  await sharp(src).resize({ width: 1600 }).webp({ quality: 70 }).toFile(join(OUT, `${slug}@2x.webp`));
  // LQIP: tiny blurred base64 to paint instantly behind the real image.
  const buf = await sharp(src).resize({ width: 20 }).webp({ quality: 30 }).toBuffer();
  lqip[slug] = `data:image/webp;base64,${buf.toString('base64')}`;
  console.log(`✓ ${slug}`);
}

await writeFile(join(OUT, 'lqip.json'), JSON.stringify(lqip, null, 2));
console.log(`\nWrote ${MAP.length} posters + lqip.json to public/posters/`);
