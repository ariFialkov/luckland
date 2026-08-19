/* ============================================================
   Luckland — landmark interiors
   ------------------------------------------------------------
   Every landmark door leads into a real walkable room, Pokémon
   style: fade to black, and you're standing inside a hall built
   to fit the landmark — game stations along the walls that open
   their game when you walk into them, themed décor, and patrons
   wandering, gambling and (in the seedier joints) smoking.
   ============================================================ */

import { T, TILE } from './world.js';
import { hash2, mulberry32 } from './rng.js';
import { makeCharSprite } from './sprites.js';
import { GAME_DEFS } from './games.js';

/* which physical station a game reads as */
const STATION_KIND = {
  slots: 'slot', grovereels: 'slot',
  pachinko: 'pachinko', coincascade: 'pachinko', pearldrop: 'pachinko',
  fivecard: 'table', mahjong: 'table', sicbo: 'table', tali: 'table',
  teahouse: 'table', haiko: 'table', standoff: 'table',
  wheeltyche: 'wheel', rainbow: 'wheel', oracle: 'wheel',
  chariots: 'board', ponies: 'board', sumo: 'board', muaythai: 'board', goldencorral: 'board',
  amphorae: 'shrine', spirits: 'shrine', cloverbloom: 'shrine', banyan: 'shrine',
  spiritlanterns: 'shrine', fatesthread: 'shrine', dragonhoard: 'shrine',
  catparade: 'shrine', neonneko: 'shrine', faeriering: 'shrine',
  ninegates: 'counter', nagariver: 'counter', roadbowls: 'counter',
  horseshoetoss: 'counter', prospector: 'counter', cointoss: 'counter',
};

/* per-hall style kits */
function styleFor(lm) {
  const bySub = {
    casino:     { wall: T.WALL_STONE,  floor: T.NEON,  rug: 'rgba(140,40,150,0.35)', decor: ['slotbank', 'slotbank', 'plant', 'neonsign'], patrons: 10, smoke: 0.5, tint: 'rgba(90,20,120,0.10)' },
    arena:      { wall: T.WALL_STONE,  floor: T.PLAZA, rug: 'rgba(180,140,60,0.30)', decor: ['rail', 'rail', 'banner', 'crate'], patrons: 7, smoke: 0.15, tint: 'rgba(120,90,30,0.08)', pit: true },
    castle:     { wall: T.WALL_STONE,  floor: T.PLAZA, rug: 'rgba(150,30,40,0.4)',   decor: ['banner', 'banner', 'statue', 'plant'], patrons: 5, smoke: 0, tint: 'rgba(40,40,90,0.08)', carpet: true },
    pagoda:     { wall: T.WALL_STONE,  floor: T.PLAZA, rug: 'rgba(170,40,30,0.35)',  decor: ['pillar', 'pillar', 'lantern', 'lantern'], patrons: 6, smoke: 0.2, tint: 'rgba(140,40,20,0.08)' },
    stupa:      { wall: T.WALL_STONE,  floor: T.PLAZA, rug: 'rgba(210,160,30,0.30)', decor: ['bell', 'plant', 'lantern', 'statue'], patrons: 5, smoke: 0.1, tint: 'rgba(180,140,20,0.08)' },
    lighthouse: { wall: T.WALL_STONE,  floor: T.PLAZA, rug: 'rgba(60,110,160,0.30)', decor: ['stair', 'crate', 'plant'], patrons: 2, smoke: 0, tint: 'rgba(40,80,140,0.08)', small: true },
    warehouse:  { wall: T.WALL_STONE,  floor: T.DUST,  rug: 'rgba(90,70,40,0.3)',    decor: ['crate', 'crate', 'crate', 'rail'], patrons: 4, smoke: 0.3, tint: 'rgba(60,50,30,0.10)' },
  };
  const byProv = {
    TF: { wall: T.WALL_MARBLE, floor: T.PLAZA, rug: 'rgba(200,170,90,0.30)', decor: ['pillar', 'pillar', 'statue', 'plant'], patrons: 6, smoke: 0, tint: 'rgba(220,200,140,0.07)' },
    FL: { wall: T.WALL_STONE,  floor: T.PLAZA, rug: 'rgba(60,130,60,0.30)',  decor: ['bar', 'plant', 'banner', 'crate'], patrons: 6, smoke: 0.3, tint: 'rgba(30,90,40,0.08)', bar: true },
    HV: { wall: T.WALL_STONE,  floor: T.DUST,  rug: 'rgba(150,90,40,0.35)',  decor: ['bar', 'piano', 'crate', 'rail'], patrons: 7, smoke: 0.45, tint: 'rgba(140,90,30,0.10)', bar: true },
    DG: { wall: T.WALL_STONE,  floor: T.PLAZA, rug: 'rgba(170,40,30,0.35)',  decor: ['pillar', 'lantern', 'lantern', 'plant'], patrons: 6, smoke: 0.2, tint: 'rgba(140,40,20,0.08)' },
    EP: { wall: T.WALL_STONE,  floor: T.PLAZA, rug: 'rgba(210,160,30,0.28)', decor: ['bell', 'lantern', 'plant', 'statue'], patrons: 5, smoke: 0.15, tint: 'rgba(180,140,20,0.07)' },
    MN: { wall: T.WALL_STONE,  floor: T.NEON,  rug: 'rgba(140,40,150,0.35)', decor: ['slotbank', 'neonsign', 'plant', 'crate'], patrons: 8, smoke: 0.4, tint: 'rgba(90,20,120,0.10)' },
  };
  return (lm.sub && bySub[lm.sub]) || byProv[lm.prov] || byProv.TF;
}

