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
src/npcs.js                 named characters, dialogue, bot crowd
src/ui.js                   HUD, modals, toasts, joystick, map/stats screens
src/state.js                wallet, stats, buffs, localStorage saves
src/main.js                 game loop, input, camera, rendering, interactions
```

Saves live in `localStorage` (auto-save every 5s); reset from the 📜 stats screen.
