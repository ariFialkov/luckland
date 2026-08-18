/* ============================================================
   Luckland — procedural pixel art
   ------------------------------------------------------------
   No image assets: every tile and character sprite is drawn
   into offscreen canvases at boot, DS-era 16x16 style.
   ============================================================ */

import { T } from './world.js';
import { hash2 } from './rng.js';

export const CELL = 16;

/* px helper */
function px(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }

/* ------------------------------------------------------------
   Tile atlas: rows = tile ids, cols = 4 variants (water rows
   use cols 0/1 as animation frames).
   ------------------------------------------------------------ */
export function buildTileAtlas(seed) {
  const rows = 24, cols = 4;
  const cv = document.createElement('canvas');
  cv.width = cols * CELL; cv.height = rows * CELL;
  const ctx = cv.getContext('2d');

  function speckle(ox, oy, base, dots, chance, id, variant) {
    px(ctx, ox, oy, CELL, CELL, base);
    for (let y = 0; y < CELL; y += 2) for (let x = 0; x < CELL; x += 2) {
      const h = hash2(x + variant * 31, y + id * 17, seed);
      if (h < chance) px(ctx, ox + x, oy + y, 2, 2, dots[Math.floor(h / chance * dots.length)]);
    }
  }

  for (let v = 0; v < cols; v++) {
    const o = (id) => [v * CELL, id * CELL];

    // -- water (frames 0/1 in cols 0/1) --
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
    { // TIDAL drawn as shallow sparkling water (renderer may draw wet sand instead)
      const [x, y] = o(T.TIDAL);
      px(ctx, x, y, CELL, CELL, '#4a94b8');
      for (let i = 0; i < 5; i++) {
        const wx = (hash2(i + 4, v, seed + 5) * CELL) | 0, wy = (hash2(v, i + 2, seed + 6) * CELL) | 0;
        px(ctx, x + ((wx + v * 3) % CELL), y + wy, 3, 1, '#8fd0e8');
      }
    }
    { const [x, y] = o(23); // wet sand (tidal at mid/low tide)
      speckle(x, y, '#b09a6a', ['#9a8558', '#c4ae7c', '#7fb0c0'], 0.30, 23, v);
    }

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
    { const [x, y] = o(T.FOREST); // tree on grass
      speckle(x, y, '#5aa84f', ['#4f9845'], 0.2, T.FOREST, v);
      px(ctx, x + 6, y + 10, 4, 4, '#7a4e2a');
      px(ctx, x + 2, y + 2, 12, 9, '#2e7a3a');
      px(ctx, x + 4, y + 1, 8, 3, '#3c8c46');
      px(ctx, x + 3, y + 4, 3, 2, '#4fa055');
    }
    { const [x, y] = o(T.JUNGLE);
      speckle(x, y, '#2f7a44', ['#28693a', '#3a8c50'], 0.35, T.JUNGLE, v);
      px(ctx, x + 7, y + 11, 3, 4, '#5a4022');
      px(ctx, x + 1, y + 1, 14, 10, '#1f6132');
      px(ctx, x + 3, y + 2, 5, 3, '#2f7a44');
      px(ctx, x + 9, y + 5, 4, 3, '#37884c');
    }
    { const [x, y] = o(T.BAMBOO);
      speckle(x, y, '#8cc06a', ['#7cb05c'], 0.2, T.BAMBOO, v);
      for (const bx of [3, 8, 12]) {
        px(ctx, x + bx, y + 1, 2, 14, '#5a9a3a');
        px(ctx, x + bx, y + 5, 2, 1, '#3f7a28');
        px(ctx, x + bx, y + 10, 2, 1, '#3f7a28');
      }
    }
    { const [x, y] = o(T.HILL);
      speckle(x, y, '#7aa05a', ['#6a9050', '#8ab068'], 0.3, T.HILL, v);
      px(ctx, x + 2, y + 9, 12, 3, '#6a9050');
      px(ctx, x + 4, y + 6, 8, 3, '#84ae66');
    }
    { const [x, y] = o(T.MOUNTAIN);
      px(ctx, x, y, CELL, CELL, '#6d6a72');
      px(ctx, x + 2, y + 8, 12, 8, '#5a5760');
      px(ctx, x + 4, y + 2, 8, 8, '#7d7a84');
      px(ctx, x + 6, y + 1, 4, 3, '#e8e8f0'); // snowcap
      px(ctx, x + 1, y + 13, 14, 3, '#4d4a54');
    }
    { const [x, y] = o(T.CLIFF);
      px(ctx, x, y, CELL, CELL, '#8a7a5e');
      px(ctx, x, y + 11, CELL, 5, '#6d5f47');
      px(ctx, x + 2, y + 3, 4, 2, '#9c8c6e');
      px(ctx, x + 9, y + 6, 5, 2, '#77694f');
      px(ctx, x, y, CELL, 2, '#9c8c6e');
    }
    { const [x, y] = o(T.DUST);    speckle(x, y, '#d0a86a', ['#c09858', '#dcb87c'], 0.28, T.DUST, v); }
    { const [x, y] = o(T.SCRUB);
      speckle(x, y, '#d0a86a', ['#c09858'], 0.2, T.SCRUB, v);
      px(ctx, x + 4, y + 6, 3, 5, '#5a7a3a'); // little cactus
      px(ctx, x + 2, y + 7, 2, 2, '#5a7a3a');
      px(ctx, x + 10, y + 10, 3, 3, '#8a7040'); // rock
    }
    { const [x, y] = o(T.ROAD);    speckle(x, y, '#c8b088', ['#b8a078', '#d4bc94'], 0.3, T.ROAD, v); }
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
    { const [x, y] = o(T.WALL);
      px(ctx, x, y, CELL, CELL, '#b09468');
      for (let yy = 0; yy < CELL; yy += 4)
        for (let xx = (yy / 4) % 2 ? 4 : 0; xx < CELL; xx += 8)
          { px(ctx, x + xx, y + yy, 7, 3, '#c0a478'); }
      px(ctx, x, y, CELL, 1, '#8a7050');
    }
    { const [x, y] = o(T.ROOF);
      px(ctx, x, y, CELL, CELL, '#a04838');
      for (let yy = 2; yy < CELL; yy += 4) px(ctx, x, y + yy, CELL, 1, '#7d3628');
      px(ctx, x, y, CELL, 1, '#c05a48');
    }
    { const [x, y] = o(T.DOOR);
      px(ctx, x, y, CELL, CELL, '#b09468');
      px(ctx, x + 3, y + 3, 10, 13, '#5a3a1e');
      px(ctx, x + 4, y + 4, 8, 11, '#7a5230');
      px(ctx, x + 10, y + 9, 2, 2, '#ffd75e');
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
