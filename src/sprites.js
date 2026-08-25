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
const ATLAS_ROWS = 35;

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
    { // TALLGRASS: rustling blades over grass — walkable habitat cover
      const [x, y] = o(T.TALLGRASS);
      speckle(x, y, '#5aa84f', ['#4f9845'], 0.2, T.TALLGRASS, v);
      for (let bx = 0; bx < CELL; bx += 2) {
        const h = 5 + ((hash2(bx + v * 11, 3, seed + 44) * 7) | 0);
        const lean = hash2(bx, v, seed + 45) > 0.5 ? 1 : 0;
        px(ctx, x + bx, y + CELL - h, 1, h, '#2f7a34');
        px(ctx, x + bx + lean, y + CELL - h, 1, 2, '#3d9440');
        if (hash2(bx, v + 3, seed + 46) > 0.6) px(ctx, x + bx + 1, y + CELL - h + 2, 1, h - 4, '#358a3a');
      }
      for (let i = 0; i < 3; i++) {
        const tx2 = (hash2(i, v, seed + 47) * 14) | 0;
        px(ctx, x + tx2, y + 3 + ((hash2(v, i, seed + 48) * 4) | 0), 1, 1, '#7ac86a');
      }
    }
    { // BUSH: low walkable brush — round leafy tufts on grass
      const [x, y] = o(T.BUSH);
      speckle(x, y, '#5aa84f', ['#4f9845'], 0.2, T.BUSH, v);
      blob(x, y, 5 + (v % 2) * 2, 6, 4.5, '#2f6a30', T.BUSH, v);
      blob(x, y, 11, 10 + (v % 2), 4, '#356e34', T.BUSH, v + 5);
      blob(x, y, 4, 12, 3, '#2b6230', T.BUSH, v + 9);
      blob(x, y, 6 + (v % 2) * 2, 5, 2, '#4f8a44', T.BUSH, v + 13);
      blob(x, y, 12, 9, 1.8, '#568e4a', T.BUSH, v + 17);
      if (v % 2) px(ctx, x + 8, y + 8, 2, 2, '#d44a6a');   // the odd berry
    }
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
     Roof slopes taper into trapezoids for an isometric read; each
     province draws several distinct architectural silhouettes. */
  const W16 = b.w * CELL, BH = b.h * CELL;
  const lm = b.kind === 'landmark';
  const rnd = (i) => hash2(b.v, i * 37, 91);
  const cv = document.createElement('canvas');
  cv.width = W16; cv.height = BH;
  const ctx = cv.getContext('2d');
  const doorCx = b.doorPx ?? (W16 >> 1);

  if (b.kind === 'prop') { drawProp(ctx, b.prov, b.v); return cv; }

  const defaults = { TF: 'temple', FL: 'cottage', HV: 'saloon', DG: 'hall', EP: 'hut', MN: 'tower4' };
  const style = lm ? (b.sub || defaults[b.prov] || 'villa') : b.kind;

  const flatTop = ['saloon', 'tower', 'tower4', 'casino', 'warehouse', 'fortress', 'castle', 'redlight'].includes(style);
  const roofH = flatTop ? Math.max(10, Math.round(BH * 0.3))
    : Math.max(11, Math.min(28, Math.round(BH * 0.42)));
  const wallY = roofH;
  const doorH = Math.min(12, BH - wallY - 2);
  const doorW = lm ? 10 : 8;
  const IN = 2;

  /* trapezoid roof: the slope face narrows toward the ridge */
  const roofTrap = (base, dark, light, taper = Math.min(5, W16 >> 3), thatch = false) => {
    const slope = Math.max(4, Math.round(roofH * 0.6));
    for (let yy = 0; yy < slope; yy++) {
      const ins = Math.round(taper * (slope - 1 - yy) / Math.max(1, slope - 1));
      px(ctx, ins, yy, W16 - ins * 2, 1, yy < 2 ? light : base);
      if (yy > 0) { px(ctx, ins, yy, 1, 1, dark); px(ctx, W16 - ins - 1, yy, 1, 1, dark); }
    }
    px(ctx, 0, slope, W16, roofH - slope, base);
    px(ctx, 0, slope, W16, 1, dark);
    if (thatch) for (let gy = 1; gy < roofH - 2; gy += 3) {
      const ins = Math.round(taper * Math.max(0, (slope - 1 - gy)) / Math.max(1, slope - 1));
      px(ctx, ins + 1, gy, W16 - ins * 2 - 2, 1, dark);
    } else {
      for (let gx = 5; gx < W16 - 4; gx += 6) px(ctx, gx, 2, 1, roofH - 4, shade2(base, -16));
    }
    px(ctx, 0, roofH - 2, W16, 2, dark);
  };
  const wallBase = (base, dark, y0 = wallY) => {
    px(ctx, IN, y0, W16 - IN * 2, BH - y0, base);
    px(ctx, IN, y0, W16 - IN * 2, 2, shade2(dark, -14));
    px(ctx, IN, y0, 1, BH - y0, dark);
    px(ctx, W16 - IN - 1, y0, 1, BH - y0, dark);
    px(ctx, IN, BH - 1, W16 - IN * 2, 1, shade2(dark, -20));
  };
  const drawDoor = (frame, leaf, wD = doorW, hD = doorH, arch = false) => {
    const dx = doorCx - (wD >> 1);
    px(ctx, dx - 1, BH - hD - 1, wD + 2, hD + 1, frame);
    px(ctx, dx, BH - hD, wD, hD, leaf);
    if (arch) { px(ctx, dx, BH - hD, 1, 1, frame); px(ctx, dx + wD - 1, BH - hD, 1, 1, frame); }
    px(ctx, dx + wD - 3, BH - (hD >> 1) - 1, 2, 2, '#ffd75e');
  };
  const windowsFill = (wW, wH, colFn, frame = null, y0 = wallY) => {
    let i = 0;
    for (let yTop = y0 + 4; yTop + wH <= BH - 4; yTop += wH + 4) {
      const overDoorRow = yTop + wH > BH - doorH - 2;
      for (let wx = IN + 2; wx + wW <= W16 - IN - 2; wx += wW + 4) {
        if (overDoorRow && wx + wW >= doorCx - (doorW >> 1) - 2 && wx <= doorCx + (doorW >> 1) + 2) continue;
        if (frame) px(ctx, wx - 1, yTop - 1, wW + 2, wH + 2, frame);
        px(ctx, wx, yTop, wW, wH, colFn(i++));
      }
    }
  };
  const battlements = (color, dark, y0 = 0) => {
    px(ctx, 0, y0, W16, 4, color);
    for (let bx = 0; bx < W16; bx += 4) px(ctx, bx + 2, y0, 2, 2, 'rgba(0,0,0,0)');
    for (let bx = 2; bx < W16; bx += 4) ctx.clearRect(bx, y0, 2, 2);
    px(ctx, 0, y0 + 4, W16, 1, dark);
  };
  const outline = () => {
    ctx.fillStyle = 'rgba(24, 18, 14, 0.5)';
    ctx.fillRect(IN - 1, wallY, 1, BH - wallY); ctx.fillRect(W16 - IN, wallY, 1, BH - wallY);
    ctx.fillRect(IN, BH - 1, W16 - IN * 2, 1);
  };

  switch (style) {
    /* ------------- Tyche & Fortuna ------------- */
    case 'villa':
      roofTrap('#a84a3c', '#7d3628', '#d0685a');
      wallBase('#e8e2d4', '#c8c0ac');
      windowsFill(4, 5, () => '#3a4a6a', '#c8c0ac');
      drawDoor('#b8a878', '#5a3a1e');
      break;
    case 'temple': {
      // full-width pediment gable over a colonnade
      const slope2 = roofH - 2;
      for (let yy = 0; yy < slope2; yy++) {
        const ins = Math.round((W16 / 2 - 3) * (slope2 - 1 - yy) / Math.max(1, slope2 - 1));
        px(ctx, ins, yy, W16 - ins * 2, 1, yy < 2 ? '#f4f0e6' : '#e0d8c4');
        px(ctx, ins, yy, 1, 1, '#b8b09c'); px(ctx, W16 - ins - 1, yy, 1, 1, '#b8b09c');
      }
      px(ctx, 0, slope2, W16, 2, '#b8a878');
      wallBase('#e8e2d4', '#c8c0ac');
      for (let cx2 = IN + 1; cx2 < W16 - IN - 2; cx2 += 5) {
        px(ctx, cx2, wallY + 2, 3, BH - wallY - 3, '#f4f0e6');
        px(ctx, cx2 + 2, wallY + 2, 1, BH - wallY - 3, '#c8c0ac');
      }
      drawDoor('#b8a878', '#5a3a1e', doorW, doorH, true);
      break;
    }
    case 'dome': {
      // rounded dome with a gilded finial
      for (let yy = 0; yy < roofH; yy++) {
        const t2 = (yy + 1) / roofH;
        const half = Math.round((W16 / 2 - 1) * Math.sqrt(t2));
        px(ctx, (W16 >> 1) - half, yy, half * 2, 1, yy < roofH * 0.4 ? '#7ea8c4' : '#5f8cab');
      }
      px(ctx, (W16 >> 1) - 1, 0, 2, 3, '#f0c040');
      px(ctx, 0, roofH - 1, W16, 1, '#46688a');
      wallBase('#e8e2d4', '#c8c0ac');
      windowsFill(3, 5, () => '#3a4a6a', '#c8c0ac');
      drawDoor('#b8a878', '#5a3a1e', doorW, doorH, true);
      break;
    }
    case 'arena': {
      // coliseum: low elliptical crown over tiers of arched openings
      const crownH = Math.max(7, Math.round(BH * 0.18));
      for (let yy = 0; yy < crownH; yy++) {
        const t2 = (yy + 1) / crownH;
        const half = Math.round((W16 / 2 - 1) * Math.sqrt(t2));
        px(ctx, (W16 >> 1) - half, yy, half * 2, 1, yy < 2 ? '#f4f0e6' : (yy % 3 === 0 ? '#d8d0bc' : '#e8e2d4'));
      }
      px(ctx, 0, crownH - 1, W16, 1, '#b8b09c');
      wallBase('#e0d8c4', '#b8b09c', crownH);
      for (let ay = crownH + 3; ay + 6 <= BH - 3; ay += 9) {
        px(ctx, IN, ay + 7, W16 - IN * 2, 1, '#c8c0ac');   // tier cornice
        for (let ax = IN + 3; ax + 4 <= W16 - IN - 3; ax += 7) {
          if (ay + 6 > BH - doorH - 2 && ax + 4 >= doorCx - 7 && ax <= doorCx + 7) continue;
          px(ctx, ax, ay + 1, 4, 5, '#6d6154');
          px(ctx, ax + 1, ay, 2, 1, '#6d6154');
        }
      }
      drawDoor('#b8a878', '#4a4034', Math.min(12, doorW + 2), doorH, true);
      break;
    }

    /* ------------- Four Leaf Republic ------------- */
    case 'cottage':
      roofTrap('#4c5a6d', '#3c4854', '#6d8098', 4, true);
      px(ctx, W16 - 9, 1, 4, roofH - 3, '#7a746a');
      px(ctx, W16 - 10, 0, 6, 2, '#8a847a');
      wallBase('#b0685a', '#8a4a3e');           // warm brick
      for (let yy = wallY + 5; yy < BH - 2; yy += 3)
        for (let xx = (yy % 6 === 0 ? IN + 1 : IN + 4); xx < W16 - IN - 2; xx += 6) px(ctx, xx, yy, 4, 1, '#9a5648');
      windowsFill(4, 4, () => '#ffd75e', '#6d5f47');
      drawDoor('#6d5f47', '#4a3222');
      break;
    case 'pub': {
      // timber-framed alehouse with a hanging sign
      roofTrap('#6d5230', '#54401f', '#8a6a42', 4, true);
      wallBase('#e8dcc0', '#b8a888');
      px(ctx, IN + 1, wallY + 2, 2, BH - wallY - 3, '#5a4630');
      px(ctx, W16 - IN - 3, wallY + 2, 2, BH - wallY - 3, '#5a4630');
      px(ctx, IN + 1, wallY + 2, W16 - IN * 2 - 2, 2, '#5a4630');
      windowsFill(4, 4, () => '#f0c040', '#5a4630');
      // hanging sign
      px(ctx, IN + 3, wallY + 5, 6, 5, '#2f6a3a'); px(ctx, IN + 4, wallY + 6, 4, 3, '#3d8a4c');
      px(ctx, IN + 5, wallY + 3, 1, 2, '#54401f');
      drawDoor('#5a4630', '#3a2c1c');
      break;
    }
    case 'barn': {
      // gambrel barn: two-step roof over big red doors
      const slope2 = roofH - 2;
      for (let yy = 0; yy < slope2; yy++) {
        const f2 = (slope2 - 1 - yy) / Math.max(1, slope2 - 1);
        const ins = Math.round((W16 / 4) * (f2 > 0.5 ? f2 : f2 * 0.4));
        px(ctx, ins, yy, W16 - ins * 2, 1, yy < 2 ? '#8a6a42' : '#6d5230');
      }
      px(ctx, 0, slope2, W16, 2, '#54401f');
      wallBase('#a03030', '#7a2020');
      px(ctx, IN + 2, wallY + 3, 4, 3, '#e8dcc0'); // hayloft window
      const bw2 = Math.min(12, doorW + 4);
      drawDoor('#e8dcc0', '#8a2828', bw2, doorH);
      // white X brace on the big door
      const dx2 = doorCx - (bw2 >> 1);
      for (let i2 = 0; i2 < doorH; i2++) {
        px(ctx, dx2 + Math.round(i2 * (bw2 - 1) / doorH), BH - doorH + i2, 1, 1, '#e8dcc0');
        px(ctx, dx2 + bw2 - 1 - Math.round(i2 * (bw2 - 1) / doorH), BH - doorH + i2, 1, 1, '#e8dcc0');
      }
      break;
    }
    case 'castle': {
      // crenellated keep: tall teeth, corner towers, sparse arrow slits
      px(ctx, 0, 3, W16, roofH - 3, '#aaa49a');
      for (let bx2 = 0; bx2 < W16; bx2 += 6) px(ctx, bx2, 0, 3, 4, '#aaa49a');  // battlement teeth
      px(ctx, 0, roofH - 2, W16, 2, '#7a746a');
      wallBase('#b4aea2', '#8a847a');
      // corner towers with their own teeth
      for (const tx2 of [IN, W16 - IN - 6]) {
        px(ctx, tx2, wallY - 2, 6, BH - wallY + 2, '#9a948a');
        px(ctx, tx2, wallY - 5, 2, 4, '#9a948a'); px(ctx, tx2 + 4, wallY - 5, 2, 4, '#9a948a');
        px(ctx, tx2 + 2, wallY + 4, 2, 5, '#2c3a4a');   // tower slit
      }
      // sparse arrow slits across the keep face
      for (let sx2 = IN + 10; sx2 < W16 - IN - 10; sx2 += 9) {
        px(ctx, sx2, wallY + 4, 2, 6, '#2c3a4a');
        if (BH - wallY > 24) px(ctx, sx2 + 3, wallY + 14, 2, 6, '#2c3a4a');
      }
      // clover banner over the gate
      px(ctx, doorCx - 1, 0, 1, 6, '#54401f'); px(ctx, doorCx, 0, 6, 4, '#2f7a3a');
      px(ctx, doorCx + 2, 1, 2, 2, '#8dff6b');
      drawDoor('#6d6864', '#3a2c1c', Math.min(12, doorW + 2), doorH, true);
      break;
    }

    /* ------------- Horseshoeville ------------- */
    case 'saloon':
      px(ctx, 0, 0, W16, roofH, '#b08850');
      px(ctx, 0, 0, W16, 3, '#8a6034');
      px(ctx, 1, 1, W16 - 2, 1, '#c89a5e');
      px(ctx, 3, 4, W16 - 6, roofH - 7, '#5a3a24');
      px(ctx, 4, 5, W16 - 8, roofH - 9, '#e8d49a');
      for (let sx2 = 6, i2 = 0; sx2 < W16 - 7; sx2 += 4, i2++) {
        if (rnd(i2) > 0.25) px(ctx, sx2, 6, 2, Math.max(2, roofH - 11), '#5a3a24');
      }
      px(ctx, 0, roofH - 3, W16, 3, '#8a3d30');
      for (let ax = 1; ax < W16; ax += 4) px(ctx, ax, roofH - 1, 2, 1, '#c05a48');
      ctx.clearRect(0, 0, 2, 1); ctx.clearRect(W16 - 2, 0, 2, 1);
      wallBase('#b08850', '#9a743e');
      for (let xx = IN + 2; xx < W16 - IN - 1; xx += 3) px(ctx, xx, wallY + 2, 1, BH - wallY - 3, '#9a743e');
      windowsFill(4, 5, () => '#3a3226', '#8a6034');
      drawDoor('#8a6034', '#4a3018');
      px(ctx, doorCx - (doorW >> 1), BH - (doorH >> 1), doorW, 1, '#8a6034');
      break;
    case 'ranch': {
      // low ranch house: shallow roof, porch posts, horseshoe over the door
      roofTrap('#8a6a42', '#6d5230', '#a5885c', 3);
      wallBase('#c8a06a', '#a58048');
      for (let xx = IN + 3; xx < W16 - IN - 2; xx += 6) px(ctx, xx, BH - 6, 2, 6, '#6d5230'); // porch posts
      px(ctx, IN + 1, BH - 7, W16 - IN * 2 - 2, 2, '#8a6a42');                                // porch beam
      windowsFill(4, 4, () => '#3a3226', '#8a6a42');
      px(ctx, doorCx - 2, BH - doorH - 4, 4, 2, '#b8b0a0'); px(ctx, doorCx - 2, BH - doorH - 3, 1, 1, '#8a8480'); // horseshoe
      drawDoor('#8a6a42', '#4a3018');
      break;
    }

    /* ------------- Dragonia ------------- */
    case 'hall':
      roofTrap('#c09018', '#96700c', '#ecc23c');
      px(ctx, doorCx - 3, 0, 6, 2, '#f0c040');
      px(ctx, 0, roofH - 4, 2, 3, '#f0c040'); px(ctx, W16 - 2, roofH - 4, 2, 3, '#f0c040');
      wallBase('#a03030', '#7a2020');
      for (let cx2 = IN + 1; cx2 < W16 - IN - 2; cx2 += 6) px(ctx, cx2, wallY + 2, 2, BH - wallY - 3, '#c04040');
      windowsFill(4, 4, () => '#f0d8a8', '#7a2020');
      drawDoor('#f0c040', '#5a1a1a');
      break;
    case 'pagoda': {
      // two stacked tapering roof tiers
      const tier = Math.max(5, Math.round(roofH * 0.55));
      for (let yy = 0; yy < tier; yy++) {
        const ins = Math.round((W16 / 3.2) * (tier - 1 - yy) / Math.max(1, tier - 1));
        px(ctx, ins, yy, W16 - ins * 2, 1, yy < 2 ? '#ecc23c' : '#c09018');
      }
      px(ctx, 0, tier, W16, 1, '#96700c');
      px(ctx, IN + 2, tier + 1, W16 - IN * 2 - 4, 3, '#a03030'); // upper storey band
      const tier2y = tier + 4;
      for (let yy = 0; yy < 4; yy++) {
        const ins = Math.round(3 * (3 - yy) / 3);
        px(ctx, ins, tier2y + yy, W16 - ins * 2, 1, yy < 1 ? '#ecc23c' : '#c09018');
      }
      px(ctx, 0, tier2y + 4, W16, 1, '#96700c');
      wallBase('#a03030', '#7a2020', tier2y + 5);
      windowsFill(3, 4, () => '#f0d8a8', '#7a2020', tier2y + 5);
      px(ctx, doorCx - 1, 0, 2, 2, '#f0c040');
      drawDoor('#f0c040', '#5a1a1a');
      break;
    }
    case 'fortress':
      battlements('#6d6154', '#54483c');
      px(ctx, 0, 5, W16, roofH - 5, '#7a6e60');
      px(ctx, 0, roofH - 1, W16, 1, '#54483c');
      wallBase('#7a6e60', '#5a5044');
      for (let yy = wallY + 4; yy < BH - 3; yy += 4)
        for (let xx = (yy % 8 === 0 ? IN + 1 : IN + 4); xx < W16 - IN - 2; xx += 6) px(ctx, xx, yy, 4, 1, '#6d6154');
      px(ctx, doorCx - 1, 1, 1, 4, '#54401f'); px(ctx, doorCx, 1, 4, 3, '#c03030'); // war banner
      windowsFill(3, 3, () => '#2c2418', null);
      drawDoor('#54483c', '#2c2418', doorW, doorH, true);
      break;

    /* ------------- Elephantium ------------- */
    case 'hut':
      roofTrap('#6d8a3a', '#556e2c', '#82a04a', 4, true);
      wallBase('#8a6a42', '#6d5230');
      for (let yy = wallY + 4; yy < BH - 4; yy += 3) px(ctx, IN + 1, yy, W16 - IN * 2 - 2, 1, '#7a5a34');
      windowsFill(3, 3, () => '#2f2418', '#6d5230');
      for (let sx2 = IN + 1; sx2 < W16 - IN - 1; sx2 += 6) px(ctx, sx2, BH - 3, 2, 3, '#5a4022');
      drawDoor('#556e2c', '#3f2f1c');
      break;
    case 'stilt': {
      // coastal fishing hut: tall stilts, drying net, buoys
      roofTrap('#8a9a5c', '#6d7a44', '#a5b470', 4, true);
      const stiltH = Math.max(5, Math.round(BH * 0.2));
      wallBase('#9a7a4e', '#7a5e38');
      ctx.clearRect(IN, BH - stiltH, W16 - IN * 2, stiltH);   // open air under the hut
      for (let sx2 = IN + 1; sx2 < W16 - IN; sx2 += 5) px(ctx, sx2, BH - stiltH, 2, stiltH, '#5a4022');
      px(ctx, IN, BH - stiltH, W16 - IN * 2, 1, '#54401f');   // deck edge
      // drying net
      for (let ny = wallY + 3; ny < BH - stiltH - 2; ny += 2) px(ctx, W16 - IN - 6, ny, 5, 1, '#c8b88a');
      for (let nx = W16 - IN - 6; nx < W16 - IN - 1; nx += 2) px(ctx, nx, wallY + 3, 1, BH - stiltH - wallY - 5, '#c8b88a');
      px(ctx, IN + 2, BH - stiltH - 3, 2, 2, '#d44a4a');      // buoy
      windowsFill(3, 3, () => '#2f2418', '#6d5230');
      drawDoor('#6d7a44', '#3f2f1c');
      break;
    }
    case 'redlight': {
      // lantern-lit night house: dark timber, pink glow
      px(ctx, 0, 0, W16, roofH, '#3a2c34');
      px(ctx, 1, 1, W16 - 2, 1, '#54424c');
      px(ctx, 0, roofH - 2, W16, 2, '#241c20');
      ctx.clearRect(0, 0, 2, 1); ctx.clearRect(W16 - 2, 0, 2, 1);
      wallBase('#4a3a42', '#332830');
      windowsFill(4, 4, (i2) => (i2 % 2 ? '#ff6b9e' : '#ff8ac0'), '#241c20');
      px(ctx, IN + 2, wallY + 2, 3, 4, '#ff4a7e'); px(ctx, W16 - IN - 5, wallY + 2, 3, 4, '#ff4a7e'); // paired lanterns
      drawDoor('#241c20', '#180f14');
      break;
    }
    case 'stupa': {
      // gilded stupa: white terrace, golden bell spire to a point
      const spireH = Math.round(BH * 0.45);
      for (let yy = 0; yy < spireH; yy++) {
        const t2 = yy / spireH;
        const half = Math.max(1, Math.round((W16 / 3) * Math.pow(t2, 1.5)));
        px(ctx, (W16 >> 1) - half, yy, half * 2, 1, yy % 4 === 3 ? '#b8880c' : (t2 < 0.3 ? '#f0c040' : '#d4a018'));
      }
      px(ctx, (W16 >> 1) - 1, 0, 2, 2, '#fff0a0');
      wallBase('#e8e2d4', '#c8c0ac', spireH);
      windowsFill(3, 3, () => '#4a3a2a', '#c8c0ac', spireH);
      drawDoor('#d4a018', '#5a4022', doorW, Math.min(doorH, BH - spireH - 3), true);
      break;
    }

    /* ------------- Maneki-Neko ------------- */
    case 'casino': {
      // chase-light marquee palace
      px(ctx, 0, 0, W16, roofH, '#5a1a4a');
      px(ctx, 0, roofH - 2, W16, 2, '#38102e');
      const bulbs = ['#ffe066', '#ff6be0', '#5eeaff'];
      for (let bx2 = 1, i2 = 0; bx2 < W16 - 1; bx2 += 3, i2++) {
        px(ctx, bx2, 1, 2, 2, bulbs[i2 % 3]);
        px(ctx, bx2, roofH - 4, 2, 2, bulbs[(i2 + 1) % 3]);
      }
      px(ctx, 4, 4, W16 - 8, roofH - 9, '#f8f0ff');
      px(ctx, 6, 5, 4, Math.max(2, roofH - 11), '#d43a8e'); // mushroom sigil blob
      px(ctx, 7, 4, 2, 1, '#d43a8e');
      wallBase('#6d2458', '#4a1840');
      windowsFill(4, 4, (i2) => bulbs[i2 % 3], '#38102e');
      drawDoor('#ffe066', '#38102e', Math.min(12, doorW + 2));
      break;
    }
    case 'warehouse': {
      // corrugated port shed with a wide shutter
      roofTrap('#5a6a72', '#46525a', '#74868e', 3);
      wallBase('#7a8890', '#5a6870');
      for (let yy = wallY + 3; yy < BH - 2; yy += 2) px(ctx, IN + 1, yy, W16 - IN * 2 - 2, 1, '#6d7c84');
      const shW = Math.min(14, W16 - 10);
      px(ctx, doorCx - (shW >> 1) - 1, BH - doorH - 1, shW + 2, doorH + 1, '#46525a');
      for (let yy = BH - doorH; yy < BH - 1; yy += 2) px(ctx, doorCx - (shW >> 1), yy, shW, 1, '#38444c');
      px(ctx, doorCx + (shW >> 1) - 3, BH - (doorH >> 1) - 1, 2, 2, '#ffd75e');
      px(ctx, IN + 2, wallY + 2, 4, 3, '#ffe066'); // office light
      break;
    }
    case 'needle': {
      // observation tower: broad base, slim shaft, glowing disc
      const baseH = Math.max(6, Math.round(BH * 0.25));
      wallBase('#3a3a4e', '#242030', BH - baseH);
      const shaftW = Math.max(4, W16 >> 2);
      px(ctx, (W16 - shaftW) >> 1, 8, shaftW, BH - baseH - 8, '#55506a');
      px(ctx, ((W16 - shaftW) >> 1) + 1, 8, 1, BH - baseH - 8, '#6d688a');
      // disc
      px(ctx, 2, 3, W16 - 4, 5, '#2c2838');
      px(ctx, 1, 4, W16 - 2, 3, '#2c2838');
      const neon2 = ['#ffe066', '#5eeaff', '#ff6be0'][b.v % 3];
      px(ctx, 3, 5, W16 - 6, 1, neon2);
      px(ctx, (W16 >> 1) - 1, 0, 2, 3, '#8a8798');
      drawDoor('#55506a', '#1a1624');
      break;
    }
    case 'tower':
    case 'tower4':
    default: {
      const neon = ['#ffe066', '#5eeaff', '#ff6be0', '#8dff6b'];
      const sign = neon[b.v % 4];
      px(ctx, 0, 0, W16, roofH, '#2c2838');
      px(ctx, 0, 0, W16, 4, '#3c3850');
      px(ctx, 2, 5, W16 - 4, 3, sign);
      px(ctx, 3, roofH - 2, 2, 2, '#8a8798'); px(ctx, W16 - 5, roofH - 2, 2, 2, '#8a8798');
      ctx.clearRect(0, 0, 2, 1); ctx.clearRect(W16 - 2, 0, 2, 1);
      const bodyC = ['#3a3a4e', '#343044', '#403a52'][b.v % 3];
      wallBase(bodyC, '#242030');
      px(ctx, IN + 1, wallY + 2, 1, BH - wallY - 3, '#55506a');
      const rows = style === 'tower4' ? 4 : 2;
      const rowH = Math.max(4, Math.floor((BH - wallY - 6) / rows));
      let i2 = 0;
      for (let r2 = 0; r2 < rows; r2++) {
        const wy = wallY + 3 + r2 * rowH;
        if (wy + 3 > BH - 2) break;
        const overDoorRow = wy + 3 > BH - doorH - 2;
        for (let wx = IN + 2; wx + 3 <= W16 - IN - 2; wx += 6) {
          if (overDoorRow && wx + 3 >= doorCx - (doorW >> 1) - 2 && wx <= doorCx + (doorW >> 1) + 2) continue;
          px(ctx, wx, wy, 3, 3, rnd(i2++) < 0.55 ? neon[(i2 + b.v) % 4] : '#262234');
        }
      }
      if (lm) {
        px(ctx, W16 - IN - 7, wallY + 3, 5, BH - wallY - 8, '#1a1624');
        for (let sy2 = wallY + 5; sy2 < BH - 8; sy2 += 4) px(ctx, W16 - IN - 6, sy2, 3, 2, sign);
      }
      drawDoor('#55506a', '#1a1624');
      break;
    }
    case 'lighthouse': {
      // red-and-white striped light tower over a keeper's cottage
      const towerW = Math.max(10, Math.round(W16 * 0.42));
      const tx0 = (W16 - towerW) >> 1;
      for (let yy = 8; yy < BH - 8; yy += 4) {
        px(ctx, tx0, yy, towerW, 4, Math.floor(yy / 4) % 2 ? '#e8e2d4' : '#c04838');
      }
      px(ctx, tx0, 8, 1, BH - 16, '#8a4a3e'); px(ctx, tx0 + towerW - 1, 8, 1, BH - 16, '#8a4a3e');
      px(ctx, tx0 + 1, 2, towerW - 2, 4, '#2c2838');       // lamp room
      px(ctx, tx0 + 3, 3, towerW - 6, 2, '#ffe066');       // the light
      px(ctx, tx0 - 2, 6, towerW + 4, 2, '#8a8480');       // gallery rail
      wallBase('#e8e2d4', '#c8c0ac', BH - 10);             // keeper's cottage
      px(ctx, IN, BH - 12, W16 - IN * 2, 3, '#c04838');    // cottage roof band
      drawDoor('#c04838', '#5a3a1e');
      break;
    }
  }

  outline();
  return cv;
}

