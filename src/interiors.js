/* ============================================================
   Luckland — landmark interiors
   ------------------------------------------------------------
   Every landmark door leads into a real walkable room, Pokémon
   style. The great set-pieces get bespoke halls — the fight
   arena with its live ring, the Downs with paddock and track,
   the Coliseum's roaring sand, the Panhellenium's amphitheatre,
   zen temples, the Shady Temple's courtyard, Ballyclover's
   feast — and every other landmark gets a dense themed hall.
   Live "actors" (fighters, monks, nobles, racers, crowds) keep
   each scene moving.
   ============================================================ */

import { T, TILE } from './world.js';
import { hash2, mulberry32 } from './rng.js';
import { makeCharSprite, makeCourserSprite } from './sprites.js';
import { GAME_DEFS } from './games.js';
import { BY_ID } from './lucklians.js';

/* which physical station a game reads as */
const STATION_KIND = {
  slots: 'slot', grovereels: 'slot',
  pachinko: 'pachinko', coincascade: 'pachinko', pearldrop: 'pachinko',
  fivecard: 'table', mahjong: 'table', sicbo: 'table', tali: 'table',
  teahouse: 'table', haiko: 'table', standoff: 'table',
  wheeltyche: 'wheel', rainbow: 'wheel', oracle: 'wheel',
  chariots: 'board', ponies: 'board', sumo: 'board', muaythai: 'board', goldencorral: 'board',
  muaythaibout: 'board', coliseumbets: 'board', downsrace: 'kiosk',
  amphorae: 'shrine', spirits: 'shrine', cloverbloom: 'shrine', banyan: 'shrine',
  spiritlanterns: 'shrine', fatesthread: 'shrine', dragonhoard: 'shrine',
  catparade: 'shrine', neonneko: 'shrine', faeriering: 'shrine',
  ninegates: 'counter', nagariver: 'counter', roadbowls: 'counter',
  horseshoetoss: 'counter', prospector: 'counter', cointoss: 'counter',
};

/* per-hall style kits (generic halls) */
function styleFor(lm) {
  const bySub = {
    casino:     { wall: T.WALL_STONE,  floor: T.NEON,  rug: 'rgba(140,40,150,0.35)', decor: ['slotbank', 'slotbank', 'plant', 'neonsign'], patrons: 11, smoke: 0.5, tint: 'rgba(90,20,120,0.10)' },
    arena:      { wall: T.WALL_STONE,  floor: T.PLAZA, rug: 'rgba(180,140,60,0.30)', decor: ['bleacher', 'rail', 'foodstand', 'banner'], patrons: 9, smoke: 0.15, tint: 'rgba(120,90,30,0.08)', pit: true },
    castle:     { wall: T.WALL_STONE,  floor: T.PLAZA, rug: 'rgba(150,30,40,0.4)',   decor: ['banner', 'armor', 'statue', 'shelf'], patrons: 7, smoke: 0, tint: 'rgba(40,40,90,0.08)', carpet: true },
    pagoda:     { wall: T.WALL_STONE,  floor: T.PLAZA, rug: 'rgba(170,40,30,0.35)',  decor: ['pillar', 'lantern', 'shelf', 'teacorner'], patrons: 8, smoke: 0.2, tint: 'rgba(140,40,20,0.08)' },
    stupa:      { wall: T.WALL_STONE,  floor: T.PLAZA, rug: 'rgba(210,160,30,0.30)', decor: ['bell', 'incense', 'lantern', 'statue'], patrons: 6, smoke: 0.1, tint: 'rgba(180,140,20,0.08)' },
    lighthouse: { wall: T.WALL_STONE,  floor: T.PLAZA, rug: 'rgba(60,110,160,0.30)', decor: ['stair', 'crate', 'plant'], patrons: 3, smoke: 0, tint: 'rgba(40,80,140,0.08)', small: true },
    warehouse:  { wall: T.WALL_STONE,  floor: T.DUST,  rug: 'rgba(90,70,40,0.3)',    decor: ['crate', 'crate', 'foodstand', 'rail'], patrons: 5, smoke: 0.3, tint: 'rgba(60,50,30,0.10)' },
  };
  const byProv = {
    TF: { wall: T.WALL_MARBLE, floor: T.PLAZA, rug: 'rgba(200,170,90,0.30)', decor: ['pillar', 'statue', 'scrolls', 'plant'], patrons: 8, smoke: 0, tint: 'rgba(220,200,140,0.07)' },
    FL: { wall: T.WALL_STONE,  floor: T.PLAZA, rug: 'rgba(60,130,60,0.30)',  decor: ['bar', 'plant', 'banner', 'crate'], patrons: 8, smoke: 0.3, tint: 'rgba(30,90,40,0.08)' },
    HV: { wall: T.WALL_STONE,  floor: T.DUST,  rug: 'rgba(150,90,40,0.35)',  decor: ['bar', 'piano', 'crate', 'rail'], patrons: 9, smoke: 0.45, tint: 'rgba(140,90,30,0.10)' },
    DG: { wall: T.WALL_STONE,  floor: T.PLAZA, rug: 'rgba(170,40,30,0.35)',  decor: ['pillar', 'lantern', 'shelf', 'plant'], patrons: 8, smoke: 0.2, tint: 'rgba(140,40,20,0.08)' },
    EP: { wall: T.WALL_STONE,  floor: T.PLAZA, rug: 'rgba(210,160,30,0.28)', decor: ['bell', 'incense', 'plant', 'statue'], patrons: 7, smoke: 0.15, tint: 'rgba(180,140,20,0.07)' },
    MN: { wall: T.WALL_STONE,  floor: T.NEON,  rug: 'rgba(140,40,150,0.35)', decor: ['slotbank', 'neonsign', 'plant', 'crate'], patrons: 9, smoke: 0.4, tint: 'rgba(90,20,120,0.10)' },
  };
  return (lm.sub && bySub[lm.sub]) || byProv[lm.prov] || byProv.TF;
}

