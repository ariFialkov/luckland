/* ============================================================
   Luckland — world generation
   ------------------------------------------------------------
   A 360x240 tile continent generated deterministically from
   CONFIG.WORLD_SEED, following the hand-drawn atlas of Luckland:
   the western Four Leaf / Horseshoeville landmass split by the
   Great River, Tyche & Fortuna's three northern capes around the
   Tychean and Fortunian Seas, mountainous Dragonia behind the
   Dragonspine, jungle Elephantium across the Thunder Steps, and
   the Maneki-Neko archipelago over the Paradise Sea.
   ============================================================ */

import { CONFIG } from './config.js';
import { hash2, fbm } from './rng.js';

export const TILE = 16;           // px per tile
export const W = 360, H = 240;    // world size in tiles

/* Tile type ids */
export const T = {
  DEEP: 0, WATER: 1, TIDAL: 2, SAND: 3, GRASS: 4, MEADOW: 5, FOREST: 6,
  JUNGLE: 7, HILL: 8, MOUNTAIN: 9, DUST: 10, SCRUB: 11, ROAD: 12,
  PLAZA: 13, WALL: 14, ROOF: 15, DOOR: 16, BRIDGE: 17, CLIFF: 18,
  NEON: 19, PIER: 20, FLOWERS: 21, BAMBOO: 22, WETSAND: 23,
  TRAIL: 24, PEAK: 25, WALL_MARBLE: 26, WALL_STONE: 27,
  ROOF_GOLD: 28, ROOF_SLATE: 29, ROOF_LEAF: 30,
};

export const PROV_LIST = ['SEA', 'TF', 'FL', 'HV', 'DG', 'EP', 'MN'];

export const PROVINCES = {
  TF: { name: 'Tyche & Fortuna', sub: 'Where the goddesses smile', color: '#d9c078' },
  FL: { name: 'Four Leaf Republic', sub: 'Land of the long odds', color: '#4faf50' },
  HV: { name: 'Horseshoeville', sub: 'Luck rides at high noon', color: '#c8985a' },
  DG: { name: 'Dragonia', sub: 'Fortune favours the patient', color: '#c05050' },
  EP: { name: 'Elephantium', sub: 'The mists remember every wager', color: '#4f9c6e' },
  MN: { name: 'Maneki-Neko', sub: 'The beckoning neon isles', color: '#c96ad4' },
  SEA: { name: 'The Open Sea', sub: '', color: '#2a6a9a' },
};

/* Building material palette per province. */
const PROV_WALLS = {
  TF: { wall: T.WALL_MARBLE, roof: T.ROOF },
  FL: { wall: T.WALL_STONE, roof: T.ROOF_SLATE },
  HV: { wall: T.WALL, roof: T.ROOF },
  DG: { wall: T.WALL, roof: T.ROOF_GOLD },
  EP: { wall: T.WALL, roof: T.ROOF_LEAF },
  MN: { wall: T.WALL_STONE, roof: T.ROOF_SLATE },
  SEA: { wall: T.WALL, roof: T.ROOF },
};

const SOLID = new Set([
  T.DEEP, T.WATER, T.MOUNTAIN, T.PEAK, T.CLIFF, T.FOREST, T.JUNGLE,
  T.WALL, T.ROOF, T.WALL_MARBLE, T.WALL_STONE, T.ROOF_GOLD, T.ROOF_SLATE, T.ROOF_LEAF,
]);

export function isSolidTile(t, tide) {
  if (t === T.TIDAL) return tide > 0.62; // underwater at high tide
  return SOLID.has(t);
}

export function isWaterTile(t, tide) {
  return t === T.DEEP || t === T.WATER || (t === T.TIDAL && tide > 0.62);
}

/* ============================================================
   Macro landmass layout — 45x30 cell atlas traced from the map.
   '.' = sea. Letters = province land. Each cell = 8x8 tiles;
   coastlines get roughened by noise when sampled.
   ============================================================ */
const GRID = [
  '.............................................',
  '...............TTT.......................MMM.',
  '..FFFFFFFFFFF.TTTTTT..............MMMMM.MMMM.',
  '..FFFFFFFFFFF.TTTTTT.TTT...TTTT...MMMMMM.MMM.',
  '..FFFFFFFFFFF.......TTTTT..TTTTT..MMMMMMM.MM.',
  '..FFFFFFFFFFF.TTTTTTTTTTTTTTTTTT..MMMMMMMM...',
  '..FFFFFFFFFFF.TTTTTTTTTTTTTTTTTT..MMMMMMMM...',
  '..FFFFFFFFFFF.TTTTTTTTTTTTTTTTTT..MMMMMMMM...',
  '..FFFFFFFFFFFFTTTTTTTTTTTTTTTTTT..MMMMMMMM...',
  '..FFFFFFFFFFFFTTTTTTTTTTTTTTTTT...MMMMMMM....',
  '..FFFFFFFFFFFFTTTTTTTTTTTTTTTTT....MMMM......',
  '..FFFFFFFFFFFFTTTTTTTTTTTTTTTT...............',
  '..FFFFFFFFFFFFFTTTTTTTTTTTTTTT...............',
  '..FFFFFFFFFFFFFTTTTTTTTTTTTTTT......EEEEEE...',
  '..FFFFFFFFFFFFFDDDDDDDDDDDDDDD...EEEEEEEEEE..',
  '..FFFFFFFFFFFFFDDDDDDDDDDDDDDD..EEEEEEEEEEE..',
  '..HHHHHHHHHHHHHDDDDDDDDDDDDDDD..EEEEEEEEEEE..',
  '..HHHHHHHHHHHHHDDDDDDDDDDDDDDD..EEEEEEEEEEE..',
  '..HHHHHHHHHHH...DDDDDDDDDDDDDDDDEEEEEEEEEEE..',
  '..HHHHHHHHHHH...DDDDDDDDDDDDDDDDEEEEEEEEEEE..',
  '..HHHHHHHHHHH...DDDDDDDDDDDDDDDDEEEEEEEEEEE..',
  '..HHHHHHHHHHHH.DDDDDDDDDDDDDDDDDEEEEEEEEEEE..',
  '..HHHHHHHHHHHH.DDDDDDDDDDDDDDDDDEEEEEEEEEEE..',
  '..HHHHHHHHHHHH.DDDDDDDDDDDDDDDDDEEEEEEEEEEE..',
  '..HHHHHHHHHHHH.DDDDDDDDDDDDDDDD.EEEEEEEEEEEE.',
  '...HHHHHHHHHHH.DDDDDDDDDDDDDDDD.EEEEEEEEEEEE.',
  '....HHHHHHHHH...................EEEEEEEEE....',
  '.....HHHHHH...........DDDDD......EEEEEEE.....',
  '..................................EE.........',
  '.............................................',
];
const GPROV = { F: 'FL', H: 'HV', T: 'TF', D: 'DG', E: 'EP', M: 'MN' };

