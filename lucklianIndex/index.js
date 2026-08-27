/* ============================================================
   The Lucklian Index — a live field guide.
   ------------------------------------------------------------
   Nothing here is transcribed by hand. The table is built from
   the game's own species list and helper functions at load, so
   editing src/lucklians.js (or the value / RTP / snare formulas)
   is reflected on the next refresh with no work here.
   ============================================================ */

import { LUCKLIANS, SNARES, catchChance, rarityTier, habitatTypes } from '../src/lucklians.js';
import { getLucklianSprite } from '../src/sprites.js';
import { PROVINCES, T } from '../src/world.js';
import { CONFIG } from '../src/config.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Math.round(n).toLocaleString('en-US');

/* ------------------------------------------------------------
   Which terrain hosts which habitat type — probed straight out
   of habitatTypes() with a stub world, so the mapping can never
   drift from the real spawning rules.
   ------------------------------------------------------------ */
const TILE_LABEL = {
  DEEP: 'deep water', WATER: 'open water', TIDAL: 'tide flats', SAND: 'sand',
  GRASS: 'grass', MEADOW: 'meadow', FOREST: 'forest', JUNGLE: 'jungle',
  HILL: 'hills', MOUNTAIN: 'mountains', DUST: 'dust', SCRUB: 'scrub',
  ROAD: 'roads', PLAZA: 'plazas', CLIFF: 'cliffs', NEON: 'neon streets',
  FLOWERS: 'flowers', BAMBOO: 'bamboo', WETSAND: 'wet sand', TRAIL: 'trails',
  PEAK: 'peaks', SHALLOW: 'shallows', TALLGRASS: 'tall grass', BUSH: 'brush',
};

function probeTerrain() {
  const NEUTRAL = T.BRIDGE;   // no habitat rule reads bridges — a safe filler
  const byType = new Map();
  const add = (type, label) => {
    if (!byType.has(type)) byType.set(type, new Set());
    byType.get(type).add(label);
  };
  for (const [key, tile] of Object.entries(T)) {
    const label = TILE_LABEL[key];
    if (!label) continue;
    for (const sea of [false, true]) {
      const prov = sea ? 'SEA' : 'EP';
      // pass A — the tile you are standing on
      const centerWorld = {
        get: (x, y) => (x === 0 && y === 0 ? tile : NEUTRAL),
        provAt: () => prov,
      };
      for (const t of habitatTypes(centerWorld, 0, 0).keys()) add(t, label);
      // pass B — a tile in the ring beside you (solid habitat radiates out)
      const ringWorld = {
        get: (x, y) => (x === 0 && y === 0 ? NEUTRAL : tile),
        provAt: () => prov,
      };
      for (const t of habitatTypes(ringWorld, 0, 0).keys()) add(t, `beside ${label}`);
    }
  }
  // collapse "x" + "beside x" into just "x" where both appear
  const out = {};
  for (const [type, set] of byType) {
    const direct = [...set].filter((s) => !s.startsWith('beside '));
    const beside = [...set].filter((s) => s.startsWith('beside ') && !set.has(s.slice(7)));
    out[type] = [...direct, ...beside];
  }
  return out;
}
const TERRAIN = probeTerrain();

/* ------------------------------------------------------------
   Traits pulled from the systems that read the species table
   ------------------------------------------------------------ */
const MIG_ARCH = ['deer', 'quad', 'ram', 'hare', 'fox', 'primate'];
const HUNT_THEMES = [
  { name: 'Sea Legs', ico: '🌊', filter: (l) => l.type === 'Sea' },
  { name: 'Neon Nights', ico: '🌃', filter: (l) => l.type === 'Neon' },
  { name: 'Snowbound', ico: '❄️', filter: (l) => l.type === 'Snow' },
  { name: 'Birds of a Feather', ico: '🪶', filter: (l) => ['bird', 'raptor', 'owl'].includes(l.a) },
  { name: 'Mountain Majesty', ico: '⛰️', filter: (l) => l.type === 'Mountain' },
  { name: 'Creepy-Crawlies', ico: '🐞', filter: (l) => ['beetle', 'crab', 'moth'].includes(l.a) },
];

function traitsOf(l) {
  const t = [];
  if (l.glow) t.push({ cls: 'glow', text: '✦ glows' });
  if (MIG_ARCH.includes(l.a) && l.rare >= 0.003 && l.rare <= 0.06) t.push({ cls: 'mig', text: '🦌 migrates' });
  if (l.rare >= 0.004 && l.rare < 0.05) t.push({ cls: 'contra', text: '🏮 black market' });
  for (const th of HUNT_THEMES) if (th.filter(l)) t.push({ cls: 'theme', text: `${th.ico} ${th.name}` });
  return t;
}

