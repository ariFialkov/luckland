/* ============================================================
   The Tile Atlas — a live reference for every terrain tile.
   ------------------------------------------------------------
   Builds the game's real atlas with the game's real seed, then
   slices one instance (and all four variants) out of it per
   tile type. Change how a tile is painted and this page shows
   the change on the next refresh — nothing here is a copy.
   ============================================================ */

import { buildTileAtlas, CELL } from '../src/sprites.js';
import { T, isSolidTile, isWaterTile, TILE } from '../src/world.js';
import { habitatTypes } from '../src/lucklians.js';
import { CONFIG } from '../src/config.js';

const $ = (id) => document.getElementById(id);
const VARIANTS = 4;
const atlas = buildTileAtlas(CONFIG.WORLD_SEED);

/* ------------------------------------------------------------
   What each tile is — read out of the live code, not written down
   ------------------------------------------------------------ */
// tiles whose variant column is used as an animation frame instead
const ANIMATED = new Set([T.DEEP, T.WATER, T.SHALLOW, T.TIDAL]);
// prose only where the code can't say it for itself
const NOTE = {
  TIDAL: 'Tide-driven: high water draws this row animated, mid-tide swaps to WETSAND, low tide to SAND.',
  FOUNDATION: 'Solid ground stamped under a building sprite; the renderer paints the hall floor over it indoors.',
  TALLGRASS: 'Prime Lucklian habitat — the highest encounter rate in the game.',
  BUSH: 'Prime Lucklian habitat, and the only tile hosting grass, forest and jungle species at once.',
  DOOR: 'Solid on purpose: bumping a door opens the landmark instead of walking through it.',
};

/* habitat types each tile can host, probed from the real spawn rules */
function hostsFor(tile) {
  const NEUTRAL = T.BRIDGE;
  const found = new Set();
  for (const prov of ['EP', 'SEA']) {
    const here = { get: (x, y) => (x === 0 && y === 0 ? tile : NEUTRAL), provAt: () => prov };
    for (const t of habitatTypes(here, 0, 0).keys()) found.add(t);
    const beside = { get: (x, y) => (x === 0 && y === 0 ? NEUTRAL : tile), provAt: () => prov };
    for (const t of habitatTypes(beside, 0, 0).keys()) found.add(`${t}*`);
  }
  // drop "beside" duplicates of a direct hit
  return [...found].filter((t) => !(t.endsWith('*') && found.has(t.slice(0, -1))));
}

const TILES = Object.entries(T)
  .map(([name, row]) => ({
    name, row,
    solidDry: isSolidTile(row, 0),
    solidWet: isSolidTile(row, 1),
    water: isWaterTile(row, 0) || isWaterTile(row, 1),
    animated: ANIMATED.has(row),
    hosts: hostsFor(row),
    note: NOTE[name] || '',
  }))
  .sort((a, b) => a.row - b.row);

/* ------------------------------------------------------------
   Slicing single tiles out of the atlas
   ------------------------------------------------------------ */
function tileCanvas(row, col, scale) {
  const cv = document.createElement('canvas');
  cv.width = CELL * scale; cv.height = CELL * scale;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(atlas, col * CELL, row * CELL, CELL, CELL, 0, 0, CELL * scale, CELL * scale);
  return cv;
}

/* ------------------------------------------------------------
   Cards
   ------------------------------------------------------------ */
const state = { filter: 'all', zoom: 4 };

function passes(t) {
  switch (state.filter) {
    case 'walkable': return !t.solidDry;
    case 'solid': return t.solidDry;
    case 'water': return t.water;
    case 'animated': return t.animated;
    case 'habitat': return t.hosts.length > 0;
    default: return true;
  }
}

function card(t) {
  const el = document.createElement('div');
  el.className = 'card';

  const art = document.createElement('div');
  art.className = 'art';
  const main = tileCanvas(t.row, 0, state.zoom);
  main.className = 'main';
  art.appendChild(main);
  const vars = document.createElement('div');
  vars.className = 'vars';
  for (let v = 0; v < VARIANTS; v++) vars.appendChild(tileCanvas(t.row, v, 1.5));
  art.appendChild(vars);
  el.appendChild(art);

  const flags = [];
  if (t.solidDry) flags.push('<span class="fl solid">solid</span>');
  else flags.push('<span class="fl walk">walkable</span>');
  if (t.solidWet !== t.solidDry) flags.push('<span class="fl tide">tide-dependent</span>');
  if (t.water) flags.push('<span class="fl water">water</span>');
  if (t.animated) flags.push('<span class="fl anim">animated</span>');

  const body = document.createElement('div');
  body.className = 'body';
  body.innerHTML = `
    <div class="tname">${t.name}</div>
    <div class="trow">atlas row ${t.row} · T.${t.name} · variants at y=${t.row * CELL}px</div>
    <div class="tsize">${CELL} × ${CELL} px</div>
    <div class="flags">${flags.join('')}</div>
    ${t.hosts.length ? `<div class="hosts">hosts <b>${t.hosts.join(', ')}</b> <span style="opacity:.6">(* = as a neighbour)</span></div>` : ''}
    ${t.note ? `<div class="hosts">${t.note}</div>` : ''}`;
  el.appendChild(body);
  return el;
}

