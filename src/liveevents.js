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
import { BY_ID } from './lucklians.js';

const fmt = (v) => Math.round(v).toLocaleString('en-US');
const fmtMult = (m) => (m >= 10 ? m.toFixed(1) : m.toFixed(2)).replace(/\.0+$/, '');

/* ---------------- the Coliseum's rotating card ---------------- */
export const COLISEUM_PROGRAM = ['chariots', 'gladiators', 'beasthunt', 'naval'];
const PROGRAM_LABEL = {
  chariots: '🏛️ Chariot Race', gladiators: '⚔️ Gladiator Bout',
  beasthunt: '🐆 Survive the Vesperon', naval: '⚓ Naumachia — Naval Battle',
};

/* ---------------- name & colour banks ---------------- */
const DERBY_NAMES = [
  'Biscuit Tornado', 'Sir Gallops-a-Lot', 'Midnight Marmalade', 'Thunder Pudding',
  'Cactus Waltz', "Bandit's Breakfast", 'Whiskey Lullaby', 'Dust Devil Darling',
  'Penny Stampede', 'Hay Fever', 'Tumbleweed Tango', 'Gravy Train',
  'Rhinestone Rocket', 'Prairie Oyster', 'Sudden Biscuit', 'Long Odds Lulu',
  "Marshal's Mistake", 'Bootleg Buttercup', 'Yeehaw Yesterday', 'Snake Oil Sally',
  'Mosey On Over', 'Full Tilt Filly', 'Denim Lightning', 'Last Call Larry',
];
const RACER_SPECIES = [
  { sp: 'Voltjack', id: 109 }, { sp: 'Deadlight Courser', id: 115 },
  { sp: 'Whitewraith Courser', id: 102 }, { sp: 'Blackspur', id: 31 },
  { sp: 'Coppergrin', id: 37 }, { sp: 'Bristlejack', id: 3 },
];
const CHARIOT_COLORS = [
  ['Indigo', '#3f3fae'], ['Magenta', '#c23a8e'], ['Amber', '#e8a020'], ['Turquoise', '#2fa8a0'],
  ['Crimson', '#c43a2a'], ['Viridian', '#2f7a5a'], ['Cobalt', '#2a4a9a'], ['Saffron', '#e8c040'],
  ['Obsidian', '#26222c'], ['Ivory', '#e8e2d4'], ['Vermilion', '#e05030'], ['Ultramarine', '#2438a8'],
  ['Chartreuse', '#9ac82a'], ['Aubergine', '#5a2a5a'], ['Celadon', '#a8c8a0'], ['Scarlet', '#d42a3a'],
];
const MUAY_NAMES = [
  'Yodpetch', 'Singdam', 'Chalamkao', 'Rungnarai', 'Petchmorakot',
  'Suealak', 'Fahsai', 'Kumandee', 'Saenklai', 'Dettada', 'Nokweed', 'Payakaroon Noi',
];
const GLAD_NAMES = [
  'Ferrox', 'Cassivus', 'Urso the Unbowed', 'Nervanus', 'Spurius Drax', 'Volpex',
  'Tigrannus', 'Maximo of Ostia', 'Callidus', 'Barbo', 'Aquilo', 'Dentatus',
];
const pickN = (arr, n) => [...arr].sort(() => roll() - 0.5).slice(0, n);
const shuffled = (arr) => [...arr].sort(() => roll() - 0.5);

/* a fresh Downs card: random derby names on a random assortment of species */
function newDownsField() {
  const names = pickN(DERBY_NAMES, 6);
  const ps = shuffled([0.28, 0.22, 0.18, 0.14, 0.11, 0.07]);
  return names.map((name, i) => {
    const spec = RACER_SPECIES[(roll() * RACER_SPECIES.length) | 0];  // repeats welcome
    return { name, species: spec.sp, lkId: spec.id, p: ps[i], rider: 'cowboy' };
  });
}
/* a fresh chariot card: four exotic stables drawn from the colour bank */
function newChariotField() {
  const cols = pickN(CHARIOT_COLORS, 4);
  const ps = shuffled([0.30, 0.27, 0.23, 0.20]);
  return cols.map(([cname, hex], i) => ({ name: `The ${cname}s`, color: hex, p: ps[i], chariot: true }));
}
/* a fresh bout: two named fighters for the card */
function newBout(kind) {
  const bank = kind === 'glad' ? GLAD_NAMES : MUAY_NAMES;
  const [a, b] = pickN(bank, 2);
  return { names: [a, b] };
}
const FIGHT_PROPS_P = {
  muay: { winA: 0.52, winB: 0.48, ko: 0.34, dist: 0.44, r1: 0.14, double: 0.09 },
  glad: { winA: 0.55, winB: 0.45, ko: 0.40, dist: 0.60 },
};

