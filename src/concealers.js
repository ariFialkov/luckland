/* ============================================================
   Luckland — concealers (openable treasure objects)
   ------------------------------------------------------------
   Chests spawn continuously across the whole continent. Each
   has an opening price and a loot pool whose expected value is
   price * chest RTP * province modifier (see src/config.js).
   Rarer pulls get flashier opening ceremonies.
   ============================================================ */

import { CONFIG, CONCEALER_TYPES, RARITY_TIERS, ADDON_CHANCE, ADDONS } from './config.js';
import { roll, weightedPick, pick } from './rng.js';
import { T, isSolidTile } from './world.js';
import { state, spend, payout, canAfford, effectiveChestRTP, addToCollection, grantLuck } from './state.js';
import { showModal, closeModal, escapeHtml, toast, renderBalance } from './ui.js';

/* Themed item names per province, per rarity band (low/mid/high). */
const ITEM_NAMES = {
  TF: {
    low: ['Chipped Obol', 'Olive Pit Charm', 'Cracked Amphora Shard', 'Rusty Legion Button'],
    mid: ['Laurel Wreath', 'Silver Denarius Stack', 'Oracle Bone', 'Gladiator Buckle'],
    high: ["Tyche's Golden Cornucopia", "Fortuna's Wheel Medallion", 'Crown of the Blessed Emperor'],
  },
  FL: {
    low: ['Damp Peat Brick', 'Bent Horseshoe Nail', 'Pub Token', 'Wool Sock (single)'],
    mid: ['Four-Leaf Clover (pressed)', 'Silver Harp Coin', "Seamus' IOU (surprisingly honoured)"],
    high: ['Pot o’ Gold (small)', 'Rainbow-Forged Torc', 'The Blarney Nugget'],
  },
  HV: {
    low: ['Rusty Spur', 'Deck of Marked Cards', 'Empty Whiskey Flask', 'Tumbleweed (premium)'],
    mid: ['Silver Belt Buckle', 'Gold Tooth', 'Sheriff Star (retired)'],
    high: ['Golden Horseshoe', 'Deed to a Dusty Mine', "J.B.'s Championship Buckle"],
  },
  DG: {
    low: ['Cracked Mahjong Tile', 'Paper Fortune (soggy)', 'Tea-Stained Scroll'],
    mid: ['Jade Bangle', 'Imperial Silk Bolt', 'Bronze Dragon Seal'],
    high: ['Dragon Pearl', "The Emperor's Jade Dragon", 'Golden Koi of the Palace Pond'],
  },
  EP: {
    low: ['Incense Stub', 'Monsoon-Soaked Sandal', 'Clay Spirit Bell'],
    mid: ['Carved Teak Elephant', 'Temple Brass Gong', 'Lotus Pearl'],
    high: ['White Elephant Idol', 'Golden Stupa Relic', 'Eye of the Mist Spirit'],
  },
  MN: {
    low: ['Used Pachinko Ball', 'Expired Arcade Card', 'Plastic Beckoning Cat'],
    mid: ['Neon Sign Fragment', 'Golden Pachinko Ball', 'Vintage Gacha Figure (mint)'],
    high: ['Solid-Gold Maneki-Neko', 'The Jackpot Mushroom', 'Karaoke Trophy of Legends'],
  },
  SEA: {
    low: ['Barnacled Boot', 'Message in a Bottle (blank)'],
    mid: ['Pearl Cluster', 'Sunken Coin Purse'],
    high: ['Kraken-Guarded Chest Key', 'Tide-Queen’s Crown'],
  },
};

function nameFor(prov, rarityId) {
  const pool = ITEM_NAMES[prov] || ITEM_NAMES.SEA;
  const band = (rarityId === 'common' || rarityId === 'uncommon') ? 'low'
             : (rarityId === 'rare' || rarityId === 'epic') ? 'mid' : 'high';
  return pick(pool[band]);
}

const RARITY_ICO = { common: '🪵', uncommon: '🍀', rare: '💠', epic: '🔮', legendary: '🌟', mythic: '🌈' };
const RARITY_PARTICLES = { common: 1, uncommon: 4, rare: 8, epic: 14, legendary: 22, mythic: 34 };
const RARITY_RUMBLE_MS = { common: 500, uncommon: 700, rare: 950, epic: 1250, legendary: 1600, mythic: 2100 };

/* ------------------------------------------------------------
   Spawning
   ------------------------------------------------------------ */
export const concealers = []; // {x, y, type, sparkle}
let spawnTimer = 0;

function typeAllowedAt(type, provCode, isTidalZone) {
  if (type.tidal && !isTidalZone) return false;
  if (!type.tidal && isTidalZone) return roll() < 0.4;
  if (type.biomes === '*') return true;
  return type.biomes.includes(provCode);
}

