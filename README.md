# 🍀 Luckland

A casual 2D open-world game of luck — a whole casino universe hidden inside a cozy,
DS-era-Pokémon-style adventure. Wander six themed provinces, race the tide (and the
other punters) to freshly spawned treasure, meet the locals, and play games of chance
everywhere: grand landmark halls, back alleys, and shores the sea only sometimes
reveals.

Runs as an installable **PWA** on both mobile (touch joystick) and desktop
(WASD/arrows), fully offline once cached. No build step, no dependencies —
plain ES modules + canvas.

## Play it

Any static file server works:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

or `npx serve`, or enable **GitHub Pages** on the repo (a deploy workflow for the
default branch is included in `.github/workflows/pages.yml`).

## Build it for your own host

There is no bundler — the game is plain ES modules — so a "build" just
assembles the runtime files into a clean folder, leaving out git, CI config
and dev scripts:

```bash
git clone https://github.com/ariFialkov/luckland.git
cd luckland
./scripts/build.sh
cd build
```

`build/` is the deployable root. Upload its **contents** to your host (any
static hosting works — S3, Netlify, nginx, a subfolder of an existing site).
Every path in the app is relative, so it runs from a domain root or any
subpath. The script also verifies that every file the service worker
pre-caches is present, so the PWA installs cleanly offline.

Two things your host must do for the PWA to work fully: serve over **HTTPS**
(or localhost), and serve `.js` files as `text/javascript` — most hosts do
both by default.

**Controls**

| | Desktop | Mobile |
|---|---|---|
| Move | WASD / arrow keys | left joystick |
| Interact | E / Space / Enter (or tap) | ✨ button / tap |
| Map | M | 🗺️ button |
| Stats & collection | P | 📜 button |

## The world

A 360×240-tile continent built from the hand-drawn atlas of Luckland: rugged
ranges (the Dragonspine, the Emerald Divide, the Thunder Steps, the Mist
Peaks) with narrow winding trails carved through the rock, jagged coastlines,
four rivers, Heaven Lake, and big styled cities full of ambient townsfolk.
Six provinces, each with landmark hubs housing its gambling culture, plus
roadside attractions and roaming characters:

| Province | Theme | Cities & landmarks | Signature game (in its hubs) |
|---|---|---|---|
| **Tyche & Fortuna (TF)** | Ancient Greece/Rome, northern capes | Tyche, Pontium (Panhellenium, Coliseum), Fortuna, Epineion, Oliveto, Argos Vale, Fort Upsilonia | Tali (knucklebones) |
| **Four Leaf Republic (FL)** | Celtic highlands, northwest | Ballyclover (Castle), Kilfenny, Dunmara, Bramblewick Farm, Puffin Point | Road bowls |
| **Horseshoeville (HV)** | Wild-West plains, southwest | Downtown Horseshoeville (Grand Saloon), Rapidstown, Vulture Gulch, Twin Spurs Ranch, Horseshoe Downs | High-noon standoffs |
| **Dragonia (DG)** | Dynastic China, mountainous south | Tiger City (Golden Tiger Hall), Kite City, Dragon's Bay, Lotus Ford, Jade Terraces, Flat Palace, Hidden/Shady Temple, Peekaboo Palace | Alley mahjong |
| **Elephantium (EP)** | SE-Asian jungle, mountainous east | Sawan City, Chao Lom, Temple City (Golden Temple), Mai Pai, Roaring Elephant Arena, Waterfall Park | Haiko (hi-lo) |
| **Maneki-Neko (MN)** | Neon-Japan archipelago, northeast | Downtown/North/East Maneki (Magic Mushroom Casino, Sumo Arena, Central Park), Koban Row, Neko Town | Pachinko |

**Landmark halls:** every landmark door leads inside, Pokémon style — a quick
fade to black, and you're standing in a walkable hall themed to the place.
Each hall's games are physical stations — walk into one to play — and the
doorway mat leads back out. The Panhellenium hosts a philosophers' debate in
its amphitheatre; Ballyclover Castle throws a permanent feast (nobles,
servants, jesters with games); the Shady Temple hides treasure, synchronized
tai chi and tea corners; EP's temples are zen gardens with meditating monks
and incense; the Magic Mushroom Casino is wall-to-wall slots, neon and smoke.