function render() {
  const grid = $('grid');
  grid.innerHTML = '';
  const shown = TILES.filter(passes);
  for (const t of shown) grid.appendChild(card(t));
  $('summary').innerHTML = `
    <div class="stat"><b>${TILES.length}</b><span>tile types</span></div>
    <div class="stat"><b>${CELL} × ${CELL}</b><span>px per tile</span></div>
    <div class="stat"><b>${VARIANTS}</b><span>variants each</span></div>
    <div class="stat"><b>${atlas.width} × ${atlas.height}</b><span>atlas canvas</span></div>
    <div class="stat"><b>${TILES.filter((t) => !t.solidDry).length}</b><span>walkable</span></div>
    <div class="stat"><b>${TILES.filter((t) => t.water).length}</b><span>water</span></div>
    <div class="stat"><b>${shown.length}</b><span>showing</span></div>`;
}

/* ------------------------------------------------------------
   Filters + zoom
   ------------------------------------------------------------ */
const FILTERS = [
  ['all', 'All'], ['walkable', 'Walkable'], ['solid', 'Solid'],
  ['water', 'Water'], ['animated', 'Animated'], ['habitat', 'Hosts Lucklians'],
];
$('filters').innerHTML = FILTERS.map(([v, label]) =>
  `<button class="chip${v === 'all' ? ' on' : ''}" data-v="${v}" type="button">${label}</button>`).join('');
$('filters').querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => {
  state.filter = b.dataset.v;
  $('filters').querySelectorAll('.chip').forEach((o) => o.classList.toggle('on', o === b));
  render();
}));
$('zoom').addEventListener('change', (e) => { state.zoom = +e.target.value; render(); });

/* ------------------------------------------------------------
   The whole atlas, and downloads
   ------------------------------------------------------------ */
$('atlas-dims').textContent = `${atlas.width} × ${atlas.height} px`;
{
  const view = $('atlas-view');
  const s = 4;
  view.width = atlas.width * s; view.height = atlas.height * s;
  const c = view.getContext('2d');
  c.imageSmoothingEnabled = false;
  c.drawImage(atlas, 0, 0, view.width, view.height);
}

function download(name, blobOrText, mime) {
  const blob = blobOrText instanceof Blob ? blobOrText : new Blob([blobOrText], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('dl-atlas').addEventListener('click', () => {
  atlas.toBlob((b) => download('luckland-tiles-atlas.png', b, 'image/png'));
});

/* a labelled contact sheet: every tile at 4x with its name and row */
$('dl-sheet').addEventListener('click', () => {
  const S = 4, cellW = CELL * S + 96, cellH = CELL * S + 26, cols = 5;
  const cv = document.createElement('canvas');
  cv.width = cols * cellW + 16;
  cv.height = Math.ceil(TILES.length / cols) * cellH + 46;
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = false;
  c.fillStyle = '#1c1430'; c.fillRect(0, 0, cv.width, cv.height);
  c.fillStyle = '#ffd75e'; c.font = 'bold 15px monospace';
  c.fillText(`Luckland tile atlas — ${TILES.length} types, ${CELL}×${CELL}px each`, 10, 24);
  TILES.forEach((t, i) => {
    const x = 8 + (i % cols) * cellW, y = 38 + ((i / cols) | 0) * cellH;
    c.drawImage(atlas, 0, t.row * CELL, CELL, CELL, x, y, CELL * S, CELL * S);
    c.strokeStyle = '#3a2c58'; c.strokeRect(x + 0.5, y + 0.5, CELL * S, CELL * S);
    c.fillStyle = '#f5e6c4'; c.font = 'bold 12px monospace';
    c.fillText(t.name, x + CELL * S + 8, y + 18);
    c.fillStyle = '#9c93b0'; c.font = '11px monospace';
    c.fillText(`row ${t.row}`, x + CELL * S + 8, y + 34);
    c.fillText(t.solidDry ? 'solid' : 'walkable', x + CELL * S + 8, y + 48);
  });
  cv.toBlob((b) => download('luckland-tiles-sheet.png', b, 'image/png'));
});

$('dl-json').addEventListener('click', () => {
  download('luckland-tiles.json', JSON.stringify({
    tileSize: CELL, worldTileSize: TILE, variants: VARIANTS,
    atlas: { width: atlas.width, height: atlas.height, columns: VARIANTS, rows: TILES.length },
    tiles: TILES.map((t) => ({
      name: t.name, row: t.row,
      atlasY: t.row * CELL,
      size: [CELL, CELL],
      walkable: !t.solidDry,
      tideDependent: t.solidWet !== t.solidDry,
      water: t.water,
      animated: t.animated,
      hostsLucklians: t.hosts,
      note: t.note || undefined,
    })),
  }, null, 2), 'application/json');
});

/* ------------------------------------------------------------
   The swap contract — stated from the live constants
   ------------------------------------------------------------ */
$('swap-rules').innerHTML = [
  `<b>One image per (row, column).</b> Supply art at <b>${CELL}×${CELL}px</b> — or any exact
   multiple of it for a hi-res pack — and blit it into the atlas at
   <code>(col × ${CELL}, row × ${CELL})</code>. Row numbers are the <code>T</code> values above and
   never change unless you edit <code>src/world.js</code>.`,
  `<b>Four variants per tile, or one repeated.</b> The renderer picks a column per world
   position; give a tile the same art in all four columns and it simply stops varying.
   ${'The four water rows and TIDAL use the column as an animation frame instead, so those want a 4-frame loop.'}`,
  `<b>Draw, don't decide.</b> Worldgen, collision, tides, habitats and the minimap all read
   the <code>T</code> value, never the pixels — so replacement art cannot break generation as
   long as row numbers stay put.`,
  `<b>One atlas, one upload.</b> Ship a single ${atlas.width}×${atlas.height} PNG (or a 2×/4× version)
   rather than ${TILES.length * VARIANTS} files: one decode, one GPU texture, no per-tile
   fetches, and the current draw call works unchanged.`,
].map((h) => `<li>${h}</li>`).join('');

render();
