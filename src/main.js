/* ============================================================
   Luckland — main loop
   ------------------------------------------------------------
   Boot, input (keyboard + touch), camera, canvas rendering,
   tide simulation, entity updates and world interactions.
   ============================================================ */

import { CONFIG } from './config.js';
import { hash2, roll } from './rng.js';
import { generateWorld, T, TILE, isSolidTile, PROVINCES } from './world.js';
import { buildTileAtlas, makeCharSprite, getBuildingSprite, CELL, CHAR_W, CHAR_H } from './sprites.js';
import { state, loadGame, onBalanceChange } from './state.js';
import * as UI from './ui.js';
import { openGame, openHub } from './games.js';
import { concealers, seedConcealers, updateConcealerSpawns, openConcealer } from './concealers.js';
import { createNpcs, updateNpc, talkTo, createBots, updateBot, randomBotWinToast, createCitizens, updateCitizen } from './npcs.js';

/* ---------------- boot ---------------- */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const world = generateWorld();
const atlas = buildTileAtlas(CONFIG.WORLD_SEED);

const player = {
  x: world.start.x * TILE + 8,
  y: world.start.y * TILE + 8,
  dir: 0, frame: 0, animT: 0,
  speed: 92,
  sprite: makeCharSprite({ skin: '#f0c8a0', body: '#e0a92e', legs: '#40354a', hat: 'cap', hatColor: '#c04848' }),
};

const hadSave = loadGame();
if (hadSave && state.px) { player.x = state.px; player.y = state.py; }

const npcs = createNpcs(world);
const bots = createBots(world);
const citizens = createCitizens(world);
seedConcealers(world);

const floaters = []; // {x, y, text, color, t}
function addFloater(x, y, text, color = '#ffd75e') {
  floaters.push({ x, y, text, color, t: 0 });
}

onBalanceChange((bal, delta) => {
  UI.renderBalance();
  if (Math.abs(delta) >= 1) {
    addFloater(player.x, player.y - 14, `${delta > 0 ? '+' : ''}${Math.round(delta)}`, delta > 0 ? '#ffd75e' : '#ff8a7a');
  }
});

/* ---------------- input ---------------- */
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.key.toLowerCase());
  if ((e.key === 'e' || e.key === 'Enter' || e.key === ' ') && !UI.isModalOpen()) {
    doInteract();
    e.preventDefault();
  }
  if (e.key === 'Escape' && UI.isModalOpen()) UI.closeModal();
  if (e.key.toLowerCase() === 'm' && !UI.isModalOpen()) UI.openMapModal(world, playerTilePos());
  if (e.key.toLowerCase() === 'p' && !UI.isModalOpen()) UI.openStatsModal();
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());

UI.setupJoystick();
UI.els.actBtn.addEventListener('click', () => { if (!UI.isModalOpen()) doInteract(); });
UI.els.statsBtn.addEventListener('click', () => { if (!UI.isModalOpen()) UI.openStatsModal(); });
UI.els.mapBtn.addEventListener('click', () => { if (!UI.isModalOpen()) UI.openMapModal(world, playerTilePos()); });

function playerTilePos() {
  return { tx: Math.floor(player.x / TILE), ty: Math.floor(player.y / TILE) };
}

/* ---------------- canvas sizing ---------------- */
let zoom = 3, vw = 0, vh = 0;
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  vw = window.innerWidth; vh = window.innerHeight;
  canvas.width = Math.round(vw * dpr);
  canvas.height = Math.round(vh * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  zoom = Math.max(2, Math.min(4, Math.round(Math.min(vw, vh) / 170)));
}
window.addEventListener('resize', resize);
resize();

/* ---------------- tide ---------------- */
let tideLevel = 0.5, tideRising = true;
function updateTide() {
  const t = (Date.now() / 1000) % CONFIG.TIDE_CYCLE_SECONDS;
  const phase = (t / CONFIG.TIDE_CYCLE_SECONDS) * Math.PI * 2;
  tideLevel = 0.5 + 0.5 * Math.sin(phase);
  tideRising = Math.cos(phase) > 0;
}

