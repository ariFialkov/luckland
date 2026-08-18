/* ============================================================
   Luckland — characters
   ------------------------------------------------------------
   Named NPCs with dialogue (some bless your luck, some deal a
   game), plus the "simulated multiplayer" crowd: harmless bot
   players who roam the continent, chase fresh chests and win
   loudly so the whole place feels alive.
   ============================================================ */

import { CONFIG, BLESSING } from './config.js';
import { roll, pick, mulberry32 } from './rng.js';
import { T, isSolidTile, PROVINCES } from './world.js';
import { makeCharSprite, makeDragonSprite } from './sprites.js';
import { state, meetNpc, grantLuck } from './state.js';
import { showModal, closeModal, escapeHtml, toast } from './ui.js';
import { openGame } from './games.js';

/* ------------------------------------------------------------
   Named NPCs
   ------------------------------------------------------------ */
export const NPC_DEFS = [
  {
    id: 'ichiban', name: 'Ichiban', title: 'Wandering Samurai (off duty, always)',
    prov: 'MN', portrait: '🍶', game: 'pachinko',
    home: { x: 292, y: 52 }, radius: 10,
    pal: { skin: '#f0c8a0', body: '#7a2a2a', legs: '#2a2a3a', hat: 'topknot', hair: '#1a1a22' },
    lines: [
      '*hic* You! Yes, YOU witnessed that! Three jackpots in a row! The machine FEARS me!',
      'A samurai needs only three things: honour, steel, and a pocket full of pachinko balls.',
      'I once split a falling cherry blossom in two. Tonight I cannot split my bar tab. Balance!',
      'The neon... it calls to me like a thousand fireflies who all owe me money.',
    ],
  },
  {
    id: 'yongxin', name: 'Yong Xin', title: 'Dragon Warden of the Eastern Peaks',
    prov: 'DG', portrait: '🐉', special: 'dragon', blessing: true,
    home: { x: 228, y: 141 }, radius: 16, slow: true,
    lines: [
      'Few climb this high, traveler. Fewer still are seen by me. Consider what that makes you: fortunate.',
      'Luck is a river. The wise do not dam it, nor drown in it — they learn where it bends.',
      'I have watched a thousand tides turn. The patient gambler and the patient mountain outlast them both.',
      'Go now. The wind that carried you to me carries a blessing back down.',
    ],
  },
  {
    id: 'agamemnon', name: 'King Agamemnon', title: 'High King of Tyche & Fortuna (very secure, thanks for asking)',
    prov: 'TF', portrait: '👑', game: 'tali',
    home: { x: 236, y: 36 }, radius: 8,
    pal: { skin: '#e8b888', body: '#8a2be2', legs: '#5a3a1e', hat: 'crown' },
    lines: [
      'MOBILIZE THE ARMY! ...What? The tavern merely ran out of my favourite olives. Stand down. STAND DOWN I SAID.',
      'Am I insecure? I, who own nine hundred ships?! ...Why, did somebody say something? Who said something?',
      'I once declared war over a dice game. We won the war but lost the rematch. We do not speak of the rematch.',
      'Fortuna loves me best. Tyche also loves me best. It is exhausting, being loved best twice.',
    ],
  },
  {
    id: 'leonidas', name: 'General Leonidas', title: 'Lord of Upsilonia, Admiral of the Tychean Fleet',
    prov: 'TF', portrait: '⚔️', game: 'chariots',
    home: { x: 131, y: 21 }, radius: 5,
    pal: { skin: '#e0a878', body: '#a02020', legs: '#7a5a2a', hat: 'helmet', hatColor: '#b8862a' },
    lines: [
      'You crossed at low tide. Clever. I respect clever. I also mine the causeway at high tide. Respect THAT.',
      'Three hundred ships, and Agamemnon asks to borrow a rowboat. I told him it was in the shop.',
      'Strategy is knowing when to strike. Luck is striking anyway and writing a better report afterwards.',
      'We are an island of discipline in a sea of chance. The sea is winning, but slowly.',
    ],
  },
  {
    id: 'seamus', name: 'Seamus', title: 'Freelance Leprechaun, Chartered',
    prov: 'FL', portrait: '🍀', game: 'rainbow', blessing: true,
    home: { x: 90, y: 108 }, radius: 20,
    pal: { skin: '#f0c8a0', body: '#1f7a2f', legs: '#5a3a1e', hat: 'cap', hatColor: '#155a20', hair: '#c05020' },
    lines: [
      "Ah, you'd be after me gold! Get in line — behind the taxman, two banshees, and me ex.",
      'A rainbow is just the sky placing a bet. Sometimes it pays out. Usually it rains.',
      "I'll grant ye a wee blessing, so I will. Don't spend it all in one province.",
      "Rule one of treasure huntin': if the chest looks too cheap, it's me cousin's. Don't open me cousin's chest.",
    ],
  },
  {
    id: 'jb', name: 'J.B.', title: 'Retired Legend, Horseshoeville Rodeo',
    prov: 'HV', portrait: '🤠', game: 'ponies',
    home: { x: 40, y: 202 }, radius: 8,
    pal: { skin: '#e0a878', body: '#8a5a2a', legs: '#3a5a8a', hat: 'cowboy', hatColor: '#6d4520' },
    lines: [
      "Retired? Sure. But when the crowd starts hollerin' my name, well... a bull's just a big couch that hates you.",
      "Rode Tornado for a full eight seconds in '09. The doctor said never again. The doctor ain't here.",
      'Easy there, partner. Luck is like a bull — you can ride it, but you sure as heck don’t own it.',
      "Bet on Whiskey Wind if she's runnin'. Don't tell the others I said that. Especially Old Biscuit.",
    ],
  },
  {
    id: 'khrueang', name: 'Khrueang', title: 'Undisputed Champion of Elephantium',
    prov: 'EP', portrait: '🥊', game: 'muaythai',
    home: { x: 335, y: 182 }, radius: 8,
    pal: { skin: '#c08a58', body: '#c02a2a', legs: '#2a2a2a', hat: null, hair: '#111' },
    lines: [
      '*lights cigarette* Training? I am training. This is a breathing exercise.',
      'My regiment: rice whiskey, eight hours of cards, two hours of kicks. Undefeated. Do not try it.',
      'The doctors say my liver should not exist. Neither should my left hook. Yet here we are.',
      'Bet on me tonight. Or against me — I win either way, and one of us buys the drinks.',
    ],
  },
  /* ---- extra locals, one-ish per province ---- */
  {
    id: 'meri', name: 'Madame Meri', title: 'Fortune Cat of Neko Island',
    prov: 'MN', portrait: '🐱', blessing: true,
    home: { x: 338, y: 24 }, radius: 5,
    pal: { skin: '#f8e0c8', body: '#d44a8a', legs: '#3a2a3a', hat: 'ears', hatColor: '#f8f8f8' },
    lines: [
      'Mrrrow. The left paw beckons money, the right paw beckons people. I beckon lunch.',
      'Your fortune: a stranger will hand you exactly what you paid for, minus the house edge. Spooky, no?',
      'Cross the sandbar when the sea inhales. It exhales at high tide — and takes slow tourists with it.',
      'I knock things off tables professionally. Tonight, may the odds be one of those things.',
    ],
  },
  {
    id: 'paddy', name: 'Paddy O’Dds', title: 'Ballyclover Bookmaker (licence pending since 1847)',
    prov: 'FL', portrait: '📓', game: 'roadbowls',
    home: { x: 112, y: 124 }, radius: 6,
    pal: { skin: '#f0c8a0', body: '#3a3a5a', legs: '#2a2a2a', hat: 'cap', hatColor: '#4a4a2a' },
    lines: [
      "I'll give ye 7-to-2 the bowl clears the corner, and 50-to-1 the parish priest doesn't hear about it.",
      'The house edge? A humble fee. Sure the house has to eat too, and the house has fierce expensive taste.',
      "I once paid out a bet in sheep. Grand wee economy we have here.",
    ],
  },
  {
    id: 'doc', name: 'Doc Ace', title: 'House Dealer, The Grand Saloon',
    prov: 'HV', portrait: '🎩', game: 'fivecard',
    home: { x: 88, y: 167 }, radius: 5,
    pal: { skin: '#e8c098', body: '#2a2a2a', legs: '#2a2a2a', hat: 'cowboy', hatColor: '#1a1a1a' },
    lines: [
      "Cards don't lie, friend. Card PLAYERS, on the other hand — hoo boy.",
      'I deal fair and square. The square is where I keep the aces. Kidding! ...Mostly kidding.',
      'A man once drew a royal flush in this very chair. We framed the chair. He bought the bar.',
    ],
  },
  {
    id: 'loong', name: 'Lady Loong', title: 'Keeper of the Hidden Tea House',
    prov: 'DG', portrait: '🍵', game: 'teahouse',
    home: { x: 200, y: 152 }, radius: 3, slow: true,
    pal: { skin: '#f0d0a8', body: '#1f5a4a', legs: '#3a2a2a', hat: 'topknot', hair: '#111' },
    lines: [
      'You found us. The mountain approves of you — or is bored of you. Either way: tea?',
      'Here we wager quietly. The loudest thing in this room should be your heartbeat at the reveal.',
      'The golden leaf chooses its cup fresh each pour. Even I do not know. Especially I do not know.',
    ],
  },
  {
    id: 'sao', name: 'Sister Sao', title: 'Bell-Keeper of the Golden Temple',
    prov: 'EP', portrait: '🔔', game: 'spirits', blessing: true,
    home: { x: 236, y: 168 }, radius: 5, slow: true,
    pal: { skin: '#d8a878', body: '#e8901a', legs: '#e8901a', hat: 'hood', hatColor: '#c87a10' },
    lines: [
      'The spirits love a good wager. Why do you think the bells are shaped like cups?',
      'Give with an open hand, receive with an open hand. Gamble with both hands firmly on your coin purse.',
      'The fog hides a cove to the southeast where the sea keeps her own treasury. She opens it at low tide.',
    ],
  },
  {
    id: 'hermes', name: 'Hermes Jr.', title: 'Junior Courier of the Goddesses (unpaid internship)',
    prov: 'TF', portrait: '🪽',
    home: { x: 180, y: 119 }, radius: 12,
    pal: { skin: '#f0c8a0', body: '#e8e8f0', legs: '#c8a858', hat: 'cap', hatColor: '#e8e8f0' },
    lines: [
      'Message for you! ...Actually no, this one is for a Mr. Agamemnon. It is his eleventh apology letter today.',
      'Tip from the top: chests near the tide line pay richer. The sea is a terrible accountant.',
      'The goddesses say hello. Well, Tyche said hello. Fortuna sort of nodded. Big day for you honestly.',
      'I ran a message to Dragonia once through the mountain pass. The dragon WAVED. I framed my ankles.',
    ],
  },
];

