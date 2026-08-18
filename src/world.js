/* ============================================================
   Luckland — world generation
   ------------------------------------------------------------
   A 240x240 tile continent generated deterministically from
   CONFIG.WORLD_SEED. Six provinces, landmark hubs, towns,
   roads, a river, tidal flats/causeways and secret zones.
   ============================================================ */

import { CONFIG } from './config.js';
import { hash2, fbm } from './rng.js';

export const TILE = 16;           // px per tile in the atlas
export const W = 240, H = 240;    // world size in tiles

/* Tile type ids */
export const T = {
  DEEP: 0, WATER: 1, TIDAL: 2, SAND: 3, GRASS: 4, MEADOW: 5, FOREST: 6,
  JUNGLE: 7, HILL: 8, MOUNTAIN: 9, DUST: 10, SCRUB: 11, ROAD: 12,
  PLAZA: 13, WALL: 14, ROOF: 15, DOOR: 16, BRIDGE: 17, CLIFF: 18,
  NEON: 19, PIER: 20, FLOWERS: 21, BAMBOO: 22,
};

export const PROV_LIST = ['SEA', 'TF', 'FL', 'HV', 'DG', 'EP', 'MN'];

export const PROVINCES = {
  TF: { name: 'Tyche & Fortuna', sub: 'Where the goddesses smile', color: '#d9c078' },
  FL: { name: 'Four Leaf Republic', sub: 'Land of the long odds', color: '#4faf50' },
  HV: { name: 'Horshoeville', sub: 'Luck rides at high noon', color: '#c8985a' },
  DG: { name: 'Dragonia', sub: 'Fortune favours the patient', color: '#c05050' },
  EP: { name: 'Elephantium', sub: 'The mists remember every wager', color: '#4f9c6e' },
  MN: { name: 'Maneki-Neko', sub: 'The beckoning neon isles', color: '#c96ad4' },
  SEA: { name: 'The Open Sea', sub: '', color: '#2a6a9a' },
};

/* ---------- province region by normalized coords ---------- */
function provinceCodeAt(u, v) {
  if (u > 0.63 && v < 0.42) return 'MN';
  if (u < 0.30 && v < 0.44) return 'FL';
  if (v < 0.40) return 'TF';
  if (u < 0.36) return 'HV';
  if (u > 0.62) return 'EP';
  return 'DG';
}

const SOLID = new Set([T.DEEP, T.WATER, T.MOUNTAIN, T.WALL, T.ROOF, T.CLIFF]);

export function isSolidTile(t, tide) {
  if (t === T.TIDAL) return tide > 0.62; // underwater at high tide
  return SOLID.has(t);
}

export function isWaterTile(t, tide) {
  return t === T.DEEP || t === T.WATER || (t === T.TIDAL && tide > 0.62);
}