/* ============================================================
   Roadside attraction props — the physical machines/shrines the
   games live in. Drawn on a transparent canvas the size of their
   footprint, so the terrain shows through around them.
   ============================================================ */
const eventSpriteCache = new Map();

export function getEventSprite(ev) {
  const key = `${ev.game}:${ev.w}x${ev.h}:${ev.v}`;
  let cv = eventSpriteCache.get(key);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = ev.w * CELL; cv.height = ev.h * CELL;
    drawEventProp(cv.getContext('2d'), ev.game, cv.width, cv.height, ev.v);
    eventSpriteCache.set(key, cv);
  }
  return cv;
}

function drawEventProp(ctx, game, W16, BH, v) {
  const rnd = (i) => hash2(v, i * 53, 17);
  const shadow = (x, y, w, h) => { ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x, y, w, h); };
  const B = BH;   // bottom

  switch (game) {
    /* ---------------- Tyche & Fortuna ---------------- */
    case 'wheeltyche': {                       // marble Tyche holding a wheel
      shadow(4, B - 3, W16 - 8, 3);
      px(ctx, 1, B - 32, W16 - 2, 4, '#e8e2d4');            // shrine canopy
      px(ctx, 1, B - 32, W16 - 2, 1, '#f4f0e6');
      px(ctx, 1, B - 29, W16 - 2, 1, '#c8c0ac');
      px(ctx, (W16 >> 1) - 3, B - 31, 6, 2, '#f0c040');     // gilt boss
      px(ctx, 2, B - 28, 3, 13, '#d8d2c0');                 // canopy posts
      px(ctx, W16 - 5, B - 28, 3, 13, '#d8d2c0');
      px(ctx, 2, B - 28, 1, 13, '#f4f0e6');
      px(ctx, W16 - 5, B - 28, 1, 13, '#f4f0e6');
      px(ctx, 6, B - 6, 6, 6, '#d8d2c0');                   // plinth
      px(ctx, 6, B - 6, 6, 1, '#f4f0e6');
      px(ctx, 7, B - 15, 4, 9, '#e8e2d4');                  // robed figure
      px(ctx, 7, B - 15, 1, 9, '#f4f0e6');
      px(ctx, 7, B - 19, 4, 4, '#f0e4d0');                  // head
      px(ctx, 11, B - 17, 2, 2, '#e8e2d4');                 // outstretched arm
      const cx = 19, cy = B - 15;                            // the wheel
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * Math.PI * 2;
        px(ctx, Math.round(cx + Math.cos(ang) * 6), Math.round(cy + Math.sin(ang) * 6), 2, 2,
          a % 3 === 0 ? '#f0c040' : (a % 2 ? '#c8c0ac' : '#e8e2d4'));
      }
      px(ctx, cx - 1, cy - 1, 3, 3, '#f0c040');
      px(ctx, cx, cy - 9, 1, 3, '#c04838');                 // pointer
      px(ctx, 3, B - 4, 2, 2, '#f0c040'); px(ctx, W16 - 6, B - 5, 2, 2, '#f0c040'); // spilled coins
      break;
    }
    case 'amphorae': {                         // ring of jars round a shrine
      shadow(2, B - 3, W16 - 4, 3);
      px(ctx, 2, B - 32, W16 - 4, 3, '#d8d2c0');            // vine pergola over the jars
      px(ctx, 2, B - 32, W16 - 4, 1, '#f4f0e6');
      for (let bx2 = 6; bx2 < W16 - 6; bx2 += 7) px(ctx, bx2, B - 29, 2, 3, '#c8c0ac');
      px(ctx, 3, B - 29, 3, 14, '#e8e2d4');                 // posts
      px(ctx, W16 - 6, B - 29, 3, 14, '#e8e2d4');
      px(ctx, 3, B - 29, 1, 14, '#f4f0e6');
      px(ctx, W16 - 6, B - 29, 1, 14, '#f4f0e6');
      px(ctx, 8, B - 28, 5, 2, '#4f9c5a');                  // trained vine
      px(ctx, W16 - 15, B - 27, 6, 2, '#4f9c5a');
      px(ctx, 15, B - 26, 2, 3, '#3d8a4c');
      px(ctx, (W16 >> 1) - 4, B - 16, 8, 4, '#e8e2d4');     // shrine
      px(ctx, (W16 >> 1) - 3, B - 12, 6, 8, '#d8d2c0');
      px(ctx, (W16 >> 1) - 2, B - 15, 4, 3, '#f0c040');
      const jars = [[3, B - 11], [11, B - 13], [W16 - 14, B - 13], [W16 - 6, B - 11], [7, B - 7], [W16 - 10, B - 7]];
      jars.forEach(([jx, jy], i) => {
        const c2 = ['#b8763a', '#a05a28', '#c98a4a'][i % 3];
        px(ctx, jx + 1, jy, 4, 2, c2);                      // neck
        px(ctx, jx, jy + 2, 6, 6, c2);                      // body
        px(ctx, jx + 1, jy + 3, 1, 4, '#d9a066');           // lit side
        px(ctx, jx + 1, jy + 5, 4, 1, '#5a3a24');           // painted band
        px(ctx, jx + 2, jy + 8, 2, 1, '#7a4a20');
      });
      break;
    }
    case 'fatesthread': {                      // altar, spool and shears
      shadow(4, B - 3, W16 - 8, 3);
      px(ctx, 1, B - 32, W16 - 2, 4, '#c8c0ac');            // the loom the threads run up into
      px(ctx, 1, B - 32, W16 - 2, 1, '#f4f0e6');
      px(ctx, 2, B - 28, 3, 12, '#d8d2c0');                 // loom uprights
      px(ctx, W16 - 5, B - 28, 3, 12, '#d8d2c0');
      px(ctx, 2, B - 28, 1, 12, '#f4f0e6');
      px(ctx, W16 - 5, B - 28, 1, 12, '#f4f0e6');
      px(ctx, 5, B - 27, W16 - 10, 2, '#a89c88');           // warp beam
      for (let wx2 = 6; wx2 < W16 - 6; wx2 += 4) px(ctx, wx2, B - 25, 1, 4, '#e8d060'); // hanging warp
      px(ctx, 3, B - 7, W16 - 6, 7, '#c8c0ac');             // altar block
      px(ctx, 3, B - 7, W16 - 6, 2, '#f4f0e6');
      px(ctx, 5, B - 3, W16 - 10, 1, '#a89c88');
      // three thick threads climbing out of the spool
      const tcol = ['#f0c040', '#fff0a0', '#e8a020'];
      [5, 9, 13].forEach((tx2, i) => {
        const th = 12 + i * 3;
        for (let k = 0; k < th; k++) {
          px(ctx, tx2 + (k % 4 === 2 ? 1 : 0), B - 8 - k, 2, 1, tcol[i]);
        }
        px(ctx, tx2, B - 9 - th, 3, 3, '#fff8d0');          // glowing tip
      });
      px(ctx, 4, B - 12, 11, 5, '#b8880c');                 // spool
      px(ctx, 4, B - 12, 11, 1, '#e8d060');
      px(ctx, 6, B - 11, 1, 3, '#f0c040'); px(ctx, 10, B - 11, 1, 3, '#f0c040');
      px(ctx, W16 - 9, B - 20, 3, 8, '#c8c0ac');            // shears, open
      px(ctx, W16 - 5, B - 20, 3, 8, '#c8c0ac');
      px(ctx, W16 - 9, B - 20, 1, 8, '#f4f0e6');
      px(ctx, W16 - 8, B - 12, 5, 3, '#8a8480');            // pivot
      px(ctx, W16 - 7, B - 9, 3, 4, '#5a4630');             // handle
      break;
    }

    /* ---------------- Dragonia ---------------- */
    case 'pearldrop': {                        // dragon board with a luminous pearl
      shadow(3, B - 3, W16 - 6, 3);
      const bw2 = W16 - 8, bx2 = 4;
      px(ctx, bx2, B - 26, bw2, 20, '#7a2020');             // ornate drop board
      px(ctx, bx2 + 1, B - 25, bw2 - 2, 18, '#4a1414');
      px(ctx, bx2, B - 26, bw2, 2, '#f0c040');              // gilt frame
      px(ctx, bx2, B - 8, bw2, 2, '#f0c040');
      for (let r2 = 0; r2 < 5; r2++) {                       // pins
        for (let c2 = 0; c2 < 4; c2++) {
          px(ctx, bx2 + 3 + c2 * 4 + (r2 % 2) * 2, B - 23 + r2 * 3, 1, 1, '#f0c040');
        }
      }
      for (let k = 0; k < 3; k++) px(ctx, bx2 + 2 + k * 6, B - 10, 4, 2, ['#c04040', '#f0c040', '#c04040'][k]); // pockets
      px(ctx, (W16 >> 1) - 2, B - 31, 5, 5, '#fff0c0');     // pearl on top
      px(ctx, (W16 >> 1) - 1, B - 30, 2, 2, '#ffffff');
      px(ctx, 2, B - 6, W16 - 4, 6, '#a03030');             // dragon coiled at the base
      px(ctx, 3, B - 5, W16 - 6, 2, '#c04040');
      px(ctx, W16 - 9, B - 10, 7, 5, '#c04040');            // head
      px(ctx, W16 - 10, B - 12, 2, 3, '#f0c040');
      px(ctx, W16 - 4, B - 12, 2, 3, '#f0c040');
      px(ctx, W16 - 7, B - 9, 1, 1, '#26202c');
      px(ctx, W16 - 5, B - 9, 1, 1, '#26202c');
      break;
    }
    case 'ninegates': {                        // long dragon under nine arches
      shadow(2, B - 3, W16 - 4, 3);
      px(ctx, 3, B - 31, W16 - 6, 4, '#a03030');            // paifang gate roof
      px(ctx, 3, B - 31, W16 - 6, 1, '#f0c040');
      px(ctx, 1, B - 27, W16 - 2, 4, '#7a2020');            // lower eave
      px(ctx, 1, B - 27, W16 - 2, 1, '#f0c040');
      px(ctx, 0, B - 25, 4, 2, '#f0c040');                  // upturned tips
      px(ctx, W16 - 4, B - 25, 4, 2, '#f0c040');
      px(ctx, 4, B - 23, 3, 7, '#8a2828');                  // gate posts down to the arcade
      px(ctx, W16 - 7, B - 23, 3, 7, '#8a2828');
      px(ctx, (W16 >> 1) - 4, B - 23, 8, 4, '#f0c040');     // gilt name board
      px(ctx, (W16 >> 1) - 3, B - 22, 6, 2, '#7a2020');
      for (let g = 0; g < 9; g++) {
        const gx = 2 + Math.round(g * (W16 - 8) / 9);
        px(ctx, gx, B - 14, 2, 12, '#a03030');              // pillar
        px(ctx, gx, B - 16, 3, 2, '#f0c040');               // arch top
        if (g % 2 === 0) px(ctx, gx + 1, B - 12, 1, 1, '#ffe066'); // lamp
      }
      px(ctx, 2, B - 8, W16 - 4, 5, '#c04040');             // dragon body threading through
      px(ctx, 3, B - 7, W16 - 6, 2, '#e05a40');
      px(ctx, W16 - 8, B - 12, 6, 5, '#e05a40');            // head
      px(ctx, W16 - 9, B - 14, 2, 3, '#f0c040'); px(ctx, W16 - 4, B - 14, 2, 3, '#f0c040');
      px(ctx, W16 - 6, B - 11, 1, 1, '#26202c');
      px(ctx, 2, B - 10, 3, 3, '#f0c040');                  // tail flame
      break;
    }
    case 'dragonhoard': {                      // sleeping dragon over urns
      shadow(2, B - 3, W16 - 4, 3);
      px(ctx, 0, B - 32, W16, 7, '#6d6864');                // cave roof over the hoard
      px(ctx, 0, B - 32, W16, 2, '#8a847a');
      px(ctx, 0, B - 26, W16, 1, '#4a4642');
      [[5, 5], [14, 7], [24, 4], [34, 6], [42, 5]].forEach(([sx3, sh]) => {
        px(ctx, sx3, B - 26, 3, sh, '#6d6864');             // stalactites
        px(ctx, sx3, B - 26, 1, sh - 1, '#8a847a');
      });
      px(ctx, 1, B - 25, 3, 10, '#5a5652');                 // rock jambs
      px(ctx, W16 - 4, B - 25, 3, 10, '#5a5652');
      px(ctx, 4, B - 12, W16 - 8, 7, '#3f8468');            // sleeping coil
      px(ctx, 5, B - 11, W16 - 10, 2, '#4f9c7e');
      px(ctx, 4, B - 16, 7, 5, '#4f9c7e');                  // head resting
      px(ctx, 3, B - 18, 2, 3, '#f0c040'); px(ctx, 9, B - 18, 2, 3, '#f0c040');
      px(ctx, 6, B - 14, 3, 1, '#26202c');                  // closed eye
      px(ctx, 12, B - 19, 1, 1, '#a8d0c0'); px(ctx, 14, B - 22, 1, 1, '#a8d0c0'); // zzz
      [[5, B - 5], [13, B - 5], [W16 - 10, B - 5]].forEach(([ux, uy], i) => {
        px(ctx, ux, uy, 6, 5, ['#8a6a42', '#a05a28', '#6d5230'][i]);
        px(ctx, ux + 1, uy - 2, 4, 2, '#c8a060');
        px(ctx, ux + 1, uy + 1, 4, 1, '#f0c040');
      });
      px(ctx, W16 - 5, B - 12, 3, 6, '#c8c0ac');            // incense burner
      px(ctx, W16 - 4, B - 15, 1, 3, '#d8d8e0');
      break;
    }

    /* ---------------- Horseshoeville ---------------- */
    case 'horseshoetoss': {                    // stake, barrel, hitching post
      shadow(3, B - 3, W16 - 6, 3);
      px(ctx, 3, B - 31, W16 - 6, 3, '#8a6034');            // sign gantry
      px(ctx, 3, B - 31, W16 - 6, 1, '#a5793f');
      px(ctx, 4, B - 28, 2, 12, '#6d4a28');                 // gantry legs
      px(ctx, W16 - 6, B - 28, 2, 12, '#6d4a28');
      px(ctx, (W16 >> 1) - 5, B - 28, 2, 2, '#5a4630');     // hanging chains
      px(ctx, (W16 >> 1) + 3, B - 28, 2, 2, '#5a4630');
      px(ctx, (W16 >> 1) - 6, B - 26, 12, 8, '#c8a060');    // painted board
      px(ctx, (W16 >> 1) - 6, B - 26, 12, 1, '#e8d49a');
      px(ctx, (W16 >> 1) - 4, B - 24, 8, 5, '#5a3a24');     // horseshoe device
      px(ctx, (W16 >> 1) - 2, B - 22, 4, 3, '#c8a060');
      px(ctx, 8, B - 14, 2, 12, '#8a6034');                 // stake
      px(ctx, 7, B - 15, 4, 2, '#5f3f20');
      px(ctx, 6, B - 9, 2, 2, '#b8b0a0');                   // ringed shoes
      px(ctx, 10, B - 7, 2, 2, '#9a948a');
      px(ctx, 3, B - 4, 3, 1, '#b8b0a0');
      px(ctx, W16 - 10, B - 10, 8, 10, '#8a6034');          // barrel of shoes
      px(ctx, W16 - 10, B - 8, 8, 1, '#5f3f20'); px(ctx, W16 - 10, B - 4, 8, 1, '#5f3f20');
      px(ctx, W16 - 8, B - 12, 2, 2, '#b8b0a0'); px(ctx, W16 - 5, B - 12, 2, 2, '#9a948a');
      px(ctx, W16 - 3, B - 16, 2, 14, '#6d4a28');           // hitching post
      px(ctx, W16 - 6, B - 15, 5, 2, '#6d4a28');
      break;
    }
    case 'goldencorral': {                     // miniature corral + bell
      shadow(2, B - 3, W16 - 4, 3);
      px(ctx, 3, B - 30, 3, 19, '#6d4a28');                 // ranch gate posts
      px(ctx, W16 - 6, B - 30, 3, 19, '#6d4a28');
      px(ctx, 2, B - 32, W16 - 4, 3, '#8a6034');            // header beam
      px(ctx, 2, B - 32, W16 - 4, 1, '#a5793f');
      px(ctx, (W16 >> 1) - 11, B - 29, 22, 8, '#5a3a24');   // hanging sign
      px(ctx, (W16 >> 1) - 10, B - 28, 20, 6, '#c8a060');
      px(ctx, (W16 >> 1) - 7, B - 27, 3, 4, '#5a3a24');     // brand marks
      px(ctx, (W16 >> 1) - 2, B - 27, 3, 4, '#5a3a24');
      px(ctx, (W16 >> 1) + 3, B - 27, 3, 4, '#5a3a24');
      px(ctx, 2, B - 12, W16 - 4, 1, '#8a6034');            // rails
      px(ctx, 2, B - 8, W16 - 4, 1, '#8a6034');
      for (let fx = 2; fx < W16 - 2; fx += 6) px(ctx, fx, B - 13, 1, 11, '#6d4a28');
      px(ctx, 5, B - 11, 5, 3, '#c8a060');                  // little horses
      px(ctx, 9, B - 12, 2, 2, '#c8a060');
      px(ctx, 14, B - 11, 5, 3, '#8a5a2a'); px(ctx, 18, B - 12, 2, 2, '#8a5a2a');
      px(ctx, W16 - 14, B - 11, 5, 3, '#e8d49a'); px(ctx, W16 - 10, B - 12, 2, 2, '#e8d49a');
      px(ctx, W16 - 6, B - 20, 5, 6, '#5a3a24');            // betting board
      px(ctx, W16 - 5, B - 19, 3, 4, '#e8d49a');
      px(ctx, W16 - 5, B - 24, 3, 4, '#f0c040');            // bell
      break;
    }
    case 'prospector': {                       // dig site with lantern
      shadow(3, B - 3, W16 - 6, 3);
      px(ctx, 3, B - 31, W16 - 6, 3, '#6d4a28');            // headframe over the claim
      px(ctx, 3, B - 31, W16 - 6, 1, '#8a6034');
      px(ctx, 4, B - 28, 2, 13, '#8a6034');                 // legs
      px(ctx, W16 - 6, B - 28, 2, 13, '#8a6034');
      px(ctx, 6, B - 25, W16 - 12, 1, '#5f3f20');           // cross brace
      px(ctx, 6, B - 21, W16 - 12, 1, '#5f3f20');
      px(ctx, (W16 >> 1) - 2, B - 29, 4, 3, '#9a948a');     // pulley
      px(ctx, (W16 >> 1) - 1, B - 26, 1, 8, '#5a4630');     // rope
      px(ctx, (W16 >> 1) - 3, B - 18, 6, 4, '#7a746a');     // ore bucket
      [[3, 6], [11, 5], [W16 - 9, 6]].forEach(([mx, mw], i) => {
        px(ctx, mx, B - 4, mw, 4, '#a5793f');               // dirt mounds
        px(ctx, mx + 1, B - 6, mw - 2, 2, '#b8875a');
        if (i === 1) px(ctx, mx + 1, B - 7, 2, 2, '#b8b0a0'); // a shoe peeking out
      });
      px(ctx, 6, B - 18, 2, 12, '#8a6034');                 // shovel
      px(ctx, 5, B - 8, 4, 4, '#b8b0a0');
      px(ctx, W16 - 6, B - 18, 1, 8, '#5a4630');            // lantern hook
      px(ctx, W16 - 8, B - 12, 4, 5, '#3a3226');
      px(ctx, W16 - 7, B - 11, 2, 3, '#ffe066');
      px(ctx, W16 - 14, B - 16, 8, 5, '#c8a060');           // claim sign
      px(ctx, W16 - 13, B - 15, 6, 3, '#5a3a24');
      break;
    }

    /* ---------------- Four Leaf Republic ---------------- */
    case 'cloverbloom': {                      // glowing clover patch + standing stones
      shadow(3, B - 3, W16 - 6, 3);
      // a dolmen: two standing stones carrying a capstone, clovers beneath
      px(ctx, 2, B - 26, 6, 26, '#9a948a');
      px(ctx, 2, B - 26, 2, 26, '#b4aea2');
      px(ctx, W16 - 8, B - 26, 6, 26, '#9a948a');
      px(ctx, W16 - 8, B - 26, 2, 26, '#b4aea2');
      px(ctx, 1, B - 32, W16 - 2, 6, '#8a847a');            // capstone
      px(ctx, 1, B - 32, W16 - 2, 2, '#a8a29e');
      px(ctx, 1, B - 27, W16 - 2, 1, '#6d6864');
      px(ctx, 4, B - 25, 3, 2, '#4f9845');                  // moss
      px(ctx, W16 - 7, B - 21, 3, 2, '#4f9845');
      // four-leaf clovers: four round lobes on a stem
      const clover = (cx2, cy2, lit) => {
        const base = lit ? '#8dff6b' : '#3d8a3a', hi = lit ? '#c8ffb0' : '#4faf50';
        px(ctx, cx2 - 3, cy2 - 3, 3, 3, base); px(ctx, cx2, cy2 - 3, 3, 3, base);
        px(ctx, cx2 - 3, cy2, 3, 3, base);     px(ctx, cx2, cy2, 3, 3, base);
        px(ctx, cx2 - 2, cy2 - 2, 1, 1, hi);   px(ctx, cx2 + 1, cy2 - 2, 1, 1, hi);
        px(ctx, cx2 - 1, cy2 + 3, 1, 4, '#2f6a2a');         // stem
        if (lit) { px(ctx, cx2 - 4, cy2 - 4, 1, 1, '#e8ffd0'); px(ctx, cx2 + 3, cy2 + 2, 1, 1, '#e8ffd0'); }
      };
      clover(11, B - 12, false);
      clover(18, B - 8, true);
      clover(9, B - 5, false);
      clover(W16 - 12, B - 11, false);
      clover(W16 - 15, B - 5, false);
      break;
    }
    case 'faeriering': {                       // mushroom faerie circle
      shadow(3, B - 3, W16 - 6, 3);
      px(ctx, 2, B - 27, 4, 27, '#5a3a1e');                 // old bough leaning over the ring
      px(ctx, 3, B - 32, W16 - 9, 4, '#5a3a1e');
      px(ctx, 3, B - 32, W16 - 9, 1, '#6d4726');
      px(ctx, W16 - 7, B - 30, 4, 8, '#5a3a1e');            // it dips back down
      px(ctx, 6, B - 28, 6, 3, '#2f7a44');                  // leaf clumps
      px(ctx, 15, B - 29, 7, 3, '#3d8a4c');
      px(ctx, W16 - 13, B - 27, 6, 3, '#2f7a44');
      px(ctx, 10, B - 25, 1, 4, '#8dff6b');                 // faerie lights on threads
      px(ctx, 18, B - 25, 1, 5, '#c8ffb0');
      px(ctx, W16 - 10, B - 23, 1, 3, '#8dff6b');
      const caps = [[4, B - 6], [9, B - 9], [16, B - 10], [W16 - 8, B - 8], [W16 - 5, B - 4], [12, B - 3], [6, B - 3]];
      caps.forEach(([mx, my], i) => {
        px(ctx, mx + 1, my + 3, 2, 3, '#e8dcc0');           // stalk
        px(ctx, mx, my, 5, 3, i % 3 === 0 ? '#c05a48' : (i % 3 === 1 ? '#d47a2a' : '#8a6ac0'));
        px(ctx, mx + 1, my + 1, 1, 1, '#f4f0e6');
        px(ctx, mx + 3, my, 1, 1, '#f4f0e6');
      });
      px(ctx, W16 - 14, B - 14, 6, 4, '#9a948a');           // clover-covered stone
      px(ctx, W16 - 13, B - 15, 2, 2, '#4f9845');
      px(ctx, 13, B - 13, 2, 2, '#8dff6b');                 // faerie spark
      break;
    }
    case 'grovereels': {                       // giant stone clover, four turning leaves
      shadow(3, B - 3, W16 - 6, 3);
      px(ctx, (W16 >> 1) - 7, B - 9, 14, 9, '#8a8480');     // broad pedestal
      px(ctx, (W16 >> 1) - 7, B - 9, 14, 2, '#a8a29e');
      px(ctx, (W16 >> 1) - 5, B - 6, 10, 1, '#6d6864');     // celtic knot bands
      px(ctx, (W16 >> 1) - 5, B - 4, 10, 1, '#6d6864');
      px(ctx, (W16 >> 1) - 2, B - 12, 4, 4, '#7a746a');     // stem column
      // four stone leaves, each showing a carved symbol
      const lx = (W16 >> 1) - 8, ly = B - 26;
      const faces = ['#6d9c60', '#5a8a52', '#7aa86c', '#5f9058'];
      [[0, 0], [8, 0], [0, 7], [8, 7]].forEach(([dx2, dy2], i) => {
        px(ctx, lx + dx2 + 1, ly + dy2, 6, 7, faces[i]);    // leaf body
        px(ctx, lx + dx2, ly + dy2 + 1, 8, 5, faces[i]);
        px(ctx, lx + dx2 + 1, ly + dy2 + 1, 3, 1, '#9ac48c'); // lit edge
        px(ctx, lx + dx2 + 3, ly + dy2 + 2, 2, 3, '#356030');  // carved mark
        px(ctx, lx + dx2, ly + dy2 + 6, 8, 1, '#2f5a2a');   // shadow lip
      });
      px(ctx, (W16 >> 1) - 1, ly + 6, 2, 2, '#4a7a44');     // centre boss
      break;
    }

    /* ---------------- Elephantium ---------------- */
    case 'spiritlanterns': {                   // lantern rack + incense altar
      shadow(3, B - 3, W16 - 6, 3);
      px(ctx, 3, B - 30, 3, 30, '#6d4726');                 // tall rack posts
      px(ctx, W16 - 7, B - 30, 3, 30, '#6d4726');
      px(ctx, 3, B - 30, 1, 30, '#8a5c32');
      px(ctx, W16 - 7, B - 30, 1, 30, '#8a5c32');
      px(ctx, 2, B - 32, W16 - 4, 3, '#8a5c32');            // crossbeam
      px(ctx, 2, B - 32, W16 - 4, 1, '#a5713e');
      [[7, 3], [13, 9], [W16 - 12, 5], [W16 - 18, 12]].forEach(([lx2, drop], i) => {
        px(ctx, lx2 + 1, B - 29, 1, drop, '#4a3a2a');       // cord
        px(ctx, lx2, B - 29 + drop, 4, 5, ['#d44a4a', '#e8901a', '#f0c040', '#d44a8a'][i]);
        px(ctx, lx2 + 1, B - 28 + drop, 1, 3, '#fff0c0');   // glow
      });
      px(ctx, (W16 >> 1) - 3, B - 6, 7, 6, '#a05a28');      // altar
      px(ctx, (W16 >> 1) - 2, B - 8, 1, 2, '#d8d8e0');      // incense smoke
      px(ctx, (W16 >> 1), B - 9, 1, 3, '#d8d8e0');
      break;
    }
    case 'nagariver': {                        // naga fountain + channel
      shadow(2, B - 3, W16 - 4, 3);
      // the naga's body arcs overhead, carried on two carved pillars
      for (let ax2 = 1; ax2 < W16 - 1; ax2++) {
        const ay2 = B - 30 + Math.round(Math.sin(ax2 * 0.42) * 2);
        px(ctx, ax2, ay2, 1, 6, '#3f8468');
        px(ctx, ax2, ay2, 1, 2, '#5fb08e');
        if (ax2 % 6 === 0) px(ctx, ax2, ay2 + 6, 1, 2, '#f0c040');   // scale studs
      }
      px(ctx, 18, B - 23, 4, 8, '#8a8480');                 // pillars
      px(ctx, W16 - 15, B - 23, 4, 8, '#8a8480');
      px(ctx, 18, B - 23, 1, 8, '#a8a29e');
      px(ctx, W16 - 15, B - 23, 1, 8, '#a8a29e');
      px(ctx, W16 - 9, B - 32, 5, 4, '#f0c040');            // tail crest
      px(ctx, 2, B - 6, W16 - 4, 6, '#8a8480');             // stone channel
      px(ctx, 3, B - 5, W16 - 6, 4, '#4a94b8');             // water
      for (let wx = 4; wx < W16 - 4; wx += 5) px(ctx, wx, B - 4, 3, 1, '#a8e0ea');
      px(ctx, 4, B - 16, 7, 10, '#4f9c7e');                 // naga head fountain
      px(ctx, 5, B - 15, 5, 3, '#5fb08e');
      px(ctx, 3, B - 19, 2, 4, '#f0c040'); px(ctx, 10, B - 19, 2, 4, '#f0c040'); // crest
      px(ctx, 6, B - 13, 1, 1, '#26202c'); px(ctx, 9, B - 13, 1, 1, '#26202c');
      px(ctx, 7, B - 8, 2, 3, '#a8e0ea');                   // pouring water
      px(ctx, W16 - 10, B - 11, 6, 5, '#b8763a');           // offering bowl
      px(ctx, W16 - 9, B - 12, 4, 2, '#e8d49a');
      px(ctx, W16 - 8, B - 14, 2, 2, '#ff8ac0');            // flower offering
      break;
    }
    case 'banyan': {                           // banyan tree + spirit house
      shadow(3, B - 3, W16 - 6, 3);
      px(ctx, 8, B - 14, 5, 14, '#6d4726');                 // trunk
      px(ctx, 6, B - 6, 2, 6, '#5a3a1e'); px(ctx, 13, B - 8, 2, 8, '#5a3a1e'); // aerial roots
      px(ctx, 2, B - 24, W16 - 6, 10, '#2f7a44');           // canopy
      px(ctx, 4, B - 26, W16 - 12, 4, '#3d8a4c');
      px(ctx, 5, B - 23, 4, 2, '#58a860');
      px(ctx, W16 - 12, B - 20, 3, 2, '#256630');
      px(ctx, 6, B - 16, 1, 3, '#f0c040'); px(ctx, 12, B - 15, 1, 3, '#ff8ac0'); // hanging offerings
      px(ctx, W16 - 8, B - 12, 6, 5, '#c8a060');            // spirit house
      px(ctx, W16 - 9, B - 15, 8, 3, '#d44a4a');
      px(ctx, W16 - 6, B - 8, 2, 8, '#8a6a42');             // its little post
      break;
    }

    /* ---------------- Maneki-Neko ---------------- */
    case 'neonneko': {                         // giant neon beckoning cat
      shadow(4, B - 3, W16 - 8, 3);
      const neon = ['#ff6be0', '#5eeaff', '#ffe066'][v % 3];
      px(ctx, 5, B - 7, W16 - 10, 7, '#2c2838');            // pedestal
      px(ctx, 6, B - 6, W16 - 12, 2, neon);
      px(ctx, 7, B - 20, W16 - 14, 13, '#f4f0e6');          // cat body
      px(ctx, 7, B - 24, 4, 5, '#f4f0e6');                  // ears
      px(ctx, W16 - 11, B - 24, 4, 5, '#f4f0e6');
      px(ctx, 8, B - 23, 2, 3, '#ffb0c8'); px(ctx, W16 - 10, B - 23, 2, 3, '#ffb0c8');
      px(ctx, 9, B - 18, 2, 2, '#26202c'); px(ctx, W16 - 11, B - 18, 2, 2, '#26202c'); // eyes
      px(ctx, (W16 >> 1) - 1, B - 16, 2, 1, '#d44a4a');
      px(ctx, W16 - 8, B - 22, 3, 5, '#f4f0e6');            // raised beckoning paw
      px(ctx, (W16 >> 1) - 3, B - 13, 6, 5, '#f0c040');     // koban bib
      px(ctx, 4, B - 12, 2, 6, neon); px(ctx, W16 - 6, B - 12, 2, 6, neon); // neon tubes
      break;
    }
    case 'catparade': {                        // gachapon shrine with cat doors
      shadow(2, B - 3, W16 - 4, 3);
      px(ctx, 2, B - 20, W16 - 4, 20, '#d44a8a');           // cabinet
      px(ctx, 3, B - 19, W16 - 6, 5, '#f8f0ff');            // header
      px(ctx, 5, B - 18, W16 - 10, 3, '#5a1a4a');
      for (let d = 0; d < 5; d++) {
        const dx2 = 4 + d * Math.round((W16 - 10) / 5);
        px(ctx, dx2, B - 13, 6, 6, '#2c2838');              // door
        px(ctx, dx2 + 1, B - 12, 4, 4, ['#ffe066', '#5eeaff', '#8dff6b', '#ff6be0', '#f4f0e6'][d]);
        px(ctx, dx2 + 2, B - 11, 1, 1, '#26202c');          // tiny cat face
        px(ctx, dx2 + 4, B - 11, 1, 1, '#26202c');
      }
      px(ctx, 3, B - 6, W16 - 6, 4, '#5a1a4a');             // collection tray
      px(ctx, 6, B - 5, 3, 2, '#f0c040');
      px(ctx, W16 - 6, B - 24, 2, 4, '#ff6be0');            // sign post
      break;
    }
    case 'coincascade': {                      // transparent cat pachinko + koban
      shadow(4, B - 3, W16 - 8, 3);
      px(ctx, 4, B - 24, W16 - 8, 20, '#2c2838');           // cabinet
      px(ctx, 6, B - 22, W16 - 12, 15, '#5aa8c8');          // glass
      px(ctx, 6, B - 22, W16 - 12, 15, 'rgba(160,220,240,0.35)');
      for (let r2 = 0; r2 < 4; r2++) for (let c2 = 0; c2 < 4; c2++) {
        px(ctx, 8 + c2 * 4 + (r2 % 2) * 2, B - 20 + r2 * 4, 1, 1, '#f8f0ff'); // pins
      }
      for (let k = 0; k < 3; k++) px(ctx, 7 + k * 6, B - 8, 4, 3, ['#ff6be0', '#ffe066', '#5eeaff'][k]); // pockets
      px(ctx, (W16 >> 1) - 3, B - 30, 6, 5, '#f0c040');     // giant koban on top
      px(ctx, (W16 >> 1) - 2, B - 29, 4, 3, '#ffe066');
      px(ctx, 4, B - 26, W16 - 8, 2, '#ff6be0');            // neon crown
      px(ctx, W16 - 8, B - 6, 3, 3, '#f0c040');             // payout tray coin
      break;
    }
    case 'fishing': {                          // coastal hut, drying rack, fisherman at his rods
      sh2(ctx, W16, B);
      px(ctx, 2, B - 26, 20, 5, '#6d4726');                 // driftwood roof
      px(ctx, 2, B - 26, 20, 1, '#8a5c32');
      px(ctx, 4, B - 21, 16, 12, '#8a6034');                // hut
      px(ctx, 5, B - 20, 6, 6, '#3a5a70');                  // window to the sea
      px(ctx, 6, B - 19, 2, 2, '#8fd0e8');
      px(ctx, 13, B - 18, 5, 9, '#4a3520');                 // door
      px(ctx, 3, B - 9, 18, 2, '#a5793f');                  // porch boards
      px(ctx, W16 - 20, B - 24, 2, 20, '#5a3a24');          // rod rack
      px(ctx, W16 - 22, B - 24, 6, 2, '#5a3a24');
      px(ctx, W16 - 21, B - 22, 1, 14, '#c8c0ac');          // rods
      px(ctx, W16 - 18, B - 22, 1, 16, '#c8c0ac');
      px(ctx, W16 - 12, B - 8, 8, 5, '#3a5a70');            // bait barrel + bucket
      px(ctx, W16 - 12, B - 8, 8, 1, '#8fd0e8');
      px(ctx, W16 - 6, B - 13, 4, 5, '#8a6034');
      for (let fy = 0; fy < 3; fy++) px(ctx, 24 + fy * 6, B - 24, 4, 2, '#8fb8c8'); // drying fish
      px(ctx, 23, B - 25, 14, 1, '#4a3a2a');                // drying line
      break;
    }
    case 'scavhunt': {                         // grand hunt sign-up tent, games-day style
      sh2(ctx, W16, B);
      // striped marquee
      for (let sx2 = 2; sx2 < W16 - 2; sx2 += 6) {
        px(ctx, sx2, B - 24, 6, 10, ((sx2 / 6) | 0) % 2 ? '#e8e2d4' : '#c43a2a');
      }
      px(ctx, 1, B - 25, W16 - 2, 2, '#8a2030');            // canopy edge
      px(ctx, 2, B - 14, 3, 11, '#e8e2d4');                 // tent walls
      px(ctx, W16 - 5, B - 14, 3, 11, '#e8e2d4');
      px(ctx, 3, B - 14, 1, 11, '#c8c0ac');
      px(ctx, 5, B - 14, W16 - 10, 3, '#3a2a30');           // shaded interior
      px(ctx, 8, B - 10, W16 - 16, 7, '#5a3a24');           // sign-up counter
      px(ctx, 8, B - 10, W16 - 16, 2, '#8a6034');
      px(ctx, 10, B - 8, 5, 3, '#e8d49a');                  // entry ledger
      px(ctx, W16 - 15, B - 8, 4, 3, '#f0c040');            // prize purse
      px(ctx, (W16 >> 1) - 1, B - 32, 2, 8, '#5a3a24');     // centre pole + pennant
      px(ctx, (W16 >> 1) + 1, B - 32, 6, 3, '#ffd75e');
      px(ctx, 1, B - 30, 1, 6, '#5a3a24'); px(ctx, 2, B - 30, 4, 2, '#5eb3ff'); // corner flags
      px(ctx, W16 - 2, B - 30, 1, 6, '#5a3a24'); px(ctx, W16 - 6, B - 30, 4, 2, '#8dff6b');
      px(ctx, 6, B - 21, W16 - 12, 4, '#f4ecd8');           // banner
      px(ctx, 8, B - 20, 3, 2, '#c43a2a'); px(ctx, 13, B - 20, 3, 2, '#e8b830'); // medal dots
      px(ctx, 18, B - 20, 3, 2, '#9aa0ac');
      break;
    }
    case 'natscav': {                          // the National Hunt caravan — a painted wagon-booth
      sh2(ctx, W16, B);
      px(ctx, 2, B - 22, W16 - 10, 14, '#8a2030');          // wagon body
      px(ctx, 2, B - 22, W16 - 10, 2, '#c43a4a');
      px(ctx, 1, B - 26, W16 - 8, 4, '#f0c040');            // gilded arched roof
      px(ctx, 3, B - 25, W16 - 12, 2, '#ffe066');
      px(ctx, 4, B - 19, 12, 8, '#3a2a30');                 // open serving hatch
      px(ctx, 5, B - 13, 10, 2, '#5a3a24');                 // counter
      px(ctx, 7, B - 18, 3, 3, '#ffd75e');                  // trophy glinting inside
      px(ctx, 8, B - 19, 1, 1, '#fff4c8');
      px(ctx, 18, B - 20, 10, 5, '#f4ecd8');                // route board
      px(ctx, 19, B - 19, 3, 1, '#c43a2a'); px(ctx, 24, B - 19, 3, 1, '#2a4a9a');
      px(ctx, 19, B - 17, 3, 1, '#4f9c5e'); px(ctx, 24, B - 17, 3, 1, '#e8b830');
      px(ctx, 4, B - 7, 6, 6, '#3a2a18');                   // wheels
      px(ctx, 5, B - 6, 4, 4, '#8a6034');
      px(ctx, W16 - 16, B - 7, 6, 6, '#3a2a18');
      px(ctx, W16 - 15, B - 6, 4, 4, '#8a6034');
      px(ctx, W16 - 7, B - 20, 2, 17, '#5a3a24');           // flag mast: six province ribbons
      const RIB = ['#d9c078', '#4faf50', '#c8985a', '#c05050', '#4f9c6e', '#c96ad4'];
      RIB.forEach((c, i2) => px(ctx, W16 - 5, B - 20 + i2 * 2, 4, 1, c));
      px(ctx, W16 - 8, B - 24, 4, 4, '#ffd75e');            // golden horn on the mast top
      break;
    }
    case 'goldpan': {                          // sluice run, gravel heap and the panner's kit
      sh2(ctx, W16, B);
      px(ctx, 2, B - 14, 26, 4, '#8a6034');                 // sluice box on legs
      px(ctx, 3, B - 13, 24, 2, '#6a4a28');
      for (let r = 0; r < 5; r++) px(ctx, 5 + r * 5, B - 13, 1, 2, '#4a3520'); // riffles
      px(ctx, 4, B - 10, 2, 10, '#5a3a24'); px(ctx, 24, B - 10, 2, 10, '#5a3a24');
      px(ctx, 0, B - 17, 6, 4, '#3a5a70');                  // headwater trough
      px(ctx, 1, B - 16, 4, 2, '#8fd0e8');
      px(ctx, 26, B - 9, 4, 3, '#8fd0e8');                  // tailwater splash
      px(ctx, W16 - 16, B - 10, 9, 7, '#8a8478');           // gravel heap
      px(ctx, W16 - 14, B - 12, 5, 3, '#9a948a');
      px(ctx, W16 - 12, B - 9, 2, 1, '#ffd75e');            // a wink of gold in it
      px(ctx, W16 - 6, B - 12, 5, 2, '#4a4642');            // the pan on a stump
      px(ctx, W16 - 5, B - 11, 3, 1, '#ffd75e');
      px(ctx, W16 - 6, B - 10, 5, 5, '#6a4a28');
      px(ctx, 8, B - 22, 2, 8, '#5a3a24');                  // claim stake + sign
      px(ctx, 5, B - 24, 8, 4, '#e8d49a');
      px(ctx, 6, B - 23, 6, 1, '#8a6034');
      break;
    }
    case 'lanternfest': {                      // festival launch dock strung with paper lanterns
      sh2(ctx, W16, B);
      px(ctx, 2, B - 6, W16 - 4, 4, '#8a6034');             // dock boards
      px(ctx, 2, B - 6, W16 - 4, 1, '#a5793f');
      px(ctx, 4, B - 2, 2, 2, '#5a3a24'); px(ctx, W16 - 6, B - 2, 2, 2, '#5a3a24');
      px(ctx, 3, B - 26, 2, 20, '#5a3a24');                 // string poles
      px(ctx, W16 - 5, B - 26, 2, 20, '#5a3a24');
      px(ctx, 4, B - 25, W16 - 8, 1, '#4a3a2a');            // the line
      const LCOLS = ['#e05030', '#e8b830', '#e05030', '#3fb0a0'];
      LCOLS.forEach((c, i2) => {
        const lx = 7 + i2 * 6;
        px(ctx, lx, B - 24, 4, 5, c);                       // paper lanterns
        px(ctx, lx + 1, B - 23, 2, 3, shade(c, 30));
        px(ctx, lx + 1, B - 25, 2, 1, '#4a3a2a');
        px(ctx, lx + 1, B - 19, 2, 1, '#ffd75e');           // tassel glow
      });
      px(ctx, 6, B - 12, 8, 6, '#c43a2a');                  // stacked lanterns for sale
      px(ctx, 7, B - 11, 6, 2, '#e86a4a');
      px(ctx, 15, B - 11, 6, 5, '#e8b830');
      px(ctx, 16, B - 10, 4, 2, '#ffe066');
      px(ctx, W16 - 10, B - 13, 7, 7, '#3a5a70');           // launch basin
      px(ctx, W16 - 9, B - 12, 5, 5, '#8fd0e8');
      px(ctx, W16 - 8, B - 11, 2, 2, '#ffd75e');            // one already glowing afloat
      break;
    }
    case 'colossus': {                         // base camp: tents, rope line, summit sign
      sh2(ctx, W16, B);
      px(ctx, 2, B - 16, 12, 12, '#c43a2a');                // expedition tent
      px(ctx, 3, B - 15, 10, 2, '#e05a4a');
      px(ctx, 6, B - 11, 4, 7, '#5a1f16');                  // tent mouth
      px(ctx, 1, B - 17, 14, 2, '#8a2a1e');                 // ridge pole line
      px(ctx, 17, B - 12, 9, 8, '#e8e2d4');                 // supply tent
      px(ctx, 18, B - 11, 7, 2, '#f4f0e6');
      px(ctx, 20, B - 8, 3, 4, '#8a8478');
      px(ctx, W16 - 16, B - 10, 6, 6, '#6a5038');           // crates + coiled rope
      px(ctx, W16 - 15, B - 9, 4, 2, '#8a6034');
      px(ctx, W16 - 9, B - 8, 5, 4, '#a5793f');
      px(ctx, W16 - 8, B - 7, 3, 2, '#e8d49a');
      px(ctx, 28, B - 26, 2, 22, '#5a3a24');                // signpost to the summit
      px(ctx, 24, B - 26, 10, 4, '#e8d49a');
      px(ctx, 25, B - 25, 5, 1, '#8a6034'); px(ctx, 25, B - 24, 7, 1, '#8a6034');
      px(ctx, 33, B - 25, 2, 2, '#c43a2a');                 // arrow up
      px(ctx, W16 - 4, B - 30, 1, 26, '#5a5652');           // prayer-flag mast
      const FLAGC = ['#c43a2a', '#e8b830', '#3f6ac8', '#4f9c5e', '#e8e2d4'];
      FLAGC.forEach((c, i2) => px(ctx, W16 - 12 + i2 * 2, B - 29 + (i2 % 2), 2, 2, c));
      break;
    }
    case 'nightmarket': {                      // paper-lantern stall, shuttered by day
      sh2(ctx, W16, B);
      px(ctx, 2, B - 24, W16 - 4, 5, '#2a2438');            // indigo awning
      px(ctx, 2, B - 24, W16 - 4, 1, '#3a3452');
      for (let s = 3; s < W16 - 4; s += 6) px(ctx, s, B - 20, 3, 2, '#e8b830');  // gold trim
      px(ctx, 3, B - 19, 2, 14, '#5a3a24'); px(ctx, W16 - 5, B - 19, 2, 14, '#5a3a24'); // posts
      px(ctx, 5, B - 12, W16 - 10, 7, '#6a4a28');           // counter
      px(ctx, 5, B - 12, W16 - 10, 2, '#8a6034');
      px(ctx, 7, B - 10, 4, 3, '#c43a2a');                  // crates of wares
      px(ctx, 12, B - 10, 4, 3, '#3fb0a0');
      px(ctx, 17, B - 10, 4, 3, '#8a70c0');
      px(ctx, 6, B - 17, 3, 4, '#e05030');                  // hanging lanterns
      px(ctx, 7, B - 13, 1, 1, '#ffd75e');
      px(ctx, W16 - 9, B - 17, 3, 4, '#e8b830');
      px(ctx, W16 - 8, B - 13, 1, 1, '#ffd75e');
      px(ctx, (W16 >> 1) - 2, B - 18, 5, 5, '#16121e');     // shadowed sign
      px(ctx, (W16 >> 1) - 1, B - 17, 3, 3, '#ff6be0');     // glowing character
      break;
    }
    case 'homingpost': {                       // dovecote loft tower with wheeling homers
      sh2(ctx, W16, B);
      px(ctx, (W16 >> 1) - 8, B - 14, 16, 12, '#8a8478');   // stone base
      px(ctx, (W16 >> 1) - 8, B - 14, 16, 2, '#a8a094');
      px(ctx, (W16 >> 1) - 6, B - 30, 12, 16, '#e8e2d4');   // whitewashed loft
      px(ctx, (W16 >> 1) - 6, B - 30, 12, 1, '#f4f0e6');
      for (let r = 0; r < 2; r++) for (let c2 = 0; c2 < 3; c2++) {
        px(ctx, (W16 >> 1) - 5 + c2 * 4, B - 27 + r * 5, 3, 3, '#3a2a30');   // pigeonholes
      }
      px(ctx, (W16 >> 1) - 7, B - 33, 14, 3, '#c43a2a');    // red cap roof
      px(ctx, (W16 >> 1) - 5, B - 35, 10, 2, '#8a2a1e');
      px(ctx, (W16 >> 1) - 1, B - 38, 2, 3, '#5a3a24');     // weathervane
      px(ctx, (W16 >> 1) + 1, B - 38, 3, 1, '#e8b830');
      px(ctx, (W16 >> 1) - 4, B - 24, 2, 2, '#8a94a0');     // a homer at its hole
      px(ctx, (W16 >> 1) + 3, B - 19, 2, 2, '#b8bcc0');
      px(ctx, 2, B - 8, 5, 6, '#6a4a28');                   // race-day ledger stand
      px(ctx, 2, B - 9, 5, 2, '#8a6034');
      px(ctx, 3, B - 7, 3, 2, '#e8d49a');
      px(ctx, W16 - 7, B - 7, 5, 5, '#8a6034');             // seed sacks
      px(ctx, W16 - 6, B - 8, 3, 2, '#d9c49a');
      break;
    }
    default:
      // No prop art for this game — never spawn one in the world. A grey
      // placeholder slab reads as a rendering bug and leaves an invisible
      // solid band above it, so draw nothing and say so loudly instead.
      console.warn(`[luckland] no world prop drawn for game "${game}" — remove it from EVENT_TYPES`);
      break;
  }
}

