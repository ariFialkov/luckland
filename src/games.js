/* ============================================================
   Luckland — games of luck
   ------------------------------------------------------------
   Every game runs on one of four deterministic mechanics, all
   normalized to the effective RTP (config base RTP x province
   modifier x luck buffs):

   - paytable : weighted outcome table, multipliers auto-scaled
   - pick     : choose from N options, win prob p, payout rtp/p
   - race     : back a contender with true prob p, odds rtp/p
   - hilo     : streak of higher/lower calls, each step pays
                rtp/p, cash out any time

   Change a game's RTP in src/config.js — nothing here needs to
   be touched.
   ============================================================ */

import { roll, weightedPick, pick as rpick } from './rng.js';
import { state, spend, payout, canAfford, effectiveRTP } from './state.js';
import { showModal, closeModal, buildBetRow, escapeHtml, toast, renderBalance } from './ui.js';

/* ------------------------------------------------------------
   Game definitions
   ------------------------------------------------------------ */
export const GAME_DEFS = {
  /* ---------------- Maneki-Neko ---------------- */
  pachinko: {
    name: 'Pachinko', ico: '🎰', prov: 'MN',
    desc: 'Silver balls, neon prayers.',
    mech: 'paytable',
    table: [
      { m: 0, w: 58, sym: '⚫', text: 'The ball rattles into the gutter…' },
      { m: 1.4, w: 25, sym: '🔔', text: 'Ding! A tulip catch!' },
      { m: 3, w: 11, sym: '🌷', text: 'Double tulip cascade!' },
      { m: 8, w: 4.5, sym: '🍄', text: 'MUSHROOM MODE!' },
      { m: 45, w: 0.8, sym: '🌈', text: 'RAINBOW FEVER JACKPOT!!' },
    ],
    anim: { frames: ['⚪', '⚪ ⚪', '⚪ ⚪ ⚪'], step: 260 },
  },
  slots: {
    name: 'Mushroom Slots', ico: '🍄', prov: 'MN',
    desc: 'Three reels beneath the big glowing cap.',
    mech: 'paytable',
    table: [
      { m: 0, w: 62, reels: null, text: 'So close…' },
      { m: 2, w: 20, reels: ['🍒', '🍒', '🍒'], text: 'Cherry pop!' },
      { m: 4, w: 10, reels: ['🔔', '🔔', '🔔'], text: 'Bell chorus!' },
      { m: 10, w: 5.5, reels: ['⭐', '⭐', '⭐'], text: 'Star shower!' },
      { m: 25, w: 2, reels: ['7️⃣', '7️⃣', '7️⃣'], text: 'LUCKY SEVENS!' },
      { m: 100, w: 0.5, reels: ['💎', '💎', '💎'], text: 'DIAMOND ROYALE!!!' },
    ],
  },
  sumo: {
    name: 'Grand Sumo Bout', ico: '🤼', prov: 'MN',
    desc: 'Two mountains meet. Back one.',
    mech: 'race',
    runners: [
      { name: 'Thunderhill', ico: '🐘', p: 0.55 },
      { name: 'Little Comet', ico: '☄️', p: 0.45 },
    ],
    raceStyle: 'clash',
  },

  /* ---------------- Tyche & Fortuna ---------------- */
  tali: {
    name: 'Tali', ico: '🎲', prov: 'TF',
    desc: 'Roman knucklebones. Pray for the Venus throw.',
    mech: 'paytable',
    table: [
      { m: 0, w: 55, sym: '🎲 🎲 🎲 🎲', text: 'The Dog Throw. Fortuna looks away.' },
      { m: 1.5, w: 26, sym: '🎲 🎲 ✨ ✨', text: 'A modest cast.' },
      { m: 3, w: 12, sym: '✨ ✨ ✨ 🎲', text: 'The Senio! Well thrown!' },
      { m: 9, w: 6, sym: '✨ ✨ ✨ ✨', text: 'The Vulture — all bones alike!' },
      { m: 30, w: 1, sym: '👑 👑 👑 👑', text: 'THE VENUS THROW! The goddess smiles!' },
    ],
  },
  chariots: {
    name: 'Chariot Race', ico: '🏇', prov: 'TF',
    desc: 'Four factions thunder around the spina.',
    mech: 'race',
    runners: [
      { name: 'The Blues', ico: '🔵', p: 0.34 },
      { name: 'The Greens', ico: '🟢', p: 0.28 },
      { name: 'The Reds', ico: '🔴', p: 0.22 },
      { name: 'The Whites', ico: '⚪', p: 0.16 },
    ],
  },
  oracle: {
    name: 'Oracle of Tyche', ico: '🔮', prov: 'TF',
    desc: 'Draw an omen from the sacred bowl.',
    mech: 'paytable',
    table: [
      { m: 0, w: 52, sym: '🌫️', text: 'The omens are clouded.' },
      { m: 1.6, w: 28, sym: '🕊️', text: 'A dove — small favour comes.' },
      { m: 4, w: 13, sym: '🦉', text: 'The owl of wisdom!' },
      { m: 12, w: 6, sym: '⚡', text: 'A thunderbolt of fortune!' },
      { m: 60, w: 1, sym: '👑', text: 'TYCHE HERSELF SPEAKS!' },
    ],
  },

  /* ---------------- Four Leaf Republic ---------------- */
  roadbowls: {
    name: 'Road Bowls', ico: '🥎', prov: 'FL',
    desc: 'Loft the iron bullet down the boreen.',
    mech: 'paytable',
    table: [
      { m: 0, w: 50, sym: '🌿', text: 'Into the hedge! The lads groan.' },
      { m: 1.6, w: 30, sym: '🥎', text: 'A tidy shot past the corner.' },
      { m: 3.5, w: 14, sym: '💨', text: 'A screamer! It hums down the lane!' },
      { m: 10, w: 5, sym: '🏆', text: 'Corner to corner — mighty bowl!' },
      { m: 35, w: 1, sym: '🌈', text: 'THE PERFECT LOFT! Legend of the parish!' },
    ],
  },
  cointoss: {
    name: 'Castle Coin Toss', ico: '🪙', prov: 'FL',
    desc: 'Heads or harps, called on the battlements.',
    mech: 'pick',
    choices: [{ ico: '👑', label: 'Heads' }, { ico: '🎵', label: 'Harps' }],
    winP: 0.5,
    flavor: { win: 'The coin sings your side!', lose: 'It lands against you. The wind, surely.' },
  },
  rainbow: {
    name: 'Rainbow Chase', ico: '🌈', prov: 'FL',
    desc: 'Follow the arc, find the pot.',
    mech: 'paytable',
    table: [
      { m: 0, w: 56, sym: '🌧️', text: 'The rainbow fades into drizzle…' },
      { m: 1.5, w: 26, sym: '🍀', text: 'A four-leaf clover by the path!' },
      { m: 4, w: 12, sym: '✨', text: 'Gold dust on the wind!' },
      { m: 15, w: 5, sym: '🪙', text: 'A wee cache of coins!' },
      { m: 80, w: 0.7, sym: '🍯', text: 'THE POT OF GOLD ITSELF!!' },
    ],
  },

  /* ---------------- Horshoeville ---------------- */
  standoff: {
    name: 'High Noon Standoff', ico: '🔫', prov: 'HV',
    desc: 'Steady… steady… DRAW!',
    mech: 'standoff',
  },
  ponies: {
    name: 'Churchill Downs Derby', ico: '🏇', prov: 'HV',
    desc: 'Five furlongs of flying dust.',
    mech: 'race',
    runners: [
      { name: 'Whiskey Wind', ico: '🐎', p: 0.30 },
      { name: 'Cactus Jack', ico: '🐴', p: 0.24 },
      { name: 'Dusty Belle', ico: '🎠', p: 0.19 },
      { name: 'Sidewinder', ico: '🦄', p: 0.15 },
      { name: 'Old Biscuit', ico: '🫏', p: 0.12 },
    ],
  },
  fivecard: {
    name: 'Saloon Five-Card', ico: '🃏', prov: 'HV',
    desc: 'Five cards hit the felt. Whatcha got?',
    mech: 'paytable',
    table: [
      { m: 0, w: 50, sym: '🂠', text: 'Busted flush. Drink up.' },
      { m: 1.5, w: 28, sym: '🃏', text: 'A pair. Keeps the lamp lit.' },
      { m: 3, w: 13, sym: '🃏🃏', text: 'Two pair! Not bad, stranger.' },
      { m: 8, w: 6.5, sym: '👑', text: 'Full house! The saloon cheers!' },
      { m: 25, w: 2, sym: '🔥', text: 'FOUR OF A KIND!' },
      { m: 120, w: 0.35, sym: '💫', text: 'ROYAL FLUSH — DRINKS ON THE HOUSE!' },
    ],
  },

  /* ---------------- Dragonia ---------------- */
  mahjong: {
    name: 'Alley Mahjong', ico: '🀄', prov: 'DG',
    desc: 'Match the dragon tile. One in three.',
    mech: 'pick',
    choices: [{ ico: '🀄', label: 'Left' }, { ico: '🀄', label: 'Middle' }, { ico: '🀄', label: 'Right' }],
    winP: 1 / 3, hidden: true,
    flavor: { win: 'The red dragon! A perfect match!', lose: 'A circle tile. The old men chuckle.' },
  },
  sicbo: {
    name: 'Sic Bo', ico: '🎲', prov: 'DG',
    desc: 'Three dice in the cage. Big or Small?',
    mech: 'pick',
    choices: [{ ico: '🐉', label: 'Big (11–17)' }, { ico: '🐭', label: 'Small (4–10)' }],
    winP: 0.486,
    flavor: { win: 'The cage rattles in your favour!', lose: 'The dice betray you.' },
  },
  teahouse: {
    name: 'The Jade Cup', ico: '🍵', prov: 'DG',
    desc: 'Two cups. One holds the golden leaf. Serenity, then riches.',
    mech: 'pick',
    choices: [{ ico: '🍵', label: 'First cup' }, { ico: '🍵', label: 'Second cup' }],
    winP: 0.5, hidden: true,
    flavor: { win: 'The golden leaf unfurls. The host bows.', lose: 'Fragrant, but empty. The host smiles knowingly.' },
  },

  /* ---------------- Elephantium ---------------- */
  haiko: {
    name: 'Haiko', ico: '🃏', prov: 'EP',
    desc: 'Higher or lower — ride the streak, cash out before the mists take it.',
    mech: 'hilo',
  },
  muaythai: {
    name: 'Muay Thai Main Event', ico: '🥊', prov: 'EP',
    desc: 'Eight limbs, one purse.',
    mech: 'race',
    runners: [
      { name: 'Khrueang', ico: '🥊', p: 0.58 },
      { name: 'The Challenger', ico: '🥋', p: 0.42 },
    ],
    raceStyle: 'clash',
  },
  spirits: {
    name: 'Temple Bells', ico: '🔔', prov: 'EP',
    desc: 'Three bells. One holds a blessing.',
    mech: 'pick',
    choices: [{ ico: '🔔', label: 'First' }, { ico: '🔔', label: 'Second' }, { ico: '🔔', label: 'Third' }],
    winP: 1 / 3, hidden: true,
    flavor: { win: 'The bell rings pure gold!', lose: 'A dull clang. The spirits doze.' },
  },
};

