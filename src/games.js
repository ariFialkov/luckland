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

import { CONFIG } from './config.js';
import { roll, weightedPick, pick as rpick, hash2 } from './rng.js';
import { state, spend, payout, canAfford, effectiveRTP, grantLuck } from './state.js';
import { showModal, closeModal, buildBetRow, escapeHtml, toast, renderBalance, paintWorldMap } from './ui.js';
import { LUCKLIANS, BY_ID, recordCatch, rarityTier } from './lucklians.js';
import { getLucklianSprite } from './sprites.js';
import { openHuntLobby } from './hunts.js';
import { openConcealer } from './concealers.js';
import { makeDrama, stepRacer } from './racing.js';
import { nightRackItem, buyItem, ensureWardrobe, RARITY as FIT_RARITY } from './wardrobe.js';

/* the overworld, registered by main at boot (map races, loft lookups) */
let worldRef = null;
export function setWorld(w) { worldRef = w; }

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
  coliseumbets: {
    name: 'The Editor\'s Book', ico: '🏟️', prov: 'TF',
    desc: 'Games all day on the sand — chariots, gladiators, glory. Name your wager.',
    mech: 'props',
    eventName: 'the games',
    props: [
      { label: 'Blues chariot wins', ico: '🔵', p: 0.47 },
      { label: 'Greens chariot wins', ico: '🟢', p: 0.43 },
      { label: 'Crash on the turns', ico: '💥', p: 0.22 },
      { label: 'Champion keeps his laurels', ico: '🏆', p: 0.55 },
      { label: 'Bout ends in mercy', ico: '🤝', p: 0.38 },
      { label: 'Upset of the day', ico: '😱', p: 0.16 },
    ],
    ticker: [
      'The gates crash open!', 'Whips crack down the straight!', 'Wheel to wheel into the turn!',
      'The crowd is on its feet!', 'Sand flies from the hooves!', 'A shield splinters!',
      'The editor raises his hand…', 'Laurels glint in the sun!',
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

  /* ---------------- Horseshoeville ---------------- */
  standoff: {
    name: 'High Noon Standoff', ico: '🔫', prov: 'HV',
    desc: 'Steady… steady… DRAW!',
    mech: 'standoff',
  },
  ponies: {
    name: 'Horseshoe Downs Derby', ico: '🏇', prov: 'HV',
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
  downsrace: {
    name: 'The Lucklian Stakes', ico: '🏁', prov: 'HV',
    desc: "The Downs' famous courser races — backed by the paddock's finest.",
    mech: 'race',
    runners: [
      { name: 'Voltjack', ico: '⚡', p: 0.28 },
      { name: 'Deadlight Courser', ico: '🔥', p: 0.22 },
      { name: 'Whitewraith', ico: '❄️', p: 0.18 },
      { name: 'Blackspur', ico: '🦌', p: 0.14 },
      { name: 'Coppergrin', ico: '🦊', p: 0.11 },
      { name: 'Old Bristlejack', ico: '🐇', p: 0.07 },
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
  muaythaibout: {
    name: 'Ringside Book', ico: '🥊', prov: 'EP',
    desc: 'The bouts never stop. Pick your prop, the ring provides.',
    mech: 'props',
    eventName: 'the bout',
    props: [
      { label: 'Red corner wins', ico: '🔴', p: 0.52 },
      { label: 'Blue corner wins', ico: '🔵', p: 0.48 },
      { label: 'Finish by knockout', ico: '💥', p: 0.34 },
      { label: 'Goes the distance', ico: '🛎️', p: 0.44 },
      { label: 'Round 1 finish', ico: '1️⃣', p: 0.14 },
      { label: 'Both fighters dropped', ico: '🤕', p: 0.09 },
    ],
    ticker: [
      'The fighters touch gloves…', 'A vicious low kick lands!', 'Clinch against the ropes — knees flying!',
      'The crowd roars for blood!', 'An elbow opens a cut!', 'The ref steps in for a count!',
      'Spinning back-fist just misses!', 'The corner screams instructions!',
    ],
  },
  /* ============================================================
     Roadside attractions — each of these has a hand-drawn prop
     standing in the world; walk into it to play.
     ============================================================ */

  /* ---------------- Greek & Roman fortune (TF) ---------------- */
  wheeltyche: {
    name: 'Wheel of Tyche', ico: '☸️', prov: 'TF',
    desc: "The goddess spins; her pointer decides.",
    mech: 'wheel',
    spinText: 'The marble wheel groans into motion…',
    segments: [
      { m: 0,   w: 30, ico: '🕸️', color: '#6d6a72', label: 'Void' },
      { m: 0,   w: 14, ico: '🌫️', color: '#7a7680', label: 'Mist' },
      { m: 1.5, w: 22, ico: '🫒', color: '#7a9a4a', label: 'Olive' },
      { m: 2.5, w: 16, ico: '🏺', color: '#b8763a', label: 'Amphora' },
      { m: 5,   w: 9,  ico: '🦉', color: '#5a7aa8', label: 'Owl' },
      { m: 12,  w: 4,  ico: '⚡', color: '#e0c020', label: 'Bolt' },
      { m: 40,  w: 1,  ico: '👑', color: '#f0c040', label: 'Crown' },
    ],
  },
  amphorae: {
    name: "Fortuna's Amphorae", ico: '🏺', prov: 'TF',
    desc: 'Sealed jars at the shrine. Only one is worth breaking.',
    mech: 'pickchain',
    options: 5, optionIco: '🏺', chainIco: '🔓', chainLabel: 'The seal cracks — choose again!',
    prizes: [
      { m: 0,   w: 40, ico: '🕷️', text: 'Dust and a very disappointed spider.' },
      { m: 1.4, w: 24, ico: '🪙', text: 'A handful of obols.' },
      { m: 3,   w: 13, ico: '🍇', text: 'Wine, oil and a tidy purse!' },
      { m: 8,   w: 5,  ico: '💍', text: 'A senator’s signet ring!' },
      { m: 30,  w: 1,  ico: '👑', text: "FORTUNA'S OWN HOARD!" },
      { chain: true, w: 9, ico: '🔓', text: 'A cracked seal — another jar is yours.' },
    ],
  },
  fatesthread: {
    name: "Fates' Thread", ico: '🧵', prov: 'TF',
    desc: 'Choose a thread. The Fates weave it — then Atropos cuts.',
    mech: 'path',
    lanes: [{ ico: '🧵', label: 'Clotho' }, { ico: '🪡', label: 'Lachesis' }, { ico: '✂️', label: 'Atropos' }],
    steps: 4, stepIco: '🌟', travelText: 'The thread winds through the loom…',
    outcomes: [
      { m: 0,   w: 46, ico: '✂️', text: 'Snip. The thread ends short.' },
      { m: 1.6, w: 26, ico: '🧶', text: 'A modest length spun out.' },
      { m: 3.5, w: 14, ico: '🌟', text: 'A shining skein!' },
      { m: 10,  w: 5,  ico: '🏵️', text: 'Woven with gold!' },
      { m: 45,  w: 1,  ico: '👑', text: 'THE THREAD OF A HERO!' },
    ],
  },

  /* ---------------- Chinese dynastic dragons (DG) ---------------- */
  pearldrop: {
    name: 'Dragon Pearl Drop', ico: '🔮', prov: 'DG',
    desc: 'Release the pearl and let the dragon decide its path.',
    mech: 'plinko',
    rows: 7, ballIco: '🔮',
    pocketIco: ['🐉', '🪙', '🧧', '🀄', '🧧', '🪙', '🐉'],
    edgeMult: 22, midMult: 0.2,
  },
  ninegates: {
    name: 'Nine Dragon Gates', ico: '⛩️', prov: 'DG',
    desc: 'Nine gates. Press on, or take the pearl and go.',
    mech: 'gates',
    gates: 9, advanceP: 0.62, gateIco: '⛩️', runnerIco: '🔮',
    passText: 'The gate swings open!', failText: 'The gate slams shut.',
  },
  dragonhoard: {
    name: "Dragon's Hoard", ico: '🏮', prov: 'DG',
    desc: 'The dragon sleeps. Choose an urn — quietly.',
    mech: 'pickchain',
    options: 4, optionIco: '⚱️', chainIco: '😴', chainLabel: 'Still asleep — take another!',
    prizes: [
      { m: 0,   w: 38, ico: '💨', text: 'Empty. The dragon snores on.' },
      { m: 1.5, w: 25, ico: '🪙', text: 'A scoop of old coin.' },
      { m: 3.5, w: 12, ico: '🧧', text: 'Silk and red envelopes!' },
      { m: 9,   w: 5,  ico: '💎', text: 'A jade cache!' },
      { m: 35,  w: 1,  ico: '🐉', text: 'THE HEART OF THE HOARD!' },
      { chain: true, w: 10, ico: '😴', text: 'The dragon stirs… and settles. Another urn.' },
    ],
  },

  /* ---------------- Wild West horseshoes (HV) ---------------- */
  horseshoetoss: {
    name: 'Lucky Horseshoe Toss', ico: '🧲', prov: 'HV',
    desc: 'Iron through the air. Ringers pay.',
    mech: 'paytable', animIco: '🧲',
    table: [
      { m: 0,   w: 44, sym: '💨', text: 'Wide. The dust laughs at you.' },
      { m: 1.6, w: 28, sym: '🪨', text: 'A leaner against the stake.' },
      { m: 3.5, w: 15, sym: '🧲', text: 'RINGER! The crowd whoops.' },
      { m: 12,  w: 4,  sym: '🎯', text: 'DOUBLE RINGER!' },
      { m: 40,  w: 0.8, sym: '🏆', text: 'THREE IN A ROW — RECORD BOARD!' },
    ],
  },
  goldencorral: {
    name: 'The Golden Corral', ico: '🐎', prov: 'HV',
    desc: 'Six furlongs of tiny thunder.',
    mech: 'race',
    runners: [
      { name: 'Brass Bessie', ico: '🐎', p: 0.32 },
      { name: 'Tin Tornado', ico: '🐴', p: 0.26 },
      { name: 'Copper Colt', ico: '🎠', p: 0.22 },
      { name: 'Rusty Nail', ico: '🫏', p: 0.20 },
    ],
  },
  prospector: {
    name: "Prospector's Horseshoe", ico: '⛏️', prov: 'HV',
    desc: 'Pick a mound. Dig. Pray.',
    mech: 'pickchain',
    options: 4, optionIco: '⛰️', chainIco: '🕯️', chainLabel: 'The lantern shows another mound!',
    prizes: [
      { m: 0,   w: 40, ico: '🦴', text: 'A coyote bone. Charming.' },
      { m: 1.5, w: 24, ico: '🧲', text: 'Iron horseshoe — worth a drink.' },
      { m: 3.5, w: 13, ico: '🥈', text: 'Silver horseshoe!' },
      { m: 9,   w: 5,  ico: '🥇', text: 'GOLD HORSESHOE!' },
      { m: 40,  w: 0.9, sym: '💠', ico: '💠', text: 'THE LEGENDARY SHOE OF EL DORADO!' },
      { chain: true, w: 10, ico: '🕯️', text: 'Your lantern catches another mound.' },
    ],
  },

  /* ---------------- Celtic clovers (FL) ---------------- */
  cloverbloom: {
    name: 'Clover Bloom', ico: '🍀', prov: 'FL',
    desc: 'The patch blooms. Count the leaves.',
    mech: 'paytable', animIco: '🌱',
    table: [
      { m: 0,   w: 46, sym: '☘️', text: 'Three leaves. Common as rain.' },
      { m: 1.7, w: 26, sym: '🍀', text: 'Four leaves! A tidy bloom.' },
      { m: 4,   w: 12, sym: '🍀🍀', text: 'A double four-leaf!' },
      { m: 12,  w: 4,  sym: '🌟', text: 'FIVE LEAVES — unheard of!' },
      { m: 60,  w: 0.7, sym: '🌈', text: 'A SIX-LEAF CLOVER! The parish will sing of it!' },
    ],
  },
  faeriering: {
    name: 'Faerie Ring', ico: '🍄', prov: 'FL',
    desc: 'The mushrooms light in turn. Where they stop, nobody knows.',
    mech: 'wheel',
    spinText: 'The ring lights up, one cap at a time…',
    segments: [
      { m: 0,   w: 32, ico: '🍂', color: '#7a6a4a', label: 'Withered' },
      { m: 0,   w: 12, ico: '🌫️', color: '#8a94a0', label: 'Fog' },
      { m: 1.6, w: 24, ico: '🍄', color: '#c05a48', label: 'Red cap' },
      { m: 3,   w: 15, ico: '🌼', color: '#e8d060', label: 'Daisy' },
      { m: 6,   w: 8,  ico: '🧚', color: '#8a6ac0', label: 'Faerie' },
      { m: 15,  w: 3,  ico: '💚', color: '#4faf50', label: 'Green flame' },
      { m: 50,  w: 0.8, ico: '🌈', color: '#f0c040', label: 'Rainbow' },
    ],
  },
  grovereels: {
    name: 'Luck of the Grove', ico: '🗿', prov: 'FL',
    desc: 'Four stone leaves turn. Match them.',
    mech: 'reels',
    reels: 4,
    symbols: [
      { ico: '☘️', w: 30 }, { ico: '🍀', w: 22 }, { ico: '🪙', w: 18 },
      { ico: '🔔', w: 14 }, { ico: '🧚', w: 10 }, { ico: '🌈', w: 5 },
    ],
    payouts: { 2: 0, 3: 3.2, 4: 24 },   // matching symbols -> multiplier
  },

  /* ---------------- SE Asian jungle & spirituality (EP) ---------------- */
  spiritlanterns: {
    name: 'Spirit Lanterns', ico: '🏮', prov: 'EP',
    desc: 'Loose a lantern; the spirits steer it home.',
    mech: 'path',
    lanes: [{ ico: '🏮', label: 'Red' }, { ico: '🕯️', label: 'White' }, { ico: '🪔', label: 'Gold' }],
    steps: 4, stepIco: '✨', travelText: 'The lantern drifts over the trees…',
    outcomes: [
      { m: 0,   w: 44, ico: '🌫️', text: 'It fades into the mist, unanswered.' },
      { m: 1.6, w: 27, ico: '🛖', text: 'It settles at a village shrine.' },
      { m: 3.5, w: 14, ico: '⛩️', text: 'It reaches the high shrine!' },
      { m: 10,  w: 5,  ico: '🛕', text: 'The golden temple accepts it!' },
      { m: 45,  w: 1,  ico: '🐘', text: 'THE WHITE ELEPHANT ANSWERS!' },
    ],
  },
  nagariver: {
    name: 'Naga River', ico: '🐍', prov: 'EP',
    desc: 'Set the offering adrift and see which mouth takes it.',
    mech: 'path',
    lanes: [{ ico: '🥥', label: 'Coconut' }, { ico: '🌺', label: 'Flower' }, { ico: '🍚', label: 'Rice' }],
    steps: 5, stepIco: '💧', travelText: 'The current forks and forks again…',
    outcomes: [
      { m: 0,   w: 45, ico: '🪨', text: 'Caught in the rocks. The river keeps it.' },
      { m: 1.6, w: 26, ico: '💧', text: 'A minor Naga sips and pays.' },
      { m: 4,   w: 13, ico: '🐍', text: 'The green Naga swallows it whole!' },
      { m: 11,  w: 4,  ico: '💎', text: 'The jade Naga! Riches surface!' },
      { m: 55,  w: 0.9, ico: '👑', text: 'THE NAGA KING HIMSELF!' },
    ],
  },
  banyan: {
    name: 'Banyan Blessing', ico: '🌳', prov: 'EP',
    desc: 'Shake the old tree and see what the spirits drop.',
    mech: 'paytable', animIco: '🌳',
    table: [
      { m: 0,   w: 42, sym: '🍃', text: 'A leaf. The spirits are busy today.' },
      { m: 1.7, w: 28, sym: '🌸', text: 'A blossom, and a small blessing.' },
      { m: 3.5, w: 14, sym: '🧿', text: 'A charm falls into your hands!' },
      { m: 10,  w: 4,  sym: '🪬', text: 'A spirit token — rare and warm!' },
      { m: 50,  w: 0.8, sym: '🏆', text: 'A GOLDEN RELIC DROPS FROM THE CANOPY!' },
    ],
  },

  /* ---------------- Neon Japan (MN) ---------------- */
  neonneko: {
    name: 'Neon Neko', ico: '🐱', prov: 'MN',
    desc: 'The paw beckons, and the colour keeps changing.',
    mech: 'wheel',
    spinText: 'The paw waves… the neon flickers through its colours…',
    segments: [
      { m: 0,   w: 30, ico: '⚫', color: '#3a3444', label: 'Dark' },
      { m: 0,   w: 13, ico: '⬜', color: '#8a8798', label: 'Pale' },
      { m: 1.6, w: 23, ico: '🟦', color: '#5eeaff', label: 'Cyan' },
      { m: 3,   w: 15, ico: '🟩', color: '#8dff6b', label: 'Green' },
      { m: 6,   w: 8,  ico: '🟨', color: '#ffe066', label: 'Gold' },
      { m: 14,  w: 3,  ico: '🟪', color: '#ff6be0', label: 'Magenta' },
      { m: 55,  w: 0.8, ico: '🌈', color: '#ff9ad4', label: 'Rainbow' },
    ],
  },
  catparade: {
    name: 'Lucky Cat Parade', ico: '🎴', prov: 'MN',
    desc: 'Pick a door. A little cat comes out. Hopefully a gold one.',
    mech: 'pickchain',
    options: 6, optionIco: '🚪', chainIco: '🔔', chainLabel: 'A bell rings — one more door!',
    prizes: [
      { m: 0,   w: 41, ico: '🐈‍⬛', text: 'A black cat struts past, paying nothing.' },
      { m: 1.4, w: 25, ico: '🐈', text: 'A calico with a small koban.' },
      { m: 3,   w: 13, ico: '🐱', text: 'A ribboned cat — a real prize!' },
      { m: 9,   w: 4,  ico: '😻', text: 'A jewelled collar cat!' },
      { m: 45,  w: 0.9, ico: '🌟', text: 'THE GOLDEN MANEKI-NEKO!' },
      { chain: true, w: 11, ico: '🔔', text: 'A bell rings — the next door opens for free.' },
    ],
  },
  coincascade: {
    name: 'Neko Coin Cascade', ico: '🪙', prov: 'MN',
    desc: 'Drop the koban and watch it clatter through the cats.',
    mech: 'plinko',
    rows: 8, ballIco: '🪙',
    pocketIco: ['🌟', '🐱', '🐾', '🐈', '🐾', '🐱', '🌟'],
    edgeMult: 26, midMult: 0.15,
  },

  spirits: {
    name: 'Temple Bells', ico: '🔔', prov: 'EP',
    desc: 'Three bells. One holds a blessing.',
    mech: 'pick',
    choices: [{ ico: '🔔', label: 'First' }, { ico: '🔔', label: 'Second' }, { ico: '🔔', label: 'Third' }],
    winP: 1 / 3, hidden: true,
    flavor: { win: 'The bell rings pure gold!', lose: 'A dull clang. The spirits doze.' },
  },

  /* ---------------- Coastal & competitive ---------------- */
  fishing: {
    name: "Gone Fishin'", ico: '🎣',
    desc: "Rod, bait and patience against the sea's Lucklians.",
    mech: 'fishing',
    rodCost: 120,
    baits: [
      { name: 'Shrimp Scrap', ico: '🦐', cost: 40, exp: 1, blurb: 'everything nibbles it' },
      { name: 'Glowsquid Cut', ico: '🦑', cost: 140, exp: 0.45, blurb: 'the finer fish take notice' },
      { name: 'Golden Lugworm', ico: '✨', cost: 400, exp: -0.1, blurb: "only the deep's treasures bother" },
    ],
  },
  scavhunt: {
    name: 'The Grand Scavenger Hunt', ico: '🏆',
    desc: 'Race the field to catch four local Lucklians — podium pays.',
    mech: 'hunt',
  },
  natscav: {
    name: 'The National Hunt', ico: '🌐',
    desc: 'The travelling caravan\'s six-species, cross-country card. Serious stakes.',
    mech: 'hunt', national: true,
  },
  goldpan: {
    name: "Panner's Claim", ico: '⛏️',
    desc: 'Swirl the gravel, watch for colour. The tide decides what the river gives up.',
    mech: 'panning',
    // steady water: the everyday gravel
    tableHigh: [
      { m: 0, w: 42, sym: '🪨', text: 'Mud, roots and one deeply unimpressed crawdad.' },
      { m: 0, w: 12, sym: '🌕', text: "Fool's gold. It winked at you and everything." },
      { m: 1.5, w: 27, sym: '✨', text: 'A pinch of colour in the black sand!' },
      { m: 3.2, w: 13, sym: '🥇', text: 'Flakes! Real flakes!' },
      { m: 9, w: 5, sym: '💰', text: 'A nugget the size of a tooth!' },
      { m: 32, w: 1, sym: '🏆', text: 'A NUGGET THE SIZE OF A BOOT HEEL!' },
    ],
    // low tide: fresh gravel bared — wilder swings, same honest return
    tableLow: [
      { m: 0, w: 50, sym: '🪨', text: 'The low water bared fresh gravel — none of it for you.' },
      { m: 0, w: 10, sym: '🦴', text: 'A fossilized… something. The river keeps its secrets.' },
      { m: 1.3, w: 22, sym: '✨', text: 'Colour in the pan off the fresh bar!' },
      { m: 4.5, w: 11, sym: '🥇', text: 'Coarse flakes off the tide-cut bank!' },
      { m: 16, w: 4, sym: '💰', text: 'A waterworn nugget, fat as a knuckle!' },
      { m: 70, w: 0.6, sym: '🌈', text: 'THE MOTHER LODE — THE LEGEND IS TRUE!' },
    ],
  },
  lanternfest: {
    name: 'Lantern Festival', ico: '🏮',
    desc: 'Race your lantern down the river — the temple pot pays the podium.',
    mech: 'lantern',   // routed to the live river race (liveevents.js)
    // finishing-order odds for your lantern (8 on the water), tilted long
    Q: [0.075, 0.105, 0.13, 0.14, 0.14, 0.14, 0.14, 0.13],
    K: [6, 2.5, 1, 0, 0, 0, 0, 0],
  },
  colossus: {
    name: 'Mount Colossus Expedition', ico: '🏔️',
    desc: 'Camp by camp toward the summit shrine. Cash out, or climb into the weather.',
    mech: 'expedition',
    stages: [
      { name: 'The Scree Slopes', ico: '🪨', p: { clear: 0.80, wind: 0.74, blizzard: 0.66 },
        fail: 'The scree gives way — you slide back to camp with your boots full of gravel.' },
      { name: 'The Icefall', ico: '🧊', p: { clear: 0.68, wind: 0.62, blizzard: 0.52 },
        fail: 'A serac groans and the ladders come down. Back to camp, shaking.' },
      { name: 'Knife Ridge', ico: '⛰️', p: { clear: 0.60, wind: 0.50, blizzard: 0.42 },
        fail: 'The ridge shrugs you off. You cling, crawl, and retreat.' },
      { name: 'The Death Zone', ico: '☠️', p: { clear: 0.52, wind: 0.44, blizzard: 0.34 },
        fail: 'The thin air wins. The mountain keeps your stake as a toll.' },
      { name: 'The Summit Shrine', ico: '⛩️', p: { clear: 0.62, wind: 0.55, blizzard: 0.45 },
        fail: 'Metres from the shrine, the clouds slam shut. So close.' },
    ],
    weathers: [
      { id: 'clear', label: 'Clear skies', ico: '☀️', w: 5, blurb: 'The mountain is in a rare mood.' },
      { id: 'wind', label: 'High wind', ico: '🌬️', w: 4, blurb: 'Prayer flags are snapping like whips.' },
      { id: 'blizzard', label: 'Blizzard', ico: '🌨️', w: 2.5, blurb: 'You can barely see the sherpa tents.' },
    ],
  },
  nightmarket: {
    name: 'Night Market', ico: '🏮',
    desc: 'Shuttered by day. After dark: crates, contraband and strange demand.',
    mech: 'market',
    crates: [
      { name: 'Paper Crate', ico: '📦', price: 100, rtp: 0.93 },
      { name: 'Lacquer Crate', ico: '🎁', price: 300, rtp: 0.95 },
      { name: "Tonight's Special", ico: '✨', price: 0 /* seeded per night */, rtp: 0.985 },
    ],
  },
  homingpost: {
    name: 'The Homing Post', ico: '🕊️',
    desc: 'Five homers, one distant roost, the whole map between. First one home wins.',
    mech: 'homing',
    homers: [
      { name: 'Old Reliable', lkId: 140, p: 0.30 },
      { name: 'Feathered Lightning', lkId: 90, p: 0.24 },
      { name: 'The Postmaster General', lkId: 141, p: 0.19 },
      { name: 'Wrong Way Wanda', lkId: 18, p: 0.15 },
      { name: 'Sky Potato', lkId: 116, p: 0.12 },
    ],
  },
  auction: {
    name: 'The Grand Auction House', ico: '🔨',
    desc: 'Consign a Lucklian and let the room fight over it. Fair hammer — average sale is face value.',
    mech: 'auction',
    // hammer-price factors (x face value); scaled in code so EV is exactly 1.0
    factors: [
      { f: 0.55, w: 12, tag: 'cold' }, { f: 0.80, w: 22, tag: 'slow' },
      { f: 1.00, w: 26, tag: 'fair' }, { f: 1.20, w: 18, tag: 'warm' },
      { f: 1.50, w: 12, tag: 'spirited' }, { f: 2.10, w: 7, tag: 'war' },
      { f: 3.60, w: 2.2, tag: 'frenzy' },
    ],
  },
  /* live-station books (played in-scene via liveevents.js) */
  sumobracket: {
    name: 'The Basho Book', ico: '🤼',
    desc: 'Bout by bout to the Emperor\'s Cup — back a shove or back a champion.',
    mech: 'live',
  },
  kiteduel: {
    name: "String-Cutter's Book", ico: '🪁',
    desc: 'Glass string against glass string over Kite City. The wind decides the odds.',
    mech: 'live',
  },
  cliffdive: {
    name: 'The Cascade Classic', ico: '🤸',
    desc: 'Enter the diving meet off the tall fall — trick for trick against the residents, judged live.',
    mech: 'live',
  },
  bogwisp: {
    name: "The Wisp's Bargain", ico: '🫧',
    desc: 'Tuft by tuft behind the wisp. Bank at the stone, or wade deeper.',
    mech: 'live',
  },
};

/* ------------------------------------------------------------
   Shared clocks: the day/night cycle (night markets trade after
   dark) and the lantern festival window (see liveevents.js).
   ------------------------------------------------------------ */
export function nightNow() {
  const N = CONFIG.NIGHT;
  const into = (Date.now() / 1000) % N.CYCLE_S;
  const night = into < N.NIGHT_S;
  // soft 12s dusk/dawn ramps for the world tint
  const k = night ? Math.max(0, Math.min(1, into / 12, (N.NIGHT_S - into) / 12)) : 0;
  return { night, k, until: night ? N.NIGHT_S - into : N.CYCLE_S - into, idx: Math.floor(Date.now() / 1000 / N.CYCLE_S) };
}

/* ------------------------------------------------------------
   Engine helpers
   ------------------------------------------------------------ */
let session = 0; // bumped whenever a modal opens/closes, cancels stale timers

export function normalizedTable(table, rtp) {
  // Keep the designed multipliers clean (2x, 10x, ...) and instead
  // resize the losing entries' weight so the table's EV = rtp exactly.
  // Multiple losing entries share the miss weight in their designed ratio.
  const zeroW = table.reduce((a, e) => a + (e.m === 0 ? e.w : 0), 0);
  let wn = 0, evn = 0;
  for (const e of table) if (e.m > 0) { wn += e.w; evn += e.w * e.m; }
  const missW = evn / rtp - wn;
  if (zeroW > 0 && missW > 0) {
    return table.map((e) => (e.m === 0 ? { ...e, w: missW * (e.w / zeroW) } : e));
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
      ui.stage.innerHTML = `<div class="big-sym"><span class="shake">${def.animIco || def.ico}</span></div>`;
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
    /* the run itself: booked finishing order up front, then the same
       smooth choreography every other race in the game uses — swells
       and comebacks that never skip a runner across the track */
    const order = def.runners.map((_, i) => i).filter((i) => i !== winner).sort(() => roll() - 0.5);
    order.unshift(winner);
    const times = {};
    order.forEach((idx, rank) => { times[idx] = 6.5 + rank * (0.4 + roll() * 0.35); });
    const drama = def.runners.map(() => makeDrama(roll));
    const prog = def.runners.map(() => 0);
    const finished = [];
    lanes.forEach((l) => l.querySelector('.runner').classList.add('live'));
    const t0 = performance.now();
    let lastMs = t0;
    await new Promise((res) => {
      function step() {
        if (!alive(s)) return res();
        const nowMs = performance.now();
        const dt = Math.min(0.05, (nowMs - lastMs) / 1000);
        lastMs = nowMs;
        const t = (nowMs - t0) / 1000;
        const winnerDone = finished.includes(winner);
        for (let i = 0; i < prog.length; i++) {
          if (prog[i] < 1) {
            prog[i] = stepRacer(prog[i], t, times[i], drama[i], dt, i === winner, winnerDone);
            if (prog[i] >= 1 && !finished.includes(i)) finished.push(i);
          }
          const track = lanes[i].querySelector('.track');
          const runner = lanes[i].querySelector('.runner');
          runner.style.left = `${prog[i] * (track.clientWidth - 22)}px`;
        }
        if (finished.length >= prog.length || t > 14) return res();
        requestAnimationFrame(step);
      }
      step();
    });
    if (!alive(s)) return;
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
   Mechanic: props — live-event prop betting. Each prop is an
   independent yes/no wager with stated probability p; a hit
   pays RTP / p, so every prop returns exactly the configured
   RTP no matter which one the punter fancies.
   ------------------------------------------------------------ */
async function runProps(def, provCode) {
  const ui = baseModal(def, provCode);
  let bet = state.lastBet;
  buildBetRow(ui.betBox, (v) => { bet = v; });

  function board() {
    const rtp = effectiveRTP(gameIdOf(def), provCode);
    ui.stage.innerHTML = `<div class="flavor" style="margin-bottom:6px">Pick a prop on ${escapeHtml(def.eventName)} — tap to bet!</div>`;
    def.props.forEach((pr, i) => {
      const row = document.createElement('div');
      row.className = 'race-lane race-pick-btn';
      row.innerHTML = `<span style="flex:1;text-align:left">${pr.ico} ${escapeHtml(pr.label)}</span>
        <span class="odds">${fmtMult(rtp / pr.p)}x</span>`;
      row.addEventListener('click', () => start(i));
      ui.stage.appendChild(row);
    });
  }

  async function start(pickIdx) {
    const s = session;
    if (!playGuard(bet)) return;
    const rtp = effectiveRTP(gameIdOf(def), provCode);
    const pr = def.props[pickIdx];
    const hit = roll() < pr.p;

    ui.stage.innerHTML = `<div class="flavor" style="margin-bottom:4px">${pr.ico} Riding on: <b>${escapeHtml(pr.label)}</b> (${fmtMult(rtp / pr.p)}x)</div>
      <div id="props-ticker" style="min-height:84px;text-align:left;font-size:12.5px;line-height:1.7"></div>`;
    const tick = document.getElementById('props-ticker');
    const lines = [...def.ticker].sort(() => roll() - 0.5).slice(0, 4);
    for (const line of lines) {
      await wait(650);
      if (!alive(s)) return;
      const el = document.createElement('div');
      el.textContent = `📣 ${line}`;
      tick.appendChild(el);
    }
    await wait(500);
    if (!alive(s)) return;
    const el = document.createElement('div');
    el.innerHTML = hit ? `${pr.ico} <b>IT LANDS — ${escapeHtml(pr.label)}!</b>` : `❌ Not this time — <b>${escapeHtml(pr.label)}</b> misses.`;
    tick.appendChild(el);
    await wait(350);
    if (!alive(s)) return;
    settle(bet, hit ? rtp / pr.p : 0, ui.stage, hit ? 'The book pays out with a grimace.' : 'The book keeps your coin.');
    const again = document.createElement('button');
    again.className = 'btn secondary';
    again.textContent = 'Next event';
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
      win ? 'Fastest hand in Horseshoeville! Your rival tips his hat and limps off.'
          : 'Out-drawn! You lose your stake — and a little dignity.');
    startBtn.disabled = false;
  });
}

/* ------------------------------------------------------------
   Mechanic: wheel — a segmented wheel/ring whose pointer stops
   on one segment (Wheel of Tyche, Faerie Ring, Neon Neko)
   ------------------------------------------------------------ */
async function runWheel(def, provCode) {
  const ui = baseModal(def, provCode);
  const segs = normalizedTable(def.segments, ui.rtp);
  let bet = state.lastBet;
  buildBetRow(ui.betBox, (v) => { bet = v; });

  const playBtn = document.createElement('button');
  playBtn.className = 'btn';
  playBtn.textContent = `${def.ico} Spin`;
  ui.actions.appendChild(playBtn);

  function board(hot = -1) {
    ui.stage.innerHTML = `
      <div class="wheel-strip">${segs.map((sg, i) => `
        <div class="wheel-seg${i === hot ? ' hot' : ''}" style="--c:${sg.color}">
          <span class="ws-ico">${sg.ico}</span>
          <span class="ws-mult">${sg.m > 0 ? fmtMult(sg.m) + 'x' : '—'}</span>
        </div>`).join('')}</div>
      <div class="flavor" id="wheel-flavor">${hot >= 0 ? escapeHtml(segs[hot].label) : 'Place your bet and spin the wheel.'}</div>`;
  }
  board();

  playBtn.addEventListener('click', async () => {
    const s = session;
    if (!playGuard(bet)) return;
    playBtn.disabled = true;
    const outcome = weightedPick(segs.map((e) => ({ ...e, weight: e.w })));
    const target = segs.indexOf(outcome);

    // spin: race around the ring, then ease into the winning segment
    const laps = 1 + Math.floor(roll() * 2);
    const total = laps * segs.length + (target % segs.length) + segs.length;
    for (let step = 0; step <= total; step++) {
      board(step % segs.length);
      const doc = document.getElementById('wheel-flavor');
      if (doc && step < total - segs.length) doc.textContent = def.spinText;
      const remaining = total - step;
      const delay = remaining > segs.length ? 45 : 80 + (segs.length - remaining) * 34;
      await wait(delay);
      if (!alive(s)) return;
    }
    board(target);
    settle(bet, outcome.m, ui.stage, `${outcome.ico} ${outcome.label}`);
    playBtn.disabled = false;
  });
}

/* ------------------------------------------------------------
   Mechanic: plinko — a token falls through pins into a pocket.
   Pocket odds are the honest binomial of the drop; the pocket
   multipliers are scaled so the board pays exactly the RTP.
   ------------------------------------------------------------ */
export function plinkoPockets(def, rtp) {
  const R = def.rows, n = R + 1;
  const probs = [], shape = [];
  const logC = (k) => { // binomial coefficient via multiplicative form
    let c = 1;
    for (let i = 0; i < k; i++) c = (c * (R - i)) / (i + 1);
    return c;
  };
  for (let k = 0; k < n; k++) {
    probs.push(logC(k) / Math.pow(2, R));
    const edge = Math.abs(k - R / 2) / (R / 2);
    shape.push(def.midMult + (def.edgeMult - def.midMult) * Math.pow(edge, 3));
  }
  let ev = 0;
  for (let k = 0; k < n; k++) ev += probs[k] * shape[k];
  const scale = rtp / ev;
  return { probs, mults: shape.map((m) => m * scale) };
}

async function runPlinko(def, provCode) {
  const ui = baseModal(def, provCode);
  const { mults } = plinkoPockets(def, ui.rtp);
  const R = def.rows;
  let bet = state.lastBet;
  buildBetRow(ui.betBox, (v) => { bet = v; });

  const playBtn = document.createElement('button');
  playBtn.className = 'btn';
  playBtn.textContent = `${def.ballIco} Drop`;
  ui.actions.appendChild(playBtn);

  const icoFor = (k) => def.pocketIco[Math.round((k / R) * (def.pocketIco.length - 1))];

  function board(row, col) {
    let pins = '';
    for (let r2 = 0; r2 < R; r2++) {
      let cells = '';
      for (let c2 = 0; c2 <= r2; c2++) {
        const here = row === r2 && col === c2;
        cells += `<span class="pin${here ? ' ball' : ''}">${here ? def.ballIco : '•'}</span>`;
      }
      pins += `<div class="plinko-row">${cells}</div>`;
    }
    const pockets = mults.map((m, k) =>
      `<div class="pocket${row === R && col === k ? ' hot' : ''}">
         <span class="pk-ico">${icoFor(k)}</span><span class="pk-mult">${fmtMult(m)}x</span>
       </div>`).join('');
    ui.stage.innerHTML = `<div class="plinko">${pins}<div class="plinko-pockets">${pockets}</div></div>`;
  }
  board(-1, -1);

  playBtn.addEventListener('click', async () => {
    const s = session;
    if (!playGuard(bet)) return;
    playBtn.disabled = true;
    let col = 0;
    for (let r2 = 0; r2 < R; r2++) {
      board(r2, col);
      await wait(150);
      if (!alive(s)) return;
      if (roll() < 0.5) col += 1;          // fair left/right at every pin
    }
    board(R, col);
    await wait(280);
    if (!alive(s)) return;
    settle(bet, mults[col], ui.stage, `${icoFor(col)} into the ${col === 0 || col === R ? 'far' : 'middle'} pocket!`);
    playBtn.disabled = false;
  });
}

/* ------------------------------------------------------------
   Mechanic: gates — press on through a run of gates, each one
   multiplying the pot, or take what you have and walk away.
   ------------------------------------------------------------ */
async function runGates(def, provCode) {
  const ui = baseModal(def, provCode);
  let bet = state.lastBet;
  buildBetRow(ui.betBox, (v) => { bet = v; });

  const startBtn = document.createElement('button');
  startBtn.className = 'btn';
  startBtn.textContent = `${def.runnerIco} Begin the run`;
  ui.actions.appendChild(startBtn);

  let atGate = 0, mult = 1, running = false;
  const stepMult = () => effectiveRTP(gameIdOf(def), provCode) / def.advanceP;

  function board(msg) {
    const gates = Array.from({ length: def.gates }, (_, i) =>
      `<span class="gate${i < atGate ? ' open' : ''}${i === atGate ? ' next' : ''}">${def.gateIco}</span>`).join('');
    ui.stage.innerHTML = `
      <div class="gate-row">${gates}</div>
      <div class="flavor">${escapeHtml(msg)}</div>
      <div class="flavor">Gate ${Math.min(atGate + 1, def.gates)} of ${def.gates} · pot
        <b style="color:#ffd75e">${fmtCoins(bet * mult)}</b> (${fmtMult(mult)}x)</div>
      <div class="choice-grid">
        <button class="choice-card" id="g-go" style="font-size:14px">${def.gateIco}<br>Press on<br>${fmtMult(stepMult())}x</button>
        <button class="choice-card" id="g-cash" style="font-size:14px">💰<br>Take it<br>${fmtCoins(bet * mult)}</button>
      </div>`;
    document.getElementById('g-go').addEventListener('click', advance);
    document.getElementById('g-cash').addEventListener('click', cashOut);
  }

  async function advance() {
    const s = session;
    ui.stage.querySelectorAll('.choice-card').forEach((b) => (b.style.pointerEvents = 'none'));
    await wait(420);
    if (!alive(s)) return;
    if (roll() < def.advanceP) {
      mult *= stepMult();
      atGate++;
      if (atGate >= def.gates) {   // cleared them all — the run pays out
        running = false;
        ui.stage.innerHTML = `<div class="big-sym">${def.gateIco.repeat(3)}</div>`;
        settle(bet, mult, ui.stage, 'ALL NINE GATES CLEARED! The dragons bow you through.');
        startBtn.disabled = false;
        return;
      }
      board(def.passText);
    } else {
      running = false;
      ui.stage.innerHTML = `<div class="big-sym">⛔</div>`;
      settle(0, 0, ui.stage, `${def.failText} The pearl is lost at gate ${atGate + 1}.`);
      startBtn.disabled = false;
    }
  }

  function cashOut() {
    if (!running) return;
    running = false;
    ui.stage.innerHTML = `<div class="big-sym">💰</div>`;
    settle(bet, mult, ui.stage, `You slip away through gate ${atGate} with the pot.`);
    startBtn.disabled = false;
  }

  ui.stage.innerHTML = `<div class="big-sym">${def.gateIco}</div><div class="flavor">${escapeHtml(def.desc)}</div>`;
  startBtn.addEventListener('click', () => {
    if (!playGuard(bet)) return;
    startBtn.disabled = true;
    atGate = 0; mult = 1; running = true;
    board('The first gate stands before you.');
  });
}

/* ------------------------------------------------------------
   Mechanic: path — launch something that wanders through a few
   steps before arriving at a prize tier (threads, lanterns,
   river offerings).
   ------------------------------------------------------------ */
async function runPath(def, provCode) {
  const ui = baseModal(def, provCode);
  const table = normalizedTable(def.outcomes, ui.rtp);
  let bet = state.lastBet;
  buildBetRow(ui.betBox, (v) => { bet = v; });

  function board() {
    ui.stage.innerHTML = `<div class="flavor" style="margin-bottom:8px">Choose one — each is equally blessed.</div>
      <div class="choice-grid">${def.lanes.map((l, i) =>
        `<button class="choice-card" data-i="${i}">${l.ico}</button>`).join('')}</div>`;
    ui.stage.querySelectorAll('.choice-card').forEach((b) =>
      b.addEventListener('click', () => launch(Number(b.dataset.i))));
  }

  async function launch(lane) {
    const s = session;
    if (!playGuard(bet)) return;
    const outcome = weightedPick(table.map((e) => ({ ...e, weight: e.w })));
    for (let step = 0; step <= def.steps; step++) {
      const trail = Array.from({ length: def.steps + 1 }, (_, i) =>
        `<span class="path-node${i === step ? ' hot' : ''}${i < step ? ' done' : ''}">${i === step ? def.lanes[lane].ico : def.stepIco}</span>`).join('');
      ui.stage.innerHTML = `<div class="path-nodes">${trail}</div><div class="flavor">${escapeHtml(def.travelText)}</div>`;
      await wait(360);
      if (!alive(s)) return;
    }
    ui.stage.innerHTML = `<div class="big-sym">${outcome.ico}</div>`;
    settle(bet, outcome.m, ui.stage, outcome.text);
    const again = document.createElement('button');
    again.className = 'btn secondary';
    again.textContent = 'Again';
    again.addEventListener('click', board);
    ui.stage.appendChild(again);
  }
  board();
}

/* ------------------------------------------------------------
   Mechanic: pickchain — choose one of N containers; some reveal
   a free extra pick, and the winnings stack.
   ------------------------------------------------------------ */
export function normalizedPrizes(prizes, rtp) {
  // EV = S / (W - f), so the miss weight x solves K + x = S / rtp
  let S = 0, K = 0, f = 0;
  for (const p2 of prizes) {
    if (p2.chain) f += p2.w;
    else if (p2.m > 0) { K += p2.w; S += p2.w * p2.m; }
  }
  const x = Math.max(0.01, S / rtp - K);
  const missTotal = prizes.reduce((a, p2) => a + (!p2.chain && p2.m === 0 ? p2.w : 0), 0) || 1;
  return prizes.map((p2) => (!p2.chain && p2.m === 0 ? { ...p2, w: x * (p2.w / missTotal) } : p2));
}

async function runPickchain(def, provCode) {
  const ui = baseModal(def, provCode);
  const prizes = normalizedPrizes(def.prizes, ui.rtp);
  let bet = state.lastBet;
  buildBetRow(ui.betBox, (v) => { bet = v; });

  let pot = 0, freePicks = 0;

  function board(msg) {
    ui.stage.innerHTML = `
      <div class="flavor" style="margin-bottom:6px">${escapeHtml(msg)}</div>
      <div class="choice-grid">${Array.from({ length: def.options }, (_, i) =>
        `<button class="choice-card back" data-i="${i}">${def.optionIco}</button>`).join('')}</div>
      ${pot > 0 ? `<div class="flavor">Held so far: <b style="color:#ffd75e">${fmtCoins(pot)}</b></div>` : ''}`;
    ui.stage.querySelectorAll('.choice-card').forEach((b) =>
      b.addEventListener('click', () => choose(Number(b.dataset.i), b.parentElement)));
  }

  async function choose(i, grid) {
    const s = session;
    if (freePicks === 0 && !playGuard(bet)) return;
    if (freePicks > 0) freePicks--;
    grid.querySelectorAll('.choice-card').forEach((b) => (b.style.pointerEvents = 'none'));
    const prize = weightedPick(prizes.map((e) => ({ ...e, weight: e.w })));
    await wait(420);
    if (!alive(s)) return;
    const card = grid.children[i];
    card.classList.remove('back');
    card.classList.add('flip');
    card.textContent = prize.ico;
    await wait(520);
    if (!alive(s)) return;

    if (prize.chain) {
      freePicks++;
      board(`${def.chainLabel} ${prize.text}`);
      return;
    }
    const win = bet * prize.m;
    pot += win;
    ui.stage.innerHTML = `<div class="big-sym">${prize.ico}</div>`;
    // the stake was already taken on the first pick; pay the accumulated pot
    const line = document.createElement('div');
    if (pot > 0) {
      payout(pot);
      line.className = 'result-line win';
      line.textContent = `WIN ${fmtCoins(pot)} 🪙`;
      if (pot >= bet * 8) toast(`<span class="who">You</span> won <span class="amt">${fmtCoins(pot)}</span> at ${escapeHtml(def.name)}!`, true);
    } else {
      line.className = 'result-line lose';
      line.textContent = 'No luck this time…';
    }
    ui.stage.appendChild(line);
    const f2 = document.createElement('div');
    f2.className = 'flavor';
    f2.textContent = prize.text;
    ui.stage.appendChild(f2);
    renderBalance();
    pot = 0; freePicks = 0;
    const again = document.createElement('button');
    again.className = 'btn secondary';
    again.textContent = 'Again';
    again.addEventListener('click', () => board('Choose one…'));
    ui.stage.appendChild(again);
  }
  board('Choose one…');
}

/* ------------------------------------------------------------
   Mechanic: reels — N independent wheels of symbols; matching
   symbols pay. Payouts are scaled so the set hits the RTP.
   ------------------------------------------------------------ */
export function reelPayouts(def, rtp) {
  const syms = def.symbols, n = def.reels;
  const total = syms.reduce((a, s2) => a + s2.w, 0);
  // exact EV by enumerating every combination (6^4 = 1296 at most)
  let ev = 0;
  const idx2 = new Array(n).fill(0);
  const rec = (pos, prob, counts) => {
    if (pos === n) {
      const best = Math.max(...Object.values(counts));
      ev += prob * (def.payouts[best] || 0);
      return;
    }
    for (const s2 of syms) {
      counts[s2.ico] = (counts[s2.ico] || 0) + 1;
      rec(pos + 1, prob * (s2.w / total), counts);
      counts[s2.ico]--;
    }
  };
  rec(0, 1, {});
  const scale = ev > 0 ? rtp / ev : 1;
  const out = {};
  for (const k of Object.keys(def.payouts)) out[k] = def.payouts[k] * scale;
  return out;
}

async function runReels(def, provCode) {
  const ui = baseModal(def, provCode);
  const pay = reelPayouts(def, ui.rtp);
  let bet = state.lastBet;
  buildBetRow(ui.betBox, (v) => { bet = v; });

  const playBtn = document.createElement('button');
  playBtn.className = 'btn';
  playBtn.textContent = `${def.ico} Turn the stones`;
  ui.actions.appendChild(playBtn);

  const show = (faces) => {
    ui.stage.innerHTML = `<div class="reel-row">${faces.map((f) =>
      `<span class="reel">${f}</span>`).join('')}</div>
      <div class="flavor">3 alike pays ${fmtMult(pay[3])}x · 4 alike pays ${fmtMult(pay[4])}x</div>`;
  };
  show(Array.from({ length: def.reels }, () => '🗿'));

  playBtn.addEventListener('click', async () => {
    const s = session;
    if (!playGuard(bet)) return;
    playBtn.disabled = true;
    const result = Array.from({ length: def.reels }, () => weightedPick(def.symbols.map((e) => ({ ...e, weight: e.w }))).ico);
    const faces = Array.from({ length: def.reels }, () => '🌀');
    show(faces);
    for (let i = 0; i < def.reels; i++) {
      await wait(420);
      if (!alive(s)) return;
      faces[i] = result[i];
      show(faces);
    }
    await wait(280);
    if (!alive(s)) return;
    const counts = {};
    for (const f of result) counts[f] = (counts[f] || 0) + 1;
    const best = Math.max(...Object.values(counts));
    const mult = pay[best] || 0;
    settle(bet, mult, ui.stage,
      best >= 4 ? 'ALL FOUR STONES ALIKE! The grove roars!'
      : best === 3 ? 'Three stones alike — the knot glows!'
      : 'The stones disagree. The grove is silent.');
    playBtn.disabled = false;
  });
}

/* ------------------------------------------------------------
   Mechanic: fishing — buy the rod once, then pay per bait. A
   hooked catch is a real Sea Lucklian added to the Lucklipedia,
   so the "payout" is the creature's face value: hook chance =
   bait cost x RTP / expected value of the local pool (capped so
   a strike stays suspenseful). Pricier bait skews the draw hard
   toward the rare, valuable species — and on coasts too poor to
   justify the bait's price, the balance comes back honestly as
   SALVAGE hauled up on missed strikes (pearls, purses, amber),
   so every bait returns exactly the configured RTP everywhere.
   ------------------------------------------------------------ */
const HOOK_CAP = 0.62;
const SALVAGE = [ // [value factor on the per-miss mean, weight, icon, text]
  [0,   38, '🌿', 'a knot of dripping kelp'],
  [0.5, 24, '🥾', 'an old boot — empty, of course'],
  [1.3, 22, '🦪', 'a cluster of pearl oysters!'],
  [2.6, 11, '👛', 'a drowned coin purse!'],
  [6.2,  5, '🧡', 'a lump of precious sea amber!'],
];
const SALVAGE_MEAN = SALVAGE.reduce((a, s) => a + s[0] * s[1], 0) / SALVAGE.reduce((a, s) => a + s[1], 0);

export function fishingMath(provCode, bait, rtp) {
  let pool = LUCKLIANS.filter((l) => l.type === 'Sea' && l.prov === provCode);
  if (!pool.length) pool = LUCKLIANS.filter((l) => l.type === 'Sea');
  const weights = pool.map((l) => Math.pow(l.rare, bait.exp));
  const totalW = weights.reduce((a, w) => a + w, 0);
  const ev = pool.reduce((a, l, i) => a + (weights[i] / totalW) * l.value, 0);
  const p = Math.min(HOOK_CAP, (bait.cost * rtp) / ev);
  const shortfall = Math.max(0, bait.cost * rtp - p * ev);   // paid back via salvage
  const salvageMean = shortfall > 0 ? shortfall / (1 - p) : 0;   // per miss
  return { pool, weights, totalW, ev, p, salvageMean };
}

async function runFishing(def, provCode) {
  session++;
  const rtp = effectiveRTP('fishing', provCode);
  showModal(`
    <h2>${def.ico} ${escapeHtml(def.name)}</h2>
    <div class="subtitle">${escapeHtml(def.desc)} · RTP ${(rtp * 100).toFixed(1)}%</div>
    <div class="stage" id="g-stage"></div>
    <div class="btn-row" id="g-actions"></div>
  `, { onClose: () => { session++; } });
  const stage = document.getElementById('g-stage');

  const baitBoard = () => {
    const rows = def.baits.map((b, i) => {
      const { ev, p, salvageMean } = fishingMath(provCode, b, rtp);
      return `<div class="race-lane race-pick-btn" data-i="${i}">
        <span style="flex:1;text-align:left">${b.ico} ${escapeHtml(b.name)}<br>
          <span style="font-size:10.5px;opacity:.75">${escapeHtml(b.blurb)} · avg catch ~${fmtCoins(ev)} 🪙${salvageMean > 0 ? ' · 🦪 rich salvage' : ''}</span></span>
        <span class="odds">${b.cost} 🪙 · ${(p * 100).toFixed(0)}% hook</span>
      </div>`;
    }).join('');
    stage.innerHTML = `<div class="flavor" style="margin-bottom:6px">🌊 The old fisherman baits your hook — pick from the bucket:</div>${rows}`;
    stage.querySelectorAll('.race-pick-btn').forEach((el) =>
      el.addEventListener('click', () => cast(def.baits[+el.dataset.i])));
  };

  const rodBoard = () => {
    stage.innerHTML = `<div class="big-sym">🎣</div>
      <div class="flavor">“Sea's full of Lucklians, friend — but not for bare hands.
      This rod's yours for keeps for <b>${def.rodCost} 🪙</b>.”</div>`;
    const buy = document.createElement('button');
    buy.className = 'btn';
    buy.textContent = `🎣 Buy the rod · ${def.rodCost} 🪙`;
    buy.disabled = !canAfford(def.rodCost);
    buy.addEventListener('click', () => {
      if (!spend(def.rodCost)) return;
      state.gear.rod = true;
      renderBalance();
      toast('🎣 The rod is yours — every hut on every coast will lend you a line now.');
      baitBoard();
    });
    stage.appendChild(buy);
  };

  async function cast(bait) {
    const s = session;
    if (!playGuard(bait.cost)) return;
    const { pool, weights, totalW, p, salvageMean } = fishingMath(provCode, bait, rtp);
    const hooked = roll() < p;
    const frames = [
      ['🎣', 'The line arcs out past the breakers…'],
      ['🌊', 'The bobber settles. The sea breathes…'],
      ['🌊', '…'],
    ];
    for (const [sym, text] of frames) {
      stage.innerHTML = `<div class="big-sym">${sym}</div><div class="flavor">${text}</div>`;
      await wait(750);
      if (!alive(s)) return;
    }
    if (!hooked) {
      // no fish — but the slack line can still drag up salvage
      const sv = salvageMean > 0 ? weightedPick(SALVAGE.map(([f, w, ico, text]) => ({ f, ico, text, weight: w }))) : null;
      const coins = sv ? Math.round((sv.f / SALVAGE_MEAN) * salvageMean) : 0;
      stage.innerHTML = `<div class="big-sym">${sv ? sv.ico : '💧'}</div>`;
      const line = document.createElement('div');
      if (coins > 0) {
        payout(coins);
        renderBalance();
        line.className = 'result-line win';
        line.textContent = `SALVAGE ${fmtCoins(coins)} 🪙`;
      } else {
        line.className = 'result-line lose';
        line.textContent = 'Something took the bait and left…';
      }
      stage.appendChild(line);
      const f2 = document.createElement('div');
      f2.className = 'flavor';
      f2.textContent = sv ? `The line comes back with ${sv.text}` : 'The bobber never so much as trembled.';
      stage.appendChild(f2);
    } else {
      stage.innerHTML = `<div class="big-sym" style="color:#ffd75e">❗</div><div class="flavor">A strike! The rod doubles over!</div>`;
      await wait(800);
      if (!alive(s)) return;
      let r = roll() * totalW, sp = pool[pool.length - 1];
      for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) { sp = pool[i]; break; } }
      recordCatch(sp);
      const tier = rarityTier(sp.rare);
      stage.innerHTML = `
        <div class="lk-stage"><img src="${getLucklianSprite(sp).toDataURL()}" class="lk-sprite big" alt=""></div>
        <div class="result-line win">Landed a <span style="color:${tier.color}">${escapeHtml(sp.name)}</span>!</div>
        <div class="flavor">${tier.name} · worth ${fmtCoins(sp.value)} 🪙 — it's in your Lucklipedia.</div>`;
      if (sp.rare < 0.025) toast(`🎣 <span class="who">You</span> hauled in a <b>${escapeHtml(sp.name)}</b> — worth <span class="amt">${fmtCoins(sp.value)}</span>!`, sp.rare < 0.006);
    }
    const again = document.createElement('button');
    again.className = 'btn secondary';
    again.textContent = 'Cast again';
    again.addEventListener('click', baitBoard);
    stage.appendChild(again);
  }

  if (state.gear?.rod) baitBoard();
  else rodBoard();
}

/* ------------------------------------------------------------
   Mechanic: panning — a sluice claim on the stream. Same honest
   normalized paytable engine, but the gravel changes with the
   tide: low water bares a fresh bar with wilder swings (bigger
   top prizes, longer dry spells) at the identical RTP.
   ------------------------------------------------------------ */
async function runPanning(def, provCode) {
  session++;
  const lowTide = (state.tide ?? 0.5) < 0.42;
  const rtp = effectiveRTP('goldpan', provCode);
  const table = normalizedTable(lowTide ? def.tableLow : def.tableHigh, rtp);
  showModal(`
    <h2>${def.ico} ${escapeHtml(def.name)}</h2>
    <div class="subtitle">${escapeHtml(def.desc)} · RTP ${(rtp * 100).toFixed(1)}%<br>
      ${lowTide ? '🌊 <b>The tide is out</b> — fresh gravel bared, wilder swings' : '🌊 Steady water — everyday gravel'}</div>
    <div class="stage" id="g-stage"></div>
    <div id="g-bet"></div>
    <div class="btn-row" id="g-actions"></div>
  `, { onClose: () => { session++; } });
  const stage = document.getElementById('g-stage');
  let bet = state.lastBet;
  buildBetRow(document.getElementById('g-bet'), (v) => { bet = v; });
  const panBtn = document.createElement('button');
  panBtn.className = 'btn';
  panBtn.textContent = '⛏️ Fill the pan';
  document.getElementById('g-actions').appendChild(panBtn);
  stage.innerHTML = `<div class="big-sym">🥘</div><div class="flavor">A scoop of river gravel costs your stake. Swirl and pray.</div>`;

  panBtn.addEventListener('click', async () => {
    const s = session;
    if (!playGuard(bet)) return;
    panBtn.disabled = true;
    const outcome = weightedPick(table.map((e) => ({ ...e, weight: e.w })));
    const swirls = ['The pan dips into the cold water…', 'Swirl… the light stuff washes over the rim…', 'Swirl… down to the black sand…'];
    for (const line of swirls) {
      stage.innerHTML = `<div class="big-sym"><span class="shake">🥘</span></div><div class="flavor">${line}</div>`;
      await wait(680);
      if (!alive(s)) return;
    }
    stage.innerHTML = `<div class="big-sym">${outcome.sym}</div>`;
    settle(bet, outcome.m, stage, outcome.text);
    panBtn.disabled = false;
  });
}

/* ------------------------------------------------------------
   Lantern festival helpers — the race itself now runs LIVE on
   the river (see liveevents.js: openLanternFestival), which
   imports these for the window and the honest prize ladder.
   ------------------------------------------------------------ */
export function lanternWindow() {
  const L = CONFIG.LANTERNS;
  const into = (Date.now() / 1000) % L.CYCLE_S;
  return { open: into < L.OPEN_S, left: L.OPEN_S - into, until: L.CYCLE_S - into };
}
export function lanternPrizes(bet, rtp, def) {
  const evK = def.Q.reduce((a, q, i) => a + q * def.K[i], 0);
  const scale = rtp / evK;
  return def.K.map((k) => Math.round(k * scale * bet));
}
export const LANTERN_FOLK = [
  'Old Boonmee', 'Auntie Dao', 'Little Ping', 'Brother Somsak', 'Grandmother Yin',
  'Kai the Ferryman', 'Madame Orchid', 'Two-Coin Tan', 'Sleepy Niran', 'Widow Chen',
  'Lotus-Eyed Lin', 'The Quiet Novice',
];

/* ------------------------------------------------------------
   Mechanic: expedition — Mount Colossus. A staged ladder like
   the dragon gates, but every attempt draws its own WEATHER,
   every stage has its own odds, and you pick your style: climb
   alone (longer odds, fatter legs) or rope up with a sherpa
   (steadier, slimmer). Both pay each stage at RTP / p, so the
   mountain is honest whichever way you face it. Reaching the
   summit shrine also earns the mountain's blessing (a luck buff).
   ------------------------------------------------------------ */
async function runExpedition(def, provCode) {
  session++;
  const rtp = effectiveRTP('colossus', provCode);
  const weather = weightedPick(def.weathers.map((w) => ({ ...w, weight: w.w })));
  let sherpa = false;
  const stageP = (i) => Math.min(0.90, def.stages[i].p[weather.id] * (sherpa ? 1.15 : 1));
  showModal(`
    <h2>${def.ico} ${escapeHtml(def.name)}</h2>
    <div class="subtitle">${escapeHtml(def.desc)} · RTP ${(rtp * 100).toFixed(1)}%<br>
      ${weather.ico} <b>${escapeHtml(weather.label)}</b> — ${escapeHtml(weather.blurb)}</div>
    <div class="stage" id="g-stage"></div>
    <div id="g-bet"></div>
    <div class="btn-row" id="g-actions"></div>
  `, { onClose: () => { session++; } });
  const stage = document.getElementById('g-stage');
  let bet = state.lastBet;
  buildBetRow(document.getElementById('g-bet'), (v) => { bet = v; });
  const goBtn = document.createElement('button');
  goBtn.className = 'btn';
  goBtn.textContent = '🏔️ Set out';
  document.getElementById('g-actions').appendChild(goBtn);

  let at = 0, mult = 1, climbing = false;

  function routeBoard(msg) {
    const rows = def.stages.map((st, i) => `
      <div class="race-lane" style="opacity:${i < at ? 0.55 : 1};${i === at && climbing ? 'outline:2px solid var(--gold);border-radius:6px' : ''}">
        <span style="width:26px">${i < at ? '✅' : st.ico}</span>
        <span style="flex:1;text-align:left">${escapeHtml(st.name)}</span>
        <span class="odds">${i >= at ? `${(stageP(i) * 100).toFixed(0)}% · ${fmtMult(rtp / stageP(i))}x` : 'climbed'}</span>
      </div>`).join('');
    stage.innerHTML = `
      <div class="flavor" style="margin-bottom:4px">${escapeHtml(msg)}</div>
      ${rows}
      ${climbing ? `<div class="flavor">Pot: <b style="color:var(--gold)">${fmtCoins(bet * mult)}</b> (${fmtMult(mult)}x)</div>
      <div class="choice-grid">
        <button class="choice-card" id="ex-go" style="font-size:13px">${def.stages[at].ico}<br>Climb on<br>${fmtMult(rtp / stageP(at))}x</button>
        <button class="choice-card" id="ex-cash" style="font-size:13px">⛺<br>Descend with<br>${fmtCoins(bet * mult)}</button>
      </div>` : `<div class="flavor">Style: ${sherpa ? '🧗 roped to a sherpa — steadier odds, slimmer legs' : '🥾 climbing alone — long odds, fat legs'}
        <button class="btn tiny secondary" id="ex-style">switch</button></div>`}`;
    if (climbing) {
      document.getElementById('ex-go').addEventListener('click', ascend);
      document.getElementById('ex-cash').addEventListener('click', descend);
    } else {
      document.getElementById('ex-style').addEventListener('click', () => { sherpa = !sherpa; routeBoard('The route board, chalked fresh this morning:'); });
    }
  }

  async function ascend() {
    const s = session;
    stage.querySelectorAll('.choice-card').forEach((b) => (b.style.pointerEvents = 'none'));
    const st = def.stages[at], p = stageP(at);
    stage.querySelector('.flavor').textContent = `${st.ico} You commit to ${st.name}…`;
    await wait(900);
    if (!alive(s)) return;
    if (roll() < p) {
      mult *= rtp / p;
      at++;
      if (at >= def.stages.length) {
        climbing = false;
        stage.innerHTML = `<div class="big-sym">⛩️</div>`;
        settle(bet, mult, stage, 'THE SUMMIT SHRINE! The bells ring only for those who arrive.');
        grantLuck(0.03, 120);
        toast('🏔️ <b>The mountain\'s blessing</b> — +3% RTP for 120s', true);
        goBtn.disabled = false;
        return;
      }
      routeBoard(`${st.ico} ${st.name} falls behind you. The air thins.`);
    } else {
      climbing = false;
      stage.innerHTML = `<div class="big-sym">🌨️</div>`;
      settle(0, 0, stage, st.fail);
      goBtn.disabled = false;
    }
  }

  function descend() {
    if (!climbing) return;
    climbing = false;
    stage.innerHTML = `<div class="big-sym">⛺</div>`;
    settle(bet, mult, stage, `You descend from ${def.stages[at - 1]?.name || 'base camp'} with the pot and all your fingers.`);
    goBtn.disabled = false;
  }

  routeBoard('The route board, chalked fresh this morning:');
  goBtn.addEventListener('click', () => {
    if (!playGuard(bet)) return;
    goBtn.disabled = true;
    at = 0; mult = 1; climbing = true;
    routeBoard('⛺ You shoulder your pack at base camp.');
  });
}

/* ------------------------------------------------------------
   Mechanic: market — the night market. Stalls trade only after
   dark. Each night rolls a fresh spread: three crates at their
   posted (honest) chest odds — one a genuine "special" — plus a
   black-market Lucklian at a collector's markup and one species
   in strange demand, bought above face value, off the books.
   ------------------------------------------------------------ */
function seededPick(arr, seed, salt) {
  return arr[Math.floor(hash2(seed, salt, 777) * arr.length) % arr.length];
}

async function runMarket(def, provCode) {
  const night = nightNow();
  if (!night.night) {
    const m = Math.floor(night.until / 60), s2 = Math.round(night.until % 60);
    showModal(`
      <h2>🏮 ${escapeHtml(def.name)}</h2>
      <div class="subtitle">Shuttered. A note is pinned to the awning:</div>
      <div class="stage"><div class="big-sym">🌞</div>
      <div class="flavor">“Back after dark. Night falls in <b>${m}m ${s2}s</b>. Bring coin. Ask no questions.”</div></div>
      <div class="btn-row"><button class="btn secondary" id="nm-ok">Move along</button></div>
    `);
    document.getElementById('nm-ok').addEventListener('click', closeModal);
    return;
  }
  const seed = night.idx * 31 + (provCode === 'MN' ? 7 : 3);
  const specialPrice = Math.round((500 + hash2(seed, 11, 42) * 400) / 25) * 25;
  // contraband: a mid-rare species at a collector's markup
  const contraPool = LUCKLIANS.filter((l) => l.rare >= 0.004 && l.rare < 0.05);
  const contra = seededPick(contraPool, seed, 1);
  const markup = 1.05 + hash2(seed, 2, 9) * 0.25;
  const contraPrice = Math.round((contra.value * markup) / 5) * 5;
  // demand: one species bought above face, off the market books
  const demand = seededPick(LUCKLIANS, seed, 3);
  const demandPay = Math.round((demand.value * 1.15) / 5) * 5;
  const bought = state.nmBought || (state.nmBought = {});
  const contraKey = `${night.idx}:${provCode}`;

  const rack = nightRackItem(night.idx, provCode);

  function board() {
    const owned = state.lk?.caught[demand.id] || 0;
    const tier = rarityTier(contra.rare);
    const rackOwned = ensureWardrobe().owned.includes(rack.item.id);
    const rackR = FIT_RARITY[rack.item.rarity];
    showModal(`
      <h2>🏮 ${escapeHtml(def.name)}</h2>
      <div class="subtitle">Lanterns lit · the market closes in ${Math.floor(night.until / 60)}m — tonight's spread:</div>
      <div id="nm-list">
        ${def.crates.map((c, i) => {
          const price = c.price || specialPrice;
          return `<div class="race-lane race-pick-btn" data-crate="${i}">
            <span style="flex:1;text-align:left">${c.ico} ${escapeHtml(c.name)}<br>
              <span style="font-size:10.5px;opacity:.75">${c.rtp >= 0.98 ? 'the stallkeeper won\'t meet your eye — a real bargain' : 'sealed, rattling promisingly'}</span></span>
            <span class="odds">${price} 🪙 · RTP ${(c.rtp * 100).toFixed(1)}%</span></div>`;
        }).join('')}
        <div class="race-lane race-pick-btn" id="nm-contra" ${bought[contraKey] ? 'style="opacity:.5;pointer-events:none"' : ''}>
          <span style="flex:1;text-align:left;display:flex;align-items:center;gap:8px">
            <img src="${getLucklianSprite(contra).toDataURL()}" style="width:26px;image-rendering:pixelated" alt="">
            <span><span style="color:${tier.ink}">${escapeHtml(contra.name)}</span> <span style="opacity:.7">· no questions asked</span><br>
            <span style="font-size:10.5px;opacity:.75">${bought[contraKey] ? 'sold — come back tomorrow night' : `face value ${fmtCoins(contra.value)} 🪙 — collector's markup`}</span></span></span>
          <span class="odds">${contraPrice} 🪙</span></div>
        <div class="race-lane ${owned > 0 ? 'race-pick-btn' : ''}" id="nm-demand" ${owned > 0 ? '' : 'style="opacity:.55"'}>
          <span style="flex:1;text-align:left;display:flex;align-items:center;gap:8px">
            <img src="${getLucklianSprite(demand, owned === 0).toDataURL()}" style="width:26px;image-rendering:pixelated" alt="">
            <span>WANTED: ${escapeHtml(demand.name)}<br>
            <span style="font-size:10.5px;opacity:.75">${owned > 0 ? `you have ${owned} — pays over face, off the books` : 'bring one after dark and name your price'}</span></span></span>
          <span class="odds">pays ${fmtCoins(demandPay)} 🪙</span></div>
        <div class="race-lane ${rackOwned ? '' : 'race-pick-btn'}" id="nm-rack" ${rackOwned ? 'style="opacity:.5"' : ''}>
          <span style="flex:1;text-align:left">${rack.item.ico} ${escapeHtml(rack.item.name)}
            <span style="color:${rackR.ink};font-weight:bold">· ${rackR.name}</span><br>
            <span style="font-size:10.5px;opacity:.75">${rackOwned ? 'already in your wardrobe' : 'off the back of the rack — night price, no haggling'}</span></span>
          <span class="odds">${rackOwned ? 'owned' : `${fmtCoins(rack.price)} 🪙`}</span></div>
      </div>
    `);
    if (!rackOwned) document.getElementById('nm-rack')?.addEventListener('click', () => {
      if (buyItem(rack.item, rack.price)) board();
    });
    document.querySelectorAll('[data-crate]').forEach((el) => el.addEventListener('click', () => {
      const c = def.crates[+el.dataset.crate];
      openConcealer({ x: 0, y: 0, type: { id: 'nm-' + el.dataset.crate, name: c.name, ico: c.ico, price: c.price || specialPrice, rtp: c.rtp } }, provCode, () => {});
    }));
    document.getElementById('nm-contra')?.addEventListener('click', () => {
      if (bought[contraKey] || !spend(contraPrice)) { if (!bought[contraKey]) toast('Not enough coins for the back shelf.'); return; }
      bought[contraKey] = true;
      recordCatch(contra);
      renderBalance();
      toast(`🏮 A cloth bundle changes hands — <b>${escapeHtml(contra.name)}</b> is yours. No receipts.`, contra.rare < 0.01);
      board();
    });
    if (owned > 0) document.getElementById('nm-demand')?.addEventListener('click', () => {
      if ((state.lk.caught[demand.id] || 0) === 0) return;
      state.lk.caught[demand.id] -= 1;
      payout(demandPay);
      renderBalance();
      toast(`🏮 Sold a ${escapeHtml(demand.name)} for ${fmtCoins(demandPay)} 🪙 — ${(demandPay / demand.value).toFixed(2)}x face, off the books.`);
      board();
    });
  }
  board();
}

/* ------------------------------------------------------------
   The Crossing — the Paradise Ferry's below-decks den. It only
   exists while the boat is under way: a progress bar crawls
   dock to dock while the captain rattles two dice. Port (2–6),
   Starboard (8–12), or Lucky Sevens — each pays RTP / p.
   ------------------------------------------------------------ */
const DIE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
export function openCrossingDen(provCode, destLabel, stake, seconds) {
  session++;
  const rtp = effectiveRTP('shipsbones', provCode);
  const rough = (state.tide ?? 0.5) > 0.6;
  const WAGERS = [
    { id: 'port', label: 'Port (2\u20136)', ico: '\u2b05\ufe0f', p: 15 / 36 },
    { id: 'star', label: 'Starboard (8\u201312)', ico: '\u27a1\ufe0f', p: 15 / 36 },
    { id: 'seven', label: 'Lucky Sevens', ico: '7\ufe0f\u20e3', p: 6 / 36 },
  ];
  // the captain calls it for you — every call pays rtp/p, so the crossing
  // returns the same honest RTP whichever way the cup lands
  const w = WAGERS[(roll() * WAGERS.length) | 0];
  showModal(`
    <h2>\ud83c\udfb2 Below Decks</h2>
    <div class="subtitle">Under way for ${escapeHtml(destLabel)} \u00b7 your ${fmtCoins(stake)} \ud83e\ude99 fare rides on the bones \u00b7 RTP ${(rtp * 100).toFixed(1)}%<br>
    ${rough ? '\ud83c\udf0a Rough water \u2014 the dice never sit still.' : '\ud83c\udf19 A flat calm \u2014 the lamp barely swings.'}</div>
    <div id="cr-bar" style="height:10px;background:#17102a;border:1px solid #3a2c58;border-radius:5px;margin:4px 0 8px;overflow:hidden">
      <div id="cr-fill" style="height:100%;width:0%;background:linear-gradient(90deg,#3fa9f5,#8fe0ff)"></div>
    </div>
    <div class="stage" id="g-stage"></div>
  `, { onClose: () => { session++; } });
  const stage = document.getElementById('g-stage');
  const s = session;
  const t0 = performance.now();
  (function barTick() {
    if (!alive(s)) return;
    const k = Math.min(1, (performance.now() - t0) / (seconds * 1000));
    const fill = document.getElementById('cr-fill');
    if (fill) fill.style.width = `${(k * 100).toFixed(1)}%`;
    if (k < 1) requestAnimationFrame(barTick);
  })();

  (async () => {
    stage.innerHTML = `<div class="big-sym">\ud83d\udd6f\ufe0f</div>
      <div class="flavor">The captain kicks a stool toward you and tips the cup.
      \u201cFare\u2019s paid, so we\u2019ll let it ride. I\u2019ll call it for you \u2014 ${escapeHtml(w.label)}.\u201d</div>`;
    await wait(1500);
    if (!alive(s)) return;
    const d1 = 1 + ((roll() * 6) | 0), d2 = 1 + ((roll() * 6) | 0);
    const sum = d1 + d2;
    stage.innerHTML = `<div class="big-sym"><span class="shake">\ud83c\udfb2</span> <span class="shake">\ud83c\udfb2</span></div>
      <div class="flavor">${w.ico} Riding on <b>${escapeHtml(w.label)}</b> at ${fmtMult(rtp / w.p)}x\u2026
      ${rough ? 'the hull heaves and the bones clatter twice as long\u2026' : 'the bones rattle across the felt\u2026'}</div>`;
    await wait(1900);
    if (!alive(s)) return;
    stage.innerHTML = `<div class="big-sym">${DIE_FACES[d1 - 1]} ${DIE_FACES[d2 - 1]}</div><div class="flavor">${sum}!</div>`;
    const hit = (w.id === 'port' && sum <= 6) || (w.id === 'star' && sum >= 8) || (w.id === 'seven' && sum === 7);
    await wait(700);
    if (!alive(s)) return;
    // the fare was already taken at the gangway — this only pays out
    const win = hit ? stake * (rtp / w.p) : 0;
    const line = document.createElement('div');
    line.className = 'result-line ' + (win > 0 ? 'win' : 'lose');
    if (win > 0) {
      payout(win);
      renderBalance();
      line.textContent = `WIN ${fmtCoins(win)} \ud83e\ude99 (${fmtMult(rtp / w.p)}x)`;
      toast(`\ud83c\udfb2 The captain pays out <span class="amt">${fmtCoins(win)}</span> \ud83e\ude99 \u2014 your crossing paid for itself.`, win >= stake * 4);
    } else {
      line.textContent = 'The captain sweeps the felt.';
    }
    stage.appendChild(line);
    const f2 = document.createElement('div');
    f2.className = 'flavor';
    f2.textContent = hit
      ? (w.id === 'seven' ? 'Sevens! He mutters about landlubber\u2019s luck.' : 'He slides your winnings over with two fingers.')
      : 'He doesn\u2019t look up. The lamp swings on.';
    stage.appendChild(f2);
  })();
}

/* ------------------------------------------------------------
   Mechanic: homing — the FL post race, run over the REAL map.
   Five homers streak from the loft to a far-off roost as living
   dots on the world map; the winner is drawn honestly and pays
   RTP / p, with drama shuffling the order along the way.
   ------------------------------------------------------------ */
const HOMER_COLORS = ['#ffd75e', '#5eeaff', '#ff6be0', '#8dff6b', '#ff9a6b'];

async function runHoming(def, provCode) {
  session++;
  const rtp = effectiveRTP('homingpost', provCode);
  const world = worldRef;
  if (!world) return;
  const loft = world.events.find((e) => e.game === 'homingpost') || { x: 24, y: 100 };
  const far = world.cities.filter((c) => Math.hypot(c.x - loft.x, c.y - loft.y) > 150);
  const roost = far[(roll() * far.length) | 0] || world.cities[world.cities.length - 1];
  let bet = state.lastBet;
  const m = showModal(`
    <h2>🕊️ ${escapeHtml(def.name)}</h2>
    <div class="subtitle">Today's race: the loft to <b>${escapeHtml(roost.name)}</b>, ${Math.round(Math.hypot(roost.x - loft.x, roost.y - loft.y))} leagues as the Lucklian flies · RTP ${(rtp * 100).toFixed(1)}%</div>
    <div class="stage" id="g-stage"></div>
    <div id="g-bet"></div>
  `, { onClose: () => { session++; } });
  buildBetRow(m.querySelector('#g-bet'), (v) => { bet = v; });
  const stage = document.getElementById('g-stage');

  function board() {
    stage.innerHTML = `<div class="flavor" style="margin-bottom:6px">Back a homer — then watch the whole flight on the map:</div>` +
      def.homers.map((h, i) => {
        const sp = BY_ID.get(h.lkId);
        return `<div class="race-lane race-pick-btn" data-i="${i}">
          <span style="flex:1;text-align:left;display:flex;align-items:center;gap:8px">
            <span style="width:10px;height:10px;border-radius:50%;background:${HOMER_COLORS[i]};display:inline-block"></span>
            ${escapeHtml(h.name)} <span style="opacity:.65;font-size:11px">· ${escapeHtml(sp?.name || '')}</span></span>
          <span class="odds">${fmtMult(rtp / h.p)}x</span></div>`;
      }).join('');
    stage.querySelectorAll('[data-i]').forEach((el) => el.addEventListener('click', () => fly(+el.dataset.i)));
  }

  async function fly(pickIdx) {
    const s = session;
    if (!playGuard(bet)) return;
    // draw the winner honestly, then choreograph the flight
    let r = roll(), winner = 0;
    for (let i = 0; i < def.homers.length; i++) { r -= def.homers[i].p; if (r <= 0) { winner = i; break; } }
    const order = def.homers.map((_, i) => i).filter((i) => i !== winner).sort(() => roll() - 0.5);
    order.unshift(winner);
    const times = {};
    order.forEach((idx, rank) => { times[idx] = 11 + rank * (0.5 + roll() * 0.4); });
    // one curved path per bird: a bowed line with personal wobble
    const paths = def.homers.map(() => {
      const mx = (loft.x + roost.x) / 2, my = (loft.y + roost.y) / 2;
      const dx = roost.x - loft.x, dy = roost.y - loft.y;
      const len = Math.hypot(dx, dy) || 1;
      const bow = (roll() - 0.5) * 90;
      return {
        cx: mx + (-dy / len) * bow, cy: my + (dx / len) * bow,
        wAmp: 2 + roll() * 4, wFreq: 6 + roll() * 8, wPhase: roll() * 6.28,
      };
    });
    const drama = def.homers.map(() => makeDrama(roll));
    stage.innerHTML = `
      <canvas id="hm-cv" width="${world.W}" height="${world.H}" style="width:100%;image-rendering:pixelated;border-radius:8px;border:2px solid #3a2c58"></canvas>
      <div id="hm-board" style="font-size:11.5px;text-align:left;line-height:1.5;margin-top:6px"></div>`;
    const cv = document.getElementById('hm-cv');
    const cctx = cv.getContext('2d');
    // paint the base map once, keep it as the backdrop
    const base = document.createElement('canvas');
    base.width = world.W; base.height = world.H;
    paintWorldMap(base.getContext('2d'), world);
    const prog = def.homers.map(() => 0);
    const finished = [];
    const trails = def.homers.map(() => []);
    const t0 = performance.now();
    const bez = (p0, pc, p1, t) => {
      const u = 1 - t;
      return { x: u * u * p0.x + 2 * u * t * pc.x + t * t * p1.x, y: u * u * p0.y + 2 * u * t * pc.y + t * t * p1.y };
    };
    let lastFrame = performance.now();
    await new Promise((res) => {
      function frame() {
        if (!alive(s)) return res();
        const nowMs = performance.now();
        const dt = Math.min(0.05, (nowMs - lastFrame) / 1000);
        lastFrame = nowMs;
        const t = (nowMs - t0) / 1000;
        const winnerDone = finished.includes(winner);
        cctx.drawImage(base, 0, 0);
        // loft + roost markers
        cctx.fillStyle = '#ffffff';
        cctx.fillRect(loft.x - 1, loft.y - 1, 3, 3);
        cctx.fillStyle = '#ffd75e';
        cctx.fillRect(roost.x - 2, roost.y - 2, 5, 5);
        def.homers.forEach((h, i) => {
          if (prog[i] < 1) {
            prog[i] = stepRacer(prog[i], t, times[i], drama[i], dt, i === winner, winnerDone);
            if (prog[i] >= 1 && !finished.includes(i)) finished.push(i);
          }
          const P = paths[i];
          const pt = bez({ x: loft.x, y: loft.y }, { x: P.cx, y: P.cy }, { x: roost.x, y: roost.y }, prog[i]);
          pt.x += Math.sin(prog[i] * P.wFreq * 6.28 + P.wPhase) * P.wAmp * (1 - prog[i]);
          pt.y += Math.cos(prog[i] * P.wFreq * 5.1 + P.wPhase) * P.wAmp * 0.6 * (1 - prog[i]);
          trails[i].push(pt);
          if (trails[i].length > 14) trails[i].shift();
          trails[i].forEach((tp, k) => {
            cctx.globalAlpha = (k / trails[i].length) * 0.5;
            cctx.fillStyle = HOMER_COLORS[i];
            cctx.fillRect(tp.x, tp.y, 1, 1);
          });
          cctx.globalAlpha = 1;
          cctx.fillStyle = HOMER_COLORS[i];
          cctx.fillRect(pt.x - 1, pt.y - 1, 3, 3);
          cctx.fillStyle = '#ffffff';
          cctx.fillRect(pt.x, pt.y, 1, 1);
        });
        // live standings under the map
        const board2 = document.getElementById('hm-board');
        if (board2) {
          const ranked = def.homers.map((h, i) => ({ h, i }))
            .sort((a, b) => (finished.includes(a.i) || finished.includes(b.i))
              ? (finished.indexOf(a.i) === -1 ? 99 : finished.indexOf(a.i)) - (finished.indexOf(b.i) === -1 ? 99 : finished.indexOf(b.i))
              : prog[b.i] - prog[a.i]);
          board2.innerHTML = ranked.map((e, rank) =>
            `<span style="color:${e.i === pickIdx ? 'var(--gold-ink)' : 'inherit'};font-weight:${e.i === pickIdx ? 700 : 400}">
             ${rank + 1}. <span style="color:${HOMER_COLORS[e.i]}">●</span> ${escapeHtml(e.h.name)}${finished.includes(e.i) ? ' 🏠' : ''}</span>`).join(' &nbsp; ');
        }
        if (finished.length >= def.homers.length || t > 18) return res();
        requestAnimationFrame(frame);
      }
      frame();
    });
    if (!alive(s)) return;
    const won = pickIdx === winner;
    settle(bet, won ? rtp / def.homers[pickIdx].p : 0, stage,
      won ? `${def.homers[winner].name} folds its wings over ${roost.name} first — your call!`
          : `${def.homers[winner].name} makes ${roost.name} first. Yours took the scenic route.`);
    const again = document.createElement('button');
    again.className = 'btn secondary';
    again.textContent = 'Next race';
    again.addEventListener('click', board);
    stage.appendChild(again);
  }
  board();
}

/* ------------------------------------------------------------
   Mechanic: auction — the Grand Auction House. A selling channel,
   not a wager: consign one of your Lucklians and the hammer price
   is drawn from a factor table scaled so E[price] = face value
   EXACTLY. The drama (cold rooms, bidding wars, the Anonymous
   Telephone Bidder) is choreography around that honest draw.
   Auction sales don't touch the daily market cap.
   ------------------------------------------------------------ */
export function auctionWindow() {
  const A = CONFIG.AUCTION;
  const into = (Date.now() / 1000) % A.CYCLE_S;
  return { open: into < A.OPEN_S, left: A.OPEN_S - into, until: A.CYCLE_S - into };
}
export function auctionFactors(def) {
  const ev = def.factors.reduce((a, e) => a + e.f * e.w, 0) / def.factors.reduce((a, e) => a + e.w, 0);
  return def.factors.map((e) => ({ ...e, f: e.f / ev }));   // EV lands on exactly 1.0
}
const AUCTION_BIDDERS = [
  'Baron von Vole', 'Madame Époque', 'Duke Reginald Plume', 'The Anonymous Telephone Bidder',
  'Heiress Neko-Signage', 'A Mysterious Monk', 'Twin Magnates Gou & Dou', 'Old Money Maud',
  'The Kilfenny Syndicate', 'Doctor Prendergast', 'Lady Barnacle', 'A Nervous Intern (on behalf of someone)',
];

async function runAuction(def, provCode) {
  const win = auctionWindow();
  if (!win.open) {
    const m = Math.floor(win.until / 60), s2 = Math.round(win.until % 60);
    showModal(`
      <h2>🔨 ${escapeHtml(def.name)}</h2>
      <div class="subtitle">The gavel rests between sessions.</div>
      <div class="stage"><div class="big-sym">🪑</div>
      <div class="flavor">Chairs are being straightened and paddles counted. The next session opens in <b>${m}m ${s2}s</b>.</div></div>
      <div class="btn-row"><button class="btn secondary" id="au-ok">Come back then</button></div>
    `);
    document.getElementById('au-ok').addEventListener('click', closeModal);
    return;
  }
  session++;
  const factors = auctionFactors(def);
  let lotNo = 1 + ((roll() * 40) | 0);

  function lobby() {
    const owned = LUCKLIANS.filter((l) => (state.lk?.caught[l.id] || 0) > 0);
    if (!owned.length) {
      showModal(`
        <h2>🔨 ${escapeHtml(def.name)}</h2>
        <div class="subtitle">Session open · ${Math.ceil(win.left / 60)}m left on the clock</div>
        <div class="stage"><div class="big-sym">🧐</div>
        <div class="flavor">“Nothing to consign?” The auctioneer looks you up and down. “Catch something worth the room's time.”</div></div>
        <div class="btn-row"><button class="btn secondary" id="au-none">Slip out the back</button></div>
      `, { onClose: () => { session++; } });
      document.getElementById('au-none').addEventListener('click', closeModal);
      return;
    }
    const m = showModal(`
      <h2>🔨 ${escapeHtml(def.name)}</h2>
      <div class="subtitle">${escapeHtml(def.desc)}<br>Session open · sales here never touch your market quota</div>
      <div id="au-list"></div>
    `, { onClose: () => { session++; } });
    const box = m.querySelector('#au-list');
    owned.forEach((l) => {
      const n = state.lk.caught[l.id];
      const tier = rarityTier(l.rare);
      const row = document.createElement('div');
      row.className = 'race-lane race-pick-btn';
      row.innerHTML = `<span style="flex:1;text-align:left;display:flex;align-items:center;gap:8px">
          <img src="${getLucklianSprite(l).toDataURL()}" style="width:26px;image-rendering:pixelated" alt="">
          <span><span style="color:${tier.ink};font-weight:700">${escapeHtml(l.name)}</span>${n > 1 ? ` <span style="opacity:.6">x${n}</span>` : ''}</span></span>
        <span class="odds">face ${fmtCoins(l.value)} 🪙</span>`;
      row.addEventListener('click', () => sellLot(l));
      box.appendChild(row);
    });
  }

  async function sellLot(l) {
    const s = session;
    if ((state.lk.caught[l.id] || 0) === 0) return;
    // the hammer price is settled here, honestly, before the theatre starts
    const pick = weightedPick(factors.map((e) => ({ ...e, weight: e.w })));
    const price = Math.max(5, Math.round((l.value * pick.f) / 5) * 5);
    state.lk.caught[l.id] -= 1;
    const bidders = [...AUCTION_BIDDERS].sort(() => roll() - 0.5).slice(0, 3);
    const winnerBidder = pick.tag === 'frenzy' ? 'The Anonymous Telephone Bidder' : bidders[0];
    showModal(`
      <h2>🔨 Lot ${lotNo++}</h2>
      <div class="subtitle">One ${escapeHtml(l.name)}, ${escapeHtml(rarityTier(l.rare).name.toLowerCase())}, consigned by a walk-in</div>
      <div class="stage" id="g-stage">
        <img src="${getLucklianSprite(l).toDataURL()}" class="lk-sprite big" alt="">
        <div id="au-feed" style="min-height:96px;font-size:12.5px;line-height:1.7;text-align:left;width:100%"></div>
      </div>
    `, { onClose: () => { session++; } });
    const feed = document.getElementById('au-feed');
    const say = async (text, ms = 700) => {
      const el = document.createElement('div');
      el.innerHTML = text;
      feed.appendChild(el);
      while (feed.children.length > 6) feed.removeChild(feed.firstChild);
      await wait(ms);
      return alive(s);
    };
    if (!await say(`🎩 “Lot ${lotNo - 1}: a fine ${escapeHtml(l.name)}, face value ${fmtCoins(l.value)}. Who'll start me?”`, 900)) return finalize();
    // the bids climb from ~35% of the hammer to the hammer
    let bid = Math.max(5, Math.round(price * 0.35 / 5) * 5);
    let turn = 0;
    const lines = pick.tag === 'cold'
      ? ['A cough at the back.', 'Someone studies the ceiling.', 'A paddle rises… halfway.']
      : pick.tag === 'frenzy'
        ? ['The telephone rings.', 'Paddles EVERYWHERE.', 'The room is on its feet!']
        : ['A paddle up.', 'A nod from the third row.', 'Two paddles at once!'];
    while (bid < price) {
      const who = bidders[turn % bidders.length];
      turn++;
      const step = Math.max(5, Math.round(price * (pick.tag === 'frenzy' ? 0.16 : 0.11) * (0.7 + roll() * 0.6) / 5) * 5);
      bid = Math.min(price, bid + step);
      if (!await say(`${bid >= price ? '🔥' : '🪧'} <b>${escapeHtml(who)}</b> bids <b>${fmtCoins(bid)}</b>! <span style="opacity:.6">${escapeHtml(lines[turn % lines.length])}</span>`, pick.tag === 'frenzy' ? 420 : 650)) return finalize();
    }
    if (!await say('🎩 “Going once…”', 700)) return finalize();
    if (!await say('🎩 “Going twice…”', 700)) return finalize();
    await say(`🔨 <b>SOLD to ${escapeHtml(winnerBidder)} for ${fmtCoins(price)} 🪙</b> ${price > l.value * 1.4 ? '— the room erupts!' : price < l.value * 0.7 ? '— a steal, and everyone knows it.' : ''}`, 400);
    finalize();
    function finalize() {
      // settle instantly no matter when the modal closes — the lot was sold
      if (finalize.done) return;
      finalize.done = true;
      payout(price);
      renderBalance();
      toast(`🔨 Your ${escapeHtml(l.name)} hammered at <span class="amt">${fmtCoins(price)}</span> 🪙 (${(price / l.value).toFixed(2)}x face) to ${escapeHtml(winnerBidder)}.`, price > l.value * 1.8);
    }
    if (!alive(s)) return;
    const again = document.createElement('button');
    again.className = 'btn secondary';
    again.textContent = 'Consign another lot';
    again.addEventListener('click', lobby);
    document.getElementById('g-stage')?.appendChild(again);
  }

  lobby();
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
    case 'props': runProps(def, provCode); break;
    case 'hilo': runHilo(def, provCode); break;
    case 'standoff': runStandoff(def, provCode); break;
    case 'wheel': runWheel(def, provCode); break;
    case 'plinko': runPlinko(def, provCode); break;
    case 'gates': runGates(def, provCode); break;
    case 'path': runPath(def, provCode); break;
    case 'pickchain': runPickchain(def, provCode); break;
    case 'reels': runReels(def, provCode); break;
    case 'fishing': runFishing(def, provCode); break;
    case 'hunt': openHuntLobby(provCode, def.national ? 'national' : 'local'); break;
    case 'panning': runPanning(def, provCode); break;
    case 'expedition': runExpedition(def, provCode); break;
    case 'market': runMarket(def, provCode); break;
    case 'homing': runHoming(def, provCode); break;
    case 'auction': runAuction(def, provCode); break;
    // 'lantern' is routed by main.js to the live river race in liveevents.js
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