**Live arena betting:** three halls stage their events IN the scene. Place a
wager and the camera locks on while it plays out with in-world UI, and the
book pays on the result (every wager returns `RTP / p` — honest to the
configured RTP):

- **Roaring Elephant Arena** — the *Ringside Book*: health bars appear over
  both fighters, a round clock and pot panel over the ring, and the bout
  runs three rounds to a KO or a decision.
- **Horseshoe Downs** — *The Lucklian Stakes*: six species-coloured coursers
  with cowboy riders load the gates, the starter fires, and a live
  leaderboard ranks the field lap by lap, locking at the wire.
- **Coliseum of Pontium** — *The Editor's Book* covers whatever's on the
  rotating card: chariot races (leaderboard), gladiator bouts (health
  bars), *Survive the Vesperon* (a big-cat Lucklian hunts three gladiators
  under a survival clock), and the naumachia — the arena floods and 2–5
  crewed Roman galleys trade ballista fire until one fleet remains.

**Getting around:** shore shallows and small rivers are wadeable at reduced
speed; deep water is not. The **Paradise Ferry** (fare in `src/config.js`)
sails between Epineion Docks and Maneki Docks — it's the only way to the
Maneki-Neko isles.

**Tides** cycle every 5 minutes. Tidal flats, the Upsilonia causeway across
the Tychean Sea, the Neon Strait sandbar to Neko, the Lung Island causeway,
Rapids Ford on the Great River, and the cliff-sealed Hidden Cove are only
crossable at low tide — and the sea will sweep you ashore when it rises. The
rare **Tidewrought Locker** chests only spawn in tide-revealed places.

**Simulated multiplayer:** dozens of bot players roam the same map, race you to
freshly spawned chests (they *will* snatch them), celebrate wins, and fill the
global win feed — no backend, all local.

**Concealers:** chests, amphorae, gacha capsules, jade puzzle boxes and more spawn
continuously across the whole map. Each has an opening price and a rarity ladder
from *common* to *mythic*; opening ceremonies get flashier with rarity, and items
can carry add-ons (luck buffs, bonus coin, Tide Sight). Unique finds go in your
collection ledger.

## Lucklians

**176 native creatures** hide across the provinces, from 27%-common prairie
hoppers to the 0.01% Mugenrai. Walking through habitat — especially the
**tall grass and brush** tiles — can spring a hidden patch: a wild Lucklian
appears on (walkable types: grass, dust, dirt, sand, streets) or peering out
of (solid types: forest, jungle, rock, mountain, cliff, snow, water) terrain
matching its type, filtered to its native province. Encounters are
frequency-based per step, Pokémon-style, not tied to fixed spots.

Catching costs a **snare** — Copper (15) up to the Fatebinder Veil (4,000) —
and the odds are honest: every species has its own catch RTP (0.92–0.98 band,
tunable in `src/config.js` → `LUCKLIAN`), so a throw's expected return is
always `snare cost × species RTP`; rarer species are worth more and are
proportionally harder to hold. Failed throws risk the creature bolting.

### The Tile Atlas

A companion reference at **`/tileAtlas/`** shows all **35 terrain tiles** —
each one rendered from the game's real atlas at your choice of zoom, with
all four variant columns, its `T` row number and atlas Y offset, its
`16 × 16` size, whether it's walkable/solid/water/animated/tide-dependent,
and which Lucklian habitats it hosts (on it, or as a neighbour). Filter by
those flags, and export the **atlas PNG** (64 × 560, exactly what the game
builds), a **labelled contact sheet**, or a **JSON manifest** — the three
things you need to author a replacement texture pack.

### The Lucklian Index

