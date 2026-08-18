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

**Controls**

| | Desktop | Mobile |
|---|---|---|
| Move | WASD / arrow keys | left joystick |
| Interact | E / Space / Enter (or tap) | ✨ button / tap |
| Map | M | 🗺️ button |
| Stats & collection | P | 📜 button |

## The world

Six provinces, each with a big landmark hub housing its gambling culture, plus
street games and roaming characters:

| Province | Theme | Landmarks | Street game |
|---|---|---|---|
| **Tyche & Fortuna (TF)** | Ancient Greece/Rome, north coast | Acropolis, Parthenon, Coliseum, Fort Upsilonia | Tali (knucklebones) |
| **Four Leaf Republic (FL)** | Celtic highlands, northwest | Edinburgh Castle | Road bowls |
| **Horshoeville (HV)** | Wild-West plains, southwest | Churchill Downs, The Grand Saloon | High-noon standoffs |
| **Dragonia (DG)** | Dynastic China, south | Great Palace, Hidden Tea House, Forbidden Valley | Alley mahjong |
| **Elephantium (EP)** | SE-Asian jungle, southeast | Golden Temple, Muay Thai Arena | Haiko (hi-lo) |
| **Maneki-Neko (MN)** | Neon-Japan archipelago, northeast | Magic Mushroom Casino, Sumo Arena, Neko Shrine | Pachinko |

**Tides** cycle every 5 minutes. Tidal flats, the Upsilonia causeway, the
Neko sandbar, the FL↔HV coastal passage and the Hidden Cove in Elephantium are
only crossable at low tide — and the sea will sweep you ashore when it rises.
The rare **Tidewrought Locker** chests only spawn in tide-revealed places.

**Simulated multiplayer:** dozens of bot players roam the same map, race you to
freshly spawned chests (they *will* snatch them), celebrate wins, and fill the
global win feed — no backend, all local.

**Concealers:** chests, amphorae, gacha capsules, jade puzzle boxes and more spawn
continuously across the whole map. Each has an opening price and a rarity ladder
from *common* to *mythic*; opening ceremonies get flashier with rarity, and items
can carry add-ons (luck buffs, bonus coin, Tide Sight). Unique finds go in your
collection ledger.

## Tuning the economy (RTP)

Everything lives in **`src/config.js`**:

- `GAME_RTP` — base RTP per game (one line each).
- `AREA_RTP_MOD` — per-province multiplier applied to every game *and* chest
  opened in that province.
- `CONCEALER_TYPES` — chest prices, per-chest RTP, spawn biomes/weights.
- `RARITY_TIERS`, `ADDONS`, `BET_STEPS`, tide cycle length, bot counts, spawn
  caps, starting balance, world seed.

All paytables, race odds and loot tables are **auto-normalized** at play time:
paytable games keep their clean multipliers and adjust the miss probability to hit
the configured RTP; pick/race/hi-lo games pay `RTP / p(win)`. Change any number in
config and nothing else needs touching. Effective RTP (base × area × active luck
buffs, capped below 100%) is displayed in every game's header.

## Project layout

```
index.html, styles.css      app shell + UI styling
manifest.webmanifest, sw.js PWA manifest + offline service worker
icons/                      generated icons (node scripts/gen-icons.mjs)
src/config.js               ← all economy/RTP tuning
src/world.js                seeded worldgen: provinces, landmarks, roads, tides
src/sprites.js              procedural pixel-art tiles & character sprites
src/games.js                wager engine (paytable/pick/race/hi-lo) + 18 games
src/concealers.js           chest spawning, loot rolls, opening ceremonies
src/npcs.js                 named characters, dialogue, bot crowd
src/ui.js                   HUD, modals, toasts, joystick, map/stats screens
src/state.js                wallet, stats, buffs, localStorage saves
src/main.js                 game loop, input, camera, rendering, interactions
```

Saves live in `localStorage` (auto-save every 5s); reset from the 📜 stats screen.