/* ------------------------------------------------------------
   Engine helpers
   ------------------------------------------------------------ */
let session = 0; // bumped whenever a modal opens/closes, cancels stale timers

function normalizedTable(table, rtp) {
  // Keep the designed multipliers clean (2x, 10x, ...) and instead
  // resize the losing entry's weight so the table's EV = rtp exactly.
  const zero = table.find((e) => e.m === 0);
  let wn = 0, evn = 0;
  for (const e of table) if (e.m > 0) { wn += e.w; evn += e.w * e.m; }
  const missW = evn / rtp - wn;
  if (zero && missW > 0) {
    return table.map((e) => (e.m === 0 ? { ...e, w: missW } : e));
  }
  // fallback (no miss entry, or rtp too high for one): scale multipliers
  let tw = 0, ev = 0;
  for (const e of table) { tw += e.w; ev += e.w * e.m; }
  const scale = rtp / (ev / tw);
  return table.map((e) => ({ ...e, m: e.m * scale }));
}

function fmtMult(m) { return m >= 10 ? m.toFixed(0) : m.toFixed(2).replace(/\.?0+$/, ''); }
function fmtCoins(v) { return Math.round(v).toLocaleString('en-US'); }

function settle(bet, mult, stageEl, flavorText) {
  const win = bet * mult;
  const line = document.createElement('div');
  line.className = 'result-line ' + (win > 0 ? 'win' : 'lose');
  if (win > 0) {
    payout(win);
    line.textContent = `WIN ${fmtCoins(win)} 🪙 (${fmtMult(mult)}x)`;
    if (mult >= 8) {
      toast(`<span class="who">You</span> won <span class="amt">${fmtCoins(win)}</span> — ${escapeHtml(flavorText || 'a huge hit!')}`, true);
      const ring = document.createElement('div');
      ring.className = 'glow-ring';
      stageEl.appendChild(ring);
    }
  } else {
    line.textContent = 'No luck this time…';
  }
  stageEl.appendChild(line);
  if (flavorText) {
    const f = document.createElement('div');
    f.className = 'flavor';
    f.textContent = flavorText;
    stageEl.appendChild(f);
  }
  renderBalance();
  return win;
}

