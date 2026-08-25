/* ============================================================
   Luckland — DOM UI: HUD, modal system, toasts, joystick,
   stats & world map screens.
   ============================================================ */

import { BET_STEPS } from './config.js';
import { state, luckActive, tideSightActive, resetGame } from './state.js';
import { T, PROVINCES } from './world.js';

const $ = (id) => document.getElementById(id);

export const els = {
  balance: $('balance'),
  luckChip: $('luck-chip'),
  luckLabel: $('luck-label'),
  locProvince: $('loc-province'),
  locArea: $('loc-area'),
  locSpot: $('loc-spot'),
  tideFill: $('tide-fill'),
  tideLabel: $('tide-label'),
  tideIco: $('tide-ico'),
  actBtn: $('btn-act'),
  statsBtn: $('btn-stats'),
  mapBtn: $('btn-map'),
  joystick: $('joystick'),
  toasts: $('toasts'),
  hint: $('hint'),
  splash: $('area-splash'),
  modalLayer: $('modal-layer'),
  modal: $('modal'),
};

/* ---------------- balance ---------------- */
export function renderBalance() {
  els.balance.textContent = Math.round(state.balance).toLocaleString('en-US');
  els.balance.classList.remove('bump');
  void els.balance.offsetWidth; // restart animation
  els.balance.classList.add('bump');
}

export function renderLuckChip() {
  if (luckActive()) {
    const s = Math.ceil((state.buffs.luckUntil - Date.now()) / 1000);
    els.luckChip.classList.remove('hidden');
    els.luckLabel.textContent = `Lucky +${Math.round(state.buffs.luckBonus * 100)}% · ${s}s`;
  } else if (tideSightActive()) {
    const s = Math.ceil((state.buffs.tideSightUntil - Date.now()) / 1000);
    els.luckChip.classList.remove('hidden');
    els.luckLabel.textContent = `Tide Sight · ${s}s`;
  } else {
    els.luckChip.classList.add('hidden');
  }
}

/* ---------------- tide + area ---------------- */
export function renderTide(level, rising) {
  els.tideFill.style.width = `${Math.round(level * 100)}%`;
  const phase = level > 0.62 ? 'High tide' : level < 0.38 ? 'Low tide' : rising ? 'Rising' : 'Falling';
  els.tideLabel.textContent = phase;
  els.tideIco.textContent = level > 0.62 ? '🌊' : level < 0.38 ? '🏖️' : rising ? '↗️' : '↘️';
}

let lastProv = null, lastArea = null, lastSpot = null;
export function renderLocation(code, area, spot) {
  if (code !== lastProv) {
    lastProv = code;
    const p = PROVINCES[code];
    if (p) {
      els.locProvince.textContent = p.name;
      if (code !== 'SEA') {
        // keep the big splash for province changes — those look clean
        els.splash.innerHTML = `${escapeHtml(p.name)}<span class="sub">${escapeHtml(p.sub)}</span>`;
        els.splash.classList.remove('hidden');
        els.splash.style.animation = 'none';
        void els.splash.offsetWidth;
        els.splash.style.animation = '';
      }
    }
  }
  if (area !== lastArea) { lastArea = area; els.locArea.textContent = area || ''; }
  if (spot !== lastSpot) { lastSpot = spot; els.locSpot.textContent = spot || ''; }
}

/* ---------------- hint / act button ---------------- */
export function setHint(text) {
  if (text) { els.hint.textContent = text; els.hint.classList.remove('hidden'); }
  else els.hint.classList.add('hidden');
}
export function setActButton(visible, ico = '✨') {
  els.actBtn.textContent = ico;
  els.actBtn.classList.toggle('hidden', !visible);
}