/* ============================================================
   Lucklian sprites — 24x24 side-view creatures, one archetype
   painter per body plan, coloured per species. Silhouette
   variants back the "seen but never caught" Lucklipedia cards.
   ============================================================ */
const LK_SIZE = 24;
const lkCache = new Map();

export function getLucklianSprite(def, sil = false) {
  const key = `${def.id}:${sil ? 's' : 'c'}`;
  let cv = lkCache.get(key);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = LK_SIZE; cv.height = LK_SIZE;
    const ctx = cv.getContext('2d');
    drawLucklian(ctx, def);
    outlinePass(ctx);
    if (sil) {
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = '#20242e';
      ctx.fillRect(0, 0, LK_SIZE, LK_SIZE);
      ctx.globalCompositeOperation = 'source-over';
    }
    lkCache.set(key, cv);
  }
  return cv;
}

/* dark contour around every painted pixel — makes small pixel
   creatures read as one connected body instead of loose rects */
function outlinePass(ctx) {
  const img = ctx.getImageData(0, 0, LK_SIZE, LK_SIZE);
  const d = img.data;
  const solid = (x, y) => x >= 0 && y >= 0 && x < LK_SIZE && y < LK_SIZE && d[(y * LK_SIZE + x) * 4 + 3] > 40;
  const out = [];
  for (let y = 0; y < LK_SIZE; y++) for (let x = 0; x < LK_SIZE; x++) {
    if (solid(x, y)) continue;
    if (solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1)) out.push([x, y]);
  }
  for (const [x, y] of out) {
    const i = (y * LK_SIZE + x) * 4;
    d[i] = 24; d[i + 1] = 20; d[i + 2] = 32; d[i + 3] = 210;
  }
  ctx.putImageData(img, 0, 0);
}