/* ------------------------------------------------------------
   NPC runtime
   ------------------------------------------------------------ */
export function createNpcs(world) {
  return NPC_DEFS.map((def) => {
    const sprite = def.special === 'dragon' ? makeDragonSprite() : makeCharSprite(def.pal || {});
    return {
      def, sprite,
      x: def.home.x * 16 + 8, y: def.home.y * 16 + 8,
      dir: 0, frame: 0, animT: 0,
      moveT: 1 + roll() * 2, vx: 0, vy: 0,
      lineIdx: 0,
    };
  });
}

export function updateNpc(n, world, tide, dt) {
  n.moveT -= dt;
  const speed = n.def.slow ? 18 : 28;
  if (n.moveT <= 0) {
    n.moveT = 1.2 + roll() * 2.5;
    if (roll() < 0.35) { n.vx = 0; n.vy = 0; }
    else {
      const ang = roll() * Math.PI * 2;
      n.vx = Math.cos(ang) * speed; n.vy = Math.sin(ang) * speed;
    }
  }
  moveEntity(n, world, tide, dt, n.def.home, n.def.radius);
  animateEntity(n, dt);
}

/* Shared walking + collision + leash for NPCs and bots. */
function moveEntity(e, world, tide, dt, home, radius) {
  // leash back toward home
  if (home) {
    const hx = home.x * 16 + 8, hy = home.y * 16 + 8;
    const d = Math.hypot(e.x - hx, e.y - hy);
    if (d > radius * 16) {
      const sp = Math.hypot(e.vx, e.vy) || 24;
      e.vx = (hx - e.x) / d * sp;
      e.vy = (hy - e.y) / d * sp;
    }
  }
  const nx = e.x + e.vx * dt, ny = e.y + e.vy * dt;
  const tx = Math.floor(nx / 16), ty = Math.floor(ny / 16);
  const nt = world.inB(tx, ty) ? world.tiles[ty * world.W + tx] : T.DEEP;
  // AI folk keep their boots dry — shallows are player-only
  if (!isSolidTile(nt, tide) && nt !== T.SHALLOW) {
    e.x = nx; e.y = ny;
  } else {
    e.vx = -e.vx; e.vy = -e.vy; e.moveT = Math.min(e.moveT, 0.4);
  }
  if (Math.abs(e.vx) > Math.abs(e.vy)) e.dir = e.vx < 0 ? 1 : 2;
  else if (e.vy !== 0) e.dir = e.vy < 0 ? 3 : 0;
}

