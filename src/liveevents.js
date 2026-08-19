/* ============================================================
   Luckland — live arena events
   ------------------------------------------------------------
   The showpiece halls don't open a pop-up game: they run their
   spectacle IN the scene. Place a wager at the rail and the
   camera locks on while the event plays out with in-world UI —
   health bars over the fighters, a race leaderboard, a survival
   clock, ship hulls going down — and the book pays on the
   result. Odds stay honest: every wager pays RTP / p.

   Ambient mode keeps each arena alive between bets, and the
   Coliseum runs a rotating program: chariots -> gladiators ->
   beast hunt -> naval battle.
   ============================================================ */

import { TILE } from './world.js';
import { roll } from './rng.js';
import { state, spend, payout, effectiveRTP } from './state.js';
import { showModal, closeModal, escapeHtml, toast, renderBalance, buildBetRow } from './ui.js';
import { GAME_DEFS } from './games.js';
import { makeCourserSprite, makeBigCatSprite, makeShipSprite, makeCharSprite } from './sprites.js';

const fmt = (v) => Math.round(v).toLocaleString('en-US');
const fmtMult = (m) => (m >= 10 ? m.toFixed(1) : m.toFixed(2)).replace(/\.0+$/, '');

/* ---------------- the Coliseum's rotating card ---------------- */
export const COLISEUM_PROGRAM = ['chariots', 'gladiators', 'beasthunt', 'naval'];
const PROGRAM_LABEL = {
  chariots: '🏛️ Chariot Race', gladiators: '⚔️ Gladiator Bout',
  beasthunt: '🐆 Survive the Vesperon', naval: '⚓ Naumachia — Naval Battle',
};

const CHARIOT_TEAMS = [
  { name: 'The Blues', color: '#2a4a9a', p: 0.30 },
  { name: 'The Greens', color: '#2f7a44', p: 0.27 },
  { name: 'The Reds', color: '#c43a2a', p: 0.23 },
  { name: 'The Whites', color: '#e8e2d4', p: 0.20 },
];
const GLAD_PROPS = [
  { label: 'Champion wins', ico: '🏆', p: 0.55 }, { label: 'Challenger wins', ico: '🗡️', p: 0.45 },
  { label: 'Finish by knockout', ico: '💥', p: 0.40 }, { label: 'Decision of the editor', ico: '📜', p: 0.60 },
];
const BEAST_PROPS = [
  { label: 'All three survive', ico: '🛡️', p: 0.34 }, { label: 'Someone falls', ico: '💀', p: 0.66 },
  { label: 'Two or more fall', ico: '☠️', p: 0.28 }, { label: 'The beast is shut out', ico: '🚫', p: 0.15 },
];
const SHIP_FACTIONS = [
  { name: 'Crimson Fleet', hull: '#8a3a2a', sail: '#c43a2a' },
  { name: 'Azure Fleet', hull: '#3a4a7a', sail: '#3f6ac8' },
  { name: 'Gilded Fleet', hull: '#8a6a2a', sail: '#e8b830' },
  { name: 'Verdant Fleet', hull: '#3a6a3a', sail: '#4f9c5e' },
  { name: 'Ivory Fleet', hull: '#8a8478', sail: '#e8e2d4' },
];
const SHIP_WEIGHTS = [0.32, 0.26, 0.19, 0.13, 0.10];

const VESPERON_PAL = { body: '#6a2a38', mane: '#e8dcc0', accent: '#c49038' };
const GLADIATOR_PALS = [
  { skin: '#c89a70', body: '#c8ccd8', legs: '#8a4a2a' },
  { skin: '#a5713f', body: '#c49038', legs: '#6a4a20' },
  { skin: '#f0c8a0', body: '#9aa0ac', legs: '#5a3a24' },
];

/* ---------------- ambient arena management ---------------- */

function clearShow(it) {
  it.actors = it.actors.filter((a) => !a.show);
  it.arena.flooded = false;
}

function ovalPos(o, ang) {
  return { x: o.cx + Math.cos(ang) * o.rx, y: o.cy + Math.sin(ang) * o.ry };
}
function faceFromVel(a, vx, vy) {
  a.dir = Math.abs(vx) > Math.abs(vy) ? (vx < 0 ? 1 : 2) : (vy < 0 ? 3 : 0);
}
function stepAnim(a, dt, rate = 0.13) {
  a.animT = (a.animT || 0) + dt;
  if (a.animT > rate) { a.animT = 0; a.frame = 1 - (a.frame || 0); }
}

