/* ============================================================
   Luckland — the wardrobe.
   ------------------------------------------------------------
   Purely cosmetic player customization: outfits split across
   five slots (hat / top / bottom / shoes / accessory), rising
   in rarity from thrift-rack commons to one-of-a-kind
   legendaries. Sold by wandering vendor NPCs in the big towns,
   off a rack at the night markets, and from the Threadbare
   Trunk — the daily thrift shop inside the wardrobe screen
   itself. Stock everywhere rotates at dawn. No RTP maths here:
   coins go out, style comes back.
   ============================================================ */

import { CONFIG } from './config.js';
import { mulberry32, hash2 } from './rng.js';
import { makeCharSprite } from './sprites.js';
import { state, spend } from './state.js';
import { showModal, escapeHtml, toast, renderBalance } from './ui.js';

const fmt = (n) => Math.round(n).toLocaleString('en-US');

/* ------------------------------------------------------------
   Rarity ladder
   ------------------------------------------------------------ */
export const RARITY = {
  common: { name: 'Common', color: '#c8ccc4', ink: '#5a6058', w: 5 },
  uncommon: { name: 'Uncommon', color: '#6fcf7a', ink: '#1f6a2f', w: 3 },
  rare: { name: 'Rare', color: '#5eaaff', ink: '#1f4a8a', w: 1.6 },
  epic: { name: 'Epic', color: '#c07fff', ink: '#6a2a9a', w: 0.55 },
  legendary: { name: 'Legendary', color: '#ffd75e', ink: '#8a5a06', w: 0.12 },
};

export const SLOTS = [
  { id: 'hat', name: 'Hat', ico: '🎩' },
  { id: 'top', name: 'Top', ico: '👕' },
  { id: 'bottom', name: 'Bottom', ico: '👖' },
  { id: 'shoes', name: 'Shoes', ico: '👢' },
  { id: 'acc', name: 'Accessory', ico: '🧣' },
];

/* ------------------------------------------------------------
   The catalog. `p` is merged into the character palette;
   `prov` ties an item to a province's vendors and night racks.
   ------------------------------------------------------------ */