/* ============================================================ */
export function generateWorld() {
  const seed = CONFIG.WORLD_SEED;
  const tiles = new Uint8Array(W * H);
  const prov = new Uint8Array(W * H);

  const idx = (x, y) => y * W + x;
  const inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const get = (x, y) => (inB(x, y) ? tiles[idx(x, y)] : T.DEEP);
  const set = (x, y, t) => { if (inB(x, y)) tiles[idx(x, y)] = t; };

  /* ---------- island blobs for the MN archipelago + Upsilonia ---------- */
  const islands = [
    { x: 197, y: 34, r: 23, code: 'MN' },   // Maneki (metropolis)
    { x: 168, y: 72, r: 13, code: 'MN' },   // Neko (nature isle)
    { x: 176, y: 20, r: 6,  code: 'MN' },   // small skerry
    { x: 144, y: 13, r: 8,  code: 'TF' },   // Upsilonia (Leonidas)
  ];

  function islandLand(x, y) {
    for (const is of islands) {
      const d = Math.hypot(x - is.x, y - is.y);
      const wob = fbm(x, y, 9, seed + 31) * 3.5;
      if (d < is.r - wob) return is;
    }
    return null;
  }

  /* ---------- base land / sea ---------- */
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W, v = y / H;
      const code = provinceCodeAt(u, v);

      // Continent mask: rounded landmass with noisy coasts.
      const edge = Math.min(u, v, 1 - u, 1 - v);           // distance to map edge
      const coastNoise = fbm(x, y, 26, seed) * 0.07;
      let land = edge > 0.075 + coastNoise;

      // MN quadrant & far north sea are archipelago water unless on an island.
      const isle = islandLand(x, y);
      if (code === 'MN' || (code === 'TF' && v < 0.085)) land = !!isle;
      if (isle) land = true;

      let t;
      if (!land) {
        t = edge < 0.035 ? T.DEEP : T.WATER;
      } else {
        const e = fbm(x, y, 18, seed + 5);
        switch (code) {
          case 'TF': t = e > 0.62 ? T.HILL : e > 0.35 ? T.MEADOW : T.GRASS; break;
          case 'FL': t = e > 0.66 ? T.HILL : e > 0.30 ? T.GRASS : T.MEADOW;
                     if (hash2(x, y, seed + 77) > 0.965) t = T.FLOWERS; break;
          case 'HV': t = e > 0.68 ? T.SCRUB : T.DUST;
                     if (hash2(x, y, seed + 78) > 0.975) t = T.SCRUB; break;
          case 'DG': t = e > 0.60 ? T.HILL : e > 0.32 ? T.GRASS : T.BAMBOO; break;
          case 'EP': t = e > 0.55 ? T.JUNGLE : e > 0.25 ? T.JUNGLE : T.GRASS; break;
          case 'MN': t = e > 0.6 ? T.FOREST : T.GRASS; break;
          default: t = T.GRASS;
        }
        // scattered woods in temperate provinces
        if ((code === 'TF' || code === 'FL') && fbm(x, y, 8, seed + 9) > 0.72) t = T.FOREST;
        if (code === 'DG' && fbm(x, y, 8, seed + 10) > 0.75) t = T.FOREST;
      }
      tiles[idx(x, y)] = t;
      prov[idx(x, y)] = PROV_LIST.indexOf(land || !isle ? code : code);
      if (isle) prov[idx(x, y)] = PROV_LIST.indexOf(isle.code);
      if (!land && !isle) prov[idx(x, y)] = 0; // SEA
    }
  }

  /* ---------- mountain ridges ---------- */
  function ridge(x0, y0, x1, y1, width, passAt) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2;
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const cx = Math.round(x0 + (x1 - x0) * f + (fbm(i, 0, 6, seed + 21) - 0.5) * 6);
      const cy = Math.round(y0 + (y1 - y0) * f + (fbm(0, i, 6, seed + 22) - 0.5) * 6);
      if (passAt && Math.abs(f - passAt) < 0.045) continue; // leave a pass
      for (let dy = -width; dy <= width; dy++) {
        for (let dx = -width; dx <= width; dx++) {
          if (Math.hypot(dx, dy) > width + hash2(cx + dx, cy + dy, seed + 23)) continue;
          const t = get(cx + dx, cy + dy);
          if (t !== T.WATER && t !== T.DEEP && t !== T.TIDAL) set(cx + dx, cy + dy, T.MOUNTAIN);
        }
      }
    }
  }

  // Dragonia's protective northern wall (pass in the middle: Crossluck Pass)
  ridge(84, 118, 158, 122, 2, 0.5);
  // Eastern Dragonia mountains (home of Yong Xin & the Hidden Tea House)
  ridge(140, 128, 156, 158, 2, 0.35);
  // DG <-> EP border range with a southern pass
  ridge(152, 150, 160, 196, 2, 0.55);
  // FL <-> HV cliff border (the low-tide beach passage skirts it on the coast)
  for (let x = 16; x <= 62; x++) {
    for (let dy = 0; dy < 3; dy++) {
      const y = 106 + dy + Math.round((fbm(x, 0, 9, seed + 40) - 0.5) * 4);
      const t = get(x, y);
      if (t !== T.WATER && t !== T.DEEP) set(x, y, T.CLIFF);
    }
  }

  /* ---------- Horshoeville river (town sits at its tail) ---------- */
  const riverPts = [[86, 118], [72, 132], [60, 150], [46, 166], [34, 182], [24, 196], [16, 208]];
  for (let i = 0; i < riverPts.length - 1; i++) {
    const [ax, ay] = riverPts[i], [bx, by] = riverPts[i + 1];
    const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2;
    for (let s = 0; s <= steps; s++) {
      const f = s / steps;
      const cx = Math.round(ax + (bx - ax) * f + (fbm(s, i, 5, seed + 50) - 0.5) * 3);
      const cy = Math.round(ay + (by - ay) * f);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) set(cx + dx, cy + dy, T.WATER);
    }
  }

  /* ---------- beaches ---------- */
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = get(x, y);
      if (t === T.WATER || t === T.DEEP || t === T.MOUNTAIN || t === T.CLIFF) continue;
      let nearWater = false;
      for (let dy = -1; dy <= 1 && !nearWater; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (get(x + dx, y + dy) === T.WATER) { nearWater = true; break; }
      if (nearWater && t !== T.BRIDGE) set(x, y, T.SAND);
    }
  }

  /* ---------- tidal flats along coasts ---------- */
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (get(x, y) !== T.WATER) continue;
      let nearSand = false;
      for (let dy = -2; dy <= 2 && !nearSand; dy++)
        for (let dx = -2; dx <= 2; dx++)
          if (get(x + dx, y + dy) === T.SAND) { nearSand = true; break; }
      if (nearSand && fbm(x, y, 7, seed + 60) > 0.60) set(x, y, T.TIDAL);
    }
  }

  /* ---------- explicit tidal features ---------- */
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
  tidalLine(144, 19, 144, 30);     // Upsilonia causeway (TF north coast)
  tidalLine(172, 63, 185, 50);     // Neko <-> Maneki sandbar
  tidalLine(8, 100, 10, 116, 2);   // FL <-> HV west-coast beach passage
  // make sure that west passage has walkable sand at its inland edges
  for (let y = 98; y <= 118; y++) for (let x = 10; x <= 13; x++) {
    if (get(x, y) === T.CLIFF) set(x, y, T.SAND);
  }

  /* ---------- secret cove in Elephantium (enter at low tide) ---------- */
  const cove = { x: 214, y: 205, r: 7 };
  for (let dy = -cove.r; dy <= cove.r; dy++) for (let dx = -cove.r; dx <= cove.r; dx++) {
    const d = Math.hypot(dx, dy);
    const x = cove.x + dx, y = cove.y + dy;
    if (d > cove.r) continue;
    if (d > cove.r - 1.6) { if (get(x, y) !== T.TIDAL) set(x, y, T.CLIFF); }
    else set(x, y, T.SAND);
  }
  tidalLine(cove.x - cove.r - 3, cove.y, cove.x - cove.r + 2, cove.y, 1);
  set(cove.x - cove.r + 1, cove.y, T.TIDAL); // the mouth of the cove
  set(cove.x - cove.r, cove.y, T.TIDAL);

  /* ============================================================
     Landmarks — hub buildings that house each province's games.
     ============================================================ */
  const landmarks = [];

  function stampBuilding(lm) {
    const { x, y, w, h } = lm; // x,y = top-left
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
      set(x + dx, y + dy, dy >= h - 1 ? T.WALL : T.ROOF);
    }
    const doorX = x + (w >> 1), doorY = y + h - 1;
    set(doorX, doorY, T.DOOR);
    // plaza apron in front of the door
    for (let dx = -1; dx <= 1; dx++) for (let dy = 1; dy <= 2; dy++) {
      const t = get(doorX + dx, doorY + dy);
      if (t !== T.WATER && t !== T.DEEP) set(doorX + dx, doorY + dy, T.PLAZA);
    }
    lm.doorX = doorX; lm.doorY = doorY;
    landmarks.push(lm);
  }

  /* prov, name, icon, description, x, y, w, h, games */
  const LM = [
    ['TF', 'The Acropolis', '🏛️', 'High seat of the goddess Tyche', 103, 23, 7, 5, ['oracle', 'tali']],
    ['TF', 'The Parthenon', '🏛️', 'Marble halls of fortune', 122, 37, 7, 5, ['oracle', 'tali']],
    ['TF', 'The Coliseum', '🏟️', 'Chariots thunder for your denarii', 140, 55, 9, 6, ['chariots', 'tali']],
    ['TF', 'Fort Upsilonia', '⚓', "Leonidas' island navy — cross at low tide", 141, 10, 6, 4, ['tali', 'chariots']],
    ['FL', 'Edinburgh Castle', '🏰', 'Ancient keep of the Four Leaf kings', 34, 39, 8, 6, ['cointoss', 'roadbowls', 'rainbow']],
    ['MN', 'Magic Mushroom Casino', '🍄', 'Neon towers of endless pachinko', 198, 26, 8, 6, ['pachinko', 'slots']],
    ['MN', 'Grand Sumo Arena', '🏟️', 'Where mountains collide', 186, 39, 7, 5, ['sumo', 'pachinko']],
    ['MN', 'Neko Shrine Lookout', '⛩️', 'Views over the beckoning sea', 165, 68, 5, 4, ['pachinko']],
    ['HV', 'Churchill Downs', '🏇', 'The dustiest derby in the west', 49, 140, 9, 6, ['ponies', 'fivecard']],
    ['HV', 'The Grand Saloon', '🤠', 'Swing the doors, draw your luck', 33, 181, 7, 5, ['fivecard', 'standoff']],
    ['DG', 'The Great Palace', '🏯', 'Golden roofs of the dragon court', 116, 158, 9, 6, ['mahjong', 'sicbo']],
    ['DG', 'The Hidden Tea House', '🍵', 'Whispered of, rarely found', 146, 136, 5, 4, ['teahouse']],
    ['DG', 'Forbidden Valley Gate', '⛩️', 'High stakes beyond the wall', 97, 170, 7, 5, ['sicbo', 'mahjong', 'teahouse']],
    ['EP', 'The Golden Temple', '🛕', 'Bells, bells, and blessed bells', 184, 146, 8, 6, ['spirits', 'haiko']],
    ['EP', 'Muay Thai Arena', '🥊', "Khrueang's ring of glory", 170, 179, 8, 6, ['muaythai', 'haiko']],
  ];
  for (const [p, name, ico, desc, x, y, w, h, games] of LM) {
    stampBuilding({ prov: p, name, ico, desc, x, y, w, h, games });
  }

  /* ---------- towns (decorative building clusters) ---------- */
  function town(cx, cy, n, floor) {
    for (let i = 0; i < n; i++) {
      const bx = cx + Math.round((hash2(i, cx, seed + 70) - 0.5) * 14);
      const by = cy + Math.round((hash2(cy, i, seed + 71) - 0.5) * 12);
      const bw = 3 + (i % 2), bh = 3;
      let ok = true;
      for (let dy = -1; dy <= bh; dy++) for (let dx = -1; dx <= bw; dx++) {
        const t = get(bx + dx, by + dy);
        if (t === T.WATER || t === T.DEEP || t === T.WALL || t === T.ROOF || t === T.DOOR || t === T.MOUNTAIN) ok = false;
      }
      if (!ok) continue;
      for (let dy = 0; dy < bh; dy++) for (let dx = 0; dx < bw; dx++) {
        set(bx + dx, by + dy, dy === bh - 1 ? T.WALL : T.ROOF);
      }
    }
    for (let dy = -9; dy <= 9; dy++) for (let dx = -9; dx <= 9; dx++) {
      const t = get(cx + dx, cy + dy);
      if ((t === T.GRASS || t === T.MEADOW || t === T.DUST || t === T.BAMBOO) &&
          hash2(cx + dx, cy + dy, seed + 72) > 0.55 && Math.hypot(dx, dy) < 9) {
        set(cx + dx, cy + dy, floor);
      }
    }
  }
  town(197, 32, 9, T.NEON);   // Maneki metropolis
  town(168, 73, 3, T.PLAZA);  // Neko sister city
  town(36, 186, 5, T.DUST);   // Dustspur (HV cowboy town at the river tail)
  town(48, 76, 5, T.PLAZA);   // Cloverpool (FL)
  town(126, 42, 4, T.PLAZA);  // TF coastal hub
  town(120, 164, 5, T.PLAZA); // DG palace town
  town(184, 150, 3, T.PLAZA); // EP temple village

  /* ---------- roads ---------- */
  function road(x0, y0, x1, y1) {
    // Manhattan path with slight wobble; bridges over water.
    let x = x0, y = y0;
    const carve = (cx, cy) => {
      for (const [dx, dy] of [[0, 0], [1, 0]]) {
        const t = get(cx + dx, cy + dy);
        if (t === T.WATER) set(cx + dx, cy + dy, T.BRIDGE);
        else if (t !== T.DEEP && t !== T.WALL && t !== T.ROOF && t !== T.DOOR &&
                 t !== T.BRIDGE && t !== T.TIDAL && t !== T.PLAZA && t !== T.NEON) {
          set(cx + dx, cy + dy, T.ROAD);
        }
      }
    };
    // x first, then y, with midpoint jitter
    const midx = x1 + Math.round((hash2(x0, y1, seed + 80) - 0.5) * 8);
    while (x !== midx) { x += Math.sign(midx - x); carve(x, y); }
    while (y !== y1) { y += Math.sign(y1 - y); carve(x, y); }
    while (x !== x1) { x += Math.sign(x1 - x); carve(x, y); }
  }

  const START = { x: 120, y: 101 }; // Crossluck Junction
  road(START.x, START.y, 125, 45);        // junction -> Parthenon
  road(125, 45, 106, 30);                 // Parthenon -> Acropolis
  road(125, 45, 144, 60);                 // Parthenon -> Coliseum
  road(START.x, START.y, 48, 78);         // junction -> Cloverpool
  road(48, 78, 38, 46);                   // Cloverpool -> Castle
  road(START.x, START.y, 120, 165);       // junction -> Great Palace (through the pass)
  road(120, 165, 100, 176);               // palace -> Forbidden Gate
  road(120, 165, 155, 172);               // palace -> east pass
  road(155, 172, 188, 153);               // pass -> Golden Temple
  road(188, 153, 174, 185);               // temple -> Muay Thai Arena
  road(48, 78, 53, 146);                  // Cloverpool -> Churchill Downs (through cliffs? goes around)
  road(53, 146, 36, 186);                 // Churchill -> Dustspur
  road(202, 32, 189, 44);                 // Maneki: casino -> sumo arena
  // plaza around start
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    if (Math.abs(dx) + Math.abs(dy) <= 3) set(START.x + dx, START.y + dy, T.PLAZA);
  }

  /* punch a gap where the Cloverpool->Churchill road hits the FL/HV cliffs */
  for (let y = 104; y <= 112; y++) for (let x = 48; x <= 58; x++) {
    if (get(x, y) === T.CLIFF && (get(x, y - 1) === T.ROAD || get(x, y + 1) === T.ROAD || get(x - 1, y) === T.ROAD || get(x + 1, y) === T.ROAD)) {
      set(x, y, T.ROAD);
    }
  }

  /* ---------- street gambling events near roads, per province ---------- */
  const roadByProv = {};
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (get(x, y) === T.ROAD || get(x, y) === T.NEON || get(x, y) === T.PLAZA) {
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
    const n = Math.min(8, spots.length);
    const used = new Set();
    for (let i = 0; i < n; i++) {
      const j = Math.floor(hash2(i, 999, seed + 90 + i) * spots.length);
      if (used.has(j)) continue;
      used.add(j);
      const [x, y] = spots[j];
      // keep events off doors/aprons
      if (get(x, y - 1) === T.DOOR) continue;
      events.push({ x, y, prov: code, ...EVENT_DEFS[code] });
    }
  }

  /* ---------- secret zones (rich concealer spawns, map hints) ---------- */
  const zones = [
    { name: 'Hidden Cove', x: cove.x, y: cove.y, r: cove.r - 2, tidal: true },
    { name: 'Upsilonia Shore', x: 144, y: 13, r: 6, tidal: true },
    { name: 'Neko Sandbar', x: 178, y: 57, r: 4, tidal: true },
    { name: 'Forbidden Valley', x: 100, y: 182, r: 8, tidal: false },
  ];

  return {
    W, H, tiles, prov, landmarks, events, zones, start: START,
    idx, get, inB,
    provAt(x, y) { return PROV_LIST[prov[idx(Math.max(0, Math.min(W - 1, x)), Math.max(0, Math.min(H - 1, y)))]]; },
  };
}