function spawnChariotShow(it) {
  const o = it.arena.oval;
  CHARIOT_TEAMS.slice(0, 3).forEach((tm, i) => {
    it.addActor({
      type: 'lapper', show: true, arena: true,
      sprite: makeCourserSprite({ body: '#3a3642', mane: '#c8ccd8', accent: '#e8a020' }, { chariot: true, teamColor: tm.color }),
      ang: i * 2.1, speed: 1.0 + i * 0.06, o, x: 0, y: 0, dir: 2, frame: 0,
    });
  });
}
function spawnGladShow(it) {
  const c = it.arena.center;
  it.addActor({ type: 'fighter', show: true, arena: true, sprite: makeCharSprite(GLADIATOR_PALS[0]), x: c.x - 14, y: c.y, homeX: c.x - 14, foeDx: 1, dir: 2, frame: 0, hitIco: '⚔️', hp: 100, name: 'CHAMPION' });
  it.addActor({ type: 'fighter', show: true, arena: true, sprite: makeCharSprite(GLADIATOR_PALS[1]), x: c.x + 14, y: c.y, homeX: c.x + 14, foeDx: -1, dir: 1, frame: 0, hitIco: '🛡️', hp: 100, name: 'CHALLENGER' });
}
function spawnBeastShow(it) {
  const c = it.arena.center, r = it.arena.rect;
  it.addActor({ type: 'beast', show: true, arena: true, sprite: makeBigCatSprite(VESPERON_PAL), x: c.x, y: c.y, dir: 2, frame: 0, speed: 62, tgt: 0 });
  for (let i = 0; i < 3; i++) {
    it.addActor({
      type: 'prey', show: true, arena: true, sprite: makeCharSprite(GLADIATOR_PALS[i]),
      x: r.x + 30 + i * 60, y: r.y + 30 + (i % 2) * 60, dir: 0, frame: 0, speed: 54, hp: 100, down: false, name: `GLAD ${i + 1}`,
    });
  }
}
function spawnNavalShow(it, n) {
  it.arena.flooded = true;
  const r = it.arena.rect;
  const count = n || 2 + ((roll() * 4) | 0);
  const w = SHIP_WEIGHTS.slice(0, count);
  const tot = w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < count; i++) {
    it.addActor({
      type: 'ship', show: true, arena: true,
      sprite: makeShipSprite(SHIP_FACTIONS[i].hull, SHIP_FACTIONS[i].sail),
      x: r.x + 40 + (i % 3) * ((r.w - 80) / 2), y: r.y + 34 + ((i / 3) | 0) * 50,
      vx: (roll() - 0.5) * 20, vy: (roll() - 0.5) * 10,
      dir: 2, frame: 0, hp: 100, sink: 0, name: SHIP_FACTIONS[i].name,
      p: w[i] / tot, faction: i,
    });
  }
}

function setProgram(it, ev, shipCount) {
  it.arena.program = ev;
  clearShow(it);
  if (ev === 'chariots') spawnChariotShow(it);
  else if (ev === 'gladiators') spawnGladShow(it);
  else if (ev === 'beasthunt') spawnBeastShow(it);
  else if (ev === 'naval') spawnNavalShow(it, shipCount);
  it.arena.programT = 0;
}