const PATRON_PALETTES = [
  { skin: '#f0c8a0', body: '#5a76c8', legs: '#33305a' }, { skin: '#c89a70', body: '#c85a6a', legs: '#403040' },
  { skin: '#f0c8a0', body: '#4f9c5e', legs: '#2f4030' }, { skin: '#a5713f', body: '#d9a545', legs: '#4a3520' },
  { skin: '#f0d8b8', body: '#8a5ac8', legs: '#302a48' }, { skin: '#c89a70', body: '#3fb0a0', legs: '#204038' },
  { skin: '#f0c8a0', body: '#c87a30', legs: '#443322' }, { skin: '#e8b890', body: '#b03050', legs: '#382030' },
];

const cache = new Map();

export function getInterior(lm) {
  const key = `${lm.x},${lm.y}`;
  let it = cache.get(key);
  if (it) return it;

  const style = styleFor(lm);
  const rng = mulberry32((lm.x * 733 + lm.y * 271) >>> 0);
  const W = style.small ? 15 : Math.max(20, Math.min(30, 14 + lm.w * 2));
  const H = style.small ? 12 : Math.max(14, Math.min(19, 10 + lm.h * 2));
  const tiles = new Uint8Array(W * H).fill(style.floor);
  const idx = (x, y) => y * W + x;
  const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < W && y < H) tiles[idx(x, y)] = t; };
  const get = (x, y) => (x >= 0 && y >= 0 && x < W && y < H) ? tiles[idx(x, y)] : style.wall;

  // walls: two-course top for depth, single sides/bottom, doorway at bottom
  for (let x = 0; x < W; x++) { set(x, 0, style.wall); set(x, 1, style.wall); set(x, H - 1, style.wall); }
  for (let y = 0; y < H; y++) { set(0, y, style.wall); set(W - 1, y, style.wall); }
  const doorX = W >> 1;
  const exitXs = [doorX - 1, doorX, doorX + 1];
  for (const x of exitXs) set(x, H - 1, style.floor);

  const stations = [];
  const stationTiles = new Map();
  const decor = [];
  const floorRects = [];
  const occupied = (x, y, w, h) => {
    for (let dy = -1; dy <= h; dy++) for (let dx = -1; dx <= w; dx++) {
      if (get(x + dx, y + dy) === T.FOUNDATION) return true;
    }
    return false;
  };
  const placeSolid = (x, y, w, h) => {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) set(x + dx, y + dy, T.FOUNDATION);
  };

  /* rug / arena pit / long carpet */
  if (style.pit) floorRects.push({ x: (W >> 1) - 5, y: (H >> 1) - 2, w: 10, h: 5, color: style.rug });
  else if (style.carpet) floorRects.push({ x: doorX - 1, y: 2, w: 3, h: H - 3, color: style.rug });
  else floorRects.push({ x: (W >> 1) - 4, y: (H >> 1) - 1, w: 8, h: 4, color: style.rug });
  // welcome mat
  floorRects.push({ x: doorX - 1, y: H - 2, w: 3, h: 2, color: 'rgba(200,60,60,0.4)' });

  /* game stations — one per hub game, hugging the walls */
  const spots = [
    [2, 3], [W - 4, 3], [2, H - 6], [W - 4, H - 6],
    [(W >> 1) - 1, 2], [2, (H >> 1) - 1], [W - 4, (H >> 1) - 1],
  ];
  (lm.games || []).forEach((game, i) => {
    const [sx, sy] = spots[i % spots.length];
    if (occupied(sx, sy, 2, 2)) return;
    placeSolid(sx, sy, 2, 2);
    const st = {
      x: sx, y: sy, w: 2, h: 2, game,
      kind: STATION_KIND[game] || 'table',
      label: GAME_DEFS[game]?.name || game,
      ico: GAME_DEFS[game]?.ico || '🎲',
      v: (rng() * 1e6) | 0,
    };
    stations.push(st);
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) stationTiles.set(idx(sx + dx, sy + dy), st);
  });

  /* décor kit — solid furniture filling the hall, never blocking the
     doorway lane. Density scales with floor area so the big halls
     read packed, not vacant. */
  const decorSpots = [];
  for (let x = 3; x < W - 5; x += 4) decorSpots.push([x, 2]);              // along the top wall
  decorSpots.push([2, H - 4], [W - 4, H - 4]);                             // bottom corners
  for (let x = 4; x < W - 6; x += 6) decorSpots.push([x, (H >> 1) + 2]);   // mid floor
  for (let x = 5; x < W - 7; x += 7) decorSpots.push([x, (H >> 1) - 2]);
  decorSpots.push([4, H - 5], [W - 7, H - 5], [2, (H >> 1)], [W - 5, (H >> 1)]);
  const wanted = Math.max(4, Math.min(13, Math.floor((W * H) / 38)));
  let placedD = 0;
  for (const [dx2, dy2] of decorSpots) {
    if (placedD >= wanted) break;
    const kind = style.decor[placedD % style.decor.length];
    const w = kind === 'bar' ? 5 : kind === 'slotbank' ? 4 : kind === 'rail' ? 4 : kind === 'neonsign' ? 5 : 2;
    const h = kind === 'neonsign' ? 1 : 2;
    if (dx2 + w >= W - 1 || occupied(dx2, dy2, w, h)) continue;
    if (dy2 >= H - 5 && dx2 + w >= doorX - 2 && dx2 <= doorX + 2) continue; // keep the door lane clear
    if (kind !== 'neonsign') placeSolid(dx2, dy2, w, h);     // signs hang on the wall, not the floor
    decor.push({ x: dx2, y: dy2, w, h, kind, v: (rng() * 1e6) | 0 });
    placedD++;
  }

  /* patrons — wanderers plus a few planted at stations, gambling */
  const patrons = [];
  const freeTile = () => {
    for (let tries = 0; tries < 60; tries++) {
      const x = 2 + ((rng() * (W - 4)) | 0), y = 3 + ((rng() * (H - 5)) | 0);
      const t = get(x, y);
      if (t !== style.wall && t !== T.FOUNDATION && t !== T.WALL_MARBLE && t !== T.WALL_STONE) return [x, y];
    }
    return [doorX, H - 4];
  };
  for (let i = 0; i < style.patrons; i++) {
    const pal = PATRON_PALETTES[(rng() * PATRON_PALETTES.length) | 0];
    const anchored = i < stations.length && rng() < 0.5 ? stations[i] : null;
    let px2, py2;
    if (anchored) { px2 = (anchored.x + (rng() < 0.5 ? -0.5 : 2.5)) * TILE + 8; py2 = (anchored.y + 1) * TILE + 8; }
    else { const [fx, fy] = freeTile(); px2 = fx * TILE + 8; py2 = fy * TILE + 8; }
    patrons.push({
      x: px2, y: py2, dir: anchored ? (px2 < anchored.x * TILE ? 2 : 1) : ((rng() * 4) | 0),
      frame: 0, animT: 0, speed: 22 + rng() * 14,
      sprite: makeCharSprite(pal),
      heading: null, thinkT: rng() * 2, anchored: !!anchored,
      smokes: rng() < style.smoke, puffT: rng() * 3,
      cheerT: 0,
    });
  }

  it = {
    lm, style, W, H, tiles, idx,
    stations, stationTiles, decor, floorRects,
    exitXs, doorX,
    spawn: { x: doorX * TILE + 8, y: (H - 2) * TILE + 4 },
    patrons,
  };
  cache.set(key, it);
  return it;
}