/* ---------------- toasts ---------------- */
export function toast(html, big = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (big ? ' big-win' : '');
  el.innerHTML = html;
  els.toasts.appendChild(el);
  while (els.toasts.children.length > 4) els.toasts.removeChild(els.toasts.firstChild);
  setTimeout(() => el.remove(), 5200);
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------------- modal system ---------------- */
let modalOpen = false;
let onCloseCb = null;

export function isModalOpen() { return modalOpen; }

export function showModal(html, { onClose = null, closable = true } = {}) {
  modalOpen = true;
  onCloseCb = onClose;
  els.modal.innerHTML = html;
  if (closable) {
    const x = document.createElement('button');
    x.className = 'close-x';
    x.textContent = '✕';
    x.addEventListener('click', closeModal);
    els.modal.prepend(x);
  }
  els.modalLayer.classList.remove('hidden');
  return els.modal;
}

export function closeModal() {
  modalOpen = false;
  els.modalLayer.classList.add('hidden');
  els.modal.innerHTML = '';
  const cb = onCloseCb; onCloseCb = null;
  if (cb) cb();
}

els.modalLayer.addEventListener('pointerdown', (e) => {
  if (e.target === els.modalLayer) closeModal();
});

/* ---------------- bet selector ---------------- */
export function buildBetRow(container, onChange) {
  const row = document.createElement('div');
  row.className = 'bet-row';
  let sel = state.lastBet;
  if (!BET_STEPS.includes(sel)) sel = BET_STEPS[0];
  const btns = [];
  for (const v of BET_STEPS) {
    const b = document.createElement('button');
    b.className = 'bet-chipbtn' + (v === sel ? ' sel' : '');
    b.textContent = v >= 1000 ? `${v / 1000}k` : String(v);
    b.addEventListener('click', () => {
      sel = v; state.lastBet = v;
      for (const bb of btns) bb.classList.toggle('sel', Number(bb.dataset.v) === v);
      onChange(v);
    });
    b.dataset.v = v;
    btns.push(b);
    row.appendChild(b);
  }
  container.appendChild(row);
  onChange(sel);
  return () => sel;
}

/* ---------------- joystick (touch) ---------------- */
const joy = { active: false, dx: 0, dy: 0 };
export function getJoyVector() { return joy; }

export function setupJoystick() {
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (!isTouch) return;
  els.joystick.classList.remove('hidden');
  const base = $('joystick-base'), knob = $('joystick-knob');
  const R = 44;
  let pid = null;

  function setKnob(dx, dy) {
    knob.style.left = `${34 + dx}px`;
    knob.style.top = `${34 + dy}px`;
  }
  base.addEventListener('pointerdown', (e) => {
    pid = e.pointerId;
    base.setPointerCapture(pid);
    joy.active = true;
    move(e);
  });
  function move(e) {
    if (e.pointerId !== pid) return;
    const r = base.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = dx / d * R; dy = dy / d * R; }
    joy.dx = dx / R; joy.dy = dy / R;
    setKnob(dx, dy);
  }
  base.addEventListener('pointermove', move);
  function end(e) {
    if (e.pointerId !== pid) return;
    pid = null; joy.active = false; joy.dx = 0; joy.dy = 0;
    setKnob(0, 0);
  }
  base.addEventListener('pointerup', end);
  base.addEventListener('pointercancel', end);
}

/* ---------------- stats & collection ---------------- */
export function openStatsModal() {
  const s = state.stats;
  const rtp = s.wagered + s.chestSpent > 0
    ? ((s.won + s.chestWon) / (s.wagered + s.chestSpent) * 100).toFixed(1) + '%'
    : '—';
  const net = Math.round((s.won + s.chestWon) - (s.wagered + s.chestSpent));
  const items = state.collection.length
    ? state.collection.map((n) => `<span class="collection-item">${escapeHtml(n)}</span>`).join('')
    : '<em style="font-size:12px;color:#7a6748">Nothing yet — go crack open some chests!</em>';
  showModal(`
    <h2>📜 Adventurer's Ledger</h2>
    <div class="subtitle">Your fortunes across Luckland</div>
    <div class="stats-grid">
      <div class="stat-cell"><span class="v">${Math.round(state.balance).toLocaleString('en-US')}</span><span class="k">Balance</span></div>
      <div class="stat-cell"><span class="v" style="color:${net >= 0 ? '#3a8a3a' : '#b04030'}">${net >= 0 ? '+' : ''}${net.toLocaleString('en-US')}</span><span class="k">Lifetime net</span></div>
      <div class="stat-cell"><span class="v">${s.gamesPlayed}</span><span class="k">Games played</span></div>
      <div class="stat-cell"><span class="v">${Math.round(s.wagered).toLocaleString('en-US')}</span><span class="k">Total wagered</span></div>
      <div class="stat-cell"><span class="v">${Math.round(s.biggestWin).toLocaleString('en-US')}</span><span class="k">Biggest win</span></div>
      <div class="stat-cell"><span class="v">${rtp}</span><span class="k">Realized RTP</span></div>
      <div class="stat-cell"><span class="v">${s.chestsOpened}</span><span class="k">Chests opened</span></div>
      <div class="stat-cell"><span class="v">${s.npcsMet}</span><span class="k">Locals met</span></div>
      <div class="stat-cell" style="grid-column:1/3"><span class="v">${(s.distance / 1000).toFixed(1)} km</span><span class="k">Distance wandered</span></div>
    </div>
    <div style="text-align:center;font-weight:bold;font-size:13px;margin-top:8px">🏆 Collection (${state.collection.length})</div>
    <div class="collection-list">${items}</div>
    <div class="btn-row">
      <button class="btn secondary" id="reset-save">Reset Save</button>
      <button class="btn" id="stats-close">Back to Luckland</button>
    </div>
  `);
  $('stats-close').addEventListener('click', closeModal);
  $('reset-save').addEventListener('click', () => {
    if (confirm('Wipe your save and start a new adventure?')) resetGame();
  });
}