/* called by main every frame for halls with an arena */
export function updateLive(it, dt, now) {
  if (!it.arena) return;
  const A = it.arena;

  // Coliseum program rotation (paused while a wager is live)
  if (A.kind === 'coliseum') {
    if (!A.program) setProgram(it, COLISEUM_PROGRAM[0]);
    A.programT = (A.programT || 0) + dt;
    if (!it.live && A.programT > 42) {
      setProgram(it, COLISEUM_PROGRAM[(COLISEUM_PROGRAM.indexOf(A.program) + 1) % COLISEUM_PROGRAM.length]);
    }
  }

  // ambient actor motion (also used during sims — sims steer via fields)
  for (const a of it.actors) {
    if (!a.arena) continue;
    a.t = (a.t || 0) + dt;
    switch (a.type) {
      case 'lapper': {   // laps an oval; sims drive `race` fields instead
        if (it.live && it.live.kind === 'race' && a.race) break; // sim controls it
        a.ang += (a.speed * dt);
        const p = ovalPos(a.o, a.ang);
        faceFromVel(a, -Math.sin(a.ang) * a.o.rx, Math.cos(a.ang) * a.o.ry);
        a.x = p.x; a.y = p.y;
        stepAnim(a, dt);
        break;
      }
      case 'fighter': {
        if (it.live && (it.live.kind === 'fight')) break;      // choreographed
        a.homeX = a.homeX ?? a.x;
        a.x = a.homeX + Math.sin(a.t * 3.2) * 5 * (a.foeDx || 1);
        a.frame = ((a.t * 6) | 0) % 2;
        if (!a.emote && Math.random() < dt * 0.5) a.emote = { ico: a.hitIco || '💥', t: 0.6 };
        break;
      }
      case 'beast': {
        const prey = it.actors.filter((x) => x.type === 'prey' && !x.down);
        if (!prey.length) break;
        const tgt = prey[a.tgt % prey.length];
        const dx = tgt.x - a.x, dy = tgt.y - a.y, d = Math.hypot(dx, dy) || 1;
        const sp = it.live?.kind === 'chase' ? a.speed * 1.15 : a.speed * 0.8;
        a.x += (dx / d) * sp * dt; a.y += (dy / d) * sp * dt;
        const rB = it.arena.rect;
        a.x = Math.max(rB.x + 14, Math.min(rB.x + rB.w - 14, a.x));
        a.y = Math.max(rB.y + 16, Math.min(rB.y + rB.h - 6, a.y));
        faceFromVel(a, dx, dy);
        stepAnim(a, dt, 0.11);
        if (d < 14 && !it.live && Math.random() < dt * 2) a.tgt++;   // ambient: never catches
        break;
      }
      case 'prey': {
        if (a.down) { a.frame = 0; break; }
        const beast = it.actors.find((x) => x.type === 'beast');
        if (!beast) break;
        const r = it.arena.rect;
        let dx = a.x - beast.x, dy = a.y - beast.y;
        // flee at an angle, so the chase circles the sand instead of
        // pinning everyone into a corner
        if (!a.spinSign) a.spinSign = Math.random() < 0.5 ? 1 : -1;
        const fleeAng = Math.atan2(dy, dx) + a.spinSign * 0.6;
        dx = Math.cos(fleeAng); dy = Math.sin(fleeAng);
        // steer away from walls (and flip the circling direction there)
        if (a.x < r.x + 22) { dx += 1.2; a.spinSign = 1; }
        if (a.x > r.x + r.w - 22) { dx -= 1.2; a.spinSign = -1; }
        if (a.y < r.y + 22) { dy += 1.2; }
        if (a.y > r.y + r.h - 22) { dy -= 1.2; }
        const m = Math.hypot(dx, dy) || 1;
        a.x += (dx / m) * a.speed * dt; a.y += (dy / m) * a.speed * dt;
        a.x = Math.max(r.x + 10, Math.min(r.x + r.w - 10, a.x));
        a.y = Math.max(r.y + 14, Math.min(r.y + r.h - 4, a.y));
        faceFromVel(a, dx, dy);
        stepAnim(a, dt, 0.12);
        break;
      }
      case 'ship': {
        if (a.sink > 0) { a.sink += dt; break; }
        const r = it.arena.rect;
        a.vx += (roll() - 0.5) * 26 * dt; a.vy += (roll() - 0.5) * 14 * dt;
        const vmax = it.live?.kind === 'naval' ? 26 : 16;
        const v = Math.hypot(a.vx, a.vy) || 1;
        if (v > vmax) { a.vx *= vmax / v; a.vy *= vmax / v; }
        a.x += a.vx * dt; a.y += a.vy * dt;
        if (a.x < r.x + 28) { a.x = r.x + 28; a.vx = Math.abs(a.vx); }
        if (a.x > r.x + r.w - 28) { a.x = r.x + r.w - 28; a.vx = -Math.abs(a.vx); }
        if (a.y < r.y + 18) { a.y = r.y + 18; a.vy = Math.abs(a.vy); }
        if (a.y > r.y + r.h - 12) { a.y = r.y + r.h - 12; a.vy = -Math.abs(a.vy); }
        a.dir = a.vx < 0 ? 1 : 0;   // ship sheets: col 0 faces right, col 1 left
        stepAnim(a, dt, 0.4);
        break;
      }
    }
    if (a.emote) { a.emote.t -= dt; if (a.emote.t <= 0) a.emote = null; }
  }

  if (it.live) updateSim(it, dt, now);
}

/* ============================================================
   Placing a wager
   ============================================================ */
export function stationIsLive(it, st) {
  return !!(it.arena && st.live);
}

export function openLiveBet(it, st, provCode) {
  const A = it.arena;
  let title, ico, choices, eventKind;
  if (A.kind === 'fight') {
    title = 'Ringside Book'; ico = '🥊'; eventKind = 'fight';
    choices = GAME_DEFS.muaythaibout.props.map((p, i) => ({ label: p.label, ico: p.ico, p: p.p, idx: i }));
  } else if (A.kind === 'race') {
    title = 'The Lucklian Stakes'; ico = '🏁'; eventKind = 'race';
    choices = GAME_DEFS.downsrace.runners.map((r, i) => ({ label: r.name, ico: r.ico, p: r.p, idx: i }));
  } else {
    const ev = A.program;
    title = PROGRAM_LABEL[ev]; ico = '🏟️';
    if (ev === 'chariots') { eventKind = 'race'; choices = CHARIOT_TEAMS.map((t2, i) => ({ label: t2.name, ico: '🏛️', p: t2.p, idx: i })); }
    else if (ev === 'gladiators') { eventKind = 'fight'; choices = GLAD_PROPS.map((p, i) => ({ ...p, idx: i })); }
    else if (ev === 'beasthunt') { eventKind = 'chase'; choices = BEAST_PROPS.map((p, i) => ({ ...p, idx: i })); }
    else {
      eventKind = 'naval';
      const ships = it.actors.filter((a) => a.type === 'ship' && !a.sink);
      choices = ships.map((s, i) => ({ label: s.name, ico: '⚓', p: s.p, idx: i, ship: s }));
    }
  }
  const gameId = st.game;
  const rtp = effectiveRTP(gameId, provCode);
  let bet = state.lastBet;
  const m = showModal(`
    <h2>${ico} ${escapeHtml(title)}</h2>
    <div class="subtitle">${A.kind === 'coliseum' ? `Now on the sand: <b>${escapeHtml(PROGRAM_LABEL[A.program])}</b> · ` : ''}RTP ${(rtp * 100).toFixed(1)}% — pick your wager, then watch it play out</div>
    <div id="lv-choices"></div>
    <div id="lv-bet"></div>
  `);
  buildBetRow(m.querySelector('#lv-bet'), (v) => { bet = v; });
  const box = m.querySelector('#lv-choices');
  choices.forEach((c) => {
    const row = document.createElement('div');
    row.className = 'race-lane race-pick-btn';
    row.innerHTML = `<span style="flex:1;text-align:left">${c.ico} ${escapeHtml(c.label)}</span><span class="odds">${fmtMult(rtp / c.p)}x</span>`;
    row.addEventListener('click', () => {
      if (state.balance < bet) { toast('Not enough coins!'); return; }
      spend(bet);
      state.stats.gamesPlayed++;
      renderBalance();
      closeModal();
      startSim(it, eventKind, c, bet, rtp);
    });
    box.appendChild(row);
  });
}