function baseModal(def, provCode, extraSub = '') {
  session++;
  const rtp = effectiveRTP(gameIdOf(def), provCode);
  showModal(`
    <h2>${def.ico} ${escapeHtml(def.name)}</h2>
    <div class="subtitle">${escapeHtml(def.desc)} ${extraSub} · RTP ${(rtp * 100).toFixed(1)}%</div>
    <div class="stage" id="g-stage"></div>
    <div id="g-bet"></div>
    <div class="btn-row" id="g-actions"></div>
  `, { onClose: () => { session++; } });
  return {
    rtp,
    stage: document.getElementById('g-stage'),
    betBox: document.getElementById('g-bet'),
    actions: document.getElementById('g-actions'),
  };
}

function gameIdOf(def) {
  for (const [id, d] of Object.entries(GAME_DEFS)) if (d === def) return id;
  return 'unknown';
}

function playGuard(bet) {
  if (!canAfford(bet)) {
    toast('Not enough coins! Crack a cheaper chest or lower your bet.');
    return false;
  }
  spend(bet);
  state.stats.gamesPlayed++;
  renderBalance();
  return true;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function alive(s) { return s === session; }

/* ------------------------------------------------------------
   Mechanic: paytable
   ------------------------------------------------------------ */
async function runPaytable(def, provCode) {
  const ui = baseModal(def, provCode);
  const table = normalizedTable(def.table, ui.rtp);
  let bet = state.lastBet;
  buildBetRow(ui.betBox, (v) => { bet = v; });

  const playBtn = document.createElement('button');
  playBtn.className = 'btn';
  playBtn.textContent = `${def.ico} Play`;
  ui.actions.appendChild(playBtn);
  ui.stage.innerHTML = `<div class="big-sym">${def.ico}</div><div class="flavor">Place your bet and play!</div>`;

  playBtn.addEventListener('click', async () => {
    const s = session;
    if (!playGuard(bet)) return;
    playBtn.disabled = true;

    const outcome = weightedPick(table.map((e) => ({ ...e, weight: e.w })));

    if (def.mech === 'paytable' && def.table[0].reels !== undefined) {
      // slot-style: spinning reels resolve one by one
      ui.stage.innerHTML = `<div class="big-sym" id="reels"><span class="spin">🍒</span> <span class="spin">🔔</span> <span class="spin">⭐</span></div>`;
      const pool = ['🍒', '🔔', '⭐', '7️⃣', '💎', '🍄'];
      let reels = outcome.reels;
      if (!reels) { // construct a near-miss losing board
        reels = [rpick(pool), rpick(pool), rpick(pool)];
        while (reels[0] === reels[1] && reels[1] === reels[2]) reels[2] = rpick(pool);
      }
      for (let i = 0; i < 3; i++) {
        await wait(500);
        if (!alive(s)) return;
        const spans = document.getElementById('reels').children;
        spans[i].classList.remove('spin');
        spans[i].textContent = reels[i];
      }
      await wait(250);
    } else {
      // generic themed animation
      ui.stage.innerHTML = `<div class="big-sym"><span class="shake">${def.ico}</span></div>`;
      await wait(900);
      if (!alive(s)) return;
      ui.stage.innerHTML = `<div class="big-sym">${outcome.sym || def.ico}</div>`;
      await wait(300);
    }
    if (!alive(s)) return;
    settle(bet, outcome.m, ui.stage, outcome.text);
    playBtn.disabled = false;
  });
}

/* ------------------------------------------------------------
   Mechanic: pick (N choices, prob p, pays rtp/p)
   ------------------------------------------------------------ */
async function runPick(def, provCode) {
  const mult = () => effectiveRTP(gameIdOf(def), provCode) / def.winP;
  const ui = baseModal(def, provCode, `· win pays ${fmtMult(effectiveRTP(gameIdOf(def), provCode) / def.winP)}x`);
  let bet = state.lastBet;
  buildBetRow(ui.betBox, (v) => { bet = v; });

  function board() {
    ui.stage.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'choice-grid';
    def.choices.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'choice-card' + (def.hidden ? ' back' : '');
      b.textContent = def.hidden ? '❓' : c.ico;
      b.title = c.label;
      b.addEventListener('click', () => choose(i, grid));
      grid.appendChild(b);
    });
    ui.stage.appendChild(grid);
    const f = document.createElement('div');
    f.className = 'flavor';
    f.textContent = def.hidden ? 'Pick one…' : 'Call it…';
    ui.stage.appendChild(f);
  }

  async function choose(i, grid) {
    const s = session;
    if (!playGuard(bet)) return;
    for (const b of grid.children) b.style.pointerEvents = 'none';
    const win = roll() < def.winP;
    const cards = grid.children;
    await wait(450);
    if (!alive(s)) return;
    if (def.hidden) {
      // reveal: chosen card shows result; sell the fantasy on the others
      for (let j = 0; j < cards.length; j++) {
        cards[j].classList.remove('back');
        cards[j].classList.add('flip');
        if (j === i) cards[j].textContent = win ? def.choices[j].ico : '💨';
        else cards[j].textContent = win ? '💨' : (j === (i + 1) % cards.length ? def.choices[j].ico : '💨');
      }
    } else {
      cards[i].style.outline = '3px solid #ffd75e';
    }
    await wait(500);
    if (!alive(s)) return;
    settle(bet, win ? mult() : 0, ui.stage, win ? def.flavor.win : def.flavor.lose);
    const again = document.createElement('button');
    again.className = 'btn secondary';
    again.textContent = 'Again';
    again.addEventListener('click', board);
    ui.stage.appendChild(again);
  }
  board();
}

