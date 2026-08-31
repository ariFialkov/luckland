/* ============================================================
   The Building Atlas — every structure and prop in the world.
   ------------------------------------------------------------
   Generates the real world from the real seed, then paints each
   building and roadside prop with the game's own sprite
   functions. Two views: every instance standing out there, and
   the deduplicated "art slots" — the list an artist replacing
   this art actually has to draw.

   Sprites render lazily as cards scroll into view, so 628
   canvases never land in one frame.
   ============================================================ */

import { generateWorld, PROVINCES } from '../src/world.js';
import { getBuildingSprite, getEventSprite } from '../src/sprites.js';
import { GAME_DEFS } from '../src/games.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const world = generateWorld();
$('loading').remove();

/* ------------------------------------------------------------
   Entries — one per placed object, plus the art slot it belongs to
   ------------------------------------------------------------ */
// street props pick one of three designs by v % 3, so that counts as a slot too
const propDesign = (b) => b.v % 3;

function buildingEntry(b, i) {
  const style = b.kind === 'landmark' ? `landmark · ${b.sub || 'default'}` : b.kind;
  const isProp = b.kind === 'prop';
  const label = isProp ? `${style} #${propDesign(b) + 1}` : style;
  return {
    set: 'buildings', i, rec: b,
    label, kind: b.kind, style,
    prov: b.prov, provName: (PROVINCES[b.prov] || {}).name || b.prov,
    w: b.w, h: b.h, px: `${b.w * 16} × ${b.h * 16}`,
    slot: `${style}|${b.prov}|${b.w}x${b.h}${isProp ? `|d${propDesign(b)}` : ''}`,
    draw: () => getBuildingSprite(b),
    at: `${b.x}, ${b.y}`,
  };
}

function eventEntry(e, i) {
  const def = GAME_DEFS[e.game] || {};
  return {
    set: 'props', i, rec: e,
    label: def.name || e.game, kind: e.game, style: e.game,
    prov: e.prov || '—', provName: (PROVINCES[e.prov] || {}).name || e.prov || 'anywhere',
    w: e.w, h: e.h, px: `${e.w * 16} × ${e.h * 16}`,
    slot: `${e.game}|${e.w}x${e.h}`,
    draw: () => getEventSprite(e),
    at: `${e.x}, ${e.y}`,
    ico: def.ico || '🎲',
  };
}

const ALL = [
  ...world.buildings.map(buildingEntry),
  ...world.events.map(eventEntry),
];
for (const e of ALL) e.search = `${e.label} ${e.style} ${e.prov} ${e.provName} ${e.w}x${e.h} ${e.px}`.toLowerCase();

/* art slots: first instance of each, with a count of how many use it */
function slotsOf(list) {
  const seen = new Map();
  for (const e of list) {
    if (!seen.has(e.slot)) seen.set(e.slot, { ...e, count: 0 });
    seen.get(e.slot).count++;
  }
  return [...seen.values()];
}
const SLOTS = { buildings: slotsOf(ALL.filter((e) => e.set === 'buildings')), props: slotsOf(ALL.filter((e) => e.set === 'props')) };

/* ------------------------------------------------------------
   Controls
   ------------------------------------------------------------ */
const state = { set: 'buildings', view: 'slots', q: '', zoom: 2, kind: new Set(), prov: new Set() };

const DATASETS = [
  ['buildings', `🏛️ Buildings`, world.buildings.length],
  ['props', `🎪 Roadside props`, world.events.length],
];
const VIEWS = [['slots', '🎨 Art slots'], ['all', '📍 Every instance']];

function chipHtml(v, label, n, on) {
  return `<button class="chip${on ? ' on' : ''}" data-v="${esc(v)}" type="button">${esc(label)}${n !== undefined ? ` <span class="n">${n}</span>` : ''}</button>`;
}
function wire(host, key, single) {
  host.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.v;
    if (single) {
      state[key] = v;
      host.querySelectorAll('.chip').forEach((o) => o.classList.toggle('on', o === b));
    } else {
      if (state[key].has(v)) state[key].delete(v); else state[key].add(v);
      b.classList.toggle('on', state[key].has(v));
    }
    if (single) rebuildFilters();
    render();
  }));
}