/* ============================================================
   Sim construction — the outcome is drawn honestly up front,
   then the show is choreographed to match it.
   ============================================================ */
function startSim(it, kind, choice, bet, rtp) {
  const mult = rtp / choice.p;
  const live = {
    kind, bet, mult, choice, t: 0, phase: 'intro', done: false,
    focus: it.arena.center, banner: null, resultShown: false,
  };

  if (kind === 'fight') {
    const hit = roll() < choice.p;
    const L = choice.label.toLowerCase();
    let winner = roll() < 0.5 ? 0 : 1;
    let method = roll() < 0.4 ? 'ko' : 'decision';
    let round = 1 + ((roll() * 3) | 0);
    if (L.includes('red') || L.includes('champion')) winner = hit ? 0 : 1;
    else if (L.includes('blue') || L.includes('challenger')) winner = hit ? 1 : 0;
    else if (L.includes('knockout')) method = hit ? 'ko' : 'decision';
    else if (L.includes('distance') || L.includes('decision')) method = hit ? 'decision' : 'ko';
    else if (L.includes('round 1')) { method = hit ? 'ko' : (roll() < 0.5 ? 'ko' : 'decision'); round = hit ? 1 : 2 + ((roll() * 2) | 0); }
    else if (L.includes('dropped')) live.doubleDrop = hit;
    if (method === 'decision') round = 3;
    live.win = hit;
    live.fight = { winner, method, round, hp: [100, 100], roundNow: 1, roundT: 0, exchT: 0, attacker: 0, koDone: false };
    const fighters = it.actors.filter((a) => a.type === 'fighter' && a.arena);
    live.fight.actors = fighters;
    // square up toe-to-toe for the bout, remember the idle spots
    fighters.forEach((f, i) => {
      f.hp = 100;
      f.origHomeX = f.homeX ?? f.x;
      f.homeX = it.arena.center.x + (i === 0 ? -11 : 11);
      f.origY = f.y;
      f.y = it.arena.center.y + 4;
    });
  } else if (kind === 'race') {
    // draw the true winner by probability, like the race mechanic
    let r = roll(), winner = 0;
    const field = it.arena.kind === 'race' ? GAME_DEFS.downsrace.runners : CHARIOT_TEAMS;
    for (let i = 0; i < field.length; i++) { r -= field[i].p; if (r <= 0) { winner = i; break; } }
    live.win = winner === choice.idx;
    const order = field.map((_, i) => i).filter((i) => i !== winner).sort(() => roll() - 0.5);
    order.unshift(winner);
    const times = {};
    order.forEach((idx, rank) => { times[idx] = 8.5 + rank * (0.55 + roll() * 0.4); });
    live.race = { winner, field, times, prog: field.map(() => 0), finished: [], started: false, gateT: 0 };
    // conscript / spawn the full field as sim lappers
    const o = it.arena.oval;
    const existing = it.actors.filter((a) => a.type === 'lapper' && a.arena);
    for (let i = existing.length; i < field.length; i++) {
      const f = field[i];
      const spr = it.arena.kind === 'race'
        ? makeCourserSprite({ body: f.pal?.[0] || '#8a5a2a', mane: f.pal?.[1] || '#4a3222', accent: f.pal?.[2] || '#e8dcc0' }, { rider: 'cowboy' })
        : makeCourserSprite({ body: '#3a3642', mane: '#c8ccd8', accent: '#e8a020' }, { chariot: true, teamColor: f.color });
      it.addActor({ type: 'lapper', show: it.arena.kind !== 'race', arena: true, sprite: spr, ang: 0, speed: 1, o, x: 0, y: 0, dir: 2, frame: 0 });
    }
    const lappers = it.actors.filter((a) => a.type === 'lapper' && a.arena);
    field.forEach((f, i) => { lappers[i].race = { lane: i }; lappers[i].raceIdx = i; });
    live.race.actors = lappers.slice(0, field.length);
  } else if (kind === 'chase') {
    const hit = roll() < choice.p;
    const L = choice.label.toLowerCase();
    let falls;
    if (L.includes('all three survive')) falls = hit ? 0 : 1 + ((roll() * 3) | 0);
    else if (L.includes('two or more')) falls = hit ? 2 + ((roll() * 2) | 0) : ((roll() * 2) | 0);
    else if (L.includes('someone')) falls = hit ? 1 + ((roll() * 3) | 0) : 0;
    else falls = hit ? 0 : 1 + ((roll() * 3) | 0);   // shut out
    live.win = hit;
    live.chase = { falls, timer: 14, fallTimes: [], fallen: 0, shutOut: L.includes('shut out') && hit };
    for (let i = 0; i < falls; i++) live.chase.fallTimes.push(3 + roll() * 9);
    live.chase.fallTimes.sort((a, b) => a - b);
    it.actors.filter((a) => a.type === 'prey').forEach((p) => { p.hp = 100; p.down = false; });
  } else if (kind === 'naval') {
    const ships = it.actors.filter((a) => a.type === 'ship' && !a.sink);
    let r = roll(), winner = ships[0];
    for (const s of ships) { r -= s.p; if (r <= 0) { winner = s; break; } }
    live.win = winner === choice.ship;
    const losers = ships.filter((s) => s !== winner).sort(() => roll() - 0.5);
    const sinkTimes = {};
    losers.forEach((s, i) => { sinkTimes[s.faction] = 5 + i * (7 / Math.max(1, losers.length)) + roll() * 1.5; });
    live.naval = { winner, ships, sinkTimes, shots: [], shotT: 0 };
    ships.forEach((s) => { s.hp = 100; });
  }

  it.live = live;
}