/* ------------------------------------------------------------
   Mechanic: race (back a contender, odds = rtp / p)
   ------------------------------------------------------------ */
async function runRace(def, provCode) {
  const ui = baseModal(def, provCode);
  let bet = state.lastBet;
  buildBetRow(ui.betBox, (v) => { bet = v; });

  function board() {
    const rtp = effectiveRTP(gameIdOf(def), provCode);
    ui.stage.innerHTML = `<div class="flavor" style="margin-bottom:6px">Back a contender — tap to bet!</div>`;
    def.runners.forEach((r, i) => {
      const lane = document.createElement('div');
      lane.className = 'race-lane race-pick-btn';
      lane.innerHTML = `<span style="width:110px;text-align:left">${r.ico} ${escapeHtml(r.name)}</span>
        <div class="track"><div class="runner">${r.ico}</div></div>
        <span class="odds">${fmtMult(rtp / r.p)}x</span>`;
      lane.addEventListener('click', () => start(i));
      ui.stage.appendChild(lane);
    });
  }

  async function start(pickIdx) {
    const s = session;
    if (!playGuard(bet)) return;
    const rtp = effectiveRTP(gameIdOf(def), provCode);
    // draw the true winner by probability
    let r = roll(), winner = 0;
    for (let i = 0; i < def.runners.length; i++) { r -= def.runners[i].p; if (r <= 0) { winner = i; break; } }

    const lanes = [...ui.stage.querySelectorAll('.race-lane')];
    lanes.forEach((l, i) => {
      l.classList.toggle('pick', i === pickIdx);
      l.style.pointerEvents = 'none';
    });
    const prog = def.runners.map(() => 0);
    const STEPS = 9;
    for (let step = 0; step < STEPS; step++) {
      await wait(300);
      if (!alive(s)) return;
      for (let i = 0; i < prog.length; i++) {
        // winner is gently rigged to finish first; others jockey around
        const boost = i === winner ? 1 : 0.55 + roll() * 0.45;
        prog[i] = Math.min(1, prog[i] + (roll() * 0.6 + 0.55) * boost / (STEPS - 2));
        if (i !== winner && step === STEPS - 1) prog[i] = Math.min(prog[i], 0.96);
        const track = lanes[i].querySelector('.track');
        const runner = lanes[i].querySelector('.runner');
        runner.style.left = `${prog[i] * (track.clientWidth - 22)}px`;
      }
    }
    await wait(350);
    if (!alive(s)) return;
    const won = pickIdx === winner;
    const flavor = won
      ? `${def.runners[winner].ico} ${def.runners[winner].name} takes it — your call!`
      : `${def.runners[winner].ico} ${def.runners[winner].name} takes it. Your pick faded late.`;
    settle(bet, won ? rtp / def.runners[pickIdx].p : 0, ui.stage, flavor);
    const again = document.createElement('button');
    again.className = 'btn secondary';
    again.textContent = 'New race';
    again.addEventListener('click', board);
    ui.stage.appendChild(again);
  }
  board();
}