export const WARDROBE = [
  /* ---- hats ---- */
  { id: 'cap_traveler', slot: 'hat', name: "Traveler's Cap", ico: '🧢', rarity: 'common', price: 0, prov: null, def: true, p: { hat: 'cap', hatColor: '#c04848' }, desc: 'The cap you arrived in. It has seen some jackpots.' },
  { id: 'straw_paddy', slot: 'hat', name: 'Paddler’s Straw Hat', ico: '👒', rarity: 'common', price: 180, prov: 'EP', p: { hat: 'straw', hatColor: '#d8b860' }, desc: 'Woven on the Sawan riverbank. Smells faintly of victory and reeds.' },
  { id: 'cap_clover', slot: 'hat', name: 'Bramble Flat Cap', ico: '🧢', rarity: 'common', price: 220, prov: 'FL', p: { hat: 'cap', hatColor: '#1f7a2f' }, desc: 'Standard issue for anyone arguing about road bowls in Ballyclover.' },
  { id: 'bandana_dust', slot: 'hat', name: 'Dust-Trail Bandana', ico: '🟥', rarity: 'common', price: 200, prov: 'HV', p: { hat: 'bandana', hatColor: '#c04848' }, desc: 'Keeps the gulch out of your hair and the hair out of your poker face.' },
  { id: 'cowboy_ten', slot: 'hat', name: 'Ten-Gallon Hat', ico: '🤠', rarity: 'uncommon', price: 550, prov: 'HV', p: { hat: 'cowboy', hatColor: '#8a5a2a' }, desc: 'Holds closer to two gallons. Horseshoeville rounds up.' },
  { id: 'laurel_tyche', slot: 'hat', name: 'Laurels of Tyche', ico: '🌿', rarity: 'uncommon', price: 700, prov: 'TF', p: { hat: 'laurel', hatColor: '#2f7a3a' }, desc: 'Awarded to chariot champions and people who tip the augur generously.' },
  { id: 'conical_jade', slot: 'hat', name: 'Jade Field Hat', ico: '🎋', rarity: 'uncommon', price: 600, prov: 'DG', p: { hat: 'conical', hatColor: '#3f8a5a' }, desc: 'Shade for the terraces, luck for the sic bo table.' },
  { id: 'miner_lamp', slot: 'hat', name: 'Prospector’s Lamp Helm', ico: '⛑️', rarity: 'uncommon', price: 650, prov: 'HV', p: { hat: 'miner', hatColor: '#b8862a' }, desc: 'The lamp has watched a thousand pans come up empty. It stays lit anyway.' },
  { id: 'flowercrown', slot: 'hat', name: 'Beltane Flower Crown', ico: '🌸', rarity: 'uncommon', price: 600, prov: 'FL', p: { hat: 'flowercrown', hatColor: '#ff6be0' }, desc: 'Woven at Kilfenny fair. The bees consider you an ally now.' },
  { id: 'wizard_star', slot: 'hat', name: 'Stargazer’s Point', ico: '🌟', rarity: 'rare', price: 1800, prov: null, p: { hat: 'wizard', hatColor: '#5a3a8a' }, desc: 'The star on the brim points at whichever table is running hot. Allegedly.' },
  { id: 'tophat_auction', slot: 'hat', name: 'Auctioneer’s Topper', ico: '🎩', rarity: 'rare', price: 2200, prov: 'TF', p: { hat: 'tophat', hatColor: '#26202c' }, desc: 'Once tipped by Baron von Vole. Going once, going twice, gone on you.' },
  { id: 'foxmask', slot: 'hat', name: 'Kitsune Festival Mask', ico: '🦊', rarity: 'rare', price: 2400, prov: 'MN', p: { hat: 'foxmask', hatColor: '#f4f0e6' }, desc: 'Worn at lantern nights. The fox knows which lantern wins. The fox tells no one.' },
  { id: 'jester_bells', slot: 'hat', name: 'Fool’s Bells', ico: '🃏', rarity: 'rare', price: 2000, prov: null, p: { hat: 'jester', hatColor: '#c8402e' }, desc: 'The only headwear honest about the odds.' },
  { id: 'helm_bestiarius', slot: 'hat', name: 'Coliseum Crest Helm', ico: '🛡️', rarity: 'epic', price: 5200, prov: 'TF', p: { hat: 'helmet', hatColor: '#b8862a' }, desc: 'Pontium plate, gladiator-fitted. The crowd remembers this silhouette.' },
  { id: 'oni_alley', slot: 'hat', name: 'Oni of the Neon Alley', ico: '👹', rarity: 'epic', price: 6000, prov: 'MN', p: { hat: 'oni', hatColor: '#c8402e' }, desc: 'Karaoke bouncers wave you straight through. Everyone else crosses the street.' },
  { id: 'antler_crown', slot: 'hat', name: 'Migration Antler Crown', ico: '🦌', rarity: 'epic', price: 5600, prov: null, p: { hat: 'antlers', hatColor: '#8a6a3a' }, desc: 'Shed by a herd leader mid-crossing. The herds nod as they pass you now.' },
  { id: 'dragonhelm', slot: 'hat', name: 'Dragonspine Warhelm', ico: '🐉', rarity: 'legendary', price: 22000, prov: 'DG', p: { hat: 'dragonhelm', hatColor: '#2f8a4a' }, desc: 'Scaled like the eastern peaks. Yong Xin squints at it and says nothing.' },
  { id: 'crown_two', slot: 'hat', name: 'Crown of Two Blessings', ico: '👑', rarity: 'legendary', price: 28000, prov: 'TF', p: { hat: 'crown' }, desc: 'Loved best by Tyche AND Fortuna. Exhausting, honestly.' },

  /* ---- tops ---- */
  { id: 'tunic_traveler', slot: 'top', name: "Traveler's Tunic", ico: '👕', rarity: 'common', price: 0, prov: null, def: true, p: { body: '#e0a92e' }, desc: 'Gold thread — well, gold-ish. Well, yellow.' },
  { id: 'smock_hookline', slot: 'top', name: 'Hookline Smock', ico: '🎣', rarity: 'common', price: 200, prov: null, p: { body: '#3a7a8a', topStyle: 'stripe', trim: '#e8e2d4' }, desc: 'Salt-stained standard of the coastal hut crowd.' },
  { id: 'plaid_ranch', slot: 'top', name: 'Ranch Plaid', ico: '🟫', rarity: 'common', price: 240, prov: 'HV', p: { body: '#a04030', topStyle: 'stripe', trim: '#e0a92e' }, desc: 'One stripe for every fence you have leaned on meaningfully.' },
  { id: 'jerkin_knot', slot: 'top', name: 'Knotwork Jerkin', ico: '🍀', rarity: 'uncommon', price: 620, prov: 'FL', p: { body: '#2f7a3a', topStyle: 'vest', trim: '#ffd75e' }, desc: 'The knot has no beginning and no end, like a Ballyclover raffle.' },
  { id: 'toga_senator', slot: 'top', name: 'Senator’s Toga', ico: '🏛️', rarity: 'uncommon', price: 750, prov: 'TF', p: { body: '#f0ece0', topStyle: 'robe', trim: '#ffd75e' }, desc: 'Drapes beautifully over a winning streak.' },
  { id: 'duster_road', slot: 'top', name: 'Long-Road Duster', ico: '🧥', rarity: 'uncommon', price: 680, prov: 'HV', p: { body: '#6a4a2a', topStyle: 'robe', trim: '#3a2c1a' }, desc: 'Flaps dramatically at saloon doors whether or not there is wind.' },
  { id: 'khaki_expedition', slot: 'top', name: 'Expedition Khakis', ico: '🎒', rarity: 'uncommon', price: 640, prov: 'EP', p: { body: '#b8a878', topStyle: 'vest', trim: '#7a6a4a' }, desc: 'Four pockets. All full of trail mix and losing tickets.' },
  { id: 'changshan_gold', slot: 'top', name: 'Golden-Stitch Changshan', ico: '🧧', rarity: 'rare', price: 2000, prov: 'DG', p: { body: '#a02020', topStyle: 'robe', trim: '#ffd75e' }, desc: 'Tiger City tailoring. The stitching alone is worth the stake.' },
  { id: 'jacket_neon', slot: 'top', name: 'Neon Rider Jacket', ico: '🌃', rarity: 'rare', price: 2400, prov: 'MN', p: { body: '#26202c', topStyle: 'stripe', trim: '#5eeaff' }, desc: 'The stripe glows under Maneki’s signs. So does your pachinko average, briefly.' },
  { id: 'blazer_karaoke', slot: 'top', name: 'Karaoke Nights Blazer', ico: '🎤', rarity: 'rare', price: 2600, prov: 'MN', p: { body: '#8a2be2', topStyle: 'sequin', trim: '#ffe066' }, desc: 'Catches the spotlight. The spotlight has stopped resisting.' },
  { id: 'plate_bestiarius', slot: 'top', name: 'Bestiarius Plate', ico: '⚔️', rarity: 'epic', price: 5800, prov: 'TF', p: { body: '#8a8a96', topStyle: 'armor', trim: '#ffd75e' }, desc: 'Dented exactly where you would expect. Polished everywhere else.' },
  { id: 'mawashi_yokozuna', slot: 'top', name: 'Yokozuna’s Mawashi', ico: '🤼', rarity: 'epic', price: 6400, prov: 'MN', p: { topStyle: 'mawashi', body: '#8a2030' }, desc: 'Retired from the Grand Basho. Commits you to a certain confidence.' },
  { id: 'robe_warden', slot: 'top', name: 'Robe of the Dragon Warden', ico: '🐲', rarity: 'legendary', price: 26000, prov: 'DG', p: { body: '#1f6a3a', topStyle: 'robe', trim: '#ffd75e' }, desc: 'Cut from silk Yong Xin slept on for a century. Warm in every weather.' },

  /* ---- bottoms ---- */
  { id: 'trousers_traveler', slot: 'bottom', name: "Traveler's Trousers", ico: '👖', rarity: 'common', price: 0, prov: null, def: true, p: { legs: '#40354a' }, desc: 'Every pocket has held a winning ticket at least once.' },
  { id: 'dungarees_deck', slot: 'bottom', name: 'Deckhand Dungarees', ico: '⚓', rarity: 'common', price: 180, prov: null, p: { legs: '#3a5a8a' }, desc: 'Ferry-proof, regatta-splashed, den-approved.' },
  { id: 'wraps_canopy', slot: 'bottom', name: 'Canopy Wraps', ico: '🌿', rarity: 'common', price: 190, prov: 'EP', p: { legs: '#5a7a3a' }, desc: 'Breathable enough for a jungle sprint you will never need to make.' },
  { id: 'trews_tartan', slot: 'bottom', name: 'Tartan Trews', ico: '🏴', rarity: 'uncommon', price: 520, prov: 'FL', p: { legs: '#7a3040' }, desc: 'The pattern of clan Middling-Fortune. Wear it proudly, wager it never.' },
  { id: 'chaps_drover', slot: 'bottom', name: 'Drover’s Chaps', ico: '🐎', rarity: 'uncommon', price: 560, prov: 'HV', p: { legs: '#6a4a2a' }, desc: 'Broke in three saddles and one losing streak.' },
  { id: 'hakama_storm', slot: 'bottom', name: 'Stormcloth Hakama', ico: '🌩️', rarity: 'rare', price: 1900, prov: 'MN', p: { legs: '#2a2a3a' }, desc: 'Pleated like rain on neon. Moves a half-beat before you do.' },
  { id: 'greaves_colossus', slot: 'bottom', name: 'Colossus Greaves', ico: '⛰️', rarity: 'epic', price: 5200, prov: 'TF', p: { legs: '#8a8a96' }, desc: 'Forged for the summit expedition. The mountain remains unimpressed.' },
  { id: 'leggings_goldthread', slot: 'bottom', name: 'Gold-Thread Leggings', ico: '✨', rarity: 'legendary', price: 18000, prov: null, p: { legs: '#c8a018' }, desc: 'Actual gold thread this time. Walk gently near magpies.' },

  /* ---- shoes ---- */
  { id: 'boots_traveler', slot: 'shoes', name: "Traveler's Boots", ico: '👢', rarity: 'common', price: 0, prov: null, def: true, p: {}, desc: 'Have walked every province and regretted none of them.' },
  { id: 'sandals_dock', slot: 'shoes', name: 'Dockside Sandals', ico: '🩴', rarity: 'common', price: 150, prov: null, p: { shoe: 'sandal', boots: '#8a5a2a' }, desc: 'Optimal footwear for losing gracefully at Ship’s Bones.' },
  { id: 'wellies_bog', slot: 'shoes', name: 'Bog-Standard Wellies', ico: '🥾', rarity: 'uncommon', price: 480, prov: 'FL', p: { boots: '#2f7a3a' }, desc: '“Mind your boots,” said the wisp. You minded. Here they are.' },
  { id: 'ropers_spurred', slot: 'shoes', name: 'Spurred Ropers', ico: '🤠', rarity: 'uncommon', price: 540, prov: 'HV', p: { boots: '#5a3a1e' }, desc: 'Jingle at exactly saloon-door volume.' },
  { id: 'cleats_colossus', slot: 'shoes', name: 'Colossus Cleats', ico: '🧗', rarity: 'uncommon', price: 500, prov: 'TF', p: { boots: '#8a8a96' }, desc: 'Grip rated for switchbacks, scree, and long walks back from stage two.' },
  { id: 'geta_festival', slot: 'shoes', name: 'Festival Geta', ico: '🎐', rarity: 'rare', price: 1600, prov: 'MN', p: { shoe: 'geta', boots: '#b8862a' }, desc: 'Clack pleasingly on the karaoke hall floor. Two extra centimetres of destiny.' },
  { id: 'slippers_jade', slot: 'shoes', name: 'Jade Court Slippers', ico: '💚', rarity: 'rare', price: 1700, prov: 'DG', p: { boots: '#3f8a5a' }, desc: 'Silent on temple stone. The Nine Gates never hear you coming.' },
  { id: 'sandals_winged', slot: 'shoes', name: 'Loftrunner’s Winged Sandals', ico: '🕊️', rarity: 'legendary', price: 20000, prov: 'TF', p: { shoe: 'winged', boots: '#ffd75e' }, desc: 'Do not actually fly. The little wings simply believe in you.' },

  /* ---- accessories ---- */
  { id: 'scarf_lucky', slot: 'acc', name: 'Lucky Red Scarf', ico: '🧣', rarity: 'common', price: 200, prov: null, p: { acc: 'scarf', accColor: '#c8402e' }, desc: 'Statistically neutral. Emotionally decisive.' },
  { id: 'charm_clover', slot: 'acc', name: 'Four-Leaf Charm', ico: '🍀', rarity: 'common', price: 250, prov: 'FL', p: { acc: 'clover', accColor: '#2f9a3f' }, desc: 'Seamus swears it works. Seamus swears a lot of things.' },
  { id: 'pendant_tideglass', slot: 'acc', name: 'Tide-Glass Pendant', ico: '🔮', rarity: 'common', price: 260, prov: null, p: { acc: 'pendant', accColor: '#5eeaff' }, desc: 'A bead of sea glass that always faces the tide. Or a wall. One of those.' },
  { id: 'balloon_fair', slot: 'acc', name: 'Festival Balloon', ico: '🎈', rarity: 'uncommon', price: 500, prov: null, p: { acc: 'balloon', accColor: '#ff6be0' }, desc: 'Follows you loyally. Ask nothing of it and it will never let you down.' },
  { id: 'shades_boardwalk', slot: 'acc', name: 'Boardwalk Shades', ico: '🕶️', rarity: 'uncommon', price: 560, prov: 'MN', p: { acc: 'shades', accColor: '#26202c' }, desc: 'Nobody can see you count cards. Nobody can see you cannot count cards.' },
  { id: 'umbrella_oilpaper', slot: 'acc', name: 'Oil-Paper Umbrella', ico: '☂️', rarity: 'rare', price: 1800, prov: 'DG', p: { acc: 'umbrella', accColor: '#c8402e' }, desc: 'Painted with the Dragon’s Bay regatta. Rain slides off; drama does not.' },
  { id: 'monocle_baron', slot: 'acc', name: 'Baron’s Monocle', ico: '🧐', rarity: 'rare', price: 2200, prov: 'TF', p: { acc: 'monocle', accColor: '#ffd75e' }, desc: 'Baron von Vole’s spare. Everything you appraise now looks slightly overpriced.' },
  { id: 'cape_bestiarius', slot: 'acc', name: 'Bestiarius Cape', ico: '🦸', rarity: 'rare', price: 2400, prov: 'TF', p: { acc: 'cape', accColor: '#a02020' }, desc: 'Billows on the walk to the table. Wins nothing. Worth everything.' },
  { id: 'lantern_riverkeeper', slot: 'acc', name: 'Riverkeeper’s Lantern', ico: '🏮', rarity: 'rare', price: 2000, prov: 'MN', p: { acc: 'lantern', accColor: '#c8402e' }, desc: 'Retired from three river races. Still leans downstream when you hold it.' },
  { id: 'wisp_bottled', slot: 'acc', name: 'Bottled Bog Wisp', ico: '🫧', rarity: 'epic', price: 7000, prov: 'FL', p: { acc: 'wisp', accColor: '#7fe8c8' }, desc: 'It agreed to the bottle. Read the fine print of that sentence twice.' },
  { id: 'wings_homing', slot: 'acc', name: 'Homing Wings', ico: '🕊️', rarity: 'epic', price: 7500, prov: null, p: { acc: 'wings', accColor: '#f0ece6' }, desc: 'Moulted by a champion homing Lucklian. You now always know where home is: the tables.' },
  { id: 'halo_house', slot: 'acc', name: 'The House-Always-Wins Halo', ico: '😇', rarity: 'legendary', price: 30000, prov: null, p: { acc: 'halo', accColor: '#ffe066' }, desc: 'Bought, not earned. Which is, if you think about it, the whole point of this place.' },
];