/* ---------------- per-frame sim choreography ---------------- */
function endSim(it, bannerText) {
  const live = it.live;
  live.phase = 'done';
  live.banner = bannerText;
  live.doneT = 0;
  if (live.win) {
    payout(live.bet * live.mult);
    toast(`🏟️ <b>${escapeHtml(live.choice.label)}</b> lands — you win <span class="amt">${fmt(live.bet * live.mult)}</span> 🪙!`, live.mult >= 6);
  } else {
    toast(`The book keeps your ${fmt(live.bet)} 🪙 — <b>${escapeHtml(live.choice.label)}</b> missed.`);
  }
  renderBalance();
}

function updateSim(it, dt, now) {
  const live = it.live;
  live.t += dt;
  if (live.phase === 'done') {
    live.doneT += dt;
    if (live.doneT > 3.2) {
      it.live = null;
      if (live.kind === 'fight' && live.fight.actors) {
        live.fight.actors.forEach((f) => {
          if (f.origHomeX !== undefined) { f.homeX = f.origHomeX; f.x = f.origHomeX; }
          if (f.origY !== undefined) f.y = f.origY;
          f.dir = f.foeDx === 1 ? 2 : 1;
        });
      }
      const keep = it.arena.ambientCount ?? 3;
      const lappers = it.actors.filter((a) => a.type === 'lapper' && a.arena);
      lappers.slice(keep).forEach((a) => { it.actors = it.actors.filter((x) => x !== a); });
      lappers.forEach((a) => { a.race = null; });
      if (it.arena.kind === 'coliseum') it.arena.programT = 20; // move the card along soon
    }
    return;
  }

  if (live.kind === 'fight') updateFight(it, live, dt);
  else if (live.kind === 'race') updateRace(it, live, dt);
  else if (live.kind === 'chase') updateChase(it, live, dt);
  else if (live.kind === 'naval') updateNaval(it, live, dt);
}