/* ------------------------------------------------------------
   Mechanic: hi-lo streak (Haiko)
   ------------------------------------------------------------ */
async function runHilo(def, provCode) {
  const ui = baseModal(def, provCode);
  let bet = state.lastBet;
  buildBetRow(ui.betBox, (v) => { bet = v; });

  const CARDS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  let card, mult, active = false;

  const startBtn = document.createElement('button');
  startBtn.className = 'btn';
  startBtn.textContent = '🃏 Deal';
  ui.actions.appendChild(startBtn);
  ui.stage.innerHTML = `<div class="big-sym">🃏</div><div class="flavor">Chain correct calls. Cash out before you miss.</div>`;

  function draw() { return 1 + Math.floor(roll() * 13); }

  function renderHand(msg) {
    const rtp = effectiveRTP('haiko', provCode);
    const pHi = (13 - card) / 13, pLo = (card - 1) / 13; // ties lose
    ui.stage.innerHTML = `
      <div class="big-sym">🂠 <b>${CARDS[card - 1]}</b> 🂠</div>
      <div class="flavor">${escapeHtml(msg)}</div>
      <div class="flavor">Streak pot: <b style="color:#ffd75e">${fmtCoins(bet * mult)}</b> (${fmtMult(mult)}x)</div>
      <div class="choice-grid">
        <button class="choice-card" id="hi" style="font-size:15px" ${pHi <= 0 ? 'disabled' : ''}>⬆️<br>Higher<br>${pHi > 0 ? fmtMult(rtp / pHi) + 'x' : '—'}</button>
        <button class="choice-card" id="lo" style="font-size:15px" ${pLo <= 0 ? 'disabled' : ''}>⬇️<br>Lower<br>${pLo > 0 ? fmtMult(rtp / pLo) + 'x' : '—'}</button>
        <button class="choice-card" id="cash" style="font-size:15px">💰<br>Cash<br>Out</button>
      </div>`;
    document.getElementById('hi').addEventListener('click', () => call(true));
    document.getElementById('lo').addEventListener('click', () => call(false));
    document.getElementById('cash').addEventListener('click', cashOut);
  }

  async function call(higher) {
    const s = session;
    const rtp = effectiveRTP('haiko', provCode);
    const p = higher ? (13 - card) / 13 : (card - 1) / 13;
    const next = draw();
    ui.stage.querySelectorAll('.choice-card').forEach((b) => (b.style.pointerEvents = 'none'));
    await wait(500);
    if (!alive(s)) return;
    const win = higher ? next > card : next < card;
    if (win) {
      mult *= rtp / p;
      card = next;
      renderHand(`A ${CARDS[next - 1]} — called it! The mist parts.`);
    } else {
      active = false;
      ui.stage.innerHTML = `<div class="big-sym">🂠 <b>${CARDS[next - 1]}</b> 🂠</div>`;
      settle(0, 0, ui.stage, `The ${CARDS[next - 1]} ends the streak. The mists reclaim the pot.`);
      startBtn.disabled = false;
    }
  }

  function cashOut() {
    if (!active) return;
    active = false;
    ui.stage.innerHTML = `<div class="big-sym">💰</div>`;
    settle(bet, mult, ui.stage, 'You slip away into the fog with the pot.');
    startBtn.disabled = false;
  }

  startBtn.addEventListener('click', () => {
    if (!playGuard(bet)) return;
    startBtn.disabled = true;
    active = true;
    card = draw();
    mult = 1;
    renderHand('The dealer turns the first card…');
  });
}