const PATRON_PALETTES = [
  { skin: '#f0c8a0', body: '#5a76c8', legs: '#33305a' }, { skin: '#c89a70', body: '#c85a6a', legs: '#403040' },
  { skin: '#f0c8a0', body: '#4f9c5e', legs: '#2f4030' }, { skin: '#a5713f', body: '#d9a545', legs: '#4a3520' },
  { skin: '#f0d8b8', body: '#8a5ac8', legs: '#302a48' }, { skin: '#c89a70', body: '#3fb0a0', legs: '#204038' },
  { skin: '#f0c8a0', body: '#c87a30', legs: '#443322' }, { skin: '#e8b890', body: '#b03050', legs: '#382030' },
];
const MONK_EP = { skin: '#c89a70', body: '#e08a2a', legs: '#b06a20' };
const MONK_DG = { skin: '#e8b890', body: '#8a8ea0', legs: '#5a5e70' };
const SCHOLAR = { skin: '#f0c8a0', body: '#e8e2d4', legs: '#c8c0ac' };
const NOBLE_P = [
  { skin: '#f0c8a0', body: '#8a2030', legs: '#5a1420' }, { skin: '#e8b890', body: '#2a4a9a', legs: '#1c3268' },
  { skin: '#c89a70', body: '#f0c040', legs: '#a5824f' }, { skin: '#f0d8b8', body: '#4f9c5e', legs: '#2f6a3e' },
];
const SERVANT = { skin: '#f0c8a0', body: '#a5824f', legs: '#6a5038' };
const JESTER = { skin: '#f0c8a0', body: '#4f9c2e', legs: '#c8a020', hat: 'cap', hatColor: '#8a2aa0' };
const FIGHTER_R = { skin: '#c89a70', body: '#c43a2a', legs: '#8a2a1e' };
const FIGHTER_B = { skin: '#a5713f', body: '#2a4a9a', legs: '#1c3268' };
const REF_P = { skin: '#f0c8a0', body: '#e8e2d4', legs: '#26202c' };

const cache = new Map();

export function getInterior(lm) {
  const key = `${lm.x},${lm.y}`;
  let it = cache.get(key);
  if (it) return it;
  it = buildInterior(lm);
  cache.set(key, it);
  return it;
}

/* -------- construction kit shared by all builders -------- */
function makeRoom(lm, style, W, H) {
  const rng = mulberry32((lm.x * 733 + lm.y * 271) >>> 0);
  const tiles = new Uint8Array(W * H).fill(style.floor);
  const idx = (x, y) => y * W + x;
  const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < W && y < H) tiles[idx(x, y)] = t; };
  const get = (x, y) => (x >= 0 && y >= 0 && x < W && y < H) ? tiles[idx(x, y)] : style.wall;
  for (let x = 0; x < W; x++) { set(x, 0, style.wall); set(x, 1, style.wall); set(x, H - 1, style.wall); }
  for (let y = 0; y < H; y++) { set(0, y, style.wall); set(W - 1, y, style.wall); }
  const doorX = W >> 1;
  const exitXs = [doorX - 1, doorX, doorX + 1];
  for (const x of exitXs) set(x, H - 1, style.floor);

  const it = {
    lm, style, W, H, tiles, idx,
    stations: [], stationTiles: new Map(), decor: [], floorRects: [],
    exitXs, doorX,
    spawn: { x: doorX * TILE + 8, y: (H - 2) * TILE + 4 },
    patrons: [], actors: [],
    rng, set, get,
  };
  it.floorRects.push({ x: doorX - 1, y: H - 2, w: 3, h: 2, color: 'rgba(200,60,60,0.4)' });

  it.occupied = (x, y, w, h) => {
    for (let dy = -1; dy <= h; dy++) for (let dx = -1; dx <= w; dx++) {
      if (get(x + dx, y + dy) === T.FOUNDATION) return true;
    }
    return false;
  };
  it.placeSolid = (x, y, w, h) => {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) set(x + dx, y + dy, T.FOUNDATION);
  };
  it.addStation = (x, y, w, h, game, kindOverride) => {
    it.placeSolid(x, y, w, h);
    const st = {
      x, y, w, h, game,
      kind: kindOverride || STATION_KIND[game] || 'table',
      label: GAME_DEFS[game]?.name || game,
      ico: GAME_DEFS[game]?.ico || '🎲',
      v: (rng() * 1e6) | 0,
    };
    it.stations.push(st);
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) it.stationTiles.set(idx(x + dx, y + dy), st);
    return st;
  };
  it.addDecor = (x, y, w, h, kind, solid = true) => {
    if (solid) it.placeSolid(x, y, w, h);
    it.decor.push({ x, y, w, h, kind, v: (rng() * 1e6) | 0 });
  };
  it.addPatron = (px2, py2, opts = {}) => {
    const pal = opts.pal || PATRON_PALETTES[(rng() * PATRON_PALETTES.length) | 0];
    const p = {
      x: px2, y: py2, dir: opts.dir ?? ((rng() * 4) | 0),
      frame: 0, animT: 0, speed: 22 + rng() * 14,
      sprite: makeCharSprite(pal),
      heading: null, thinkT: rng() * 2,
      anchored: !!opts.anchored, smokes: !!opts.smokes, puffT: rng() * 3,
      cheerT: 0,
    };
    it.patrons.push(p);
    return p;
  };
  it.addActor = (a) => { it.actors.push(a); return a; };
  it.freeTile = () => {
    for (let tries = 0; tries < 80; tries++) {
      const x = 2 + ((rng() * (W - 4)) | 0), y = 3 + ((rng() * (H - 5)) | 0);
      const t = get(x, y);
      if (t !== style.wall && t !== T.FOUNDATION && t !== T.WALL_MARBLE && t !== T.WALL_STONE) return [x, y];
    }
    return [doorX, H - 4];
  };
  return it;
}