function updateFight(it, live, dt) {
  const F = live.fight;
  const [a, b] = F.actors;
  if (!a || !b) { endSim(it, 'The card is over.'); return; }
  F.roundT += dt;
  const roundLen = 5.2;
  const koRound = F.method !== 'decision' ? F.round : 99;

  // choreography: alternate lunges, hit flashes, scripted damage
  F.exchT += dt;
  if (F.exchT > 0.55) {
    F.exchT = 0;
    F.attacker = 1 - F.attacker;
    const atk = F.attacker === 0 ? a : b, def = F.attacker === 0 ? b : a;
    atk.x += (def.x > atk.x ? 6 : -6);
    def.hitT = 0.22;
    def.emote = { ico: '💥', t: 0.35 };
    const defIdx = F.attacker === 0 ? 1 : 0;
    // loser bleeds faster; in the KO round the loser's bar races to zero
    const isLoser = defIdx !== F.winner;
    let dmg = (isLoser ? 6.5 : 3.5) + roll() * 3;
    if (F.roundNow === koRound && isLoser) dmg += 9;
    F.hp[defIdx] = Math.max(F.roundNow === 3 && F.method === 'decision' ? 22 : 0, F.hp[defIdx] - dmg);
    if (live.doubleDrop && F.roundNow === 2 && !F.dropped) {
      F.dropped = true;
      a.emote = { ico: '🤕', t: 1 }; b.emote = { ico: '🤕', t: 1 };
    }
  }
  a.frame = ((live.t * 7) | 0) % 2; b.frame = ((live.t * 7 + 1) | 0) % 2;
  a.x += (a.homeX + Math.sin(live.t * 4) * 4 - a.x) * 0.2;
  b.x += (b.homeX - Math.sin(live.t * 4) * 4 - b.x) * 0.2;

  // KO the moment the loser's health empties in the scheduled round
  const loserIdx = 1 - F.winner;
  if (F.roundNow === koRound && F.hp[loserIdx] <= 0 && !F.koDone) {
    F.koDone = true;
    const loser = loserIdx === 0 ? a : b;
    const winner = F.winner === 0 ? a : b;
    loser.emote = { ico: '😵', t: 3 };
    loser.frame = 0; loser.dir = 0;
    winner.emote = { ico: '🏆', t: 3 };
    endSim(it, `${winner.name || (F.winner === 0 ? 'RED' : 'BLUE')} WINS BY KO — ROUND ${F.roundNow}`);
    return;
  }
  if (F.roundT > roundLen) {
    F.roundT = 0;
    F.roundNow++;
    if (F.roundNow > 3) {
      const winner = F.winner === 0 ? a : b;
      winner.emote = { ico: '🏆', t: 3 };
      endSim(it, `${winner.name || (F.winner === 0 ? 'RED' : 'BLUE')} TAKES THE DECISION`);
    }
  }
}

function updateRace(it, live, dt) {
  const R = live.race;
  const o = it.arena.oval;
  const startAng = Math.PI / 2;    // gates at the bottom of the oval
  if (!R.started) {
    R.gateT += dt;
    // horses walk into the gates, staggered across lanes
    R.actors.forEach((a, i) => {
      const gate = ovalPos({ ...o, rx: o.rx - 4 - (i % 3) * 7, ry: o.ry - 2 - (i % 3) * 4 }, startAng);
      a.x += (gate.x + (i - R.actors.length / 2) * 7 - a.x) * 0.08;
      a.y += (gate.y - a.y) * 0.08;
      a.dir = 2; a.frame = 0;
      a.ang = startAng;
    });
    if (it.arena.starter && R.gateT > 1.2) it.arena.starter.emote = { ico: R.gateT > 2 ? '💥' : '🔫', t: 0.5 };
    if (R.gateT > 2.4) { R.started = true; live.raceT = 0; }
    return;
  }
  live.raceT = (live.raceT || 0) + dt;
  const LAPS = 2;
  R.actors.forEach((a, i) => {
    if (R.prog[i] >= 1) { a.frame = 0; return; }
    const T = R.times[i];
    const eased = Math.min(1, live.raceT / T);
    const wobble = Math.sin(live.raceT * 3 + i * 2) * 0.006;
    R.prog[i] = Math.min(1, Math.max(R.prog[i], eased + (eased < 0.9 ? wobble : 0)));
    const laneRx = o.rx - (i % 3) * 6, laneRy = o.ry - (i % 3) * 3;
    const ang = startAng + R.prog[i] * Math.PI * 2 * LAPS;
    const p = ovalPos({ ...o, rx: laneRx, ry: laneRy }, ang);
    a.x = p.x; a.y = p.y; a.ang = ang;
    faceFromVel(a, -Math.sin(ang) * laneRx, Math.cos(ang) * laneRy);
    stepAnim(a, dt, 0.1);
    if (R.prog[i] >= 1 && !R.finished.includes(i)) R.finished.push(i);
  });
  if (R.finished.length >= R.actors.length || live.raceT > 16) {
    const field = R.field;
    endSim(it, `🏁 ${field[R.winner].name.toUpperCase()} TAKES IT!`);
  }
}

function updateChase(it, live, dt) {
  const C = live.chase;
  C.timer -= dt;
  const beast = it.actors.find((a) => a.type === 'beast');
  const prey = it.actors.filter((a) => a.type === 'prey');
  const elapsed = 14 - C.timer;
  // scheduled maulings
  if (C.fallen < C.fallTimes.length && elapsed > C.fallTimes[C.fallen]) {
    const standing = prey.filter((p) => !p.down);
    if (standing.length) {
      const victim = standing[(roll() * standing.length) | 0];
      victim.hp = 0; victim.down = true;
      victim.emote = { ico: '😵', t: 2.5 };
      if (beast) { beast.x = victim.x - 10; beast.y = victim.y; beast.emote = { ico: '🩸', t: 1 }; }
      C.fallen++;
    } else C.fallen++;
  }
  // background scratches (never on a shut-out)
  if (!C.shutOut && beast) {
    for (const p2 of prey) {
      if (p2.down || p2.hp <= 12) continue;
      if (Math.hypot(p2.x - beast.x, p2.y - beast.y) < 16 && Math.random() < dt * 2.4) {
        const survivesAll = C.fallen >= C.fallTimes.length;
        p2.hp = Math.max(survivesAll ? 15 : 30, p2.hp - (5 + roll() * 8));
        p2.hitT = 0.2;
        p2.emote = { ico: '🩸', t: 0.4 };
      }
    }
  }
  if (C.timer <= 0) {
    const alive = prey.filter((p) => !p.down).length;
    endSim(it, alive === 3 ? '🛡️ ALL THREE WALK OUT!' : `${alive}/3 SURVIVE THE VESPERON`);
  }
}