/* ------------------------------------------------------------
   Mechanic: standoff (HV quick-draw)
   ------------------------------------------------------------ */
async function runStandoff(def, provCode) {
  const ui = baseModal(def, provCode, '· win pays 2x');
  let bet = state.lastBet;
  buildBetRow(ui.betBox, (v) => { bet = v; });

  const startBtn = document.createElement('button');
  startBtn.className = 'btn danger';
  startBtn.textContent = '🔫 Face off';
  ui.actions.appendChild(startBtn);
  ui.stage.innerHTML = `<div class="big-sym">🤠 🆚 😈</div><div class="flavor">Winner takes double. Don't blink.</div>`;

  startBtn.addEventListener('click', async () => {
    const s = session;
    if (!playGuard(bet)) return;
    startBtn.disabled = true;
    const rtp = effectiveRTP('standoff', provCode);
    const pWin = rtp / 2; // fixed 2x payout keeps the RTP exact

    ui.stage.innerHTML = `<div class="big-sym">🤠 · · · 😈</div><div class="flavor">The clock creeps toward noon…</div>`;
    for (const t of ['🕛 High noon…', '🌵 A tumbleweed rolls by…', '👀 Eyes narrow…']) {
      await wait(750);
      if (!alive(s)) return;
      ui.stage.querySelector('.flavor').textContent = t;
    }
    await wait(400 + roll() * 900);
    if (!alive(s)) return;
    ui.stage.innerHTML = `<div class="big-sym" style="color:#ffd75e">⚡ DRAW! ⚡</div>`;
    await wait(500);
    if (!alive(s)) return;
    const win = roll() < pWin;
    ui.stage.innerHTML = `<div class="big-sym">${win ? '🤠💥' : '💥😈'}</div>`;
    settle(bet, win ? 2 : 0, ui.stage,
      win ? 'Fastest hand in Horshoeville! Your rival tips his hat and limps off.'
          : 'Out-drawn! You lose your stake — and a little dignity.');
    startBtn.disabled = false;
  });
}