const BY_ID = new Map(WARDROBE.map((i) => [i.id, i]));
export const itemById = (id) => BY_ID.get(id) || null;

/* ------------------------------------------------------------
   Player state: owned + equipped, sanitized against the catalog
   ------------------------------------------------------------ */
const DEFAULT_EQ = { hat: 'cap_traveler', top: 'tunic_traveler', bottom: 'trousers_traveler', shoes: 'boots_traveler', acc: null };

export function ensureWardrobe() {
  // sanitize once per loaded save, then keep handing back the same object
  // so open modals and the equip UI all mutate live state
  if (state.wardrobe && state.wardrobe.__ok) return state.wardrobe;
  const w = state.wardrobe;
  const clean = { owned: [], eq: { ...DEFAULT_EQ } };
  if (w && Array.isArray(w.owned)) clean.owned = w.owned.filter((id) => BY_ID.has(id));
  for (const it of WARDROBE) if (it.def && !clean.owned.includes(it.id)) clean.owned.push(it.id);
  if (w && w.eq) {
    for (const s of SLOTS) {
      const id = w.eq[s.id];
      if (id === null && s.id === 'acc') clean.eq.acc = null;
      else if (id && BY_ID.has(id) && BY_ID.get(id).slot === s.id && clean.owned.includes(id)) clean.eq[s.id] = id;
    }
  }
  Object.defineProperty(clean, '__ok', { value: true, enumerable: false });
  state.wardrobe = clean;
  return clean;
}