function inTidalZone(world, x, y) {
  for (const z of world.zones) {
    if (z.tidal && Math.hypot(x - z.x, y - z.y) <= z.r + 2) return true;
  }
  return world.tiles[y * world.W + x] === T.TIDAL;
}

export function trySpawnConcealer(world) {
  if (concealers.length >= CONFIG.CONCEALER_MAX_ACTIVE) return null;
  for (let attempt = 0; attempt < 24; attempt++) {
    const x = 4 + Math.floor(roll() * (world.W - 8));
    const y = 4 + Math.floor(roll() * (world.H - 8));
    const t = world.tiles[y * world.W + x];
    if (isSolidTile(t, 0) || t === T.DOOR || t === T.TIDAL || t === T.SHALLOW) continue;
    if (concealers.some((c) => Math.hypot(c.x - x, c.y - y) < 4)) continue;
    const provCode = world.provAt(x, y);
    const tidal = inTidalZone(world, x, y);
    const options = CONCEALER_TYPES.filter((ct) => typeAllowedAt(ct, provCode, tidal));
    if (!options.length) continue;
    const type = weightedPick(options);
    const c = { x, y, type, born: performance.now() };
    concealers.push(c);
    return c;
  }
  return null;
}

export function updateConcealerSpawns(world, dt) {
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnTimer = CONFIG.CONCEALER_RESPAWN_S * (0.5 + roll());
    trySpawnConcealer(world);
  }
}

let worldRef = null;
export function seedConcealers(world) {
  worldRef = world;
  for (let i = 0; i < CONFIG.CONCEALER_MAX_ACTIVE * 0.8; i++) trySpawnConcealer(world);
}

export function removeConcealer(c) {
  const i = concealers.indexOf(c);
  if (i >= 0) concealers.splice(i, 1);
}

/* ------------------------------------------------------------
   Loot roll — normalized so E[value] = price * effective RTP
   ------------------------------------------------------------ */
export function rollLoot(type, provCode) {
  const rtp = effectiveChestRTP(type.rtp, provCode);
  let tw = 0, ev = 0;
  for (const t of RARITY_TIERS) { tw += t.weight; ev += t.weight * (t.lo + t.hi) / 2; }
  const scale = rtp / (ev / tw);

  const tier = weightedPick(RARITY_TIERS);
  let value = type.price * (tier.lo + roll() * (tier.hi - tier.lo)) * scale;

  let addon = null;
  if (roll() < ADDON_CHANCE) {
    addon = weightedPick(ADDONS);
    if (addon.id === 'bonus') value *= 1.5;
  }
  return { tier: tier.id, value, addon, name: nameFor(provCode, tier.id) };
}

/* ------------------------------------------------------------
   Opening ceremony
   ------------------------------------------------------------ */