function rebuildFilters() {
  state.kind.clear(); state.prov.clear();
  const pool = current(true);
  const kinds = [...new Set(pool.map((e) => e.style))].sort();
  $('f-kind').innerHTML = kinds.map((k) =>
    chipHtml(k, k, pool.filter((e) => e.style === k).length, false)).join('');
  wire($('f-kind'), 'kind');
  const provs = [...new Set(pool.map((e) => e.prov))].sort();
  $('f-prov').innerHTML = provs.map((p) =>
    chipHtml(p, (PROVINCES[p] || {}).name || p, pool.filter((e) => e.prov === p).length, false)).join('');
  wire($('f-prov'), 'prov');
}

$('dataset').innerHTML = DATASETS.map(([v, l, n]) => chipHtml(v, l, n, v === state.set)).join('');
wire($('dataset'), 'set', true);
$('viewmode').innerHTML = VIEWS.map(([v, l]) => chipHtml(v, l, undefined, v === state.view)).join('');
wire($('viewmode'), 'view', true);
$('q').addEventListener('input', (e) => { state.q = e.target.value; render(); });
$('zoom').addEventListener('change', (e) => { state.zoom = +e.target.value; render(); });

/* ------------------------------------------------------------
   Rendering — lazy, so hundreds of canvases stay smooth
   ------------------------------------------------------------ */
function current(ignoreFilters) {
  const pool = state.view === 'slots' ? SLOTS[state.set] : ALL.filter((e) => e.set === state.set);
  if (ignoreFilters) return pool;
  const q = state.q.trim().toLowerCase();
  return pool.filter((e) => {
    if (state.kind.size && !state.kind.has(e.style)) return false;
    if (state.prov.size && !state.prov.has(e.prov)) return false;
    if (q && !e.search.includes(q)) return false;
    return true;
  });
}

const io = new IntersectionObserver((entries) => {
  for (const en of entries) {
    if (!en.isIntersecting) continue;
    const el = en.target;
    io.unobserve(el);
    const e = el._entry;
    const spr = e.draw();
    const cv = document.createElement('canvas');
    cv.width = spr.width * state.zoom; cv.height = spr.height * state.zoom;
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.drawImage(spr, 0, 0, cv.width, cv.height);
    el.appendChild(cv);
  }
}, { rootMargin: '300px' });

