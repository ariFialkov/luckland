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
const ATLAS_ROWS = 33;

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
    { // SHALLOW: wadeable turquoise water, sandy bed showing through
      const [x, y] = o(T.SHALLOW);
      px(ctx, x, y, CELL, CELL, '#58aebe');
      for (let yy = 0; yy < CELL; yy += 2) for (let xx = 0; xx < CELL; xx += 2) {
        if (hash2(xx + v * 13, yy, seed + 33) > 0.78) px(ctx, x + xx, y + yy, 2, 2, '#79bfa8');
      }
      for (let i = 0; i < 4; i++) {
        const wx = (hash2(i + 8, v, seed + 34) * CELL) | 0, wy = (hash2(v, i + 5, seed + 35) * CELL) | 0;
        px(ctx, x + ((wx + v * 4) % CELL), y + wy, 4, 1, '#a8e0ea');
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
    { // FOUNDATION: dark paving under building sprites (rarely visible)
      const [x, y] = o(T.FOUNDATION);
      speckle(x, y, '#4a4440', ['#403a36', '#544e4a'], 0.35, T.FOUNDATION, v);
    }
  }
  return cv;
}

/* ============================================================
   Building sprites — every structure is one big hand-shaped
   pixel building (walls, roof, windows, door), not a repeated
   tile texture. Cached per (kind, prov, size, variant).
   ============================================================ */
const buildingCache = new Map();

export function getBuildingSprite(b) {
  const key = `${b.kind}:${b.prov}:${b.w}x${b.h}:${b.v}:${b.doorPx ?? ''}`;
  let cv = buildingCache.get(key);
  if (!cv) {
    cv = drawBuilding(b);
    buildingCache.set(key, cv);
  }
  return cv;
}

