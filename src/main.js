/* ============================================================
   Luckland — main loop
   ------------------------------------------------------------
   Boot, input (keyboard + touch), camera, canvas rendering,
   tide simulation, entity updates and world interactions.
   ============================================================ */

import { CONFIG } from './config.js';
import { hash2, roll } from './rng.js';
import { generateWorld, T, TILE, isSolidTile, PROVINCES } from './world.js';
import { buildTileAtlas, makeCharSprite, getBuildingSprite, getEventSprite, CELL, CHAR_W, CHAR_H } from './sprites.js';
import { state, spend, loadGame, onBalanceChange } from './state.js';
import * as UI from './ui.js';
import { openGame, openHub, GAME_DEFS, setWorld, nightNow, openCrossingDen } from './games.js';
import { concealers, seedConcealers, updateConcealerSpawns, openConcealer, openHoard } from './concealers.js';
import { createNpcs, updateNpc, talkTo, createBots, updateBot, randomBotWinToast, createCitizens, updateCitizen } from './npcs.js';
import { maybeEncounter, tickEncounterCooldown, getActiveEncounter, maybeTraderOffer, openLucklipedia, openEncounter, encounterReady, armEncounterCooldown } from './lucklians.js';
import { getLucklianSprite, getStationSprite, getDecorSprite, makeFerrySprite } from './sprites.js';
import { getInterior, updatePatrons } from './interiors.js';
import { openLiveBet, stationIsLive, updateLive, drawLiveOverlay, openLanternFestival, updateLanternRace, drawLanternRace, getLanternRace, migrationTick, migrationNear, drawMigration } from './liveevents.js';
import { tickHunt } from './hunts.js';

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
setWorld(world);   // map races and loft lookups read the overworld

/* world-event games that play out IN the world, not in a pop-up */
function launchGame(gid, prov, ev) {
  if (gid === 'lanternfest') openLanternFestival(world, prov, ev);
  else openGame(gid, prov);
}

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
  if (e.key.toLowerCase() === 'l' && !UI.isModalOpen()) openLucklipedia();
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());

UI.setupJoystick();
UI.els.actBtn.addEventListener('click', () => { if (!UI.isModalOpen()) doInteract(); });
UI.els.statsBtn.addEventListener('click', () => { if (!UI.isModalOpen()) UI.openStatsModal(); });
UI.els.mapBtn.addEventListener('click', () => { if (!UI.isModalOpen()) UI.openMapModal(world, playerTilePos()); });
document.getElementById('btn-dex').addEventListener('click', () => { if (!UI.isModalOpen()) openLucklipedia(); });

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
  state.tide = tideLevel;   // games read this (gold panning's gravel, etc.)
}

/* ---------------- interior scene ----------------
   scene = null on the overworld; else { lm, it } while inside a
   landmark hall. Entering/leaving does a quick fade to black. */
let scene = null;
let switching = false;
const fadeEl = document.getElementById('fade');

function fadeSwap(swap) {
  if (switching) return;
  switching = true;
  fadeEl.classList.add('on');
  setTimeout(() => {
    swap();
    setTimeout(() => { fadeEl.classList.remove('on'); switching = false; }, 60);
  }, 280);
}

function enterLandmark(lm) {
  if (scene || switching) return;
  doorCooldown = 1.2;
  fadeSwap(() => {
    const it = getInterior(lm);
    scene = { lm, it };
    player.x = it.spawn.x; player.y = it.spawn.y;
    player.dir = 3; player.frame = 0;
    UI.toast(`${lm.ico} Welcome to <b>${UI.escapeHtml(lm.name)}</b>`);
  });
}

function exitInterior() {
  if (!scene || switching) return;
  const lm = scene.lm;
  fadeSwap(() => {
    scene = null;
    player.x = lm.doorX * TILE + 8;
    player.y = (lm.doorY + 2) * TILE + 8;
    player.dir = 0; player.frame = 0;
    doorCooldown = 1.2;
  });
}