export function openConcealer(c, provCode, onDone) {
  const type = c.type;
  const rtp = effectiveChestRTP(type.rtp, provCode);
  showModal(`
    <h2>${type.ico} ${escapeHtml(type.name)}</h2>
    <div class="subtitle">Open for ${type.price} 🪙 · avg. return ${(rtp * 100).toFixed(0)}%</div>
    <div class="stage chest-stage" id="chest-stage">
      <div class="chest-icon" id="chest-ico">${type.ico}</div>
    </div>
    <div class="btn-row">
      <button class="btn" id="chest-open">Open · ${type.price} 🪙</button>
      <button class="btn secondary" id="chest-walk">Walk away</button>
    </div>
  `);
  document.getElementById('chest-walk').addEventListener('click', closeModal);
  document.getElementById('chest-open').addEventListener('click', () => {
    if (!canAfford(type.price)) { toast('Not enough coins for this one!'); return; }
    spend(type.price, true);
    state.stats.chestsOpened++;
    renderBalance();
    removeConcealer(c);
    if (onDone) onDone();

    // Settle the loot instantly — the ceremony below is pure presentation,
    // so closing the modal early can never eat a paid-for pull.
    const loot = rollLoot(type, provCode);
    payout(loot.value, true);
    addToCollection(loot.name);
    if (loot.addon?.id === 'luck') grantLuck(0.03, 90);
    if (loot.addon?.id === 'tide') state.buffs.tideSightUntil = Date.now() + 120 * 1000;
    if (loot.tier === 'legendary' || loot.tier === 'mythic') {
      toast(`<span class="who">You</span> pulled <span class="amt">${escapeHtml(loot.name)}</span> from a ${escapeHtml(type.name)}!`, true);
    }
    if (type.id !== 'hoard') maybeMapFragment();

    const stage = document.getElementById('chest-stage');
    const ico = document.getElementById('chest-ico');
    document.getElementById('chest-open').remove();
    document.getElementById('chest-walk').textContent = 'Keep exploring';

    ico.classList.add('rumble');
    const rumbleMs = RARITY_RUMBLE_MS[loot.tier];

    setTimeout(() => {
      if (!document.getElementById('chest-stage')) return; // modal closed early — loot already settled
      ico.classList.remove('rumble');
      ico.style.display = 'none';

      // particles scale with rarity
      const n = RARITY_PARTICLES[loot.tier];
      const symbols = loot.tier === 'mythic' ? ['🌈', '⭐', '💎', '✨']
                   : loot.tier === 'legendary' ? ['⭐', '✨', '🪙']
                   : loot.tier === 'epic' ? ['🔮', '✨']
                   : ['✨'];
      for (let i = 0; i < n; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.textContent = pick(symbols);
        const ang = (i / n) * Math.PI * 2 + roll();
        const dist = 60 + roll() * 90;
        p.style.setProperty('--dx', `${Math.cos(ang) * dist}px`);
        p.style.setProperty('--dy', `${Math.sin(ang) * dist - 30}px`);
        p.style.left = '50%'; p.style.top = '50%';
        p.style.animationDelay = `${roll() * 0.25}s`;
        stage.appendChild(p);
      }
      if (loot.tier === 'epic' || loot.tier === 'legendary' || loot.tier === 'mythic') {
        const ring = document.createElement('div');
        ring.className = 'glow-ring';
        if (loot.tier === 'mythic') ring.style.borderColor = '#ff6be0';
        stage.appendChild(ring);
      }

      const card = document.createElement('div');
      card.className = 'reveal-card';
      card.innerHTML = `
        <span class="item-ico">${RARITY_ICO[loot.tier]}</span>
        <div class="item-rarity rarity-${loot.tier}">${loot.tier}</div>
        <div class="item-name">${escapeHtml(loot.name)}</div>
        <div class="item-value">+${Math.round(loot.value).toLocaleString('en-US')} 🪙</div>
        ${loot.addon ? `<div class="item-addon">${loot.addon.label} — ${escapeHtml(loot.addon.desc)}</div>` : ''}
      `;
      stage.appendChild(card);
      renderBalance();
    }, rumbleMs);
  });
}

/* ------------------------------------------------------------
   Tide-treasure maps — chests sometimes cough up fragments of
   a torn treasure map. Complete one and a Sunken Hoard appears
   on a tide-bared flat: the best chest odds in the game, but
   only the low tide will let you reach it.
   ------------------------------------------------------------ */
const TM = CONFIG.TMAP;
export const HOARD_TYPE = {
  id: 'hoard', name: 'Sunken Hoard', ico: '💰',
  price: TM.HOARD_PRICE, rtp: TM.HOARD_RTP, weight: 0, biomes: '*',
};

function placeHoard() {
  if (!worldRef) return null;
  const zones = [...worldRef.zones.filter((z) => z.tidal)].sort(() => roll() - 0.5);
  for (const z of zones) {
    for (let tries = 0; tries < 250; tries++) {
      const x = Math.round(z.x + (roll() - 0.5) * z.r * 2);
      const y = Math.round(z.y + (roll() - 0.5) * z.r * 2);
      if (x < 2 || y < 2 || x >= worldRef.W - 2 || y >= worldRef.H - 2) continue;
      if (worldRef.tiles[y * worldRef.W + x] === T.TIDAL) return { x, y, region: z.name || 'a tide-bared shore' };
    }
  }
  return null;
}

function maybeMapFragment() {
  const tm = state.tmap || (state.tmap = { frags: 0, hoard: null });
  if (tm.hoard || roll() >= TM.FRAG_CHANCE) return;
  tm.frags = Math.min(TM.FRAGS_NEEDED, (tm.frags || 0) + 1);
  if (tm.frags >= TM.FRAGS_NEEDED) {
    const spot = placeHoard();
    if (!spot) { tm.frags = TM.FRAGS_NEEDED - 1; return; }
    tm.hoard = spot;
    tm.frags = 0;
    toast(`🗺️ <b>The map is complete!</b> A Sunken Hoard lies at <b>${escapeHtml(spot.region)}</b> — only the low tide will bare it. It's marked on your map.`, true);
  } else {
    toast(`🗺️ Tucked beneath the loot: a <b>map fragment</b> (${tm.frags}/${TM.FRAGS_NEEDED})… someone tore up a treasure map.`);
  }
}

export function openHoard(provCode) {
  const tm = state.tmap;
  if (!tm?.hoard) return;
  const c = { x: tm.hoard.x, y: tm.hoard.y, type: HOARD_TYPE };
  openConcealer(c, provCode, () => { tm.hoard = null; });
}