/* ---------------- movement & collision ---------------- */
function solidAt(px, py) {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  if (!world.inB(tx, ty)) return true;
  return isSolidTile(world.tiles[ty * world.W + tx], tideLevel);
}

let pendingDoor = null; // set when the player bumps a (solid) door tile
let doorCooldown = 0;

function noteDoorBump(...points) {
  for (const [bx, by] of points) {
    const tx = Math.floor(bx / TILE), ty = Math.floor(by / TILE);
    if (world.inB(tx, ty) && world.tiles[ty * world.W + tx] === T.DOOR) {
      pendingDoor = { tx, ty };
      return;
    }
  }
}

function tryMove(dx, dy, dt) {
  // wading through shallows is slow going
  const here = world.tiles[Math.floor(player.y / TILE) * world.W + Math.floor(player.x / TILE)];
  const speedMul = here === T.SHALLOW ? 0.45 : 1;
  const step = player.speed * speedMul * dt;
  const nx = player.x + dx * step, ny = player.y + dy * step;
  const r = 5; // collision radius
  if (dx) {
    const p1 = [nx + Math.sign(dx) * r, player.y - r + 2], p2 = [nx + Math.sign(dx) * r, player.y + r];
    if (!solidAt(...p1) && !solidAt(...p2)) player.x = nx;
    else noteDoorBump(p1, p2);
  }
  if (dy) {
    const p1 = [player.x - r + 2, ny + Math.sign(dy) * r], p2 = [player.x + r, ny + Math.sign(dy) * r];
    if (!solidAt(...p1) && !solidAt(...p2)) player.y = ny;
    else noteDoorBump(p1, p2);
  }
  player.x = Math.max(8, Math.min(world.W * TILE - 8, player.x));
  player.y = Math.max(8, Math.min(world.H * TILE - 8, player.y));
}

/* If the rising tide floods the tile under your feet, wash ashore. */
function resolveTideStranding() {
  if (!solidAt(player.x, player.y)) return;
  const ptx = Math.floor(player.x / TILE), pty = Math.floor(player.y / TILE);
  for (let radius = 1; radius < 10; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tx = ptx + dx, ty = pty + dy;
        if (!world.inB(tx, ty)) continue;
        if (!isSolidTile(world.tiles[ty * world.W + tx], tideLevel)) {
          player.x = tx * TILE + 8; player.y = ty * TILE + 8;
          UI.toast('🌊 The tide sweeps you ashore!');
          return;
        }
      }
    }
  }
}

/* ---------------- interactions ---------------- */
let currentTarget = null; // {kind, obj, label, ico}

function findTarget() {
  const px = player.x, py = player.y;
  const near = (x, y, r) => Math.hypot(x - px, y - py) < r;

  // landmark doors
  for (const lm of world.landmarks) {
    if (near(lm.doorX * TILE + 8, lm.doorY * TILE + 8, 26)) {
      return { kind: 'landmark', obj: lm, label: `Enter ${lm.name}`, ico: lm.ico };
    }
  }
  // npcs
  for (const n of npcs) {
    if (near(n.x, n.y, 24)) {
      return { kind: 'npc', obj: n, label: `Talk to ${n.def.name}`, ico: n.def.portrait };
    }
  }
  // concealers
  for (const c of concealers) {
    if (near(c.x * TILE + 8, c.y * TILE + 8, 22)) {
      return { kind: 'concealer', obj: c, label: `${c.type.name} · ${c.type.price} 🪙`, ico: c.type.ico };
    }
  }
  // street events
  for (const ev of world.events) {
    if (near(ev.x * TILE + 8, ev.y * TILE + 8, 24)) {
      return { kind: 'event', obj: ev, label: ev.label, ico: ev.ico };
    }
  }
  // ferry docks
  for (const f of world.ferries) {
    for (const [dock, other] of [[f.a, f.b], [f.b, f.a]]) {
      if (near(dock.x * TILE + 8, dock.y * TILE + 8, 26)) {
        return { kind: 'ferry', obj: { f, dock, other }, label: `${f.name} → ${other.label}`, ico: '⛴️' };
      }
    }
  }
  return null;
}