/* ---------------- movement & collision ---------------- */
function solidAt(px, py) {
  const m = scene ? scene.it : world;
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  if (tx < 0 || ty < 0 || tx >= m.W || ty >= m.H) return true;
  return isSolidTile(m.tiles[ty * m.W + tx], scene ? 0 : tideLevel);
}

let pendingDoor = null;      // bumped a landmark door
let pendingEvent = null;     // bumped an attraction prop
let pendingStation = null;   // bumped a game station inside a hall
let doorCooldown = 0;

function noteBump(...points) {
  for (const [bx, by] of points) {
    const tx = Math.floor(bx / TILE), ty = Math.floor(by / TILE);
    if (scene) {
      const st = scene.it.stationTiles.get(scene.it.idx(tx, ty));
      if (st) { pendingStation = st; return; }
      continue;
    }
    if (!world.inB(tx, ty)) continue;
    const i = ty * world.W + tx;
    if (world.tiles[i] === T.DOOR) { pendingDoor = { tx, ty }; return; }
    const ev = world.eventTiles.get(i);
    if (ev) { pendingEvent = ev; return; }
  }
}

function tryMove(dx, dy, dt) {
  // wading through shallows is slow going
  const m = scene ? scene.it : world;
  const here = m.tiles[Math.floor(player.y / TILE) * m.W + Math.floor(player.x / TILE)];
  const speedMul = here === T.SHALLOW ? 0.45 : 1;
  const step = player.speed * speedMul * dt;
  const nx = player.x + dx * step, ny = player.y + dy * step;
  const r = 5; // collision radius
  if (dx) {
    const p1 = [nx + Math.sign(dx) * r, player.y - r + 2], p2 = [nx + Math.sign(dx) * r, player.y + r];
    if (!solidAt(...p1) && !solidAt(...p2)) player.x = nx;
    else noteBump(p1, p2);
  }
  if (dy) {
    const p1 = [player.x - r + 2, ny + Math.sign(dy) * r], p2 = [player.x + r, ny + Math.sign(dy) * r];
    if (!solidAt(...p1) && !solidAt(...p2)) player.y = ny;
    else noteBump(p1, p2);
  }
  const mm = scene ? scene.it : world;
  player.x = Math.max(8, Math.min(mm.W * TILE - 8, player.x));
  player.y = Math.max(8, Math.min(mm.H * TILE - 8, player.y));
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
  // the mapped Sunken Hoard, if the tide has bared it
  const hoard = state.tmap?.hoard;
  if (hoard && near(hoard.x * TILE + 8, hoard.y * TILE + 8, 24)) {
    return { kind: 'hoard', obj: hoard, label: 'Sunken Hoard · 500 🪙', ico: '💰' };
  }
  // roadside attractions (solid props — reach scales with their size)
  for (const ev of world.events) {
    const cx = (ev.x + ev.w / 2) * TILE, cy = (ev.y + ev.h / 2) * TILE;
    if (near(cx, cy, Math.max(ev.w, ev.h) * TILE * 0.5 + 28)) {
      return { kind: 'event', obj: ev, label: ev.label, ico: GAME_DEFS[ev.game]?.ico || '🎲' };
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
  if (t.kind === 'landmark') enterLandmark(t.obj);
  else if (t.kind === 'station') {
    if (scene && stationIsLive(scene.it, t.obj)) openLiveBet(scene.it, t.obj, prov);
    else openGame(t.obj.game, prov);
  } else if (t.kind === 'exit') {
    if (scene?.it.live) UI.toast('🏟️ The event is still running — see it out!');
    else exitInterior();
  }
  else if (t.kind === 'npc') talkTo(t.obj, prov);
  else if (t.kind === 'concealer') openConcealer(t.obj, prov, () => {});
  else if (t.kind === 'hoard') openHoard(prov);
  else if (t.kind === 'event') launchGame(t.obj.game, prov, t.obj);
  else if (t.kind === 'ferry') offerFerry(t.obj);
}

/* interaction targets while inside a hall: game stations + the way out */
function findInteriorTarget() {
  const it = scene.it;
  for (const st of it.stations) {
    const cx = (st.x + st.w / 2) * TILE, cy = (st.y + st.h / 2) * TILE;
    if (Math.hypot(cx - player.x, cy - player.y) < Math.max(st.w, st.h) * TILE * 0.5 + 24) {
      return { kind: 'station', obj: st, label: `Play ${st.label}`, ico: st.ico };
    }
  }
  if (Math.abs(player.x - it.doorX * TILE - 8) < 26 && player.y > (it.H - 3.2) * TILE) {
    return { kind: 'exit', obj: null, label: 'Step outside', ico: '🚪' };
  }
  return null;
}

/* ---------------- the Paradise Ferry crossing ----------------
   The boat really sails: for the length of the crossing the player
   rides her deck across the strait while the den plays out below. */
let crossing = null;
let ferrySprite = null;

function startCrossing(dock, other, fare) {
  if (!ferrySprite) ferrySprite = makeFerrySprite();
  const from = { x: dock.x * TILE + 8, y: dock.y * TILE + 8 };
  const to = { x: other.x * TILE + 8, y: other.y * TILE + 8 };
  crossing = { from, to, t: 0, dur: CONFIG.CROSSING_S, dir: to.x < from.x ? 1 : 0, frame: 0, animT: 0, other };
  player.x = from.x; player.y = from.y;
  openCrossingDen(world.provAt(other.x, other.y), other.label, fare, CONFIG.CROSSING_S);
}

function updateCrossing(dt) {
  if (!crossing) return;
  crossing.t += dt;
  const k = Math.min(1, crossing.t / crossing.dur);
  // ease away from the dock and glide into the far one
  const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  player.x = crossing.from.x + (crossing.to.x - crossing.from.x) * e;
  player.y = crossing.from.y + (crossing.to.y - crossing.from.y) * e + Math.sin(crossing.t * 2.2) * 1.5;
  crossing.animT += dt;
  if (crossing.animT > 0.42) { crossing.animT = 0; crossing.frame = 1 - crossing.frame; }
  if (k >= 1) {
    const { other } = crossing;
    crossing = null;
    player.x = other.x * TILE + 8;
    player.y = other.y * TILE + 8;
    if (UI.isModalOpen()) UI.closeModal();
    UI.toast(`⛴️ The Paradise Ferry ties up at ${UI.escapeHtml(other.label)}.`);
  }
}

function offerFerry({ f, other, dock }) {
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
    if (!spend(fare)) { UI.toast('Not enough coins for the fare!'); return; }
    state.stats.gamesPlayed++;
    UI.renderBalance();
    UI.closeModal();
    // she casts off — and the fare rides on the captain's bones below decks
    startCrossing(dock, other, fare);
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
let traderTimer = 90;   // wandering Lucklian trader offers
let lastStepTile = { tx: -1, ty: -1 };
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
  // under building/prop sprites, draw the terrain that was there before
  // the stamp — sprites' transparent parts blend into their surroundings
  if (t === T.FOUNDATION || t === T.DOOR) {
    const g = world.ground[ty * world.W + tx];
    if (g !== 255) t = g;
  }
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
  const cw = e.sprite.cellW || CHAR_W, ch = e.sprite.cellH || CHAR_H;
  let sx = Math.round((e.x - cw / 2 - camX) * zoom);
  let sy = Math.round((e.y - ch + 4 - camY) * zoom);
  if (e.rumbleT > 0) {  // a heavy impact shudders the whole hull
    sx += Math.round((Math.random() - 0.5) * 4 * zoom * Math.min(1, e.rumbleT * 3));
    sy += Math.round((Math.random() - 0.5) * 3 * zoom * Math.min(1, e.rumbleT * 3));
  }
  if (e.sink > 0) {  // a holed ship settles into the water
    ctx.globalAlpha = Math.max(0, 1 - e.sink / 1.5);
    sy += Math.round(e.sink * 6 * zoom);
  }
  ctx.drawImage(e.sprite, (e.dir || 0) * cw, (e.frame || 0) * ch, cw, ch, sx, sy, cw * zoom, ch * zoom);
  if (e.hitT > 0) {   // white hit-flash
    ctx.globalAlpha = Math.min(0.6, e.hitT * 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(sx + zoom * 2, sy + zoom * 2, (cw - 4) * zoom, (ch - 6) * zoom);
    ctx.globalAlpha = e.sink > 0 ? Math.max(0, 1 - e.sink / 1.5) : 1;
  }
  ctx.globalAlpha = 1;
  return { sx, sy };
}

function drawEmoji(txt, wx, wy, camX, camY, sizePx, bob = 0) {
  ctx.font = `${sizePx * zoom}px serif`;
  ctx.textAlign = 'center';
  ctx.fillText(txt, (wx - camX) * zoom, (wy - camY + bob) * zoom);
}

/* ---------------- interior scene tick ---------------- */
function interiorTick(dt, now) {
  const it = scene.it;
  const lm = scene.lm;

  // stepping onto the doorway mat leads back outside (never mid-event)
  const ptx = Math.floor(player.x / TILE), pty = Math.floor(player.y / TILE);
  if (!switching && !it.live && pty >= it.H - 2 && it.exitXs.includes(ptx) && player.y > (it.H - 1.6) * TILE) {
    exitInterior();
  }

  updatePatrons(it, dt);
  updateLive(it, dt, now, player);

  /* interaction target */
  if (!UI.isModalOpen()) {
    currentTarget = findInteriorTarget();
    UI.setHint(currentTarget ? `${currentTarget.ico} ${currentTarget.label}` : null);
    UI.setActButton(!!currentTarget, currentTarget?.ico || '✨');
  } else {
    UI.setHint(null);
    UI.setActButton(false);
  }

  currentProv = lm.prov;
  UI.renderLocation(lm.prov, lm.name, null);

  /* ---- render: the hall floats in darkness, Pokémon style ---- */
  ctx.fillStyle = '#07070d';
  ctx.fillRect(0, 0, vw, vh);

  const viewW = vw / zoom, viewH = vh / zoom;
  const roomW = it.W * TILE, roomH = it.H * TILE;
  // camera: follows the player — but locks onto the arena while a wager rides
  const focX = it.live ? it.live.focus.x : player.x;
  const focY = it.live ? it.live.focus.y : player.y;
  let camX, camY;
  if (roomW <= viewW) camX = -(viewW - roomW) / 2;
  else camX = Math.max(0, Math.min(roomW - viewW, focX - viewW / 2));
  if (roomH <= viewH) camY = -(viewH - roomH) / 2;
  else camY = Math.max(0, Math.min(roomH - viewH, focY - viewH / 2));

  for (let ty = 0; ty < it.H; ty++) {
    for (let tx = 0; tx < it.W; tx++) {
      let t = it.tiles[ty * it.W + tx];
      if (t === T.FOUNDATION) t = it.style.floor;   // floor shows beneath the furniture
      const col = Math.floor(hash2(tx, ty, 7) * 4);
      ctx.drawImage(atlas, col * CELL, t * CELL, CELL, CELL,
        Math.round((tx * TILE - camX) * zoom), Math.round((ty * TILE - camY) * zoom),
        zoom * TILE, zoom * TILE);
    }
  }

  /* rugs / pits / the welcome mat — bordered so they read as fabric */
  for (const r of it.floorRects) {
    const rx = Math.round((r.x * TILE - camX) * zoom), ry = Math.round((r.y * TILE - camY) * zoom);
    const rw = r.w * TILE * zoom, rh = r.h * TILE * zoom;
    ctx.fillStyle = r.color;
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = zoom;
    ctx.strokeRect(rx + zoom, ry + zoom, rw - zoom * 2, rh - zoom * 2);
    ctx.strokeStyle = 'rgba(255,240,200,0.25)';
    ctx.strokeRect(rx + zoom * 4, ry + zoom * 4, rw - zoom * 8, rh - zoom * 8);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    for (const [cx2, cy2] of [[rx + zoom * 6, ry + zoom * 6], [rx + rw - zoom * 8, ry + zoom * 6],
      [rx + zoom * 6, ry + rh - zoom * 8], [rx + rw - zoom * 8, ry + rh - zoom * 8]]) {
      ctx.fillRect(cx2, cy2, zoom * 2, zoom * 2);
    }
  }

  /* the naumachia: the arena floods for naval events */
  if (it.arena?.flooded) {
    const R = it.arena.rect;
    ctx.fillStyle = '#2a6a9a';
    ctx.fillRect(Math.round((R.x - camX) * zoom), Math.round((R.y - camY) * zoom), R.w * zoom, R.h * zoom);
    ctx.fillStyle = 'rgba(160,216,234,0.5)';
    for (let i = 0; i < 26; i++) {
      const wx = R.x + ((hash2(i, 3, 9) * (R.w - 28)) | 0) + ((now / 260 + i * 13) % 24);
      const wy = R.y + ((hash2(7, i, 9) * (R.h - 6)) | 0);
      ctx.fillRect(Math.round((wx - camX) * zoom), Math.round((wy - camY) * zoom), 4 * zoom, zoom);
    }
  }

  /* stations + décor (footprint-exact, same rule as buildings) */
  for (const st of it.stations) {
    const spr = getStationSprite(st.kind, st.w, st.h, st.v);
    ctx.drawImage(spr, Math.round((st.x * TILE - camX) * zoom), Math.round((st.y * TILE - camY) * zoom),
      spr.width * zoom, spr.height * zoom);
  }
  for (const d of it.decor) {
    const spr = getDecorSprite(d.kind, d.w, d.h, d.kind === 'neonsign' ? (d.v + ((now / 700) | 0)) : d.v);
    ctx.drawImage(spr, Math.round((d.x * TILE - camX) * zoom), Math.round((d.y * TILE - camY) * zoom),
      spr.width * zoom, spr.height * zoom);
  }

  /* patrons + player + performing figures (racers, fighters, ships,
     the beast…), y-sorted; fully sunk hulls stay under the waves */
  const list = [player, ...it.patrons, ...it.actors.filter((a) => a.sprite && !(a.sink > 1.5))].sort((a, b) => a.y - b.y);
  for (const e of list) {
    const { sx, sy } = drawSprite(e, camX, camY);
    if ((e.type === 'ship' || e.type === 'boat') && e.crew && e.sink === 0) {
      // live deckhands (or paddlers) working the boards
      for (const c of e.crew) {
        const csx = Math.round((e.x + c.ox - 5 - camX) * zoom);
        const csy = Math.round((e.y + c.oy - 6 - camY) * zoom);
        ctx.drawImage(c.sprite, c.dir * CHAR_W, c.frame * CHAR_H, CHAR_W, CHAR_H, csx, csy, CHAR_W * zoom * 0.62, CHAR_H * zoom * 0.62);
      }
    }
    if (e.smokes) {
      // a slow curl of cigarette smoke
      const ph = (now / 400 + e.puffT) % 3;
      ctx.fillStyle = `rgba(200,200,210,${Math.max(0, 0.5 - ph * 0.16)})`;
      ctx.fillRect(sx + (CHAR_W - 3) * zoom, sy + (2 - ph * 2.5) * zoom, zoom, zoom);
      ctx.fillRect(sx + (CHAR_W - 2) * zoom, sy - ph * 3.2 * zoom, zoom, zoom);
    }
    if (e.cheerT > 0) drawEmoji('🎉', e.x, e.y - 20, camX, camY, 9, Math.sin(now / 90) * 2);
    if (e.emote) drawEmoji(e.emote.ico, e.x, e.y - 20, camX, camY, 9, Math.sin(now / 120) * 1.5);
  }

  /* crowd roar — louder while a wager rides */
  for (const a of it.actors) {
    if (a.type !== 'cheer') continue;
    const h = hash2(a.x | 0, ((now / (it.live ? 300 : 450)) | 0), 13);
    if (h > (it.live ? 0.4 : 0.55)) drawEmoji(h > 0.85 ? '🎉' : h > 0.7 ? '📣' : '🙌', a.x, a.y, camX, camY, 8, Math.sin(now / 100 + a.x) * 2);
  }

  /* in-scene event UI: health bars, clocks, leaderboards, verdicts */
  drawLiveOverlay(ctx, it, camX, camY, zoom, now, vw, vh);

  /* room ambience tint + gentle lamplight */
  ctx.fillStyle = it.style.tint;
  ctx.fillRect(Math.round((TILE - camX) * zoom), Math.round((TILE - camY) * zoom),
    (it.W - 2) * TILE * zoom, (it.H - 2) * TILE * zoom);

  /* floaters (wins ping inside too) */
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
}

/* ---------------- main loop ---------------- */
let last = performance.now();
let waterFrame = 0, waterT = 0;
let wasNight = null;   // dusk/dawn transition announcements

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  updateTide();
  UI.renderTide(tideLevel, tideRising);
  UI.renderLuckChip();

  migrationTick(world);   // herd announcements + map marker

  /* dusk & dawn announcements (the night markets trade after dark) */
  {
    const isNight = nightNow().night;
    if (wasNight === null) wasNight = isNight;
    else if (isNight !== wasNight) {
      wasNight = isNight;
      UI.toast(isNight
        ? '🌙 <b>Night falls over Luckland</b> — the night markets are open.'
        : '🌅 Dawn — the night markets shutter till dark.');
    }
  }

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
      // stepping onto a fresh tile can spring a hidden Lucklian patch
      const ntx = Math.floor(player.x / TILE), nty = Math.floor(player.y / TILE);
      if (ntx !== lastStepTile.tx || nty !== lastStepTile.ty) {
        lastStepTile = { tx: ntx, ty: nty };
        if (!scene && !getLanternRace() && !crossing) {
          // walking among a migrating herd springs its species thick and fast
          const mig = migrationNear(world, player.x, player.y);
          if (mig && encounterReady() && roll() < CONFIG.MIGRATION.RATE) {
            armEncounterCooldown(3);
            openEncounter(mig.def, mig.tx, mig.ty);
          } else {
            maybeEncounter(world, ntx, nty, currentProv);
          }
        }
      }
    } else player.frame = 0;
  }
  tickEncounterCooldown(dt);
  tickHunt(dt);           // scavenger-hunt rivals keep pace indoors and out
  updateLanternRace(dt);  // a lantern race on the river settles wherever you are
  updateCrossing(dt);     // the ferry sails on whether or not the den is open
  if (!scene) {
    traderTimer -= dt;
    if (traderTimer <= 0) {
      traderTimer = CONFIG.LUCKLIAN.TRADER_MIN_S + roll() * (CONFIG.LUCKLIAN.TRADER_MAX_S - CONFIG.LUCKLIAN.TRADER_MIN_S);
      if (roll() < CONFIG.LUCKLIAN.TRADER_CHANCE && !getLanternRace()) maybeTraderOffer();
    }
    if (!crossing) resolveTideStranding();
    state.px = player.x; state.py = player.y;
  }

  /* bumping into a door swings it open (with a cooldown so a closed
     modal doesn't immediately reopen while still pressing forward) */
  doorCooldown = Math.max(0, doorCooldown - dt);
  if (!UI.isModalOpen() && doorCooldown === 0 && !switching) {
    if (scene) {
      if (pendingStation && !scene.it.live) {
        doorCooldown = 1.2;
        if (stationIsLive(scene.it, pendingStation)) openLiveBet(scene.it, pendingStation, currentProv);
        else openGame(pendingStation.game, currentProv);
      }
    } else if (pendingDoor) {
      const lm = world.landmarks.find((l) => l.doorX === pendingDoor.tx && l.doorY === pendingDoor.ty);
      if (lm) enterLandmark(lm);
    } else if (pendingEvent) {
      doorCooldown = 1.2;
      launchGame(pendingEvent.game, currentProv, pendingEvent);
    }
  }
  pendingDoor = null; pendingEvent = null; pendingStation = null;

  /* ------- inside a landmark hall: its own tick + render ------- */
  if (scene) {
    interiorTick(dt, now);
    requestAnimationFrame(frame);
    return;
  }

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
  // the camera rides with a lantern race while one is on the river
  const lRace = getLanternRace();
  const focX = lRace ? lRace.focus.x : player.x;
  const focY = lRace ? lRace.focus.y : player.y;
  let camX = focX - viewW / 2, camY = focY - viewH / 2;
  // mid-crossing the den modal owns the middle of the screen, so lift the
  // boat into the clear water above it
  if (crossing) camY += viewH * 0.24;
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

  /* roadside attraction props — footprint-exact, like buildings */
  for (const ev of world.events) {
    if (ev.x > x1 + 1 || ev.x + ev.w < x0 - 1 || ev.y > y1 + 1 || ev.y + ev.h < y0 - 1) continue;
    const spr = getEventSprite(ev);
    ctx.drawImage(spr,
      Math.round((ev.x * TILE - camX) * zoom),
      Math.round((ev.y * TILE - camY) * zoom),
      spr.width * zoom, spr.height * zoom);
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

  /* the Great Migration: a herd on the move across the open country */
  drawMigration(ctx, world, camX, camY, zoom, now);

  /* a wild Lucklian mid-encounter, peeking from its habitat tile */
  const enc = getActiveEncounter();
  if (enc) {
    enc.t = (enc.t || 0) + dt;
    const bob = Math.round(Math.sin(enc.t * 5) * 1.5);
    const spr = getLucklianSprite(enc.def);
    ctx.drawImage(spr,
      Math.round((enc.x * TILE - 4 - camX) * zoom),
      Math.round((enc.y * TILE - 8 + bob - camY) * zoom),
      spr.width * zoom, spr.height * zoom);
  }

  ctx.textBaseline = 'alphabetic';

  /* ferry docks */
  for (const f of world.ferries) {
    for (const dock of [f.a, f.b]) {
      if (dock.x < x0 - 2 || dock.x > x1 + 2 || dock.y < y0 - 2 || dock.y > y1 + 2) continue;
      drawEmoji('⛴️', dock.x * TILE + 8, dock.y * TILE + 4, camX, camY, 12, Math.sin(now / 500) * 1.5);
    }
  }

  const bobT = Math.sin(now / 300) * 2;

  /* the mapped Sunken Hoard: a golden beacon over the tide flat */
  const hoard = state.tmap?.hoard;
  if (hoard && hoard.x >= x0 - 2 && hoard.x <= x1 + 2 && hoard.y >= y0 - 2 && hoard.y <= y1 + 2) {
    const hx = hoard.x * TILE + 8, hy = hoard.y * TILE + 8;
    ctx.fillStyle = `rgba(255,215,94,${0.16 + 0.08 * Math.sin(now / 300)})`;
    ctx.fillRect((hx - 3 - camX) * zoom, (hy - 46 - camY) * zoom, 6 * zoom, 42 * zoom);
    drawEmoji('💰', hx, hy + 5, camX, camY, 12, bobT * 0.5);
    drawEmoji('✨', hx + 6, hy - 8, camX, camY, 7, bobT);
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
  if (crossing && ferrySprite) {   // the Paradise Ferry, with you on her deck
    const cw = ferrySprite.cellW, ch = ferrySprite.cellH;
    ctx.drawImage(ferrySprite, crossing.dir * cw, crossing.frame * ch, cw, ch,
      Math.round((player.x - cw / 2 - camX) * zoom), Math.round((player.y - ch + 10 - camY) * zoom),
      cw * zoom, ch * zoom);
  }
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

  /* night falls: a blue-dark wash over the overworld */
  {
    const nk = nightNow().k;
    if (nk > 0) {
      ctx.fillStyle = `rgba(12,14,48,${(0.30 * nk).toFixed(3)})`;
      ctx.fillRect(0, 0, vw, vh);
    }
  }

  /* a lantern race on the river draws over everything, glowing */
  drawLanternRace(ctx, camX, camY, zoom, now, vw);

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
window.LUCKLAND = {
  world, player, state, concealers, npcs, bots, citizens,
  enterLandmark, exitInterior, getScene: () => scene, openGame,
  doInteract, getCrossing: () => crossing,
};

/* ---------------- PWA service worker ---------------- */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