function card(e) {
  const el = document.createElement('div');
  el.className = 'card';
  const stage = document.createElement('div');
  stage.className = 'stage';
  stage.style.minHeight = `${Math.max(56, e.h * 16 * state.zoom + 12)}px`;
  stage._entry = e;
  io.observe(stage);
  el.appendChild(stage);
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="kname">${e.ico ? `${e.ico} ` : ''}${esc(e.label)}</div>
    <div class="kmeta">${esc(e.provName)} · ${e.w}×${e.h} tiles</div>
    <div class="kpx">${e.px} px</div>
    ${state.view === 'slots'
      ? `<span class="kbadge${e.count === 1 ? ' one' : ''}">${e.count} in world</span>`
      : `<div class="kmeta">at ${e.at}</div>`}`;
  el.appendChild(body);
  return el;
}

function render() {
  const list = current();
  const grid = $('grid');
  grid.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const e of list) frag.appendChild(card(e));
  grid.appendChild(frag);
  $('empty').classList.toggle('hidden', list.length > 0);

  const bSlots = SLOTS.buildings.length, pSlots = SLOTS.props.length;
  $('summary').innerHTML = `
    <div class="stat"><b>${world.buildings.length}</b><span>buildings placed</span></div>
    <div class="stat hero"><b>${bSlots}</b><span>building art slots</span></div>
    <div class="stat"><b>${world.events.length}</b><span>props placed</span></div>
    <div class="stat hero"><b>${pSlots}</b><span>prop art slots</span></div>
    <div class="stat"><b>${bSlots + pSlots}</b><span>pieces to draw</span></div>
    <div class="stat"><b>${list.length}</b><span>showing</span></div>`;
  $('count').textContent = state.view === 'slots'
    ? `${list.length} unique art slot${list.length === 1 ? '' : 's'} — one sprite each replaces every instance using it`
    : `${list.length} individual ${state.set === 'buildings' ? 'buildings' : 'props'} standing in the world`;
}

/* ------------------------------------------------------------
   Exports
   ------------------------------------------------------------ */
function download(name, blobOrText, mime) {
  const blob = blobOrText instanceof Blob ? blobOrText : new Blob([blobOrText], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('dl-sheet').addEventListener('click', () => {
  const list = current();
  if (!list.length) return;
  const S = 2, PAD = 12, LABEL = 34;
  const cols = Math.min(8, Math.ceil(Math.sqrt(list.length)));
  const cw = Math.max(...list.map((e) => e.w * 16 * S)) + PAD * 2;
  const ch = Math.max(...list.map((e) => e.h * 16 * S)) + PAD + LABEL;
  const cv = document.createElement('canvas');
  cv.width = cols * cw;
  cv.height = Math.ceil(list.length / cols) * ch + 42;
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = false;
  c.fillStyle = '#1c1430'; c.fillRect(0, 0, cv.width, cv.height);
  c.fillStyle = '#ffd75e'; c.font = 'bold 15px monospace';
  c.fillText(`Luckland — ${state.set === 'buildings' ? 'buildings' : 'roadside props'} · ${state.view === 'slots' ? 'art slots' : 'all instances'} · ${list.length} sprites`, 10, 24);
  list.forEach((e, i) => {
    const x = (i % cols) * cw, y = 38 + ((i / cols) | 0) * ch;
    const spr = e.draw();
    const dx = x + (cw - spr.width * S) / 2;
    const dy = y + (ch - LABEL - spr.height * S);
    c.drawImage(spr, dx, dy, spr.width * S, spr.height * S);
    c.fillStyle = '#f5e6c4'; c.font = 'bold 10px monospace'; c.textAlign = 'center';
    c.fillText(e.label.slice(0, 22), x + cw / 2, y + ch - 20);
    c.fillStyle = '#9c93b0'; c.font = '9px monospace';
    c.fillText(`${e.provName.slice(0, 16)} · ${e.px}px`, x + cw / 2, y + ch - 8);
    c.textAlign = 'left';
  });
  cv.toBlob((b) => download(`luckland-${state.set}-${state.view}.png`, b, 'image/png'));
});

$('dl-json').addEventListener('click', () => {
  const manifest = (set) => ({
    placed: set === 'buildings' ? world.buildings.length : world.events.length,
    artSlots: SLOTS[set].length,
    slots: SLOTS[set].map((e) => ({
      slot: e.slot, label: e.label, kind: e.style,
      province: e.provName, provinceCode: e.prov,
      tiles: [e.w, e.h], pixels: [e.w * 16, e.h * 16],
      instancesInWorld: e.count,
    })),
  });
  download('luckland-buildings.json', JSON.stringify({
    tileSize: 16,
    buildings: manifest('buildings'),
    roadsideProps: manifest('props'),
  }, null, 2), 'application/json');
});

/* ------------------------------------------------------------ */
$('swap-rules').innerHTML = [
  `<b>${world.buildings.length} buildings and ${world.events.length} props collapse to
   ${SLOTS.buildings.length} + ${SLOTS.props.length} = ${SLOTS.buildings.length + SLOTS.props.length} pieces of art.</b>
   Every placed structure currently gets its own canvas because the painter re-rolls detail
   noise per building — but that noise disappears the moment real art replaces it. Draw one
   sprite per slot and it serves every instance using it.`,
  `<b>Size is the footprint, exactly.</b> A sprite is <code>width × 16</code> by
   <code>height × 16</code> pixels and covers precisely the tiles the building occupies — no
   overhang, no offset. The footprint tiles are already solid for collision, so art that
   stays inside its box cannot break walking or worldgen.`,
  `<b>Draw with the base at the bottom edge.</b> The renderer blits each sprite at the
   footprint's top-left corner with the terrain showing through transparent pixels, which is
   how roof tapers and the ground around a statue read correctly today.`,
  `<b>Replacing is one swap.</b> <code>getBuildingSprite()</code> and
   <code>getEventSprite()</code> are the only ways the game obtains these images, and both
   are cached by key — point them at your loaded sheet instead of the painter and the render
   loop never notices. Shared art also cuts the ${world.buildings.length} live canvases down
   to ${SLOTS.buildings.length}.`,
].map((h) => `<li>${h}</li>`).join('');

rebuildFilters();
render();