function fillStations(it, spots) {
  (it.lm.games || []).forEach((game, i) => {
    const [sx, sy] = spots[i % spots.length];
    if (it.occupied(sx, sy, 2, 2)) return;
    it.addStation(sx, sy, 2, 2, game);
  });
}

function scatterPatrons(it, n, smokeChance) {
  for (let i = 0; i < n; i++) {
    const anchored = i < it.stations.length && it.rng() < 0.5 ? it.stations[i] : null;
    let px2, py2;
    if (anchored) { px2 = (anchored.x + (it.rng() < 0.5 ? -0.5 : anchored.w + 0.5)) * TILE + 8; py2 = (anchored.y + 1) * TILE + 8; }
    else { const [fx, fy] = it.freeTile(); px2 = fx * TILE + 8; py2 = fy * TILE + 8; }
    it.addPatron(px2, py2, { anchored: !!anchored, smokes: it.rng() < smokeChance, dir: anchored ? (px2 < anchored.x * TILE ? 2 : 1) : undefined });
  }
}

/* seated/standing figure actor helper */
function figure(it, tx, ty, pal, type, extra = {}) {
  return it.addActor({
    type, x: tx * TILE + 8, y: ty * TILE + 8,
    dir: extra.dir ?? 0, frame: 0, sprite: makeCharSprite(pal),
    t: it.rng() * 6, emote: null, ...extra,
  });
}

/* ============================================================
   Bespoke set-piece halls
   ============================================================ */

function buildFightArena(lm) {   // Roaring Elephant Arena — live Muay Thai
  const style = { wall: T.WALL_STONE, floor: T.DUST, tint: 'rgba(140,80,20,0.10)' };
  const it = makeRoom(lm, style, 32, 21);
  const cx = 15, cy = 8;

  // bleachers facing the ring (top and both flanks)
  it.addDecor(4, 2, 9, 2, 'bleacher'); it.addDecor(19, 2, 9, 2, 'bleacher');
  it.addDecor(2, 5, 2, 4, 'bleacher'); it.addDecor(28, 5, 2, 4, 'bleacher');
  it.addDecor(2, 10, 2, 4, 'bleacher'); it.addDecor(28, 10, 2, 4, 'bleacher');
  // concourse: food + drink stands, smoking corner, crowd rails
  it.addDecor(2, 16, 3, 2, 'foodstand'); it.addDecor(6, 16, 3, 2, 'foodstand');
  it.addDecor(27, 16, 3, 2, 'bar');
  it.addDecor(23, 16, 2, 2, 'crate');
  it.addDecor(8, 12, 4, 2, 'rail'); it.addDecor(20, 12, 4, 2, 'rail');   // ringside rails
  it.addDecor(14, 15, 3, 2, 'foodstand');
  it.addDecor(2, 13, 2, 2, 'crate'); it.addDecor(28, 13, 2, 2, 'lantern');
  // THE RING — one big playable station running the live book
  const ring = it.addStation(cx - 3, cy - 2, 7, 5, 'muaythaibout', 'ring');
  ring.label = 'Ringside Book — live bouts';
  ring.live = true;
  // remaining games on the concourse
  const rest = (lm.games || []).filter((g) => g !== 'muaythaibout');
  const spots = [[5, 10], [25, 10], [10, 16]];
  rest.forEach((g, i) => { const [sx, sy] = spots[i % spots.length]; if (!it.occupied(sx, sy, 2, 2)) it.addStation(sx, sy, 2, 2, g); });

  // fighters, ref, corner teams — alive in the ring
  const fR = figure(it, cx - 1.2, cy + 0.6, FIGHTER_R, 'fighter', { foeDx: 1, dir: 2, hitIco: '💥', arena: true, name: 'RED' });
  const fB = figure(it, cx + 2.2, cy + 0.6, FIGHTER_B, 'fighter', { foeDx: -1, dir: 1, hitIco: '🦵', arena: true, name: 'BLUE' });
  figure(it, cx + 0.5, cy - 0.8, REF_P, 'ref', { cx: (cx + 0.5) * TILE, cy: (cy) * TILE, r: 10 });
  it.arena = {
    kind: 'fight', game: 'muaythaibout',
    center: { x: (cx + 0.5) * TILE, y: (cy + 0.5) * TILE },
    rect: { x: (cx - 3) * TILE, y: (cy - 2) * TILE, w: 7 * TILE, h: 5 * TILE },
    fighters: [fR, fB],
  };
  figure(it, cx - 3.6, cy - 2.4, FIGHTER_R, 'corner', { dir: 0 });
  figure(it, cx + 4.6, cy + 3.4, FIGHTER_B, 'corner', { dir: 3 });
  // cheering crowd markers over the bleachers
  for (const [bx, by] of [[7, 2.5], [22, 2.5], [2.5, 6], [28.5, 6], [2.5, 11], [28.5, 11]]) {
    it.addActor({ type: 'cheer', x: bx * TILE + 8, y: by * TILE });
  }
  scatterPatrons(it, 8, 0.45);
  return it;
}