function drawBuilding(b) {
  /* Pokemon-style: the sprite is EXACTLY the solid footprint (w*16 x h*16).
     Depth comes from the roof slab drawn into the top of the sprite —
     nothing overhangs, so no walkable tile is ever hidden. */
  const W16 = b.w * CELL, BH = b.h * CELL;
  const lm = b.kind === 'landmark';
  const rnd = (i) => hash2(b.v, i * 37, 91);
  const cv = document.createElement('canvas');
  cv.width = W16; cv.height = BH;
  const ctx = cv.getContext('2d');
  const doorCx = b.doorPx ?? (W16 >> 1);
  const style = lm
    ? ({ TF: 'villa', FL: 'cottage', HV: 'saloon', DG: 'hall', EP: 'hut', MN: 'tower' }[b.prov] || 'villa')
    : b.kind;

  const roofH = Math.max(12, Math.min(40, Math.round(BH * (style === 'tower' ? 0.3 : 0.45))));
  const wallY = roofH;
  const doorH = Math.min(12, BH - wallY - 2);
  const doorW = lm ? 10 : 8;

  const roofSlab = (base, dark, light, grooves = 'v') => {
    px(ctx, 0, 0, W16, roofH, base);
    px(ctx, 1, 1, W16 - 2, 2, light);                       // lit top edge
    if (grooves === 'v') {
      for (let gx = 5; gx < W16 - 3; gx += 6) px(ctx, gx, 3, 1, roofH - 6, dark);
    } else {
      for (let gy = 4; gy < roofH - 3; gy += 3) px(ctx, 2, gy, W16 - 4, 1, dark);
    }
    px(ctx, 0, roofH - 3, W16, 1, dark);
    px(ctx, 0, roofH - 2, W16, 2, shade2(dark, -18));       // eave shadow onto the wall
  };
  const wallBase = (base, dark) => {
    px(ctx, 0, wallY, W16, BH - wallY, base);
    px(ctx, 0, wallY, 1, BH - wallY, dark);
    px(ctx, W16 - 1, wallY, 1, BH - wallY, dark);
  };
  const drawDoor = (frame, leaf) => {
    const dx = doorCx - (doorW >> 1);
    px(ctx, dx - 1, BH - doorH - 1, doorW + 2, doorH + 1, frame);
    px(ctx, dx, BH - doorH, doorW, doorH, leaf);
    px(ctx, dx + doorW - 3, BH - (doorH >> 1) - 1, 2, 2, '#ffd75e');
  };
  const windowRow = (wW, wH, colFn, frame = null) => {
    let i = 0;
    for (let yTop = wallY + 3; yTop + wH <= BH - doorH - 3; yTop += wH + 5) {
      for (let wx = 4; wx + wW <= W16 - 4; wx += wW + 4) {
        if (frame) px(ctx, wx - 1, yTop - 1, wW + 2, wH + 2, frame);
        px(ctx, wx, yTop, wW, wH, colFn(i++));
      }
    }
  };
  const outline = () => {
    ctx.fillStyle = 'rgba(24, 18, 14, 0.55)';
    ctx.fillRect(0, 0, W16, 1); ctx.fillRect(0, BH - 1, W16, 1);
    ctx.fillRect(0, 0, 1, BH); ctx.fillRect(W16 - 1, 0, 1, BH);
  };

  if (style === 'villa') {
    roofSlab('#c05a48', '#8a3d30', '#d97a63');
    wallBase('#e8e2d4', '#c8c0ac');
    for (let cx2 = 2; cx2 < W16 - 2; cx2 += 8) px(ctx, cx2, wallY + 2, 2, BH - wallY - 3, '#d8d2c0');
    windowRow(4, 5, () => '#3a4a6a', '#c8c0ac');
    if (lm) { // grand columns flanking the entrance
      px(ctx, doorCx - (doorW >> 1) - 4, wallY + 2, 3, BH - wallY - 2, '#f4f0e6');
      px(ctx, doorCx + (doorW >> 1) + 1, wallY + 2, 3, BH - wallY - 2, '#f4f0e6');
    }
    drawDoor('#b8a878', '#5a3a1e');
  } else if (style === 'cottage') {
    roofSlab('#5a6a7e', '#46525f', '#74869c');
    px(ctx, W16 - 10, 1, 5, roofH - 5, '#7a746a');           // chimney on the roof
    px(ctx, W16 - 11, 1, 7, 2, '#8a847a');
    wallBase('#9a948a', '#7a746a');
    for (let yy = wallY + 4; yy < BH - 2; yy += 4)
      for (let xx = (yy % 8 === 0 ? 3 : 6); xx < W16 - 4; xx += 7) px(ctx, xx, yy, 5, 1, '#8a847a');
    windowRow(4, 4, () => '#ffd75e', '#6d5f47');
    drawDoor('#6d5f47', '#5a3a1e');
  } else if (style === 'saloon') {
    // flat false front: parapet, painted sign, awning, plank wall
    px(ctx, 0, 0, W16, roofH, '#b08850');
    px(ctx, 0, 0, W16, 4, '#8a6034');
    px(ctx, 1, 1, W16 - 2, 1, '#c89a5e');
    px(ctx, 3, 6, W16 - 6, Math.max(6, roofH - 12), '#5a3a24');
    px(ctx, 4, 7, W16 - 8, Math.max(4, roofH - 14), '#e8d49a');
    for (let sx2 = 6, i = 0; sx2 < W16 - 7; sx2 += 4, i++) {
      if (rnd(i) > 0.25) px(ctx, sx2, 8 + (i % 2), 2, Math.max(2, roofH - 17), '#5a3a24');
    }
    px(ctx, 0, roofH - 3, W16, 3, '#8a3d30');                // awning
    for (let ax = 1; ax < W16; ax += 4) px(ctx, ax, roofH - 1, 2, 1, '#c05a48');
    wallBase('#b08850', '#9a743e');
    for (let xx = 3; xx < W16 - 1; xx += 3) px(ctx, xx, wallY, 1, BH - wallY, '#9a743e');
    windowRow(4, 5, () => '#3a3226', '#8a6034');
    drawDoor('#8a6034', '#4a3018');
    px(ctx, doorCx - (doorW >> 1), BH - (doorH >> 1), doorW, 1, '#8a6034'); // swing-door rail
  } else if (style === 'hall') {
    roofSlab('#d4a018', '#a87c10', '#f0c040');
    px(ctx, doorCx - 3, 0, 6, 3, '#f0c040');                 // ridge crest
    px(ctx, 0, roofH - 6, 3, 4, '#f0c040');                  // upturned eave corners
    px(ctx, W16 - 3, roofH - 6, 3, 4, '#f0c040');
    wallBase('#a03030', '#7a2020');
    for (let cx2 = 2; cx2 < W16 - 2; cx2 += 6) px(ctx, cx2, wallY + 1, 2, BH - wallY - 2, '#c04040');
    windowRow(4, 4, () => '#f0d8a8', '#7a2020');
    drawDoor('#f0c040', '#5a1a1a');
  } else if (style === 'hut') {
    roofSlab('#6d8a3a', '#556e2c', '#82a04a', 'h');
    wallBase('#8a6a42', '#6d5230');
    for (let yy = wallY + 3; yy < BH - 4; yy += 3) px(ctx, 1, yy, W16 - 2, 1, '#7a5a34');
    windowRow(3, 3, () => '#2f2418', '#6d5230');
    // stilt shadows along the base
    for (let sx2 = 3; sx2 < W16 - 2; sx2 += 6) px(ctx, sx2, BH - 3, 2, 3, '#5a4022');
    if (lm) { px(ctx, doorCx - 2, 0, 4, 4, '#d4a018'); px(ctx, doorCx - 1, 0, 2, 2, '#f0c040'); } // gilt finial
    drawDoor('#556e2c', '#3f2f1c');
  } else { // tower (Maneki-Neko)
    const neon = ['#ffe066', '#5eeaff', '#ff6be0', '#8dff6b'];
    const sign = neon[b.v % 4];
    px(ctx, 0, 0, W16, roofH, '#242030');                    // rooftop cap
    px(ctx, 2, 2, W16 - 4, 3, sign);                         // neon crown strip
    px(ctx, 3, 6, 2, roofH - 8, '#8a8798');                  // vents
    px(ctx, W16 - 6, 6, 2, roofH - 8, '#8a8798');
    const bodyC = ['#3a3a4e', '#343044', '#403a52'][b.v % 3];
    wallBase(bodyC, '#242030');
    px(ctx, 1, wallY, 1, BH - wallY, '#55506a');
    let i = 0;
    for (let wy = wallY + 3; wy + 3 <= BH - doorH - 2; wy += 6) {
      for (let wx = 3; wx + 3 <= W16 - 3; wx += 6) {
        px(ctx, wx, wy, 3, 3, rnd(i++) < 0.55 ? neon[(i + b.v) % 4] : '#262234');
      }
    }
    if (lm) { // vertical neon sign beside the door
      px(ctx, W16 - 8, wallY + 2, 5, BH - wallY - 6, '#1a1624');
      for (let sy2 = wallY + 4; sy2 < BH - 7; sy2 += 4) px(ctx, W16 - 7, sy2, 3, 2, sign);
    }
    drawDoor('#55506a', '#1a1624');
  }

  outline();
  return cv;
}

