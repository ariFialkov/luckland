/* ============================================================
   Luckland — CONFIG
   ------------------------------------------------------------
   This file is the single tuning dial for the whole economy.

   * RTP (return-to-player) of every game lives in GAME_RTP.
   * Per-province RTP modifiers live in AREA_RTP_MOD and apply
     multiplicatively to every game AND concealer opened while
     the player stands in that province.
   * Concealer (chest) RTP lives in CONCEALER_RTP.

   Effective RTP = GAME_RTP[game] * AREA_RTP_MOD[province] * luck buffs.
   Everything downstream (paytables, race odds, chest loot) is
   normalized automatically to hit the effective RTP, so you can
   change any number here freely without touching game code.
   ============================================================ */

export const CONFIG = {
  // World generation seed — change for a brand new continent.
  WORLD_SEED: 20260818,

  // Starting balance for a fresh save.
  STARTING_BALANCE: 1000,

  // Full tide cycle (low -> high -> low) in seconds.
  TIDE_CYCLE_SECONDS: 300,

  // Simulated multiplayer.
  BOT_COUNT: 26,                // roaming fake players
  BOT_WIN_TOAST_MIN_S: 6,       // global "X won Y" feed cadence
  BOT_WIN_TOAST_MAX_S: 15,

  // Concealer spawning.
  CONCEALER_MAX_ACTIVE: 46,     // chests alive on the map at once
  CONCEALER_RESPAWN_S: 9,       // avg seconds between respawn attempts
};

/* ------------------------------------------------------------
   Per-game base RTP. 1.0 = break-even; casino standard ~0.92-0.97.
   ------------------------------------------------------------ */
export const GAME_RTP = {
  // Wandering street events & hub games
  pachinko:   0.95,  // MN — pachinko parlors everywhere
  slots:      0.94,  // MN — Magic Mushroom Casino slots
  sumo:       0.93,  // MN — sumo bout betting
  tali:       0.94,  // TF — Roman knucklebone dice
  chariots:   0.92,  // TF — coliseum chariot racing
  oracle:     0.95,  // TF — Parthenon oracle draw
  roadbowls:  0.94,  // FL — Irish road bowling
  cointoss:   0.95,  // FL — castle coin toss
  rainbow:    0.93,  // FL — Seamus' rainbow chase
  standoff:   0.93,  // HV — quick-draw showdown
  ponies:     0.92,  // HV — Churchill Downs races
  fivecard:   0.95,  // HV — saloon five-card flip
  mahjong:    0.94,  // DG — mahjong tile match
  sicbo:      0.95,  // DG — big/small dice
  teahouse:   0.97,  // DG — hidden tea house (whale room, generous)
  haiko:      0.96,  // EP — hi-lo card streak
  muaythai:   0.93,  // EP — fight betting
  spirits:    0.94,  // EP — temple spirit bells
};

/* Per-province multiplier applied on top of GAME_RTP + chest RTP.
   e.g. 1.02 makes a province 2% "luckier". Keep results < 1.0. */
export const AREA_RTP_MOD = {
  TF: 1.00,
  FL: 1.01,   // the luck of the Irish
  HV: 0.99,   // the house always wins out west
  DG: 1.01,
  EP: 1.00,
  MN: 0.98,   // neon lights aren't free
  SEA: 1.00,  // open water / no province
};

/* ------------------------------------------------------------
   Concealers (openable objects scattered across the world).
   price   — cost to open
   rtp     — expected value returned as loot = price * rtp * areaMod
   biomes  — province codes it can spawn in ('*' = anywhere)
   tidal   — only spawns in tide-revealed zones
   weight  — relative spawn frequency
   ------------------------------------------------------------ */
export const CONCEALER_TYPES = [
  { id: 'pouch',    name: 'Lucky Pouch',        ico: '👛', price: 25,  rtp: 0.92, weight: 30, biomes: '*' },
  { id: 'chest',    name: 'Fortune Chest',      ico: '🧰', price: 100, rtp: 0.92, weight: 18, biomes: '*' },
  { id: 'amphora',  name: 'Gilded Amphora',     ico: '🏺', price: 250, rtp: 0.93, weight: 8,  biomes: ['TF'] },
  { id: 'capsule',  name: 'Neon Gacha Capsule', ico: '🔮', price: 150, rtp: 0.93, weight: 10, biomes: ['MN'] },
  { id: 'strongbox',name: 'Outlaw Strongbox',   ico: '📦', price: 300, rtp: 0.93, weight: 8,  biomes: ['HV'] },
  { id: 'jadebox',  name: 'Jade Puzzle Box',    ico: '🎁', price: 500, rtp: 0.94, weight: 5,  biomes: ['DG'] },
  { id: 'basket',   name: 'Spirit Basket',      ico: '🧺', price: 200, rtp: 0.93, weight: 9,  biomes: ['EP'] },
  { id: 'cauldron', name: 'Rainbow Cauldron',   ico: '🍯', price: 400, rtp: 0.94, weight: 6,  biomes: ['FL'] },
  { id: 'tidelock', name: 'Tidewrought Locker', ico: '🗝️', price: 600, rtp: 0.96, weight: 4,  biomes: '*', tidal: true },
];

/* Loot rarity ladder shared by all concealers.
   value is drawn uniformly in [lo, hi] * chest price, then the whole
   table is auto-scaled so the expected value hits the chest RTP.
   Bigger rarity => flashier opening animation (particles scale off tier). */
export const RARITY_TIERS = [
  { id: 'common',    weight: 52,  lo: 0.15, hi: 0.80 },
  { id: 'uncommon',  weight: 26,  lo: 0.60, hi: 1.30 },
  { id: 'rare',      weight: 12,  lo: 1.20, hi: 2.60 },
  { id: 'epic',      weight: 6.5, lo: 2.50, hi: 6.00 },
  { id: 'legendary', weight: 2.8, lo: 6.00, hi: 18.0 },
  { id: 'mythic',    weight: 0.7, lo: 18.0, hi: 80.0 },
];

/* Chance an opened item carries a bonus add-on, and the add-on mix. */
export const ADDON_CHANCE = 0.10;
export const ADDONS = [
  { id: 'luck',  weight: 5, label: '🍀 Lucky Charm', desc: 'RTP +3% for 90s' },
  { id: 'bonus', weight: 4, label: '💰 Coin Stuffed', desc: '+50% item value' },
  { id: 'tide',  weight: 1, label: '🌊 Tide Pearl',   desc: 'Reveals tide secrets on the map for 120s' },
];

/* Bet chip denominations offered in every game UI. */
export const BET_STEPS = [5, 10, 25, 50, 100, 250, 500];

/* NPC luck blessing (e.g. spotting Yong Xin). */
export const BLESSING = { rtpBonus: 0.03, seconds: 90 };
