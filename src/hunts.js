/* ============================================================
   Luckland — the Grand Scavenger Hunt
   ------------------------------------------------------------
   Sign up at a striped tent, draw a card of four local Lucklians
   and race a field of rival contestants to catch them all (in
   any order). Each catch of a listed species offers a choice:
   contribute it to your hunt card — forfeiting its sale value —
   or keep it to sell as usual. Finish the card and the podium
   pays out.

   Honesty: the true stake is the sign-up fee PLUS the total face
   value of the four contributed creatures. Your finishing
   position is drawn up front from CONFIG.HUNT.Q and the prize
   ladder is scaled so E[prize] = stake x the configured RTP —
   tilted toward a fat gold-medal purse. The rivals' pace is
   choreographed around yours so the board always agrees with
   the drawn result.
   ============================================================ */

import { CONFIG } from './config.js';
import { roll } from './rng.js';
import { state, spend, payout, canAfford, effectiveRTP } from './state.js';
import { showModal, closeModal, escapeHtml, toast, renderBalance, isModalOpen } from './ui.js';
import { LUCKLIANS, BY_ID, setCatchHook, rarityTier } from './lucklians.js';
import { getLucklianSprite } from './sprites.js';
import { PROVINCES } from './world.js';

const H = CONFIG.HUNT;

const RIVAL_NAMES = [
  'Poppy Bramblefoot', 'Old Silas', 'Nixie Two-Snares', 'Bao the Patient',
  'Colm Quickstep', 'Sadie Longeye', 'Kenji Dawnrunner', 'Marnie Whistlewind',
  'Ptolemy the Younger', 'Granny Ashvale', 'Tuk of the Reeds', 'Vera Nightlark',
  'Duffy McBride', 'Anong Swiftgrass', 'Reverend Toe', 'Little Miss Mireille',
];

const fmt = (v) => Math.round(v).toLocaleString('en-US');
const MEDALS = ['🥇', '🥈', '🥉'];

function sprImg(def, px = 26) {
  return `<img src="${getLucklianSprite(def).toDataURL()}" style="width:${px}px;height:auto;image-rendering:pixelated" alt="">`;
}

/* ------------------------------------------------------------
   The card: 3 everyday locals + 1 harder "star" species, all
   native to the tent's province so the hunt stays in-country.
   ------------------------------------------------------------ */
function rollCard(prov) {
  const local = LUCKLIANS.filter((l) => l.prov === prov);
  const commons = local.filter((l) => l.rare >= 0.05);
  const stars = local.filter((l) => l.rare >= 0.01 && l.rare < 0.05);
  const take = (arr, n) => {
    const pool = [...arr], out = [];
    while (out.length < n && pool.length) out.push(pool.splice((roll() * pool.length) | 0, 1)[0]);
    return out;
  };
  const card = take(commons, H.LIST_SIZE - 1).concat(take(stars, 1));
  // thin province? fill from whatever locals remain, commonest first
  if (card.length < H.LIST_SIZE) {
    const rest = local.filter((l) => !card.includes(l)).sort((a, b) => b.rare - a.rare);
    while (card.length < H.LIST_SIZE && rest.length) card.push(rest.shift());
  }
  return card;
}

export function prizeLadder(stake, rtp) {
  const evK = H.Q.reduce((a, q, i) => a + q * H.K[i], 0);
  const scale = rtp / evK;
  return H.K.map((k) => Math.round(k * scale * stake));
}

function drawPosition() {
  let r = roll();
  for (let i = 0; i < H.Q.length; i++) { r -= H.Q[i]; if (r <= 0) return i; }
  return H.Q.length - 1;
}

/* ------------------------------------------------------------
   Sign-up lobby (opened by bumping a tent)
   ------------------------------------------------------------ */