function buildZenTemple(lm) {    // EP temples — zen garden, monks, incense
  const style = { wall: T.WALL_STONE, floor: T.MEADOW, tint: 'rgba(240,230,180,0.10)' };
  const it = makeRoom(lm, style, 27, 18);
  // raked-sand zen garden
  it.floorRects.push({ x: 3, y: 3, w: 9, h: 6, color: 'rgba(232,212,154,0.85)' });
  it.addDecor(4, 4, 2, 2, 'zenrock'); it.addDecor(9, 6, 2, 2, 'zenrock');
  // shrine wall: statues, bell, incense
  it.addDecor(14, 2, 2, 2, 'statue'); it.addDecor(20, 2, 2, 2, 'bell'); it.addDecor(24, 2, 2, 2, 'statue');
  it.addDecor(17, 2, 2, 2, 'incense'); it.addDecor(12, 8, 2, 2, 'incense');
  it.addDecor(2, 12, 2, 2, 'plant'); it.addDecor(24, 14, 2, 2, 'plant'); it.addDecor(24, 6, 2, 2, 'plant');
  // meditation mats + monks
  for (let i = 0; i < 4; i++) {
    it.floorRects.push({ x: 15 + (i % 2) * 4, y: 6 + ((i / 2) | 0) * 3, w: 2, h: 2, color: 'rgba(140,40,40,0.35)' });
    figure(it, 15.5 + (i % 2) * 4, 6.8 + ((i / 2) | 0) * 3, MONK_EP, 'monkMed', { dir: 0, emIco: '📿' });
  }
  fillStations(it, [[5, 13], [9, 13], [17, 13], [21, 13]]);
  scatterPatrons(it, 5, 0.05);
  return it;
}

function buildShadyTemple(lm) {  // DG — riches, tai chi court, tea corners, parlours
  const style = { wall: T.WALL_STONE, floor: T.PLAZA, tint: 'rgba(140,40,20,0.09)' };
  const it = makeRoom(lm, style, 30, 19);
  // artifact wall: shelves, treasure, lanterns
  it.addDecor(2, 2, 2, 2, 'shelf'); it.addDecor(5, 2, 2, 2, 'treasure'); it.addDecor(8, 2, 2, 2, 'shelf');
  it.addDecor(11, 2, 2, 2, 'treasure'); it.addDecor(25, 2, 2, 2, 'shelf');
  it.addDecor(14, 2, 2, 2, 'lantern'); it.addDecor(22, 2, 2, 2, 'lantern');
  // tai chi courtyard — synchronized monks on a stone court
  it.floorRects.push({ x: 4, y: 6, w: 10, h: 7, color: 'rgba(120,120,130,0.25)' });
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
    figure(it, 5.5 + c * 3.4, 7.5 + r * 3, MONK_DG, 'monkTai', { phase: 0 });
  }
  // tea corner — elders on carpets with tea
  it.floorRects.push({ x: 17, y: 13, w: 8, h: 4, color: 'rgba(150,40,40,0.35)' });
  it.addDecor(19, 14, 2, 2, 'teacorner');
  figure(it, 18.2, 15.2, NOBLE_P[2], 'noble', { dir: 2, emIco: '🍵' });
  figure(it, 22.6, 15.2, MONK_DG, 'noble', { dir: 1, emIco: '🍵' });
  figure(it, 20.5, 13.6, NOBLE_P[1], 'noble', { dir: 0, emIco: '😌' });
  // gambling parlour along the right wall
  fillStations(it, [[26, 6], [26, 10], [16, 6], [16, 9]]);
  it.addDecor(2, 14, 2, 2, 'incense');
  scatterPatrons(it, 6, 0.2);
  return it;
}

