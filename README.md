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

**157 native creatures** hide across the provinces, from 27%-common prairie
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

Captures live in the **Lucklipedia** (🧿 / L key): an encyclopedia of all 157
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
  villagers' on the current; furthest upriver takes the temple pot, with a
  long-odds podium ladder scaled to the RTP.
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
src/lucklians.js            157 creatures: encounters, snares, Lucklipedia, traders
src/interiors.js            walkable landmark halls: layouts, stations, patrons
src/liveevents.js           in-scene arena betting: fight/race/hunt/naval sims
src/hunts.js                the Grand Scavenger Hunt: cards, rivals, tracker
src/npcs.js                 named characters, dialogue, bot crowd
src/ui.js                   HUD, modals, toasts, joystick, map/stats screens
src/state.js                wallet, stats, buffs, localStorage saves
src/main.js                 game loop, input, camera, rendering, interactions
```

Saves live in `localStorage` (auto-save every 5s); reset from the 📜 stats screen.