export function openHuntLobby(provCode) {
  if (state.hunt) {
    collapsed = false;
    renderWidget(true);
    toast('🏆 You\'re already mid-hunt — the tracker in the corner has your card.');
    return;
  }
  const card = rollCard(provCode);
  if (card.length < H.LIST_SIZE) { toast('The organisers are still drawing up a card — try another tent.'); return; }
  const rtp = effectiveRTP('scavhunt', provCode);
  const V = card.reduce((a, l) => a + l.value, 0);
  const stake = H.FEE + V;
  const prizes = prizeLadder(stake, rtp);
  const rows = card.map((l) => {
    const tier = rarityTier(l.rare);
    return `<div class="hunt-row">${sprImg(l)}
      <span class="hunt-nm" style="color:${tier.color}">${escapeHtml(l.name)}</span>
      <span class="hunt-val">${fmt(l.value)} 🪙</span></div>`;
  }).join('');
  const m = showModal(`
    <h2>🏆 The Grand Scavenger Hunt</h2>
    <div class="subtitle">${escapeHtml(PROVINCES[provCode]?.name || provCode)} qualifier · ${H.BOTS} rivals · RTP ${(rtp * 100).toFixed(1)}%</div>
    <div class="hunt-card">${rows}</div>
    <div class="lk-desc">Catch all four, in any order, before the field does. Every listed Lucklian you catch
      can be <b>contributed</b> to your card — it forfeits its sale value — or kept to sell as usual.
      Contributed value (${fmt(V)} 🪙) plus the ${fmt(H.FEE)} 🪙 entry makes your true stake of <b>${fmt(stake)} 🪙</b>.</div>
    <div class="hunt-prizes">
      <span>🥇 ${fmt(prizes[0])}</span><span>🥈 ${fmt(prizes[1])}</span><span>🥉 ${fmt(prizes[2])}</span><span>4th+ nothing</span>
    </div>
    <div class="btn-row">
      <button class="btn" id="hunt-enter" ${canAfford(H.FEE) ? '' : 'disabled'}>Sign up · ${fmt(H.FEE)} 🪙</button>
      <button class="btn secondary" id="hunt-no">Not today</button>
    </div>
  `);
  document.getElementById('hunt-no').addEventListener('click', closeModal);
  document.getElementById('hunt-enter').addEventListener('click', () => {
    if (state.hunt || !spend(H.FEE)) return;
    renderBalance();
    startHunt(provCode, card, stake, prizes);
    closeModal();
    toast('🏁 <b>The hunt is on!</b> Four Lucklians, any order — the field is already moving.', true);
  });
}

function startHunt(prov, card, stake, prizes) {
  const pos = drawPosition();
  // rivals destined to finish ahead of you; off the podium means 3-5 do
  const nAhead = pos < 3 ? pos : 3 + ((roll() * 3) | 0);
  const names = [...RIVAL_NAMES];
  const bots = [];
  for (let i = 0; i < H.BOTS; i++) {
    const name = names.splice((roll() * names.length) | 0, 1)[0];
    const ahead = i < nAhead;
    bots.push({
      name, ahead,
      // leaders stay ~1 catch up so they cross first; stragglers pace off you
      lead: ahead ? 1.05 + roll() * 0.8 : 0,
      lag: ahead ? 1 : 0.3 + roll() * 0.5,
      frac: 0,
    });
  }
  state.hunt = { prov, list: card.map((l) => l.id), done: {}, stake, pos, prizes, bots, t: 0 };
  collapsed = false;
  renderWidget(true);
}

/* ------------------------------------------------------------
   Catch hook — a listed species was just caught (snare or rod).
   Offers land in a queue so they never fight another modal.
   ------------------------------------------------------------ */
const offers = [];
function onCatch(def) {
  const h = state.hunt;
  if (!h || !h.list.includes(def.id) || h.done[def.id] || offers.includes(def.id)) return;
  offers.push(def.id);
}
setCatchHook(onCatch);

function showOffer(id) {
  const h = state.hunt, def = BY_ID.get(id);
  if (!h || !def || h.done[id] || (state.lk.caught[id] || 0) === 0) return;
  showModal(`
    <h2>🏆 One from your hunt card!</h2>
    <div class="subtitle">The ${escapeHtml(def.name)} you just caught is on the list.</div>
    <div class="lk-stage">${sprImg(def, 64)}</div>
    <div class="lk-desc">Contribute it to your hunt card and it counts toward the finish — but it
      <b>forfeits its ${fmt(def.value)} 🪙 sale value</b> for good. Keep it, and it sells as usual.</div>
    <div class="btn-row">
      <button class="btn" id="hunt-give">🏆 Contribute it</button>
      <button class="btn secondary" id="hunt-keep">Keep it · worth ${fmt(def.value)} 🪙</button>
    </div>
  `);
  document.getElementById('hunt-keep').addEventListener('click', closeModal);
  document.getElementById('hunt-give').addEventListener('click', () => {
    closeModal();
    contribute(id);
  });
}