function buildCastleFeast(lm) {  // Ballyclover — the great feast
  const style = { wall: T.WALL_STONE, floor: T.PLAZA, tint: 'rgba(40,40,90,0.08)' };
  const it = makeRoom(lm, style, 31, 20);
  // long carpet from door to dais
  it.floorRects.push({ x: it.doorX - 1, y: 2, w: 3, h: 17, color: 'rgba(150,30,40,0.4)' });
  // medieval trappings
  it.addDecor(2, 2, 2, 2, 'armor'); it.addDecor(27, 2, 2, 2, 'armor');
  it.addDecor(5, 2, 2, 2, 'banner'); it.addDecor(24, 2, 2, 2, 'banner'); it.addDecor(11, 2, 2, 2, 'banner'); it.addDecor(18, 2, 2, 2, 'banner');
  it.addDecor(8, 2, 2, 2, 'shelf'); it.addDecor(21, 2, 2, 2, 'shelf');
  // kitchen corner
  it.addDecor(2, 15, 3, 2, 'bar'); it.addDecor(2, 12, 2, 2, 'crate');
  // THE GREAT TABLE — nobles feasting around it
  it.addDecor(9, 8, 6, 2, 'longtable'); it.addDecor(16, 8, 6, 2, 'longtable');
  const nobleSeats = [[9.5, 7.2, 0], [12, 7.2, 0], [14.5, 7.2, 0], [17, 7.2, 0], [19.5, 7.2, 0],
    [9.5, 10.8, 3], [12, 10.8, 3], [14.5, 10.8, 3], [17, 10.8, 3], [19.5, 10.8, 3]];
  nobleSeats.forEach(([nx, ny, dir], i) => {
    figure(it, nx, ny, NOBLE_P[i % NOBLE_P.length], 'noble', { dir, emIco: ['🍻', '🍗', '😂', '🥂'][i % 4] });
  });
  // servants hustling kitchen <-> table
  for (let i = 0; i < 3; i++) {
    figure(it, 4, 14 - i, SERVANT, 'servant', {
      pts: [[4 * TILE, (14 + i) * TILE], [(8 + i * 5) * TILE, 11.5 * TILE], [(10 + i * 4) * TILE, 6.5 * TILE], [4 * TILE, (14 + i) * TILE]],
      i: 0, speed: 46 + i * 8,
    });
  }
  // jesters & leprechauns run the games of chance
  const spots = [[25, 8], [25, 13], [5, 5], [25, 5]];
  fillStations(it, spots);
  it.stations.forEach((st, i) => {
    figure(it, st.x - 0.6, st.y + 1.6, JESTER, 'jester', { dir: 2, emIco: ['🎭', '🍀'][i % 2] });
  });
  scatterPatrons(it, 5, 0.1);
  return it;
}