function doInteract() {
  if (!currentTarget) return;
  const prov = currentProv;
  const t = currentTarget;
  if (t.kind === 'landmark') openHub(t.obj, prov);
  else if (t.kind === 'npc') talkTo(t.obj, prov);
  else if (t.kind === 'concealer') openConcealer(t.obj, prov, () => {});
  else if (t.kind === 'event') openGame(t.obj.game, prov);
  else if (t.kind === 'ferry') offerFerry(t.obj);
}

function offerFerry({ f, other }) {
  const fare = CONFIG.FERRY_PRICE;
  UI.showModal(`
    <h2>⛴️ ${UI.escapeHtml(f.name)}</h2>
    <div class="subtitle">Crossing the Paradise Sea since forever</div>
    <div class="dialogue-box">
      <div class="dialogue-portrait">⛴️</div>
      <div class="dialogue-text">
        <div class="dialogue-name">FERRYMAN</div>
        Next sailing to <b>${UI.escapeHtml(other.label)}</b> leaves the moment you step aboard.
        Fare's ${fare} 🪙 — the sea takes her cut like everyone else.
      </div>
    </div>
    <div class="btn-row">
      <button class="btn" id="ferry-go">⛴️ Sail · ${fare} 🪙</button>
      <button class="btn secondary" id="ferry-stay">Stay ashore</button>
    </div>
  `);
  document.getElementById('ferry-stay').addEventListener('click', UI.closeModal);
  document.getElementById('ferry-go').addEventListener('click', () => {
    if (state.balance < fare) { UI.toast('Not enough coins for the fare!'); return; }
    state.balance -= fare;
    UI.renderBalance();
    player.x = other.x * TILE + 8;
    player.y = other.y * TILE + 8;
    UI.closeModal();
    UI.toast(`⛴️ You sail across the Paradise Sea to ${UI.escapeHtml(other.label)}.`);
  });
}

// tap-to-interact on mobile: tapping the canvas while a target is highlighted
canvas.addEventListener('pointerdown', () => {
  if (!UI.isModalOpen() && currentTarget) doInteract();
});

/* ---------------- bot world-win events ---------------- */
function emitWorldWin(bot, what, amount) {
  addFloater(bot.x, bot.y - 16, `+${amount}`, '#b48cff');
  const dist = Math.hypot(bot.x - player.x, bot.y - player.y);
  if (dist < 30 * TILE) {
    UI.toast(`<span class="who">${UI.escapeHtml(bot.name)}</span> ${UI.escapeHtml(what)} nearby! <span class="amt">+${amount}</span> 🪙`);
  }
}

let botToastTimer = 4;
let currentProv = 'TF'; // refreshed each frame; city membership overrides border tiles

/* ---------------- welcome ---------------- */
if (!hadSave) {
  UI.showModal(`
    <h2>🍀 Welcome to Luckland</h2>
    <div class="subtitle">Six provinces. One tide. Endless games of luck.</div>
    <div class="dialogue-box">
      <div class="dialogue-portrait">🪽</div>
      <div class="dialogue-text">
        <div class="dialogue-name">HERMES JR.</div>
        Fresh off the boat! Here's the deal: chests and games of chance are hiding <i>everywhere</i>
        — grand halls, back alleys, and shores the tide only sometimes lets you reach.
        You start with <b>${CONFIG.STARTING_BALANCE.toLocaleString('en-US')} 🪙</b>.
        Walk with <b>WASD / arrows</b> (or the joystick), press <b>E</b> or ✨ to interact,
        <b>M</b> for the map. Watch the tide gauge — and watch the other punters.
        They're after the same chests you are!
      </div>
    </div>
    <div class="btn-row"><button class="btn" id="welcome-go">Start exploring</button></div>
  `, { closable: false });
  document.getElementById('welcome-go').addEventListener('click', UI.closeModal);
}
UI.renderBalance();