/* ------------------------------------------------------------
   Entry point
   ------------------------------------------------------------ */
export function openGame(gameId, provCode) {
  const def = GAME_DEFS[gameId];
  if (!def) return;
  switch (def.mech) {
    case 'paytable': runPaytable(def, provCode); break;
    case 'pick': runPick(def, provCode); break;
    case 'race': runRace(def, provCode); break;
    case 'hilo': runHilo(def, provCode); break;
    case 'standoff': runStandoff(def, provCode); break;
  }
}

/* Landmark hub menu (list of that building's games). */
export function openHub(landmark, provCode) {
  session++;
  showModal(`
    <h2>${landmark.ico} ${escapeHtml(landmark.name)}</h2>
    <div class="subtitle">${escapeHtml(landmark.desc)}</div>
    <div class="hub-list" id="hub-list"></div>
    <div class="btn-row"><button class="btn secondary" id="hub-leave">Step outside</button></div>
  `);
  const list = document.getElementById('hub-list');
  for (const gid of landmark.games) {
    const def = GAME_DEFS[gid];
    if (!def) continue;
    const b = document.createElement('button');
    b.className = 'hub-game-btn';
    b.innerHTML = `<span class="g-ico">${def.ico}</span><span>${escapeHtml(def.name)}<span class="g-desc">${escapeHtml(def.desc)} · RTP ${(effectiveRTP(gid, provCode) * 100).toFixed(1)}%</span></span>`;
    b.addEventListener('click', () => openGame(gid, provCode));
    list.appendChild(b);
  }
  document.getElementById('hub-leave').addEventListener('click', closeModal);
}