/* ---------------- world map ---------------- */
const PROV_MAP_COLORS = { TF: '#d9c078', FL: '#4faf50', HV: '#c8985a', DG: '#c05050', EP: '#4f9c6e', MN: '#c96ad4' };

/* Paint the base continent (terrain + landmark pips) onto any 2d
   context sized world.W x world.H — shared by the map modal and
   the Homing Post's live race view. */
export function paintWorldMap(ctx, world) {
  const img = ctx.createImageData(world.W, world.H);
  for (let y = 0; y < world.H; y++) {
    for (let x = 0; x < world.W; x++) {
      const t = world.tiles[y * world.W + x];
      let c;
      if (t === T.DEEP) c = [16, 40, 70];
      else if (t === T.WATER) c = [30, 80, 125];
      else if (t === T.TIDAL) c = [70, 140, 170];
      else if (t === T.SHALLOW) c = [88, 174, 190];
      else if (t === T.MOUNTAIN) c = [110, 106, 116];
      else if (t === T.PEAK) c = [232, 236, 244];
      else if (t === T.CLIFF) c = [125, 108, 82];
      else if (t === T.ROAD || t === T.BRIDGE || t === T.TRAIL) c = [200, 176, 136];
      else if (t === T.WALL || t === T.ROOF || t === T.DOOR || t === T.FOUNDATION ||
               t === T.WALL_MARBLE || t === T.WALL_STONE ||
               t === T.ROOF_GOLD || t === T.ROOF_SLATE || t === T.ROOF_LEAF) c = [160, 72, 56];
      else {
        const code = world.provAt(x, y);
        const hex = PROV_MAP_COLORS[code] || '#4a8a4a';
        c = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
        if (t === T.FOREST || t === T.JUNGLE) c = c.map((v) => v * 0.72 | 0);
      }
      const i = (y * world.W + x) * 4;
      img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = '#ffb020';
  for (const lm of world.landmarks) ctx.fillRect(lm.x, lm.y, 3, 3);
}

export function openMapModal(world, player) {
  showModal(`
    <h2>🗺️ Map of Luckland</h2>
    <div class="subtitle">Six provinces, one tide, endless luck</div>
    <canvas id="worldmap-canvas" width="${world.W}" height="${world.H}"></canvas>
    <div class="map-legend">
      ${Object.entries(PROV_MAP_COLORS).map(([c, col]) =>
        `<span><span style="color:${col}">■</span> ${escapeHtml(PROVINCES[c].name)}</span>`).join('')}
    </div>
    <div class="map-legend"><span>⭐ you</span><span>🔶 landmark</span>${tideSightActive() ? '<span>💠 tide secret</span>' : ''}${state.tmap?.hoard ? '<span style="color:var(--gold-ink);font-weight:bold">✖ sunken hoard</span>' : ''}</div>
  `);
  const cv = $('worldmap-canvas');
  const ctx = cv.getContext('2d');
  paintWorldMap(ctx, world);
  // tide secrets while Tide Sight is active
  if (tideSightActive()) {
    ctx.fillStyle = '#5eeaff';
    for (const z of world.zones) if (z.tidal) ctx.fillRect(z.x - 1, z.y - 1, 4, 4);
  }
  // the mapped Sunken Hoard — X marks the spot
  const hoard = state.tmap?.hoard;
  if (hoard) {
    ctx.strokeStyle = '#ffd75e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hoard.x - 3, hoard.y - 3); ctx.lineTo(hoard.x + 4, hoard.y + 4);
    ctx.moveTo(hoard.x + 4, hoard.y - 3); ctx.lineTo(hoard.x - 3, hoard.y + 4);
    ctx.stroke();
  }
  // player
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(player.tx - 1, player.ty - 1, 4, 4);
  ctx.fillStyle = '#ff3050';
  ctx.fillRect(player.tx, player.ty, 2, 2);
}