function contribute(id) {
  const h = state.hunt, def = BY_ID.get(id);
  if (!h || !def || h.done[id] || (state.lk.caught[id] || 0) === 0) return;
  state.lk.caught[id] -= 1;
  h.done[id] = true;
  const left = h.list.filter((i) => !h.done[i]).length;
  if (left > 0) toast(`🏆 ${escapeHtml(def.name)} contributed — ${left} to go!`);
  renderWidget(true);
  if (left === 0) finishHunt();
}

/* ------------------------------------------------------------
   The rivals — paced around the player so the drawn finishing
   position always comes true, while still looking like a race.
   ------------------------------------------------------------ */
let lastSig = '';
export function tickHunt(dt) {
  const h = state.hunt;
  if (!h) { if (widget) removeWidget(); return; }
  if (!widget) renderWidget(true);
  h.t += dt;
  const mine = h.list.filter((id) => h.done[id]).length;
  for (const b of h.bots) {
    const target = b.ahead
      ? Math.min(H.LIST_SIZE, mine + b.lead)                       // just out in front
      : Math.min(H.LIST_SIZE - 0.6, mine * b.lag + h.t / 900);     // trailing off your pace
    b.frac = Math.min(target, b.frac + Math.max(0, target - b.frac) * Math.min(1, dt * 0.22) + dt * 0.002);
  }
  // anything visible changed? (a rival's count, a catch of a listed
  // species, a contribution) — rebuild the tracker
  const sig = mine + '|' + h.list.map((id) => (state.lk.caught[id] || 0) > 0 ? 1 : 0).join('') +
    '|' + h.bots.map((b) => Math.floor(b.frac + 1e-6)).join(',');
  if (sig !== lastSig) { lastSig = sig; renderWidget(true); }
  if (offers.length && !isModalOpen()) showOffer(offers.shift());
}

function finishHunt() {
  const h = state.hunt;
  // the destined leaders cross the line; everyone else is caught mid-card
  for (const b of h.bots) if (b.ahead) b.frac = H.LIST_SIZE;
  const prize = h.prizes[h.pos] || 0;
  const place = h.bots.filter((b) => b.frac >= H.LIST_SIZE).length + 1;
  const standings = [
    ...h.bots.filter((b) => b.ahead).sort((a, b2) => b2.lead - a.lead).map((b) => b.name),
    'You',
    ...h.bots.filter((b) => !b.ahead).sort((a, b2) => b2.frac - a.frac).map((b) => b.name),
  ];
  if (prize > 0) payout(prize);
  renderBalance();
  const rows = standings.map((nm, i) => `
    <div class="hunt-row${nm === 'You' ? ' me' : ''}">
      <span class="hunt-medal">${MEDALS[i] || `${i + 1}th`}</span>
      <span class="hunt-nm">${escapeHtml(nm)}</span>
      <span class="hunt-val">${nm === 'You' && prize > 0 ? `+${fmt(prize)} 🪙` : ''}</span>
    </div>`).join('');
  showModal(`
    <h2>${place <= 3 ? MEDALS[place - 1] : '🏁'} Hunt complete!</h2>
    <div class="subtitle">${place <= 3 ? ['Gold! The crowd carries you to the podium!', 'Silver — a whisker behind the winner!', 'Bronze — you make the podium!'][place - 1] : 'Off the podium this time — the card was completed, but too late.'}</div>
    <div class="hunt-card">${rows}</div>
    <div class="lk-desc">${prize > 0
      ? `The organisers hand over <b>${fmt(prize)} 🪙</b> against your ${fmt(h.stake)} 🪙 stake.`
      : `No purse this time — your ${fmt(h.stake)} 🪙 stake stays with the organisers.`}</div>
    <div class="btn-row"><button class="btn" id="hunt-done">Done</button></div>
  `);
  document.getElementById('hunt-done').addEventListener('click', closeModal);
  if (prize > 0) toast(`🏆 <span class="who">You</span> took ${MEDALS[place - 1]} in the Grand Scavenger Hunt — <span class="amt">${fmt(prize)}</span>!`, place === 1);
  state.hunt = null;
  removeWidget();
}