/* base identity + every equipped item folded into one palette */
export function composeLook() {
  const w = ensureWardrobe();
  const pal = { skin: '#f0c8a0', hair: '#4a3222', body: '#e0a92e', legs: '#40354a' };
  for (const s of SLOTS) {
    const it = w.eq[s.id] ? BY_ID.get(w.eq[s.id]) : null;
    if (it) Object.assign(pal, it.p);
  }
  return pal;
}

let playerRef = null;
export function initWardrobe(player) {
  playerRef = player;
  applyLook();
}
export function applyLook() {
  if (playerRef) playerRef.sprite = makeCharSprite(composeLook(), 6);
}

function ownItem(item) {
  const w = ensureWardrobe();
  if (!w.owned.includes(item.id)) w.owned.push(item.id);
  w.eq[item.slot] = item.id;         // fresh clothes go straight on
  applyLook();
}

export function buyItem(item, price) {
  if (!spend(price)) { toast('Not enough coins for that.'); return false; }
  state.stats.wagered -= price;   // clothes are spent, not wagered — keep the gambling stats honest
  ownItem(item);
  renderBalance();
  const r = RARITY[item.rarity];
  toast(`${item.ico} <b>${escapeHtml(item.name)}</b> is yours — worn straight out of the shop. 👕 to change.`, r.w <= RARITY.rare.w);
  return true;
}