function updateNaval(it, live, dt) {
  const N = live.naval;
  const elapsed = live.t;
  N.shotT -= dt;
  const afloat = N.ships.filter((s) => s.sink === 0);
  // exchanges of ballista fire
  if (N.shotT <= 0 && afloat.length > 1) {
    N.shotT = 0.55 + roll() * 0.5;
    const from = afloat[(roll() * afloat.length) | 0];
    let to = afloat[(roll() * afloat.length) | 0];
    if (to === from) to = afloat.find((s) => s !== from);
    if (to) {
      N.shots.push({ x1: from.x, y1: from.y - 8, x2: to.x, y2: to.y - 6, t: 0 });
      const doomed = to !== N.winner;
      const timeLeft = doomed ? Math.max(0.4, (N.sinkTimes[to.faction] ?? 6) - elapsed) : 99;
      const dmg = doomed ? Math.min(to.hp, Math.max(6, (to.hp / timeLeft) * (0.6 + roll() * 0.5))) : Math.min(to.hp - 24, 4 + roll() * 6);
      if (dmg > 0) { to.hp -= dmg; to.hitT = 0.25; }
    }
  }
  for (const sh of N.shots) sh.t += dt * 3;
  N.shots = N.shots.filter((sh) => sh.t < 1);
  // scheduled sinkings
  for (const s of N.ships) {
    if (s.sink === 0 && s !== N.winner && elapsed > (N.sinkTimes[s.faction] ?? 999)) {
      s.hp = 0; s.sink = 0.01;
      s.emote = { ico: '🌊', t: 1.5 };
    }
  }
  if (afloat.length <= 1) {
    endSim(it, `⚓ ${(N.winner.name || 'THE LAST SHIP').toUpperCase()} RULES THE WATER!`);
  }
}

/* ============================================================
   In-scene overlay UI — drawn straight onto the canvas
   ============================================================ */
function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(12,10,20,0.82)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(240,192,64,0.8)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}
function hpBar(ctx, sx, sy, w, frac, zoom) {
  ctx.fillStyle = 'rgba(10,8,16,0.85)';
  ctx.fillRect(sx - 1, sy - 1, w + 2, 3 * zoom / 2 + 2);
  ctx.fillStyle = frac > 0.5 ? '#5fce6a' : frac > 0.25 ? '#e8b830' : '#e05548';
  ctx.fillRect(sx, sy, Math.max(0, w * frac), 3 * zoom / 2);
}