function animateEntity(e, dt) {
  if (e.vx || e.vy) {
    e.animT += dt;
    if (e.animT > 0.17) { e.animT = 0; e.frame = 1 - e.frame; }
  } else e.frame = 0;
}

/* ------------------------------------------------------------
   NPC dialogue modal
   ------------------------------------------------------------ */
export function talkTo(npc, provCode) {
  const def = npc.def;
  const firstMeeting = meetNpc(def.id);
  const line = def.lines[npc.lineIdx % def.lines.length];
  npc.lineIdx++;

  const canBless = def.blessing && roll() < 0.4;
  showModal(`
    <h2>${def.portrait} ${escapeHtml(def.name)}</h2>
    <div class="subtitle">${escapeHtml(def.title)}</div>
    <div class="dialogue-box">
      <div class="dialogue-portrait">${def.portrait}</div>
      <div class="dialogue-text">
        <div class="dialogue-name">${escapeHtml(def.name.toUpperCase())}</div>
        ${escapeHtml(line)}
      </div>
    </div>
    <div class="btn-row" id="npc-actions"></div>
  `);
  const actions = document.getElementById('npc-actions');

  if (def.game) {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = '🎲 Play a game';
    b.addEventListener('click', () => openGame(def.game, provCode));
    actions.appendChild(b);
  }
  if (canBless || (def.id === 'yongxin' && firstMeeting)) {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = '🍀 Receive blessing';
    b.addEventListener('click', () => {
      grantLuck(BLESSING.rtpBonus, BLESSING.seconds);
      toast(`<span class="who">${escapeHtml(def.name)}</span> blessed your luck! +${Math.round(BLESSING.rtpBonus * 100)}% RTP for ${BLESSING.seconds}s`, true);
      closeModal();
    });
    actions.appendChild(b);
  }
  const bye = document.createElement('button');
  bye.className = 'btn secondary';
  bye.textContent = 'Farewell';
  bye.addEventListener('click', closeModal);
  actions.appendChild(bye);
}

