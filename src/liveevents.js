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

import { CONFIG } from './config.js';
import { TILE, T } from './world.js';
import { roll, hash2 } from './rng.js';
import { state, spend, payout, effectiveRTP, grantLuck } from './state.js';
import { showModal, closeModal, escapeHtml, toast, renderBalance, buildBetRow } from './ui.js';
import { GAME_DEFS, lanternWindow, lanternPrizes, LANTERN_FOLK } from './games.js';
import { makeDrama, stepRacer } from './racing.js';
import { makeCourserSprite, makeBigCatSprite, makeShipSprite, makeCharSprite, makeDragonBoatSprite, makeSumoSprite, makeKiteSprite, getLucklianSprite } from './sprites.js';
import { BY_ID, LUCKLIANS, ownedCount } from './lucklians.js';

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
const REGATTA_TEAMS = [
  ['Azure Serpent', '#3f6ac8'], ['Gilded Pearl', '#e8b830'], ['Thunder Drum', '#8a2a5a'],
  ['River Ghost', '#8a94a0'], ['Jade Typhoon', '#2f8a5c'], ['Crimson Carp', '#c43a2a'],
  ['Moon Lotus', '#b8a8d8'], ['Iron Junk', '#5a5652'], ['Silk Lightning', '#e88ab0'],
  ['Old Dragon', '#6a3a1a'], ['Nine Oars', '#9ac82a'], ['Whirlpool', '#2fa8a0'],
];
const RIKISHI_NAMES = [
  'Yamakaze', 'Ōnami the Great Wave', 'Tetsuzan', 'Kumogatari', 'Little Comet',
  'Harukaze', 'Mochizuki', 'The Neon Mountain', 'Tanukiyama', 'Steambun',
  'Thunderhill', 'The Polite Avalanche', 'Koban-zeki', 'Grandmother\'s Favourite',
];
const MAWASHI = ['#8a2030', '#2a4a9a', '#2f7a5a', '#e8a020', '#5a2a5a', '#26222c', '#c96ad4', '#3fb0a0'];
const SUMO_MOVES = ['OSHIDASHI!', 'YORIKIRI!', 'UWATENAGE!', 'TSUKIOTOSHI!', 'HATAKIKOMI!', 'SLAP FLURRY!', 'THE POLITE NUDGE!'];
const KITE_NAMES = [
  'Paper Tiger', "The Widow's Razor", 'Old Thunder', 'Butterfly of Doom',
  'Iron Silk', "Grandfather's Regret", 'The Hissing Swan', 'Nine-Tailed Ribbon',
  'The Unlicensed Phoenix', 'Humble Diamond', 'The Tax Collector', 'Whispering Blade',
];
const KITE_COLORS = ['#c43a2a', '#2a4a9a', '#e8a020', '#2f8a5c', '#8a2a5a', '#e88ab0', '#26222c', '#3fb0a0'];
const KITE_WINDS = [
  { id: 'calm', label: 'A polite breeze', ico: '🍃', w: 5, props: { winA: 0.52, winB: 0.48, double: 0.06, runaway: 0.10 } },
  { id: 'gusty', label: 'Gusting hard', ico: '🌬️', w: 4, props: { winA: 0.52, winB: 0.48, double: 0.10, runaway: 0.18 } },
  { id: 'typhoon', label: "Typhoon's edge", ico: '🌀', w: 2, props: { winA: 0.50, winB: 0.50, double: 0.16, runaway: 0.30 } },
];
const KARAOKE_SINGERS = [
  'DJ Tanuki', 'Miki Starlight', 'Neon Grandpa', 'Sakura Static', 'Kappa Kid',
  'Momo Volt', 'Little Enka', 'Vending Machine Vinnie', 'Glitter Shark', 'Yuzu Boy',
  'Madame Metronome', 'Pachinko Patti',
];
const KARAOKE_SONGS = [
  'Neon Heart Shinkansen', 'Tears of the Vending Machine', 'Mushroom Boogie 3AM',
  'Koi in the Rain', 'My Cat Owns This Town', 'Last Train to Luckland',
  '10,000 Koban Moon', 'Static Love (Remix)', 'Sardine Nights', 'Karaoke Forever',
  'Umbrella for Two (and a Ghost)', 'Big in Dragonia',
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
/* a fresh regatta card: four crews off the bay */
function newRegattaField() {
  const crews = pickN(REGATTA_TEAMS, 4);
  const ps = shuffled([0.30, 0.26, 0.24, 0.20]);
  return crews.map(([cname, hex], i) => ({ name: cname, color: hex, p: ps[i], boat: true }));
}
/* a fresh sing-off: two performers, two songs */
function newKaraokeBout() {
  const [a, b] = pickN(KARAOKE_SINGERS, 2);
  const [sa, sb] = pickN(KARAOKE_SONGS, 2);
  return { names: [a, b], songs: [sa, sb] };
}
const KARAOKE_PROPS_P = { winA: 0.52, winB: 0.48, singalong: 0.40, encore: 0.25, micdrop: 0.30, streak: 0.18 };
const KARAOKE_MOVES = [
  { name: 'HIGH NOTE', pts: [6, 11], w: 12 }, { name: 'KEY CHANGE', pts: [7, 12], w: 8 },
  { name: 'FALSETTO', pts: [4, 9], w: 12 }, { name: 'RAP BREAK', pts: [5, 10], w: 10 },
  { name: 'DANCE BREAK', pts: [5, 9], w: 10 }, { name: 'CROWD WAVE', pts: [3, 8], w: 12 },
  { name: 'WHISTLE NOTE', pts: [8, 13], w: 5 }, { name: 'POWER SLIDE', pts: [6, 10], w: 7 },
  { name: 'AIR GUITAR', pts: [2, 6], w: 9 }, { name: 'SPARKLE CANNON', pts: [9, 14], w: 3 },
];
/* the beasts' arts — claws, horns and drama */
const BEAST_MOVES = [
  { name: 'POUNCE', dmg: [6, 11], w: 14 }, { name: 'RAKE', dmg: [4, 8], w: 16 },
  { name: 'BITE', dmg: [5, 10], w: 14 }, { name: 'TAIL LASH', dmg: [3, 7], w: 12 },
  { name: 'GORE', dmg: [8, 13], w: 7 }, { name: 'SCREECH', dmg: [2, 5], w: 10 },
  { name: 'BODY SLAM', dmg: [7, 12], w: 8 }, { name: 'DEATH ROLL', dmg: [9, 15], w: 4 },
];
function pickFrom(bank) {
  let tot = 0; for (const m of bank) tot += m.w;
  let r = roll() * tot;
  for (const m of bank) { r -= m.w; if (r <= 0) return m; }
  return bank[0];
}

/* a Lucklian blown up into an arena combatant: 2 columns (right, left-mirrored) */
function beastSprite(def) {
  const src = getLucklianSprite(def);
  const SCALE = 1.6;
  const CW = Math.ceil(src.width * SCALE), CH = Math.ceil(src.height * SCALE);
  const cv = document.createElement('canvas');
  cv.width = CW * 2; cv.height = CH;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, CW, CH);
  ctx.save();
  ctx.translate(CW * 2, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0, CW, CH);
  ctx.restore();
  cv.cellW = CW; cv.cellH = CH;
  return cv;
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
export function updateLive(it, dt, now, player) {
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

  // self-running arenas: the basho rolls on, the bog watches your boots
  if (A.kind === 'sumo') tickBasho(it, dt);
  if (A.kind === 'bog' && player) tickBog(it, dt, player);
  if (A.kind === 'kites' && !A.duel) newKiteDuel(it);   // kites aloft from the first visit

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
      case 'boat': {     // dragon boats: bob at moorings until the race takes over
        if (it.live && it.live.kind === 'race' && a.race) break;   // sim steers it
        a.x = a.homeX + Math.sin(a.t * 0.7 + a.lane) * 6;
        a.y = a.homeY + Math.sin(a.t * 1.1 + a.lane * 2) * 2.5;
        a.dir = 0;
        stepAnim(a, dt, 0.55);          // lazy warm-up strokes
        for (const c of a.crew || []) c.frame = a.frame;
        break;
      }
      case 'singer': {   // stage sway between sets — the sim choreographs the duel
        if (it.live && it.live.kind === 'karaoke') break;
        a.homeX = a.homeX ?? a.x;
        a.x = a.homeX + Math.sin(a.t * 1.6) * 4;
        a.frame = ((a.t * 2.4) | 0) % 2;
        if (!a.emote && Math.random() < dt * 0.25) a.emote = { ico: '🎵', t: 1 };
        break;
      }
      case 'rikishi': {  // waits on the bench; the basho engine walks it to the ring
        if (a.ctl) break;                          // a bout has it
        a.frame = 0;
        if (!a.emote && Math.random() < dt * 0.05) a.emote = { ico: ['🧂', '💪', '😤'][(Math.random() * 3) | 0], t: 1.2 };
        break;
      }
      case 'kite': {     // lazy ambient swoops over the sky court
        if (a.ctl) break;                          // the duel sim is flying it
        const R = it.arena.rect;
        const nx = R.x + R.w / 2 + Math.sin(a.t * 0.55 + a.ph) * (R.w * 0.36);
        const ny = R.y + R.h / 2 + Math.sin(a.t * 0.9 + a.ph * 2) * (R.h * 0.32);
        a.dir = nx < a.x ? 0 : 1;
        a.x = nx; a.y = ny;
        stepAnim(a, dt, 0.22);
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
  if (st.game === 'ownersrace') return openOwnersRace(it, st, provCode);
  if (st.game === 'beastbout') return openBeastBout(it, st, provCode);
  if (st.game === 'sumobracket') return openBashoBook(it, st, provCode);
  if (st.game === 'bogwisp') return openBogGate(it, st, provCode);
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
  } else if (A.kind === 'regatta') {
    title = 'The Grand Regatta'; ico = '🐉'; eventKind = 'race';
    A.pendingField = newRegattaField();
    sub = 'Four crews, one bay · ';
    choices = A.pendingField.map((r, i) => ({ label: r.name, ico: '🛶', p: r.p, idx: i }));
  } else if (A.kind === 'kites') {
    if (!A.duel) newKiteDuel(it);
    if (!A.wind) A.wind = weightedPick2(KITE_WINDS);
    title = "String-Cutter's Book"; ico = '🪁'; eventKind = 'kites';
    const P = A.wind.props;
    const [ka, kb] = A.duel;
    sub = `${A.wind.ico} <b>${escapeHtml(A.wind.label)}</b> · <b>${escapeHtml(ka.name)}</b> vs <b>${escapeHtml(kb.name)}</b> · `;
    choices = [
      { kind: 'winA', label: `${ka.name} cuts first`, ico: '✂️', p: P.winA },
      { kind: 'winB', label: `${kb.name} cuts first`, ico: '✂️', p: P.winB },
      { kind: 'double', label: 'Both strings part', ico: '💥', p: P.double },
      { kind: 'runaway', label: 'A kite escapes on the wind', ico: '🎐', p: P.runaway },
    ];
  } else if (A.kind === 'karaoke') {
    if (!A.bout) A.bout = newKaraokeBout();
    A.singers?.forEach((s, i) => { s.name = A.bout.names[i]; });
    title = 'The Neon Mic'; ico = '🎤'; eventKind = 'karaoke';
    const P = KARAOKE_PROPS_P;
    sub = `Tonight: <b>${escapeHtml(A.bout.names[0])}</b> sings “${escapeHtml(A.bout.songs[0])}” vs <b>${escapeHtml(A.bout.names[1])}</b> with “${escapeHtml(A.bout.songs[1])}” · `;
    choices = [
      { kind: 'winA', label: `${A.bout.names[0]} takes the room`, ico: '💗', p: P.winA },
      { kind: 'winB', label: `${A.bout.names[1]} takes the room`, ico: '💙', p: P.winB },
      { kind: 'singalong', label: 'The whole bar sings along', ico: '🎶', p: P.singalong },
      { kind: 'encore', label: 'The room demands an encore', ico: '🔁', p: P.encore },
      { kind: 'micdrop', label: 'Mic-drop finish', ico: '🎤', p: P.micdrop },
      { kind: 'streak', label: 'A perfect high-note streak', ico: '💫', p: P.streak },
    ];
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
   Owners' entries — race or fight a Lucklian of your OWN.
   The creature is never at risk; it earns its keep. Odds are
   derived from the species' face value and priced at RTP / p.
   ============================================================ */
const RUNNER_ARCH = ['quad', 'hare', 'fox', 'deer', 'feline', 'ram', 'rodent', 'primate', 'lizard'];
const NO_SAND_ARCH = ['fish', 'ceph', 'ray', 'seal'];   // nothing that needs water on the sand

function ownedEligible(pred) {
  return LUCKLIANS.filter((l) => pred(l) && ownedCount(l.id) > 0);
}
function lkImg(def, px2 = 30) {
  return `<img src="${getLucklianSprite(def).toDataURL()}" style="width:${px2}px;height:auto;image-rendering:pixelated" alt="">`;
}

/* speed from pedigree: pricier species run truer, capped so races stay races */
function ownerRaceP(def) {
  return Math.min(0.42, Math.max(0.15, 0.14 + 0.30 * (1 - Math.exp(-def.value / 600))));
}

function openOwnersRace(it, st, provCode) {
  const mine = ownedEligible((l) => RUNNER_ARCH.includes(l.a));
  if (!mine.length) {
    toast("🏇 The stewards look you over: “No runner, no race.” Catch a courser-shaped Lucklian first.");
    return;
  }
  const rtp = effectiveRTP('ownersrace', provCode);
  const m = showModal(`
    <h2>🏇 The Owners' Gate</h2>
    <div class="subtitle">Enter a Lucklian of your own in a live race. It runs, you collect — it is never at risk.</div>
    <div id="og-list"></div>
  `);
  const box = m.querySelector('#og-list');
  mine.forEach((def) => {
    const p = ownerRaceP(def);
    const row = document.createElement('div');
    row.className = 'race-lane race-pick-btn';
    row.innerHTML = `<span style="flex:1;text-align:left;display:flex;align-items:center;gap:8px">${lkImg(def)} ${escapeHtml(def.name)}</span>
      <span class="odds">${fmtMult(rtp / p)}x to win</span>`;
    row.addEventListener('click', () => pickRunner(def));
    box.appendChild(row);
  });

  function pickRunner(def) {
    const pYou = ownerRaceP(def);
    const house = newDownsField().slice(0, 5);
    const S = house.reduce((a, r) => a + r.p, 0);
    house.forEach((r) => { r.p = r.p * (1 - pYou) / S; });
    const field = [{ name: `${def.name} (YOURS)`, species: def.name, lkId: def.id, p: pYou, rider: 'cowboy', yours: true }, ...house];
    let bet = state.lastBet;
    const m2 = showModal(`
      <h2>🏇 ${escapeHtml(def.name)} goes under starter's orders</h2>
      <div class="subtitle">RTP ${(rtp * 100).toFixed(1)}% — back any runner, then watch the race live</div>
      <div id="og-field"></div>
      <div id="og-bet"></div>
    `);
    buildBetRow(m2.querySelector('#og-bet'), (v) => { bet = v; });
    const fbox = m2.querySelector('#og-field');
    field.forEach((r, i) => {
      const row = document.createElement('div');
      row.className = 'race-lane race-pick-btn';
      row.innerHTML = `<span style="flex:1;text-align:left;${r.yours ? 'color:var(--gold-ink);font-weight:700' : ''}">${r.yours ? '⭐' : '🐎'} ${escapeHtml(r.name)}${r.yours ? '' : ` · ${escapeHtml(r.species)}`}</span>
        <span class="odds">${fmtMult(rtp / r.p)}x</span>`;
      row.addEventListener('click', () => {
        if (state.balance < bet) { toast('Not enough coins!'); return; }
        spend(bet);
        state.stats.gamesPlayed++;
        renderBalance();
        closeModal();
        it.arena.pendingField = field;
        startSim(it, 'race', { label: r.name, p: r.p, idx: i }, bet, rtp);
      });
      fbox.appendChild(row);
    });
  }
}

function openBeastBout(it, st, provCode) {
  const mine = ownedEligible((l) => !NO_SAND_ARCH.includes(l.a));
  if (!mine.length) {
    toast('🐆 The bestiarius shrugs: “Bring me a beast and we\'ll talk.” Catch a Lucklian first.');
    return;
  }
  const rtp = effectiveRTP('beastbout', provCode);
  const m = showModal(`
    <h2>🐆 The Bestiarius Gate</h2>
    <div class="subtitle">Pit a Lucklian of your own against the house's beast. Yours walks away whatever happens.</div>
    <div id="bb-list"></div>
  `);
  const box = m.querySelector('#bb-list');
  mine.forEach((def) => {
    const row = document.createElement('div');
    row.className = 'race-lane race-pick-btn';
    row.innerHTML = `<span style="flex:1;text-align:left;display:flex;align-items:center;gap:8px">${lkImg(def)} ${escapeHtml(def.name)}</span>
      <span class="odds">worth ${fmt(def.value)}</span>`;
    row.addEventListener('click', () => pickBeast(def));
    box.appendChild(row);
  });

  function pickBeast(def) {
    // the house matches your champion pound-for-pound where it can
    let cands = LUCKLIANS.filter((l) => !NO_SAND_ARCH.includes(l.a) && l.id !== def.id &&
      l.value >= def.value * 0.45 && l.value <= def.value * 2.2);
    if (!cands.length) cands = LUCKLIANS.filter((l) => !NO_SAND_ARCH.includes(l.a) && l.id !== def.id);
    const house = cands[(roll() * cands.length) | 0];
    const pYou = Math.min(0.85, Math.max(0.15, def.value / (def.value + house.value)));
    const choices = [
      { kind: 'winYou', label: `${def.name} (YOURS) wins`, ico: '⭐', p: pYou },
      { kind: 'winHouse', label: `${house.name} (house) wins`, ico: '🏛️', p: 1 - pYou },
      { kind: 'firstblood', label: 'First blood to yours', ico: '🩸', p: 0.5 },
    ];
    let bet = state.lastBet;
    const m2 = showModal(`
      <h2>🐆 ${escapeHtml(def.name)} vs ${escapeHtml(house.name)}</h2>
      <div class="subtitle">The editor draws the card · RTP ${(rtp * 100).toFixed(1)}% — pick your wager, then watch the sand</div>
      <div style="display:flex;justify-content:center;gap:22px;margin:6px 0">${lkImg(def, 46)}<span style="align-self:center;font-weight:700">VS</span>${lkImg(house, 46)}</div>
      <div id="bb-choices"></div>
      <div id="bb-bet"></div>
    `);
    buildBetRow(m2.querySelector('#bb-bet'), (v) => { bet = v; });
    const cbox = m2.querySelector('#bb-choices');
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
        it.arena.pendingBB = { you: def, house, pYou };
        startSim(it, 'bbout', c, bet, rtp);
      });
      cbox.appendChild(row);
    });
  }
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
      (it.arena.kind === 'race' ? newDownsField()
        : it.arena.kind === 'regatta' ? newRegattaField() : newChariotField());
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
    const drama = field.map(() => makeDrama(roll));
    live.race = { winner, field, times, drama, prog: field.map(() => 0), finished: [], started: false, gateT: 0 };
    if (it.arena.kind === 'regatta') {
      /* the moored fleet paints up in this card's colours */
      const boats = it.actors.filter((a) => a.type === 'boat');
      field.forEach((f, i) => {
        const a = boats[i];
        if (!a) return;
        a.sprite = makeDragonBoatSprite(f.color);
        a.race = { lane: i };
        a.raceIdx = i;
      });
      live.race.actors = boats.slice(0, field.length);
    } else {
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
    }
  } else if (kind === 'karaoke') {
    const P = KARAOKE_PROPS_P;
    const hit = roll() < choice.p;
    let winner = roll() < P.winA ? 0 : 1;
    if (choice.kind === 'winA') winner = hit ? 0 : 1;
    else if (choice.kind === 'winB') winner = hit ? 1 : 0;
    const flag = (k) => (choice.kind === k ? hit : roll() < P[k]);
    live.win = hit;
    live.kar = {
      winner,
      singalong: flag('singalong'), encore: flag('encore'),
      micdrop: flag('micdrop'), streak: flag('streak'),
      hype: [10, 10], verse: 1, verseT: 0, exchT: 0, turn: (roll() * 2) | 0,
      streakDone: false, singDone: false,
      singers: it.arena.singers,
    };
    it.arena.singers?.forEach((s) => { s.homeX = s.homeX ?? s.x; });
  } else if (kind === 'bbout') {
    const BB = it.arena.pendingBB;
    it.arena.pendingBB = null;
    const hit = roll() < choice.p;
    let winner = roll() < BB.pYou ? 0 : 1;    // 0 = yours, 1 = house
    if (choice.kind === 'winYou') winner = hit ? 0 : 1;
    else if (choice.kind === 'winHouse') winner = hit ? 1 : 0;
    const firstBlood = choice.kind === 'firstblood' ? (hit ? 0 : 1) : ((roll() * 2) | 0);
    live.win = hit;
    // the sand clears for the private card
    it.arena.savedProgram = it.arena.program;
    if (it.arena.kind === 'coliseum') clearShow(it);
    const c = it.arena.center;
    const mk = (def, side) => {
      const a = {
        type: 'bbeast', show: true, arena: true, sprite: beastSprite(def),
        x: c.x + side * 22, y: c.y + 4, dir: side === -1 ? 0 : 1, frame: 0,
        hp: 100, name: side === -1 ? `${def.name} ★` : def.name, def,
      };
      it.actors.push(a);
      return a;
    };
    live.bb = {
      winner, firstBlood, firstDone: false,
      actors: [mk(BB.you, -1), mk(BB.house, 1)],
      hp: [100, 100], exchT: 0.8, attacker: firstBlood, t: 0,
      pairX: c.x, pairY: c.y + 4, tgtX: c.x, tgtY: c.y + 4, driftT: 0,
      rect: { x: it.arena.rect.x + 26, y: it.arena.rect.y + 26, w: it.arena.rect.w - 52, h: it.arena.rect.h - 36 },
      koAt: 12 + roll() * 3,
    };
  } else if (kind === 'kites') {
    const P = it.arena.wind.props;
    const hit = roll() < choice.p;
    const flag = (k) => (choice.kind === k ? hit : roll() < P[k]);
    let winner = roll() < P.winA ? 0 : 1;   // the kite that SURVIVES (cuts the other)
    if (choice.kind === 'winA') winner = hit ? 0 : 1;
    else if (choice.kind === 'winB') winner = hit ? 1 : 0;
    live.win = hit;
    live.kite = {
      winner, double: flag('double'), runaway: flag('runaway'),
      cutAt: 10.5 + roll() * 3, clashes: [2.5, 5.2, 8], ci: 0, cutDone: false,
    };
    it.actors.filter((a) => a.type === 'kite').forEach((a) => { a.ctl = true; a.state = 'fly'; a.vx = 0; a.vy = 0; });
  } else if (kind === 'sumo') {
    // the bout itself is run by the basho engine; the sim just rides it
    live.sumo = { side: choice.side, key: choice.key, settled: false };
    live.focus = it.arena.center;
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
      it.actors.filter((a) => a.type === 'boat').forEach((a) => { a.race = null; });
      if (live.kind === 'karaoke') {
        // fresh names step up to the mic for the next card
        it.arena.bout = newKaraokeBout();
        it.arena.singers?.forEach((s, i) => { s.name = it.arena.bout.names[i]; s.anim = null; if (s.homeY !== undefined) s.y = s.homeY; });
      }
      if (live.kind === 'bbout') {
        // the private card ends: clear the beasts, resume the programme
        it.actors = it.actors.filter((a) => a.type !== 'bbeast');
        if (it.arena.kind === 'coliseum') setProgram(it, it.arena.savedProgram || 'chariots');
      }
      if (live.kind === 'kites') {
        // fresh kites, fresh names, fresh wind for the next duel
        it.actors.filter((a) => a.type === 'kite').forEach((a) => { a.ctl = false; a.state = null; a.cut = false; });
        newKiteDuel(it);
        it.arena.wind = null;
      }
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
  else if (live.kind === 'karaoke') updateKaraoke(it, live, dt);
  else if (live.kind === 'bbout') updateBeastBout(it, live, dt);
  else if (live.kind === 'kites') updateKitesSim(it, live, dt);
  else if (live.kind === 'sumo') updateSumoSim(it, live, dt);
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

/* the regatta: a straight sprint down the bay, drummed off the line */
function updateRegattaRace(it, live, dt) {
  const R = live.race;
  const C = it.arena.course;
  if (!R.started) {
    R.gateT += dt;
    R.actors.forEach((a, i) => {
      // paddle up to the line at a steady speed — no lurching from the moorings
      const parked = glideTo(a, C.x0, C.laneY(i), 220, dt);
      a.dir = 0;
      if (parked) a.frame = 0; else stepAnim(a, dt, 0.3);
      for (const c2 of a.crew || []) c2.frame = a.frame;
    });
    if (R.gateT > 1.1 && !R.drummed) { R.drummed = true; live.fx.push({ text: '🥁 DOOM… DOOM…', x: C.x0, y: it.arena.rect.y + 6, t: 0, color: '#ffd75e' }); }
    if (R.gateT > 2.4) {
      R.started = true; live.raceT = 0;
      live.fx.push({ text: 'PADDLES IN!', x: (C.x0 + C.x1) / 2, y: it.arena.rect.y + 6, t: 0, color: '#ffd75e' });
    }
    return;
  }
  live.raceT = (live.raceT || 0) + dt;
  const t = live.raceT;
  const winnerDone = R.finished.includes(R.winner);
  R.drumT = (R.drumT || 0) - dt;
  if (R.drumT <= 0) {
    R.drumT = 0.9;
    const lead = R.prog.indexOf(Math.max(...R.prog));
    const a = R.actors[lead];
    if (a) live.fx.push({ text: '♪', x: a.x - 14, y: a.y - 16, t: 0.4, color: '#ffd75e' });
  }
  R.actors.forEach((a, i) => {
    if (R.prog[i] >= 1) { a.frame = 0; (a.crew || []).forEach((c2) => { c2.frame = 0; }); return; }
    R.prog[i] = stepRacer(R.prog[i], t, R.times[i], R.drama[i], dt, i === R.winner, winnerDone);
    a.x = C.x0 + R.prog[i] * (C.x1 - C.x0);
    // the hull's roll eases in from the line rather than snapping on
    a.y = C.laneY(i) + Math.sin(t * 5 + i * 2) * 1.5 * Math.min(1, t);
    a.dir = 0;
    stepAnim(a, dt, 0.16);                       // paddles digging hard
    (a.crew || []).forEach((c2) => { c2.frame = a.frame; c2.dir = 2; });
    if (R.prog[i] >= 1 && !R.finished.includes(i)) {
      R.finished.push(i);
      live.fx.push({ text: `${R.field[i].name} ACROSS!`, x: C.x1, y: a.y - 18, t: 0, color: '#8fdc9a' });
    }
  });
  const leadProg = Math.max(...R.prog);
  live.focus = { x: C.x0 + leadProg * (C.x1 - C.x0), y: it.arena.center.y };
  if (R.finished.length >= R.actors.length || live.raceT > 17) {
    endSim(it, `🐉 ${R.field[R.winner].name.toUpperCase()} TAKES THE BAY!`);
  }
}

/* One racer's lane on the oval, used by BOTH the gates and the race
   itself — if these ever disagree, the field snaps at the off. */
function ovalLane(o, i) {
  return { ...o, rx: o.rx - (i % 3) * 6, ry: o.ry - (i % 3) * 3 };
}
const laneStagger = (i) => -i * 0.03;   // a hair apart at the line, and all race long

/* Walk an actor toward a point at a capped speed. A proportional ease
   lurches when the actor starts far away; a speed limit never does. */
function glideTo(a, tx, ty, speed, dt) {
  const dx = tx - a.x, dy = ty - a.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.5) { a.x = tx; a.y = ty; return true; }
  const step = Math.min(d, speed * dt);
  a.x += (dx / d) * step;
  a.y += (dy / d) * step;
  return false;
}