function drawLucklian(ctx, def) {
  const [A, B2, C] = def.c;
  const P = (x, y, w, h, c) => px(ctx, x, y, w, h, c);
  const eye = (x, y) => { P(x, y, 2, 2, '#181420'); P(x + 1, y, 1, 1, '#f8f8ff'); };
  // soft ground shadow (below the outline threshold, so it stays soft)
  ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.fillRect(4, LK_SIZE - 3, LK_SIZE - 8, 2);

  // rounded horizontal capsule — the workhorse body mass
  const capsule = (x, y, w, h, c) => {
    P(x + 1, y, w - 2, h, c);
    P(x, y + 1, w, h - 2, c);
  };

  switch (def.a) {
    case 'quad': // hooved walker: one connected mass, head raised left
      capsule(6, 9, 13, 8, A);
      P(4, 4, 5, 9, A);                            // neck up
      capsule(2, 2, 7, 5, A);                      // head
      P(2, 0, 2, 3, A); P(6, 0, 2, 3, A);          // ears
      P(7, 15, 2, 6, A); P(16, 15, 2, 6, A);       // outer legs
      P(10, 16, 2, 5, B2); P(13, 16, 2, 5, B2);    // inner legs
      P(7, 20, 2, 1, C); P(16, 20, 2, 1, C);       // hooves
      P(7, 9, 12, 2, B2);                          // dorsal saddle
      P(18, 11, 3, 2, B2);                         // tail
      P(8, 15, 9, 2, B2);                          // belly
      eye(3, 4);
      break;
    case 'hare': // sitting upright, big ears
      capsule(6, 11, 12, 9, A);                    // haunches
      capsule(5, 6, 8, 8, A);                      // head/chest
      P(5, 0, 3, 8, A); P(10, 0, 3, 8, A);         // tall ears
      P(6, 1, 1, 6, C); P(11, 1, 1, 6, C);         // ear insides
      P(7, 16, 4, 3, B2);                          // belly
      P(16, 12, 4, 4, B2);                         // puff tail
      P(6, 19, 4, 2, A); P(12, 19, 4, 2, A);       // feet
      eye(6, 8);
      break;
    case 'deer': // standing cervid with antler rack
      capsule(7, 9, 12, 7, A);
      P(5, 4, 4, 8, A);                            // neck
      capsule(3, 2, 7, 5, A);                      // head
      P(8, 15, 2, 6, A); P(16, 15, 2, 6, A);       // legs
      P(11, 16, 2, 5, B2); P(14, 16, 2, 5, B2);
      P(3, 0, 1, 3, C); P(1, 0, 3, 1, C); P(5, 0, 1, 2, C);   // left antler
      P(8, 0, 1, 3, C); P(8, 0, 3, 1, C); P(10, 1, 1, 2, C);  // right antler
      P(8, 9, 10, 2, B2);                          // mantle
      P(18, 10, 2, 2, B2);                         // tail
      eye(4, 4);
      break;
    case 'feline': // crouched cat, tail up
      capsule(5, 11, 14, 7, A);
      capsule(3, 6, 8, 7, A);                      // head
      P(3, 4, 2, 3, A); P(9, 4, 2, 3, A);          // pointed ears
      P(18, 5, 3, 8, A); P(19, 3, 2, 4, A);        // raised tail
      P(6, 17, 3, 4, A); P(15, 17, 3, 4, A);       // legs
      P(4, 11, 6, 2, B2);                          // chest ruff
      P(8, 12, 2, 2, C); P(12, 13, 2, 2, C); P(15, 12, 2, 2, C); // markings
      eye(4, 8);
      break;
    case 'fox': // perky ears, brush tail
      capsule(6, 12, 12, 6, A);
      capsule(3, 7, 8, 6, A);                      // head
      P(2, 10, 3, 3, B2);                          // muzzle
      P(3, 3, 3, 5, A); P(8, 3, 3, 5, A);          // big ears
      P(4, 4, 1, 3, C); P(9, 4, 1, 3, C);
      P(16, 9, 6, 6, A); P(20, 8, 2, 3, B2);       // brush tail + pale tip
      P(7, 17, 2, 4, A); P(14, 17, 2, 4, A);       // legs
      P(7, 16, 10, 2, B2);                         // belly
      eye(4, 9);
      break;
    case 'rodent': // plump sitter, upright tail
      capsule(6, 10, 12, 10, A);
      capsule(4, 7, 8, 8, A);                      // head merged in
      P(4, 4, 3, 4, B2); P(9, 4, 3, 4, B2);        // round ears
      P(3, 12, 2, 2, B2);                          // muzzle
      P(7, 16, 9, 3, B2);                          // belly
      P(17, 6, 3, 8, C); P(18, 3, 3, 4, C);        // upright tail
      P(6, 19, 3, 2, A); P(13, 19, 3, 2, A);       // feet
      eye(5, 9);
      break;
    case 'mole': // low wedge digger with claws
      capsule(3, 11, 18, 9, A);
      P(1, 13, 4, 5, A); P(1, 15, 2, 2, B2);       // shovel snout
      P(4, 16, 16, 3, B2);                         // belly plates
      P(6, 18, 4, 3, C); P(14, 18, 4, 3, C);       // huge claws
      P(5, 11, 14, 2, B2);                         // armor seam
      P(9, 13, 2, 1, C); P(13, 13, 2, 1, C);       // plate studs
      eye(3, 13);
      break;
    case 'beetle': // domed carapace, mandibles
      capsule(5, 9, 16, 10, A);
      P(6, 10, 14, 3, B2);                         // shell sheen
      P(12, 9, 1, 10, '#26202c');                  // wing seam
      capsule(2, 12, 6, 5, A);                     // head
      P(1, 11, 2, 2, C); P(1, 16, 2, 2, C);        // mandibles
      for (let i = 0; i < 3; i++) P(8 + i * 4, 18, 2, 3, '#26202c'); // legs
      eye(3, 13);
      break;
    case 'moth': // four broad wings, fuzzy body
      P(3, 5, 8, 8, B2); P(2, 6, 8, 6, B2);        // upper-left wing
      P(13, 5, 8, 8, B2); P(14, 6, 8, 6, B2);      // upper-right
      P(4, 13, 7, 6, B2); P(13, 13, 7, 6, B2);     // lower pair
      P(5, 7, 3, 3, C); P(16, 7, 3, 3, C);         // eyespots
      P(5, 15, 2, 2, A); P(17, 15, 2, 2, A);
      capsule(10, 6, 4, 13, A);                    // furry body
      P(9, 3, 2, 4, A); P(13, 3, 2, 4, A);         // antennae
      eye(10, 7);
      break;
    case 'bird': // plump songbird
      capsule(6, 9, 13, 8, A);
      capsule(4, 4, 8, 7, A);                      // head merged
      P(1, 7, 4, 2, C);                            // beak
      P(9, 11, 7, 4, B2);                          // folded wing
      P(18, 6, 4, 3, C); P(20, 4, 3, 3, C);        // tail plumes
      P(9, 17, 2, 4, '#26202c'); P(13, 17, 2, 4, '#26202c'); // legs
      P(7, 14, 8, 2, B2);                          // breast
      eye(5, 6);
      break;
    case 'raptor': // broad-winged hunter
      capsule(6, 7, 12, 9, A);
      capsule(2, 3, 7, 6, A);                      // head
      P(0, 6, 3, 2, C);                            // hooked beak
      P(8, 5, 9, 4, B2); P(12, 3, 6, 4, B2);       // wing over back
      P(17, 5, 5, 4, B2); P(20, 3, 3, 3, B2);      // spread tail
      P(8, 15, 3, 5, '#26202c'); P(13, 15, 3, 5, '#26202c'); // talons
      P(7, 12, 10, 3, B2);                         // breast band
      eye(3, 4);
      break;
    case 'owl': // upright disc-faced owl
      capsule(6, 10, 12, 11, A);
      capsule(5, 2, 14, 10, A);                    // big head
      P(7, 4, 4, 5, B2); P(13, 4, 4, 5, B2);       // facial disks
      P(5, 0, 3, 3, A); P(16, 0, 3, 3, A);         // ear tufts
      P(11, 7, 2, 3, C);                           // beak
      P(7, 14, 10, 4, B2);                         // breast
      P(8, 20, 3, 2, C); P(13, 20, 3, 2, C);       // talons
      eye(8, 5); eye(14, 5);
      break;
    case 'serpent': // coiled, head raised
      capsule(3, 15, 18, 5, A);                    // ground coil
      capsule(4, 10, 14, 5, A);                    // middle coil
      P(3, 4, 6, 8, A);                            // neck up
      capsule(2, 2, 8, 5, A);                      // head
      P(4, 0, 3, 2, C);                            // crest
      P(5, 16, 14, 2, B2); P(6, 11, 10, 2, B2);    // belly bands
      P(19, 13, 3, 4, C);                          // tail tip
      eye(3, 3);
      break;
    case 'lizard': // low reptile, curling tail
      capsule(4, 11, 15, 7, A);
      capsule(1, 9, 7, 6, A);                      // head
      P(6, 17, 3, 4, A); P(14, 17, 3, 4, A);       // legs
      P(18, 9, 4, 4, A); P(20, 6, 3, 4, A);        // curling tail
      P(6, 9, 11, 2, C);                           // dorsal fins
      P(5, 15, 13, 2, B2);                         // belly
      eye(2, 10);
      break;
    case 'tortoise': // domed shell, head out
      capsule(5, 6, 15, 11, A);                    // dome
      P(6, 8, 13, 4, B2);                          // shell band
      P(8, 6, 2, 11, A); P(14, 6, 2, 11, A);       // ridges
      capsule(1, 12, 6, 5, C);                     // head + neck
      P(6, 17, 4, 3, C); P(15, 17, 4, 3, C);       // legs
      eye(2, 13);
      break;
    case 'toad': // squat wide toad
      capsule(4, 10, 17, 10, A);
      P(4, 7, 6, 5, A); P(14, 7, 6, 5, A);         // brow ridges
      P(6, 15, 13, 4, B2);                         // throat sac
      P(3, 18, 5, 3, A); P(17, 18, 5, 3, A);       // splayed legs
      P(9, 12, 2, 1, C); P(14, 12, 2, 1, C);       // warts
      eye(5, 8); eye(15, 8);
      break;
    case 'fish': // side-view swimmer
      capsule(4, 8, 14, 9, A);
      P(2, 10, 4, 5, A);                           // face taper
      P(8, 5, 6, 4, C);                            // dorsal fin
      P(17, 6, 4, 5, C); P(18, 12, 4, 5, C);       // forked tail
      P(9, 16, 4, 3, C);                           // pelvic fin
      P(5, 12, 12, 3, B2);                         // belly
      P(7, 10, 10, 1, C);                          // lateral stripe
      eye(3, 10);
      break;
    case 'ray': // broad diamond glider
      P(9, 5, 6, 3, A);
      P(5, 8, 14, 3, A); P(2, 11, 20, 4, A);       // wingspan
      P(6, 15, 12, 3, A); P(9, 18, 6, 2, A);
      P(10, 8, 4, 10, B2);                         // mantle
      P(19, 15, 4, 2, C); P(22, 13, 1, 3, C);      // whip tail
      P(5, 12, 2, 2, C); P(17, 12, 2, 2, C);       // wing spots
      eye(9, 9); eye(13, 9);
      break;
    case 'ceph': // shelled cephalopod
      capsule(6, 2, 12, 9, B2);                    // spiral shell
      P(8, 4, 8, 5, A); P(10, 5, 4, 3, B2);        // spiral bands
      capsule(5, 10, 14, 6, A);                    // mantle/face
      for (let i = 0; i < 5; i++) P(5 + i * 3, 15, 2, 5 + (i % 2) * 2, A); // tentacles
      for (let i = 0; i < 5; i++) P(5 + i * 3, 19 + (i % 2) * 2, 2, 2, C); // lit tips
      eye(7, 11); eye(14, 11);
      break;
    case 'seal': // lounging seal
      capsule(3, 10, 17, 8, A);
      capsule(2, 7, 8, 7, A);                      // head merged
      P(0, 11, 3, 1, C); P(0, 13, 3, 1, C);        // whiskers
      P(19, 10, 3, 4, A); P(20, 8, 3, 3, A);       // tail flukes
      P(5, 15, 13, 3, B2);                         // belly
      P(11, 10, 3, 2, B2); P(15, 12, 2, 2, B2);    // mottling
      P(8, 17, 4, 3, A);                           // fore flipper
      eye(3, 9);
      break;
    case 'crab': // wide crab with claws up
      capsule(6, 10, 12, 8, A);
      P(7, 11, 10, 4, B2);                         // shell glow
      P(2, 6, 4, 4, C); P(18, 6, 4, 4, C);         // raised claws
      P(4, 9, 2, 3, A); P(18, 9, 2, 3, A);         // arms
      for (let i = 0; i < 3; i++) { P(5 + i * 2, 17, 2, 4, A); P(13 + i * 2, 17, 2, 4, A); } // legs
      eye(9, 11); eye(13, 11);
      break;
    case 'bat': // spread membrane wings
      P(1, 6, 9, 7, B2); P(2, 12, 6, 3, B2);       // left wing
      P(14, 6, 9, 7, B2); P(16, 12, 6, 3, B2);     // right wing
      P(2, 7, 8, 1, A); P(14, 7, 8, 1, A);         // wing fingers
      capsule(9, 7, 6, 11, A);                     // body
      P(8, 3, 3, 5, A); P(13, 3, 3, 5, A);         // ears
      P(10, 14, 4, 2, B2);
      P(4, 9, 2, 2, C); P(18, 9, 2, 2, C);         // shimmer
      eye(10, 9);
      break;
    case 'primate': // seated ape, long arms
      capsule(7, 9, 11, 10, A);
      capsule(6, 2, 10, 8, A);                     // head
      P(8, 5, 7, 4, B2);                           // face patch
      P(4, 9, 3, 9, A); P(17, 9, 3, 9, A);         // long arms
      P(4, 17, 3, 3, B2); P(17, 17, 3, 3, B2);     // hands
      P(9, 13, 7, 4, B2);                          // chest
      P(8, 19, 3, 2, A); P(13, 19, 3, 2, A);       // feet
      eye(9, 5);
      break;
    case 'dragon': // winged serpent-dragon
      capsule(3, 12, 17, 5, A);                    // long body
      P(2, 6, 6, 8, A);                            // neck
      capsule(1, 3, 8, 5, A);                      // head
      P(2, 1, 2, 3, C); P(6, 1, 2, 3, C);          // horns
      P(9, 4, 8, 7, B2); P(14, 2, 7, 7, B2);       // big wings
      P(19, 9, 3, 5, A); P(21, 6, 2, 4, C);        // tail + tip
      P(5, 16, 3, 4, A); P(13, 16, 3, 4, A);       // legs
      P(5, 15, 13, 2, C);                          // belly scutes
      eye(2, 4);
      break;
    case 'ram': // shaggy mountain goat, curled horns
      capsule(6, 9, 13, 8, A);
      P(7, 9, 11, 3, B2);                          // shaggy mantle
      P(4, 5, 5, 8, A);                            // neck
      capsule(2, 3, 7, 5, A);                      // head
      P(1, 6, 2, 3, B2);                           // beard
      P(2, 0, 3, 4, C); P(0, 1, 3, 3, C); P(1, 3, 2, 2, C);   // curled horn
      P(7, 0, 2, 3, C); P(8, 2, 2, 2, C);          // second horn
      P(7, 15, 2, 6, A); P(16, 15, 2, 6, A);       // legs
      P(10, 16, 2, 5, B2); P(13, 16, 2, 5, B2);
      P(7, 20, 2, 1, '#26202c'); P(16, 20, 2, 1, '#26202c'); // hooves
      P(18, 10, 2, 2, B2);                         // tail
      eye(4, 5);
      break;
    case 'wisp': // luminous core with wings
      P(8, 7, 8, 8, C);                            // core
      P(9, 8, 6, 6, B2); P(10, 9, 4, 4, '#ffffff');
      P(2, 4, 6, 5, B2); P(16, 4, 6, 5, B2);       // upper wings
      P(3, 11, 5, 5, B2); P(16, 11, 5, 5, B2);     // lower wings
      P(6, 2, 2, 2, C); P(16, 2, 2, 2, C);         // motes
      P(11, 15, 2, 6, B2); P(10, 19, 1, 2, C);     // trailing filament
      break;
    default:
      capsule(5, 7, 14, 12, A); eye(8, 11);
      break;
  }
  if (def.glow) { // neon species carry running lights
    for (let i = 0; i < 4; i++) px(ctx, 6 + i * 4, 13 + (i % 2), 1, 1, C);
    px(ctx, 11, 4, 1, 1, C); px(ctx, 18, 8, 1, 1, C);
  }
}

