/* ============================================================
   Luckland — procedural pixel art
   ------------------------------------------------------------
   No image assets: every tile and character sprite is drawn
   into offscreen canvases at boot, DS-era 16x16 style.
   Terrain reads as blended texture, not icons: forest canopies
   sit on their own ground and tile into continuous woodland,
   mountains are full-tile rock faces, and so on.
   ============================================================ */

import { T } from './world.js';
import { hash2 } from './rng.js';

export const CELL = 16;
const ATLAS_ROWS = 31;

/* px helper */
function px(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }

/* ------------------------------------------------------------
   Tile atlas: rows = tile ids, cols = 4 variants (water rows
   use the cols as animation frames).
   ------------------------------------------------------------ */
export function buildTileAtlas(seed) {
  const cols = 4;
  const cv = document.createElement('canvas');
  cv.width = cols * CELL; cv.height = ATLAS_ROWS * CELL;
  const ctx = cv.getContext('2d');

  function speckle(ox, oy, base, dots, chance, id, variant) {
    px(ctx, ox, oy, CELL, CELL, base);
    for (let y = 0; y < CELL; y += 2) for (let x = 0; x < CELL; x += 2) {
      const h = hash2(x + variant * 31, y + id * 17, seed);
      if (h < chance) px(ctx, ox + x, oy + y, 2, 2, dots[Math.floor(h / chance * dots.length)]);
    }
  }

  /* irregular blob helper — fills pixels whose noisy radius is inside r */
  function blob(ox, oy, cx, cy, r, color, id, variant) {
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
      const d = Math.hypot(x - cx, y - cy) + (hash2(x + variant * 53, y + id * 29, seed) - 0.5) * 2.4;
      if (d < r) px(ctx, ox + x, oy + y, 1, 1, color);
    }
  }

  for (let v = 0; v < cols; v++) {
    const o = (id) => [v * CELL, id * CELL];

    /* ---------------- water ---------------- */
    {
      const [x, y] = o(T.DEEP);
      px(ctx, x, y, CELL, CELL, '#173a63');
      for (let i = 0; i < 4; i++) {
        const wx = (hash2(i, v, seed + 1) * CELL) | 0, wy = (hash2(v, i, seed + 2) * CELL) | 0;
        px(ctx, x + ((wx + v * 4) % CELL), y + wy, 4, 1, '#1e4a7a');
      }
    }
    {
      const [x, y] = o(T.WATER);
      px(ctx, x, y, CELL, CELL, '#2a6a9a');
      for (let i = 0; i < 5; i++) {
        const wx = (hash2(i, v, seed + 3) * CELL) | 0, wy = (hash2(v, i + 9, seed + 4) * CELL) | 0;
        px(ctx, x + ((wx + v * 5) % CELL), y + wy, 5, 1, '#3f86b8');
      }
    }
    { // TIDAL: shallow sparkling water frames
      const [x, y] = o(T.TIDAL);
      px(ctx, x, y, CELL, CELL, '#4a94b8');
      for (let i = 0; i < 5; i++) {
        const wx = (hash2(i + 4, v, seed + 5) * CELL) | 0, wy = (hash2(v, i + 2, seed + 6) * CELL) | 0;
        px(ctx, x + ((wx + v * 3) % CELL), y + wy, 3, 1, '#8fd0e8');
      }
    }
    { const [x, y] = o(T.WETSAND);
      speckle(x, y, '#b09a6a', ['#9a8558', '#c4ae7c', '#7fb0c0'], 0.30, T.WETSAND, v);
    }

    /* ---------------- open ground ---------------- */
    { const [x, y] = o(T.SAND);    speckle(x, y, '#e8d49a', ['#d8c488', '#f4e2ae'], 0.25, T.SAND, v); }
    { const [x, y] = o(T.GRASS);   speckle(x, y, '#5aa84f', ['#4f9845', '#68b85c'], 0.30, T.GRASS, v); }
    { const [x, y] = o(T.MEADOW);  speckle(x, y, '#72bb58', ['#63aa4c', '#84cc68', '#e8e070'], 0.28, T.MEADOW, v); }
    { const [x, y] = o(T.FLOWERS);
      speckle(x, y, '#5aa84f', ['#4f9845'], 0.2, T.FLOWERS, v);
      for (let i = 0; i < 4; i++) {
        const fx = (hash2(i, v, seed + 8) * 13) | 0, fy = (hash2(v, i, seed + 9) * 13) | 0;
        px(ctx, x + fx, y + fy, 2, 2, ['#ffe066', '#ff8ac0', '#fff', '#c58cff'][i]);
      }
    }
    { const [x, y] = o(T.DUST);    speckle(x, y, '#d0a86a', ['#c09858', '#dcb87c'], 0.28, T.DUST, v); }
    { const [x, y] = o(T.SCRUB);
      speckle(x, y, '#d0a86a', ['#c09858', '#b08850'], 0.3, T.SCRUB, v);
      blob(x, y, 4 + v, 10, 2.5, '#6d8a46', T.SCRUB, v);       // dry brush tuft
      blob(x, y, 11, 5 + (v % 2) * 3, 2, '#7d9a52', T.SCRUB, v + 9);
    }
    { const [x, y] = o(T.HILL);
      // rolling upland: grass with soft contour shading, no icon
      speckle(x, y, '#7aa05a', ['#6a9050', '#84ae66'], 0.32, T.HILL, v);
      for (let i = 0; i < 3; i++) {
        const hy = 3 + i * 5 + (v % 2);
        for (let hx = 0; hx < CELL; hx++) {
          if (hash2(hx + v * 7, hy + i, seed + 11) > 0.45) px(ctx, x + hx, y + hy, 1, 1, '#639247');
          if (hash2(hx + v * 7, hy + i, seed + 12) > 0.75) px(ctx, x + hx, y + hy - 1, 1, 1, '#8cb670');
        }
      }
    }

    /* ---------------- woodland (blended canopies, solid) ---------------- */
    { const [x, y] = o(T.FOREST);
      // temperate forest floor + canopy blob that tiles into neighbours
      speckle(x, y, '#4f9845', ['#468a3c', '#57a34a'], 0.35, T.FOREST, v);
      blob(x, y, 8 + (v % 2) * 2 - 1, 7 + (v > 1 ? 1 : 0), 8.2, '#2e7a3a', T.FOREST, v);       // canopy mass
      blob(x, y, 5 + v, 4, 4, '#3c8c46', T.FOREST, v + 5);                                     // lit crown
      blob(x, y, 11 - v, 10, 3.4, '#256630', T.FOREST, v + 11);                                // shadow side
      blob(x, y, 4 + (v * 3) % 8, 12, 2, '#3c8c46', T.FOREST, v + 17);
      if (v % 2 === 0) px(ctx, x + 7, y + 13, 2, 3, '#54401f');                                // trunk glimpse
    }
    { const [x, y] = o(T.JUNGLE);
      // deep jungle: dark floor, layered broadleaf canopy, vines
      speckle(x, y, '#274f30', ['#20452a', '#2f5c38'], 0.4, T.JUNGLE, v);
      blob(x, y, 8 + (v % 2) * 2 - 1, 7, 8.6, '#1f6132', T.JUNGLE, v);
      blob(x, y, 4 + v, 4 + (v % 2), 4.2, '#37884c', T.JUNGLE, v + 5);
      blob(x, y, 12 - v, 9, 3.6, '#154724', T.JUNGLE, v + 11);
      blob(x, y, 8, 12, 2.4, '#2f7a44', T.JUNGLE, v + 17);
      // frond strokes
      for (let i = 0; i < 3; i++) {
        const fx = (hash2(i, v, seed + 14) * 12) | 0, fy = (hash2(v, i, seed + 15) * 10) | 0;
        px(ctx, x + fx, y + fy, 3, 1, '#58a860');
        px(ctx, x + fx + 1, y + fy + 1, 1, 2, '#58a860');
      }
    }
    { const [x, y] = o(T.BAMBOO);
      speckle(x, y, '#8cc06a', ['#7cb05c', '#96ca74'], 0.25, T.BAMBOO, v);
      for (const bx of [2 + (v % 2), 7, 12 - (v % 2)]) {
        px(ctx, x + bx, y, 2, CELL, '#5a9a3a');
        px(ctx, x + bx, y + 4, 2, 1, '#3f7a28');
        px(ctx, x + bx, y + 9, 2, 1, '#3f7a28');
        px(ctx, x + bx, y + 13, 2, 1, '#3f7a28');
        px(ctx, x + bx + 1, y + 2, 2, 1, '#6dae4a'); // leaf
      }
    }

    /* ---------------- rock (full-tile textures, solid) ---------------- */
    { const [x, y] = o(T.MOUNTAIN);
      speckle(x, y, '#6d6a72', ['#615e66', '#79767e'], 0.4, T.MOUNTAIN, v);
      // diagonal facets: lit upper-left, shadowed crevices
      for (let i = 0; i < 3; i++) {
        let fx = (hash2(i, v, seed + 16) * 12) | 0, fy = (hash2(v, i, seed + 17) * 12) | 0;
        for (let s = 0; s < 6; s++) {
          px(ctx, x + ((fx + s) % CELL), y + ((fy + s) % CELL), 1, 1, '#4d4a54');
          if (s < 4) px(ctx, x + ((fx + s + 1) % CELL), y + ((fy + s) % CELL), 1, 1, '#8a8790');
        }
      }
      blob(x, y, 4 + v * 2, 4, 3, '#7d7a84', T.MOUNTAIN, v + 3);
      blob(x, y, 11 - v, 11, 3, '#5a5760', T.MOUNTAIN, v + 7);
    }
    { const [x, y] = o(T.PEAK);
      // high peak: rock below, ragged snowfield above
      speckle(x, y, '#75727c', ['#67646e', '#827f88'], 0.4, T.PEAK, v);
      for (let sx = 0; sx < CELL; sx++) {
        const snowLine = 6 + Math.round((hash2(sx + v * 9, 3, seed + 18) - 0.5) * 5);
        for (let sy = 0; sy < snowLine; sy++) {
          px(ctx, x + sx, y + sy, 1, 1, hash2(sx, sy + v, seed + 19) > 0.2 ? '#eceef4' : '#d4d8e4');
        }
        px(ctx, x + sx, y + snowLine, 1, 1, '#c0c4d2');
      }
      blob(x, y, 8, 12, 2.4, '#5a5760', T.PEAK, v + 5);
    }
    { const [x, y] = o(T.CLIFF);
      // stratified rock face
      px(ctx, x, y, CELL, CELL, '#8a7a5e');
      for (let band = 0; band < 4; band++) {
        const by = band * 4 + ((v + band) % 2);
        px(ctx, x, y + by, CELL, 2, ['#9c8c6e', '#77694f', '#8a7a5e', '#6d5f47'][band]);
        for (let bx = 0; bx < CELL; bx += 3) {
          if (hash2(bx + v, by, seed + 20) > 0.6) px(ctx, x + bx, y + by + 1, 1, 2, '#5f5340');
        }
      }
    }

    /* ---------------- paths & floors ---------------- */
    { const [x, y] = o(T.ROAD);    speckle(x, y, '#c8b088', ['#b8a078', '#d4bc94'], 0.3, T.ROAD, v); }
    { const [x, y] = o(T.TRAIL);
      // narrow carved dirt: worn center, rocky edges
      speckle(x, y, '#a98c60', ['#987c52', '#b69a6e'], 0.35, T.TRAIL, v);
      px(ctx, x, y, CELL, 1, '#8a7050');
      px(ctx, x, y + 15, CELL, 1, '#8a7050');
      for (let i = 0; i < 4; i++) {
        const pxx = (hash2(i, v, seed + 27) * 14) | 0, pyy = (hash2(v, i, seed + 28) * 14) | 0;
        px(ctx, x + pxx, y + pyy, 2, 1, '#7d6a48');
      }
    }
    { const [x, y] = o(T.PLAZA);
      px(ctx, x, y, CELL, CELL, '#cbb894');
      ctx.strokeStyle = '#b5a27e'; ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, 8, 8); ctx.strokeRect(x + 8.5, y + 8.5, 7, 7);
    }
    { const [x, y] = o(T.NEON);
      px(ctx, x, y, CELL, CELL, '#3a3244');
      px(ctx, x, y, CELL, 1, '#4a4258');
      const h = hash2(v, 21, seed);
      if (h > 0.5) px(ctx, x + 3 + v * 2, y + 6, 2, 2, ['#ff6be0', '#5eeaff', '#ffe066'][v % 3]);
    }
    { const [x, y] = o(T.BRIDGE);
      px(ctx, x, y, CELL, CELL, '#8a6034');
      for (let yy = 0; yy < CELL; yy += 3) px(ctx, x, y + yy, CELL, 1, '#754f28');
      px(ctx, x, y, 2, CELL, '#5f3f20'); px(ctx, x + 14, y, 2, CELL, '#5f3f20');
    }
    { const [x, y] = o(T.PIER);
      px(ctx, x, y, CELL, CELL, '#8a6034');
      for (let xx = 0; xx < CELL; xx += 4) px(ctx, x + xx, y, 1, CELL, '#754f28');
    }

    /* ---------------- buildings ---------------- */
    { const [x, y] = o(T.WALL);
      px(ctx, x, y, CELL, CELL, '#b09468');
      for (let yy = 0; yy < CELL; yy += 4)
        for (let xx = (yy / 4) % 2 ? 4 : 0; xx < CELL; xx += 8)
          { px(ctx, x + xx, y + yy, 7, 3, '#c0a478'); }
      px(ctx, x, y, CELL, 1, '#8a7050');
    }
    { const [x, y] = o(T.WALL_MARBLE);
      px(ctx, x, y, CELL, CELL, '#e8e2d4');
      for (let yy = 0; yy < CELL; yy += 4)
        for (let xx = (yy / 4) % 2 ? 4 : 0; xx < CELL; xx += 8)
          { px(ctx, x + xx, y + yy, 7, 3, '#f4f0e6'); }
      px(ctx, x, y, CELL, 1, '#c8c0ac');
      px(ctx, x + 3, y + 4, 2, 12, '#d8d2c0'); px(ctx, x + 11, y + 4, 2, 12, '#d8d2c0'); // columns
    }
    { const [x, y] = o(T.WALL_STONE);
      px(ctx, x, y, CELL, CELL, '#9a948a');
      for (let yy = 0; yy < CELL; yy += 4)
        for (let xx = (yy / 4) % 2 ? 4 : 0; xx < CELL; xx += 8)
          { px(ctx, x + xx, y + yy, 7, 3, '#aaa49a'); }
      px(ctx, x, y, CELL, 1, '#7a746a');
    }
    { const [x, y] = o(T.ROOF);
      px(ctx, x, y, CELL, CELL, '#a04838');
      for (let yy = 2; yy < CELL; yy += 4) px(ctx, x, y + yy, CELL, 1, '#7d3628');
      px(ctx, x, y, CELL, 1, '#c05a48');
    }
    { const [x, y] = o(T.ROOF_GOLD);
      px(ctx, x, y, CELL, CELL, '#d4a018');
      for (let yy = 2; yy < CELL; yy += 4) px(ctx, x, y + yy, CELL, 1, '#a87c10');
      px(ctx, x, y, CELL, 1, '#f0c040');
      px(ctx, x, y + 15, CELL, 1, '#8a6408');
    }
    { const [x, y] = o(T.ROOF_SLATE);
      px(ctx, x, y, CELL, CELL, '#5a6a7e');
      for (let yy = 2; yy < CELL; yy += 4) px(ctx, x, y + yy, CELL, 1, '#46525f');
      px(ctx, x, y, CELL, 1, '#6e8096');
    }
    { const [x, y] = o(T.ROOF_LEAF);
      px(ctx, x, y, CELL, CELL, '#6d8a3a');
      for (let yy = 1; yy < CELL; yy += 3) {
        for (let xx = 0; xx < CELL; xx += 4) px(ctx, x + xx + (yy % 2), y + yy, 3, 1, '#556e2c');
      }
      px(ctx, x, y, CELL, 1, '#82a04a');
    }
    { const [x, y] = o(T.DOOR);
      px(ctx, x, y, CELL, CELL, '#b09468');
      px(ctx, x + 3, y + 3, 10, 13, '#5a3a1e');
      px(ctx, x + 4, y + 4, 8, 11, '#7a5230');
      px(ctx, x + 10, y + 9, 2, 2, '#ffd75e');
    }
  }
  return cv;
}