A standalone reference page at **`/lucklianIndex/`** (linked from the
Lucklipedia) lists **every** species in one sortable, filterable table —
sprite, province, habitat *and the terrain it spawns on*, rarity tier,
pool weight, face value, per-species catch RTP, catch odds for all five
snares, traits (archetype, glow, migration-eligible, black-market pool,
which hunt themes it qualifies for) and its full field note. Search,
filter by province/habitat/rarity, sort by any stat, and export the
current view as **CSV or JSON**.

Nothing on that page is transcribed: it imports the game's own species
table and helpers at load, so editing `src/lucklians.js` — adding,
removing or retuning a creature — is reflected on the next refresh with
no separate upkeep. Even the terrain column is probed out of the real
`habitatTypes()` spawn rules rather than written down.

Captures live in the **Lucklipedia** (🧿 / L key): an encyclopedia of all 176
species — unknown, seen (silhouette), or caught — where creatures can be sold
at face value, capped at **8 open-market sales a day**. Wandering traders
periodically offer off-market deals at 0.62–1.38× face value that *don't*
count against the cap — which is exactly why a lowball is sometimes worth
taking.

### Gone Fishin'

**Fisherman's huts** stand on the sea coasts (two per province). Buy the rod
once (120 🪙, yours for keeps), then pay per cast for one of three baits —
Shrimp Scrap, Glowsquid Cut or the Golden Lugworm — where richer bait skews
the draw hard toward the rare, valuable Sea Lucklians of that coast. The odds
are honest end to end: hook chance = `bait cost × RTP / expected catch value`
(capped for suspense), and on coasts too poor to justify a fancy bait, the
balance comes back as **salvage** dredged up on missed strikes — pearl
oysters, drowned coin purses, sea amber — so every bait returns exactly the
configured RTP everywhere.

### The Grand Scavenger Hunt

**Striped sign-up tents** (one per province) run a race against seven named
rivals: a card of **four local Lucklians** — three everyday, one genuinely
hard — to catch in any order. When you catch a listed species you choose:
**contribute** it to your card (it forfeits its sale value for good) or keep
it to sell; already-owned listed species can be contributed straight from the
tracker. Your true stake is therefore the 200 🪙 entry *plus* the card's
total face value, and the podium ladder — a fat gold purse, slimmer silver
and bronze, nothing off the podium — is scaled so `E[prize] = stake × RTP`,
leaning long-odds/high-reward. A collapsible corner tracker shows your card,
the live leaderboard and an exit button; the rivals' pace is choreographed
around yours so the board always agrees with the honestly drawn result.

### The National Hunt

Above the local qualifiers, the **National Hunt Caravan** — a gilded painted
wagon — is parked in only **two main cities at a time**, rotating every 8
minutes (bump an empty booth and it tells you where the caravan is now). Its
card is serious: **six species spanning the continent**, sometimes drawn to a
**theme** (Sea Legs, Neon Nights, Snowbound, Birds of a Feather…), a 750 🪙
entry, eleven rivals and longer podium odds with a monster gold purse — same
honest ladder, same contribute-or-keep mechanic, same tracker.

### Geography games

- **Panner's Claim** (⛏️ FL/HV riverbanks) — pay for a scoop of gravel and
  swirl. **The tide decides what the river gives up**: low water bares a
  fresh bar with wilder swings (longer dry spells, fatter nuggets, the
  Mother Lode) at the identical RTP.
- **Lantern Festival** (🏮 EP/DG river docks) — the rivers light up for a
  ~2-minute launch window every few minutes. Your lantern joins seven
  villagers' **live on the actual river**: the camera rides with the glowing
  flotilla as it winds downstream, an in-world board tracks the running
  order, and a petal rope marks the finish. Placement is drawn honestly from
  a long-odds ladder scaled to the RTP.
- **Mount Colossus Expedition** (🏔️ base camp in the Dragonspine) — a
  staged ladder to the summit shrine. Every attempt draws its own weather
  (clear / high wind / blizzard) which reshapes every stage's odds, and you
  choose your style — alone for long odds or roped to a sherpa for steadier
  ones. Each stage pays `RTP / p`; cash out at any camp, and the summit
  itself grants the mountain's blessing (+3% RTP for 120s).