function buildDowns(lm) {        // Horseshoe Downs — paddock, track, bookies, slots
  const style = { wall: T.WALL_STONE, floor: T.DUST, tint: 'rgba(140,90,30,0.10)' };
  const it = makeRoom(lm, style, 33, 21);
  // the six coursers of the Stakes — palettes straight off their species
  const RACER_IDS = { 'Voltjack': 109, 'Deadlight Courser': 115, 'Whitewraith': 102, 'Blackspur': 31, 'Coppergrin': 37, 'Old Bristlejack': 3 };
  const racerPal = (name) => {
    const d = BY_ID.get(RACER_IDS[name]);
    return d ? { body: d.c[0], mane: d.c[1], accent: d.c[2] } : { body: '#8a5a2a', mane: '#4a3222', accent: '#e8dcc0' };
  };
  // paddock (top-left): railed pen with runners on show
  it.floorRects.push({ x: 2, y: 3, w: 9, h: 6, color: 'rgba(120,160,80,0.3)' });
  it.addDecor(2, 2, 4, 2, 'rail'); it.addDecor(7, 2, 4, 2, 'rail');
  it.addDecor(2, 8, 4, 2, 'rail'); it.addDecor(7, 8, 4, 2, 'rail');
  [['Voltjack', 4, 5, 2], ['Deadlight Courser', 7, 4.4, 0], ['Whitewraith', 9, 6, 1]].forEach(([nm, hx, hy, dir]) => {
    it.addActor({ type: 'paddock', sprite: makeCourserSprite(racerPal(nm)), x: hx * TILE, y: hy * TILE, dir, frame: 0, t: it.rng() * 5 });
  });
  figure(it, 3, 9.6, PATRON_PALETTES[0], 'corner', { dir: 3 });   // punters eyeing the field
  figure(it, 8, 9.6, PATRON_PALETTES[3], 'corner', { dir: 3 });
  // the track (right): oval where the full field pounds laps
  it.floorRects.push({ x: 15, y: 3, w: 16, h: 9, color: 'rgba(160,110,60,0.4)' });
  it.floorRects.push({ x: 18, y: 5, w: 10, h: 5, color: 'rgba(120,160,80,0.35)' }); // infield
  it.addDecor(15, 2, 5, 2, 'bleacher'); it.addDecor(21, 2, 5, 2, 'bleacher'); it.addDecor(27, 2, 4, 2, 'bleacher');
  const oval = { cx: 23 * TILE, cy: 7.5 * TILE, rx: 6.5 * TILE, ry: 3 * TILE };
  GAME_DEFS.downsrace.runners.forEach((r, i) => {
    it.addActor({
      type: 'lapper', arena: true, sprite: makeCourserSprite(racerPal(r.name), { rider: 'cowboy' }),
      ang: i * 1.05, speed: 0.85 + it.rng() * 0.25, o: oval, x: 0, y: 0, dir: 2, frame: 0, raceIdx: i,
    });
  });
  const starter = figure(it, 15.4, 11.4, { skin: '#c89a70', body: '#8a2030', legs: '#40354a', hat: 'cap', hatColor: '#8a6034' }, 'corner', { dir: 3 });
  for (const [bx, by] of [[17, 2.5], [23, 2.5], [29, 2.5]]) it.addActor({ type: 'cheer', x: bx * TILE + 8, y: by * TILE });
  it.arena = {
    kind: 'race', game: 'downsrace',
    center: { x: oval.cx, y: oval.cy },
    rect: { x: 15 * TILE, y: 3 * TILE, w: 16 * TILE, h: 9 * TILE },
    oval, starter, ambientCount: 6,
  };
  // bookie hall (bottom-left): kiosks + tv wall
  it.addDecor(2, 12, 4, 2, 'tvwall');
  const rest = (lm.games || []);
  const spots = [[2, 15], [6, 15], [10, 15], [13, 12]];
  rest.forEach((g, i) => {
    const [sx, sy] = spots[i % spots.length];
    if (!it.occupied(sx, sy, 2, 2)) {
      const st = it.addStation(sx, sy, 2, 2, g);
      if (g === 'downsrace') st.live = true;
    }
  });
  // slots corner (bottom-right)
  it.addDecor(24, 15, 4, 2, 'slotbank'); it.addDecor(29, 15, 2, 2, 'crate');
  it.addDecor(20, 15, 3, 2, 'foodstand');
  scatterPatrons(it, 8, 0.35);
  return it;
}

function buildPanhellenium(lm) { // TF — forum, amphitheatre, philosophers
  const style = { wall: T.WALL_MARBLE, floor: T.PLAZA, tint: 'rgba(220,200,140,0.08)' };
  const it = makeRoom(lm, style, 31, 20);
  // marble corridors: pillar colonnades
  for (const px2 of [3, 8, 22, 27]) { it.addDecor(px2, 2, 2, 2, 'pillar'); it.addDecor(px2, 15, 2, 2, 'pillar'); }
  it.addDecor(13, 2, 2, 2, 'statue'); it.addDecor(17, 2, 2, 2, 'statue');
  it.addDecor(2, 6, 2, 2, 'scrolls'); it.addDecor(2, 10, 2, 2, 'scrolls'); it.addDecor(27, 6, 2, 2, 'scrolls');
  // the amphitheatre: stepped rings with a debate raging on stage
  it.floorRects.push({ x: 10, y: 5, w: 12, h: 8, color: 'rgba(200,190,160,0.5)' });
  it.floorRects.push({ x: 12, y: 6, w: 8, h: 6, color: 'rgba(180,170,140,0.55)' });
  it.floorRects.push({ x: 14, y: 7, w: 4, h: 4, color: 'rgba(232,226,212,0.7)' });
  figure(it, 14.7, 9, SCHOLAR, 'philosopher', { dir: 2, pair: 0, emes: ['💬', '☝️', '📜'] });
  figure(it, 17.3, 9, { skin: '#c89a70', body: '#d8d2c0', legs: '#a8a094' }, 'philosopher', { dir: 1, pair: 1, emes: ['🤔', '❗', '🏛️'] });
  // seated listeners on the steps
  figure(it, 12.5, 6.6, SCHOLAR, 'corner', { dir: 0 });
  figure(it, 19.5, 6.6, { skin: '#a5713f', body: '#e8e2d4', legs: '#c8c0ac' }, 'corner', { dir: 0 });
  figure(it, 11, 11.4, { skin: '#f0d8b8', body: '#d8d2c0', legs: '#b4ad9c' }, 'corner', { dir: 3 });
  // scholarly hustlers with their games
  fillStations(it, [[5, 6], [25, 10], [5, 12], [25, 4]]);
  it.stations.forEach((st) => figure(it, st.x + st.w + 0.6, st.y + 1.4, SCHOLAR, 'jester', { dir: 1, emIco: '🦉' }));
  scatterPatrons(it, 6, 0);
  return it;
}

