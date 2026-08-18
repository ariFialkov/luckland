/* Generates icons/icon-192.png and icons/icon-512.png with zero
   dependencies (hand-rolled PNG encoder over node:zlib).
   Run: node scripts/gen-icons.mjs */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

function crc32(buf) {
  let c, table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  c = -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ table[(c ^ buf[i]) & 0xff];
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---- draw the Luckland clover-coin ---- */
function drawIcon(size) {
  const img = Buffer.alloc(size * size * 4);
  const put = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    img[i] = r; img[i + 1] = g; img[i + 2] = b; img[i + 3] = a;
  };
  const S = size / 64; // design in 64-unit space

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / S, v = y / S;
      // rounded-rect background
      const rx = Math.max(0, Math.max(6 - u, u - 58));
      const ry = Math.max(0, Math.max(6 - v, v - 58));
      if (Math.hypot(rx, ry) > 6) { put(x, y, 0, 0, 0, 0); continue; }
      let c = [26, 16, 48]; // deep purple
      // gold border
      const bx = Math.min(u, 64 - u), by = Math.min(v, 64 - v);
      if (Math.min(bx, by) < 3.4 || (Math.hypot(rx, ry) > 4.2 && Math.hypot(rx, ry) <= 6)) c = [224, 169, 46];

      // coin
      const dc = Math.hypot(u - 32, v - 34);
      if (dc < 18) c = [255, 215, 94];
      if (dc < 18 && dc > 16.4) c = [224, 169, 46];
      if (dc < 13 && dc > 12) c = [224, 169, 46];

      // clover: four leaves + stem
      const leaves = [[28, 30], [36, 30], [28, 38], [36, 38]];
      for (const [lx, ly] of leaves) if (Math.hypot(u - lx, v - ly) < 4.6) c = [47, 122, 68];
      if (u > 30.7 && u < 33.3 && v > 38 && v < 46 && Math.hypot(u - 32, v - 34) < 18) c = [47, 122, 68];

      put(x, y, c[0], c[1], c[2], 255);
    }
  }
  // sparkles
  const spark = (cx, cy, r, col) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / S, v = y / S;
      if (Math.abs(u - cx) + Math.abs(v - cy) < r) put(x, y, ...col, 255);
    }
  };
  spark(14, 12, 2.6, [180, 140, 255]);
  spark(50, 11, 2.2, [180, 140, 255]);
  spark(52, 52, 1.8, [255, 255, 255]);
  return img;
}

mkdirSync('icons', { recursive: true });
for (const size of [192, 512]) {
  writeFileSync(`icons/icon-${size}.png`, encodePNG(size, size, drawIcon(size)));
  console.log(`icons/icon-${size}.png written`);
}