function abandonHunt() {
  const h = state.hunt;
  if (!h) return;
  const given = h.list.filter((id) => h.done[id]).length;
  showModal(`
    <h2>🚪 Leave the hunt?</h2>
    <div class="lk-desc">Your ${fmt(H.FEE)} 🪙 entry${given ? ` and the ${given} contributed Lucklian${given > 1 ? 's' : ''}` : ''} stay with the organisers. There's no coming back to this card.</div>
    <div class="btn-row">
      <button class="btn danger" id="hunt-quit-yes">Walk away</button>
      <button class="btn secondary" id="hunt-quit-no">Keep hunting</button>
    </div>
  `);
  document.getElementById('hunt-quit-no').addEventListener('click', closeModal);
  document.getElementById('hunt-quit-yes').addEventListener('click', () => {
    state.hunt = null;
    removeWidget();
    closeModal();
    toast('You slip away from the hunt. The field thunders on without you.');
  });
}

/* ------------------------------------------------------------
   Corner tracker widget — collapsible; lives outside the canvas
   so it stays up through interiors, modals and menus.
   ------------------------------------------------------------ */
let widget = null;
let collapsed = false;

function removeWidget() {
  if (widget) { widget.remove(); widget = null; }
}

function renderWidget(full = false) {
  const h = state.hunt;
  if (!h) { removeWidget(); return; }
  if (!widget) {
    widget = document.createElement('div');
    widget.id = 'hunt-widget';
    document.body.appendChild(widget);
    full = true;
  }
  const mine = h.list.filter((id) => h.done[id]).length;
  const rivalsAhead = h.bots.filter((b) => Math.floor(b.frac + 1e-6) > mine).length;
  const place = rivalsAhead + 1;
  if (!full && !collapsed) {
    // cheap path: just refresh the board + header counts
    const head = widget.querySelector('.hw-place');
    if (head) head.textContent = `P${place}`;
    const board = widget.querySelector('.hw-board');
    if (board) board.innerHTML = boardHtml(h, mine);
    return;
  }
  widget.innerHTML = `
    <button class="hw-head" id="hw-toggle">
      <span>🏆 ${mine}/${H.LIST_SIZE}</span>
      <span class="hw-place">P${place}</span>
      <span class="hw-arrow">${collapsed ? '▸' : '▾'}</span>
    </button>
    ${collapsed ? '' : `
    <div class="hw-body">
      <div class="hw-list">${h.list.map((id) => {
        const def = BY_ID.get(id);
        const got = !!h.done[id];
        const owned = (state.lk.caught[id] || 0) > 0;
        return `<div class="hw-item${got ? ' got' : ''}">${sprImg(def, 22)}
          <span class="hw-nm">${escapeHtml(def.name)}</span>
          ${got ? '<span class="hw-tick">✔</span>'
                : owned ? `<button class="hw-use" data-id="${id}">use</button>`
                        : `<span class="hw-val">${fmt(def.value)}</span>`}</div>`;
      }).join('')}</div>
      <div class="hw-board">${boardHtml(h, mine)}</div>
      <div class="hw-prizes">🥇${fmt(h.prizes[0])} 🥈${fmt(h.prizes[1])} 🥉${fmt(h.prizes[2])}</div>
      <button class="hw-quit" id="hw-quit">Exit hunt</button>
    </div>`}
  `;
  widget.querySelector('#hw-toggle').addEventListener('click', () => {
    collapsed = !collapsed;
    renderWidget(true);
  });
  if (!collapsed) {
    widget.querySelector('#hw-quit').addEventListener('click', abandonHunt);
    widget.querySelectorAll('.hw-use').forEach((b) => b.addEventListener('click', () => contribute(+b.dataset.id)));
  }
}

function boardHtml(h, mine) {
  const rows = [
    { name: 'You', frac: mine + 0.001, me: true },
    ...h.bots.map((b) => ({ name: b.name, frac: b.frac, me: false })),
  ].sort((a, b) => b.frac - a.frac);
  return rows.map((r, i) => `<div class="hw-rival${r.me ? ' me' : ''}">
    <span>${i + 1}. ${escapeHtml(r.name)}</span><span>${Math.floor(r.frac + 1e-6)}/${H.LIST_SIZE}</span>
  </div>`).join('');
}