/* ------------------------------------------------------------
   Character sprites: 4 directions x 2 walk frames, 16x18 cells.
   dir order: 0=down 1=left 2=right 3=up
   ------------------------------------------------------------ */
export const CHAR_W = 16, CHAR_H = 18;

export function makeCharSprite(pal) {
  const { skin = '#f0c8a0', body = '#3a6ea5', legs = '#40354a', hat = null, hatColor = '#333', hair = '#4a3222' } = pal;
  const cv = document.createElement('canvas');
  cv.width = CHAR_W * 4; cv.height = CHAR_H * 2;
  const ctx = cv.getContext('2d');

  for (let dir = 0; dir < 4; dir++) {
    for (let f = 0; f < 2; f++) {
      const ox = dir * CHAR_W, oy = f * CHAR_H;
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(ox + 4, oy + 16, 8, 2);
      // legs (alternate per frame)
      const lo = f === 0 ? 0 : 1;
      px(ctx, ox + 5, oy + 12 + lo, 2, 4 - lo, legs);
      px(ctx, ox + 9, oy + 12 + (1 - lo), 2, 3 + lo, legs);
      // body
      px(ctx, ox + 4, oy + 7, 8, 6, body);
      // arms
      const armC = shade(body, -20);
      px(ctx, ox + 3, oy + 8 + (f ? 1 : 0), 2, 4, armC);
      px(ctx, ox + 11, oy + 8 + (f ? 0 : 1), 2, 4, armC);
      // head
      px(ctx, ox + 4, oy + 1, 8, 7, skin);
      // hair / hat
      if (hat === 'cap')       { px(ctx, ox + 3, oy, 10, 3, hatColor); px(ctx, ox + 3, oy + 2, 12, 1, hatColor); }
      else if (hat === 'cowboy'){ px(ctx, ox + 2, oy + 2, 12, 1, hatColor); px(ctx, ox + 4, oy, 8, 3, hatColor); }
      else if (hat === 'helmet'){ px(ctx, ox + 4, oy, 8, 4, hatColor); px(ctx, ox + 7, oy - 0, 2, 2, '#ffd75e'); }
      else if (hat === 'hood')  { px(ctx, ox + 3, oy, 10, 4, hatColor); px(ctx, ox + 3, oy + 3, 2, 4, hatColor); px(ctx, ox + 11, oy + 3, 2, 4, hatColor); }
      else if (hat === 'ears')  { px(ctx, ox + 3, oy, 3, 3, hatColor); px(ctx, ox + 10, oy, 3, 3, hatColor); px(ctx, ox + 4, oy + 1, 8, 2, hatColor); }
      else if (hat === 'crown') { px(ctx, ox + 4, oy, 8, 2, '#ffd75e'); px(ctx, ox + 4, oy - 0, 2, 2, '#ffd75e'); px(ctx, ox + 10, oy, 2, 2, '#ffd75e'); px(ctx, ox + 7, oy, 2, 2, '#ffd75e'); }
      else if (hat === 'topknot'){ px(ctx, ox + 6, oy, 4, 2, hair); px(ctx, ox + 4, oy + 1, 8, 2, hair); }
      else { px(ctx, ox + 4, oy, 8, 2, hair); px(ctx, ox + 4, oy + 2, 1, 2, hair); px(ctx, ox + 11, oy + 2, 1, 2, hair); }
      // face by direction
      ctx.fillStyle = '#26202c';
      if (dir === 0) { ctx.fillRect(ox + 6, oy + 4, 1, 2); ctx.fillRect(ox + 9, oy + 4, 1, 2); }
      else if (dir === 1) { ctx.fillRect(ox + 5, oy + 4, 1, 2); }
      else if (dir === 2) { ctx.fillRect(ox + 10, oy + 4, 1, 2); }
      // (dir 3 = back of head, no face)
    }
  }
  return cv;
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

/* A special serpentine sprite for Yong Xin the dragon. */
export function makeDragonSprite() {
  const cv = document.createElement('canvas');
  cv.width = CHAR_W * 4; cv.height = CHAR_H * 2;
  const ctx = cv.getContext('2d');
  for (let dir = 0; dir < 4; dir++) {
    for (let f = 0; f < 2; f++) {
      const ox = dir * CHAR_W, oy = f * CHAR_H;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(ox + 3, oy + 16, 10, 2);
      const wob = f ? 1 : 0;
      px(ctx, ox + 2, oy + 10 + wob, 12, 5, '#c8402e');       // coiled body
      px(ctx, ox + 3, oy + 11 + wob, 10, 3, '#e05a40');
      px(ctx, ox + 4, oy + 3 - wob, 8, 8, '#e05a40');         // head/neck
      px(ctx, ox + 5, oy + 4 - wob, 6, 6, '#f07a58');
      px(ctx, ox + 3, oy + 1 - wob, 2, 3, '#ffd75e');         // horns
      px(ctx, ox + 11, oy + 1 - wob, 2, 3, '#ffd75e');
      px(ctx, ox + 4, oy + 9, 8, 2, '#ffd75e');               // golden mane
      ctx.fillStyle = '#26202c';
      if (dir === 0) { ctx.fillRect(ox + 6, oy + 5 - wob, 1, 2); ctx.fillRect(ox + 9, oy + 5 - wob, 1, 2); }
      else if (dir === 1) ctx.fillRect(ox + 5, oy + 5 - wob, 1, 2);
      else if (dir === 2) ctx.fillRect(ox + 10, oy + 5 - wob, 1, 2);
    }
  }
  return cv;
}