/* ---------------- render helpers ---------------- */
function drawTile(t, tx, ty, sx, sy, animFrame) {
  let row = t, col = hash2(tx, ty, 7) * 4 | 0;
  if (t === T.DEEP || t === T.WATER || t === T.SHALLOW) col = animFrame;
  else if (t === T.TIDAL) {
    if (tideLevel > 0.62) { row = T.TIDAL; col = animFrame; }
    else if (tideLevel > 0.38) { row = 23; }
    else { row = T.SAND; }
  }
  ctx.drawImage(atlas, col * CELL, row * CELL, CELL, CELL, sx, sy, zoom * TILE, zoom * TILE);
}

function drawSprite(e, camX, camY) {
  const sx = Math.round((e.x - CHAR_W / 2 - camX) * zoom);
  const sy = Math.round((e.y - CHAR_H + 4 - camY) * zoom);
  ctx.drawImage(e.sprite, e.dir * CHAR_W, e.frame * CHAR_H, CHAR_W, CHAR_H, sx, sy, CHAR_W * zoom, CHAR_H * zoom);
  return { sx, sy };
}

function drawEmoji(txt, wx, wy, camX, camY, sizePx, bob = 0) {
  ctx.font = `${sizePx * zoom}px serif`;
  ctx.textAlign = 'center';
  ctx.fillText(txt, (wx - camX) * zoom, (wy - camY + bob) * zoom);
}