/* ------------------------------------------------------------
   Stock rotation — everything restocks at dawn
   ------------------------------------------------------------ */
export const dawnIdx = () => Math.floor(Date.now() / 1000 / CONFIG.NIGHT.CYCLE_S);
const untilDawn = () => CONFIG.NIGHT.CYCLE_S - ((Date.now() / 1000) % CONFIG.NIGHT.CYCLE_S);

function drawStock(pool, rng, n, weights) {
  const cands = pool.filter((i) => !i.def);
  const out = [];
  for (let k = 0; k < n && cands.length; k++) {
    let tw = 0;
    for (const c of cands) tw += weights[c.rarity] ?? RARITY[c.rarity].w;
    let r = rng() * tw;
    let picked = cands[cands.length - 1];
    for (const c of cands) { r -= weights[c.rarity] ?? RARITY[c.rarity].w; if (r <= 0) { picked = c; break; } }
    out.push(picked);
    cands.splice(cands.indexOf(picked), 1);
  }
  return out;
}

const BASE_W = { common: 5, uncommon: 3, rare: 1.6, epic: 0.55, legendary: 0.12 };

/* the Threadbare Trunk: 6 pieces from the whole catalog, one discounted */
export function thriftStock(day = dawnIdx()) {
  const rng = mulberry32((day * 7919 + 13) >>> 0);
  const items = drawStock(WARDROBE, rng, 6, BASE_W);
  const dealIdx = Math.floor(rng() * items.length);
  return items.map((item, i) => ({
    item,
    price: i === dealIdx ? Math.max(50, Math.round(item.price * 0.7 / 10) * 10) : item.price,
    deal: i === dealIdx,
  }));
}