/* ------------------------------------------------------------
   Bots — the simulated multiplayer crowd
   ------------------------------------------------------------ */
const BOT_NAMES = [
  'LuckyLuna', 'xX_Fortune_Xx', 'CloverKid', 'NeonRonin', 'TidalTina', 'BigWinBarry',
  'JadeRabbit', 'DustyDan', 'PachinkoPam', 'RollingRhea', 'SevenSage', 'MistyMon',
  'GoldToothGil', 'HighTideHank', 'OmenOwl', 'BansheeBets', 'DimSumDee', 'CactusKate',
  'ShrineSurfer', 'DenariusDom', 'FoggyFred', 'MangoMaeve', 'TorchToro', 'WhistlinWade',
  'KoiBoi', 'LanternLiz', 'SpinnySid', 'MahjongMai', 'BullseyeBea', 'DrizzleDara',
];
const BOT_GAME_NAMES = ['Pachinko', 'Tali', 'Road Bowls', 'a Showdown', 'Alley Mahjong', 'Haiko',
  'the Slots', 'Sic Bo', 'the Derby', 'the Chariots', 'a Fortune Chest', 'a Jade Puzzle Box',
  'a Neon Capsule', 'the Temple Bells', 'a Tidewrought Locker'];

export function createBots(world) {
  const rng = mulberry32(CONFIG.WORLD_SEED + 999);
  const bots = [];
  const palettes = [
    '#3a6ea5', '#c05050', '#4faf50', '#c96ad4', '#e0a92e', '#4f9c9c', '#8a5ac0', '#c07a3a',
  ];
  for (let i = 0; i < CONFIG.BOT_COUNT; i++) {
    // scatter bots near roads/plazas so the world feels inhabited where it matters
    let x = 0, y = 0, tries = 0;
    do {
      x = Math.floor(rng() * world.W); y = Math.floor(rng() * world.H);
      tries++;
    } while (tries < 200 && world.tiles[y * world.W + x] !== T.ROAD && world.tiles[y * world.W + x] !== T.PLAZA && world.tiles[y * world.W + x] !== T.NEON);
    const skinTones = ['#f0c8a0', '#e0a878', '#c08a58', '#8a5a38'];
    bots.push({
      name: BOT_NAMES[i % BOT_NAMES.length],
      sprite: makeCharSprite({
        skin: skinTones[i % skinTones.length],
        body: palettes[i % palettes.length],
        legs: '#33334a',
        hat: ['none', 'cap', 'cowboy', 'hood', 'ears'][i % 5] === 'none' ? null : ['none', 'cap', 'cowboy', 'hood', 'ears'][i % 5],
        hatColor: palettes[(i + 3) % palettes.length],
      }),
      x: x * 16 + 8, y: y * 16 + 8,
      dir: 0, frame: 0, animT: 0, moveT: roll() * 2, vx: 0, vy: 0,
      target: null,        // concealer they're racing toward
      celebrateT: 0,
    });
  }
  return bots;
}

