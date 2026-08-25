/* ============================================================
   Luckland — player state, stats, buffs, persistence
   ============================================================ */

import { CONFIG, AREA_RTP_MOD, GAME_RTP } from './config.js';

const SAVE_KEY = 'luckland-save-v1';

export const state = {
  balance: CONFIG.STARTING_BALANCE,
  px: 0, py: 0,              // player position (world px), set by main on boot
  stats: {
    wagered: 0,
    won: 0,
    gamesPlayed: 0,
    chestsOpened: 0,
    chestSpent: 0,
    chestWon: 0,
    biggestWin: 0,
    distance: 0,
    npcsMet: 0,
  },
  collection: [],            // unique item names discovered
  metNpcs: [],               // npc ids greeted at least once
  lk: { caught: {}, seen: {}, sales: 0, salesDay: '' },   // Lucklians
  gear: { rod: false },      // one-time equipment (fishing rod)
  hunt: null,                // active Grand Scavenger Hunt (see hunts.js)
  buffs: {
    luckUntil: 0,            // epoch ms; while active, +rtp bonus
    luckBonus: 0,
    tideSightUntil: 0,       // reveals tidal secrets on the map
  },
  lastBet: 25,
};

export function luckActive() { return Date.now() < state.buffs.luckUntil; }
export function tideSightActive() { return Date.now() < state.buffs.tideSightUntil; }

export function grantLuck(bonus, seconds) {
  state.buffs.luckBonus = bonus;
  state.buffs.luckUntil = Date.now() + seconds * 1000;
}

/* Effective RTP for a game id while standing in a province. */
export function effectiveRTP(gameId, provCode) {
  let rtp = (GAME_RTP[gameId] ?? 0.94) * (AREA_RTP_MOD[provCode] ?? 1);
  if (luckActive()) rtp += state.buffs.luckBonus;
  return Math.min(rtp, 0.995); // never let a buff push RTP >= 1
}

export function effectiveChestRTP(baseRtp, provCode) {
  let rtp = baseRtp * (AREA_RTP_MOD[provCode] ?? 1);
  if (luckActive()) rtp += state.buffs.luckBonus;
  return Math.min(rtp, 0.995);
}

/* ---------------- wallet ---------------- */
const listeners = [];
export function onBalanceChange(fn) { listeners.push(fn); }
function notify(delta) { for (const fn of listeners) fn(state.balance, delta); }

export function canAfford(amount) { return state.balance >= amount; }

export function spend(amount, isChest = false) {
  if (state.balance < amount) return false;
  state.balance -= amount;
  if (isChest) state.stats.chestSpent += amount;
  else state.stats.wagered += amount;
  notify(-amount);
  return true;
}

export function payout(amount, isChest = false) {
  if (amount <= 0) return;
  state.balance += amount;
  if (isChest) state.stats.chestWon += amount;
  else state.stats.won += amount;
  if (amount > state.stats.biggestWin) state.stats.biggestWin = amount;
  notify(amount);
}

export function addToCollection(name) {
  if (!state.collection.includes(name)) state.collection.push(name);
}

export function meetNpc(id) {
  if (!state.metNpcs.includes(id)) {
    state.metNpcs.push(id);
    state.stats.npcsMet = state.metNpcs.length;
    return true;
  }
  return false;
}

/* ---------------- persistence ---------------- */
export function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      balance: state.balance,
      px: state.px, py: state.py,
      stats: state.stats,
      collection: state.collection,
      metNpcs: state.metNpcs,
      lastBet: state.lastBet,
      lk: state.lk,
      gear: state.gear,
      hunt: state.hunt,
    }));
  } catch { /* storage full / private mode — play on without saving */ }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    if (typeof d.balance === 'number') state.balance = d.balance;
    if (typeof d.px === 'number') { state.px = d.px; state.py = d.py; }
    Object.assign(state.stats, d.stats || {});
    state.collection = d.collection || [];
    state.metNpcs = d.metNpcs || [];
    state.stats.npcsMet = state.metNpcs.length;
    if (typeof d.lastBet === 'number') state.lastBet = d.lastBet;
    if (d.lk && typeof d.lk === 'object') {
      state.lk = { caught: d.lk.caught || {}, seen: d.lk.seen || {}, sales: d.lk.sales || 0, salesDay: d.lk.salesDay || '' };
    }
    if (d.gear && typeof d.gear === 'object') state.gear = { rod: !!d.gear.rod };
    if (d.hunt && typeof d.hunt === 'object' && Array.isArray(d.hunt.list)) state.hunt = d.hunt;
    return true;
  } catch { return false; }
}

export function resetGame() {
  localStorage.removeItem(SAVE_KEY);
  location.reload();
}

/* autosave */
setInterval(saveGame, 5000);
window.addEventListener('beforeunload', saveGame);