/* ------------------------------------------------------------
   Rows
   ------------------------------------------------------------ */
const CAP = CONFIG.LUCKLIAN.MAX_CATCH;
const ROWS = LUCKLIANS.map((l) => {
  const tier = rarityTier(l.rare);
  return {
    def: l,
    tier,
    sprite: getLucklianSprite(l).toDataURL(),
    terrain: TERRAIN[l.type] || [],
    traits: traitsOf(l),
    snares: SNARES.map((s) => ({ name: s.name, ico: s.ico, cost: s.cost, p: catchChance(l, s) })),
    provName: (PROVINCES[l.prov] || {}).name || l.prov,
    provColor: (PROVINCES[l.prov] || {}).color || '#888',
    search: `${l.name} ${l.type} ${l.prov} ${(PROVINCES[l.prov] || {}).name || ''} ${l.a} ${tier.name} ${l.desc}`.toLowerCase(),
  };
});

/* ------------------------------------------------------------
   Summary + filter chips
   ------------------------------------------------------------ */
const TIER_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'];
const PROV_CODES = [...new Set(ROWS.map((r) => r.def.prov))]
  .sort((a, b) => Object.keys(PROVINCES).indexOf(a) - Object.keys(PROVINCES).indexOf(b));
const TYPES = [...new Set(ROWS.map((r) => r.def.type))].sort();
const TIERS = TIER_ORDER.filter((t) => ROWS.some((r) => r.tier.name === t));

const state = { q: '', sort: 'id', prov: new Set(), type: new Set(), tier: new Set() };

function renderSummary() {
  const counts = TIERS.map((t) => `<div class="stat"><b>${ROWS.filter((r) => r.tier.name === t).length}</b><span>${t}</span></div>`).join('');
  const values = ROWS.map((r) => r.def.value);
  $('summary').innerHTML = `
    <div class="stat"><b>${ROWS.length}</b><span>species</span></div>
    <div class="stat"><b>${PROV_CODES.length}</b><span>provinces</span></div>
    <div class="stat"><b>${TYPES.length}</b><span>habitats</span></div>
    ${counts}
    <div class="stat"><b>${fmt(Math.max(...values))}</b><span>top value 🪙</span></div>`;
}

function chipRow(host, items, key) {
  host.innerHTML = items.map((it) => `
    <button class="chip" data-v="${esc(it.v)}" type="button">
      ${it.color ? `<i class="dot" style="background:${it.color}"></i>` : ''}${esc(it.label)}
      <span style="opacity:.6"> ${it.n}</span>
    </button>`).join('');
  host.querySelectorAll('.chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.v;
      if (state[key].has(v)) state[key].delete(v); else state[key].add(v);
      btn.classList.toggle('on', state[key].has(v));
      render();
    });
  });
}

function renderFilters() {
  chipRow($('f-prov'), PROV_CODES.map((c) => ({
    v: c, label: (PROVINCES[c] || {}).name || c, color: (PROVINCES[c] || {}).color,
    n: ROWS.filter((r) => r.def.prov === c).length,
  })), 'prov');
  chipRow($('f-type'), TYPES.map((t) => ({
    v: t, label: t, n: ROWS.filter((r) => r.def.type === t).length,
  })), 'type');
  chipRow($('f-tier'), TIERS.map((t) => ({
    v: t, label: t, color: ROWS.find((r) => r.tier.name === t).tier.color,
    n: ROWS.filter((r) => r.tier.name === t).length,
  })), 'tier');
}

function renderLegend() {
  $('legend').innerHTML = TIERS.map((t) => {
    const ex = ROWS.find((r) => r.tier.name === t).tier;
    const band = ROWS.filter((r) => r.tier.name === t).map((r) => r.def.rare);
    const lo = Math.min(...band) * 100, hi = Math.max(...band) * 100;
    return `<span class="lg" style="color:${ex.color}"><b>${t}</b>
      <span style="color:var(--dim)"> ${lo < 0.1 ? lo.toFixed(2) : lo.toFixed(1)}–${hi.toFixed(1)}% rarity</span></span>`;
  }).join('');
}

/* ------------------------------------------------------------
   The table
   ------------------------------------------------------------ */
