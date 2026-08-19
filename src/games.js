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
};

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
    case 'wheel': runWheel(def, provCode); break;
    case 'plinko': runPlinko(def, provCode); break;
    case 'gates': runGates(def, provCode); break;
    case 'path': runPath(def, provCode); break;
    case 'pickchain': runPickchain(def, provCode); break;
    case 'reels': runReels(def, provCode); break;
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
