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
  ROOF_GOLD: 28, ROOF_SLATE: 29, ROOF_LEAF: 30, SHALLOW: 31,
  FOUNDATION: 32,   // solid ground under a building sprite
  TALLGRASS: 33,    // walkable rustling grass — prime Lucklian habitat
  BUSH: 34,         // walkable low brush — prime Lucklian habitat
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


const SOLID = new Set([
  T.DEEP, T.WATER, T.MOUNTAIN, T.PEAK, T.CLIFF, T.FOREST, T.JUNGLE,
  T.WALL, T.ROOF, T.WALL_MARBLE, T.WALL_STONE, T.ROOF_GOLD, T.ROOF_SLATE, T.ROOF_LEAF,
  T.FOUNDATION, T.DOOR,  // doors block movement too — bumping one opens the hub
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
          // mountainous jungle paradise: canopy clusters with roomy gaps
          t = rough > 0.55 ? T.JUNGLE : T.GRASS;
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
      const th = { DG: 0.71, EP: 0.77, TF: 0.78, FL: 0.79, MN: 0.82, HV: 0.86 }[code] ?? 1;
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

  /* Serpent Strait — a natural channel keeping Lung Island offshore */
  river([[114, 204], [142, 205], [172, 206], [202, 207], [216, 206]], 3);
  /* Neon Strait — the channel that keeps Neko its own island */
  river([[318, 4], [321, 14], [325, 22], [329, 30], [333, 38], [337, 46], [342, 54]], 2);

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
  tidalLine(314, 32, 342, 18);     // Neon Strait sandbar (Maneki <-> Neko)
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

  /* --- shore shallows: sea within 2 tiles of land is wadeable ---
     (after tidal features so flats and causeways keep their gating;
     wide waters keep a solid deep channel in the middle) --- */
  {
    const landish = (t) => t !== T.WATER && t !== T.DEEP && t !== T.TIDAL && t !== T.SHALLOW;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (get(x, y) !== T.WATER) continue;
        let nearLand = false;
        for (let dy = -2; dy <= 2 && !nearLand; dy++)
          for (let dx = -2; dx <= 2; dx++)
            if (landish(get(x + dx, y + dy))) { nearLand = true; break; }
        if (nearLand) set(x, y, T.SHALLOW);
      }
    }
    // re-deepen the tide-gated straits so wading can't bypass the causeways
    const deepen = (x0, y0, x1, y1) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (get(x, y) === T.SHALLOW) set(x, y, T.WATER);
      }
    };
    deepen(106, 20, 164, 48);   // Tychean Sea — the Upsilonia causeway is the only way over
    deepen(306, 0, 352, 56);    // Neon Strait — the sandbar is the only way over
  }

  /* ============================================================
     Cities — big, built-up, styled per province culture.
     ============================================================ */
  const cities = [
    /* ---- the great cities (expanded) ---- */
    { name: 'Ballyclover', prov: 'FL', x: 112, y: 124, r: 14, style: 'highland', citizens: 11 },
    { name: 'Downtown Horseshoeville', prov: 'HV', x: 88, y: 167, r: 14, style: 'saloon', citizens: 12 },
    { name: 'Tyche', prov: 'TF', x: 122, y: 48, r: 13, style: 'mediterranean', citizens: 11 },
    { name: 'Pontium', prov: 'TF', x: 173, y: 43, r: 13, style: 'mediterranean', citizens: 11 },
    { name: 'Fortuna', prov: 'TF', x: 236, y: 34, r: 12, style: 'mediterranean', citizens: 10 },
    { name: 'Epineion', prov: 'TF', x: 238, y: 60, r: 10, style: 'mediterranean', citizens: 7 },
    { name: 'Tiger City', prov: 'DG', x: 155, y: 186, r: 15, style: 'courtyard', citizens: 13 },
    { name: 'Kite City', prov: 'DG', x: 205, y: 132, r: 11, style: 'courtyard', citizens: 9 },
    { name: "Dragon's Bay", prov: 'DG', x: 134, y: 155, r: 10, style: 'courtyard', citizens: 8 },
    { name: 'Downtown Maneki', prov: 'MN', x: 292, y: 52, r: 16, style: 'grid', citizens: 18 },
    /* ---- established towns ---- */
    { name: 'Puffin Point', prov: 'FL', x: 24, y: 88, r: 6, style: 'highland', citizens: 3 },
    { name: 'Horseshoe Downs', prov: 'HV', x: 40, y: 203, r: 9, style: 'saloon', citizens: 5 },
    { name: 'Temple City', prov: 'EP', x: 249, y: 172, r: 9, style: 'jungle', citizens: 7 },
    { name: 'Waterfall Park', prov: 'EP', x: 311, y: 218, r: 6, style: 'jungle', citizens: 3 },
    { name: 'East Maneki', prov: 'MN', x: 317, y: 66, r: 8, style: 'grid', citizens: 6 },
    { name: 'North Maneki', prov: 'MN', x: 284, y: 30, r: 7, style: 'grid', citizens: 5 },
    { name: 'Neko Town', prov: 'MN', x: 338, y: 23, r: 6, style: 'grid', citizens: 4 },
    /* ---- Kilfenny keeps the north bank; Rapidstown moves south of the river ---- */
    { name: 'Kilfenny', prov: 'FL', x: 24, y: 126, r: 8, style: 'highland', citizens: 5 },
    { name: 'Rapidstown', prov: 'HV', x: 27, y: 143, r: 8, style: 'saloon', citizens: 5 },
    /* ---- new countryside towns, villages & farms ---- */
    { name: 'Dunmara', prov: 'FL', x: 60, y: 60, r: 7, style: 'highland', citizens: 4 },
    { name: 'Bramblewick Farm', prov: 'FL', x: 90, y: 90, r: 5, style: 'highland', citizens: 3 },
    { name: 'Oliveto', prov: 'TF', x: 152, y: 68, r: 7, style: 'mediterranean', citizens: 4 },
    { name: 'Argos Vale', prov: 'TF', x: 140, y: 88, r: 5, style: 'mediterranean', citizens: 3 },
    { name: 'Vulture Gulch', prov: 'HV', x: 55, y: 160, r: 6, style: 'saloon', citizens: 4 },
    { name: 'Twin Spurs Ranch', prov: 'HV', x: 75, y: 195, r: 5, style: 'saloon', citizens: 3 },
    { name: 'Lotus Ford', prov: 'DG', x: 145, y: 150, r: 6, style: 'courtyard', citizens: 4 },
    { name: 'Jade Terraces', prov: 'DG', x: 175, y: 165, r: 5, style: 'courtyard', citizens: 3 },
    /* ---- Elephantium's missing big cities ---- */
    { name: 'Sawan City', prov: 'EP', x: 280, y: 155, r: 12, style: 'jungle', citizens: 10 },
    { name: 'Chao Lom', prov: 'EP', x: 298, y: 202, r: 11, style: 'jungle', citizens: 9 },
    { name: 'Mai Pai', prov: 'EP', x: 270, y: 130, r: 5, style: 'jungle', citizens: 3 },
    { name: 'Koban Row', prov: 'MN', x: 280, y: 68, r: 6, style: 'grid', citizens: 5 },
  ];

  const cityFloor = { highland: T.MEADOW, saloon: T.DUST, mediterranean: T.PLAZA, courtyard: T.PLAZA, jungle: T.GRASS, grid: T.NEON };

  /* Buildings are records rendered as big multi-tile sprites; their
     footprint tiles become solid FOUNDATION for collision. */
  const buildings = [];

  /* Ground memory: the terrain that sat under each footprint tile before
     stamping. The renderer draws THIS beneath a building/prop sprite, so
     the transparent parts of a sprite (roof tapers, wall insets, the space
     around a statue) show grass on grass, rock on rock, neon on neon —
     never a mismatched grey slab. 255 = no override. */
  const ground = new Uint8Array(W * H).fill(255);
  function rememberGround(x, y) {
    if (inB(x, y) && ground[idx(x, y)] === 255) ground[idx(x, y)] = tiles[idx(x, y)];
  }

  function clearFlat(cx, cy, r, floor) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > r + (fbm(cx + dx, cy + dy, 5, seed + 70) - 0.5) * 3) continue;
      const t = get(cx + dx, cy + dy);
      if (t === T.WATER || t === T.DEEP || t === T.TIDAL || t === T.BRIDGE || t === T.SHALLOW ||
          t === T.FOUNDATION || t === T.DOOR) continue; // never pave through a standing building
      // paved almost wall to wall — a city, not a lawn
      set(cx + dx, cy + dy, d < r * 0.9 && hash2(cx + dx, cy + dy, seed + 71) > 0.1 ? floor : baseGroundFor(cx + dx, cy + dy));
    }
  }
  function baseGroundFor(x, y) {
    const code = PROV_LIST[prov[idx(x, y)]];
    return { TF: T.GRASS, FL: T.MEADOW, HV: T.DUST, DG: T.GRASS, EP: T.GRASS, MN: T.GRASS }[code] ?? T.GRASS;
  }

  function building(bx, by, bw, bh, provCode, kind = 'house') {
    // buildings sit flush against streets; only the footprint must be clear
    for (let dy = 0; dy < bh; dy++) for (let dx = 0; dx < bw; dx++) {
      const t = get(bx + dx, by + dy);
      if (t === T.WATER || t === T.DEEP || t === T.SHALLOW || t === T.TIDAL ||
          t === T.DOOR || t === T.ROAD || t === T.BRIDGE || t === T.FOUNDATION ||
          t === T.WALL_MARBLE || t === T.WALL_STONE) return false;
    }
    for (let dy = 0; dy < bh; dy++) for (let dx = 0; dx < bw; dx++) {
      rememberGround(bx + dx, by + dy);
      set(bx + dx, by + dy, T.FOUNDATION);
    }
    buildings.push({ x: bx, y: by, w: bw, h: bh, prov: provCode, kind, v: (hash2(bx, by, seed + 74) * 1e6) | 0 });
    return true;
  }

  /* Architectural mix per city style — picked per building so streets
     read as real neighbourhoods, not one stamped shape. */
  const KIND_POOLS = {
    grid: ['tower', 'tower', 'tower4', 'casino', 'warehouse', 'needle', 'tower4'],
    mediterranean: ['villa', 'villa', 'temple', 'dome', 'villa', 'temple'],
    highland: ['cottage', 'cottage', 'pub', 'barn', 'cottage', 'pub'],
    saloon: ['saloon', 'saloon', 'ranch', 'saloon', 'barn', 'ranch'],
    courtyard: ['hall', 'pagoda', 'hall', 'fortress', 'pagoda', 'hall'],
    jungle: ['hut', 'stilt', 'hut', 'redlight', 'stilt', 'hut'],
  };

  function stampCity(c) {
    const floor = cityFloor[c.style];
    clearFlat(c.x, c.y, c.r, floor);
    const rng = (i, j) => hash2(c.x * 7 + i, c.y * 3 + j, seed + 75);
    const pool = KIND_POOLS[c.style];
    const pick2 = (i, j) => pool[Math.floor(rng(i, j) * pool.length)];

    if (c.style === 'grid') {
      // metropolis with an organic street net: variable block sizes,
      // buildings sized to their block — no perfect checkerboard
      for (let gy = -c.r + 1; gy <= c.r - 1; gy++) for (let gx = -c.r + 1; gx <= c.r - 1; gx++) {
        if (Math.hypot(gx, gy) > c.r - 1) continue;
        set(c.x + gx, c.y + gy, T.NEON);
      }
      const colsArr = [], rowsArr = [];
      for (let p = -c.r + 1; p < c.r; p += 4 + Math.floor(rng(p, 21) * 2)) colsArr.push(p);
      for (let p = -c.r + 1; p < c.r; p += 3 + Math.floor(rng(p, 22) * 2)) rowsArr.push(p);
      for (const gc of colsArr) for (let gy = -c.r + 1; gy <= c.r - 1; gy++) {
        if (Math.hypot(gc, gy) <= c.r - 1 && rng(gc * 3, gy) > 0.06) set(c.x + gc, c.y + gy, T.ROAD);
      }
      for (const gr of rowsArr) for (let gx = -c.r + 1; gx <= c.r - 1; gx++) {
        if (Math.hypot(gx, gr) <= c.r - 1 && rng(gx, gr * 3) > 0.06) set(c.x + gx, c.y + gr, T.ROAD);
      }
      for (let ci = 0; ci < colsArr.length - 1; ci++) for (let ri = 0; ri < rowsArr.length - 1; ri++) {
        const bx = colsArr[ci] + 1, by = rowsArr[ri] + 1;
        const bw = Math.min(colsArr[ci + 1] - colsArr[ci] - 1, 4);
        const bh = Math.min(rowsArr[ri + 1] - rowsArr[ri] - 1, 3);
        if (bw < 3 || bh < 2) continue;
        if (Math.hypot(bx + bw / 2, by + bh / 2) > c.r - 2) continue;
        if (rng(ci, ri + 50) < 0.92) building(c.x + bx, c.y + by, bw, bh, c.prov, pick2(ci, ri));
      }
    } else if (c.style === 'courtyard') {
      // walled compound packed with golden-roofed halls around cross avenues
      const r = c.r - 2;
      for (let i = -r; i <= r; i++) {
        for (const [px2, py2] of [[c.x + i, c.y - r], [c.x + i, c.y + r], [c.x - r, c.y + i], [c.x + r, c.y + i]]) {
          if (get(px2, py2) !== T.WATER && get(px2, py2) !== T.DEEP) set(px2, py2, T.WALL_STONE);
        }
      }
      for (const gx of [0]) { set(c.x + gx, c.y + r, T.PLAZA); set(c.x + gx, c.y - r, T.PLAZA); }
      set(c.x - r, c.y, T.PLAZA); set(c.x + r, c.y, T.PLAZA);
      for (let i = -r + 1; i <= r - 1; i++) { set(c.x + i, c.y, T.ROAD); set(c.x, c.y + i, T.ROAD); }
      for (let by = -r + 1; by < r - 2; by += 3) for (let bx = -r + 1; bx < r - 4; bx += 5) {
        if (rng(bx, by) < 0.9) building(c.x + bx, c.y + by, 3 + Math.floor(rng(bx, by + 9) * 2), 2, c.prov, pick2(bx, by));
      }
    } else if (c.style === 'saloon') {
      // one wide dusty main street, low false fronts shoulder to shoulder
      for (let i = -c.r + 1; i <= c.r - 1; i++) for (let wgt = -1; wgt <= 1; wgt++) set(c.x + i, c.y + wgt, T.ROAD);
      for (let bx = -c.r + 2; bx < c.r - 3; bx += 3) {
        if (rng(bx, 1) < 0.94) building(c.x + bx, c.y - 4, 3, 2, c.prov, 'saloon');
        if (rng(bx, 2) < 0.94) building(c.x + bx, c.y + 3, 3, 2, c.prov, 'saloon');
        if (rng(bx, 3) < 0.6) building(c.x + bx, c.y - 8, 3, 2, c.prov, pick2(bx, 5));
        if (rng(bx, 4) < 0.6) building(c.x + bx, c.y + 7, 3, 2, c.prov, pick2(bx, 6));
      }
    } else if (c.style === 'mediterranean') {
      // central plaza, ring lane, villas crowding both sides of the ring
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const t = get(c.x + dx, c.y + dy);
        if (t !== T.FOUNDATION && t !== T.DOOR) set(c.x + dx, c.y + dy, T.PLAZA);
      }
      const ringR = c.r - 3;
      for (let a = 0; a < 40; a++) {
        const ang = (a / 40) * Math.PI * 2;
        set(Math.round(c.x + Math.cos(ang) * ringR), Math.round(c.y + Math.sin(ang) * ringR), T.ROAD);
      }
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * Math.PI * 2 + 0.3;
        const bx = Math.round(c.x + Math.cos(ang) * (ringR - 2.4)) - 1;
        const by = Math.round(c.y + Math.sin(ang) * (ringR - 2.4)) - 1;
        if (rng(a, 0) < 0.92) building(bx + Math.round((rng(a, 8) - 0.5) * 2), by, 3, rng(a, 7) < 0.35 ? 3 : 2, c.prov, pick2(a, 0));
      }
      for (let a = 0; a < 10; a++) {
        const ang = (a / 10) * Math.PI * 2;
        const bx = Math.round(c.x + Math.cos(ang) * (ringR + 2.4)) - 1;
        const by = Math.round(c.y + Math.sin(ang) * (ringR + 2.4)) - 1;
        if (rng(a, 5) < 0.85) building(bx + Math.round((rng(a, 9) - 0.5) * 2), by, 3, 2, c.prov, pick2(a, 5));
      }
    } else if (c.style === 'highland') {
      // cottages packed along a winding lane
      let lx = c.x - c.r + 2, ly = c.y + Math.round((rng(0, 9) - 0.5) * 4);
      for (let i = 0; i < c.r * 2 - 3; i++) {
        set(lx, ly, T.ROAD);
        set(lx, ly + 1, T.ROAD);
        lx += 1; ly += Math.round((fbm(lx, ly, 4, seed + 76) - 0.5) * 2.4);
        if (i % 3 === 1 && rng(i, 3) < 0.9) building(lx - 1, ly - 4, 3, 2, c.prov, pick2(i, 3));
        if (i % 3 === 2 && rng(i, 4) < 0.9) building(lx - 1, ly + 3, 3, 2, c.prov, pick2(i, 4));
      }
    } else if (c.style === 'jungle') {
      // stilt huts around clearings, connected by narrow trails
      for (let a = 0; a < 9; a++) {
        const ang = (a / 9) * Math.PI * 2;
        const hx = Math.round(c.x + Math.cos(ang) * (c.r - 4));
        const hy = Math.round(c.y + Math.sin(ang) * (c.r - 4));
        building(hx - 1, hy - 1, 3, 2, c.prov, pick2(a, 1));
        const steps = c.r;
        for (let s2 = 0; s2 < steps; s2++) {
          const f = s2 / steps;
          const tx = Math.round(c.x + (hx - c.x) * f), ty = Math.round(c.y + 2 + (hy + 3 - c.y) * f);
          if (get(tx, ty) !== T.FOUNDATION) set(tx, ty, T.TRAIL);
        }
      }
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const t = get(c.x + dx, c.y + dy);
        if (t !== T.FOUNDATION && t !== T.DOOR) set(c.x + dx, c.y + dy, T.PLAZA);
      }
    }

    // decorative street props: lanterns, barrels, flowerbeds, statues…
    const propTargets = new Set([cityFloor[c.style], T.PLAZA, T.NEON, T.GRASS, T.MEADOW, T.DUST]);
    let placed = 0;
    for (let attempt = 0; attempt < 60 && placed < Math.round(c.r * 0.8) + 3; attempt++) {
      const ang = rng(attempt, 11) * Math.PI * 2;
      const d = 2 + rng(attempt, 12) * (c.r - 3);
      const px2 = Math.round(c.x + Math.cos(ang) * d), py2 = Math.round(c.y + Math.sin(ang) * d);
      if (!propTargets.has(get(px2, py2))) continue;
      if (get(px2, py2 - 1) === T.DOOR || get(px2, py2 + 1) === T.DOOR) continue;
      if (building(px2, py2, 1, 1, c.prov, 'prop')) placed++;
    }
  }
  for (const c of cities) stampCity(c);

  /* ============================================================
     Landmarks — interactive hub buildings.
     ============================================================ */
  const landmarks = [];

  function stampLandmark(lm) {
    const { x, y, w, h } = lm;
    for (let dy = -1; dy <= h + 1; dy++) for (let dx = -1; dx <= w; dx++) {
      const t = get(x + dx, y + dy);
      if (t === T.WATER || t === T.DEEP) return; // refuse to build in the sea
    }
    // evict any city building the landmark (or its door apron) would overlap
    for (let i = buildings.length - 1; i >= 0; i--) {
      const o = buildings[i];
      if (o.x < x + w + 2 && o.x + o.w > x - 2 && o.y < y + h + 3 && o.y + o.h > y) {
        for (let dy = 0; dy < o.h; dy++) for (let dx = 0; dx < o.w; dx++) {
          if (get(o.x + dx, o.y + dy) === T.FOUNDATION) {
            set(o.x + dx, o.y + dy, T.PLAZA);
            ground[idx(o.x + dx, o.y + dy)] = 255;
          }
        }
        buildings.splice(i, 1);
      }
    }
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
      rememberGround(x + dx, y + dy);
      set(x + dx, y + dy, T.FOUNDATION);
    }
    const doorX = x + (w >> 1), doorY = y + h - 1;
    set(doorX, doorY, T.DOOR);
    for (let dx = -1; dx <= 1; dx++) for (let dy = 1; dy <= 2; dy++) {
      const t = get(doorX + dx, doorY + dy);
      if (t !== T.WATER && t !== T.DEEP) set(doorX + dx, doorY + dy, T.PLAZA);
    }
    lm.doorX = doorX; lm.doorY = doorY;
    const n = lm.name;
    const sub = /Castle/.test(n) ? 'castle'
      : /Coliseum|Arena|Downs/.test(n) ? 'arena'
      : /Casino/.test(n) ? 'casino'
      : /Golden Temple/.test(n) ? 'stupa'
      : /Light\b/.test(n) ? 'lighthouse'
      : lm.prov === 'DG' && /Temple|Palace|Pavilion|Hall/.test(n) ? 'pagoda'
      : /Harbourhouse|Docks|Regatta/.test(n) ? 'warehouse'
      : /Karaoke/.test(n) ? 'casino'
      : null;
    lm.sub = sub;   // interiors style themselves by this too
    buildings.push({ x, y, w, h, prov: lm.prov, kind: 'landmark', sub, v: (hash2(x, y, seed + 74) * 1e6) | 0, doorPx: (w >> 1) * 16 + 8 });
    landmarks.push(lm);
  }

  /* The Panhellenium — great circular sanctuary on the Pontium cape */
  function stampPanhellenium(cx, cy) {
    const R = 5;
    // evict any city building the sanctuary would slice through
    for (let i = buildings.length - 1; i >= 0; i--) {
      const o = buildings[i];
      if (o.x < cx + R + 2 && o.x + o.w > cx - R - 2 && o.y < cy + R + 3 && o.y + o.h > cy - R - 2) {
        for (let dy = 0; dy < o.h; dy++) for (let dx = 0; dx < o.w; dx++) {
          if (get(o.x + dx, o.y + dy) === T.FOUNDATION) {
            set(o.x + dx, o.y + dy, T.PLAZA);
            ground[idx(o.x + dx, o.y + dy)] = 255;
          }
        }
        buildings.splice(i, 1);
      }
    }
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
        if (t !== T.WATER && t !== T.DEEP && t !== T.FOUNDATION && t !== T.DOOR) set(tx + ox, ty + oy, T.ROAD);
      }
    }
  })(40, 206);

  /* prov, name, icon, description, x, y, w, h, games */
  const LM = [
    ['TF', 'Coliseum of Pontium', '🏟️', 'Chariots thunder for your denarii', 168, 44, 8, 5, ['coliseumbets', 'chariots', 'tali', 'wheeltyche']],
    ['TF', 'Temple of Tyche', '🏛️', 'Marble halls above the western cape', 117, 51, 6, 4, ['oracle', 'wheeltyche', 'fatesthread']],
    ['TF', 'Temple of Fortuna', '🏛️', 'Gilded seat of the eastern court', 233, 30, 6, 4, ['oracle', 'amphorae', 'fatesthread']],
    ['TF', 'Epineion Harbourhouse', '⚓', 'Sailors bet the tide here', 236, 58, 5, 4, ['tali', 'cointoss', 'amphorae']],
    ['TF', 'Fort Upsilonia', '⚓', "Leonidas' island navy — cross at low tide", 128, 18, 6, 4, ['tali', 'chariots']],
    ['FL', 'Ballyclover Castle', '🏰', 'Ancient keep of the Four Leaf kings', 112, 101, 8, 6, ['cointoss', 'roadbowls', 'cloverbloom', 'grovereels']],
    ['FL', 'Kilfenny Bookmakers', '📓', 'Odds on anything that moves', 22, 124, 5, 4, ['roadbowls', 'cointoss']],
    ['FL', 'Puffin Point Light', '🗼', 'The luckiest lighthouse in the Republic', 22, 85, 4, 4, ['rainbow']],
    ['HV', 'Horseshoe Downs', '🏇', 'The dustiest derby in the west', 36, 199, 9, 5, ['downsrace', 'ponies', 'fivecard', 'goldencorral']],
    ['HV', 'The Grand Saloon', '🤠', 'Swing the doors, draw your luck', 85, 163, 7, 5, ['fivecard', 'standoff', 'horseshoetoss']],
    ['DG', 'Flat Palace', '🏯', 'Broad courts of the western dragon lords', 132, 170, 8, 5, ['mahjong', 'sicbo', 'pearldrop']],
    ['DG', 'Golden Tiger Hall', '🏯', "Tiger City's roaring gambling court", 152, 183, 9, 6, ['mahjong', 'sicbo', 'ninegates']],
    ['DG', 'Kite Pavilion', '🪁', 'Where fortunes ride the mountain wind', 202, 129, 6, 4, ['sicbo', 'pearldrop']],
    ['DG', 'Hidden Temple', '🍵', 'Whispered of, rarely found', 198, 149, 5, 4, ['teahouse']],
    ['DG', 'Shady Temple', '⛩️', 'High stakes in low light', 222, 145, 6, 4, ['sicbo', 'teahouse']],
    ['DG', 'Peekaboo Palace', '🏯', 'Now you see your winnings…', 236, 153, 7, 5, ['mahjong', 'teahouse', 'dragonhoard']],
    ['EP', 'The Golden Temple', '🛕', 'Bells, bells, and blessed bells', 233, 164, 7, 5, ['spirits', 'haiko', 'spiritlanterns', 'banyan']],
    ['EP', 'Roaring Elephant Arena', '🥊', "Khrueang's ring of glory", 333, 178, 8, 6, ['muaythaibout', 'muaythai', 'haiko', 'nagariver']],
    ['EP', 'Waterfall Park Pavilion', '⛲', 'Wager to the sound of falling water', 297, 211, 5, 4, ['haiko', 'spirits', 'nagariver']],
    ['MN', 'Magic Mushroom Casino', '🍄', 'Neon towers of endless pachinko', 293, 68, 8, 6, ['pachinko', 'slots', 'neonneko', 'coincascade']],
    ['MN', 'Grand Sumo Arena', '🏟️', 'Where mountains collide', 314, 61, 7, 5, ['sumo', 'pachinko', 'catparade']],
    ['MN', 'Horizon Park Lookout', '⛩️', 'Views over the beckoning sea', 342, 27, 5, 4, ['pachinko', 'neonneko']],
    ['DG', 'Grand Regatta House', '🐉', 'Dragon boats thunder down the bay', 128, 160, 8, 5, ['regattabets', 'sicbo']],
    ['MN', 'Neon Koi Karaoke', '🎤', 'Sing-offs and long odds till sunrise', 283, 42, 7, 5, ['karaokebets', 'pachinko']],
  ];
  for (const [p, name, ico, desc, x, y, w, h, games] of LM) {
    stampLandmark({ prov: p, name, ico, desc, x, y, w, h, games });
  }

  /* ============================================================
     Roads & trails — the drawn routes, winding, carved through
     rock as narrow mountain trails.
     ============================================================ */
  function carvePath(pts, wide = 1, dirt = false) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2;
      for (let s = 0; s <= steps; s++) {
        const f = s / steps;
        const wob = dirt ? 6 : 4; // dirt tracks meander harder
        const cx = Math.round(ax + (bx - ax) * f + (fbm(s * 2 + i * 31, i * 13, 7, seed + 80) - 0.5) * wob);
        const cy = Math.round(ay + (by - ay) * f + (fbm(i * 13, s * 2 + i * 31, 7, seed + 81) - 0.5) * wob);
        const inRock = get(cx, cy) === T.MOUNTAIN || get(cx, cy) === T.PEAK || get(cx, cy) === T.CLIFF;
        const w = inRock ? 0 : wide;
        for (let dy = 0; dy <= w; dy++) for (let dx = 0; dx <= w; dx++) {
          const t = get(cx + dx, cy + dy);
          if (t === T.WATER) { if (!dirt) set(cx + dx, cy + dy, T.BRIDGE); }
          else if (t === T.MOUNTAIN || t === T.PEAK || t === T.CLIFF) set(cx + dx, cy + dy, T.TRAIL);
          else if (t !== T.DEEP && t !== T.WALL && t !== T.ROOF && t !== T.DOOR && t !== T.BRIDGE &&
                   t !== T.TIDAL && t !== T.PLAZA && t !== T.NEON && t !== T.WALL_MARBLE &&
                   t !== T.WALL_STONE && t !== T.ROOF_GOLD && t !== T.ROOF_SLATE && t !== T.ROOF_LEAF &&
                   t !== T.FOUNDATION && t !== T.SHALLOW) {
            set(cx + dx, cy + dy, (inRock || dirt) ? T.TRAIL : T.ROAD);
          }
        }
      }
    }
  }
  const trail = (pts) => carvePath(pts, 0, true);

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
  trail([[236, 138], [230, 143], [227, 147], [225, 151], [225, 149]]); // -> Shady Temple
  // hand-carved final approach — the temple sits in a tight mountain pocket,
  // so this connector is laid without jitter to guarantee a way in
  for (const [sx2, sy2] of [[231, 143], [232, 143], [231, 144], [231, 145], [230, 145], [230, 146], [230, 147], [229, 147], [229, 148], [229, 149], [228, 149], [228, 150], [227, 150]]) {
    const t2 = get(sx2, sy2);
    if (t2 === T.MOUNTAIN || t2 === T.PEAK || t2 === T.HILL) set(sx2, sy2, T.TRAIL);
  }
  trail([[268, 176], [284, 170], [298, 165]]);                       // Cyan springs trail
  trail([[300, 166], [318, 172], [330, 178], [334, 180]]);           // arena back trail
  // extra jungle walks so Elephantium stays passable
  trail([[271, 182], [280, 188], [292, 192], [302, 198], [308, 208]]);   // south canopy walk
  trail([[318, 186], [326, 176], [334, 166], [340, 156]]);               // east coast trail (toward Hidden Cove)
  trail([[249, 176], [244, 186], [246, 196], [250, 206]]);               // Lucky River towpath
  trail([[298, 162], [308, 154], [318, 146], [326, 140]]);               // Mist Peaks crossing
  trail([[258, 148], [266, 142], [274, 138], [282, 138]]);               // north jungle cut
  trail([[60, 126], [56, 112], [58, 100]]);                          // clover cliff walk
  trail([[64, 184], [52, 176], [48, 176]]);                          // mesa overlook
  trail([[338, 24], [343, 28]]);                                     // Neko shrine steps

  /* ---------- roads to the new settlements ---------- */
  carvePath([[28, 146], [48, 158], [66, 166], [84, 167]]);           // Rapidstown -> Vulture Gulch -> Downtown HV
  trail([[29, 140], [33, 136], [36, 134]]);                          // Rapidstown -> Rapids Ford (tide gate)
  carvePath([[62, 64], [80, 85], [100, 105], [110, 120]]);           // Dunmara -> Ballyclover
  carvePath([[90, 94], [95, 105], [105, 118]], 0, true);             // Bramblewick Farm lane
  carvePath([[152, 72], [140, 85], [128, 96]]);                      // Oliveto -> western road
  carvePath([[152, 64], [160, 52], [170, 46]]);                      // Oliveto -> Pontium
  carvePath([[140, 92], [144, 100], [146, 106]], 0, true);           // Argos Vale lane -> J1
  carvePath([[58, 162], [70, 165], [84, 167]]);                      // Vulture Gulch -> Downtown HV
  carvePath([[75, 190], [80, 180], [86, 170]], 0, true);             // Twin Spurs Ranch lane
  carvePath([[145, 154], [148, 165], [150, 180]]);                   // Lotus Ford -> Tiger City
  carvePath([[143, 147], [136, 140], [130, 134]], 0, true);          // Lotus Ford -> Green Gorge road
  carvePath([[136, 153], [141, 151], [143, 150]], 0, true);          // Dragon's Bay -> Lotus Ford
  carvePath([[134, 158], [133, 164], [134, 168]]);                   // Dragon's Bay -> Flat Palace
  carvePath([[175, 168], [165, 171], [157, 172]], 0, true);          // Jade Terraces -> Tiger road
  carvePath([[175, 168], [168, 176], [160, 182]], 0, true);          // Jade Terraces -> Tiger City
  carvePath([[280, 160], [276, 170], [272, 180]]);                   // Sawan City -> SE road
  carvePath([[280, 150], [275, 140], [271, 133]], 0, true);          // Sawan City -> Mai Pai
  carvePath([[268, 133], [260, 142], [252, 150]], 0, true);          // Mai Pai -> Thunder Steps road
  carvePath([[298, 206], [297, 211]]);                               // Chao Lom -> Waterfall road
  carvePath([[283, 66], [288, 60], [292, 58]]);                      // Koban Row -> Downtown Maneki

  /* ---------- countryside dirt tracks ----------
     Jagged walking paths webbing the open country between towns and
     landmarks: rough direction-finding, never bridging rivers. */
  {
    const anchors = [
      ...cities.map((c) => [c.x, c.y]),
      ...landmarks.map((l) => [l.doorX, l.doorY + 2]),
    ];
    // wilderness waypoints so tracks also wander the empty country
    for (let i = 0; i < 48 && anchors.length < 64; i++) {
      const wx2 = 16 + Math.floor(hash2(i, 3, seed + 91) * (W - 32));
      const wy2 = 16 + Math.floor(hash2(7, i, seed + 92) * (H - 32));
      const t = get(wx2, wy2);
      if (t === T.GRASS || t === T.MEADOW || t === T.HILL || t === T.DUST || t === T.BAMBOO || t === T.SCRUB) {
        anchors.push([wx2, wy2]);
      }
    }
    let made = 0;
    for (let i = 0; i < anchors.length * 2 && made < 42; i++) {
      const [ax, ay] = anchors[(i * 7) % anchors.length];
      let best = null, bd = 1e9;
      for (const [bx2, by2] of anchors) {
        const d = Math.hypot(ax - bx2, ay - by2);
        if (d > 22 && d < 75 && d < bd && hash2(ax + bx2, ay + by2, seed + 95 + i) > 0.5) {
          bd = d; best = [bx2, by2];
        }
      }
      if (!best) continue;
      // midpoint displacement for a properly jagged track
      const m1x = Math.round(ax + (best[0] - ax) * 0.33 + (hash2(ax, best[1] + i, seed + 96) - 0.5) * 18);
      const m1y = Math.round(ay + (best[1] - ay) * 0.33 + (hash2(ay + i, best[0], seed + 97) - 0.5) * 18);
      const m2x = Math.round(ax + (best[0] - ax) * 0.66 + (hash2(best[0], ay + i, seed + 98) - 0.5) * 18);
      const m2y = Math.round(ay + (best[1] - ay) * 0.66 + (hash2(best[1] + i, ax, seed + 99) - 0.5) * 18);
      carvePath([[ax, ay], [m1x, m1y], [m2x, m2y], best], 0, true);
      made++;
    }
    // hand-laid scenic tracks through the quieter corners
    carvePath([[40, 30], [58, 46], [74, 60], [88, 74]], 0, true);      // FL: highlands crossing
    carvePath([[24, 96], [46, 88], [68, 94], [88, 106]], 0, true);     // FL: cliffside way
    carvePath([[36, 40], [30, 60], [36, 80]], 0, true);                // FL: western ramble
    carvePath([[148, 62], [162, 74], [176, 86]], 0, true);             // TF: Rolling Hills track
    carvePath([[196, 52], [210, 68], [220, 84]], 0, true);             // TF: Fortunian hills track
    carvePath([[28, 148], [44, 160], [58, 172]], 0, true);             // HV: mesa run
    carvePath([[100, 190], [112, 200], [124, 208]], 0, true);          // HV: south range track
  }

  /* ============================================================
     The Paradise Ferry — the only way to the Maneki-Neko isles.
     Docks are found by scanning from an approximate point to the
     actual coastline, then decking a pier out over the water.
     ============================================================ */
  function placeDock(ax, ay, dx) {
    // walk toward the sea until stepping off land; dock = last land tile
    let x = ax, y = ay;
    for (let i = 0; i < 30; i++) {
      const t = get(x + dx, y);
      if (t === T.WATER || t === T.DEEP || t === T.SHALLOW || t === T.TIDAL) break;
      x += dx;
    }
    if (get(x, y) !== T.FOUNDATION && get(x, y) !== T.DOOR) set(x, y, T.PLAZA);
    for (let i = 1; i <= 4; i++) {
      const t = get(x + dx * i, y);
      if (t === T.WATER || t === T.DEEP || t === T.SHALLOW || t === T.TIDAL) set(x + dx * i, y, T.PIER);
    }
    return { x, y };
  }
  const ferryA = placeDock(240, 61, 1);   // Epineion Docks (TF east coast)
  const ferryB = placeDock(290, 54, -1);  // Maneki Docks (west shore)
  placeDock(132, 156, -1);                // Dragon's Bay pier (decorative, out into the bay)
  const ferries = [
    { name: 'Paradise Ferry', a: { ...ferryA, label: 'Epineion Docks' }, b: { ...ferryB, label: 'Maneki Docks' } },
  ];
  carvePath([[238, 57], [ferryA.x - 1, 61]]);   // Epineion -> its docks
  carvePath([[ferryB.x + 1, 54], [288, 50], [290, 47]]); // Maneki docks -> Downtown

  /* Crossluck Pass — the starting trailhead in the heart of the map */
  const START = { x: 180, y: 119 };
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    if (Math.abs(dx) + Math.abs(dy) <= 3) set(START.x + dx, START.y + dy, T.PLAZA);
  }
  trail([[180, 116], [179, 112]]); // link up to the Dragonspine road

  /* ============================================================
     Maneki Central Park — a nestled green rectangle of calm
     between the towers of North and East Maneki.
     ============================================================ */
  (function stampCentralPark(cx, cy, r) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dy * 1.15); // gently squashed oval
      if (d > r + (fbm(cx + dx, cy + dy, 5, seed + 130) - 0.5) * 2.5) continue;
      const t = get(cx + dx, cy + dy);
      if (t === T.WATER || t === T.DEEP || t === T.SHALLOW || t === T.TIDAL ||
          t === T.FOUNDATION || t === T.DOOR || t === T.PIER || t === T.BRIDGE) continue;
      const h = hash2(cx + dx, cy + dy, seed + 131);
      set(cx + dx, cy + dy, h > 0.86 ? T.FLOWERS : h > 0.7 ? T.FOREST : T.MEADOW);
      ground[idx(cx + dx, cy + dy)] = 255;
    }
    // the duck pond
    for (let dy = -2; dy <= 2; dy++) for (let dx = -3; dx <= 3; dx++) {
      const d = Math.hypot(dx / 1.4, dy);
      const px2 = cx - 3 + dx, py2 = cy + 2 + dy;
      const cur = get(px2, py2);
      if (cur === T.FOUNDATION || cur === T.DOOR) continue; // never flood a building
      if (d <= 1.1) set(px2, py2, T.WATER);
      else if (d <= 2.0 && cur !== T.WATER) set(px2, py2, T.SHALLOW);
    }
    // winding promenade loop + gates back into the streets
    const loop = [];
    for (let a = 0; a <= 20; a++) {
      const ang = (a / 20) * Math.PI * 2;
      loop.push([Math.round(cx + Math.cos(ang) * (r - 3)), Math.round(cy + Math.sin(ang) * (r - 4))]);
    }
    trail(loop);
    trail([[cx - r - 2, cy], [cx - r + 3, cy]]);   // west gate (Downtown side)
    trail([[cx + r - 3, cy], [cx + r + 2, cy]]);   // east gate (toward East Maneki)
    trail([[cx, cy - r + 3], [cx, cy - r - 2]]);   // north gate (toward North Maneki)
  })(306, 42, 9);

  /* ============================================================
     Tall grass & brush — walkable habitat cover, Pokémon-style.
     Rustling clumps scattered through open country and along
     treelines; hidden Lucklian patches favour these tiles.
     ============================================================ */
  {
    const nearWood = (x, y) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const t2 = get(x + dx, y + dy);
        if (t2 === T.FOREST || t2 === T.JUNGLE) return true;
      }
      return false;
    };
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
      const t = get(x, y);
      const n = fbm(x, y, 6, seed + 140);
      if ((t === T.GRASS || t === T.MEADOW || t === T.HILL) && n > 0.66) set(x, y, T.TALLGRASS);
      else if (t === T.SCRUB && n > 0.6) set(x, y, T.BUSH);
      else if ((t === T.GRASS || t === T.MEADOW) && nearWood(x, y) &&
               hash2(x, y, seed + 141) > 0.55) set(x, y, T.BUSH);
    }
  }

  /* ============================================================
     Roadside attractions — each game has a physical prop that
     stands in the world. Props are solid; walk into one to play.
     ============================================================ */
  const EVENT_TYPES = [
    /* Greek & Roman fortune */
    { game: 'wheeltyche',  prov: 'TF', label: 'Wheel of Tyche',        w: 2, h: 2, spawn: 'urban',    n: 5 },
    { game: 'amphorae',    prov: 'TF', label: "Fortuna's Amphorae",    w: 3, h: 2, spawn: 'urban',    n: 5 },
    { game: 'fatesthread', prov: 'TF', label: "Fates' Thread",         w: 2, h: 2, spawn: 'upland',   n: 5 },
    /* Chinese dynastic dragons */
    { game: 'pearldrop',   prov: 'DG', label: 'Dragon Pearl Drop',     w: 2, h: 2, spawn: 'urban',    n: 5 },
    { game: 'ninegates',   prov: 'DG', label: 'Nine Dragon Gates',     w: 3, h: 2, spawn: 'urban',    n: 4 },
    { game: 'dragonhoard', prov: 'DG', label: "Dragon's Hoard",        w: 3, h: 2, spawn: 'mountain', n: 5 },
    /* Wild West horseshoes */
    { game: 'horseshoetoss', prov: 'HV', label: 'Lucky Horseshoe Toss', w: 2, h: 2, spawn: 'urban',   n: 5 },
    { game: 'goldencorral',  prov: 'HV', label: 'The Golden Corral',    w: 3, h: 2, spawn: 'urban',   n: 4 },
    { game: 'prospector',    prov: 'HV', label: "Prospector's Horseshoe", w: 2, h: 2, spawn: 'wild',  n: 6 },
    /* Celtic clovers */
    { game: 'cloverbloom', prov: 'FL', label: 'Clover Bloom',          w: 2, h: 2, spawn: 'wild',     n: 6 },
    { game: 'faeriering',  prov: 'FL', label: 'Faerie Ring',           w: 2, h: 2, spawn: 'forest',   n: 5 },
    { game: 'grovereels',  prov: 'FL', label: 'Luck of the Grove',     w: 2, h: 2, spawn: 'upland',   n: 5 },
    /* SE Asian jungle & spirituality */
    { game: 'spiritlanterns', prov: 'EP', label: 'Spirit Lanterns',    w: 2, h: 2, spawn: 'water',    n: 5 },
    { game: 'nagariver',      prov: 'EP', label: 'Naga River',         w: 3, h: 2, spawn: 'water',    n: 5 },
    { game: 'banyan',         prov: 'EP', label: 'Banyan Blessing',    w: 2, h: 2, spawn: 'forest',   n: 6 },
    /* Neon Japan */
    { game: 'neonneko',    prov: 'MN', label: 'Neon Neko',            w: 2, h: 2, spawn: 'urban',    n: 5 },
    { game: 'catparade',   prov: 'MN', label: 'Lucky Cat Parade',     w: 3, h: 2, spawn: 'urban',    n: 5 },
    { game: 'coincascade', prov: 'MN', label: 'Neko Coin Cascade',    w: 2, h: 2, spawn: 'urban',    n: 5 },
    /* Coastal fishing huts — rent a rod, tempt the deep */
    { game: 'fishing', prov: 'TF', label: "Fisherman's Hut", w: 3, h: 2, spawn: 'coast', n: 2 },
    { game: 'fishing', prov: 'FL', label: "Fisherman's Hut", w: 3, h: 2, spawn: 'coast', n: 2 },
    { game: 'fishing', prov: 'HV', label: "Fisherman's Hut", w: 3, h: 2, spawn: 'coast', n: 2 },
    { game: 'fishing', prov: 'DG', label: "Fisherman's Hut", w: 3, h: 2, spawn: 'coast', n: 2 },
    { game: 'fishing', prov: 'EP', label: "Fisherman's Hut", w: 3, h: 2, spawn: 'coast', n: 2 },
    { game: 'fishing', prov: 'MN', label: "Fisherman's Hut", w: 3, h: 2, spawn: 'coast', n: 2 },
    /* Grand Scavenger Hunt sign-up tents */
    { game: 'scavhunt', prov: 'TF', label: 'Scavenger Hunt Tent', w: 3, h: 2, spawn: 'urban', n: 1 },
    { game: 'scavhunt', prov: 'FL', label: 'Scavenger Hunt Tent', w: 3, h: 2, spawn: 'urban', n: 1 },
    { game: 'scavhunt', prov: 'HV', label: 'Scavenger Hunt Tent', w: 3, h: 2, spawn: 'urban', n: 1 },
    { game: 'scavhunt', prov: 'DG', label: 'Scavenger Hunt Tent', w: 3, h: 2, spawn: 'urban', n: 1 },
    { game: 'scavhunt', prov: 'EP', label: 'Scavenger Hunt Tent', w: 3, h: 2, spawn: 'urban', n: 1 },
    { game: 'scavhunt', prov: 'MN', label: 'Scavenger Hunt Tent', w: 3, h: 2, spawn: 'urban', n: 1 },
    /* the National Hunt caravan — one grand booth per province, but the
       caravan itself is only ever "in town" at a rotating pair of them */
    { game: 'natscav', prov: 'TF', label: 'National Hunt Caravan', w: 4, h: 2, spawn: 'urban', n: 1 },
    { game: 'natscav', prov: 'FL', label: 'National Hunt Caravan', w: 4, h: 2, spawn: 'urban', n: 1 },
    { game: 'natscav', prov: 'HV', label: 'National Hunt Caravan', w: 4, h: 2, spawn: 'urban', n: 1 },
    { game: 'natscav', prov: 'DG', label: 'National Hunt Caravan', w: 4, h: 2, spawn: 'urban', n: 1 },
    { game: 'natscav', prov: 'EP', label: 'National Hunt Caravan', w: 4, h: 2, spawn: 'urban', n: 1 },
    { game: 'natscav', prov: 'MN', label: 'National Hunt Caravan', w: 4, h: 2, spawn: 'urban', n: 1 },
    /* gold panning claims on the western streams (FL's becks are wee —
       any bank will do there; HV pans the true inland rivers) */
    { game: 'goldpan', prov: 'FL', label: "Panner's Claim", w: 3, h: 2, spawn: 'water', n: 3 },
    { game: 'goldpan', prov: 'HV', label: "Panner's Claim", w: 3, h: 2, spawn: 'stream', n: 3 },
    /* lantern festival launch docks on the eastern rivers */
    { game: 'lanternfest', prov: 'EP', label: 'Lantern Festival Dock', w: 3, h: 2, spawn: 'stream', n: 2 },
    { game: 'lanternfest', prov: 'DG', label: 'Lantern Festival Dock', w: 3, h: 2, spawn: 'stream', n: 2 },
    /* Mount Colossus base camp, high in the Dragonspine */
    { game: 'colossus', prov: 'DG', label: 'Mount Colossus Base Camp', w: 3, h: 2, spawn: 'mountain', n: 1 },
    /* night market stalls — shuttered until dark */
    { game: 'nightmarket', prov: 'MN', label: 'Night Market Stall', w: 3, h: 2, spawn: 'urban', n: 2 },
    { game: 'nightmarket', prov: 'DG', label: 'Night Market Stall', w: 3, h: 2, spawn: 'urban', n: 2 },
    /* the Republic's homing-Lucklian loft */
    { game: 'homingpost', prov: 'FL', label: 'Homing Post Loft', w: 3, h: 3, spawn: 'urban', n: 1 },
  ];

  const events = [];
  const eventTiles = new Map();   // tile index -> event (for bump-to-play)

  const nearTile = (x, y, r, pred) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (pred(get(x + dx, y + dy))) return true;
    }
    return false;
  };
  const inAnyCity = (x, y) => cities.some((c) => Math.hypot(x - c.x, y - c.y) <= c.r + 2);

  /* Does this footprint sit on open, walkable ground with room to
     stand around it? (Keeps props from plugging a one-tile lane.) */
  function footprintOK(x, y, w, h) {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
      const t = get(x + dx, y + dy);
      if (isSolidTile(t, 0) || t === T.WATER || t === T.DEEP || t === T.SHALLOW ||
          t === T.TIDAL || t === T.BRIDGE || t === T.PIER) return false;
    }
    let open = 0;
    for (let dx = -1; dx <= w; dx++) {
      for (const yy of [y - 1, y + h]) {
        const t = get(x + dx, yy);
        if (t === T.DOOR) return false;
        if (!isSolidTile(t, 0) && t !== T.SHALLOW) open++;
      }
    }
    for (let dy = -1; dy <= h; dy++) {
      for (const xx of [x - 1, x + w]) {
        const t = get(xx, y + dy);
        if (t === T.DOOR) return false;
        if (!isSolidTile(t, 0) && t !== T.SHALLOW) open++;
      }
    }
    return open >= (w + h) * 2;   // plenty of room left to walk around it
  }

  function spawnFits(type, x, y) {
    const code = PROV_LIST[prov[idx(x, y)]];
    if (code !== type.prov) return false;
    const t = get(x, y);
    switch (type.spawn) {
      case 'urban':                                   // streets, plazas, arcades
        return (t === T.ROAD || t === T.PLAZA || t === T.NEON || t === T.DUST) && inAnyCity(x, y);
      case 'wild':                                    // open country away from town
        return !inAnyCity(x, y) &&
          (t === T.GRASS || t === T.MEADOW || t === T.DUST || t === T.SCRUB || t === T.TRAIL);
      case 'upland':                                  // hills, groves, sacred high ground
        return !inAnyCity(x, y) && (t === T.HILL || t === T.MEADOW || t === T.GRASS) &&
          nearTile(x, y, 3, (q) => q === T.HILL || q === T.MOUNTAIN || q === T.FOREST);
      case 'forest':                                  // clearings at the treeline
        return !inAnyCity(x, y) && (t === T.GRASS || t === T.MEADOW || t === T.BAMBOO) &&
          nearTile(x, y, 2, (q) => q === T.FOREST || q === T.JUNGLE);
      case 'water':                                   // riverbanks, waterfalls, shores
        return (t === T.GRASS || t === T.SAND || t === T.TRAIL || t === T.PLAZA) &&
          nearTile(x, y, 3, (q) => q === T.WATER || q === T.SHALLOW);
      case 'mountain':                                // caves, vaults, mountain shrines
        return (t === T.TRAIL || t === T.GRASS || t === T.HILL || t === T.BAMBOO) &&
          nearTile(x, y, 2, (q) => q === T.MOUNTAIN || q === T.PEAK || q === T.CLIFF);
      case 'coast': {                                 // the sea coast proper: beaches by open salt water
        if (!(t === T.SAND || t === T.GRASS || t === T.WETSAND)) return false;
        if (!nearTile(x, y, 3, (q) => q === T.SHALLOW || q === T.WATER || q === T.DEEP)) return false;
        for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
          if (inB(x + dx, y + dy) && PROV_LIST[prov[idx(x + dx, y + dy)]] === 'SEA') return true;
        }
        return false;                                 // fresh water only — a lake, not the sea
      }
      case 'stream': {                                // inland banks: rivers and lakes, never the sea
        if (!(t === T.GRASS || t === T.SAND || t === T.MEADOW || t === T.TRAIL ||
              t === T.HILL || t === T.DUST || t === T.SCRUB)) return false;
        if (!nearTile(x, y, 3, (q) => q === T.WATER || q === T.SHALLOW)) return false;
        for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
          if (inB(x + dx, y + dy) && PROV_LIST[prov[idx(x + dx, y + dy)]] === 'SEA') return false;
        }
        return true;                                  // salt water anywhere near disqualifies it
      }
      default: return false;
    }
  }

  /* Round-robin so every attraction gets its share of the good
     spots rather than the first types claiming all the streets. */
  const placedOf = EVENT_TYPES.map(() => 0);
  for (let round = 0; round < 8; round++) {
    for (let ti = 0; ti < EVENT_TYPES.length; ti++) {
      const type = EVENT_TYPES[ti];
      if (placedOf[ti] >= type.n) continue;
      for (let attempt = 0; attempt < 900; attempt++) {
        const salt = ti * 977 + round * 61 + attempt;
        const x = 3 + Math.floor(hash2(salt, ti * 31 + round, seed + 120) * (W - 8));
        const y = 3 + Math.floor(hash2(ti * 17 + round, salt, seed + 121) * (H - 8));
        if (!spawnFits(type, x, y)) continue;
        if (!footprintOK(x, y, type.w, type.h)) continue;
        if (events.some((e) => Math.abs(e.x - x) < 7 && Math.abs(e.y - y) < 7)) continue;
        const ev = {
          x, y, w: type.w, h: type.h, prov: type.prov, game: type.game,
          label: type.label, v: (hash2(x, y, seed + 122) * 1e6) | 0,
        };
        for (let dy = 0; dy < type.h; dy++) for (let dx = 0; dx < type.w; dx++) {
          rememberGround(x + dx, y + dy);
          set(x + dx, y + dy, T.FOUNDATION);
          eventTiles.set(idx(x + dx, y + dy), ev);
        }
        events.push(ev);
        placedOf[ti]++;
        break;
      }
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

  /* Named places for the location HUD. tier 2 = larger area (line 2),
     tier 3 = exact spot/neighbourhood (line 3). Ordered most specific
     first within each tier. */
  const regions = [
    // tier 3 — exact spots
    { name: 'Green Gorge', tier: 3, x: 162, y: 124, r: 7 },
    { name: 'Heaven Lake', tier: 3, x: 184, y: 103, r: 10 },
    { name: 'Mount Snow', tier: 3, x: 220, y: 126, r: 5 },
    { name: 'Mount Colossus', tier: 3, x: 229, y: 136, r: 7 },
    { name: 'Crossluck Pass', tier: 3, x: 180, y: 119, r: 6 },
    { name: 'Hidden Cove', tier: 3, x: 344, y: 148, r: 6 },
    { name: 'Upsilonia Causeway', tier: 3, x: 127, y: 34, r: 5 },
    { name: 'Neon Strait Sandbar', tier: 3, x: 328, y: 25, r: 6 },
    { name: 'Rapids Ford', tier: 3, x: 36, y: 133, r: 5 },
    { name: 'Epineion Docks', tier: 3, x: ferryA.x, y: ferryA.y, r: 4 },
    { name: 'Maneki Docks', tier: 3, x: ferryB.x, y: ferryB.y, r: 4 },
    { name: 'Great River', tier: 3, x: 66, y: 132, r: 5 },
    { name: 'Red River', tier: 3, x: 138, y: 191, r: 4 },
    { name: 'Lucky River', tier: 3, x: 249, y: 190, r: 5 },
    { name: 'Cyan River', tier: 3, x: 306, y: 190, r: 5 },
    { name: 'Clover Cliffs', tier: 3, x: 57, y: 108, r: 8 },
    { name: 'Maneki Central Park', tier: 3, x: 306, y: 42, r: 9 },
    // tier 2 — larger areas
    { name: 'Lung Island', tier: 2, x: 191, y: 219, r: 9 },
    { name: 'Upsilonia', tier: 2, x: 130, y: 19, r: 12 },
    { name: 'Sunbleached Mesas', tier: 2, x: 52, y: 180, r: 12 },
    { name: 'Tychean Sea', tier: 2, x: 120, y: 33, r: 8 },
    { name: 'Fortunian Sea', tier: 2, x: 204, y: 30, r: 8 },
    { name: 'Neon Strait', tier: 2, x: 328, y: 24, r: 7 },
    { name: 'Dragon’s Bay', tier: 2, x: 114, y: 156, r: 8 },
    { name: 'Serpent Strait', tier: 2, x: 165, y: 206, r: 8 },
    { name: 'The Dragonspine', tier: 2, x: 184, y: 110, r: 14 },
    { name: 'The Emerald Divide', tier: 2, x: 120, y: 60, r: 10 },
    { name: 'The Thunder Steps', tier: 2, x: 259, y: 168, r: 10 },
    { name: 'The Mist Peaks', tier: 2, x: 304, y: 162, r: 14 },
    { name: 'Temple Mounts', tier: 2, x: 218, y: 147, r: 10 },
    { name: 'Rolling Hills', tier: 2, x: 155, y: 85, r: 12 },
    { name: 'Tychean Hills', tier: 2, x: 131, y: 63, r: 9 },
    { name: 'Fortunian Hills', tier: 2, x: 216, y: 96, r: 11 },
    { name: 'Paradise Sea', tier: 2, x: 276, y: 100, r: 24 },
    { name: 'Puffin Skerries', tier: 2, x: 12, y: 70, r: 8 },
  ];

  return {
    W, H, tiles, prov, ground, landmarks, events, eventTiles, zones, regions, cities, ferries, buildings, start: START,
    idx, get, inB,
    provAt(x, y) {
      return PROV_LIST[prov[idx(Math.max(0, Math.min(W - 1, x)), Math.max(0, Math.min(H - 1, y)))]];
    },
  };
}