/* a vendor's rack: 3 staples from their pool + one showpiece */
export function vendorStock(vend, day = dawnIdx()) {
  const rng = mulberry32((day * 104729 + vend.seed) >>> 0);
  const pool = WARDROBE.filter((i) => i.prov === vend.prov || i.prov === null);
  const staples = drawStock(pool.filter((i) => i.rarity === 'common' || i.rarity === 'uncommon'), rng, 3, BASE_W);
  const show = drawStock(pool.filter((i) => !staples.includes(i) && (i.rarity === 'rare' || i.rarity === 'epic' || i.rarity === 'legendary')),
    rng, 1, { rare: 3, epic: 1.2, legendary: 0.35 });
  return [...staples, ...show].map((item) => ({ item, price: item.price, deal: false }));
}

/* one wardrobe piece on the night-market rack, 15% off */
export function nightRackItem(nightIdx2, provCode) {
  const pool = WARDROBE.filter((i) => !i.def && (i.prov === provCode || i.prov === null));
  const item = pool[Math.floor(hash2(nightIdx2, provCode === 'MN' ? 5 : 9, 611) * pool.length) % pool.length];
  return { item, price: Math.max(50, Math.round(item.price * 0.85 / 10) * 10) };
}

/* ------------------------------------------------------------
   Vendor NPCs — wandering outfitters, one per province
   ------------------------------------------------------------ */