- **Night Markets** (🏮 MN/DG streets) — Luckland now has a **day/night
  cycle**: night genuinely *falls* — the world cools into blue via a
  multiply-darkened wash while **every building's windows light up warm**
  (a few stay dark; someone's asleep), lamplight spills from doorways,
  stone and paper lanterns throw halos, vending machines hum, market
  stalls and festival docks glow, and the neon districts shimmer with
  drifting sign-light. Then the shuttered stalls open. Each night
  rolls a fresh spread: three crates at posted honest odds (one a genuine
  98.5% "special"), a black-market Lucklian at a collector's markup — no
  questions asked, straight into your Lucklipedia — and one species in
  strange demand that sells above face value, off the books.
- **Below Decks** (🎲 the Paradise Ferry) — the ferry really sails: for the
  eight seconds of the crossing an actual boat carries you dock to dock
  across the strait while the den plays out below. No wager to place — the
  fare itself rides on the captain's bones, he calls it for you (Port,
  Starboard or Lucky Sevens) and the dice pay `RTP / p`, so a good crossing
  pays for itself.
- **The Homing Post** (🕊️ FL) — back one of five homers (Old Reliable,
  Wrong Way Wanda, Sky Potato…) and watch the whole flight as living dots
  arcing across the **real world map** to a far-off roost, trails, comeback
  drama and live standings included.
- **The Great Migration** (🦌 everywhere) — every so often a herd of one
  mid-rare species visibly crosses the continent. It announces itself with
  a gold toast, then holds a **pulsing HUD chip** for the whole crossing —
  species, time left on the move, and a compass bearing with the distance
  in tiles, which flips to *among them!* when you arrive. Tap the chip for
  the map, where the herd shows as a gold trail with a ring on the leader.
  Walk among the animals and encounters with that species come thick and
  fast — the snares stay honestly priced; the migration just brings the
  chances to you. Roughly a **3-minute crossing every ~9 minutes**.
- **The Grand Auction House** (🔨 rostrums in Tyche & Maneki) — in timed
  sessions, consign any Lucklian and let the room fight over it: Baron von
  Vole, Madame Époque and the Anonymous Telephone Bidder drive the price in
  a live bidding war. The hammer is drawn from a factor table scaled so the
  **average sale is exactly face value** — cold rooms, steals, and 3.6×
  frenzies included — and auction sales never touch the daily market cap.
- **The Grand Basho** (🤼 Grand Sumo Arena) — the arena is now a rolling
  **8-man tournament** on a real dohyō: quarters → semis → the final, bouts
  playing out whether you bet or not, with a momentum bar, named kimarite
  and a gyōji circling the ring. The book takes bout bets (camera-locked)
  and **Emperor's Cup outrights** priced by an exact fold of the remaining
  bracket — verified against Monte Carlo — settled when the Cup is lifted.
  A **ladder board** hangs on the hall wall for the whole basho: quarters →
  semis → final → the Cup, the fallen struck through, the pair on the clay
  ringed in green, and everyone you have money on ringed in gold.
- **Kite Duels** (🪁 Kite Pavilion, Kite City) — the pavilion opens onto a
  sky court where two named fighter kites (Paper Tiger, The Widow's Razor,
  The Tax Collector…) swoop on visible strings. Each duel draws its wind —
  calm, gusting, or typhoon's edge — which sets the odds on first cut,
  double cut and runaway; severed kites tumble or escape on the wind.
- **The Cascade Classic** (🤸 Waterfall Park Pavilion, EP) — the pavilion
  is now an **indoor oasis**: a diving cliff with a tall animated waterfall
  pouring into a plunge pool, a lazy-river loop around a tea island (with a
  footbridge the swimmers duck under), a second spring-fall, and judges at
  a poolside bench. Between meets the resident divers put in practice runs.
  Enter the **cliff-diving meet** at the diver's book: you and two residents,
  two dives each, priced at honest form odds up front. Every dive is acted
  out in the scene — the walk up the rock, the set at the ledge, named
  tricks (Monsoon Pike, The Falling Star, The Impossible Teardrop…) spun as
  real pixel somersaults down the fall, the splash, and **three judges
  raising score cards** — with a live scoreboard chalking the totals. The
  winner is drawn honestly first; the score-lines are built to match, and
  a winning ticket (on yourself or a resident) pays RTP / p.