export function updateBot(b, world, tide, dt, concealers, emitWorldWin) {
  if (b.celebrateT > 0) { b.celebrateT -= dt; b.vx = 0; b.vy = 0; animateEntity(b, dt); return; }

  // occasionally race toward a fresh chest
  if (!b.target && roll() < dt * 0.02 && concealers.length) {
    const c = pick(concealers);
    if (Math.hypot(c.x * 16 - b.x, c.y * 16 - b.y) < 90 * 16) b.target = c;
  }
  if (b.target) {
    if (!concealers.includes(b.target)) { b.target = null; }
    else {
      const txp = b.target.x * 16 + 8, typ = b.target.y * 16 + 8;
      const d = Math.hypot(txp - b.x, typ - b.y);
      if (d < 14) {
        // bot "opens" the chest — race lost for the player!
        const idx = concealers.indexOf(b.target);
        if (idx >= 0) concealers.splice(idx, 1);
        emitWorldWin(b, `cracked open a ${b.target.type.name}`, Math.round(b.target.type.price * (0.5 + roll() * 3)));
        b.target = null;
        b.celebrateT = 2;
      } else {
        const sp = 34;
        b.vx = (txp - b.x) / d * sp; b.vy = (typ - b.y) / d * sp;
      }
    }
  } else {
    b.moveT -= dt;
    if (b.moveT <= 0) {
      b.moveT = 1 + roll() * 3;
      if (roll() < 0.3) { b.vx = 0; b.vy = 0; }
      else { const a = roll() * Math.PI * 2; b.vx = Math.cos(a) * 26; b.vy = Math.sin(a) * 26; }
    }
  }
  moveEntity(b, world, tide, dt, null, 0);
  animateEntity(b, dt);
}