/* ============================================================
   Performing animal & vessel sheets — 4-dir x 2-frame gallop
   sheets for track Lucklians (optionally mounted or hitched to
   a chariot), a hunting big cat, and crewed Roman galleys.
   Layout mirrors the character sheets: cols = dirs
   (0 down, 1 left, 2 right, 3 up), rows = frames.
   ============================================================ */

export function makeCourserSprite(pal, opts = {}) {
  const { body = '#8a5a2a', mane = '#4a3222', accent = '#e8dcc0' } = pal;
  const CW = opts.chariot ? 34 : 24, CH = 26;
  const cv = document.createElement('canvas');
  cv.width = CW * 4; cv.height = CH * 2;
  const ctx = cv.getContext('2d');
  const dark = shade(body, -30), hi = shade(body, 22);

  for (let dir = 0; dir < 4; dir++) {
    for (let f = 0; f < 2; f++) {
      const ox = dir * CW, oy = f * CH;
      const X = (x, w = 1) => (dir === 1 ? ox + CW - x - w : ox + x);
      const P = (x, y, w, h, c) => px(ctx, X(x, w), oy + y, w, h, c);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(ox + 4, oy + CH - 3, CW - 8, 2);
      const bob = f === 1 ? 1 : 0;

      if (dir === 1 || dir === 2) {
        /* ---- side gallop (drawn facing right; dir 1 mirrors) ---- */
        const bx = opts.chariot ? 12 : 3;
        P(bx, 10 - bob, 15, 8, body);                       // barrel
        P(bx + 1, 10 - bob, 13, 2, hi);
        P(bx + 12, 5 - bob, 5, 8, body);                    // neck
        P(bx + 13, 2 - bob, 7, 5, body);                    // head
        P(bx + 18, 4 - bob, 2, 2, dark);                    // muzzle
        P(bx + 14, 0 - bob + 1, 2, 2, mane);                // ears
        P(bx + 12, 3 - bob, 2, 8, mane);                    // mane
        P(bx + 13, 3 - bob, 1, 1, '#181420');               // eye
        P(bx - 1, 9 - bob, 3, 4, mane);                     // tail
        P(bx - 2, 12 - bob, 2, 3, mane);
        if (f === 0) {                                       // legs extended
          P(bx + 1, 18, 3, 5, dark); P(bx + 12, 18, 3, 5, dark);
          P(bx - 1, 20, 3, 3, body); P(bx + 15, 19, 3, 4, body);
        } else {                                             // legs gathered
          P(bx + 3, 18, 3, 5, body); P(bx + 10, 18, 3, 5, body);
          P(bx + 5, 20, 3, 3, dark); P(bx + 8, 20, 3, 3, dark);
        }
        P(bx + 3, 17, 10, 1, accent);                       // belly line
        if (opts.rider) {                                    // mounted rider
          const rx = bx + 5;
          P(rx, 3 - bob, 4, 6, opts.rider === 'roman' ? '#c8ccd8' : '#5a76c8');   // torso
          P(rx + 1, 0 - bob, 3, 3, '#f0c8a0');              // head
          if (opts.rider === 'roman') { P(rx, -1 - bob + 1, 5, 1, '#c43a2a'); P(rx + 1, -1 - bob, 3, 1, '#c43a2a'); } // crest
          else { P(rx - 1, 0 - bob, 6, 1, '#8a6034'); P(rx, -1 - bob + 1, 4, 1, '#8a6034'); }                        // hat
          P(rx + 3, 8 - bob, 4, 2, opts.rider === 'roman' ? '#c8ccd8' : '#40354a'); // leg
        }
        if (opts.chariot) {                                  // cart + charioteer behind
          P(1, 8 - bob, 9, 9, opts.teamColor || '#c04a4a'); // cab
          P(2, 9 - bob, 7, 2, shade(opts.teamColor || '#c04a4a', 25));
          P(3, 3 - bob, 4, 6, '#c8ccd8');                   // charioteer torso
          P(4, 0 - bob, 3, 3, '#f0c8a0');
          P(3, 0 - bob, 5, 1, '#c43a2a');                   // crest
          ctx.save();                                        // wheel (drawn unmirrored ok)
          const wx = X(3, 6);
          px(ctx, wx, oy + 15, 6, 6, '#5a3a24');
          px(ctx, wx + 1, oy + 16, 4, 4, '#8a6034');
          px(ctx, wx + 2, oy + 15 + (f ? 1 : 3), 2, 1, '#3a2a18');
          ctx.restore();
          P(10, 12 - bob, 3, 2, '#5a3a24');                 // yoke pole
        }
      } else if (dir === 0) {
        /* ---- front view (running at camera) ---- */
        const cx = CW / 2;
        px(ctx, ox + cx - 4, oy + 2 - bob, 8, 7, body);      // head
        px(ctx, ox + cx - 5, oy + 0 - bob, 2, 3, mane); px(ctx, ox + cx + 3, oy + 0 - bob, 2, 3, mane);
        px(ctx, ox + cx - 3, oy + 4 - bob, 2, 2, '#181420'); px(ctx, ox + cx + 1, oy + 4 - bob, 2, 2, '#181420');
        px(ctx, ox + cx - 2, oy + 7 - bob, 4, 2, dark);      // muzzle
        px(ctx, ox + cx - 5, oy + 9 - bob, 10, 9, body);     // chest
        px(ctx, ox + cx - 5, oy + 9 - bob, 2, 9, hi);
        px(ctx, ox + cx - 1, oy + 9 - bob, 2, 6, accent);    // blaze
        px(ctx, ox + cx - 5, oy + 18, 3, f ? 5 : 3, dark);   // legs alternate
        px(ctx, ox + cx + 2, oy + 18, 3, f ? 3 : 5, dark);
        if (opts.rider) {
          px(ctx, ox + cx - 2, oy + 6 - bob, 5, 4, opts.rider === 'roman' ? '#c8ccd8' : '#5a76c8');
          px(ctx, ox + cx - 1, oy + 3 - bob, 3, 3, '#f0c8a0');
          px(ctx, ox + cx - 1, oy + 2 - bob, 3, 1, opts.rider === 'roman' ? '#c43a2a' : '#8a6034');
        }
      } else {
        /* ---- back view (running away) ---- */
        const cx = CW / 2;
        px(ctx, ox + cx - 5, oy + 8 - bob, 10, 10, body);    // rump
        px(ctx, ox + cx - 5, oy + 8 - bob, 10, 2, hi);
        px(ctx, ox + cx - 1, oy + 10 - bob, 2, 7, mane);     // tail
        px(ctx, ox + cx - 1, oy + 16 - bob, 2, 4, mane);
        px(ctx, ox + cx - 3, oy + 3 - bob, 6, 6, body);      // head over back
        px(ctx, ox + cx - 4, oy + 1 - bob, 2, 3, mane); px(ctx, ox + cx + 2, oy + 1 - bob, 2, 3, mane);
        px(ctx, ox + cx - 5, oy + 18, 3, f ? 5 : 3, dark);
        px(ctx, ox + cx + 2, oy + 18, 3, f ? 3 : 5, dark);
        if (opts.rider) {
          px(ctx, ox + cx - 2, oy + 4 - bob, 5, 5, opts.rider === 'roman' ? '#c8ccd8' : '#5a76c8');
          px(ctx, ox + cx - 1, oy + 1 - bob, 3, 3, '#4a3222');
        }
      }
    }
  }
  cv.cellW = CW; cv.cellH = CH;
  return cv;
}