export const VENDOR_DEFS = [
  {
    id: 'v_lucius', vendor: true, name: 'Lucius Drip', title: 'Tailor of the Forum', prov: 'TF', seed: 11,
    portrait: '🪡', home: { x: 124, y: 51 }, radius: 8,
    pal: { skin: '#e8b888', body: '#f0ece0', legs: '#7a5a2a', hat: 'cap', hatColor: '#8a2be2' },
    lines: ['Togas are IN. Togas have been in for nine hundred years. Consistency, darling.', 'You cannot buy taste. You can, however, buy everything on this rack, which is close.'],
  },
  {
    id: 'v_betty', vendor: true, name: 'Bramble Betty', title: 'Hedgerow Haberdasher', prov: 'FL', seed: 23,
    portrait: '🧺', home: { x: 110, y: 121 }, radius: 9,
    pal: { skin: '#f0c8a0', body: '#7a3040', legs: '#2f4a2f', hat: 'ears', hatColor: '#7a5a3a', hair: '#c05020' },
    lines: ['Every stitch blessed by a druid, or at least sneezed on by one.', 'The wellies? Bog-tested. I lost three cousins finding that out. They walked home eventually.'],
  },
  {
    id: 'v_rufus', vendor: true, name: 'Rag-and-Bone Rufus', title: 'Dealer in Previously-Lucky Garments', prov: 'HV', seed: 37,
    portrait: '🛒', home: { x: 90, y: 164 }, radius: 10,
    pal: { skin: '#c08a58', body: '#6a4a2a', legs: '#40354a', hat: 'cowboy', hatColor: '#3a2c1a' },
    lines: ['Every hat here came off a winner. Don’t ask how it came off.', 'Previously lucky is still lucky, friend. Luck don’t wash out. That’s gravy.'],
  },
  {
    id: 'v_xiu', vendor: true, name: 'Madame Xiu', title: 'Silk Warden of Tiger City', prov: 'DG', seed: 41,
    portrait: '🧧', home: { x: 153, y: 183 }, radius: 8,
    pal: { skin: '#f0c8a0', body: '#a02020', legs: '#2a2a3a', hat: 'topknot', hair: '#1a1a22' },
    lines: ['This silk outlived three dynasties and one very careless emperor.', 'Wear red at the tables. The tables cannot tell if you are winning.'],
  },
  {
    id: 'v_kesorn', vendor: true, name: 'Kesorn', title: 'Canopy Outfitter', prov: 'EP', seed: 53,
    portrait: '🎒', home: { x: 278, y: 152 }, radius: 9,
    pal: { skin: '#c08a58', body: '#b8a878', legs: '#5a7a3a', hat: 'straw', hatColor: '#d8b860' },
    lines: ['Everything waterproof. The jungle checked personally.', 'The elephants pick the colours. Argue with an elephant, go on.'],
  },
  {
    id: 'v_sable', vendor: true, name: 'Sable', title: 'Neon District Stylist', prov: 'MN', seed: 67,
    portrait: '🕶️', home: { x: 290, y: 55 }, radius: 9,
    pal: { skin: '#f0c8a0', body: '#26202c', legs: '#2a2a3a', hat: 'cap', hatColor: '#5eeaff', hair: '#1a1a22' },
    lines: ['If the outfit doesn’t glow, why are you even out after dark?', 'I dressed the last three karaoke champions. And one regrettable runner-up.'],
  },
];

/* ------------------------------------------------------------
   Shared shop rendering
   ------------------------------------------------------------ */
function miniPreview(item) {
  // the current look, trying this item on — a little fitting mirror.
  // the slot is vacated first so a plain top doesn't inherit the cut
  // of whatever robe or armor is currently equipped.
  const w = ensureWardrobe();
  const bak = w.eq[item.slot];
  w.eq[item.slot] = null;
  const pal = composeLook();
  w.eq[item.slot] = bak;
  Object.assign(pal, item.p);
  const sheet = makeCharSprite(pal, 6);
  const cv = document.createElement('canvas');
  cv.width = 16 * 3; cv.height = sheet.cellH * 3;
  const c2 = cv.getContext('2d');
  c2.imageSmoothingEnabled = false;
  c2.drawImage(sheet, 0, 0, 16, sheet.cellH, 0, 0, 48, sheet.cellH * 3);
  cv.style.cssText = 'image-rendering:pixelated;width:32px;flex:none';
  return cv;
}

function shopRows(box, stock, onBought) {
  const w = ensureWardrobe();
  box.innerHTML = '';
  for (const entry of stock) {
    const { item, price, deal } = entry;
    const owned = w.owned.includes(item.id);
    const r = RARITY[item.rarity];
    const row = document.createElement('div');
    row.className = 'race-lane' + (owned ? '' : ' race-pick-btn');
    if (owned) row.style.opacity = '0.55';
    row.innerHTML = `
      <span style="flex:1;text-align:left;display:flex;align-items:center;gap:8px">
        <span class="wd-mini"></span>
        <span>${item.ico} <b>${escapeHtml(item.name)}</b>
          <span class="wd-tag" style="background:${r.color}22;color:${r.ink};border:1px solid ${r.color}">${r.name}</span>
          ${deal ? '<span class="wd-tag wd-deal">DEAL</span>' : ''}<br>
          <span style="font-size:10.5px;opacity:.78">${escapeHtml(item.desc)}</span></span>
      </span>
      <span class="odds">${owned ? 'owned' : `${fmt(price)} 🪙`}</span>`;
    row.querySelector('.wd-mini').appendChild(miniPreview(item));
    if (!owned) row.addEventListener('click', () => { if (buyItem(item, price)) onBought(); });
    box.appendChild(row);
  }
}

/* ------------------------------------------------------------
   The wardrobe screen: closet + the Threadbare Trunk
   ------------------------------------------------------------ */