function shade2(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const bb = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${bb})`;
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
  const armC = shade(body, -25);
  const bodyD = shade(body, -35);
  const legHi = shade(legs, 25);

  /* frame 0 = neutral stance (also the idle pose)
     frame 1 = mid-stride: legs split, arms swung, body bobs up 1px */
  for (let dir = 0; dir < 4; dir++) {
    for (let f = 0; f < 2; f++) {
      const ox = dir * CHAR_W, oy = f * CHAR_H;
      const side = dir === 1 || dir === 2;
      const face = dir === 1 ? -1 : 1;           // which way a side profile points
      const bob = f === 1 ? 1 : 0;               // stride lifts the figure 1px
      const yb = oy + 2 - bob;                   // top of the head
      // mirror helper for left-facing: reflect x inside the 16px cell
      const X = (x, w = 1) => (dir === 1 ? ox + 16 - x - w : ox + x);
      const P = (x, y, w, h, c) => px(ctx, X(x, w), y, w, h, c);

      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(ox + 4, oy + 16, 8, 2);

      /* ---- legs (y 13..16) ---- */
      if (!side) {
        if (f === 0) {
          // standing square
          px(ctx, ox + 5, oy + 13, 2, 3, legs); px(ctx, ox + 9, oy + 13, 2, 3, legs);
          px(ctx, ox + 5, oy + 15, 2, 1, legHi); px(ctx, ox + 9, oy + 15, 2, 1, legHi); // boots
        } else {
          // stride: left leg planted long, right leg lifted with foot kicked out
          px(ctx, ox + 4, oy + 12, 2, 4, legs); px(ctx, ox + 4, oy + 15, 2, 1, legHi);
          px(ctx, ox + 9, oy + 12, 2, 2, legs);
          px(ctx, ox + 10, oy + 13, 2, 2, legHi); // raised boot
        }
      } else {
        if (f === 0) {
          // profile standing: legs slightly offset front/back
          P(6, oy + 13, 2, 3, legs); P(9, oy + 13, 2, 3, legs);
          P(6, oy + 15, 2, 1, legHi); P(9, oy + 15, 2, 1, legHi);
        } else {
          // profile stride: front leg reaching, back leg trailing off the ground
          P(9, oy + 12, 2, 3, legs); P(10, oy + 14, 2, 2, legHi);   // front leg + boot forward
          P(4, oy + 12, 2, 2, legs); P(3, oy + 13, 2, 2, legHi);    // back leg kicked up behind
        }
      }

      /* ---- torso (below the head, y ~8..13) ---- */
      if (!side) {
        px(ctx, ox + 4, yb + 6, 8, 6, body);
        px(ctx, ox + 4, yb + 11, 8, 1, bodyD);
        // arms swing opposite each other
        const s = f === 1 ? 2 : 0;
        px(ctx, ox + 3, yb + 7 + s, 2, 4, armC);
        px(ctx, ox + 11, yb + 9 - s, 2, 4, armC);
      } else {
        P(5, yb + 6, 6, 6, body);
        P(5, yb + 11, 6, 1, bodyD);
        // one visible arm, swinging fore/aft
        if (f === 0) P(7, yb + 8, 2, 4, armC);
        else P(9, yb + 8, 3, 3, armC); // reaching forward
      }

      /* ---- head ---- */
      if (!side) px(ctx, ox + 4, yb, 8, 7, skin);
      else P(4, yb, 7, 7, skin);

      /* ---- hair / hat (drawn around yb-1..yb+2) ---- */
      const hs = side ? face : 0; // hats tip toward the facing direction
      const HX = (x, w = 1) => ox + x + hs;
      if (hat === 'cap') { px(ctx, HX(3), yb - 1, 10, 3, hatColor); px(ctx, HX(2 + (face > 0 || !side ? 2 : 0)), yb + 1, 12 - (side ? 2 : 0), 1, hatColor); }
      else if (hat === 'cowboy') { px(ctx, HX(2), yb + 1, 12, 1, hatColor); px(ctx, HX(4), yb - 1, 8, 3, hatColor); }
      else if (hat === 'helmet') { px(ctx, HX(4), yb - 1, 8, 4, hatColor); px(ctx, HX(7), yb - 1, 2, 2, '#ffd75e'); }
      else if (hat === 'hood') { px(ctx, HX(3), yb - 1, 10, 4, hatColor); px(ctx, ox + 3, yb + 2, 2, 4, hatColor); px(ctx, ox + 11, yb + 2, 2, 4, hatColor); }
      else if (hat === 'ears') { px(ctx, HX(3), yb - 1, 3, 3, hatColor); px(ctx, HX(10), yb - 1, 3, 3, hatColor); px(ctx, HX(4), yb, 8, 2, hatColor); }
      else if (hat === 'crown') { px(ctx, HX(4), yb, 8, 2, '#ffd75e'); px(ctx, HX(4), yb - 1, 2, 1, '#ffd75e'); px(ctx, HX(10), yb - 1, 2, 1, '#ffd75e'); px(ctx, HX(7), yb - 1, 2, 1, '#ffd75e'); }
      else if (hat === 'topknot') { px(ctx, HX(6), yb - 1, 4, 2, hair); px(ctx, HX(4), yb, 8, 2, hair); }
      else {
        px(ctx, HX(4), yb - 1, 8, 3, hair);
        if (!side) { px(ctx, ox + 4, yb + 2, 1, 2, hair); px(ctx, ox + 11, yb + 2, 1, 2, hair); }
        else P(4, yb + 1, 2, 4, hair); // hair sweeps down the back of the head
      }
      if (dir === 3) px(ctx, ox + 4, yb + 1, 8, 5, hair); // back of the head is all hair

      /* ---- face ---- */
      ctx.fillStyle = '#26202c';
      if (dir === 0) {
        ctx.fillRect(ox + 6, yb + 3, 1, 2); ctx.fillRect(ox + 9, yb + 3, 1, 2);
      } else if (side) {
        // profile: one eye near the leading edge + a nose pixel
        ctx.fillRect(X(9), yb + 3, 1, 2);
        ctx.fillStyle = shade(skin, -30);
        ctx.fillRect(X(11), yb + 4, 1, 1);
      }
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