export function makeBigCatSprite(pal) {
  const { body = '#6a2a38', mane = '#e8dcc0', accent = '#c49038' } = pal;
  const CW = 26, CH = 22;
  const cv = document.createElement('canvas');
  cv.width = CW * 4; cv.height = CH * 2;
  const ctx = cv.getContext('2d');
  const dark = shade(body, -28), hi = shade(body, 20);
  for (let dir = 0; dir < 4; dir++) for (let f = 0; f < 2; f++) {
    const ox = dir * CW, oy = f * CH;
    const X = (x, w = 1) => (dir === 1 ? ox + CW - x - w : ox + x);
    const P = (x, y, w, h, c) => px(ctx, X(x, w), oy + y, w, h, c);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(ox + 4, oy + CH - 3, CW - 8, 2);
    const bob = f === 1 ? 1 : 0;
    if (dir === 1 || dir === 2) {
      const stretch = f === 0 ? 2 : 0;                       // full-stretch vs gathered
      P(3 - stretch / 2, 9 - bob, 16 + stretch, 7, body);    // long body
      P(4, 9 - bob, 14, 2, hi);
      P(16, 5 - bob, 7, 6, body);                            // head
      P(21, 7 - bob, 2, 2, dark);                            // muzzle
      P(17, 3 - bob, 2, 2, body); P(20, 3 - bob, 2, 2, body); // ears
      P(17, 6 - bob, 2, 2, '#ffe066');                       // burning eye
      P(15, 5 - bob, 3, 7, mane);                            // mane/ruff
      P(-1 + 3, 8 - bob, 4, 2, body); P(0, 6 - bob, 3, 3, dark); // tail whipping
      if (f === 0) { P(2, 15, 3, 5, dark); P(17, 15, 3, 5, dark); P(0, 17, 3, 3, body); P(20, 16, 3, 4, body); }
      else { P(6, 15, 3, 5, body); P(13, 15, 3, 5, body); P(8, 17, 3, 3, dark); P(11, 17, 3, 3, dark); }
      P(6, 10, 2, 2, accent); P(11, 12, 2, 2, accent);       // rosettes
    } else if (dir === 0) {
      const cx = CW / 2;
      px(ctx, ox + cx - 5, oy + 3 - bob, 10, 8, body);
      px(ctx, ox + cx - 6, oy + 1 - bob, 3, 3, body); px(ctx, ox + cx + 3, oy + 1 - bob, 3, 3, body);
      px(ctx, ox + cx - 3, oy + 5 - bob, 2, 2, '#ffe066'); px(ctx, ox + cx + 1, oy + 5 - bob, 2, 2, '#ffe066');
      px(ctx, ox + cx - 1, oy + 8 - bob, 2, 2, dark);
      px(ctx, ox + cx - 5, oy + 10 - bob, 10, 3, mane);      // ruff
      px(ctx, ox + cx - 4, oy + 12 - bob, 8, 6, body);
      px(ctx, ox + cx - 4, oy + 17, 3, f ? 4 : 2, dark); px(ctx, ox + cx + 1, oy + 17, 3, f ? 2 : 4, dark);
    } else {
      const cx = CW / 2;
      px(ctx, ox + cx - 4, oy + 6 - bob, 8, 11, body);
      px(ctx, ox + cx - 4, oy + 6 - bob, 8, 2, hi);
      px(ctx, ox + cx - 3, oy + 2 - bob, 6, 5, body);
      px(ctx, ox + cx - 4, oy + 0 - bob, 2, 3, body); px(ctx, ox + cx + 2, oy + 0 - bob, 2, 3, body);
      px(ctx, ox + cx - 1, oy + 8 - bob, 2, 8, dark);        // tail
      px(ctx, ox + cx - 4, oy + 16, 3, f ? 5 : 3, dark); px(ctx, ox + cx + 1, oy + 16, 3, f ? 3 : 5, dark);
    }
  }
  cv.cellW = CW; cv.cellH = CH;
  return cv;
}

export function makeShipSprite(hull, sail) {
  const CW = 46, CH = 30;
  const cv = document.createElement('canvas');
  cv.width = CW * 2; cv.height = CH * 2;    // cols: 0 = facing right, 1 = facing left; rows: oar frames
  const ctx = cv.getContext('2d');
  const dark = shade(hull, -30), hi = shade(hull, 22);
  for (let face = 0; face < 2; face++) for (let f = 0; f < 2; f++) {
    const ox = face * CW, oy = f * CH;
    const X = (x, w = 1) => (face === 1 ? ox + CW - x - w : ox + x);
    const P = (x, y, w, h, c) => px(ctx, X(x, w), oy + y, w, h, c);
    // hull with curved bow (points right) and stern
    P(4, 17, 38, 7, hull);
    P(6, 24, 34, 2, dark);
    P(4, 17, 38, 2, hi);
    P(42, 18, 3, 4, '#c8ccd8');                             // bronze ram
    P(2, 15, 4, 4, hull); P(1, 13, 3, 3, dark);             // stern post curl
    // (the deck stays clear — live NPC crew walk it at runtime)
    P(3, 14, 3, 2, '#8a6034');                              // steering oar
    // mast + square sail
    P(22, 2, 2, 15, '#5a3a24');
    P(13, 3, 20, 9, sail);
    P(13, 3, 20, 2, shade(sail, 25));
    P(13, 11, 20, 1, shade(sail, -25));
    P(21, 5, 4, 5, dark);                                   // emblem
    // oars sweeping (frame-dependent angle)
    for (let i = 0; i < 5; i++) {
      const oxr = 9 + i * 7;
      if (f === 0) { P(oxr, 24, 2, 4, '#8a6034'); P(oxr - 1, 27, 3, 2, '#a5793f'); }
      else { P(oxr + 2, 24, 2, 3, '#8a6034'); P(oxr + 3, 26, 3, 2, '#a5793f'); }
    }
    // bow wake
    P(41, 24, 4, 2, 'rgba(220,240,250,0.5)');
  }
  cv.cellW = CW; cv.cellH = CH;
  return cv;
}

/* The Paradise Ferry — a broad-beamed passenger boat with a cabin,
   a smoking stack and a railed deck. Two facings, two wake frames. */