export function openWardrobe() {
  const w = ensureWardrobe();
  let tab = 'closet';
  let spinT = null;
  const m = showModal(`
    <h2>👕 Wardrobe</h2>
    <div class="subtitle">Five slots, one you · new thrift stock at dawn</div>
    <div class="wd-tabs">
      <button class="btn secondary" id="wd-tab-closet">Closet</button>
      <button class="btn secondary" id="wd-tab-trunk">🧳 The Threadbare Trunk</button>
    </div>
    <div id="wd-body"></div>
  `, { onClose: () => { if (spinT) clearInterval(spinT); } });
  const body = m.querySelector('#wd-body');

  function renderCloset() {
    if (spinT) { clearInterval(spinT); spinT = null; }
    body.innerHTML = `
      <div class="wd-closet">
        <div class="wd-mirror"><canvas id="wd-preview" width="64" height="100"></canvas></div>
        <div class="wd-slots" id="wd-slots"></div>
      </div>`;
    const slotsBox = body.querySelector('#wd-slots');
    for (const s of SLOTS) {
      const rowWrap = document.createElement('div');
      const ownedHere = WARDROBE.filter((i) => i.slot === s.id && w.owned.includes(i.id));
      rowWrap.innerHTML = `<div class="wd-slot-name">${s.ico} ${s.name}</div><div class="wd-chips"></div>`;
      const chips = rowWrap.querySelector('.wd-chips');
      if (s.id === 'acc') {
        const none = document.createElement('button');
        none.className = 'wd-chip' + (w.eq.acc === null ? ' on' : '');
        none.textContent = '∅ none';
        none.addEventListener('click', () => { w.eq.acc = null; applyLook(); renderCloset(); });
        chips.appendChild(none);
      }
      for (const it of ownedHere) {
        const r = RARITY[it.rarity];
        const chip = document.createElement('button');
        chip.className = 'wd-chip' + (w.eq[s.id] === it.id ? ' on' : '');
        chip.innerHTML = `${it.ico} ${escapeHtml(it.name)}`;
        chip.style.borderColor = r.color;
        chip.title = it.desc;
        chip.addEventListener('click', () => { w.eq[s.id] = it.id; applyLook(); renderCloset(); });
        chips.appendChild(chip);
      }
      slotsBox.appendChild(rowWrap);
    }
    // the fitting mirror: the current look, turning on the spot
    const pv = body.querySelector('#wd-preview');
    const pctx = pv.getContext('2d');
    pctx.imageSmoothingEnabled = false;
    const sheet = makeCharSprite(composeLook(), 6);
    const order = [0, 2, 3, 1];
    let step = 0;
    const paint = () => {
      pctx.clearRect(0, 0, 64, 100);
      const dir = order[Math.floor(step / 2) % 4], f = step % 2;
      pctx.drawImage(sheet, dir * 16, f * sheet.cellH, 16, sheet.cellH, 0, 2, 64, sheet.cellH * 4);
      step++;
    };
    paint();
    spinT = setInterval(paint, 420);
  }

  function renderTrunk() {
    if (spinT) { clearInterval(spinT); spinT = null; }
    const secs = untilDawn();
    body.innerHTML = `
      <div class="subtitle" style="margin-top:2px">Madame Rework’s daily pull — restocks at dawn in <b>${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s</b> · one piece is always a deal</div>
      <div id="wd-trunk"></div>`;
    shopRows(body.querySelector('#wd-trunk'), thriftStock(), renderTrunk);
  }

  const setTab = (t) => {
    tab = t;
    m.querySelector('#wd-tab-closet').classList.toggle('on', t === 'closet');
    m.querySelector('#wd-tab-trunk').classList.toggle('on', t === 'trunk');
    (t === 'closet' ? renderCloset : renderTrunk)();
  };
  m.querySelector('#wd-tab-closet').addEventListener('click', () => setTab('closet'));
  m.querySelector('#wd-tab-trunk').addEventListener('click', () => setTab('trunk'));
  setTab(tab);
  void tab;
}

/* ------------------------------------------------------------
   A vendor's rack
   ------------------------------------------------------------ */
export function openVendorShop(npc) {
  const def = npc.def;
  const line = def.lines[Math.floor(Date.now() / 60000) % def.lines.length];
  const m = showModal(`
    <h2>${def.portrait} ${escapeHtml(def.name)}</h2>
    <div class="subtitle">${escapeHtml(def.title)} · restocks at dawn<br>“${escapeHtml(line)}”</div>
    <div id="wd-vend"></div>
  `);
  const rerender = () => shopRows(m.querySelector('#wd-vend'), vendorStock(def), rerender);
  rerender();
}