/* the striking arts — name, damage range, weight, animation */
const MOVES = [
  { name: 'Jab', dmg: [2, 5], w: 20, anim: 'lunge' },
  { name: 'Hook', dmg: [4, 8], w: 13, anim: 'lunge' },
  { name: 'Low Kick', dmg: [3, 7], w: 15, anim: 'kick' },
  { name: 'Body Kick', dmg: [5, 9], w: 12, anim: 'kick' },
  { name: 'Head Kick', dmg: [7, 12], w: 7, anim: 'kick' },
  { name: 'Elbow', dmg: [6, 10], w: 9, anim: 'lunge' },
  { name: 'Knee', dmg: [5, 9], w: 10, anim: 'hop' },
  { name: 'Wheel Kick', dmg: [9, 14], w: 4, anim: 'spin' },
  { name: 'Spinning Kick', dmg: [8, 13], w: 5, anim: 'spin' },
  { name: 'Flying Knee', dmg: [9, 15], w: 4, anim: 'hop' },
];
function pickMove() {
  let tot = 0; for (const m of MOVES) tot += m.w;
  let r = roll() * tot;
  for (const m of MOVES) { r -= m.w; if (r <= 0) return m; }
  return MOVES[0];
}
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
  pickN(CHARIOT_COLORS, 3).forEach(([, hex], i) => {
    it.addActor({
      type: 'lapper', show: true, arena: true,
      sprite: makeCourserSprite({ body: '#3a3642', mane: '#c8ccd8', accent: '#e8a020' }, { chariot: true, teamColor: hex }),
      ang: i * 2.1, speed: 1.0 + i * 0.06, o, x: 0, y: 0, dir: 2, frame: 0,
    });
  });
}
function spawnGladShow(it) {
  const c = it.arena.center;
  it.arena.bout = newBout('glad');
  const [na, nb] = it.arena.bout.names;
  it.addActor({ type: 'fighter', show: true, arena: true, sprite: makeCharSprite(GLADIATOR_PALS[0]), x: c.x - 14, y: c.y, homeX: c.x - 14, foeDx: 1, dir: 2, frame: 0, hitIco: '⚔️', hp: 100, name: na });
  it.addActor({ type: 'fighter', show: true, arena: true, sprite: makeCharSprite(GLADIATOR_PALS[1]), x: c.x + 14, y: c.y, homeX: c.x + 14, foeDx: -1, dir: 1, frame: 0, hitIco: '🛡️', hp: 100, name: nb });
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
    const crew = [];
    for (let k = 0; k < 3; k++) {
      crew.push({
        ox: -13 + k * 9 + roll() * 4, oy: -13,
        sprite: makeCharSprite(GLADIATOR_PALS[k % GLADIATOR_PALS.length]),
        dir: (roll() * 4) | 0, frame: 0, wT: roll() * 2, drift: 0,
      });
    }
    it.addActor({
      type: 'ship', show: true, arena: true,
      sprite: makeShipSprite(SHIP_FACTIONS[i].hull, SHIP_FACTIONS[i].sail),
      x: r.x + 40 + (i % 3) * ((r.w - 80) / 2), y: r.y + 34 + ((i / 3) | 0) * 50,
      vx: (roll() - 0.5) * 20, vy: (roll() - 0.5) * 10,
      dir: 2, frame: 0, hp: 100, sink: 0, name: SHIP_FACTIONS[i].name,
      p: w[i] / tot, faction: i, crew, rumbleT: 0, burnT: 0, ramTgt: null, ramCd: 2 + roll() * 3,
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
        if (a.stunT > 0) { a.stunT -= dt; a.frame = 0; break; }   // savoring the takedown
        const prey = it.actors.filter((x) => x.type === 'prey' && !x.down);
        if (!prey.length) break;
        let tgt = prey[0], best = 1e9;
        for (const p2 of prey) { const d2 = Math.hypot(p2.x - a.x, p2.y - a.y); if (d2 < best) { best = d2; tgt = p2; } }
        const dx = tgt.x - a.x, dy = tgt.y - a.y, d = Math.hypot(dx, dy) || 1;
        const sp = it.live?.kind === 'chase' ? a.speed * 1.1 : a.speed * 0.75;
        a.x += (dx / d) * sp * dt; a.y += (dy / d) * sp * dt;
        const rB = it.arena.rect;
        a.x = Math.max(rB.x + 14, Math.min(rB.x + rB.w - 14, a.x));
        a.y = Math.max(rB.y + 16, Math.min(rB.y + rB.h - 6, a.y));
        faceFromVel(a, dx, dy);
        stepAnim(a, dt, 0.11);
        if (d < 14 && !it.live && Math.random() < dt * 1.5) a.stunT = 0.8;   // ambient: toys with them
        break;
      }
      case 'prey': {
        if (a.down) { a.frame = 0; break; }
        const beast = it.actors.find((x) => x.type === 'beast');
        const r = it.arena.rect;
        // wandering: pick fresh waypoints through the middle of the sand
        a.wanderT = (a.wanderT ?? 0) - dt;
        if (a.wanderT <= 0 || !a.wander) {
          a.wanderT = 1.2 + roll() * 1.6;
          const mx = r.x + r.w / 2, my = r.y + r.h / 2;
          a.wander = {
            x: (mx + (roll() - 0.5) * r.w * 0.85) * 0.55 + mx * 0.45,
            y: (my + (roll() - 0.5) * r.h * 0.85) * 0.55 + my * 0.45,
          };
        }
        let dx = a.wander.x - a.x, dy = a.wander.y - a.y;
        let m = Math.hypot(dx, dy) || 1;
        dx /= m; dy /= m;
        // fear: blend in the flee vector, stronger the closer the beast is
        if (beast) {
          const bd = Math.hypot(a.x - beast.x, a.y - beast.y);
          if (bd < 8) {
            // point-blank: burst-dash sideways to break the overlap
            if (!a.dash) {
              const ang = Math.atan2(a.y - beast.y, a.x - beast.x) + (roll() < 0.5 ? 1 : -1) * 1.3;
              a.dash = { dx: Math.cos(ang), dy: Math.sin(ang), t: 0.45 };
            }
          } else if (bd < 90) {
            const fear = (1 - bd / 90) * 2.0;
            dx += ((a.x - beast.x) / bd) * fear;
            dy += ((a.y - beast.y) / bd) * fear;
          }
        }
        let sp = a.speed;
        if (a.dash) {
          a.dash.t -= dt;
          dx = a.dash.dx; dy = a.dash.dy; sp = a.speed * 1.6;
          if (a.dash.t <= 0) a.dash = null;
        }
        m = Math.hypot(dx, dy) || 1;
        a.x += (dx / m) * sp * dt; a.y += (dy / m) * sp * dt;
        a.x = Math.max(r.x + 10, Math.min(r.x + r.w - 10, a.x));
        a.y = Math.max(r.y + 14, Math.min(r.y + r.h - 4, a.y));
        faceFromVel(a, dx, dy);
        stepAnim(a, dt, 0.12);
        break;
      }
      case 'ship': {
        if (a.rumbleT > 0) a.rumbleT -= dt;
        if (a.burnT > 0) a.burnT -= dt;
        if (a.sink > 0) { a.sink += dt; break; }
        const r = it.arena.rect;
        if (a.ramTgt && (a.ramTgt.sink > 0 || !it.live)) a.ramTgt = null;
        if (a.ramTgt) {
          // ramming speed! bear straight down on the mark
          const dx = a.ramTgt.x - a.x, dy = a.ramTgt.y - a.y, d = Math.hypot(dx, dy) || 1;
          a.vx += (dx / d) * 60 * dt; a.vy += (dy / d) * 34 * dt;
          const v = Math.hypot(a.vx, a.vy) || 1;
          if (v > 38) { a.vx *= 38 / v; a.vy *= 38 / v; }
        } else {
          a.vx += (roll() - 0.5) * 26 * dt; a.vy += (roll() - 0.5) * 14 * dt;
          const vmax = it.live?.kind === 'naval' ? 26 : 16;
          const v = Math.hypot(a.vx, a.vy) || 1;
          if (v > vmax) { a.vx *= vmax / v; a.vy *= vmax / v; }
        }
        a.x += a.vx * dt; a.y += a.vy * dt;
        if (a.x < r.x + 28) { a.x = r.x + 28; a.vx = Math.abs(a.vx); }
        if (a.x > r.x + r.w - 28) { a.x = r.x + r.w - 28; a.vx = -Math.abs(a.vx); }
        if (a.y < r.y + 18) { a.y = r.y + 18; a.vy = Math.abs(a.vy); }
        if (a.y > r.y + r.h - 12) { a.y = r.y + r.h - 12; a.vy = -Math.abs(a.vy); }
        a.dir = a.vx < 0 ? 1 : 0;   // ship sheets: col 0 faces right, col 1 left
        stepAnim(a, dt, 0.4);
        // deck hands go about their business
        for (const c of a.crew || []) {
          c.wT -= dt;
          if (c.wT <= 0) { c.wT = 0.8 + roll() * 1.8; c.drift = (roll() - 0.5) * 14; c.dir = (roll() * 4) | 0; }
          if (Math.abs(c.drift) > 0.5) {
            const step = Math.sign(c.drift) * 9 * dt;
            c.ox = Math.max(-14, Math.min(13, c.ox + step));
            c.drift -= step;
            c.frame = ((a.t * 6 + c.ox) | 0) % 2;
            c.dir = c.drift > 0 ? 2 : 1;
          } else c.frame = 0;
        }
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
  let title, ico, choices, eventKind, sub = '';
  const fightChoices = (names, ps) => {
    const c = [
      { kind: 'winA', label: `${names[0]} wins`, ico: '🔴', p: ps.winA },
      { kind: 'winB', label: `${names[1]} wins`, ico: '🔵', p: ps.winB },
      { kind: 'ko', label: 'Finish by knockout', ico: '💥', p: ps.ko },
      { kind: 'dist', label: 'Goes the distance', ico: '🛎️', p: ps.dist },
    ];
    if (ps.r1 !== undefined) c.push({ kind: 'r1', label: 'Round 1 finish', ico: '1️⃣', p: ps.r1 });
    if (ps.double !== undefined) c.push({ kind: 'double', label: 'Both fighters dropped', ico: '🤕', p: ps.double });
    return c;
  };
  if (A.kind === 'fight') {
    if (!A.bout) A.bout = newBout('muay');
    A.fighters?.forEach((f, i) => { f.name = A.bout.names[i]; });
    title = 'Ringside Book'; ico = '🥊'; eventKind = 'fight';
    sub = `Tonight: <b>${escapeHtml(A.bout.names[0])}</b> vs <b>${escapeHtml(A.bout.names[1])}</b> · `;
    choices = fightChoices(A.bout.names, FIGHT_PROPS_P.muay);
  } else if (A.kind === 'race') {
    title = 'The Lucklian Stakes'; ico = '🏁'; eventKind = 'race';
    A.pendingField = newDownsField();
    choices = A.pendingField.map((r, i) => ({ label: `${r.name} · ${r.species}`, ico: '🐎', p: r.p, idx: i }));
  } else {
    const ev = A.program;
    title = PROGRAM_LABEL[ev]; ico = '🏟️';
    if (ev === 'chariots') {
      eventKind = 'race';
      A.pendingField = newChariotField();
      choices = A.pendingField.map((t2, i) => ({ label: t2.name, ico: '🏛️', p: t2.p, idx: i }));
    } else if (ev === 'gladiators') {
      eventKind = 'fight';
      if (!A.bout) A.bout = newBout('glad');
      sub = `On the sand: <b>${escapeHtml(A.bout.names[0])}</b> vs <b>${escapeHtml(A.bout.names[1])}</b> · `;
      choices = fightChoices(A.bout.names, FIGHT_PROPS_P.glad);
    } else if (ev === 'beasthunt') { eventKind = 'chase'; choices = BEAST_PROPS.map((p, i) => ({ ...p, idx: i })); }
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
    <div class="subtitle">${A.kind === 'coliseum' ? `Now on the sand: <b>${escapeHtml(PROGRAM_LABEL[A.program])}</b> · ` : ''}${sub}RTP ${(rtp * 100).toFixed(1)}% — pick your wager, then watch it play out</div>
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
    focus: it.arena.center, banner: null, resultShown: false, fx: [],
  };

  if (kind === 'fight') {
    const hit = roll() < choice.p;
    let winner = roll() < 0.5 ? 0 : 1;
    let method = roll() < 0.4 ? 'ko' : 'decision';
    let round = 1 + ((roll() * 3) | 0);
    if (choice.kind === 'winA') winner = hit ? 0 : 1;
    else if (choice.kind === 'winB') winner = hit ? 1 : 0;
    else if (choice.kind === 'ko') method = hit ? 'ko' : 'decision';
    else if (choice.kind === 'dist') method = hit ? 'decision' : 'ko';
    else if (choice.kind === 'r1') { method = hit ? 'ko' : (roll() < 0.5 ? 'ko' : 'decision'); round = hit ? 1 : 2 + ((roll() * 2) | 0); }
    else if (choice.kind === 'double') live.doubleDrop = hit;
    if (method === 'decision') round = 3;
    live.win = hit;
    const c = it.arena.center, r = it.arena.rect;
    live.fight = {
      winner, method, round, hp: [100, 100], roundNow: 1, roundT: 0, exchT: 0,
      attacker: 0, koDone: false,
      pairX: c.x, pairY: c.y + 4,             // the pair drifts around the ring
      tgtX: c.x, tgtY: c.y + 4, driftT: 0,
      rect: { x: r.x + 20, y: r.y + 22, w: r.w - 40, h: r.h - 30 },
    };
    const fighters = it.actors.filter((a) => a.type === 'fighter' && a.arena);
    live.fight.actors = fighters;
    fighters.forEach((f, i) => {
      f.hp = 100;
      f.origHomeX = f.homeX ?? f.x;
      f.origY = f.y;
      f.anim = null;
    });
  } else if (kind === 'race') {
    const field = it.arena.pendingField ||
      (it.arena.kind === 'race' ? newDownsField() : newChariotField());
    it.arena.pendingField = null;
    let r = roll(), winner = 0;
    for (let i = 0; i < field.length; i++) { r -= field[i].p; if (r <= 0) { winner = i; break; } }
    live.win = winner === choice.idx;
    const order = field.map((_, i) => i).filter((i) => i !== winner).sort(() => roll() - 0.5);
    order.unshift(winner);
    const times = {};
    order.forEach((idx, rank) => { times[idx] = 8.5 + rank * (0.55 + roll() * 0.4); });
    // drama tracks: swells and surges that fade before the wire, so mid-race
    // order shuffles (comebacks!) while the booked result still lands
    const drama = field.map(() => ({
      amp: 0.02 + roll() * 0.035,
      freq: 0.5 + roll() * 1.3,
      phase: roll() * Math.PI * 2,
      surgeT: 1.5 + roll() * 4,
      surgeLen: 1 + roll() * 1.6,
      surgeBoost: 0.05 + roll() * 0.07,
    }));
    live.race = { winner, field, times, drama, prog: field.map(() => 0), finished: [], started: false, gateT: 0 };
    /* conscript the ambient lappers and re-skin them as this card's field */
    const o = it.arena.oval;
    let lappers = it.actors.filter((a) => a.type === 'lapper' && a.arena);
    for (let i = lappers.length; i < field.length; i++) {
      it.addActor({ type: 'lapper', show: it.arena.kind !== 'race', arena: true, sprite: null, ang: 0, speed: 1, o, x: 0, y: 0, dir: 2, frame: 0 });
    }
    lappers = it.actors.filter((a) => a.type === 'lapper' && a.arena);
    field.forEach((f, i) => {
      const a = lappers[i];
      if (f.chariot) {
        a.sprite = makeCourserSprite({ body: '#3a3642', mane: '#c8ccd8', accent: '#e8a020' }, { chariot: true, teamColor: f.color });
      } else {
        const d = BY_ID.get(f.lkId);
        const pal = d ? { body: d.c[0], mane: d.c[1], accent: d.c[2] } : { body: '#8a5a2a', mane: '#4a3222', accent: '#e8dcc0' };
        a.sprite = makeCourserSprite(pal, { rider: f.rider || 'cowboy' });
      }
      a.race = { lane: i };
      a.raceIdx = i;
    });
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
    live.naval = { winner, ships, sinkTimes, shots: [], shotT: 0, swimmers: [] };
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
          f.anim = null; f.knock = null;
        });
        // a fresh matchup steps up for the next card
        it.arena.bout = newBout(it.arena.kind === 'fight' ? 'muay' : 'glad');
        live.fight.actors.forEach((f, i) => { f.name = it.arena.bout.names[i]; });
      }
      const keep = it.arena.ambientCount ?? 3;
      const lappers = it.actors.filter((a) => a.type === 'lapper' && a.arena);
      lappers.slice(keep).forEach((a) => { it.actors = it.actors.filter((x) => x !== a); });
      lappers.forEach((a) => { a.race = null; });
      if (it.arena.kind === 'coliseum') it.arena.programT = 20; // move the card along soon
    }
    return;
  }

  for (const f of live.fx) f.t += dt;
  live.fx = live.fx.filter((f) => f.t < 1.3);

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

  /* the pair works the ring: shared anchor drifts to fresh spots */
  F.driftT -= dt;
  if (F.driftT <= 0) {
    F.driftT = 1.4 + roll() * 1.6;
    const R = F.rect;
    F.tgtX = R.x + 12 + roll() * (R.w - 24);
    F.tgtY = R.y + 8 + roll() * (R.h - 14);
  }
  F.pairX += (F.tgtX - F.pairX) * Math.min(1, dt * 1.6);
  F.pairY += (F.tgtY - F.pairY) * Math.min(1, dt * 1.6);

  /* exchanges: pick a real technique with its own damage + animation */
  F.exchT += dt;
  if (F.exchT > 0.62) {
    F.exchT = 0;
    F.attacker = 1 - F.attacker;
    const atkIdx = F.attacker, defIdx = 1 - F.attacker;
    const atk = F.actors[atkIdx], def = F.actors[defIdx];
    const move = pickMove();
    atk.anim = { kind: move.anim, t: 0, dirTo: def.x >= atk.x ? 2 : 1 };
    def.hitT = 0.22;
    def.knock = { dx: def.x >= atk.x ? 5 : -5, t: 0.18 };
    const isLoser = defIdx !== F.winner;
    let dmg = move.dmg[0] + roll() * (move.dmg[1] - move.dmg[0]);
    dmg *= isLoser ? 1.25 : 0.6;
    if (F.roundNow === koRound && isLoser) dmg += 7;
    F.hp[defIdx] = Math.max(F.roundNow === 3 && F.method === 'decision' ? 22 : 0, F.hp[defIdx] - dmg);
    live.fx.push({ text: move.name.toUpperCase(), x: atk.x, y: atk.y - 26, t: 0, color: '#ffd75e' });
    live.fx.push({ text: `-${Math.round(dmg)}`, x: def.x + (roll() * 8 - 4), y: def.y - 18, t: 0, color: '#ff8a7a' });
    if (live.doubleDrop && F.roundNow === 2 && !F.dropped) {
      F.dropped = true;
      a.emote = { ico: '🤕', t: 1 }; b.emote = { ico: '🤕', t: 1 };
    }
  }

  /* position + per-move choreography */
  for (let i = 0; i < 2; i++) {
    const f = F.actors[i];
    const side = i === 0 ? -1 : 1;
    let ox = 0, oy = 0;
    if (f.anim) {
      f.anim.t += dt;
      const t2 = f.anim.t / 0.34;
      const pulse = Math.sin(Math.min(1, t2) * Math.PI);
      if (f.anim.kind === 'lunge') ox = (f.anim.dirTo === 2 ? 1 : -1) * 7 * pulse;
      else if (f.anim.kind === 'kick') { ox = (f.anim.dirTo === 2 ? 1 : -1) * 5 * pulse; f.frame = 1; }
      else if (f.anim.kind === 'hop') { ox = (f.anim.dirTo === 2 ? 1 : -1) * 6 * pulse; oy = -6 * pulse; }
      else if (f.anim.kind === 'spin') { ox = (f.anim.dirTo === 2 ? 1 : -1) * 6 * pulse; f.dir = [0, 1, 3, 2][((f.anim.t * 14) | 0) % 4]; }
      if (f.anim.t > 0.34) { f.anim = null; }
    }
    if (!f.anim) {
      f.frame = ((live.t * 7 + i) | 0) % 2;
      f.dir = side === -1 ? 2 : 1;    // square up, always facing each other
    }
    let kx = 0;
    if (f.knock) { f.knock.t -= dt; kx = f.knock.dx * Math.max(0, f.knock.t / 0.18); if (f.knock.t <= 0) f.knock = null; }
    f.x = F.pairX + side * (11 + Math.sin(live.t * 3 + i) * 2) + ox + kx;
    f.y = F.pairY + oy + Math.cos(live.t * 2.2 + i * 2) * 2;
  }
  live.focus = { x: F.pairX, y: F.pairY };

  const loserIdx = 1 - F.winner;
  if (F.roundNow === koRound && F.hp[loserIdx] <= 0 && !F.koDone) {
    F.koDone = true;
    const loser = F.actors[loserIdx], winner = F.actors[F.winner];
    loser.emote = { ico: '😵', t: 3 };
    loser.frame = 0; loser.dir = 0; loser.anim = null;
    winner.emote = { ico: '🏆', t: 3 };
    endSim(it, `${(winner.name || '').toUpperCase()} WINS BY KO — ROUND ${F.roundNow}`);
    return;
  }
  if (F.roundT > roundLen) {
    F.roundT = 0;
    F.roundNow++;
    if (F.roundNow > 3) {
      const winner = F.actors[F.winner];
      winner.emote = { ico: '🏆', t: 3 };
      endSim(it, `${(winner.name || '').toUpperCase()} TAKES THE DECISION`);
    }
  }
}