- **The Bog of Middling Fortune** (🫧 FL) — a walkable, fog-bound bog.
  Strike the bargain at the keeper's stone and follow the wisp **on foot**,
  tuft by tuft: each step is an honest gate (firm ground multiplies the pot
  by `RTP / p`, the wrong tuft swallows the stake and dumps you ashore).
  Walk back to bank at any time; cross all nine tufts for ~48× and the
  wisp's blessing.
- **Tide-treasure maps** — chests occasionally cough up **map fragments**;
  three complete a map and a **Sunken Hoard** (the best chest odds in the
  game) appears on a named tide flat, marked ✖ on your map — but only the
  low tide will let you reach it.

### Live arenas, round two

- **The Grand Regatta** (🐉 Grand Regatta House, Dragon's Bay) — the
  boathouse opens onto real water where four **crewed dragon boats** idle at
  their moorings. Back a lane and the drum sounds: a live sprint down the
  bay with paddlers digging, comeback drama, a locking leaderboard and
  finish buoys.
- **The Neon Mic** (🎤 Neon Koi Karaoke, Downtown Maneki) — two named
  singers (Momo Volt, Neon Grandpa, Vending Machine Vinnie…) duel over
  three verses with **hype meters** instead of health bars, named flourishes
  (KEY CHANGE, WHISTLE NOTE, SPARKLE CANNON) and a six-prop book: winner,
  sing-along, encore, mic-drop, perfect streak.
- **The Owners' Gate** (🏇 Horseshoe Downs) — enter a Lucklian of **your
  own** in a live race. Its odds derive from its pedigree (face value), it
  runs in its own species colours, and it is **never at risk** — it earns
  purses without being sold.
- **The Bestiarius Gate** (🐆 Coliseum of Pontium) — pit your own beast
  against a house beast matched pound-for-pound. Two blown-up Lucklians
  circle and trade named moves (POUNCE, GORE, DEATH ROLL) with health bars
  on the sand; your beast walks away whatever happens.

## The Wardrobe (👕)

Purely cosmetic player customization — coins out, style back, RTP untouched
(clothing spend never counts into the wagered/won stats):

- **~60 pieces across five slots** — hat, top, bottom, shoes, accessory —
  in five rarities from thrift-rack Commons to Legendaries like the
  **Dragonspine Warhelm**, **Loftrunner's Winged Sandals** and the
  **House-Always-Wins Halo**. Everything is painted straight into the
  character sprite sheet (all four directions, both walk frames): robes,
  armor plates, sequins, masks that cover your face, capes that billow
  behind you, a balloon that bobs along, a bottled bog wisp on your hip.
- **Province lines**: laurels & togas (TF), knotwork & wellies (FL),
  ten-gallons & dusters (HV), changshans & jade slippers (DG), straw hats
  & khakis (EP), neon jackets, oni masks & geta (MN) — plus pieces that
  nod to the bog, the migration, the auction house, the basho and the
  lantern races.
- **The Threadbare Trunk** — a daily thrift shop inside the wardrobe
  screen (👕 button or `C`): six pieces re-drawn at every dawn, one always
  a **DEAL**. Every row shows a fitting-mirror preview of *you* wearing it.
- **Six wandering vendors**, one per province (Lucius Drip, Bramble Betty,
  Rag-and-Bone Rufus, Madame Xiu, Kesorn, Sable) — walk up and browse
  their rack: three staples plus one showpiece, restocked at dawn, only
  ever their province's gear or general stock.
- **The night-market rack** — after dark the market stalls hang one
  seeded wardrobe piece at 15% off.
- Purchases go straight on your back; the closet equips per-slot with an
  animated fitting mirror, and the whole outfit persists in your save.

## Tuning the economy (RTP)

Everything lives in **`src/config.js`**:

- `GAME_RTP` — base RTP per game (one line each).
- `AREA_RTP_MOD` — per-province multiplier applied to every game *and* chest
  opened in that province.
- `CONCEALER_TYPES` — chest prices, per-chest RTP, spawn biomes/weights.
- `RARITY_TIERS`, `ADDONS`, `BET_STEPS`, tide cycle length, bot counts, spawn
  caps, starting balance, world seed.

### Roadside attractions

Beyond the hub games, ~90 **attraction props** stand out in the world — each a
hand-drawn machine or shrine you walk into to play, spawned in its own habitat
(streets and plazas, riverbanks, treelines, mountain shrines, open country):

| Province | Attractions |
|---|---|
| **TF** | Wheel of Tyche (segmented marble wheel), Fortuna's Amphorae (sealed jars), Fates' Thread (woven, then cut) |
| **DG** | Dragon Pearl Drop (pearl down the board), Nine Dragon Gates (press on or cash out), Dragon's Hoard (urns before a sleeping dragon) |
| **HV** | Lucky Horseshoe Toss (ringers and leaners), The Golden Corral (miniature race), Prospector's Horseshoe (dig a mound) |
| **FL** | Clover Bloom (count the leaves), Faerie Ring (mushrooms light in turn), Luck of the Grove (four stone leaves) |
| **EP** | Spirit Lanterns (drift to a shrine), Naga River (branching currents), Banyan Blessing (shake the sacred tree) |
| **MN** | Neon Neko (the paw's colour), Lucky Cat Parade (gacha doors), Neko Coin Cascade (koban through the pins) |

These run on six mechanics beyond the originals — `wheel` (segment stop),
`plinko` (honest binomial drop with scaled pockets), `gates` (ladder with
cash-out), `path` (a journey to a prize tier), `pickchain` (picks that can chain
into free extra picks) and `reels` (N-of-a-kind matching).

All paytables, race odds and loot tables are **auto-normalized** at play time:
paytable, wheel and path games keep their clean multipliers and adjust the miss
probability to hit the configured RTP; pick/race/hi-lo/gates pay `RTP / p(win)`;
plinko scales its pocket multipliers against the drop's true binomial odds; reels
scale payouts against an exact enumeration of every combination; chained picks
solve for the recursion. Every game is verified to pay its configured RTP exactly. Change any number in
config and nothing else needs touching. Effective RTP (base × area × active luck
buffs, capped below 100%) is displayed in every game's header.

## Project layout

```
index.html, styles.css      app shell + UI styling
manifest.json, sw.js        PWA manifest + offline service worker
icons/                      generated icons (node scripts/gen-icons.mjs)
src/config.js               ← all economy/RTP tuning
src/world.js                seeded worldgen: provinces, landmarks, roads, tides
src/sprites.js              procedural pixel-art tiles & character sprites
src/games.js                wager engine (paytable/pick/race/hi-lo) + 18 games
src/concealers.js           chest spawning, loot rolls, opening ceremonies
src/lucklians.js            176 creatures: encounters, snares, Lucklipedia, traders
lucklianIndex/              standalone field-guide page (reads the live species table)
tileAtlas/                  standalone tile reference (reads the live tile painter)
src/interiors.js            walkable landmark halls: layouts, stations, patrons
src/liveevents.js           in-scene arena betting: fight/race/hunt/naval sims
src/hunts.js                the Grand Scavenger Hunt: cards, rivals, tracker
src/racing.js               shared race choreography: smooth, monotone drama
src/npcs.js                 named characters, dialogue, bot crowd
src/wardrobe.js             outfits: catalog, thrift shop, vendors, equip UI
src/ui.js                   HUD, modals, toasts, joystick, map/stats screens
src/state.js                wallet, stats, buffs, localStorage saves
src/main.js                 game loop, input, camera, rendering, interactions
```

Saves live in `localStorage` (auto-save every 5s); reset from the 📜 stats screen.