/* ---------------- main loop ---------------- */
let last = performance.now();
let waterFrame = 0, waterT = 0;

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  updateTide();
  UI.renderTide(tideLevel, tideRising);
  UI.renderLuckChip();

  /* --- player movement --- */
  if (!UI.isModalOpen()) {
    let dx = 0, dy = 0;
    if (keys.has('w') || keys.has('arrowup')) dy -= 1;
    if (keys.has('s') || keys.has('arrowdown')) dy += 1;
    if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
    if (keys.has('d') || keys.has('arrowright')) dx += 1;
    const joy = UI.getJoyVector();
    if (joy.active) { dx = joy.dx; dy = joy.dy; }
    const mag = Math.hypot(dx, dy);
    if (mag > 0.15) {
      dx /= Math.max(1, mag); dy /= Math.max(1, mag);
      const ox = player.x, oy = player.y;
      tryMove(dx, dy, dt);
      state.stats.distance += Math.hypot(player.x - ox, player.y - oy) / TILE; // ~1m per tile
      if (Math.abs(dx) > Math.abs(dy)) player.dir = dx < 0 ? 1 : 2;
      else player.dir = dy < 0 ? 3 : 0;
      player.animT += dt;
      if (player.animT > 0.14) { player.animT = 0; player.frame = 1 - player.frame; }
    } else player.frame = 0;
  }
  resolveTideStranding();
  state.px = player.x; state.py = player.y;

  /* bumping into a door swings it open (with a cooldown so a closed
     modal doesn't immediately reopen while still pressing forward) */
  doorCooldown = Math.max(0, doorCooldown - dt);
  if (pendingDoor && !UI.isModalOpen() && doorCooldown === 0) {
    const lm = world.landmarks.find((l) => l.doorX === pendingDoor.tx && l.doorY === pendingDoor.ty);
    if (lm) {
      doorCooldown = 1.2;
      openHub(lm, currentProv);
    }
  }
  pendingDoor = null;

  /* --- entities --- */
  for (const n of npcs) updateNpc(n, world, tideLevel, dt);
  for (const b of bots) updateBot(b, world, tideLevel, dt, concealers, emitWorldWin);
  for (const c of citizens) updateCitizen(c, world, tideLevel, dt);
  updateConcealerSpawns(world, dt);

  botToastTimer -= dt;
  if (botToastTimer <= 0) {
    botToastTimer = CONFIG.BOT_WIN_TOAST_MIN_S + roll() * (CONFIG.BOT_WIN_TOAST_MAX_S - CONFIG.BOT_WIN_TOAST_MIN_S);
    randomBotWinToast(bots, world);
  }

  /* --- interaction target --- */
  if (!UI.isModalOpen()) {
    currentTarget = findTarget();
    UI.setHint(currentTarget ? `${currentTarget.ico} ${currentTarget.label}` : null);
    UI.setActButton(!!currentTarget, currentTarget?.ico || '✨');
  } else {
    UI.setHint(null);
    UI.setActButton(false);
  }

  /* --- location HUD: province / city or area / exact spot --- */
  const { tx: ptx, ty: pty } = playerTilePos();
  let locArea = null, locSpot = null, cityProv = null;
  for (const c of world.cities) {
    if (Math.hypot(ptx - c.x, pty - c.y) <= c.r + 3) { locArea = c.name; cityProv = c.prov; break; }
  }
  for (const lm of world.landmarks) {
    if (Math.hypot(ptx - lm.doorX, pty - lm.doorY) <= 8) { locSpot = lm.name; break; }
  }
  for (const r of world.regions) {
    if ((r.tier === 2 && locArea) || (r.tier === 3 && locSpot)) continue;
    if (Math.hypot(ptx - r.x, pty - r.y) <= r.r) {
      if (r.tier === 2) locArea = r.name;
      else locSpot = r.name;
    }
    if (locArea && locSpot) break;
  }
  // being inside a city overrides the raw border tile — Temple City is
  // Elephantium even where the province line wobbles underneath it
  currentProv = cityProv || world.provAt(ptx, pty);
  UI.renderLocation(currentProv, locArea, locSpot);

  /* --- render --- */
  waterT += dt;
  if (waterT > 0.45) { waterT = 0; waterFrame = (waterFrame + 1) % 4; }

  const viewW = vw / zoom, viewH = vh / zoom;
  let camX = player.x - viewW / 2, camY = player.y - viewH / 2;
  camX = Math.max(0, Math.min(world.W * TILE - viewW, camX));
  camY = Math.max(0, Math.min(world.H * TILE - viewH, camY));

  ctx.fillStyle = '#0c1e33';
  ctx.fillRect(0, 0, vw, vh);

  const x0 = Math.max(0, Math.floor(camX / TILE)), y0 = Math.max(0, Math.floor(camY / TILE));
  const x1 = Math.min(world.W - 1, Math.ceil((camX + viewW) / TILE));
  const y1 = Math.min(world.H - 1, Math.ceil((camY + viewH) / TILE));
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const t = world.tiles[ty * world.W + tx];
      drawTile(t, tx, ty, Math.round((tx * TILE - camX) * zoom), Math.round((ty * TILE - camY) * zoom), waterFrame % 2 === 0 ? 0 : 1);
    }
  }

  /* buildings — footprint-exact sprites drawn with the terrain */
  for (const b of world.buildings) {
    if (b.x > x1 + 1 || b.x + b.w < x0 - 1 || b.y > y1 + 1 || b.y + b.h < y0 - 1) continue;
    const spr = getBuildingSprite(b);
    ctx.drawImage(spr,
      Math.round((b.x * TILE - camX) * zoom),
      Math.round((b.y * TILE - camY) * zoom),
      spr.width * zoom, spr.height * zoom);
  }

  ctx.textBaseline = 'alphabetic';

  /* landmark signs floating over the entrance */
  for (const lm of world.landmarks) {
    if (lm.doorX < x0 - 2 || lm.doorX > x1 + 2 || lm.doorY < y0 - 5 || lm.doorY > y1 + 2) continue;
    drawEmoji(lm.ico, lm.doorX * TILE + 8, lm.y * TILE - 2, camX, camY, 12);
  }

  /* ferry docks */
  for (const f of world.ferries) {
    for (const dock of [f.a, f.b]) {
      if (dock.x < x0 - 2 || dock.x > x1 + 2 || dock.y < y0 - 2 || dock.y > y1 + 2) continue;
      drawEmoji('⛴️', dock.x * TILE + 8, dock.y * TILE + 4, camX, camY, 12, Math.sin(now / 500) * 1.5);
    }
  }

  /* street events */
  const bobT = Math.sin(now / 300) * 2;
  for (const ev of world.events) {
    if (ev.x < x0 - 1 || ev.x > x1 + 1 || ev.y < y0 - 1 || ev.y > y1 + 1) continue;
    drawEmoji(ev.ico, ev.x * TILE + 8, ev.y * TILE + 10, camX, camY, 11, bobT * 0.4);
  }

  /* concealers with sparkle */
  for (const c of concealers) {
    if (c.x < x0 - 1 || c.x > x1 + 1 || c.y < y0 - 1 || c.y > y1 + 1) continue;
    drawEmoji(c.type.ico, c.x * TILE + 8, c.y * TILE + 12, camX, camY, 11, bobT * 0.5);
    if (hash2(c.x, (now / 400) | 0, 3) > 0.5) {
      drawEmoji('✨', c.x * TILE + 13, c.y * TILE + 2, camX, camY, 6, bobT);
    }
  }

  /* wading ripple under the player */
  {
    const pt = world.tiles[pty * world.W + ptx];
    if (pt === T.SHALLOW) {
      ctx.fillStyle = 'rgba(200, 236, 246, 0.45)';
      const rx = (player.x - camX) * zoom, ry = (player.y + 2 - camY) * zoom;
      ctx.beginPath();
      ctx.ellipse(rx, ry, (7 + Math.sin(now / 260)) * zoom / 2, 2.4 * zoom / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* entities, y-sorted (buildings live in the static pass — their art
     never leaves their solid footprint, so nothing can hide behind them) */
  const drawList = [player, ...npcs, ...bots, ...citizens].sort((a, b) => a.y - b.y);
  for (const e of drawList) {
    const { sx, sy } = drawSprite(e, camX, camY);
    if (e !== player && e.def) {
      // NPC badge
      ctx.font = `${8 * zoom}px serif`;
      ctx.textAlign = 'center';
      ctx.fillText(e.def.portrait, sx + (CHAR_W / 2) * zoom, sy - 3 * zoom);
    } else if (e !== player && e.name) {
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      if (d < 10 * TILE) {
        ctx.font = `bold ${7 * zoom}px ${'"Courier New", monospace'}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(e.name, sx + (CHAR_W / 2) * zoom, sy - 2 * zoom);
      }
    }
    if (e.celebrateT > 0) {
      drawEmoji('🎉', e.x, e.y - 22, camX, camY, 10, Math.sin(now / 90) * 2);
    }
  }

  /* floaters */
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.t += dt;
    if (f.t > 1.4) { floaters.splice(i, 1); continue; }
    ctx.globalAlpha = Math.max(0, 1 - f.t / 1.4);
    ctx.font = `bold ${9 * zoom}px "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    const fx = (f.x - camX) * zoom, fy = (f.y - f.t * 22 - camY) * zoom;
    ctx.strokeText(f.text, fx, fy);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, fx, fy);
    ctx.globalAlpha = 1;
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* Debug/testing handle (also handy for tinkering in devtools). */
window.LUCKLAND = { world, player, state, concealers, npcs, bots, citizens };

/* ---------------- PWA service worker ---------------- */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