/* ------------------------------------------------------------
   Citizens — ambient townsfolk. Non-interactive set dressing:
   they stroll their home city so the streets feel lived-in.
   ------------------------------------------------------------ */
const CITIZEN_PALETTES = {
  TF: [{ body: '#e8e2d4', hat: null }, { body: '#8a6ab0', hat: null }, { body: '#c0a040', hat: 'hood', hatColor: '#e8e2d4' }],
  FL: [{ body: '#1f7a2f', hat: 'cap', hatColor: '#155a20' }, { body: '#7a5a3a', hat: 'cap', hatColor: '#4a4a2a' }, { body: '#3a5a8a', hat: null }],
  HV: [{ body: '#8a5a2a', hat: 'cowboy', hatColor: '#6d4520' }, { body: '#5a4a3a', hat: 'cowboy', hatColor: '#3a2a1a' }, { body: '#a03030', hat: 'cowboy', hatColor: '#8a7050' }],
  DG: [{ body: '#c02a2a', hat: 'topknot' }, { body: '#1f5a4a', hat: 'topknot' }, { body: '#d4a018', hat: null }],
  EP: [{ body: '#e8901a', hat: 'hood', hatColor: '#c87a10' }, { body: '#4a7a5a', hat: null }, { body: '#8a5a8a', hat: null }],
  MN: [{ body: '#d44a8a', hat: null }, { body: '#3a3a5a', hat: 'cap', hatColor: '#222' }, { body: '#5eaebc', hat: 'ears', hatColor: '#f8f8f8' }],
};

export function createCitizens(world) {
  const rng = mulberry32(CONFIG.WORLD_SEED + 4242);
  const citizens = [];
  const skinTones = ['#f0c8a0', '#e0a878', '#c08a58', '#8a5a38'];
  for (const city of world.cities) {
    const pals = CITIZEN_PALETTES[city.prov] || CITIZEN_PALETTES.TF;
    for (let i = 0; i < city.citizens; i++) {
      const pal = pals[i % pals.length];
      const ang = rng() * Math.PI * 2, dist = rng() * city.r * 0.7;
      citizens.push({
        sprite: makeCharSprite({
          skin: skinTones[(i + city.x) % skinTones.length],
          body: pal.body, legs: '#33334a', hat: pal.hat, hatColor: pal.hatColor || '#333',
        }),
        x: (city.x + Math.cos(ang) * dist) * 16 + 8,
        y: (city.y + Math.sin(ang) * dist) * 16 + 8,
        dir: 0, frame: 0, animT: 0, moveT: rng() * 2, vx: 0, vy: 0,
        home: city, // leash to the city
      });
    }
  }
  return citizens;
}

export function updateCitizen(c, world, tide, dt) {
  c.moveT -= dt;
  if (c.moveT <= 0) {
    c.moveT = 1.5 + roll() * 3;
    if (roll() < 0.4) { c.vx = 0; c.vy = 0; }
    else { const a = roll() * Math.PI * 2; c.vx = Math.cos(a) * 20; c.vy = Math.sin(a) * 20; }
  }
  moveEntity(c, world, tide, dt, c.home, c.home.r);
  animateEntity(c, dt);
}

/* Global fake-win feed. */
export function randomBotWinToast(bots, world) {
  const b = pick(bots);
  const provCode = world.provAt(Math.floor(b.x / 16), Math.floor(b.y / 16));
  const provName = PROVINCES[provCode]?.name || 'the wilds';
  const big = roll() < 0.12;
  const amount = big ? Math.round(500 + roll() * 9500) : Math.round(20 + roll() * 480);
  toast(
    `<span class="who">${escapeHtml(b.name)}</span> won <span class="amt">${amount.toLocaleString('en-US')}</span> 🪙 on ${escapeHtml(pick(BOT_GAME_NAMES))} in ${escapeHtml(provName)}${big ? ' 🎉' : ''}`,
    big
  );
  return { bot: b, amount, big };
}