export function drawLiveOverlay(ctx, it, camX, camY, zoom, now, vw) {
  const A = it.arena;
  if (!A) return;
  const S = (wx) => (wx - camX) * zoom;
  const Sy = (wy) => (wy - camY) * zoom;
  const font = (px2, bold = true) => `${bold ? 'bold ' : ''}${px2}px "Courier New", monospace`;
  const live = it.live;

  /* marquee: what's on (Coliseum program / arena idle card) */
  if (A.kind === 'coliseum' && !live) {
    const label = PROGRAM_LABEL[A.program] || '';
    ctx.font = font(11 * zoom / 2);
    const w = ctx.measureText(label).width + 18;
    panel(ctx, S(A.center.x) - w / 2, Sy(A.rect.y) - 14 * zoom / 2, w, 11 * zoom / 2 + 6);
    ctx.fillStyle = '#ffd75e';
    ctx.textAlign = 'center';
    ctx.fillText(label, S(A.center.x), Sy(A.rect.y) - 4 * zoom / 2);
  }

  /* health bars on ambient + sim performers */
  for (const a of it.actors) {
    if (!a.arena) continue;
    if (a.hitT) { a.hitT -= 1 / 60; }
    const needsBar = (live && ((live.kind === 'fight' && a.type === 'fighter') ||
      (live.kind === 'chase' && a.type === 'prey') ||
      (live.kind === 'naval' && a.type === 'ship')));
    if (needsBar && a.hp !== undefined) {
      const w = (a.type === 'ship' ? 30 : 16) * zoom / 2;
      let frac = a.hp / 100;
      if (live.kind === 'fight') {
        const F = live.fight;
        frac = (F.actors[0] === a ? F.hp[0] : F.hp[1]) / 100;
      }
      hpBar(ctx, S(a.x) - w / 2, Sy(a.y) - (a.type === 'ship' ? 34 : 26) * zoom / 2, w, Math.max(0, frac), zoom);
    }
  }

  /* naval: ballista bolts + sinking hulls handled in main's draw via sink field */
  if (live?.kind === 'naval') {
    ctx.strokeStyle = '#ffe066';
    ctx.lineWidth = zoom / 2;
    for (const sh of live.naval.shots) {
      const x = sh.x1 + (sh.x2 - sh.x1) * sh.t, y = sh.y1 + (sh.y2 - sh.y1) * sh.t - Math.sin(sh.t * Math.PI) * 14;
      ctx.beginPath();
      ctx.moveTo(S(x - 2), Sy(y + 1));
      ctx.lineTo(S(x + 2), Sy(y - 1));
      ctx.stroke();
    }
  }

  if (!live) return;

  /* top panel: event clock + pot */
  {
    const cx = S(live.focus.x);
    const topY = Sy(A.rect.y) - 34 * zoom / 2;
    let line1 = '', line2 = `BET ${fmt(live.bet)} → WIN ${fmt(live.bet * live.mult)} (${fmtMult(live.mult)}x)`;
    if (live.kind === 'fight') line1 = live.phase === 'done' ? 'FIGHT OVER' : `ROUND ${Math.min(3, live.fight.roundNow)} · 0:${String(Math.max(0, Math.round((5.2 - live.fight.roundT) * 11))).padStart(2, '0')}`;
    else if (live.kind === 'race') line1 = live.race.started ? '🏁 RACING' : 'THE FIELD LOADS THE GATES…';
    else if (live.kind === 'chase') line1 = `SURVIVE: 0:${String(Math.max(0, Math.ceil(live.chase.timer))).padStart(2, '0')}`;
    else if (live.kind === 'naval') line1 = `${live.naval.ships.filter((s) => s.sink === 0).length} SHIPS AFLOAT`;
    ctx.font = font(11 * zoom / 2);
    const w = Math.max(ctx.measureText(line1).width, ctx.measureText(line2).width) + 20;
    panel(ctx, cx - w / 2, topY, w, 26 * zoom / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd75e';
    ctx.fillText(line1, cx, topY + 10 * zoom / 2);
    ctx.fillStyle = '#e8e2d4';
    ctx.font = font(9 * zoom / 2, false);
    ctx.fillText(line2, cx, topY + 21 * zoom / 2);
  }

  /* race leaderboard, ranked live, rows lock at the wire */
  if (live.kind === 'race') {
    const R = live.race;
    const rowH = 11 * zoom / 2;
    const wPanel = 96 * zoom / 2;
    const lbx = Math.min(S(A.rect.x + A.rect.w) + 8, (vw || 800) - wPanel - 10);
    const lby = Math.max(8, Sy(A.rect.y) + 8);
    panel(ctx, lbx, lby, wPanel, rowH * (R.field.length + 1) + 8);
    ctx.font = font(9 * zoom / 2);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd75e';
    ctx.fillText('— THE WIRE —', lbx + 8, lby + rowH);
    const ranked = R.field.map((f, i) => ({ f, i }))
      .sort((x, y2) => (R.finished.indexOf(x.i) !== -1 || R.finished.indexOf(y2.i) !== -1)
        ? (R.finished.indexOf(x.i) === -1 ? 99 : R.finished.indexOf(x.i)) - (R.finished.indexOf(y2.i) === -1 ? 99 : R.finished.indexOf(y2.i))
        : R.prog[y2.i] - R.prog[x.i]);
    ranked.forEach((e, rank) => {
      const done = R.finished.includes(e.i);
      ctx.fillStyle = e.i === live.choice.idx ? '#ffd75e' : done ? '#8fdc9a' : '#e8e2d4';
      ctx.fillText(`${rank + 1}. ${e.f.name.slice(0, 12)}${done ? ' ✓' : ''}`, lbx + 8, lby + rowH * (rank + 2));
    });
  }

  /* survival clock, big and center */
  if (live.kind === 'chase' && live.phase !== 'done') {
    ctx.font = font(22 * zoom / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = live.chase.timer < 4 ? '#e05548' : '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3;
    const txt = `0:${String(Math.max(0, Math.ceil(live.chase.timer))).padStart(2, '0')}`;
    ctx.strokeText(txt, S(A.center.x), Sy(A.rect.y) + 26 * zoom / 2);
    ctx.fillText(txt, S(A.center.x), Sy(A.rect.y) + 26 * zoom / 2);
  }

  /* the verdict banner */
  if (live.phase === 'done' && live.banner) {
    const cx = S(live.focus.x), cy = Sy(live.focus.y);
    ctx.font = font(13 * zoom / 2);
    const w = ctx.measureText(live.banner).width + 30;
    panel(ctx, cx - w / 2, cy - 14 * zoom / 2, w, 24 * zoom / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = live.win ? '#8fdc9a' : '#e8e2d4';
    ctx.fillText(live.banner, cx, cy + 2 * zoom / 2);
    ctx.font = font(9 * zoom / 2, false);
    ctx.fillStyle = live.win ? '#ffd75e' : '#b8b4c0';
    ctx.fillText(live.win ? `+${fmt(live.bet * live.mult)} 🪙` : 'better luck at the next card', cx, cy + 8 * zoom / 2 + 6);
  }
}