function updateRace(it, live, dt) {
  const R = live.race;
  const o = it.arena.oval;
  const startAng = Math.PI / 2;    // gates at the bottom of the oval
  if (!R.started) {
    R.gateT += dt;
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
  const t = live.raceT;
  const LAPS = 2;
  const winnerDone = R.finished.includes(R.winner);
  R.actors.forEach((a, i) => {
    if (R.prog[i] >= 1) { a.frame = 0; return; }
    const T = R.times[i];
    const base = Math.min(1, t / T);
    /* drama: swells and one big surge per runner, fading to nothing near
       the wire so the booked order re-asserts itself smoothly */
    const D = R.drama[i];
    const inSurge = t > D.surgeT && t < D.surgeT + D.surgeLen;
    let drama = D.amp * Math.sin(t * D.freq + D.phase) + (inSurge ? D.surgeBoost : 0);
    const fade = Math.max(0, Math.min(1, (1 - base) * 2.6)) * Math.min(1, base * 10);
    drama *= fade;
    drama = Math.max(-(1 - base) * 0.4, Math.min((1 - base) * 0.4, drama));
    let target = base + drama;
    if (i !== R.winner && !winnerDone) target = Math.min(target, 0.985);
    R.prog[i] = Math.min(1, Math.max(R.prog[i], target));
    const laneRx = o.rx - (i % 3) * 6, laneRy = o.ry - (i % 3) * 3;
    const ang = startAng + R.prog[i] * Math.PI * 2 * LAPS;
    const p = ovalPos({ ...o, rx: laneRx, ry: laneRy }, ang);
    a.x = p.x; a.y = p.y; a.ang = ang;
    faceFromVel(a, -Math.sin(ang) * laneRx, Math.cos(ang) * laneRy);
    stepAnim(a, dt, 0.1);
    if (R.prog[i] >= 1 && !R.finished.includes(i)) R.finished.push(i);
  });
  if (R.finished.length >= R.actors.length || live.raceT > 17) {
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

  /* scripted damage that respects the booked winner */
  const dealDamage = (to, want) => {
    const doomed = to !== N.winner;
    const timeLeft = doomed ? Math.max(0.4, (N.sinkTimes[to.faction] ?? 6) - elapsed) : 99;
    const dmg = doomed
      ? Math.min(to.hp, Math.max(want * 0.6, (to.hp / timeLeft) * (0.5 + roll() * 0.5)))
      : Math.max(0, Math.min(to.hp - 24, want * 0.55));
    if (dmg > 0) {
      to.hp -= dmg;
      to.hitT = 0.25;
      if (dmg >= 13) {
        to.rumbleT = 0.45;
        // a big hit throws a hand into the drink
        if (to.crew && to.crew.length > 1) {
          const man = to.crew.pop();
          N.swimmers.push({ x: to.x + man.ox, y: to.y - 4, t: 0, sprite: man.sprite, dir: 0 });
          live.fx.push({ text: 'MAN OVERBOARD!', x: to.x, y: to.y - 34, t: 0, color: '#8fd8ff' });
        }
      }
    }
    return dmg;
  };

  /* exchanges: bolts, stones, greek fire, cannonballs */
  if (N.shotT <= 0 && afloat.length > 1) {
    N.shotT = 0.55 + roll() * 0.5;
    const from = afloat[(roll() * afloat.length) | 0];
    let to = afloat[(roll() * afloat.length) | 0];
    if (to === from) to = afloat.find((s) => s !== from);
    if (to) {
      const rT = roll();
      const type = rT < 0.38 ? 'bolt' : rT < 0.62 ? 'stone' : rT < 0.82 ? 'fire' : 'cannon';
      N.shots.push({ type, x1: from.x, y1: from.y - 8, x2: to.x, y2: to.y - 6, t: 0, tgt: to });
    }
  }
  for (const sh of N.shots) {
    sh.t += dt * (sh.type === 'cannon' ? 4 : 2.6);
    if (sh.t >= 1 && !sh.landed) {
      sh.landed = true;
      const base = sh.type === 'bolt' ? 8 : sh.type === 'stone' ? 14 : sh.type === 'fire' ? 12 : 17;
      dealDamage(sh.tgt, base + roll() * 6);
      if (sh.type === 'fire') sh.tgt.burnT = 1.6;
    }
  }
  N.shots = N.shots.filter((sh) => sh.t < 1);

  /* ramming runs */
  for (const s2 of afloat) {
    if (!s2.ramTgt) {
      s2.ramCd -= dt;
      if (s2.ramCd <= 0 && afloat.length > 1 && roll() < 0.5) {
        const others = afloat.filter((x) => x !== s2);
        s2.ramTgt = others[(roll() * others.length) | 0];
        s2.ramCd = 4 + roll() * 4;
      } else if (s2.ramCd <= 0) s2.ramCd = 3 + roll() * 3;
    } else if (s2.ramTgt.sink > 0) {
      s2.ramTgt = null;
    } else if (Math.hypot(s2.ramTgt.x - s2.x, s2.ramTgt.y - s2.y) < 30) {
      const t2 = s2.ramTgt;
      s2.ramTgt = null;
      s2.rumbleT = 0.4;
      dealDamage(t2, 20 + roll() * 10);
      live.fx.push({ text: 'RAMMED!', x: t2.x, y: t2.y - 30, t: 0, color: '#ffd75e' });
      s2.vx = -s2.vx * 0.8; s2.vy = -s2.vy * 0.8;   // shear off after impact
    }
  }

  /* swimmers tread water, then slip under */
  for (const sw of N.swimmers) sw.t += dt;
  N.swimmers = N.swimmers.filter((sw) => sw.t < 5);

  /* scheduled sinkings */
  for (const s2 of N.ships) {
    if (s2.sink === 0 && s2 !== N.winner && elapsed > (N.sinkTimes[s2.faction] ?? 999)) {
      s2.hp = 0; s2.sink = 0.01;
      s2.emote = { ico: '🌊', t: 1.5 };
      // the crew goes into the water as she founders
      for (const man of s2.crew || []) {
        N.swimmers.push({ x: s2.x + man.ox, y: s2.y - 4, t: roll(), sprite: man.sprite, dir: 0 });
      }
      s2.crew = [];
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
    const needsBar = (live && !(a.sink > 0) && !a.down &&
      ((live.kind === 'fight' && a.type === 'fighter') ||
      (live.kind === 'chase' && a.type === 'prey') ||
      (live.kind === 'naval' && a.type === 'ship')));
    if (needsBar && a.hp !== undefined) {
      const w = (a.type === 'ship' ? 30 : 16) * zoom / 2;
      let frac = a.hp / 100;
      if (live.kind === 'fight') {
        const F = live.fight;
        frac = (F.actors[0] === a ? F.hp[0] : F.hp[1]) / 100;
      }
      const barY = Sy(a.y) - (a.type === 'ship' ? 34 : 26) * zoom / 2;
      hpBar(ctx, S(a.x) - w / 2, barY, w, Math.max(0, frac), zoom);
      if (a.name && (live.kind === 'fight' || live.kind === 'naval')) {
        ctx.font = font(7 * zoom / 2);
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 2;
        ctx.strokeText(a.name, S(a.x), barY - 3);
        ctx.fillStyle = '#f4ecd8';
        ctx.fillText(a.name, S(a.x), barY - 3);
      }
    }
  }

  /* naval: ballista bolts + sinking hulls handled in main's draw via sink field */
  if (live?.kind === 'naval') {
    for (const sh of live.naval.shots) {
      const arc = sh.type === 'cannon' ? 6 : sh.type === 'stone' ? 18 : 14;
      const x = sh.x1 + (sh.x2 - sh.x1) * sh.t, y = sh.y1 + (sh.y2 - sh.y1) * sh.t - Math.sin(sh.t * Math.PI) * arc;
      if (sh.type === 'bolt') {
        ctx.strokeStyle = '#ffe066'; ctx.lineWidth = zoom / 2;
        ctx.beginPath(); ctx.moveTo(S(x - 2), Sy(y + 1)); ctx.lineTo(S(x + 2), Sy(y - 1)); ctx.stroke();
      } else if (sh.type === 'stone') {
        ctx.fillStyle = '#9a948a';
        ctx.fillRect(S(x) - zoom, Sy(y) - zoom, zoom * 2, zoom * 2);
      } else if (sh.type === 'fire') {
        ctx.fillStyle = '#ff8a30';
        ctx.fillRect(S(x) - zoom, Sy(y) - zoom, zoom * 2, zoom * 2);
        ctx.fillStyle = 'rgba(255,200,80,0.7)';
        ctx.fillRect(S(x - 3 * (sh.x2 > sh.x1 ? 1 : -1)) - zoom / 2, Sy(y + 1), zoom, zoom);
        ctx.fillRect(S(x - 6 * (sh.x2 > sh.x1 ? 1 : -1)) - zoom / 2, Sy(y + 2), zoom, zoom);
      } else {
        ctx.fillStyle = '#26222c';
        ctx.fillRect(S(x) - zoom, Sy(y) - zoom, zoom * 2, zoom * 2);
      }
    }
    /* sailors in the drink: bobbing heads, ripples, then under */
    for (const sw of live.naval.swimmers) {
      const bob = Math.sin((now / 240) + sw.x) * 1.5;
      const alpha = sw.t > 3.8 ? Math.max(0, 1 - (sw.t - 3.8) / 1.2) : 1;
      ctx.globalAlpha = alpha;
      ctx.drawImage(sw.sprite, 0, 0, 16, 9, S(sw.x) - 4 * zoom / 2, Sy(sw.y + bob) - 4 * zoom / 2, 8 * zoom / 2, 4.5 * zoom / 2);
      ctx.fillStyle = 'rgba(220,240,250,0.5)';
      ctx.fillRect(S(sw.x) - 5 * zoom / 2, Sy(sw.y + 3), 10 * zoom / 2, zoom / 2);
      ctx.globalAlpha = 1;
    }
  }

  /* fires burning on struck hulls */
  for (const a of it.actors) {
    if (a.type === 'ship' && a.burnT > 0 && a.sink === 0) {
      for (let k = 0; k < 3; k++) {
        const fx2 = a.x - 10 + k * 9 + ((now / 90 + k) % 3);
        const fy2 = a.y - 14 - ((now / 130 + k * 7) % 5);
        ctx.fillStyle = k % 2 ? '#ff8a30' : '#ffd75e';
        ctx.fillRect(S(fx2), Sy(fy2), zoom, zoom);
      }
    }
  }

  /* floating move names and damage numbers */
  if (live) {
    for (const f of live.fx) {
      ctx.globalAlpha = Math.max(0, 1 - f.t / 1.3);
      ctx.font = font(8 * zoom / 2);
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 2;
      const fy3 = Sy(f.y - f.t * 14);
      ctx.strokeText(f.text, S(f.x), fy3);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, S(f.x), fy3);
      ctx.globalAlpha = 1;
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