/* ============================================================ */
export function generateWorld() {
  const seed = CONFIG.WORLD_SEED;
  const tiles = new Uint8Array(W * H);
  const prov = new Uint8Array(W * H);

  const idx = (x, y) => y * W + x;
  const inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const get = (x, y) => (inB(x, y) ? tiles[idx(x, y)] : T.DEEP);
  const set = (x, y, t) => { if (inB(x, y)) tiles[idx(x, y)] = t; };

  /* --- macro sampling with ragged coasts --- */
  const CW = W / GRID[0].length, CH = H / GRID.length; // 8x8 tiles per cell
  function macroAt(x, y) {
    const ju = (fbm(x, y, 15, seed + 101) - 0.5) * 2.6 + (fbm(x, y, 4, seed + 103) - 0.5) * 1.1;
    const jv = (fbm(x + 917, y + 311, 15, seed + 102) - 0.5) * 2.6 + (fbm(x + 400, y, 4, seed + 104) - 0.5) * 1.1;
    const c = Math.max(0, Math.min(GRID[0].length - 1, Math.round(x / CW + ju - 0.5)));
    const r = Math.max(0, Math.min(GRID.length - 1, Math.round(y / CH + jv - 0.5)));
    return GRID[r][c];
  }

  /* --- base land & biomes (each province gets its own ground mix) --- */
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = macroAt(x, y);
      if (ch === '.') {
        const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
        tiles[idx(x, y)] = edge < 7 ? T.DEEP : T.WATER;
        prov[idx(x, y)] = 0;
        continue;
      }
      const code = GPROV[ch];
      prov[idx(x, y)] = PROV_LIST.indexOf(code);
      const e = fbm(x, y, 18, seed + 5);        // broad relief
      const rough = fbm(x, y, 7, seed + 6);     // fine texture
      let t;
      switch (code) {
        case 'TF':
          t = e > 0.60 ? T.HILL : e > 0.34 ? T.MEADOW : T.GRASS;
          if (rough > 0.80) t = T.FOREST;
          break;
        case 'FL':
          t = e > 0.62 ? T.HILL : e > 0.30 ? T.GRASS : T.MEADOW;
          if (hash2(x, y, seed + 77) > 0.965) t = T.FLOWERS;
          if (rough > 0.82) t = T.FOREST;
          break;
        case 'HV':
          t = e > 0.70 ? T.SCRUB : T.DUST;
          if (hash2(x, y, seed + 78) > 0.975) t = T.SCRUB;
          break;
        case 'DG':
          t = e > 0.58 ? T.HILL : e > 0.30 ? T.GRASS : T.BAMBOO;
          if (rough > 0.80) t = T.FOREST;
          break;
        case 'EP':
          // mountainous jungle paradise: dense canopy with winding gaps
          t = rough > 0.42 ? T.JUNGLE : T.GRASS;
          break;
        case 'MN':
          t = e > 0.62 ? T.FOREST : T.GRASS;
          break;
        default: t = T.GRASS;
      }
      tiles[idx(x, y)] = t;
    }
  }

  /* ============================================================
     Mountains — the world is rugged. Named ranges as noisy
     ridges plus per-province scatter, with peaks.
     ============================================================ */
  function ridge(pts, width, opts = {}) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2;
      for (let s = 0; s <= steps; s++) {
        const f = s / steps;
        const cx = Math.round(ax + (bx - ax) * f + (fbm(s * 3, i * 9, 6, seed + 21) - 0.5) * 7);
        const cy = Math.round(ay + (by - ay) * f + (fbm(i * 9, s * 3, 6, seed + 22) - 0.5) * 7);
        const w = width * (0.6 + fbm(s, i, 5, seed + 24) * 0.8);
        for (let dy = -width - 2; dy <= width + 2; dy++) {
          for (let dx = -width - 2; dx <= width + 2; dx++) {
            const d = Math.hypot(dx, dy);
            if (d > w + hash2(cx + dx, cy + dy, seed + 23) * 1.5) continue;
            const t = get(cx + dx, cy + dy);
            if (t === T.WATER || t === T.DEEP || t === T.TIDAL) continue;
            set(cx + dx, cy + dy, opts.cliff ? T.CLIFF : (opts.peak && d < w * 0.4 ? T.PEAK : T.MOUNTAIN));
          }
        }
      }
    }
  }
  function massif(cx, cy, r, peak = false) {
    for (let dy = -r - 2; dy <= r + 2; dy++) for (let dx = -r - 2; dx <= r + 2; dx++) {
      const d = Math.hypot(dx, dy) + (fbm(cx + dx, cy + dy, 5, seed + 26) - 0.5) * 3;
      if (d > r) continue;
      const t = get(cx + dx, cy + dy);
      if (t === T.WATER || t === T.DEEP || t === T.TIDAL) continue;
      set(cx + dx, cy + dy, peak && d < r * 0.45 ? T.PEAK : T.MOUNTAIN);
    }
  }

  // The Dragonspine — great wall between Tyche & Fortuna and Dragonia
  ridge([[136, 100], [160, 104], [184, 110], [206, 112], [230, 117]], 5);
  // The Emerald Divide — FL/TF border highlands
  ridge([[112, 26], [116, 52], [122, 78], [131, 97]], 3);
  // The Thunder Steps — DG/EP border range
  ridge([[252, 138], [258, 158], [263, 178], [267, 198]], 4);
  // Temple Mounts — eastern Dragonia, where the temples hide
  ridge([[194, 138], [210, 145], [224, 150], [240, 150]], 3);
  // The Mist Peaks — Elephantium's jungle spine
  ridge([[288, 138], [298, 154], [308, 170], [318, 186]], 4);
  ridge([[330, 148], [340, 164]], 2);
  // North Maneki hills
  ridge([[278, 22], [292, 19], [306, 24]], 2);
  // Upsilonia ridge
  ridge([[122, 16], [138, 14]], 2);
  // Mount Snow & Mount Colossus
  massif(220, 126, 4, true);
  massif(229, 136, 6, true);
  // Lung Island's dragon-back
  massif(192, 219, 3);
  // Sunbleached Mesas (HV) & FL sea cliffs
  massif(48, 178, 4); massif(62, 190, 3); massif(30, 168, 3);
  ridge([[18, 96], [16, 112]], 2, { cliff: true });
  ridge([[148, 214], [160, 218]], 2, { cliff: true });

  // per-province scatter so the whole map feels rugged
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = tiles[idx(x, y)];
      if (t === T.WATER || t === T.DEEP || t === T.MOUNTAIN || t === T.PEAK || t === T.CLIFF) continue;
      const code = PROV_LIST[prov[idx(x, y)]];
      const m = fbm(x, y, 11, seed + 30);
      const th = { DG: 0.71, EP: 0.74, TF: 0.78, FL: 0.79, MN: 0.82, HV: 0.86 }[code] ?? 1;
      if (m > th) set(x, y, T.MOUNTAIN);
      else if (m > th - 0.05 && code !== 'HV') set(x, y, T.HILL);
    }
  }

  /* ============================================================
     Water features
     ============================================================ */
  function river(pts, width) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2;
      for (let s = 0; s <= steps; s++) {
        const f = s / steps;
        const cx = Math.round(ax + (bx - ax) * f + (fbm(s * 2, i * 7, 6, seed + 50) - 0.5) * 4);
        const cy = Math.round(ay + (by - ay) * f + (fbm(i * 7, s * 2, 6, seed + 51) - 0.5) * 4);
        for (let dy = -width; dy <= width; dy++) for (let dx = -width; dx <= width; dx++) {
          if (Math.hypot(dx, dy) <= width + 0.4) set(cx + dx, cy + dy, T.WATER);
        }
      }
    }
  }
  // Heaven Lake — jewel of the Dragonspine
  for (let dy = -5; dy <= 5; dy++) for (let dx = -9; dx <= 9; dx++) {
    if ((dx / 8.5) ** 2 + (dy / 4.5) ** 2 + (fbm(184 + dx, 103 + dy, 5, seed + 52) - 0.5) * 0.5 <= 1) {
      set(184 + dx, 103 + dy, T.WATER);
    }
  }
  river([[120, 127], [92, 130], [62, 132], [32, 134], [6, 133]], 2);      // Great River (FL/HV border)
  river([[118, 166], [126, 178], [138, 190], [147, 204], [150, 218]], 1); // Red River (from Dragon's Bay)
  river([[245, 158], [248, 178], [250, 198], [252, 216]], 1);            // Lucky River
  river([[300, 163], [305, 184], [308, 204], [310, 220]], 1);            // Cyan River (ends at Waterfall Park)

  /* Serpent Strait — guarantees Lung Island stands apart from Dragonia */
  for (let y = 199; y <= 213; y++) for (let x = 168; x <= 216; x++) {
    const wob = (fbm(x, y, 8, seed + 55) - 0.5) * 5;
    if (y > 200 + wob && y < 212 + wob && get(x, y) !== T.DEEP) set(x, y, T.WATER);
  }

  /* --- beaches --- */
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = get(x, y);
      if (t === T.WATER || t === T.DEEP || t === T.MOUNTAIN || t === T.PEAK || t === T.CLIFF) continue;
      let nearWater = false;
      for (let dy = -1; dy <= 1 && !nearWater; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (get(x + dx, y + dy) === T.WATER) { nearWater = true; break; }
      if (nearWater) set(x, y, T.SAND);
    }
  }

  /* --- tidal flats along coasts --- */
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (get(x, y) !== T.WATER) continue;
      let nearSand = false;
      for (let dy = -2; dy <= 2 && !nearSand; dy++)
        for (let dx = -2; dx <= 2; dx++)
          if (get(x + dx, y + dy) === T.SAND) { nearSand = true; break; }
      if (nearSand && fbm(x, y, 7, seed + 60) > 0.58) set(x, y, T.TIDAL);
    }
  }

  /* --- explicit tidal crossings --- */
  function tidalLine(x0, y0, x1, y1, w = 1) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2;
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const cx = Math.round(x0 + (x1 - x0) * f), cy = Math.round(y0 + (y1 - y0) * f);
      for (let dx = -w; dx <= w; dx++) for (let dy = -w; dy <= w; dy++) {
        const t = get(cx + dx, cy + dy);
        if (t === T.WATER || t === T.DEEP) set(cx + dx, cy + dy, T.TIDAL);
      }
    }
  }
  tidalLine(127, 26, 127, 42);     // Upsilonia causeway across the Tychean Sea
  tidalLine(322, 28, 334, 21);     // Neon Strait sandbar (Maneki <-> Neko)
  tidalLine(190, 198, 190, 215);   // Lung Island causeway
  tidalLine(30, 130, 42, 136, 2);  // Rapids Ford across the Great River

  /* --- Hidden Cove, sealed by cliffs on Elephantium's east coast --- */
  const cove = { x: 344, y: 148, r: 6 };
  for (let dy = -cove.r; dy <= cove.r; dy++) for (let dx = -cove.r; dx <= cove.r; dx++) {
    const d = Math.hypot(dx, dy);
    if (d > cove.r) continue;
    if (d > cove.r - 1.6) { if (get(cove.x + dx, cove.y + dy) !== T.TIDAL) set(cove.x + dx, cove.y + dy, T.CLIFF); }
    else set(cove.x + dx, cove.y + dy, T.SAND);
  }
  tidalLine(cove.x - cove.r - 2, cove.y, cove.x - cove.r + 1, cove.y, 1);

  /* ============================================================
     Cities — big, built-up, styled per province culture.
     ============================================================ */
  const cities = [
    { name: 'Ballyclover', prov: 'FL', x: 112, y: 124, r: 12, style: 'highland', citizens: 8 },
    { name: 'Rapidstown', prov: 'FL', x: 24, y: 126, r: 8, style: 'highland', citizens: 5 },
    { name: 'Puffin Point', prov: 'FL', x: 24, y: 88, r: 6, style: 'highland', citizens: 3 },
    { name: 'Downtown Horseshoeville', prov: 'HV', x: 88, y: 167, r: 12, style: 'saloon', citizens: 9 },
    { name: 'Horseshoe Downs', prov: 'HV', x: 40, y: 203, r: 9, style: 'saloon', citizens: 5 },
    { name: 'Tyche', prov: 'TF', x: 122, y: 48, r: 10, style: 'mediterranean', citizens: 8 },
    { name: 'Pontium', prov: 'TF', x: 173, y: 43, r: 10, style: 'mediterranean', citizens: 8 },
    { name: 'Fortuna', prov: 'TF', x: 236, y: 34, r: 9, style: 'mediterranean', citizens: 7 },
    { name: 'Epineion', prov: 'TF', x: 238, y: 60, r: 7, style: 'mediterranean', citizens: 4 },
    { name: 'Tiger City', prov: 'DG', x: 155, y: 186, r: 13, style: 'courtyard', citizens: 10 },
    { name: 'Kite City', prov: 'DG', x: 205, y: 132, r: 8, style: 'courtyard', citizens: 6 },
    { name: 'Temple City', prov: 'EP', x: 249, y: 172, r: 9, style: 'jungle', citizens: 7 },
    { name: 'Waterfall Park', prov: 'EP', x: 311, y: 218, r: 6, style: 'jungle', citizens: 3 },
    { name: 'Downtown Maneki', prov: 'MN', x: 292, y: 52, r: 12, style: 'grid', citizens: 12 },
    { name: 'East Maneki', prov: 'MN', x: 317, y: 66, r: 8, style: 'grid', citizens: 6 },
    { name: 'North Maneki', prov: 'MN', x: 284, y: 30, r: 7, style: 'grid', citizens: 5 },
    { name: 'Neko Town', prov: 'MN', x: 338, y: 23, r: 6, style: 'grid', citizens: 4 },
  ];

  const cityFloor = { highland: T.MEADOW, saloon: T.DUST, mediterranean: T.PLAZA, courtyard: T.PLAZA, jungle: T.GRASS, grid: T.NEON };

  function clearFlat(cx, cy, r, floor) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > r + (fbm(cx + dx, cy + dy, 5, seed + 70) - 0.5) * 3) continue;
      const t = get(cx + dx, cy + dy);
      if (t === T.WATER || t === T.DEEP || t === T.TIDAL || t === T.BRIDGE) continue;
      // flatten mountains/forest into buildable ground; keep an organic edge
      set(cx + dx, cy + dy, d < r * 0.72 && hash2(cx + dx, cy + dy, seed + 71) > 0.35 ? floor : baseGroundFor(cx + dx, cy + dy));
    }
  }
  function baseGroundFor(x, y) {
    const code = PROV_LIST[prov[idx(x, y)]];
    return { TF: T.GRASS, FL: T.MEADOW, HV: T.DUST, DG: T.GRASS, EP: T.GRASS, MN: T.GRASS }[code] ?? T.GRASS;
  }

  function building(bx, by, bw, bh, wall, roof) {
    for (let dy = -1; dy <= bh; dy++) for (let dx = -1; dx <= bw; dx++) {
      const t = get(bx + dx, by + dy);
      if (t === T.WATER || t === T.DEEP || t === T.DOOR || t === T.ROAD || t === T.BRIDGE) return false;
    }
    for (let dy = 0; dy < bh; dy++) for (let dx = 0; dx < bw; dx++) {
      set(bx + dx, by + dy, dy === bh - 1 ? wall : roof);
    }
    return true;
  }

  function stampCity(c) {
    const { wall, roof } = PROV_WALLS[c.prov];
    const floor = cityFloor[c.style];
    clearFlat(c.x, c.y, c.r, floor);
    const rng = (i, j) => hash2(c.x * 7 + i, c.y * 3 + j, seed + 75);

    if (c.style === 'grid') {
      // dense metropolis: street grid with 5-tile blocks, tall buildings
      const step = 6;
      for (let gy = -c.r + 1; gy <= c.r - 1; gy++) for (let gx = -c.r + 1; gx <= c.r - 1; gx++) {
        if (Math.hypot(gx, gy) > c.r - 1) continue;
        if ((gx + c.r) % step === 0 || (gy + c.r) % step === 0) set(c.x + gx, c.y + gy, T.ROAD);
      }
      for (let by = -c.r; by < c.r - step; by += step) for (let bx = -c.r; bx < c.r - step; bx += step) {
        const ox = bx + (c.r % step) + 2, oy = by + (c.r % step) + 2;
        if (Math.hypot(ox, oy) > c.r - 3) continue;
        if (rng(bx, by) < 0.85) building(c.x + ox, c.y + oy, 3, 3, wall, roof);
      }
    } else if (c.style === 'courtyard') {
      // walled compound with square courtyards and golden-roofed halls
      const r = c.r - 2;
      for (let i = -r; i <= r; i++) {
        for (const [px2, py2] of [[c.x + i, c.y - r], [c.x + i, c.y + r], [c.x - r, c.y + i], [c.x + r, c.y + i]]) {
          if (get(px2, py2) !== T.WATER && get(px2, py2) !== T.DEEP) set(px2, py2, T.WALL_STONE);
        }
      }
      for (const gx of [0]) { set(c.x + gx, c.y + r, T.PLAZA); set(c.x + gx, c.y - r, T.PLAZA); }
      set(c.x - r, c.y, T.PLAZA); set(c.x + r, c.y, T.PLAZA);
      // cross avenues first, then halls fill the quarters around them
      for (let i = -r + 1; i <= r - 1; i++) { set(c.x + i, c.y, T.ROAD); set(c.x, c.y + i, T.ROAD); }
      for (let by = -r + 2; by < r - 3; by += 5) for (let bx = -r + 2; bx < r - 4; bx += 6) {
        if (rng(bx, by) < 0.8) building(c.x + bx, c.y + by, 4, 3, wall, roof);
      }
    } else if (c.style === 'saloon') {
      // one wide dusty main street, false-front buildings either side
      for (let i = -c.r + 1; i <= c.r - 1; i++) for (let wgt = -1; wgt <= 1; wgt++) set(c.x + i, c.y + wgt, T.ROAD);
      for (let bx = -c.r + 2; bx < c.r - 3; bx += 4) {
        if (rng(bx, 1) < 0.85) building(c.x + bx, c.y - 5, 3, 3, wall, roof);
        if (rng(bx, 2) < 0.85) building(c.x + bx, c.y + 3, 3, 3, wall, roof);
      }
    } else if (c.style === 'mediterranean') {
      // central plaza, ring lane, white terracotta villas
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(c.x + dx, c.y + dy, T.PLAZA);
      const ringR = c.r - 3;
      for (let a = 0; a < 40; a++) {
        const ang = (a / 40) * Math.PI * 2;
        set(Math.round(c.x + Math.cos(ang) * ringR), Math.round(c.y + Math.sin(ang) * ringR), T.ROAD);
      }
      for (let a = 0; a < 9; a++) {
        const ang = (a / 9) * Math.PI * 2 + 0.3;
        const bx = Math.round(c.x + Math.cos(ang) * (ringR - 3)) - 1;
        const by = Math.round(c.y + Math.sin(ang) * (ringR - 3)) - 1;
        if (rng(a, 0) < 0.9) building(bx, by, 3, 3, wall, roof);
      }
    } else if (c.style === 'highland') {
      // cottages scattered along a winding lane
      let lx = c.x - c.r + 2, ly = c.y + Math.round((rng(0, 9) - 0.5) * 4);
      for (let i = 0; i < c.r * 2 - 3; i++) {
        set(lx, ly, T.ROAD);
        set(lx, ly + 1, T.ROAD);
        lx += 1; ly += Math.round((fbm(lx, ly, 4, seed + 76) - 0.5) * 2.4);
        if (i % 4 === 1 && rng(i, 3) < 0.8) building(lx - 1, ly - 5, 3, 3, wall, roof);
        if (i % 5 === 2 && rng(i, 4) < 0.8) building(lx - 1, ly + 3, 3, 3, wall, roof);
      }
    } else if (c.style === 'jungle') {
      // huts around clearings, connected by narrow trails
      for (let a = 0; a < 6; a++) {
        const ang = (a / 6) * Math.PI * 2;
        const hx = Math.round(c.x + Math.cos(ang) * (c.r - 4));
        const hy = Math.round(c.y + Math.sin(ang) * (c.r - 4));
        building(hx - 1, hy - 1, 3, 3, wall, roof);
        const steps = c.r;
        for (let s2 = 0; s2 < steps; s2++) {
          const f = s2 / steps;
          const tx = Math.round(c.x + (hx - c.x) * f), ty = Math.round(c.y + 2 + (hy + 3 - c.y) * f);
          if (get(tx, ty) !== T.ROOF_LEAF && get(tx, ty) !== T.WALL) set(tx, ty, T.TRAIL);
        }
      }
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(c.x + dx, c.y + dy, T.PLAZA);
    }
  }
  for (const c of cities) stampCity(c);

  /* ============================================================
     Landmarks — interactive hub buildings.
     ============================================================ */
  const landmarks = [];

  function stampLandmark(lm) {
    const { wall, roof } = PROV_WALLS[lm.prov];
    const { x, y, w, h } = lm;
    for (let dy = -1; dy <= h + 1; dy++) for (let dx = -1; dx <= w; dx++) {
      const t = get(x + dx, y + dy);
      if (t === T.WATER || t === T.DEEP) return; // refuse to build in the sea
    }
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
      set(x + dx, y + dy, dy >= h - 1 ? wall : roof);
    }
    const doorX = x + (w >> 1), doorY = y + h - 1;
    set(doorX, doorY, T.DOOR);
    for (let dx = -1; dx <= 1; dx++) for (let dy = 1; dy <= 2; dy++) {
      const t = get(doorX + dx, doorY + dy);
      if (t !== T.WATER && t !== T.DEEP) set(doorX + dx, doorY + dy, T.PLAZA);
    }
    lm.doorX = doorX; lm.doorY = doorY;
    landmarks.push(lm);
  }

  /* The Panhellenium — great circular sanctuary on the Pontium cape */
  function stampPanhellenium(cx, cy) {
    const R = 5;
    for (let dy = -R - 1; dy <= R + 1; dy++) for (let dx = -R - 1; dx <= R + 1; dx++) {
      const d = Math.hypot(dx, dy);
      if (d <= R + 0.5 && d >= R - 0.7) set(cx + dx, cy + dy, T.WALL_MARBLE);
      else if (d < R - 0.7) set(cx + dx, cy + dy, T.PLAZA);
    }
    set(cx, cy + R, T.DOOR);
    set(cx, cy + R + 1, T.PLAZA); set(cx, cy + R + 2, T.PLAZA);
    const lm = {
      prov: 'TF', name: 'The Panhellenium', ico: '🏛️',
      desc: 'The great round sanctuary of every goddess of luck',
      x: cx - R, y: cy - R, w: R * 2, h: R * 2,
      doorX: cx, doorY: cy + R, games: ['oracle', 'tali'],
    };
    landmarks.push(lm);
  }
  stampPanhellenium(176, 29);

  /* Horseshoe Downs racetrack oval */
  (function stampRacetrack(cx, cy) {
    for (let a = 0; a < 100; a++) {
      const ang = (a / 100) * Math.PI * 2;
      const tx = Math.round(cx + Math.cos(ang) * 9), ty = Math.round(cy + Math.sin(ang) * 5);
      for (const [ox, oy] of [[0, 0], [1, 0]]) {
        const t = get(tx + ox, ty + oy);
        if (t !== T.WATER && t !== T.DEEP) set(tx + ox, ty + oy, T.ROAD);
      }
    }
  })(40, 206);

  /* prov, name, icon, description, x, y, w, h, games */
  const LM = [
    ['TF', 'Coliseum of Pontium', '🏟️', 'Chariots thunder for your denarii', 168, 44, 8, 5, ['chariots', 'tali']],
    ['TF', 'Temple of Tyche', '🏛️', 'Marble halls above the western cape', 117, 51, 6, 4, ['oracle', 'tali']],
    ['TF', 'Temple of Fortuna', '🏛️', 'Gilded seat of the eastern court', 233, 30, 6, 4, ['oracle', 'chariots']],
    ['TF', 'Epineion Harbourhouse', '⚓', 'Sailors bet the tide here', 236, 58, 5, 4, ['tali', 'cointoss']],
    ['TF', 'Fort Upsilonia', '⚓', "Leonidas' island navy — cross at low tide", 128, 18, 6, 4, ['tali', 'chariots']],
    ['FL', 'Ballyclover Castle', '🏰', 'Ancient keep of the Four Leaf kings', 112, 101, 8, 6, ['cointoss', 'roadbowls', 'rainbow']],
    ['FL', 'Rapidstown Bookmakers', '📓', 'Odds on anything that moves', 22, 124, 5, 4, ['roadbowls', 'cointoss']],
    ['FL', 'Puffin Point Light', '🗼', 'The luckiest lighthouse in the Republic', 22, 85, 4, 4, ['rainbow']],
    ['HV', 'Horseshoe Downs', '🏇', 'The dustiest derby in the west', 36, 199, 9, 5, ['ponies', 'fivecard']],
    ['HV', 'The Grand Saloon', '🤠', 'Swing the doors, draw your luck', 85, 163, 7, 5, ['fivecard', 'standoff']],
    ['DG', 'Flat Palace', '🏯', 'Broad courts of the western dragon lords', 132, 170, 8, 5, ['mahjong', 'sicbo']],
    ['DG', 'Golden Tiger Hall', '🏯', "Tiger City's roaring gambling court", 152, 183, 9, 6, ['mahjong', 'sicbo']],
    ['DG', 'Kite Pavilion', '🪁', 'Where fortunes ride the mountain wind', 202, 129, 6, 4, ['sicbo', 'mahjong']],
    ['DG', 'Hidden Temple', '🍵', 'Whispered of, rarely found', 198, 149, 5, 4, ['teahouse']],
    ['DG', 'Shady Temple', '⛩️', 'High stakes in low light', 222, 145, 6, 4, ['sicbo', 'teahouse']],
    ['DG', 'Peekaboo Palace', '🏯', 'Now you see your winnings…', 236, 153, 7, 5, ['mahjong', 'teahouse']],
    ['EP', 'The Golden Temple', '🛕', 'Bells, bells, and blessed bells', 233, 164, 7, 5, ['spirits', 'haiko']],
    ['EP', 'Roaring Elephant Arena', '🥊', "Khrueang's ring of glory", 333, 178, 8, 6, ['muaythai', 'haiko']],
    ['EP', 'Waterfall Park Pavilion', '⛲', 'Wager to the sound of falling water', 297, 211, 5, 4, ['haiko', 'spirits']],
    ['MN', 'Magic Mushroom Casino', '🍄', 'Neon towers of endless pachinko', 293, 68, 8, 6, ['pachinko', 'slots']],
    ['MN', 'Grand Sumo Arena', '🏟️', 'Where mountains collide', 314, 61, 7, 5, ['sumo', 'pachinko']],
    ['MN', 'Horizon Park Lookout', '⛩️', 'Views over the beckoning sea', 342, 27, 5, 4, ['pachinko']],
  ];
  for (const [p, name, ico, desc, x, y, w, h, games] of LM) {
    stampLandmark({ prov: p, name, ico, desc, x, y, w, h, games });
  }

  /* ============================================================
     Roads & trails — the drawn routes, winding, carved through
     rock as narrow mountain trails.
     ============================================================ */
  function carvePath(pts, wide = 1) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2;
      for (let s = 0; s <= steps; s++) {
        const f = s / steps;
        const cx = Math.round(ax + (bx - ax) * f + (fbm(s * 2 + i * 31, i * 13, 7, seed + 80) - 0.5) * 4);
        const cy = Math.round(ay + (by - ay) * f + (fbm(i * 13, s * 2 + i * 31, 7, seed + 81) - 0.5) * 4);
        const inRock = get(cx, cy) === T.MOUNTAIN || get(cx, cy) === T.PEAK || get(cx, cy) === T.CLIFF;
        const w = inRock ? 0 : wide;
        for (let dy = 0; dy <= w; dy++) for (let dx = 0; dx <= w; dx++) {
          const t = get(cx + dx, cy + dy);
          if (t === T.WATER) set(cx + dx, cy + dy, T.BRIDGE);
          else if (t === T.MOUNTAIN || t === T.PEAK || t === T.CLIFF) set(cx + dx, cy + dy, T.TRAIL);
          else if (t !== T.DEEP && t !== T.WALL && t !== T.ROOF && t !== T.DOOR && t !== T.BRIDGE &&
                   t !== T.TIDAL && t !== T.PLAZA && t !== T.NEON && t !== T.WALL_MARBLE &&
                   t !== T.WALL_STONE && t !== T.ROOF_GOLD && t !== T.ROOF_SLATE && t !== T.ROOF_LEAF) {
            set(cx + dx, cy + dy, inRock ? T.TRAIL : T.ROAD);
          }
        }
      }
    }
  }
  const trail = (pts) => carvePath(pts, 0);

  // The great western road (FL/TF border, from the northern capes to J1)
  carvePath([[101, 30], [95, 50], [104, 66], [118, 82], [128, 96], [146, 107]]);
  // Dragonspine road east: J1 -> Heaven Lake -> Mount Snow junction
  carvePath([[146, 107], [162, 108], [178, 111], [203, 114], [221, 120]]);
  // NE spur to the Paradise Sea overlook
  carvePath([[221, 120], [232, 116], [239, 113]]);
  // SE road: Mount Snow -> Thunder Steps -> deep Elephantium
  carvePath([[221, 120], [236, 136], [250, 151], [258, 160], [264, 172], [271, 182], [279, 199], [295, 212], [308, 217]]);
  // South road: J1 -> Green Gorge -> J3 (Horseshoeville fork)
  carvePath([[146, 107], [140, 120], [130, 133], [117, 142], [112, 151]]);
  carvePath([[112, 151], [100, 158], [88, 166]]);                    // -> Downtown Horseshoeville
  carvePath([[112, 151], [120, 162], [125, 176], [128, 190], [133, 205], [137, 217]]); // -> south coast
  carvePath([[126, 187], [140, 187], [152, 187]]);                   // Tiger City bridge road
  // FL internal
  carvePath([[128, 96], [120, 110], [113, 120]]);                    // castle spur
  carvePath([[110, 124], [80, 125], [52, 126], [30, 127]]);          // Ballyclover -> Rapidstown
  carvePath([[28, 124], [24, 106], [24, 92]]);                       // -> Puffin Point
  // HV internal
  carvePath([[86, 168], [64, 184], [46, 200]]);                      // -> Horseshoe Downs
  // TF coastal way
  carvePath([[122, 50], [148, 46], [170, 45], [198, 40], [222, 36], [234, 34]]);
  carvePath([[173, 41], [176, 35]]);                                 // Pontium -> Panhellenium
  carvePath([[234, 36], [237, 50], [238, 57]]);                      // -> Epineion
  carvePath([[122, 51], [112, 62], [104, 66]]);                      // Tyche -> western road
  // Maneki metropolitan links
  carvePath([[292, 45], [292, 58], [296, 66]]);
  carvePath([[298, 66], [310, 64], [316, 63]]);
  carvePath([[289, 42], [286, 34], [284, 30]]);
  // Dragonia links
  carvePath([[150, 184], [142, 180], [136, 177]]);                   // Tiger -> Flat Palace
  carvePath([[221, 120], [212, 126], [206, 131]]);                   // -> Kite City
  carvePath([[250, 151], [242, 154], [239, 155]]);                   // -> Peekaboo Palace
  carvePath([[258, 160], [252, 166], [249, 169], [240, 170], [236, 169]]); // -> Temple City / Golden Temple
  // hidden mountain trails
  trail([[168, 110], [164, 119], [160, 127], [155, 136]]);           // Green Gorge secret pass
  trail([[178, 108], [182, 99], [188, 97]]);                         // Heaven Lake shore path
  trail([[221, 122], [225, 129], [229, 134]]);                       // Mount Colossus climb
  trail([[206, 136], [202, 143], [200, 148]]);                       // Kite City -> Hidden Temple
  trail([[236, 138], [230, 143], [226, 146]]);                       // -> Shady Temple
  trail([[268, 176], [284, 170], [298, 165]]);                       // Cyan springs trail
  trail([[300, 166], [318, 172], [330, 178], [334, 180]]);           // arena back trail
  trail([[60, 126], [56, 112], [58, 100]]);                          // clover cliff walk
  trail([[64, 184], [52, 176], [48, 176]]);                          // mesa overlook
  trail([[338, 24], [343, 28]]);                                     // Neko shrine steps

  /* Crossluck Pass — the starting trailhead in the heart of the map */
  const START = { x: 180, y: 119 };
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    if (Math.abs(dx) + Math.abs(dy) <= 3) set(START.x + dx, START.y + dy, T.PLAZA);
  }
  trail([[180, 116], [179, 112]]); // link up to the Dragonspine road

  /* ============================================================
     Street gambling events near roads, per province
     ============================================================ */
  const roadByProv = {};
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = get(x, y);
    if (t === T.ROAD || t === T.NEON || t === T.PLAZA) {
      const code = PROV_LIST[prov[idx(x, y)]];
      (roadByProv[code] ||= []).push([x, y]);
    }
  }
  const EVENT_DEFS = {
    TF: { game: 'tali', ico: '🎲', label: 'Street Tali' },
    FL: { game: 'roadbowls', ico: '🥎', label: 'Road Bowls' },
    HV: { game: 'standoff', ico: '🔫', label: 'Showdown!' },
    DG: { game: 'mahjong', ico: '🀄', label: 'Alley Mahjong' },
    EP: { game: 'haiko', ico: '🃏', label: 'Haiko Corner' },
    MN: { game: 'pachinko', ico: '🎰', label: 'Pachinko Stand' },
  };
  const events = [];
  for (const code of Object.keys(EVENT_DEFS)) {
    const spots = roadByProv[code] || [];
    const used = new Set();
    for (let i = 0; i < 10 && spots.length; i++) {
      const j = Math.floor(hash2(i, 999, seed + 90 + i) * spots.length);
      if (used.has(j)) continue;
      used.add(j);
      const [x, y] = spots[j];
      if (get(x, y - 1) === T.DOOR) continue;
      events.push({ x, y, prov: code, ...EVENT_DEFS[code] });
    }
  }

  /* ============================================================
     Named places — secret zones & region callouts
     ============================================================ */
  const zones = [
    { name: 'Hidden Cove', x: cove.x, y: cove.y, r: cove.r - 2, tidal: true },
    { name: 'Upsilonia Shore', x: 128, y: 22, r: 7, tidal: true },
    { name: 'Neon Strait Sandbar', x: 328, y: 25, r: 5, tidal: true },
    { name: 'Lung Island', x: 191, y: 219, r: 7, tidal: true },
    { name: 'Rapids Ford', x: 36, y: 133, r: 4, tidal: true },
  ];

  /* Region name callouts (ordered: most specific first). */
  const regions = [
    { name: '⛰️ Green Gorge', x: 162, y: 124, r: 7 },
    { name: '🏞️ Heaven Lake', x: 184, y: 103, r: 10 },
    { name: '🏔️ Mount Snow', x: 220, y: 126, r: 5 },
    { name: '🏔️ Mount Colossus', x: 229, y: 136, r: 7 },
    { name: '🌉 Crossluck Pass', x: 180, y: 119, r: 5 },
    { name: '🐉 Lung Island', x: 191, y: 219, r: 8 },
    { name: '🏝️ Hidden Cove', x: 344, y: 148, r: 6 },
    { name: '⚓ Upsilonia', x: 130, y: 19, r: 12 },
    { name: '🌈 Clover Cliffs', x: 57, y: 108, r: 8 },
    { name: '🏜️ Sunbleached Mesas', x: 52, y: 180, r: 12 },
    { name: '🌊 Tychean Sea', x: 120, y: 33, r: 8 },
    { name: '🌊 Fortunian Sea', x: 204, y: 30, r: 8 },
    { name: '🌊 Neon Strait', x: 328, y: 24, r: 6 },
    { name: '🌊 Paradise Sea', x: 276, y: 100, r: 24 },
    { name: '🌊 Dragon’s Bay', x: 114, y: 156, r: 8 },
    { name: '🏞️ Great River', x: 66, y: 132, r: 5 },
    { name: '🏞️ Red River', x: 138, y: 191, r: 4 },
    { name: '🏞️ Lucky River', x: 249, y: 190, r: 5 },
    { name: '🏞️ Cyan River', x: 306, y: 190, r: 5 },
    { name: '⛰️ The Dragonspine', x: 184, y: 110, r: 14 },
    { name: '⛰️ The Emerald Divide', x: 120, y: 60, r: 10 },
    { name: '⛰️ The Thunder Steps', x: 259, y: 168, r: 10 },
    { name: '⛰️ The Mist Peaks', x: 304, y: 162, r: 14 },
    { name: '🌾 Rolling Hills', x: 155, y: 85, r: 12 },
    { name: '🌾 Tychean Hills', x: 131, y: 63, r: 9 },
    { name: '🌾 Fortunian Hills', x: 216, y: 96, r: 11 },
    { name: '🐧 Puffin Skerries', x: 12, y: 70, r: 8 },
  ];

  return {
    W, H, tiles, prov, landmarks, events, zones, regions, cities, start: START,
    idx, get, inB,
    provAt(x, y) {
      return PROV_LIST[prov[idx(Math.max(0, Math.min(W - 1, x)), Math.max(0, Math.min(H - 1, y)))]];
    },
  };
}