/* patron wander/idle inside the hall */
export function updatePatrons(it, dt) {
  const solid = (px2, py2) => {
    const tx = Math.floor(px2 / TILE), ty = Math.floor(py2 / TILE);
    if (tx < 1 || ty < 2 || tx >= it.W - 1 || ty >= it.H - 1) return true;
    const t = it.tiles[it.idx(tx, ty)];
    return t === T.FOUNDATION || t === T.WALL_MARBLE || t === T.WALL_STONE;
  };
  for (const p of it.patrons) {
    p.puffT += dt;
    if (p.cheerT > 0) p.cheerT -= dt;
    if (p.anchored) {
      // planted at a machine — twitch, cheer now and then, keep standing
      if (Math.random() < dt * 0.06) p.cheerT = 1.4;
      p.frame = 0;
      continue;
    }
    p.thinkT -= dt;
    if (p.thinkT <= 0 || !p.heading) {
      p.thinkT = 1.6 + Math.random() * 2.6;
      if (Math.random() < 0.35) { p.heading = null; p.frame = 0; continue; } // stop and watch
      const ang = Math.random() * Math.PI * 2;
      p.heading = { dx: Math.cos(ang), dy: Math.sin(ang) };
      p.dir = Math.abs(p.heading.dx) > Math.abs(p.heading.dy) ? (p.heading.dx < 0 ? 1 : 2) : (p.heading.dy < 0 ? 3 : 0);
    }
    if (!p.heading) continue;
    const nx = p.x + p.heading.dx * p.speed * dt;
    const ny = p.y + p.heading.dy * p.speed * dt;
    if (!solid(nx, p.y - 2) && !solid(nx, p.y + 5)) p.x = nx; else p.heading = null;
    if (p.heading && !solid(p.x - 4, ny + 5) && !solid(p.x + 4, ny + 5)) p.y = ny; else p.heading = null;
    if (p.heading) {
      p.animT += dt;
      if (p.animT > 0.18) { p.animT = 0; p.frame = 1 - p.frame; }
    } else p.frame = 0;
  }
}