function buildColiseum(lm) {     // TF — concourse, marble crowds, live games on the sand
  const style = { wall: T.WALL_MARBLE, floor: T.PLAZA, tint: 'rgba(220,190,120,0.10)' };
  const it = makeRoom(lm, style, 33, 21);
  // inner arena: sand floor ringed by carved marble stands
  it.floorRects.push({ x: 8, y: 4, w: 17, h: 11, color: 'rgba(232,212,154,0.9)' });
  it.addDecor(8, 2, 5, 2, 'marblestand'); it.addDecor(14, 2, 5, 2, 'marblestand'); it.addDecor(20, 2, 5, 2, 'marblestand');
  it.addDecor(5, 5, 2, 4, 'marblestand'); it.addDecor(5, 10, 2, 4, 'marblestand');
  it.addDecor(26, 5, 2, 4, 'marblestand'); it.addDecor(26, 10, 2, 4, 'marblestand');
  // the show itself is run by the live-events program: chariots ->
  // gladiators -> beast hunt -> naval battle, rotating on the sand
  it.arena = {
    kind: 'coliseum', game: 'coliseumbets',
    center: { x: 16.5 * TILE, y: 9.5 * TILE },
    rect: { x: 8 * TILE, y: 4 * TILE, w: 17 * TILE, h: 11 * TILE },
    oval: { cx: 16.5 * TILE, cy: 9.5 * TILE, rx: 6.6 * TILE, ry: 3.4 * TILE },
    ambientCount: 3,
  };
  for (const [bx, by] of [[10, 2.5], [16, 2.5], [22, 2.5], [5.5, 6.5], [27.5, 6.5], [5.5, 11.5], [27.5, 11.5]]) {
    it.addActor({ type: 'cheer', x: bx * TILE + 8, y: by * TILE });
  }
  // concourse: snacks and small games under the stands
  it.addDecor(2, 17, 3, 2, 'foodstand'); it.addDecor(28, 17, 3, 2, 'foodstand');
  it.addDecor(2, 2, 2, 2, 'statue'); it.addDecor(29, 2, 2, 2, 'statue');
  fillStations(it, [[6, 17], [24, 17], [13, 17], [19, 17]]);
  it.stations.forEach((st) => { if (st.game === 'coliseumbets') st.live = true; });
  scatterPatrons(it, 8, 0.1);
  return it;
}

/* ============================================================
   Generic themed hall (everything without a bespoke build)
   ============================================================ */
function buildGeneric(lm) {
  const style = styleFor(lm);
  const W = style.small ? 15 : Math.max(20, Math.min(30, 14 + lm.w * 2));
  const H = style.small ? 12 : Math.max(14, Math.min(19, 10 + lm.h * 2));
  const it = makeRoom(lm, style, W, H);
  const doorX = it.doorX;

  if (style.pit) it.floorRects.unshift({ x: (W >> 1) - 5, y: (H >> 1) - 2, w: 10, h: 5, color: style.rug });
  else if (style.carpet) it.floorRects.unshift({ x: doorX - 1, y: 2, w: 3, h: H - 3, color: style.rug });
  else it.floorRects.unshift({ x: (W >> 1) - 4, y: (H >> 1) - 1, w: 8, h: 4, color: style.rug });

  fillStations(it, [
    [2, 3], [W - 4, 3], [2, H - 6], [W - 4, H - 6],
    [(W >> 1) - 1, 2], [2, (H >> 1) - 1], [W - 4, (H >> 1) - 1],
  ]);

  const decorSpots = [];
  for (let x = 3; x < W - 5; x += 4) decorSpots.push([x, 2]);
  decorSpots.push([2, H - 4], [W - 4, H - 4]);
  for (let x = 4; x < W - 6; x += 6) decorSpots.push([x, (H >> 1) + 2]);
  for (let x = 5; x < W - 7; x += 7) decorSpots.push([x, (H >> 1) - 2]);
  decorSpots.push([4, H - 5], [W - 7, H - 5], [2, (H >> 1)], [W - 5, (H >> 1)]);
  const wanted = Math.max(4, Math.min(14, Math.floor((W * H) / 34)));
  let placedD = 0;
  for (const [dx2, dy2] of decorSpots) {
    if (placedD >= wanted) break;
    const kind = style.decor[placedD % style.decor.length];
    const w = kind === 'bar' ? 5 : kind === 'slotbank' ? 4 : kind === 'rail' ? 4 : kind === 'neonsign' ? 5 : kind === 'bleacher' ? 4 : kind === 'foodstand' ? 3 : 2;
    const h = kind === 'neonsign' ? 1 : 2;
    if (dx2 + w >= W - 1 || it.occupied(dx2, dy2, w, h)) continue;
    if (dy2 >= H - 5 && dx2 + w >= doorX - 2 && dx2 <= doorX + 2) continue;
    it.addDecor(dx2, dy2, w, h, kind, kind !== 'neonsign');
    placedD++;
  }
  scatterPatrons(it, style.patrons, style.smoke);
  return it;
}