function visible() {
  const q = state.q.trim().toLowerCase();
  let out = ROWS.filter((r) => {
    if (state.prov.size && !state.prov.has(r.def.prov)) return false;
    if (state.type.size && !state.type.has(r.def.type)) return false;
    if (state.tier.size && !state.tier.has(r.tier.name)) return false;
    if (q && !r.search.includes(q)) return false;
    return true;
  });
  const by = {
    id: (a, b) => a.def.id - b.def.id,
    name: (a, b) => a.def.name.localeCompare(b.def.name),
    'rare-asc': (a, b) => a.def.rare - b.def.rare,
    'rare-desc': (a, b) => b.def.rare - a.def.rare,
    'value-desc': (a, b) => b.def.value - a.def.value,
    'value-asc': (a, b) => a.def.value - b.def.value,
    'rtp-desc': (a, b) => b.def.rtp - a.def.rtp,
    prov: (a, b) => a.provName.localeCompare(b.provName) || a.def.id - b.def.id,
    type: (a, b) => a.def.type.localeCompare(b.def.type) || a.def.id - b.def.id,
  };
  return out.sort(by[state.sort] || by.id);
}

function rowHtml(r) {
  const l = r.def;
  const pct = l.rare * 100;
  return `<tr>
    <td class="c-spr"><img class="spr" src="${r.sprite}" alt="${esc(l.name)}" loading="lazy"></td>
    <td class="c-id"><span class="id">${String(l.id).padStart(3, '0')}</span></td>
    <td class="c-name">
      <span class="nm">${esc(l.name)}</span>
      <span class="pal">${l.c.map((c) => `<i style="background:${esc(c)}" title="${esc(c)}"></i>`).join('')}</span>
    </td>
    <td class="c-prov"><span class="prov"><i class="dot" style="background:${r.provColor}"></i>${esc(r.provName)}</span></td>
    <td class="c-type">
      <span class="hab">${esc(l.type)}</span>
      <span class="terr">${esc(r.terrain.join(', ') || '—')}</span>
    </td>
    <td class="c-rare">
      <span class="tier" style="color:${r.tier.color}">${r.tier.name}</span>
      <span class="pct" title="Rarity expressed as odds — 1 in ${fmt(1 / l.rare)}">1 in ${fmt(1 / l.rare)}</span>
    </td>
    <td class="c-num" title="This species' weight inside its province + habitat pool. The real chance of meeting it also depends on how many other species share that pool.">${pct < 0.1 ? pct.toFixed(3) : pct.toFixed(1)}%</td>
    <td class="c-num"><span class="val">${fmt(l.value)}</span></td>
    <td class="c-num">${(l.rtp * 100).toFixed(1)}%</td>
    <td class="c-snare"><span class="snares">${r.snares.map((s) => `
      <span class="sn${s.p >= CAP ? ' cap' : ''}" title="${esc(s.name)} · ${s.cost} 🪙">
        ${s.ico} <b>${(s.p * 100).toFixed(0)}%</b></span>`).join('')}</span></td>
    <td class="c-traits"><span class="traits">
      <span class="tr arch">${esc(l.a)}</span>
      ${r.traits.map((t) => `<span class="tr ${t.cls}">${esc(t.text)}</span>`).join('')}
    </span></td>
    <td class="c-desc"><span class="desc">${esc(l.desc)}</span></td>
  </tr>`;
}

function render() {
  const rows = visible();
  $('rows').innerHTML = rows.map(rowHtml).join('');
  $('empty').classList.toggle('hidden', rows.length > 0);
  const filtered = rows.length !== ROWS.length;
  $('count').textContent = filtered
    ? `Showing ${rows.length} of ${ROWS.length} Lucklians`
    : `All ${ROWS.length} Lucklians`;
}

/* ------------------------------------------------------------
   Exports — the same data, for spreadsheets or tooling
   ------------------------------------------------------------ */
function download(name, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportRows() {
  return visible().map((r) => ({
    id: r.def.id,
    name: r.def.name,
    province: r.provName,
    provinceCode: r.def.prov,
    habitat: r.def.type,
    terrain: r.terrain.join('; '),
    archetype: r.def.a,
    rarity: r.tier.name,
    encounterShare: +(r.def.rare * 100).toFixed(4),
    oneIn: Math.round(1 / r.def.rare),
    value: r.def.value,
    catchRtp: +(r.def.rtp * 100).toFixed(2),
    ...Object.fromEntries(r.snares.map((s) => [`catch_${s.name.split(' ')[0].toLowerCase()}`, +(s.p * 100).toFixed(1)])),
    palette: r.def.c.join(' '),
    traits: r.traits.map((t) => t.text.replace(/^\S+\s/, '')).join('; '),
    description: r.def.desc,
  }));
}

$('csv').addEventListener('click', () => {
  const rows = exportRows();
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const cell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
  download('lucklians.csv', csv, 'text/csv');
});
$('json').addEventListener('click', () => {
  download('lucklians.json', JSON.stringify(exportRows(), null, 2), 'application/json');
});

/* ------------------------------------------------------------ */
$('q').addEventListener('input', (e) => { state.q = e.target.value; render(); });
$('sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });

renderSummary();
renderFilters();
renderLegend();
render();