export function makeFerrySprite() {
  const CW = 40, CH = 26;
  const hull = '#7a4a28', cabin = '#e8e2d4', trim = '#c43a2a';
  const cv = document.createElement('canvas');
  cv.width = CW * 2; cv.height = CH * 2;   // cols: 0 right, 1 left; rows: wake frames
  const ctx = cv.getContext('2d');
  const dark = shade(hull, -30), hi = shade(hull, 22);
  for (let face = 0; face < 2; face++) for (let f = 0; f < 2; f++) {
    const ox = face * CW, oy = f * CH;
    const X = (x, w = 1) => (face === 1 ? ox + CW - x - w : ox + x);
    const P = (x, y, w, h, c) => px(ctx, X(x, w), oy + y, w, h, c);
    // hull with a raked bow to the right
    P(3, 14, 33, 7, hull);
    P(4, 21, 31, 2, dark);
    P(3, 14, 33, 2, hi);
    P(36, 15, 3, 5, hull);                          // bow point
    P(2, 13, 3, 3, dark);                           // stern curl
    P(4, 12, 30, 2, '#a5793f');                     // deck boards
    // railings along the deck
    for (let i = 0; i < 9; i++) P(5 + i * 3, 9, 1, 3, '#d9c49a');
    P(4, 8, 29, 1, '#d9c49a');
    // passenger cabin with lit windows
    P(9, 3, 16, 7, cabin);
    P(9, 3, 16, 1, '#f4f0e6');
    P(9, 9, 16, 1, shade(cabin, -22));
    P(11, 5, 3, 3, '#8fd0e8'); P(15, 5, 3, 3, '#8fd0e8'); P(19, 5, 3, 3, '#ffe066');
    P(9, 2, 16, 1, trim);                           // painted trim line
    // funnel + smoke puffs (drifting on the wake frame)
    P(26, 1, 4, 9, trim);
    P(26, 1, 4, 1, '#26202c');
    P(27, f === 0 ? -2 : -3, 2, 2, 'rgba(220,220,230,0.75)');
    P(29, f === 0 ? -4 : -6, 2, 2, 'rgba(220,220,230,0.45)');
    // life ring and a bollard
    P(6, 5, 3, 3, '#e8e2d4'); P(7, 6, 1, 1, trim);
    P(33, 10, 2, 2, '#5a3a24');
    // bow wave + churned wake astern
    P(36, 20, 4, 2, 'rgba(220,240,250,0.6)');
    if (f === 0) { P(0, 18, 3, 1, 'rgba(220,240,250,0.45)'); P(-2, 20, 3, 1, 'rgba(220,240,250,0.3)'); }
    else { P(0, 19, 4, 1, 'rgba(220,240,250,0.5)'); P(-3, 17, 3, 1, 'rgba(220,240,250,0.3)'); }
  }
  cv.cellW = CW; cv.cellH = CH;
  return cv;
}

export function makeDragonBoatSprite(team) {
  const CW = 42, CH = 22;
  const cv = document.createElement('canvas');
  cv.width = CW * 2; cv.height = CH * 2;    // cols: 0 = facing right, 1 = facing left; rows: paddle frames
  const ctx = cv.getContext('2d');
  const dark = shade(team, -30), hi = shade(team, 25);
  for (let face = 0; face < 2; face++) for (let f = 0; f < 2; f++) {
    const ox = face * CW, oy = f * CH;
    const X = (x, w = 1) => (face === 1 ? ox + CW - x - w : ox + x);
    const P = (x, y, w, h, c) => px(ctx, X(x, w), oy + y, w, h, c);
    // long low hull, painted in team colours with scale pattern
    P(2, 12, 36, 5, team);
    P(3, 16, 34, 2, dark);
    P(2, 12, 36, 1, hi);
    for (let s = 0; s < 8; s++) P(5 + s * 4, 14, 2, 1, dark);   // scales
    // dragon head prow (points right) with horns and barbels
    P(38, 8, 4, 6, team);
    P(40, 10, 2, 2, dark);                                 // snout
    P(38, 6, 2, 2, '#ffd75e');                             // horn
    P(39, 9, 1, 1, '#181420');                             // eye
    P(41, 13, 1, 3, '#e05030');                            // barbel
    // tall curled tail at the stern
    P(1, 7, 3, 6, team);
    P(0, 5, 3, 3, dark);
    // drummer's platform amidship-stern
    P(4, 9, 6, 3, '#8a6034');
    P(5, 7, 4, 2, '#5a3a24');                              // the drum
    P(5, 6, 4, 1, '#c43a2a');
    // paddles sweeping (frame-dependent)
    for (let i = 0; i < 5; i++) {
      const oxr = 11 + i * 5;
      if (f === 0) { P(oxr, 17, 1, 4, '#8a6034'); P(oxr - 1, 20, 3, 1, '#a5793f'); }
      else { P(oxr + 1, 17, 1, 3, '#8a6034'); P(oxr, 19, 3, 1, '#a5793f'); }
    }
    // bow wake
    P(38, 17, 4, 2, 'rgba(220,240,250,0.55)');
  }
  cv.cellW = CW; cv.cellH = CH;
  return cv;
}

/* ============================================================
   Interior furniture — game stations you walk into to play,
   and themed hall décor. Footprint-sized, like buildings.
   ============================================================ */
const stationCache = new Map();

export function getStationSprite(kind, w, h, v) {
  const key = `${kind}:${w}x${h}:${v}`;
  let cv = stationCache.get(key);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = w * CELL; cv.height = h * CELL;
    drawStation(cv.getContext('2d'), kind, cv.width, cv.height, v);
    stationCache.set(key, cv);
  }
  return cv;
}

function drawStation(ctx, kind, W16, B, v) {
  const sh = () => { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(2, B - 3, W16 - 4, 3); };
  switch (kind) {
    case 'slot': {                                // one-armed bandit pair
      sh();
      for (const ox of [1, W16 / 2 + 1]) {
        px(ctx, ox, B - 26, W16 / 2 - 3, 23, '#8a2a4a');       // cabinet
        px(ctx, ox + 1, B - 25, W16 / 2 - 5, 2, '#c04a6a');
        px(ctx, ox + 2, B - 21, W16 / 2 - 7, 6, '#0d0d16');    // reel window
        px(ctx, ox + 3, B - 20, 2, 4, '#ffe066'); px(ctx, ox + 6, B - 20, 2, 4, '#ff6be0'); px(ctx, ox + 9, B - 20, 2, 4, '#5eeaff');
        px(ctx, ox + 2, B - 13, W16 / 2 - 7, 3, '#f0c040');    // payline plate
        px(ctx, ox + W16 / 2 - 4, B - 24, 2, 8, '#c8ccd8');    // arm
        px(ctx, ox + W16 / 2 - 4, B - 26, 2, 2, '#e05a70');
        px(ctx, ox + 3, B - 8, W16 / 2 - 9, 2, '#2c2838');     // tray
      }
      break;
    }
    case 'pachinko': {                            // upright pin cabinet pair
      sh();
      for (const ox of [1, W16 / 2 + 1]) {
        px(ctx, ox, B - 27, W16 / 2 - 3, 24, '#2c2838');
        px(ctx, ox + 1, B - 26, W16 / 2 - 5, 18, '#3c5a8a');   // glass board
        for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
          px(ctx, ox + 3 + c * 3 + (r % 2), B - 24 + r * 4, 1, 1, '#f8f0ff');
        }
        px(ctx, ox + 1, B - 27, W16 / 2 - 5, 2, '#ff6be0');    // top lamp
        px(ctx, ox + 2, B - 7, W16 / 2 - 7, 3, '#f0c040');     // ball tray
      }
      break;
    }
    case 'table': {                               // green felt game table
      sh();
      px(ctx, 2, B - 18, W16 - 4, 13, '#5a3a24');              // table body
      px(ctx, 1, B - 20, W16 - 2, 6, '#2f7a44');               // felt top
      px(ctx, 2, B - 19, W16 - 4, 4, '#3d8a4c');
      px(ctx, 4, B - 18, 3, 2, '#f4f0e6'); px(ctx, 10, B - 19, 3, 2, '#e05a70'); // cards + chips
      px(ctx, W16 - 8, B - 18, 3, 2, '#f0c040');
      px(ctx, 3, B - 6, 2, 3, '#3a2a18'); px(ctx, W16 - 5, B - 6, 2, 3, '#3a2a18'); // legs
      break;
    }
    case 'wheel': {                               // wheel of fortune dais
      sh();
      px(ctx, W16 / 2 - 4, B - 8, 8, 5, '#5a3a24');            // pedestal
      const cx = W16 / 2, cy = B - 17;
      for (let a = 0; a < 10; a++) {
        const ang = (a / 10) * Math.PI * 2;
        px(ctx, Math.round(cx + Math.cos(ang) * 7) - 1, Math.round(cy + Math.sin(ang) * 7) - 1, 3, 3,
          a % 2 ? '#c04a4a' : '#f0c040');
      }
      px(ctx, cx - 2, cy - 2, 4, 4, '#e8e2d4');
      px(ctx, cx - 1, cy - 10, 2, 3, '#26202c');               // pointer
      break;
    }
    case 'board': {                               // race betting board
      sh();
      px(ctx, 2, B - 26, W16 - 4, 18, '#2c2838');              // big board
      px(ctx, 3, B - 25, W16 - 6, 16, '#1a2c1e');
      for (let r = 0; r < 4; r++) {
        px(ctx, 5, B - 23 + r * 4, 8, 2, ['#ffe066', '#5eeaff', '#e05a70', '#8dff6b'][r]); // runners
        px(ctx, W16 - 10, B - 23 + r * 4, 5, 2, '#c8ccd8');    // odds
      }
      px(ctx, 4, B - 7, W16 - 8, 3, '#5a3a24');                // counter
      break;
    }
    case 'shrine': {                              // luck altar with offerings
      sh();
      px(ctx, 3, B - 10, W16 - 6, 7, '#8a6a42');               // altar block
      px(ctx, 3, B - 10, W16 - 6, 2, '#c8a060');
      px(ctx, W16 / 2 - 3, B - 20, 6, 10, '#a05a28');          // idol
      px(ctx, W16 / 2 - 2, B - 23, 4, 4, '#f0c040');           // gilded head
      px(ctx, 5, B - 13, 2, 3, '#e05a70'); px(ctx, W16 - 7, B - 13, 2, 3, '#5eeaff'); // candles
      px(ctx, 5, B - 14, 1, 1, '#ffe066'); px(ctx, W16 - 7, B - 14, 1, 1, '#ffe066');
      break;
    }
    case 'ring': {                                // full boxing ring — canvas, ropes, posts
      px(ctx, 0, 4, W16, B - 4, '#3a5a9a');                    // apron
      px(ctx, 2, 6, W16 - 4, B - 12, '#6a8ac8');               // canvas
      px(ctx, 3, 7, W16 - 6, B - 14, '#7a9ad8');
      px(ctx, W16 / 2 - 8, B / 2 - 6, 16, 12, '#c04a4a');      // centre logo
      px(ctx, W16 / 2 - 6, B / 2 - 4, 12, 8, '#e8b830');
      for (const ry of [8, 14]) {                              // ropes
        px(ctx, 1, ry, W16 - 2, 2, '#e8e2d4');
        px(ctx, 1, ry + B - 26, W16 - 2, 2, '#c04a4a');
      }
      for (const [cx2, cy2] of [[1, 4], [W16 - 4, 4], [1, B - 8], [W16 - 4, B - 8]]) {
        px(ctx, cx2, cy2, 3, 8, '#26202c');                    // corner posts
        px(ctx, cx2, cy2, 3, 2, '#f0c040');
      }
      break;
    }
    case 'kiosk': {                               // bookie kiosk with odds board
      sh();
      px(ctx, 2, B - 24, W16 - 4, 10, '#2c2838');              // odds board
      for (let r = 0; r < 3; r++) {
        px(ctx, 4, B - 22 + r * 3, 8, 2, ['#ffe066', '#5eeaff', '#8dff6b'][r]);
        px(ctx, W16 - 12, B - 22 + r * 3, 7, 2, '#c8ccd8');
      }
      px(ctx, 2, B - 13, W16 - 4, 9, '#5a3a24');               // counter
      px(ctx, 2, B - 13, W16 - 4, 2, '#8a6034');
      px(ctx, 4, B - 10, 4, 3, '#e8d49a');                     // ticket stack
      px(ctx, W16 - 9, B - 10, 4, 3, '#f0c040');               // coin tray
      break;
    }
    default: {                                    // 'counter' — a game counter with a keeper's setup
      sh();
      px(ctx, 2, B - 14, W16 - 4, 10, '#5a3a24');              // counter
      px(ctx, 2, B - 14, W16 - 4, 2, '#8a6034');
      px(ctx, 4, B - 22, 6, 7, '#c8a060');                     // sign
      px(ctx, 5, B - 21, 4, 4, '#5a3a24');
      px(ctx, W16 - 10, B - 18, 5, 4, '#e8d49a');              // prizes
      px(ctx, W16 - 9, B - 17, 3, 2, '#f0c040');
      break;
    }
  }
}

const decorCache = new Map();

export function getDecorSprite(kind, w, h, v) {
  const key = `${kind}:${w}x${h}:${v}`;
  let cv = decorCache.get(key);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = w * CELL; cv.height = h * CELL;
    drawDecor(cv.getContext('2d'), kind, cv.width, cv.height, v);
    decorCache.set(key, cv);
  }
  return cv;
}