const BESPOKE = {
  'Roaring Elephant Arena': buildFightArena,
  'The Golden Temple': buildZenTemple,
  'Waterfall Park Pavilion': buildZenTemple,
  'Shady Temple': buildShadyTemple,
  'Hidden Temple': buildShadyTemple,
  'Ballyclover Castle': buildCastleFeast,
  'Horseshoe Downs': buildDowns,
  'The Panhellenium': buildPanhellenium,
  'Coliseum of Pontium': buildColiseum,
};

function buildInterior(lm) {
  const it = (BESPOKE[lm.name] || buildGeneric)(lm);
  if (!it.style.tint) it.style.tint = 'rgba(0,0,0,0.05)';
  if (!it.style.floor) it.style.floor = T.PLAZA;
  return it;
}

/* ============================================================
   Live updates: patrons wander, actors perform
   ============================================================ */
export function updatePatrons(it, dt) {
  const now = performance.now();
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
      if (Math.random() < dt * 0.06) p.cheerT = 1.4;
      p.frame = 0;
      continue;
    }
    p.thinkT -= dt;
    if (p.thinkT <= 0) {
      p.thinkT = 1.6 + Math.random() * 2.6;
      if (Math.random() < 0.35) { p.heading = null; p.frame = 0; continue; }
      const ang = Math.random() * Math.PI * 2;
      p.heading = { dx: Math.cos(ang), dy: Math.sin(ang) };
      p.dir = Math.abs(p.heading.dx) > Math.abs(p.heading.dy) ? (p.heading.dx < 0 ? 1 : 2) : (p.heading.dy < 0 ? 3 : 0);
    }
    if (!p.heading) continue;
    // on a bump: pause and rethink shortly — never re-roll every frame
    const stop = () => { p.heading = null; p.thinkT = 0.35 + Math.random() * 0.6; };
    const nx = p.x + p.heading.dx * p.speed * dt;
    const ny = p.y + p.heading.dy * p.speed * dt;
    if (!solid(nx, p.y - 2) && !solid(nx, p.y + 5)) p.x = nx; else stop();
    if (p.heading && !solid(p.x - 4, ny + 5) && !solid(p.x + 4, ny + 5)) p.y = ny; else stop();
    if (p.heading) {
      p.animT += dt;
      if (p.animT > 0.18) { p.animT = 0; p.frame = 1 - p.frame; }
    } else p.frame = 0;
  }

  for (const a of it.actors) {
    if (a.arena) continue;   // arena performers belong to the live-events director
    a.t = (a.t || 0) + dt;
    if (a.emote) { a.emote.t -= dt; if (a.emote.t <= 0) a.emote = null; }
    switch (a.type) {
      case 'fighter': {
        // lunge in and out at the opponent, trading blows
        a.homeX = a.homeX ?? a.x;
        a.x = a.homeX + Math.sin(a.t * 3.2) * 5 * (a.foeDx || 1);
        a.frame = ((a.t * 6) | 0) % 2;
        if (!a.emote && Math.random() < dt * 0.5) a.emote = { ico: a.hitIco || '💥', t: 0.6 };
        break;
      }
      case 'paddock': {   // a courser on show: shifts its stance now and then
        if (Math.random() < dt * 0.3) a.dir = [0, 1, 2][(Math.random() * 3) | 0];
        a.frame = 0;
        break;
      }
      case 'ref': {
        a.x = a.cx + Math.cos(a.t * 0.9) * a.r;
        a.y = a.cy + Math.sin(a.t * 0.9) * a.r * 0.5;
        a.dir = Math.cos(a.t * 0.9) < 0 ? 2 : 1;
        a.frame = ((a.t * 3) | 0) % 2;
        break;
      }
      case 'monkTai': {
        // whole courtyard flows through the same form together
        const phase = ((now / 1400) | 0) % 4;
        a.dir = [0, 2, 3, 1][phase];
        a.frame = ((now / 700) | 0) % 2;
        break;
      }
      case 'monkMed':
      case 'noble':
      case 'jester':
      case 'corner': {
        if (!a.emote && a.emIco && Math.random() < dt * 0.10) a.emote = { ico: a.emIco, t: 1.5 };
        break;
      }
      case 'servant': {
        const [tx, ty] = a.pts[a.i];
        const dx = tx - a.x, dy = ty - a.y;
        const d = Math.hypot(dx, dy);
        if (d < 6) { a.i = (a.i + 1) % a.pts.length; break; }
        a.x += (dx / d) * a.speed * dt;
        a.y += (dy / d) * a.speed * dt;
        a.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 2) : (dy < 0 ? 3 : 0);
        a.frame = ((a.t * 7) | 0) % 2;
        break;
      }
      case 'philosopher': {
        const beat = ((now / 1700) | 0) % 2;
        a.frame = ((now / 850) | 0) % 2;
        if (beat === a.pair && !a.emote) a.emote = { ico: a.emes[((now / 3400) | 0) % a.emes.length], t: 1.2 };
        break;
      }
      // 'cheer' markers animate at draw time
    }
  }
}