function updateRace(it, live, dt) {
  if (it.arena.kind === 'regatta') return updateRegattaRace(it, live, dt);
  const R = live.race;
  const o = it.arena.oval;
  const startAng = Math.PI / 2;    // gates at the bottom of the oval
  if (!R.started) {
    R.gateT += dt;
    R.actors.forEach((a, i) => {
      // walk onto the EXACT spot the race will start them from, at a
      // capped speed so a runner coming from the far turn never lurches
      const ang = startAng + laneStagger(i);
      const gate = ovalPos(ovalLane(o, i), ang);
      const parked = glideTo(a, gate.x, gate.y, 300, dt);
      a.dir = 2;
      if (parked) a.frame = 0; else stepAnim(a, dt, 0.16);
      a.ang = ang;
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
    // smooth, monotone, rate-limited: drama shuffles the order without
    // ever skipping a runner across the track
    R.prog[i] = stepRacer(R.prog[i], t, R.times[i], R.drama[i], dt, i === R.winner, winnerDone);
    const lane = ovalLane(o, i);
    const ang = startAng + laneStagger(i) + R.prog[i] * Math.PI * 2 * LAPS;
    const p = ovalPos(lane, ang);
    a.x = p.x; a.y = p.y; a.ang = ang;
    faceFromVel(a, -Math.sin(ang) * lane.rx, Math.cos(ang) * lane.ry);
    stepAnim(a, dt, 0.1);
    if (R.prog[i] >= 1 && !R.finished.includes(i)) R.finished.push(i);
  });
  if (R.finished.length >= R.actors.length || live.raceT > 19) {
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

/* the sing-off: verses trade blows on the hype meters instead of health */
function updateKaraoke(it, live, dt) {
  const K = live.kar;
  const [a, b] = K.singers || [];
  if (!a || !b) { endSim(it, 'The set is over.'); return; }
  K.verseT += dt;
  const VERSE_LEN = 5.4;

  K.exchT += dt;
  if (K.exchT > 1.05) {
    K.exchT = 0;
    K.turn = 1 - K.turn;
    const singer = K.singers[K.turn];
    const move = pickFrom(KARAOKE_MOVES);
    let pts = move.pts[0] + roll() * (move.pts[1] - move.pts[0]);
    pts *= K.turn === K.winner ? 1.3 : 0.78;
    if (K.streak && K.turn === K.winner && K.verse === 2 && !K.streakDone) {
      K.streakDone = true;
      pts += 12;
      live.fx.push({ text: '💫 PERFECT STREAK!', x: singer.x, y: singer.y - 34, t: 0, color: '#ff6be0' });
    }
    K.hype[K.turn] = Math.min(100, K.hype[K.turn] + pts);
    singer.anim = { t: 0 };
    singer.emote = { ico: ['🎵', '🎶', '✨'][(roll() * 3) | 0], t: 0.7 };
    live.fx.push({ text: move.name, x: singer.x, y: singer.y - 26, t: 0, color: '#ffd75e' });
    live.fx.push({ text: `+${Math.round(pts)}`, x: singer.x + (roll() * 10 - 5), y: singer.y - 18, t: 0, color: '#8fdc9a' });
  }

  /* stagecraft: the active singer works the boards, the other sways */
  for (let i = 0; i < 2; i++) {
    const s = K.singers[i];
    s.homeX = s.homeX ?? s.x;
    if (s.anim) {
      s.anim.t += dt;
      const pulse = Math.sin(Math.min(1, s.anim.t / 0.4) * Math.PI);
      s.y = (s.homeY ?? (s.homeY = s.y)) - pulse * 5;       // a little jump
      if (s.anim.t > 0.4) s.anim = null;
    } else if (s.homeY !== undefined) s.y = s.homeY;
    s.x = s.homeX + Math.sin(live.t * (i === K.turn ? 2.6 : 1.4) + i * 3) * (i === K.turn ? 7 : 3);
    s.frame = ((live.t * (i === K.turn ? 6 : 2) + i) | 0) % 2;
    s.dir = 0;
  }
  live.focus = { x: it.arena.center.x, y: it.arena.center.y + 10 };

  if (K.singalong && K.verse === 2 && !K.singDone) {
    K.singDone = true;
    live.fx.push({ text: '🎶 THE WHOLE ROOM SINGS ALONG!', x: it.arena.center.x, y: it.arena.rect.y + it.arena.rect.h + 10, t: 0, color: '#5eeaff' });
  }

  if (K.verseT > VERSE_LEN) {
    K.verseT = 0;
    K.verse++;
    if (K.verse > 3) {
      const winner = K.singers[K.winner], loser = K.singers[1 - K.winner];
      K.hype[K.winner] = Math.max(K.hype[K.winner], Math.min(100, K.hype[1 - K.winner] + 14));
      winner.emote = { ico: '🏆', t: 3 };
      loser.emote = { ico: '😅', t: 3 };
      if (K.micdrop) live.fx.push({ text: '🎤 MIC. DROP.', x: winner.x, y: winner.y - 30, t: 0, color: '#ffd75e' });
      endSim(it, `🎤 ${(winner.name || '').toUpperCase()} TAKES THE ROOM${K.encore ? ' — ENCORE! ENCORE!' : ''}`);
    } else {
      live.fx.push({ text: `VERSE ${K.verse}`, x: it.arena.center.x, y: it.arena.rect.y - 4, t: 0, color: '#e8e2d4' });
    }
  }
}

/* the beast bout: two Lucklians circle and trade on the sand */
function updateBeastBout(it, live, dt) {
  const B = live.bb;
  const [ya, ha] = B.actors;
  if (!ya || !ha) { endSim(it, 'The sand is empty.'); return; }
  B.t += dt;

  /* the tangle prowls around the arena */
  B.driftT -= dt;
  if (B.driftT <= 0) {
    B.driftT = 1.6 + roll() * 1.8;
    B.tgtX = B.rect.x + 14 + roll() * (B.rect.w - 28);
    B.tgtY = B.rect.y + 10 + roll() * (B.rect.h - 20);
  }
  B.pairX += (B.tgtX - B.pairX) * Math.min(1, dt * 1.3);
  B.pairY += (B.tgtY - B.pairY) * Math.min(1, dt * 1.3);

  B.exchT += dt;
  if (B.exchT > 0.85) {
    B.exchT = 0;
    if (!B.firstDone) { B.attacker = B.firstBlood; B.firstDone = true; }
    else B.attacker = 1 - B.attacker;
    const atk = B.actors[B.attacker], def = B.actors[1 - B.attacker];
    const move = pickFrom(BEAST_MOVES);
    atk.anim = { t: 0, dirTo: def.x >= atk.x ? 1 : -1 };
    def.hitT = 0.22;
    def.knock = { dx: def.x >= atk.x ? 6 : -6, t: 0.2 };
    const loserIdx = 1 - B.winner;
    let dmg = move.dmg[0] + roll() * (move.dmg[1] - move.dmg[0]);
    dmg *= (1 - B.attacker) === loserIdx ? 1.35 : 0.55;
    if (B.t > B.koAt - 3 && (1 - B.attacker) === loserIdx) dmg += 8;
    B.hp[1 - B.attacker] = Math.max(0, B.hp[1 - B.attacker] - dmg);
    if ((1 - B.attacker) === B.winner) B.hp[B.winner] = Math.max(30, B.hp[B.winner]);   // the victor stays on its feet
    live.fx.push({ text: move.name, x: atk.x, y: atk.y - 26, t: 0, color: '#ffd75e' });
    live.fx.push({ text: `-${Math.round(dmg)}`, x: def.x + (roll() * 8 - 4), y: def.y - 16, t: 0, color: '#ff8a7a' });
    if (B.firstDone && !B.bloodShown) { B.bloodShown = true; live.fx.push({ text: '🩸 FIRST BLOOD!', x: def.x, y: def.y - 36, t: 0, color: '#e05548' }); }
  }

  /* choreography: circle, lunge, recoil */
  for (let i = 0; i < 2; i++) {
    const a = B.actors[i];
    const side = i === 0 ? -1 : 1;
    let ox = 0;
    if (a.anim) {
      a.anim.t += dt;
      const pulse = Math.sin(Math.min(1, a.anim.t / 0.3) * Math.PI);
      ox = a.anim.dirTo * 10 * pulse;
      if (a.anim.t > 0.3) a.anim = null;
    }
    let kx = 0;
    if (a.knock) { a.knock.t -= dt; kx = a.knock.dx * Math.max(0, a.knock.t / 0.2); if (a.knock.t <= 0) a.knock = null; }
    const orbit = Math.sin(B.t * 1.7 + i * Math.PI) * 5;
    a.x = B.pairX + side * (17 + orbit) + ox + kx;
    a.y = B.pairY + Math.cos(B.t * 1.3 + i * 2) * 4;
    a.dir = a.x <= B.pairX ? 0 : 1;    // always squared up
    a.frame = 0;
  }
  live.focus = { x: B.pairX, y: B.pairY };

  const loserIdx = 1 - B.winner;
  if (B.hp[loserIdx] <= 0 && !B.koDone) {
    B.koDone = true;
    const winA = B.actors[B.winner], losA = B.actors[loserIdx];
    losA.emote = { ico: '😵', t: 3 };
    winA.emote = { ico: '🏆', t: 3 };
    endSim(it, `🐆 ${(winA.def?.name || '').toUpperCase()} STANDS ALONE!`);
  } else if (B.t > 20 && !B.koDone) {
    B.hp[loserIdx] = 0;    // the editor waves it off — never let a card stall
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

/* The basho bracket board — a real 8-man ladder pinned to the hall wall,
   quarters → semis → final → cup, with everything the punter has money
   on ringed in gold so a glance tells them how their card is going. */
function drawBashoBracket(ctx, B, vw, vh) {
  const results = B.results || [[], [], []];
  const picks = B.picks || [];
  const k = Math.max(1, Math.min(1.6, (vw || 800) / 420));
  const F = (px2, bold = true) => `${bold ? 'bold ' : ''}${px2}px "Courier New", monospace`;
  const nw = 52 * k, eh = 9 * k, pairGap = 5 * k, colGap = 7 * k;
  const slotH = 2 * eh + pairGap;
  const bodyH = 4 * slotH - pairGap;
  const headH = 22 * k;
  const pw = 4 * nw + 3 * colGap + 12 * k;
  const ph = bodyH + headH + 8 * k;
  const px = 10;
  const py = Math.min(Math.max(96, (vh - ph) / 2), Math.max(96, vh - ph - 14));
  panel(ctx, px, py, pw, ph);
  ctx.fillStyle = 'rgba(12,10,20,0.9)';   // second coat: the hall mustn't bleed through
  ctx.fillRect(px + 1, py + 1, pw - 2, ph - 2);

  const ox = px + 6 * k;
  const oy = py + headH + 3 * k;
  const colX = (col) => ox + col * (nw + colGap);
  const c0 = (i) => oy + (i >> 1) * slotH + (i & 1) * eh + eh / 2;
  const c1 = (m) => (c0(2 * m) + c0(2 * m + 1)) / 2;
  const c2 = (q) => (c1(2 * q) + c1(2 * q + 1)) / 2;
  const c3 = (c2(0) + c2(1)) / 2;

  // header
  ctx.textAlign = 'left';
  ctx.font = F(8 * k);
  ctx.fillStyle = '#ffd75e';
  ctx.fillText('THE BASHO LADDER', px + 6 * k, py + 9 * k);
  ctx.textAlign = 'right';
  ctx.font = F(7 * k, false);
  ctx.fillStyle = '#b8b4c0';
  ctx.fillText(picks.length ? 'gold = your money' : 'green = on the clay', px + pw - 6 * k, py + 9 * k);

  // column captions
  ctx.font = F(6.5 * k);
  ctx.textAlign = 'left';
  ['QUARTERS', 'SEMIS', 'FINAL', "THE CUP"].forEach((cap, col) => {
    ctx.fillStyle = col === B.round || (col === 3 && B.champion !== null && B.champion !== undefined) ? '#ffd75e' : '#8a8496';
    ctx.fillText(cap, ox + col * (nw + colGap), py + 18 * k);
  });

  // joining lines first, so the boxes sit on top of them
  ctx.strokeStyle = 'rgba(200,190,220,0.32)';
  ctx.lineWidth = Math.max(1, 0.8 * k);
  const link = (col, ya, yb, ym) => {
    const x0 = colX(col) + nw, x1 = colX(col + 1), xm = (x0 + x1) / 2;
    ctx.beginPath();
    ctx.moveTo(x0, ya); ctx.lineTo(xm, ya); ctx.lineTo(xm, yb); ctx.lineTo(x0, yb);
    ctx.moveTo(xm, ym); ctx.lineTo(x1, ym);
    ctx.stroke();
  };
  for (let m = 0; m < 4; m++) link(0, c0(2 * m), c0(2 * m + 1), c1(m));
  for (let q = 0; q < 2; q++) link(1, c1(2 * q), c1(2 * q + 1), c2(q));
  link(2, c2(0), c2(1), c3);

  const inBout = B.bout ? [B.bout.ai, B.bout.bi] : [];
  const box = (col, cy, idx, crown) => {
    const bx = colX(col), by = cy - eh / 2;
    const r = idx === null || idx === undefined ? null : B.rikishi[idx];
    ctx.fillStyle = r ? 'rgba(26,20,40,0.9)' : 'rgba(26,20,40,0.45)';
    ctx.fillRect(bx, by, nw, eh);
    if (r) { ctx.fillStyle = r.color; ctx.fillRect(bx, by, 3 * k, eh); }
    const picked = r && picks.includes(idx);
    const fighting = r && inBout.includes(idx);
    if (picked || fighting) {
      ctx.strokeStyle = picked ? '#ffd75e' : '#8fdc9a';
      ctx.lineWidth = Math.max(1, k);
      ctx.strokeRect(bx + 0.5, by + 0.5, nw - 1, eh - 1);
    }
    ctx.font = F(6.2 * k, picked || crown);
    ctx.textAlign = 'left';
    ctx.fillStyle = !r ? '#5c5768' : picked ? '#ffd75e' : r.out ? '#7b7686' : '#e8e2d4';
    const name = r ? (crown ? '👑' : '') + r.name.slice(0, crown ? 9 : 11) : '·····';
    ctx.fillText(name, bx + 5.5 * k, cy + 2.5 * k);
    if (r && r.out) {   // a line through the fallen
      ctx.strokeStyle = 'rgba(160,150,175,0.5)';
      ctx.lineWidth = Math.max(1, 0.7 * k);
      ctx.beginPath();
      ctx.moveTo(bx + 5 * k, cy + 0.5); ctx.lineTo(bx + nw - 3 * k, cy + 0.5);
      ctx.stroke();
    }
  };

  for (let i = 0; i < 8; i++) box(0, c0(i), i);
  for (let m = 0; m < 4; m++) box(1, c1(m), results[0][m] ?? null);
  for (let q = 0; q < 2; q++) box(2, c2(q), results[1][q] ?? null);
  box(3, c3, B.champion !== null && B.champion !== undefined ? B.champion : (results[2][0] ?? null), true);
}

export function drawLiveOverlay(ctx, it, camX, camY, zoom, now, vw, vh) {
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

  /* the regatta course: start line and finish buoys, always on the water */
  if (A.kind === 'regatta' && A.course) {
    const C = A.course;
    ctx.strokeStyle = 'rgba(240,192,64,0.55)';
    ctx.lineWidth = zoom / 2;
    ctx.setLineDash([zoom * 2, zoom * 2]);
    for (const wx of [C.x0 - 14, C.x1 + 12]) {
      ctx.beginPath();
      ctx.moveTo(S(wx), Sy(A.rect.y + 4));
      ctx.lineTo(S(wx), Sy(A.rect.y + A.rect.h - 4));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    for (let k = 0; k < 4; k++) {   // finish buoys bobbing
      const by = A.rect.y + 10 + k * ((A.rect.h - 20) / 3) + Math.sin(now / 500 + k) * 2;
      ctx.fillStyle = k % 2 ? '#e05030' : '#ffd75e';
      ctx.fillRect(S(C.x1 + 12) - zoom, Sy(by) - zoom, zoom * 2, zoom * 2);
    }
  }

  /* the basho: round marquee + live momentum bar over the dohyō */
  if (A.kind === 'sumo' && A.basho) {
    const B = A.basho;
    drawBashoBracket(ctx, B, vw || 800, vh || 600);
    let label;
    if (B.champion !== null) label = `👑 ${B.rikishi[B.champion].name.toUpperCase()} — YOKOZUNA OF THE HOUR`;
    else if (B.bout) label = `${ROUND_NAMES[B.round]} · ${B.rikishi[B.bout.ai].name} vs ${B.rikishi[B.bout.bi].name}`;
    else {
      const nx = B.matches[B.winners.length];
      label = `${ROUND_NAMES[B.round]} · NEXT: ${B.rikishi[nx[0]].name} vs ${B.rikishi[nx[1]].name}`;
    }
    ctx.font = font(10 * zoom / 2);
    const w = ctx.measureText(label).width + 18;
    // clear the bet panel when a punt is live — it sits 34..8 above the ring
    const myY = Sy(A.rect.y) - (live ? 50 : 16) * zoom / 2;
    panel(ctx, S(A.center.x) - w / 2, myY, w, 11 * zoom / 2 + 6);
    ctx.fillStyle = '#ffd75e';
    ctx.textAlign = 'center';
    ctx.fillText(label, S(A.center.x), myY + 10 * zoom / 2);
    if (B.bout && B.bout.phase === 'clash') {
      // the shoving match, as a two-colour tug bar
      const bw = 78 * zoom / 2, bx = S(A.center.x) - bw / 2, by = Sy(A.rect.y) + 4;
      // more colour = winning the shove; east (ai) grows to the right
      const mid = Math.max(4, Math.min(bw - 4, bw / 2 + (B.bout.mom * bw) / 2.4));
      ctx.fillStyle = 'rgba(10,8,16,0.85)';
      ctx.fillRect(bx - 1, by - 1, bw + 2, 5 * zoom / 2 + 2);
      ctx.fillStyle = B.rikishi[B.bout.ai].color;
      ctx.fillRect(bx, by, mid, 5 * zoom / 2);
      ctx.fillStyle = B.rikishi[B.bout.bi].color;
      ctx.fillRect(bx + mid, by, bw - mid, 5 * zoom / 2);
      // fighters' names under their colours
      ctx.font = font(7 * zoom / 2);
      const picked = B.picks || [];
      ctx.textAlign = 'left';
      ctx.fillStyle = picked.includes(B.bout.ai) ? '#ffd75e' : '#f4ecd8';
      ctx.fillText(B.rikishi[B.bout.ai].name.slice(0, 8), bx, by + 10 * zoom / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = picked.includes(B.bout.bi) ? '#ffd75e' : '#f4ecd8';
      ctx.fillText(B.rikishi[B.bout.bi].name.slice(0, 8), bx + bw, by + 10 * zoom / 2);
    }
  }

  /* kite duels: strings from the flyers, and the wind on a chip */
  if (A.kind === 'kites' && A.duel) {
    for (let i = 0; i < 2; i++) {
      const kite = A.duel[i].actor;
      const flyer = A.flyers[i];
      if (!kite || !flyer || kite.cut) continue;
      const x1 = S(flyer.x), y1 = Sy(flyer.y - 8);
      const x2 = S(kite.x), y2 = Sy(kite.y + 8);
      ctx.strokeStyle = 'rgba(240,240,250,0.55)';
      ctx.lineWidth = Math.max(1, zoom / 3);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      // a sagging line: one midpoint pulled down
      ctx.quadraticCurveTo((x1 + x2) / 2, Math.max(y1, y2) + 14, x2, y2);
      ctx.stroke();
    }
    if (A.wind && live) {
      const wtxt = `${A.wind.ico} ${A.wind.label.toUpperCase()}`;
      ctx.font = font(8 * zoom / 2);
      const w = ctx.measureText(wtxt).width + 14;
      panel(ctx, S(A.rect.x) + 4, Sy(A.rect.y) + 4, w, 9 * zoom / 2 + 6);
      ctx.fillStyle = '#8fd8ff';
      ctx.textAlign = 'left';
      ctx.fillText(wtxt, S(A.rect.x) + 11, Sy(A.rect.y) + 4 + 7 * zoom / 2);
    }
  }

  /* the bog: rolling fog, the wisp, crossed-tuft lanterns, the pot */
  if (A.kind === 'bog') {
    // fog thickens with depth (smaller y = deeper in)
    const bands = 7;
    for (let b = 0; b < bands; b++) {
      const y0 = A.rect.y + (b / bands) * A.rect.h;
      const alpha = 0.42 * (1 - b / bands) + 0.04 * Math.sin(now / 900 + b);
      ctx.fillStyle = `rgba(150,170,160,${Math.max(0, alpha).toFixed(3)})`;
      ctx.fillRect(S(A.rect.x), Sy(y0), A.rect.w * zoom, (A.rect.h / bands) * zoom + 1);
    }
    // lanterns on conquered tufts
    for (let i = 0; i < A.progress; i++) {
      const t2 = A.tufts[i];
      ctx.fillStyle = 'rgba(255,215,94,0.8)';
      ctx.fillRect(S(t2.x * TILE + 7), Sy(t2.y * TILE + 2), zoom * 1.5, zoom * 1.5);
    }
    // the wisp over the next tuft (bright when a bargain is live)
    const target = A.stakeActive ? A.tufts[Math.min(A.progress, A.tufts.length - 1)] : A.tufts[2];
    if (target) {
      const wx = S(target.x * TILE + 8), wy = Sy(target.y * TILE - 4 + Math.sin(now / 300) * 3);
      const pulse = 0.6 + 0.4 * Math.sin(now / 180);
      ctx.globalAlpha = (A.stakeActive ? 0.9 : 0.35) * pulse;
      ctx.fillStyle = '#8fd8c8';
      ctx.fillRect(wx - 3 * zoom, wy - 3 * zoom, 6 * zoom, 6 * zoom);
      ctx.fillStyle = '#e8fff4';
      ctx.fillRect(wx - zoom, wy - zoom, 2 * zoom, 2 * zoom);
      ctx.globalAlpha = 1;
    }
    if (A.stakeActive) {
      const line = `🫧 POT ${fmt(A.pot)} · TUFT ${A.progress + 1}/${A.tufts.length} HOLDS AT ${(A.ps[A.progress] * 100).toFixed(0)}%`;
      ctx.font = font(9 * zoom / 2);
      const w = ctx.measureText(line).width + 18;
      panel(ctx, S(A.center.x) - w / 2, Sy(A.rect.y) - 4, w, 11 * zoom / 2 + 6);
      ctx.fillStyle = '#ffd75e';
      ctx.textAlign = 'center';
      ctx.fillText(line, S(A.center.x), Sy(A.rect.y) - 4 + 8 * zoom / 2);
    }
    if (A.stepFx) {
      ctx.globalAlpha = Math.max(0, 1 - A.stepFx.t / 1.4);
      ctx.font = font(8 * zoom / 2);
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 2;
      const fy = Sy(A.stepFx.y - A.stepFx.t * 12);
      ctx.strokeText(A.stepFx.text, S(A.stepFx.x), fy);
      ctx.fillStyle = '#8fdc9a';
      ctx.fillText(A.stepFx.text, S(A.stepFx.x), fy);
      ctx.globalAlpha = 1;
    }
  }

  /* health bars on ambient + sim performers */
  for (const a of it.actors) {
    if (!a.arena) continue;
    if (a.hitT) { a.hitT -= 1 / 60; }
    const needsBar = (live && !(a.sink > 0) && !a.down &&
      ((live.kind === 'fight' && a.type === 'fighter') ||
      (live.kind === 'chase' && a.type === 'prey') ||
      (live.kind === 'naval' && a.type === 'ship') ||
      (live.kind === 'karaoke' && a.type === 'singer') ||
      (live.kind === 'bbout' && a.type === 'bbeast')));
    if (needsBar && (a.hp !== undefined || a.type === 'singer')) {
      const w = (a.type === 'ship' ? 30 : a.type === 'bbeast' ? 22 : 16) * zoom / 2;
      let frac = (a.hp ?? 100) / 100;
      if (live.kind === 'fight') {
        const F = live.fight;
        frac = (F.actors[0] === a ? F.hp[0] : F.hp[1]) / 100;
      } else if (live.kind === 'karaoke') {
        const K = live.kar;
        frac = (K.singers[0] === a ? K.hype[0] : K.hype[1]) / 100;   // hype, not health
      } else if (live.kind === 'bbout') {
        const B = live.bb;
        frac = (B.actors[0] === a ? B.hp[0] : B.hp[1]) / 100;
      }
      const barY = Sy(a.y) - (a.type === 'ship' ? 34 : a.type === 'bbeast' ? 32 : 26) * zoom / 2;
      hpBar(ctx, S(a.x) - w / 2, barY, w, Math.max(0, frac), zoom);
      if (a.name && (live.kind === 'fight' || live.kind === 'naval' || live.kind === 'karaoke' || live.kind === 'bbout')) {
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
    else if (live.kind === 'race') line1 = live.race.started ? (A.kind === 'regatta' ? '🥁 PADDLES DIGGING' : '🏁 RACING') : (A.kind === 'regatta' ? 'THE CREWS TAKE THE LINE…' : 'THE FIELD LOADS THE GATES…');
    else if (live.kind === 'chase') line1 = `SURVIVE: 0:${String(Math.max(0, Math.ceil(live.chase.timer))).padStart(2, '0')}`;
    else if (live.kind === 'naval') line1 = `${live.naval.ships.filter((s) => s.sink === 0).length} SHIPS AFLOAT`;
    else if (live.kind === 'karaoke') line1 = live.phase === 'done' ? 'THE SET ENDS' : `🎤 VERSE ${Math.min(3, live.kar.verse)} OF 3`;
    else if (live.kind === 'bbout') line1 = live.phase === 'done' ? 'THE SAND SETTLES' : '🐆 ON THE SAND';
    else if (live.kind === 'sumo') line1 = live.phase === 'done' ? 'THE DOHYŌ IS SWEPT' : '🤼 THE BOUT IS ON';
    else if (live.kind === 'kites') line1 = live.phase === 'done' ? 'THE SKY SETTLES' : (live.kite.cutDone ? '✂️ A STRING PARTS!' : '🪁 CIRCLING FOR THE CUT');
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

/* ============================================================
   The Lantern Festival — a LIVE race down the actual river.
   Eight lanterns take the current from the dock; the camera
   follows the flotilla, an in-world board tracks the order,
   and your finishing place — drawn honestly from the festival's
   long-odds ladder — decides the temple pot.
   ============================================================ */
const LANTERN_COLORS = ['#ffd75e', '#e05030', '#3fb0a0', '#e88ab0', '#8dff6b', '#e8b830', '#8a70c0', '#5eeaff'];

let lanternRace = null;
export function getLanternRace() { return lanternRace; }

/* follow the water from the dock: a winding run of river tiles.
   Water near a dock can be a dead-end pocket, so every nearby wet
   tile gets a try and the longest run wins. */
function riverPath(world, startTx, startTy) {
  const isW = (x, y) => { const t = world.get(x, y); return t === T.WATER || t === T.SHALLOW; };
  const starts = [];
  for (let r = 1; r <= 7 && starts.length < 14; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (isW(startTx + dx, startTy + dy)) starts.push([startTx + dx, startTy + dy]);
    }
  }
  const walk = (sx, sy) => {
    const path = [[sx, sy]];
    const seen = new Set([sy * world.W + sx]);
    let dir = null;
    for (let n = 0; n < 46; n++) {
      const [cx, cy] = path[path.length - 1];
      const opts = [];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (!isW(nx, ny) || seen.has(ny * world.W + nx)) continue;
        opts.push({ nx, ny, dx, dy, score: (dir && dx === dir[0] && dy === dir[1]) ? 2 + roll() : 1 + roll() });
      }
      if (!opts.length) break;
      opts.sort((a, b) => b.score - a.score);
      const o = opts[0];
      path.push([o.nx, o.ny]);
      seen.add(o.ny * world.W + o.nx);
      dir = [o.dx, o.dy];
    }
    return path;
  };
  let best = null;
  for (const [sx, sy] of starts) {
    const p = walk(sx, sy);
    if (!best || p.length > best.length) best = p;
    if (best.length >= 30) break;
  }
  if (!best || best.length < 8) return null;
  return best.map(([x, y]) => ({ x: x * TILE + 8, y: y * TILE + 8 }));
}

export function openLanternFestival(world, provCode, ev) {
  const def = GAME_DEFS.lanternfest;
  const win = lanternWindow();
  if (lanternRace) { toast('🏮 A race is already on the water — watch it home!'); return; }
  if (!win.open) {
    const mm = Math.floor(win.until / 60), ss = Math.round(win.until % 60);
    showModal(`
      <h2>🏮 ${escapeHtml(def.name)}</h2>
      <div class="subtitle">The monks are still folding lanterns…</div>
      <div class="stage"><div class="big-sym">🕯️</div>
      <div class="flavor">The next launch begins in <b>${mm}m ${ss}s</b>. Come back when the river lights up.</div></div>
      <div class="btn-row"><button class="btn secondary" id="lf-ok">Until then</button></div>
    `);
    document.getElementById('lf-ok').addEventListener('click', closeModal);
    return;
  }
  const path = riverPath(world, Math.round(ev.x + ev.w / 2), Math.round(ev.y + ev.h / 2));
  if (!path) { toast('The river is too tangled here for a fair race tonight.'); return; }
  const rtp = effectiveRTP('lanternfest', provCode);
  let bet = state.lastBet;
  const preview = lanternPrizes(100, rtp, def);
  const fmtM = (m) => (m >= 10 ? m.toFixed(1) : m.toFixed(2)).replace(/\.0+$/, '');
  showModal(`
    <h2>🏮 ${escapeHtml(def.name)}</h2>
    <div class="subtitle">${escapeHtml(def.desc)} · RTP ${(rtp * 100).toFixed(1)}% · launch window ${Math.ceil(win.left)}s</div>
    <div class="stage"><div class="big-sym">🏮</div>
    <div class="flavor">Your offering joins seven others ON THE RIVER — the race runs right past the dock.
    Furthest downstream takes the temple pot: 1st pays ${fmtM(preview[0] / 100)}x · 2nd ${fmtM(preview[1] / 100)}x · 3rd ${fmtM(preview[2] / 100)}x.</div></div>
    <div id="lf-bet"></div>
    <div class="btn-row"><button class="btn" id="lf-go">🏮 Light yours & launch</button></div>
  `);
  buildBetRow(document.getElementById('lf-bet'), (v) => { bet = v; });
  document.getElementById('lf-go').addEventListener('click', () => {
    if (state.balance < bet) { toast('Not enough coins for an offering!'); return; }
    spend(bet);
    state.stats.gamesPlayed++;
    renderBalance();
    closeModal();
    startLanternRace(def, provCode, path, bet, rtp);
  });
}

function startLanternRace(def, provCode, path, bet, rtp) {
  const prizes = lanternPrizes(bet, rtp, def);
  // draw your placement honestly, then choreograph the current to match
  let r = roll(), place = def.Q.length - 1;
  for (let i = 0; i < def.Q.length; i++) { r -= def.Q[i]; if (r <= 0) { place = i; break; } }
  const folk = pickN(LANTERN_FOLK, 7);
  const names = ['You', ...folk];
  const rivalRanks = folk.map((_, i) => i).sort(() => roll() - 0.5);
  const rankOf = new Array(8);
  rankOf[0] = place;
  rivalRanks.forEach((ri, j) => { rankOf[ri + 1] = j < place ? j : j + 1; });
  const times = names.map((_, i) => 9.5 + rankOf[i] * (0.45 + roll() * 0.3));
  const drama = names.map(() => ({
    ...makeDrama(roll),
    lane: (roll() - 0.5) * 9, bobP: roll() * 6.28,
  }));
  lanternRace = {
    def, bet, prizes, place, rankOf, names, path, times, drama,
    prog: names.map(() => 0), finished: [], t: 0, phase: 'launch',
    focus: { ...path[0] }, banner: null, doneT: 0, win: place <= 2,
  };
  toast('🕯️ The lanterns take the current — the race is on the river!');
}

function lanternPos(L, i) {
  const f = Math.min(0.999, L.prog[i]) * (L.path.length - 1);
  const k = Math.floor(f), fr = f - k;
  const a = L.path[k], b = L.path[Math.min(L.path.length - 1, k + 1)];
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const D = L.drama[i];
  const lat = D.lane * (0.4 + 0.6 * Math.sin(L.t * 0.7 + D.bobP));
  return {
    x: a.x + dx * fr + (-dy / len) * lat,
    y: a.y + dy * fr + (dx / len) * lat + Math.sin(L.t * 2.2 + i) * 1.2,
  };
}

export function updateLanternRace(dt) {
  const L = lanternRace;
  if (!L) return;
  L.t += dt;
  if (L.phase === 'launch') {
    // lanterns wobble off the bank one by one
    L.names.forEach((_, i) => { L.prog[i] = Math.min(0.02, Math.max(L.prog[i], (L.t - i * 0.15) * 0.012)); });
    if (L.t > 1.6) { L.phase = 'drift'; L.t0 = L.t; }
    L.focus = lanternPos(L, 0);
    return;
  }
  if (L.phase === 'done') {
    L.doneT += dt;
    if (L.doneT > 3.6) lanternRace = null;
    return;
  }
  const t = L.t - L.t0;
  const winnerIdx = L.rankOf.indexOf(0);
  const winnerDone = L.finished.includes(winnerIdx);
  L.names.forEach((_, i) => {
    if (L.prog[i] >= 1) return;
    L.prog[i] = stepRacer(L.prog[i], t, L.times[i], L.drama[i], dt, i === winnerIdx, winnerDone);
    if (L.prog[i] >= 1 && !L.finished.includes(i)) L.finished.push(i);
  });
  // camera rides with the front of the flotilla
  const lead = L.prog.indexOf(Math.max(...L.prog));
  const lp = lanternPos(L, lead);
  L.focus.x += (lp.x - L.focus.x) * Math.min(1, dt * 3);
  L.focus.y += (lp.y - L.focus.y) * Math.min(1, dt * 3);
  if (L.finished.length >= L.names.length || t > 17) {
    L.phase = 'done';
    const prize = L.prizes[L.place] || 0;
    if (prize > 0) {
      payout(prize);
      toast(`🏮 <b>${['GOLD', 'SILVER', 'BRONZE'][L.place]}!</b> Your lantern places ${L.place + 1}${['st', 'nd', 'rd'][L.place]} — the temple pot pays <span class="amt">${fmt(prize)}</span> 🪙!`, L.place === 0);
    } else {
      toast(`The current had other plans — your lantern drifts home ${L.place + 1}th of 8.`);
    }
    renderBalance();
    L.banner = prize > 0
      ? `🏮 ${L.place + 1}${['ST', 'ND', 'RD'][L.place]} PLACE — +${fmt(prize)} 🪙`
      : `🏮 ${L.place + 1}TH OF 8 — THE RIVER KEEPS IT`;
  }
}

/* drawn in world space by main, after entities */
export function drawLanternRace(ctx, camX, camY, zoom, now, vw) {
  const L = lanternRace;
  if (!L) return;
  const S = (wx) => (wx - camX) * zoom;
  const Sy = (wy) => (wy - camY) * zoom;
  const font = (px2, bold = true) => `${bold ? 'bold ' : ''}${px2}px "Courier New", monospace`;
  // the finish: a moored rope of petals across the river at path's end
  const end = L.path[L.path.length - 1];
  ctx.fillStyle = 'rgba(255,215,94,0.7)';
  for (let k = -2; k <= 2; k++) ctx.fillRect(S(end.x + k * 5) - zoom, Sy(end.y + Math.sin(now / 400 + k) * 2) - zoom, zoom * 2, zoom * 2);
  // lanterns: glow, paper body, flame, reflection
  L.names.forEach((_, i) => {
    const p = lanternPos(L, i);
    const col = LANTERN_COLORS[i % LANTERN_COLORS.length];
    const flick = 0.75 + 0.25 * Math.sin(now / 90 + i * 2);
    ctx.globalAlpha = 0.18 * flick;
    ctx.fillStyle = col;
    ctx.fillRect(S(p.x) - 7 * zoom, Sy(p.y) - 7 * zoom, 14 * zoom, 12 * zoom);   // soft glow
    ctx.globalAlpha = 1;
    ctx.fillStyle = col;
    ctx.fillRect(S(p.x) - 2 * zoom, Sy(p.y) - 4 * zoom, 4 * zoom, 4 * zoom);     // paper body
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(S(p.x) - zoom, Sy(p.y) - 3 * zoom, 2 * zoom, 2 * zoom);         // hot heart
    ctx.fillStyle = '#ffd75e';
    ctx.fillRect(S(p.x) - zoom / 2, Sy(p.y) - 5 * zoom, zoom, zoom);             // flame tip
    ctx.globalAlpha = 0.35 * flick;
    ctx.fillStyle = col;
    ctx.fillRect(S(p.x) - 2 * zoom, Sy(p.y) + zoom, 4 * zoom, zoom);             // reflection
    ctx.globalAlpha = 1;
    if (i === 0) {   // your lantern wears a little crown marker
      ctx.font = font(7 * zoom / 2);
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 2;
      ctx.strokeText('YOU', S(p.x), Sy(p.y) - 7 * zoom);
      ctx.fillStyle = '#ffd75e';
      ctx.fillText('YOU', S(p.x), Sy(p.y) - 7 * zoom);
    }
  });
  /* top panel over the flotilla */
  {
    const cx = S(L.focus.x);
    const topY = Math.max(6, Sy(L.focus.y) - 60 * zoom / 2);
    const line1 = L.phase === 'launch' ? '🕯️ THE LANTERNS TAKE THE CURRENT…' : L.phase === 'done' ? 'THE RIVER DECIDES' : '🏮 DRIFTING FOR THE TEMPLE';
    const line2 = `OFFERING ${fmt(L.bet)} → 🥇 ${fmt(L.prizes[0])} · 🥈 ${fmt(L.prizes[1])} · 🥉 ${fmt(L.prizes[2])}`;
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
  /* running order, pinned to the right edge */
  {
    const rowH = 11 * zoom / 2;
    const wPanel = 92 * zoom / 2;
    const lbx = (vw || 800) - wPanel - 10;
    const lby = 100;
    panel(ctx, lbx, lby, wPanel, rowH * (L.names.length + 1) + 8);
    ctx.font = font(9 * zoom / 2);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd75e';
    ctx.fillText('— THE CURRENT —', lbx + 8, lby + rowH);
    const ranked = L.names.map((nm, i) => ({ nm, i }))
      .sort((a, b) => (L.finished.includes(a.i) || L.finished.includes(b.i))
        ? (L.finished.indexOf(a.i) === -1 ? 99 : L.finished.indexOf(a.i)) - (L.finished.indexOf(b.i) === -1 ? 99 : L.finished.indexOf(b.i))
        : L.prog[b.i] - L.prog[a.i]);
    ranked.forEach((e, rank) => {
      const done = L.finished.includes(e.i);
      ctx.fillStyle = e.i === 0 ? '#ffd75e' : done ? '#8fdc9a' : '#e8e2d4';
      ctx.fillText(`${rank + 1}. ${e.nm.slice(0, 11)}${done ? ' ✓' : ''}`, lbx + 8, lby + rowH * (rank + 2));
    });
  }
  /* verdict banner */
  if (L.phase === 'done' && L.banner) {
    const cx = S(L.focus.x), cy = Sy(L.focus.y) - 20;
    ctx.font = font(13 * zoom / 2);
    const w = ctx.measureText(L.banner).width + 30;
    panel(ctx, cx - w / 2, cy - 14 * zoom / 2, w, 24 * zoom / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = L.win ? '#8fdc9a' : '#e8e2d4';
    ctx.fillText(L.banner, cx, cy + 2 * zoom / 2);
  }
}

/* ============================================================
   Utility: weighted pick over {w} entries (local to this module)
   ============================================================ */
function weightedPick2(arr) {
  let tot = 0; for (const e of arr) tot += e.w;
  let r = roll() * tot;
  for (const e of arr) { r -= e.w; if (r <= 0) return e; }
  return arr[0];
}

/* ============================================================
   THE GRAND BASHO — a rolling 8-man single-elimination sumo
   tournament. Bouts play themselves on the dohyō whether or not
   anyone bets. Every rikishi has a hidden strength; a bout's
   winner is drawn by the strength ratio, and champion odds are
   the exact fold of the remaining bracket — so both books pay
   RTP / p against the true probabilities.
   ============================================================ */
function seedBasho(it) {
  const A = it.arena;
  // clear last field's actors
  it.actors = it.actors.filter((a) => a.type !== 'rikishi');
  const names = pickN(RIKISHI_NAMES, 8);
  const skins = ['#e8b890', '#c89a70', '#a5713f', '#f0c8a0'];
  const rikishi = names.map((name, i) => {
    const actor = it.addActor({
      type: 'rikishi', arena: true,
      sprite: makeSumoSprite(MAWASHI[i], skins[i % skins.length]),
      x: A.benches[i].x, y: A.benches[i].y, dir: i < 4 ? 0 : 1, frame: 0,
    });
    return { name, s: 0.6 + roll(), color: MAWASHI[i], actor, out: false };
  });
  A.basho = {
    rikishi,
    round: 0,                       // 0 quarters, 1 semis, 2 final
    matches: [[0, 1], [2, 3], [4, 5], [6, 7]],
    winners: [],
    bout: null, nextT: 5, champion: null, ceremonyT: 0,
    champBets: [],   // settled at the previous crown; each basho opens a fresh book
    justFinished: null,
    results: [[], [], []],  // winners per round, kept for the bracket board
    picks: [],              // everyone the punter has money on this basho
  };
}

const ROUND_NAMES = ['QUARTERFINALS', 'SEMIFINALS', 'THE FINAL'];

/* exact champion odds: fold the remaining bracket slot by slot */
export function championProb(B) {
  const s = (i) => B.rikishi[i].s;
  let slots = [];
  for (let m = 0; m < B.matches.length; m++) {
    if (m < B.winners.length) slots.push([[B.winners[m], 1]]);
    else {
      const [a, b] = B.matches[m];
      if (B.bout && m === B.winners.length) {
        // bout under way — its winner is already drawn, but the book
        // never peeks: price it at the honest pre-bout ratio
        const pa = s(a) / (s(a) + s(b));
        slots.push([[a, pa], [b, 1 - pa]]);
      } else {
        const pa = s(a) / (s(a) + s(b));
        slots.push([[a, pa], [b, 1 - pa]]);
      }
    }
  }
  while (slots.length > 1) {
    const next = [];
    for (let k = 0; k < slots.length; k += 2) {
      const X = slots[k], Y = slots[k + 1];
      const combined = new Map();
      for (const [i, pi] of X) {
        let win = 0;
        for (const [j, pj] of Y) win += pj * (s(i) / (s(i) + s(j)));
        combined.set(i, (combined.get(i) || 0) + pi * win);
      }
      for (const [j, pj] of Y) {
        let win = 0;
        for (const [i, pi] of X) win += pi * (s(j) / (s(i) + s(j)));
        combined.set(j, (combined.get(j) || 0) + pj * win);
      }
      next.push([...combined.entries()]);
    }
    slots = next;
  }
  return new Map(slots[0]);
}

function tickBasho(it, dt) {
  const A = it.arena;
  if (!A.basho) seedBasho(it);
  const B = A.basho;
  const c = A.center;

  if (B.champion !== null) {
    B.ceremonyT -= dt;
    const champ = B.rikishi[B.champion];
    if (champ && !champ.actor.emote) champ.actor.emote = { ico: '👑', t: 1.5 };
    if (B.ceremonyT <= 0) seedBasho(it);
    return;
  }

  if (!B.bout) {
    B.nextT -= dt;
    if (B.nextT <= 0) {
      const pair = B.matches[B.winners.length];
      const [ai, bi] = pair;
      const sA = B.rikishi[ai].s, sB = B.rikishi[bi].s;
      B.bout = {
        ai, bi, t: 0, phase: 'walk', mom: 0,
        winner: roll() < sA / (sA + sB) ? ai : bi,
        move: SUMO_MOVES[(roll() * SUMO_MOVES.length) | 0],
      };
      B.rikishi[ai].actor.ctl = true;
      B.rikishi[bi].actor.ctl = true;
    }
    return;
  }

  const bt = B.bout;
  bt.t += dt;
  const aA = B.rikishi[bt.ai].actor, aB = B.rikishi[bt.bi].actor;
  const markA = { x: c.x - 14, y: c.y + 6 }, markB = { x: c.x + 14, y: c.y + 6 };

  if (bt.phase === 'walk') {
    const p1 = glideTo(aA, markA.x, markA.y, 60, dt);
    const p2 = glideTo(aB, markB.x, markB.y, 60, dt);
    aA.dir = 0; aB.dir = 1;
    aA.frame = 0; aB.frame = 0;
    if ((p1 && p2) || bt.t > 3) { bt.phase = 'face'; bt.t = 0; }
  } else if (bt.phase === 'face') {
    if (bt.t > 1.2) {
      bt.phase = 'clash'; bt.t = 0;
      if (it.live?.kind === 'sumo') it.live.fx.push({ text: 'TACHIAI!', x: c.x, y: c.y - 20, t: 0, color: '#ffd75e' });
    }
  } else if (bt.phase === 'clash') {
    // momentum: swings both ways, leaning toward the drawn winner late.
    // positive = the east man (ai) is driving west (rightward) — which is
    // also the direction the loser gets shoved in the oshi finish, and the
    // direction the bar's east colour grows. all three must agree.
    const bias = (bt.winner === bt.ai ? 1 : -1) * Math.min(1, bt.t / 4.5) * 0.65;
    bt.mom = Math.sin(bt.t * 2.1) * (1 - Math.min(1, bt.t / 5)) * 0.8 + bias;
    const push = bt.mom * 9;
    aA.x = markA.x + 6 + push; aA.y = markA.y + Math.sin(bt.t * 7) * 1.2;
    aB.x = markB.x - 6 + push; aB.y = markB.y + Math.cos(bt.t * 7) * 1.2;
    aA.frame = 1; aB.frame = 1;
    aA.dir = 0; aB.dir = 1;
    if (bt.t > 4.8) { bt.phase = 'oshi'; bt.t = 0; }
  } else if (bt.phase === 'oshi') {
    // the finish: loser driven out over the bales
    const loser = bt.winner === bt.ai ? aB : aA;
    const winner = bt.winner === bt.ai ? aA : aB;
    const dirOut = bt.winner === bt.ai ? 1 : -1;
    loser.x += dirOut * 55 * dt;
    loser.y += 8 * dt;
    winner.frame = 1;
    if (bt.t > 0.9 && !bt.called) {
      bt.called = true;
      loser.emote = { ico: '😵', t: 2 };
      winner.emote = { ico: '🙌', t: 2 };
      if (it.live?.kind === 'sumo') it.live.fx.push({ text: bt.move, x: c.x, y: c.y - 24, t: 0, color: '#ffd75e' });
    }
    if (bt.t > 1.6) {
      // record and stand down
      B.winners.push(bt.winner);
      B.results[B.round].push(bt.winner);
      const loserIdx = bt.winner === bt.ai ? bt.bi : bt.ai;
      B.rikishi[loserIdx].out = true;
      B.justFinished = { key: `${bt.ai}v${bt.bi}`, winner: bt.winner, move: bt.move };
      aA.ctl = false; aB.ctl = false;
      // walk them home
      aA.homeGlide = true; aB.homeGlide = true;
      bt.done = true;
      B.bout = null;
      B.nextT = 7;
      if (B.winners.length === B.matches.length) {
        if (B.matches.length === 1) {
          // the Emperor's Cup
          B.champion = B.winners[0];
          B.ceremonyT = 12;
          const champName = B.rikishi[B.champion].name;
          for (const cb of B.champBets) {
            if (cb.idx === B.champion) {
              payout(cb.bet * cb.mult);
              toast(`🏆 <b>${escapeHtml(champName)}</b> lifts the Emperor's Cup — your ride pays <span class="amt">${fmt(cb.bet * cb.mult)}</span> 🪙!`, cb.mult >= 4);
            } else {
              toast(`🤼 ${escapeHtml(champName)} takes the Cup — your ${escapeHtml(cb.name)} fell short.`);
            }
          }
          renderBalance();
          B.champBets = [];
        } else {
          B.matches = [];
          for (let k = 0; k < B.winners.length; k += 2) B.matches.push([B.winners[k], B.winners[k + 1]]);
          B.winners = [];
          B.round++;
        }
      }
    }
  }

  // benched rikishi drift home after their bouts
  for (const rk of B.rikishi) {
    const a = rk.actor;
    if (a.homeGlide && !a.ctl) {
      const i = B.rikishi.indexOf(rk);
      if (glideTo(a, A.benches[i].x, A.benches[i].y, 46, dt)) a.homeGlide = false;
      a.dir = i < 4 ? 0 : 1;
      a.frame = 0;
    }
  }
}

function updateSumoSim(it, live, dt) {
  const B = it.arena.basho;
  live.focus = it.arena.center;
  if (!B) { endSim(it, 'The hall falls quiet.'); return; }
  const done = B.justFinished;
  if (done && done.key === live.sumo.key && !live.sumo.settled) {
    live.sumo.settled = true;
    live.win = done.winner === live.sumo.side;
    const wName = B.rikishi[done.winner].name;
    endSim(it, `🤼 ${wName.toUpperCase()} — ${done.move}`);
  } else if (live.t > 40) {
    // never trap a punter: if the bout somehow vanished, refund
    live.win = true; live.mult = 1;
    endSim(it, 'The bout is postponed — stake returned.');
  }
}

function openBashoBook(it, st, provCode) {
  const A = it.arena;
  if (!A.basho) seedBasho(it);
  const B = A.basho;
  const rtp = effectiveRTP('sumobracket', provCode);
  if (B.champion !== null) {
    toast(`🏆 ${escapeHtml(B.rikishi[B.champion].name)} is being carried around the hall — the next basho seeds shortly.`);
    return;
  }
  let bet = state.lastBet;
  const pendingPair = B.bout ? null : B.matches[B.winners.length];
  const champ = championProb(B);
  const alive2 = B.rikishi.map((r, i) => ({ r, i })).filter((e) => !e.r.out);
  const m = showModal(`
    <h2>🤼 The Basho Book</h2>
    <div class="subtitle">${ROUND_NAMES[B.round]} · ${B.bout ? 'a bout is under way — the next book opens after' : 'next bout soon'} · RTP ${(rtp * 100).toFixed(1)}%<br>
    Champion bets settle when the Emperor's Cup is lifted — the basho waits if you step out.</div>
    <div id="sb-list"></div>
    <div id="sb-bet"></div>
  `);
  buildBetRow(m.querySelector('#sb-bet'), (v) => { bet = v; });
  const box = m.querySelector('#sb-list');
  const addRow = (html, onPick) => {
    const row = document.createElement('div');
    row.className = 'race-lane race-pick-btn';
    row.innerHTML = html;
    row.addEventListener('click', onPick);
    box.appendChild(row);
  };
  const head = (txt) => {
    const el = document.createElement('div');
    el.style.cssText = 'font-weight:700;margin:6px 0 2px;font-size:12px;color:var(--gold-ink)';
    el.textContent = txt;
    box.appendChild(el);
  };
  if (pendingPair) {
    const [ai, bi] = pendingPair;
    const sA = B.rikishi[ai].s, sB = B.rikishi[bi].s;
    const pA = sA / (sA + sB);
    head(`NEXT BOUT — ${B.rikishi[ai].name} vs ${B.rikishi[bi].name}`);
    [[ai, pA], [bi, 1 - pA]].forEach(([idx, p], side) => {
      addRow(`<span style="flex:1;text-align:left">🤼 ${escapeHtml(B.rikishi[idx].name)} wins the bout</span><span class="odds">${fmtMult(rtp / p)}x</span>`, () => {
        if (state.balance < bet) { toast('Not enough coins!'); return; }
        spend(bet); state.stats.gamesPlayed++; renderBalance(); closeModal();
        if (!B.picks.includes(idx)) B.picks.push(idx);
        startSim(it, 'sumo', { label: `${B.rikishi[idx].name} wins the bout`, p, side: idx, key: `${ai}v${bi}` }, bet, rtp);
        B.nextT = Math.min(B.nextT, 1.2);   // the hall doesn't dawdle for a punter
      });
    });
  }
  head("THE EMPEROR'S CUP — outright champion");
  alive2.forEach(({ r, i }) => {
    const p = champ.get(i) || 0.0001;
    addRow(`<span style="flex:1;text-align:left"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${r.color}"></span> ${escapeHtml(r.name)}</span><span class="odds">${fmtMult(rtp / p)}x</span>`, () => {
      if (state.balance < bet) { toast('Not enough coins!'); return; }
      spend(bet); state.stats.gamesPlayed++; renderBalance(); closeModal();
      B.champBets.push({ idx: i, name: r.name, bet, mult: rtp / p });
      if (!B.picks.includes(i)) B.picks.push(i);
      toast(`🏆 Riding <b>${escapeHtml(r.name)}</b> to the Emperor's Cup at ${fmtMult(rtp / p)}x — settles at the final.`);
    });
  });
}

/* ============================================================
   KITE DUELS — glass string against glass string over Kite City
   ============================================================ */
function newKiteDuel(it) {
  const A = it.arena;
  const names = pickN(KITE_NAMES, 2);
  const cols = pickN(KITE_COLORS, 2);
  let kites = it.actors.filter((a) => a.type === 'kite');
  for (let i = kites.length; i < 2; i++) {
    it.addActor({ type: 'kite', arena: true, sprite: null, x: A.center.x, y: A.center.y, dir: i, frame: 0, ph: i * 2.4 });
  }
  kites = it.actors.filter((a) => a.type === 'kite');
  A.duel = names.map((name, i) => {
    kites[i].sprite = makeKiteSprite(cols[i]);
    kites[i].kIdx = i;
    kites[i].cut = false; kites[i].state = null;
    return { name, color: cols[i], actor: kites[i] };
  });
  return A.duel;
}

function updateKitesSim(it, live, dt) {
  const K = live.kite;
  const A = it.arena;
  const R = A.rect;
  const t = live.t;
  const [ka, kb] = A.duel.map((d) => d.actor);
  live.focus = { x: A.center.x, y: A.center.y + 30 };

  const fly = (a, i) => {
    if (a.cut) return;
    // duelling flight: tighter, faster figures than the ambient swoop
    let nx = R.x + R.w / 2 + Math.sin(t * (0.9 + i * 0.2) + a.ph) * (R.w * 0.34);
    let ny = R.y + R.h / 2 + Math.sin(t * (1.4 - i * 0.25) + a.ph * 2) * (R.h * 0.3);
    // clash passes pull both kites together
    if (K.ci < K.clashes.length) {
      const ct = K.clashes[K.ci];
      const d = Math.abs(t - ct);
      if (d < 0.7) {
        const pull = 1 - d / 0.7;
        nx = nx + (A.center.x - nx) * pull;
        ny = ny + (A.center.y - ny) * pull;
      }
      if (t > ct && !K[`clashed${K.ci}`]) {
        K[`clashed${K.ci}`] = true;
        live.fx.push({ text: ['LINES CROSS!', 'GLASS STRING BITES!', 'SPARKS ON THE WIND!'][K.ci % 3], x: A.center.x, y: A.center.y - 12, t: 0, color: '#ffd75e' });
        K.ci++;
      }
    }
    a.dir = nx < a.x ? 0 : 1;
    // rate-limited flight — kites dart, but never teleport
    glideTo(a, nx, ny, 150, dt);
    stepAnim(a, dt, 0.14);
  };

  if (!K.cutDone && t >= K.cutAt) {
    K.cutDone = true;
    const cutKites = K.double ? [ka, kb] : [K.winner === 0 ? kb : ka];
    for (const ck of cutKites) {
      ck.cut = true;
      ck.state = K.runaway ? 'runaway' : 'fall';
      ck.vx = (ck.x < A.center.x ? -1 : 1) * (K.runaway ? 60 : 18);
      ck.vy = K.runaway ? -34 : 10;
      live.fx.push({ text: '✂️ CUT!', x: ck.x, y: ck.y - 14, t: 0, color: '#ff8a7a' });
    }
    if (K.double) live.fx.push({ text: 'BOTH STRINGS PART!', x: A.center.x, y: A.center.y - 26, t: 0, color: '#ffd75e' });
  }

  fly(ka, 0); fly(kb, 1);
  for (const a of [ka, kb]) {
    if (!a.cut) continue;
    if (a.state === 'runaway') { a.vy -= 26 * dt; a.vx *= 1 + dt * 0.6; }
    else { a.vy += 60 * dt; a.vx *= 0.98; }
    a.x += a.vx * dt; a.y += a.vy * dt;
    a.dir = ((live.t * 6) | 0) % 2;              // tumbling flicker
    stepAnim(a, dt, 0.08);
  }

  if (K.cutDone && t > K.cutAt + 2.4) {
    const surv = A.duel[K.winner].name;
    endSim(it, K.double ? '💥 BOTH STRINGS PART — THE SKY IS EMPTY!'
      : K.runaway ? `🎐 ${A.duel[1 - K.winner].name.toUpperCase()} ESCAPES — ${surv.toUpperCase()} RULES THE SKY`
      : `🪁 ${surv.toUpperCase()} RULES THE SKY`);
  }
}

/* ============================================================
   THE BOG OF MIDDLING FORTUNE — follow the wisp, tuft by tuft.
   Each step is an honest gate: survive with p and the pot grows
   by RTP / p; sink and the bog keeps the stake. Bank at the
   keeper's stone, or cross all nine tufts for the shrine.
   ============================================================ */
function tickBog(it, dt, player) {
  const A = it.arena;
  A.wispT = (A.wispT || 0) + dt;
  if (A.bounceCd > 0) A.bounceCd -= dt;
  const tx = Math.floor(player.x / TILE), ty = Math.floor(player.y / TILE);
  const onTuft = (i) => A.tufts[i] && A.tufts[i].x === tx && A.tufts[i].y === ty;

  if (!A.stakeActive) {
    // no bargain struck: the bog gently refuses passage
    if (A.pot <= 0 && onTuft(0) && !(A.bounceCd > 0)) {
      A.bounceCd = 1.2;
      player.x = A.entrance.x; player.y = A.entrance.y;
      toast('🫧 The wisp stays dark. Strike the bargain at the keeper\'s stone first.');
    }
    return;
  }

  // stepping onto the NEXT tuft resolves it
  if (A.progress < A.tufts.length && onTuft(A.progress)) {
    const p = A.ps[A.progress];
    if (roll() < p) {
      A.pot *= A.rtp / p;
      A.progress++;
      A.stepFx = { text: `FIRM! POT ${fmt(A.pot)}`, x: player.x, y: player.y - 16, t: 0 };
      if (A.progress >= A.tufts.length) {
        // the far shrine: the crossing banks itself, plus the bog's blessing
        payout(A.pot);
        renderBalance();
        toast(`🫧 <b>YOU CROSS THE BOG!</b> The shrine pays <span class="amt">${fmt(A.pot)}</span> 🪙 — and the wisp's blessing settles on you.`, true);
        grantLuck(0.03, 90);
        A.stakeActive = false; A.pot = 0; A.progress = 0;
      }
    } else {
      toast(`🫧 <b>GLUB.</b> The tuft was a lie — the bog keeps your ${fmt(A.stake)} 🪙 stake.`);
      A.stakeActive = false; A.pot = 0; A.progress = 0;
      player.x = A.entrance.x; player.y = A.entrance.y;
    }
  }
  if (A.stepFx) { A.stepFx.t += dt; if (A.stepFx.t > 1.4) A.stepFx = null; }
}

function openBogGate(it, st, provCode) {
  const A = it.arena;
  const rtp = effectiveRTP('bogwisp', provCode);
  if (A.stakeActive || A.pot > 0) {
    const m = showModal(`
      <h2>🫧 The Keeper's Stone</h2>
      <div class="subtitle">${A.progress}/${A.tufts.length} tufts behind you · pot <b>${fmt(A.pot)}</b> 🪙</div>
      <div class="stage"><div class="big-sym">🪨</div>
      <div class="flavor">“Bank it and walk away warm — or follow the wisp deeper.
      Tuft ${A.progress + 1} holds at ${(A.ps[A.progress] * 100).toFixed(0)}%, and pays ${fmtMult(A.rtp / A.ps[A.progress])}x the pot.”</div></div>
      <div class="btn-row">
        <button class="btn" id="bog-bank">💰 Bank ${fmt(A.pot)} 🪙</button>
        <button class="btn secondary" id="bog-on">Keep wading</button>
      </div>
    `);
    m.querySelector('#bog-on').addEventListener('click', closeModal);
    m.querySelector('#bog-bank').addEventListener('click', () => {
      payout(A.pot);
      renderBalance();
      toast(`💰 Banked <span class="amt">${fmt(A.pot)}</span> 🪙 from the bog — boots barely damp.`);
      A.stakeActive = false; A.pot = 0; A.progress = 0;
      closeModal();
    });
    return;
  }
  let bet = state.lastBet;
  const ladder = A.ps.map((p, i) => `${i + 1}: ${(p * 100).toFixed(0)}%`).join(' · ');
  const fullMult = A.ps.reduce((m2, p) => m2 * (rtp / p), 1);
  const m = showModal(`
    <h2>🫧 The Wisp's Bargain</h2>
    <div class="subtitle">RTP ${(rtp * 100).toFixed(1)}% · nine tufts to the shrine · full crossing pays ~${fmtMult(fullMult)}x</div>
    <div class="stage"><div class="big-sym">🫧</div>
    <div class="flavor">“Stake your coin and the wisp lights the way, one tuft at a time.
    Firm ground grows the pot; the wrong tuft swallows the stake.
    Come back to this stone whenever you want to bank.”<br><br>
    <span style="font-size:11px;opacity:.8">Footing: ${ladder}</span></div></div>
    <div id="bog-bet"></div>
    <div class="btn-row"><button class="btn" id="bog-go">🫧 Strike the bargain</button></div>
  `);
  buildBetRow(m.querySelector('#bog-bet'), (v) => { bet = v; });
  m.querySelector('#bog-go').addEventListener('click', () => {
    if (state.balance < bet) { toast('Not enough coins for the wisp\'s toll!'); return; }
    spend(bet);
    state.stats.gamesPlayed++;
    renderBalance();
    A.stake = bet; A.pot = bet; A.progress = 0; A.rtp = rtp; A.stakeActive = true;
    closeModal();
    toast('🫧 The wisp flares over the first tuft. Follow it — or don\'t.');
  });
}

/* ============================================================
   THE GREAT MIGRATION — every so often a herd of one mid-rare
   species visibly crosses the continent. Walk among them and
   encounters with that species come thick and fast. The snares
   are priced honestly as ever — the migration only brings the
   chances to you.
   ============================================================ */
const MIG_ARCH = ['deer', 'quad', 'ram', 'hare', 'fox', 'primate'];

function migState(world) {
  const M = CONFIG.MIGRATION;
  const nowS = Date.now() / 1000;
  const idx = Math.floor(nowS / M.CYCLE_S);
  const into = nowS % M.CYCLE_S;
  if (into >= M.ACTIVE_S) return null;
  const pool = LUCKLIANS.filter((l) => MIG_ARCH.includes(l.a) && l.rare >= 0.003 && l.rare <= 0.06);
  const def = pool[Math.floor(hash2(idx, 3, 501) * pool.length) % pool.length];
  // seeded route between two far-apart cities
  const cities = world.cities;
  let a = cities[Math.floor(hash2(idx, 7, 502) * cities.length) % cities.length];
  let b = null;
  for (let k = 0; k < cities.length; k++) {
    const cand = cities[(Math.floor(hash2(idx, 11, 503) * cities.length) + k) % cities.length];
    if (Math.hypot(cand.x - a.x, cand.y - a.y) > 110) { b = cand; break; }
  }
  if (!b) b = cities[(cities.indexOf(a) + 3) % cities.length];
  return { idx, k: into / M.ACTIVE_S, def, a, b };
}

function migMembers(world) {
  const st2 = migState(world);
  if (!st2) return null;
  const M = CONFIG.MIGRATION;
  const nowS = Date.now() / 1000;
  const pts = [];
  for (let m = 0; m < M.HERD; m++) {
    // each animal trails the leader a little, drifting off the line
    const along = Math.max(0, Math.min(1, st2.k * 1.08 - m * 0.014));
    const px2 = st2.a.x + (st2.b.x - st2.a.x) * along;
    const py2 = st2.a.y + (st2.b.y - st2.a.y) * along;
    const dx = st2.b.x - st2.a.x, dy = st2.b.y - st2.a.y;
    const len = Math.hypot(dx, dy) || 1;
    const lat = (hash2(st2.idx, m * 13 + 1, 504) - 0.5) * 9 + Math.sin(nowS * 0.7 + m * 1.7) * 1.6;
    const wob = Math.sin(nowS * 1.1 + m * 2.3) * 1.1;
    pts.push({
      x: (px2 + (-dy / len) * lat + wob) * TILE,
      y: (py2 + (dx / len) * lat) * TILE,
    });
  }
  return { ...st2, pts };
}

let migWasActive = false;
export function migrationTick(world) {
  const st2 = migState(world);
  if (!!st2 !== migWasActive) {
    migWasActive = !!st2;
    if (st2) {
      toast(`🦌 <b>THE GREAT MIGRATION!</b> A herd of ${escapeHtml(st2.def.name)} is crossing from ${escapeHtml(st2.a.name)} toward ${escapeHtml(st2.b.name)} — marked on your map!`, true);
    } else {
      toast('🦌 The migration has passed on. The plains are quiet again.');
    }
  }
  // transient marker for the map screen
  if (st2) {
    const m2 = migMembers(world);
    state.mig = { name: st2.def.name, pts: m2.pts.map((p) => ({ x: Math.round(p.x / TILE), y: Math.round(p.y / TILE) })) };
  } else state.mig = null;
}

/* is the player walking among the herd? -> the species + a visual anchor */
export function migrationNear(world, px2, py2) {
  const m2 = migMembers(world);
  if (!m2) return null;
  const R = CONFIG.MIGRATION.NEAR_TILES * TILE;
  let best = null, bd = 1e9;
  for (const p of m2.pts) {
    const d = Math.hypot(p.x - px2, p.y - py2);
    if (d < bd) { bd = d; best = p; }
  }
  if (bd > R) return null;
  return { def: m2.def, tx: Math.floor(best.x / TILE), ty: Math.floor(best.y / TILE) };
}

export function drawMigration(ctx, world, camX, camY, zoom, now) {
  const m2 = migMembers(world);
  if (!m2) return;
  const spr = getLucklianSprite(m2.def);
  for (let i = 0; i < m2.pts.length; i++) {
    const p = m2.pts[i];
    const sx = (p.x - camX) * zoom, sy = (p.y - camY) * zoom;
    if (sx < -40 || sy < -40 || sx > ctx.canvas.width + 40 || sy > ctx.canvas.height + 40) continue;
    const bob = Math.sin(now / 260 + i * 1.9) * 1.5;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(sx - 5 * zoom, sy + 6 * zoom, 10 * zoom, 2 * zoom);
    ctx.drawImage(spr, Math.round(sx - (spr.width / 2) * zoom), Math.round(sy - spr.height * zoom * 0.75 + bob * zoom), spr.width * zoom, spr.height * zoom);
  }
}
