/**
 * Generates the PWA icon set.
 *
 * The mark is drawn procedurally and encoded as PNG with nothing but Node's
 * built-in zlib — no image dependency, and the icons are reproducible from
 * source instead of being binary blobs nobody can edit.
 *
 * Run with: npm run icons
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

// Theme tokens, kept in sync with src/index.css.
const NIGHT = [0x0b, 0x12, 0x20];
const GRASS = [0x22, 0xa7, 0x5c];
const CHALK = [0xf2, 0xf7, 0xf4];

// ---------------------------------------------------------------- PNG writer

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = ~0;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const payload = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(payload));
  return Buffer.concat([length, payload, crc]);
}

function encodePng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ geometry

/** Signed coverage helper: 1 inside, 0 outside, fractional at the edge. */
function insideCircle(x, y, cx, cy, r) {
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function insideRoundedSquare(x, y, size, radius) {
  const min = radius;
  const max = size - radius;
  const cx = Math.min(Math.max(x, min), max);
  const cy = Math.min(Math.max(y, min), max);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius * radius;
}

/** Regular point-up pentagon, used as the ball's centre panel. */
function insidePentagon(x, y, cx, cy, r) {
  const px = x - cx;
  const py = y - cy;
  for (let i = 0; i < 5; i += 1) {
    // Outward normal of each edge of a point-up pentagon.
    const angle = Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const distance = px * Math.cos(angle) + py * Math.sin(angle);
    if (distance > r * Math.cos(Math.PI / 5)) return false;
  }
  return true;
}

/**
 * Renders the mark: a night-blue rounded tile with a chalk ball on it.
 *
 * `padding` is a fraction of the canvas kept empty. Maskable icons need a
 * generous safe zone because Android crops them to whatever shape the launcher
 * uses, and a ball touching the edge would come back as a sliced ball.
 */
function render(size, { padding, rounded }) {
  const rgba = Buffer.alloc(size * size * 4);
  const SS = 3; // supersampling factor, for smooth edges without a canvas lib

  const tileRadius = rounded ? size * 0.22 : 0;
  const ballR = (size / 2) * (1 - padding);
  const centre = size / 2;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;

          let colour = null;
          let alpha = 0;

          if (rounded ? insideRoundedSquare(px, py, size, tileRadius) : true) {
            colour = NIGHT;
            alpha = 255;
          }
          if (insideCircle(px, py, centre, centre, ballR)) {
            colour = CHALK;
            alpha = 255;
          }
          if (insidePentagon(px, py, centre, centre, ballR * 0.46)) {
            colour = GRASS;
          }

          if (colour) {
            r += colour[0];
            g += colour[1];
            b += colour[2];
            a += alpha;
          }
        }
      }

      const samples = SS * SS;
      const i = (y * size + x) * 4;
      const hits = a / 255;
      rgba[i] = hits ? Math.round(r / hits) : 0;
      rgba[i + 1] = hits ? Math.round(g / hits) : 0;
      rgba[i + 2] = hits ? Math.round(b / hits) : 0;
      rgba[i + 3] = Math.round(a / samples);
    }
  }

  return encodePng(size, rgba);
}

// ---------------------------------------------------------------------- main

const TARGETS = [
  { file: 'icon-192.png', size: 192, padding: 0.28, rounded: true },
  { file: 'icon-512.png', size: 512, padding: 0.28, rounded: true },
  // Maskable: no tile corners (the launcher supplies the shape) and a bigger
  // safe zone so cropping never eats the ball.
  { file: 'icon-maskable-512.png', size: 512, padding: 0.42, rounded: false },
  { file: 'apple-touch-icon.png', size: 180, padding: 0.28, rounded: true },
  { file: 'favicon-32.png', size: 32, padding: 0.24, rounded: true },
];

mkdirSync(OUT_DIR, { recursive: true });

for (const { file, size, padding, rounded } of TARGETS) {
  const png = render(size, { padding, rounded });
  writeFileSync(join(OUT_DIR, file), png);
  console.log(`${file.padEnd(24)} ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`);
}

console.log(`\n${TARGETS.length} icones gerados em public/icons/`);