function drawDecor(ctx, kind, W16, B, v) {
  switch (kind) {
    case 'bar': {                                 // long bar with bottles and taps
      px(ctx, 1, B - 16, W16 - 2, 12, '#5a3a24');
      px(ctx, 1, B - 16, W16 - 2, 3, '#8a6034');
      for (let i = 0; i < Math.floor(W16 / 9); i++) {
        px(ctx, 4 + i * 9, B - 23, 2, 6, ['#3d8a4c', '#c04a4a', '#d9a545'][i % 3]);   // bottles
        px(ctx, 4 + i * 9, B - 24, 2, 1, '#26202c');
      }
      px(ctx, W16 - 8, B - 20, 2, 5, '#c8ccd8');               // tap
      px(ctx, 3, B - 12, 3, 2, '#f0c040');                     // mug
      break;
    }
    case 'piano': {
      px(ctx, 2, B - 20, W16 - 4, 16, '#241a20');
      px(ctx, 3, B - 12, W16 - 6, 3, '#f4f0e6');               // keys
      for (let k = 5; k < W16 - 5; k += 3) px(ctx, k, B - 12, 1, 2, '#26202c');
      px(ctx, 4, B - 18, W16 - 8, 3, '#3a2a30');               // open lid
      break;
    }
    case 'plant': {
      px(ctx, W16 / 2 - 3, B - 6, 6, 4, '#a05a28');            // pot
      px(ctx, W16 / 2 - 5, B - 18, 10, 10, '#2f7a44');
      px(ctx, W16 / 2 - 3, B - 21, 6, 5, '#3d8a4c');
      px(ctx, W16 / 2 - 1, B - 15, 2, 4, '#58a860');
      break;
    }
    case 'statue': {
      px(ctx, W16 / 2 - 5, B - 5, 10, 3, '#c8c0ac');           // plinth
      px(ctx, W16 / 2 - 3, B - 16, 6, 11, '#e8e2d4');          // robed figure
      px(ctx, W16 / 2 - 2, B - 20, 4, 4, '#f0e4d0');
      px(ctx, W16 / 2 - 3, B - 16, 1, 11, '#f4f0e6');
      px(ctx, W16 / 2 + 3, B - 14, 3, 2, '#e8e2d4');           // arm
      break;
    }
    case 'pillar': {                              // tall lacquered column
      const cx = W16 >> 1;
      px(ctx, cx - 6, B - 2, 12, 2, 'rgba(0,0,0,0.25)');       // shadow
      px(ctx, cx - 4, B - 28, 8, 26, '#c04a3a');               // shaft
      px(ctx, cx - 4, B - 28, 2, 26, '#e06a4a');
      px(ctx, cx + 2, B - 28, 2, 26, '#8a2a20');
      px(ctx, cx - 6, B - 31, 12, 3, '#f0c040');               // capital
      px(ctx, cx - 5, B - 24, 10, 2, '#f0c040');               // gilt band
      px(ctx, cx - 6, B - 4, 12, 3, '#8a2a20');                // base
      break;
    }
    case 'lantern': {
      px(ctx, W16 / 2 - 1, B - 28, 2, 6, '#4a3a2a');           // cord
      px(ctx, W16 / 2 - 4, B - 22, 8, 9, '#d44a4a');
      px(ctx, W16 / 2 - 2, B - 20, 4, 5, '#ffe066');           // glow
      px(ctx, W16 / 2 - 1, B - 12, 2, 3, '#f0c040');           // tassel
      break;
    }
    case 'banner': {
      px(ctx, 2, B - 30, W16 - 4, 2, '#5a3a24');               // rod
      px(ctx, 3, B - 28, W16 - 6, 16, '#8a2030');
      px(ctx, 3, B - 14, 3, 3, '#8a2030'); px(ctx, W16 - 6, B - 14, 3, 3, '#8a2030'); // swallowtail
      px(ctx, W16 / 2 - 2, B - 24, 4, 6, '#f0c040');           // sigil
      break;
    }
    case 'crate': {
      px(ctx, 2, B - 13, 12, 10, '#8a6034');
      px(ctx, 2, B - 13, 12, 2, '#a5793f');
      px(ctx, 2, B - 8, 12, 1, '#5f3f20'); px(ctx, 7, B - 13, 1, 10, '#5f3f20');
      px(ctx, W16 - 12, B - 19, 10, 8, '#a5793f');             // stacked barrel
      px(ctx, W16 - 12, B - 16, 10, 1, '#5f3f20');
      break;
    }
    case 'bell': {                                // temple bell on frame
      px(ctx, 2, B - 28, 3, 26, '#6d4726'); px(ctx, W16 - 5, B - 28, 3, 26, '#6d4726');
      px(ctx, 1, B - 30, W16 - 2, 3, '#8a5c32');
      px(ctx, W16 / 2 - 5, B - 25, 10, 12, '#c49038');
      px(ctx, W16 / 2 - 5, B - 25, 3, 12, '#e8c060');
      px(ctx, W16 / 2 - 1, B - 12, 2, 3, '#8a6a20');
      break;
    }
    case 'rail': {                                // spectator rail
      px(ctx, 1, B - 12, W16 - 2, 2, '#8a6034');
      for (let x = 2; x < W16 - 2; x += 6) px(ctx, x, B - 10, 2, 8, '#6d4a28');
      px(ctx, 1, B - 5, W16 - 2, 1, '#5f3f20');
      break;
    }
    case 'stair': {                               // lighthouse spiral stair
      for (let s = 0; s < 5; s++) px(ctx, 3 + s * 4, B - 8 - s * 5, 10, 3, '#9a948a');
      px(ctx, 5, B - 30, 3, 26, '#6d6860');
      break;
    }
    case 'slotbank': {                            // row of house slot machines (décor)
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(2, B - 3, W16 - 4, 3);
      const n = Math.floor(W16 / 14);
      for (let i = 0; i < n; i++) {
        const ox = 1 + i * 14;
        px(ctx, ox, B - 24, 12, 21, i % 2 ? '#3c2a5a' : '#5a2a4a');
        px(ctx, ox + 1, B - 20, 10, 5, '#0d0d16');
        px(ctx, ox + 2, B - 19, 2, 3, '#ffe066'); px(ctx, ox + 5, B - 19, 2, 3, '#5eeaff'); px(ctx, ox + 8, B - 19, 2, 3, '#ff6be0');
        px(ctx, ox + 1, B - 24, 10, 2, '#ff6be0');
        px(ctx, ox + 2, B - 12, 8, 2, '#f0c040');
      }
      break;
    }
    case 'neonsign': {                            // glowing wall sign
      const cols = ['#ff6be0', '#5eeaff', '#ffe066', '#8dff6b'];
      px(ctx, 0, 2, W16, B - 6, '#16121e');
      for (let i = 0; i < 4; i++) px(ctx, 3 + i * ((W16 - 8) / 4), 4, (W16 - 12) / 4, B - 10, cols[(i + v) % 4]);
      px(ctx, 1, 2, W16 - 2, 1, '#ff6be0'); px(ctx, 1, B - 4, W16 - 2, 1, '#5eeaff');
      break;
    }
    case 'bleacher': {                            // packed stand, crowd facing out
      px(ctx, 0, 2, W16, B - 4, '#8a6a4a');                    // tiers
      px(ctx, 0, 2, W16, 2, '#a5824f');
      for (let row = 0; row < Math.floor((B - 8) / 9); row++) {
        px(ctx, 0, 4 + row * 9 + 7, W16, 2, '#6d5238');        // tier lip
        for (let hx = 2 + (row % 2) * 4; hx < W16 - 3; hx += 7) {
          const c = ['#f0c8a0', '#c89a70', '#a5713f', '#e8b890'][((hx + row * 3 + v) >> 2) % 4];
          const shirt = ['#5a76c8', '#c85a6a', '#4f9c5e', '#d9a545', '#8a5ac8'][((hx * 7 + row + v) >> 1) % 5];
          px(ctx, hx, 5 + row * 9 + ((hx + v) % 2), 4, 3, c);  // head (bobbing)
          px(ctx, hx, 8 + row * 9, 4, 3, shirt);               // shoulders
        }
      }
      break;
    }
    case 'marblestand': {                         // carved coliseum seating with crowd
      px(ctx, 0, 0, W16, B, '#d8d2c0');
      for (let row = 0; row < Math.floor(B / 9); row++) {
        px(ctx, 0, row * 9 + 7, W16, 2, '#b4ad9c');
        for (let hx = 2 + (row % 2) * 4; hx < W16 - 3; hx += 7) {
          const c = ['#f0c8a0', '#c89a70', '#a5713f'][((hx + row + v) >> 2) % 3];
          px(ctx, hx, row * 9 + 1 + ((hx + v) % 2), 4, 3, c);
          px(ctx, hx, row * 9 + 4, 4, 3, ['#e8e2d4', '#c04a4a', '#5a76c8', '#d9a545'][((hx * 3 + row + v) >> 1) % 4]);
        }
      }
      break;
    }
    case 'foodstand': {                           // snack stall with awning
      sh2(ctx, W16, B);
      px(ctx, 1, B - 26, W16 - 2, 4, (v % 2) ? '#c04a4a' : '#3d8a4c'); // awning
      for (let sx2 = 1; sx2 < W16 - 2; sx2 += 6) px(ctx, sx2, B - 26, 3, 4, '#f4f0e6');
      px(ctx, 2, B - 22, 2, 8, '#5a3a24'); px(ctx, W16 - 4, B - 22, 2, 8, '#5a3a24');
      px(ctx, 1, B - 14, W16 - 2, 10, '#8a6034');              // counter
      px(ctx, 1, B - 14, W16 - 2, 2, '#a5793f');
      px(ctx, 4, B - 11, 4, 3, '#e8b830'); px(ctx, 10, B - 11, 4, 3, '#d44a4a'); // skewers & bowls
      px(ctx, W16 - 9, B - 11, 5, 3, '#e8d49a');
      break;
    }
    case 'shelf': {                               // artifact shelf: urns, relics, curios
      px(ctx, 1, B - 28, W16 - 2, 25, '#5a3a24');
      px(ctx, 2, B - 27, W16 - 4, 23, '#3a2a18');
      for (const sy2 of [B - 25, B - 17, B - 9]) {
        px(ctx, 2, sy2 + 5, W16 - 4, 2, '#6d4a28');            // shelf boards
        for (let ox = 4; ox < W16 - 6; ox += 7) {
          const kind2 = ((ox + sy2 + v) >> 2) % 3;
          if (kind2 === 0) { px(ctx, ox, sy2, 4, 5, '#b8763a'); px(ctx, ox + 1, sy2 - 1, 2, 1, '#8a5a2a'); } // urn
          else if (kind2 === 1) px(ctx, ox, sy2 + 1, 5, 4, '#f0c040');   // gold relic
          else { px(ctx, ox, sy2, 4, 5, '#3fb0a0'); px(ctx, ox + 1, sy2 + 1, 2, 2, '#8fd8c8'); } // jade
        }
      }
      break;
    }
    case 'armor': {                               // standing suit of armour
      px(ctx, W16 / 2 - 4, B - 5, 8, 3, '#5a3a24');            // base
      px(ctx, W16 / 2 - 3, B - 18, 6, 10, '#b8bcc0');          // cuirass
      px(ctx, W16 / 2 - 3, B - 18, 2, 10, '#d8dce4');
      px(ctx, W16 / 2 - 2, B - 23, 4, 5, '#9aa0ac');           // helm
      px(ctx, W16 / 2 - 2, B - 21, 4, 1, '#26202c');           // visor
      px(ctx, W16 / 2 - 5, B - 17, 2, 6, '#9aa0ac'); px(ctx, W16 / 2 + 3, B - 17, 2, 6, '#9aa0ac');
      px(ctx, W16 / 2 + 4, B - 22, 2, 14, '#8a6034');          // halberd
      px(ctx, W16 / 2 + 3, B - 24, 4, 3, '#c8ccd8');
      break;
    }
    case 'treasure': {                            // heaped riches
      sh2(ctx, W16, B);
      px(ctx, 2, B - 8, W16 - 4, 5, '#e8b830');                // gold heap
      px(ctx, 4, B - 11, W16 - 8, 4, '#f0c040');
      px(ctx, 7, B - 14, W16 - 14, 3, '#ffe066');
      px(ctx, 3, B - 10, 2, 2, '#d44a4a'); px(ctx, W16 - 6, B - 9, 2, 2, '#3fb0a0'); // gems
      px(ctx, W16 / 2 - 1, B - 16, 3, 3, '#5eeaff');
      px(ctx, 1, B - 16, 6, 8, '#8a6034'); px(ctx, 2, B - 16, 4, 2, '#a5793f');      // tipped chest
      break;
    }
    case 'zenrock': {                             // raked-sand rock cluster
      px(ctx, 2, B - 6, W16 - 4, 2, 'rgba(0,0,0,0.12)');
      px(ctx, 3, B - 12, 9, 8, '#8a8478'); px(ctx, 4, B - 13, 6, 3, '#a8a29e');
      px(ctx, W16 - 10, B - 9, 6, 5, '#6d6860');
      px(ctx, W16 / 2 - 1, B - 8, 4, 4, '#9a948a');
      px(ctx, 4, B - 11, 2, 2, '#7d9a52');                     // moss
      break;
    }
    case 'incense': {                             // burner with drifting smoke
      px(ctx, W16 / 2 - 4, B - 6, 8, 4, '#8a6a42');            // bronze bowl
      px(ctx, W16 / 2 - 3, B - 8, 6, 3, '#c49038');
      px(ctx, W16 / 2 - 1, B - 10, 2, 2, '#e05a30');           // embers
      for (let k = 0; k < 5; k++) {
        px(ctx, W16 / 2 - 1 + ((k + v) % 3) - 1, B - 13 - k * 4, 2, 2, `rgba(216,216,224,${0.55 - k * 0.09})`);
      }
      break;
    }
    case 'teacorner': {                           // low table, cushions, tea set
      px(ctx, 1, B - 4, W16 - 2, 3, 'rgba(140,40,40,0.4)');    // carpet edge
      px(ctx, 3, B - 12, W16 - 6, 8, '#5a3a24');               // low table
      px(ctx, 3, B - 12, W16 - 6, 2, '#8a6034');
      px(ctx, 6, B - 15, 4, 4, '#3fb0a0'); px(ctx, 7, B - 17, 2, 2, '#8fd8c8');   // teapot
      px(ctx, W16 - 10, B - 14, 3, 3, '#e8d49a'); px(ctx, W16 / 2, B - 14, 3, 3, '#e8d49a'); // cups
      px(ctx, 1, B - 8, 3, 4, '#c04a4a'); px(ctx, W16 - 4, B - 8, 3, 4, '#3f6ac8');          // cushions
      break;
    }
    case 'tvwall': {                              // bank of race screens
      px(ctx, 0, 1, W16, B - 4, '#16121e');
      for (let c2 = 0; c2 < Math.floor(W16 / 15); c2++) for (let r2 = 0; r2 < 2; r2++) {
        const ox = 2 + c2 * 15, oy = 3 + r2 * ((B - 8) / 2);
        px(ctx, ox, oy, 12, (B - 12) / 2, ((c2 + r2 + v) % 2) ? '#1a2c1e' : '#2a1a30');
        px(ctx, ox + 1, oy + 2, 7, 1, '#8dff6b');              // odds lines
        px(ctx, ox + 1, oy + 4, 5, 1, '#ffe066');
        px(ctx, ox + 1, oy + 6, 8, 1, '#5eeaff');
      }
      break;
    }
    case 'drum': {                                // great festival taiko on a stand
      sh2(ctx, W16, B);
      px(ctx, 3, B - 8, W16 - 6, 5, '#5a3a24');              // stand
      px(ctx, 2, B - 24, W16 - 4, 17, '#8a2030');            // barrel
      px(ctx, 2, B - 24, W16 - 4, 2, '#c43a4a');
      px(ctx, 5, B - 22, W16 - 10, 13, '#e8d49a');           // hide face
      px(ctx, 7, B - 20, W16 - 14, 9, '#d9c49a');
      px(ctx, (W16 >> 1) - 1, B - 17, 3, 3, '#8a2030');      // mon
      for (let s = 0; s < 3; s++) { px(ctx, 4 + s * ((W16 - 10) >> 1), B - 25, 2, 2, '#f0c040'); } // studs
      px(ctx, W16 - 6, B - 30, 2, 8, '#8a6034');             // bachi sticks leaning
      px(ctx, W16 - 9, B - 29, 2, 7, '#8a6034');
      break;
    }
    case 'speaker': {                             // neon club speaker stack
      sh2(ctx, W16, B);
      px(ctx, 2, B - 28, W16 - 4, 25, '#16121e');
      px(ctx, 2, B - 28, W16 - 4, 1, '#3a3642');
      for (let r2 = 0; r2 < 2; r2++) {
        const cy2 = B - 24 + r2 * 11;
        px(ctx, (W16 >> 1) - 5, cy2, 10, 9, '#26222c');      // cone housing
        px(ctx, (W16 >> 1) - 3, cy2 + 2, 6, 5, '#3a3642');
        px(ctx, (W16 >> 1) - 1, cy2 + 4, 2, 2, (v + r2) % 2 ? '#ff6be0' : '#5eeaff'); // glowing coil
      }
      px(ctx, 3, B - 27, 2, 2, '#8dff6b');                   // power LED
      break;
    }
    case 'longtable': {                           // feast table groaning with food
      sh2(ctx, W16, B);
      px(ctx, 1, B - 18, W16 - 2, 13, '#6d4a28');              // table
      px(ctx, 0, B - 20, W16, 4, '#8a6034');
      px(ctx, 1, B - 19, W16 - 2, 1, '#a5793f');
      for (let ox = 3; ox < W16 - 5; ox += 8) {
        const k2 = ((ox + v) >> 3) % 4;
        if (k2 === 0) { px(ctx, ox, B - 24, 5, 4, '#c46a3a'); px(ctx, ox + 1, B - 25, 3, 1, '#8a5a2a'); }  // roast
        else if (k2 === 1) { px(ctx, ox + 1, B - 25, 3, 5, '#d9a545'); }                                   // flagon
        else if (k2 === 2) { px(ctx, ox, B - 23, 5, 3, '#e8d49a'); }                                       // bread
        else { px(ctx, ox + 1, B - 24, 3, 4, '#8a2030'); }                                                 // wine
      }
      px(ctx, 2, B - 5, 3, 2, '#5a3a24'); px(ctx, W16 - 5, B - 5, 3, 2, '#5a3a24'); // legs
      break;
    }
    case 'scrolls': {                             // pigeonhole scroll rack
      px(ctx, 1, B - 28, W16 - 2, 25, '#8a6034');
      for (let r2 = 0; r2 < 3; r2++) for (let c2 = 0; c2 < Math.floor((W16 - 6) / 7); c2++) {
        const ox = 3 + c2 * 7, oy = B - 26 + r2 * 8;
        px(ctx, ox, oy, 6, 6, '#5a3a24');
        px(ctx, ox + 1, oy + 1, 4, 4, '#e8d49a');              // rolled scroll end
        px(ctx, ox + 2, oy + 2, 2, 2, '#c4ae7c');
      }
      break;
    }
  }
}

/* small shared shadow for decor pieces */
function sh2(ctx, W16, B) { ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(2, B - 3, W16 - 4, 3); }

/* 16x16 decorative street props, styled per province. */
function drawProp(ctx, prov, v) {
  const kind = v % 3;
  if (prov === 'TF') {
    if (kind === 0) { // marble urn
      px(ctx, 6, 3, 4, 2, '#e8e2d4'); px(ctx, 5, 5, 6, 5, '#e8e2d4');
      px(ctx, 6, 10, 4, 2, '#c8c0ac'); px(ctx, 4, 12, 8, 2, '#d8d2c0');
      px(ctx, 5, 6, 1, 3, '#f4f0e6');
    } else if (kind === 1) { // laurel column stub
      px(ctx, 5, 2, 6, 2, '#d8d2c0'); px(ctx, 6, 4, 4, 8, '#e8e2d4');
      px(ctx, 6, 5, 1, 6, '#f4f0e6'); px(ctx, 4, 12, 8, 2, '#c8c0ac');
    } else { // olive shrub in pot
      px(ctx, 4, 3, 8, 6, '#6d8a4a'); px(ctx, 5, 2, 5, 2, '#82a05c');
      px(ctx, 6, 9, 4, 2, '#b8763a'); px(ctx, 5, 11, 6, 3, '#a05a28');
    }
  } else if (prov === 'FL') {
    if (kind === 0) { // flowerbed
      px(ctx, 2, 4, 12, 9, '#4f9845');
      for (let i = 0; i < 5; i++) px(ctx, 3 + i * 2, 6 + (i % 2) * 3, 2, 2, ['#ffe066', '#ff8ac0', '#fff', '#c58cff', '#ff7a6b'][i]);
      px(ctx, 2, 4, 12, 1, '#3d7a36'); px(ctx, 2, 12, 12, 1, '#3d7a36');
    } else if (kind === 1) { // stone well
      px(ctx, 4, 6, 8, 6, '#9a948a'); px(ctx, 5, 7, 6, 3, '#2c3a4a');
      px(ctx, 4, 3, 1, 4, '#6d5230'); px(ctx, 11, 3, 1, 4, '#6d5230'); px(ctx, 3, 2, 10, 2, '#8a6a42');
    } else { // hay bale
      px(ctx, 3, 5, 10, 8, '#d8bc6a'); px(ctx, 3, 8, 10, 1, '#b89a4a'); px(ctx, 7, 5, 1, 8, '#b89a4a');
    }
  } else if (prov === 'HV') {
    if (kind === 0) { // barrel
      px(ctx, 5, 4, 6, 9, '#8a6034'); px(ctx, 4, 6, 8, 1, '#5f3f20'); px(ctx, 4, 10, 8, 1, '#5f3f20');
      px(ctx, 6, 4, 1, 9, '#a5793f');
    } else if (kind === 1) { // potted cactus
      px(ctx, 6, 3, 3, 8, '#5a7a3a'); px(ctx, 3, 5, 3, 2, '#5a7a3a'); px(ctx, 10, 6, 3, 2, '#5a7a3a');
      px(ctx, 5, 11, 6, 3, '#b8763a');
    } else { // water trough
      px(ctx, 2, 7, 12, 6, '#6d4a28'); px(ctx, 3, 8, 10, 3, '#4a94b8');
    }
  } else if (prov === 'DG') {
    if (kind === 0) { // stone lantern
      px(ctx, 6, 2, 4, 2, '#8a8480'); px(ctx, 5, 4, 6, 3, '#a8a29e'); px(ctx, 7, 5, 2, 1, '#ffd75e');
      px(ctx, 7, 7, 2, 4, '#8a8480'); px(ctx, 5, 11, 6, 2, '#a8a29e');
    } else if (kind === 1) { // red lantern post
      px(ctx, 7, 2, 2, 11, '#5a3a1e'); px(ctx, 5, 3, 6, 5, '#c03030');
      px(ctx, 6, 4, 1, 3, '#e05050'); px(ctx, 7, 8, 2, 1, '#f0c040');
    } else { // jade koi statue
      px(ctx, 5, 4, 6, 7, '#4f9c7e'); px(ctx, 8, 3, 3, 3, '#5fb08e'); px(ctx, 4, 9, 3, 3, '#3f8468');
      px(ctx, 9, 5, 1, 1, '#26202c');
    }
  } else if (prov === 'EP') {
    if (kind === 0) { // clay pots
      px(ctx, 3, 7, 5, 6, '#a05a28'); px(ctx, 4, 6, 3, 2, '#b8763a');
      px(ctx, 9, 8, 4, 5, '#b8763a'); px(ctx, 10, 7, 2, 2, '#c98a4a');
    } else if (kind === 1) { // carved totem
      px(ctx, 6, 2, 4, 11, '#6d4726'); px(ctx, 5, 4, 6, 2, '#8a5c32'); px(ctx, 5, 8, 6, 2, '#8a5c32');
      px(ctx, 7, 5, 1, 1, '#ffd75e'); px(ctx, 9, 5, 1, 1, '#ffd75e');
    } else { // banana plant
      px(ctx, 7, 6, 2, 7, '#5a7a3a');
      px(ctx, 3, 3, 5, 3, '#4f9845'); px(ctx, 9, 2, 5, 3, '#58a850'); px(ctx, 4, 6, 3, 2, '#3d8038');
    }
  } else { // MN
    if (kind === 0) { // vending machine
      px(ctx, 4, 3, 8, 11, '#d44a4a'); px(ctx, 5, 4, 6, 4, '#e8f0f8');
      px(ctx, 5, 9, 2, 2, '#5eeaff'); px(ctx, 8, 9, 2, 2, '#ffe066'); px(ctx, 5, 12, 5, 1, '#26202c');
    } else if (kind === 1) { // paper lantern post
      px(ctx, 7, 2, 2, 12, '#26202c'); px(ctx, 5, 3, 6, 5, '#ff6be0');
      px(ctx, 6, 4, 1, 3, '#ff9aec'); px(ctx, 7, 8, 2, 1, '#ffe066');
    } else { // beckoning cat statue
      px(ctx, 5, 5, 6, 8, '#f4f0e6'); px(ctx, 5, 3, 2, 3, '#f4f0e6'); px(ctx, 9, 3, 2, 3, '#f4f0e6');
      px(ctx, 6, 7, 1, 1, '#26202c'); px(ctx, 9, 7, 1, 1, '#26202c');
      px(ctx, 7, 9, 2, 2, '#d4a018'); px(ctx, 11, 5, 2, 4, '#f4f0e6');
    }
  }
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(3, 13, 10, 2);
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
