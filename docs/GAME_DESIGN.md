# Turf.io — Game Design Plan (v0.1, pre-build)

> Status: **v0.1 is built.** It covers phases 0–2 plus a first slice of World Conquest; see §13.
> Numbers are starting points we tune in playtests. Anything marked **❓ Decision** is still open.

---

## 1. What we're making

A territory-capture game in the paper.io 2 style: you leave your land, draw a trail, and close the loop to claim everything inside it. If someone crosses your trail before you get back, you die.

We keep that core loop and fix what players complain about most:

| Pain point in paper.io 2 | What Turf.io does instead |
|---|---|
| Too many ads, forced interstitials | **No forced ads.** No interstitials and no banners during play. The only ads are optional rewarded ones, capped per day (§8). |
| Maps feel small and cramped | **Big arenas by default**, several map sizes and shapes, and a camera that adapts to size (§4). |
| Cash and gems only buy cosmetics | **The store drives progression**: abilities, perks, upgrades, conquest buildings, and cosmetics, with no real-money purchases (§6, §7). |
| Countries-one-by-one campaign is linear and you only finish it once | **World Conquest**: a campaign map you keep having to defend, with bosses and biomes, plus a season-long **Faction War** fed by multiplayer (§5). |
| — | **Real multiplayer** with instant matchmaking. Empty slots are filled with bots, so you never wait (§9). |

### Design pillars
1. **Respect the player's time.** You're in a match within 5 seconds. No ad walls.
2. **Skill decides fights.** Progression adds options and variety. It never adds so much raw power that a new player can't win.
3. **Big, readable arenas.** Room to plan, room to escape, room for a comeback.
4. **Always something to work toward.** Every match pays into a meta-game (conquest, upgrades, season).
5. **Online or offline, it plays the same.** Bots make every mode playable anytime.

---

## 2. Core gameplay (the part we must nail first)

### 2.1 Rules
- The arena is a **grid of cells**. Each cell is either unowned or owned by one player.
- You move continuously and steer freely (joystick or swipe). Internally, movement runs on a sub-cell grid.
- Outside your territory you leave a **trail**. Get back to your own territory and the trail plus everything it encloses becomes yours.
- **You die if**:
  - another player touches your trail;
  - you touch your own trail;
  - you hit a head-on collision *outside* your territory (the smaller territory dies; equal size means both die).
- **You kill** by crossing someone's trail. Their territory becomes unowned, and in some modes part of it goes to you.
- Score = territory area. The HUD shows both **%** and **absolute cells**, because on big maps a percentage alone feels small.

### 2.2 Improvements over the original feel
- **Capture combos**: several captures in a row within a few seconds pay bonus coins. This rewards aggressive but safe play.
- **Kill feed and streaks**: "Double Takedown", "Revenge", "Shutdown" (you killed the leader).
- **Danger indicators**: the edge of the screen pulses when an enemy is heading for your trail and is close enough to reach it. This is a big quality-of-life win on large maps.
- **Minimap** that shows all territory, plus threats near you.
- **Comeback respawn** (casual modes only): after you die you can respawn right away with a small base, so you're never locked out of a long match.
- **Map pickups** (mode-dependent, off in Ranked): coin piles, ability charges, a temporary trail shield.

### 2.3 Feel targets (tune in the prototype)
- Base speed: ~10 cells/sec.
- Turning responsiveness: input to visible turn in < 100 ms locally.
- Time to cross a Standard map: ~40 s. Large: ~60 s. Huge: ~90 s.
- A typical first safe loop: 5–8 s.

---

## 3. Game modes

| Mode | Players | Map | Length | Upgrades? | Notes |
|---|---|---|---|---|---|
| **Classic** | 20–40 (bots fill) | Large | Endless, drop-in | Yes (capped) | Main online mode; comeback respawn on |
| **Timed Arena** | 12–24 | Standard / Large | 5 min rounds | Yes (capped) | Winner = most territory at the buzzer; gives a clean "match" to reward |
| **Teams** | 2–4 teams × 4–8 | Large / Huge | 7 min | Yes (capped) | Team territory merges; you can pass through teammates' trails |
| **Ranked** | 12–20 | Large | 5 min | **No — everything normalized** | Pure skill; season rank rewards |
| **World Conquest** | Solo vs bots | Varies per province | Per level | Yes | Campaign (§5.1) |
| **Expedition** | Solo vs bots | Random biome | Run of 5–7 matches | Draft perks per run | Roguelite (§5.3) |
| **Daily Challenge** | Solo vs bots | Fixed seed | 1 attempt/day | Fixed loadout | Global leaderboard; everyone plays the same seed |
| **Private Lobby** | Friends + bots | Any | Any | Host decides | Join by room code |

Launch set (MVP): **Classic, Timed Arena, World Conquest**. The others come in later phases (§11).

---

## 4. Maps: big, varied, readable

### 4.1 Sizes (starting points)
| Size | Grid | Target players | Used by |
|---|---|---|---|
| Standard | 400 × 400 | 12–20 | Timed Arena, early Conquest |
| Large | 650 × 650 | 20–35 | Classic, Ranked, Teams (default) |
| Huge | 1000 × 1000 | 35–50 | Teams, events |

**Density rule:** keep roughly the same *cells per player* in every size, so big maps feel spacious but not empty. The server adds or removes bots to hold this density.

### 4.2 Shapes and terrain
Not just a circle or a square:
- **Shapes**: circle, hexagon, ring (hole in the middle), twin islands joined by bridges, star.
- **Terrain features** (mostly in Conquest and Expedition, some in Classic rotations):
  - **Walls/mountains**: can't be crossed or captured. They create chokepoints.
  - **Ice**: you slide, with less turn control.
  - **Swamp/mud**: slower movement, but trails there are harder to see.
  - **Rivers**: fixed crossing points only.
  - **Gold zones**: cells that pay extra coins while you own them, which creates hotspots worth fighting over.

### 4.3 Making big maps work
- The **camera zooms out** a bit as your territory grows, and zooms in during close fights.
- **Minimap** plus danger indicators (§2.2).
- **Spawn protection**: new players spawn in the largest unowned pocket and get about 3 s of trail immunity.
- **Network interest management**: each client only receives full detail for the area near them (§9.4).

---

## 5. Campaign and meta: replacing "countries one by one"

The problem with "complete country 1, then country 2" is that once a country is done, it's dead content. We want a campaign that **stays alive** and **feeds the economy**.

### 5.1 World Conquest (solo, core campaign) — *recommended*
- A world map divided into **regions → provinces** (~8 regions × 8–12 provinces at launch). Regions can be themed after real continents or a fictional world (❓ Decision).
- Each province is a level with its own **biome, map shape, modifiers and bot personalities**. Example: "Frostpeak Pass: ice terrain, ring map, 3 aggressive hunters."
- **1–3 stars** per province: win, win at more than X% territory, and win without dying or under a time limit.
- Each region ends with a **Warlord boss**: a named bot with a special ability, such as a Warlord who leaves trail mines or one whose territory regrows.
- **What keeps it alive:**
  - **Counter-attacks**: rival warlords periodically try to retake provinces you own. You can defend (a short match) or let the province fall and win it back later. That's replayable content without us building new levels.
  - **Province buildings**: conquered provinces can hold buildings you buy with cash (§6.4). Buildings produce passive income or match bonuses, which gives the campaign an economic reason to keep going.
  - **Hard mode**: after you clear a region, it unlocks at higher difficulty with better rewards.

### 5.2 Faction War (multiplayer season meta)
- Each season (~6 weeks), every player joins one of **3–4 factions** (colors).
- There is **one shared global map**. Every online match (Classic, Timed, Teams) earns "war points" for your faction on the province currently being fought over.
- Every day the front moves: provinces flip based on faction points.
- End of season: faction rewards (gems, an exclusive faction skin) based on how the faction placed, plus personal contribution tiers.
- This gives multiplayer a purpose beyond one match and reuses the Conquest map UI.

### 5.3 Expedition (roguelite, later phase)
- A run of 5–7 matches across random biomes. After each win you **draft 1 of 3 perks** (for example "Trails you close within 3 s capture 10% more", "Kills refund your ability"). One death ends the run.
- Rewards grow with run depth. This is where the perk system shines, and it's very replayable.

**Recommendation:** ship **World Conquest** at launch. Add **Faction War** once multiplayer is stable. Add **Expedition** as the first big content update.

---

## 6. Progression: making cash and gems matter

### 6.1 Currencies
| Currency | Earned from | Spent on |
|---|---|---|
| **Coins (cash)** — common | Every match (territory, kills, combos, placement), gold zones, province buildings, daily missions | Upgrades, ability levels, perk unlocks, province buildings, common cosmetics |
| **Gems** — rare | Leveling up, achievements, 3-starring provinces, boss kills, season track, first win of the day, optional rewarded ads | Loadout slots, new abilities, Rare/Epic cosmetics, rerolls, Expedition continues, coin conversion |
| **Faction Tokens** — seasonal | Faction War participation | Seasonal faction shop |

**Players can never buy any currency with real money.**

### 6.2 What your loadout looks like
```
[ Skin ] [ Trail FX ]           ← cosmetic
[ Ability ]                     ← 1 active, on cooldown
[ Perk 1 ] [ Perk 2 ] [ Perk 3 ]← passive (slots 2 and 3 unlocked with gems)
[ Upgrades ]                    ← permanent stat levels
```

### 6.3 Abilities (one active slot, tap to use)
| Ability | Effect | Cooldown (lvl 1 → max) |
|---|---|---|
| **Dash** | Short speed burst (+60% for 1 s) | 20 s → 14 s |
| **Shield** | Your trail can't be cut for 2 s | 30 s → 22 s |
| **Radar** | Reveals every enemy trail on the minimap for 5 s | 25 s → 18 s |
| **Snap Back** | Your trail retracts straight back to your territory. You're safe, but you capture nothing | 35 s → 25 s |
| **Decoy** | Spawns a fake copy of you that walks in a straight line | 30 s → 20 s |
| **Trail Mine** | Drops a mine on your trail. Whoever cuts your trail there is stunned for 0.5 s | 40 s → 30 s |

You unlock abilities with gems and level them up with coins (5 levels). Levels only shorten the cooldown or slightly extend the duration.

### 6.4 Perks (passive)
- **Economy perks** (don't affect fights, so they're always allowed): +X% coins from captures, +X% combo bonus, magnet for coin pickups.
- **Play perks** (affect fights, capped): larger starting territory, 1 s of spawn protection, a slightly longer trail-danger warning, faster respawn in casual modes.

### 6.5 Upgrades (permanent)
Only a few, each capped at 10 levels, and **none of them increase base speed** (speed ruins the balance of trail games).
- Starting territory radius
- Ability cooldown
- Coin income
- Combo window length

### 6.6 Province buildings (Conquest cash sink)
| Building | Effect | Cost |
|---|---|---|
| Mint | Passive coins per hour (capped storage, collect when you log in) | Coins |
| Watchtower | That province's counter-attacks are weaker | Coins |
| Barracks | +1 ability charge at the start of Conquest matches in that region | Coins + gems |
| Monument | Cosmetic, shown to friends visiting your map | Gems |

### 6.7 Fairness guardrails (important)
Because upgrades affect play, and players *will* face each other online:
1. **Power budget**: a fully upgraded loadout should have a **≤ 5–8% higher win rate** than a fresh one in bot-vs-bot simulations. We run these sims in CI whenever balance numbers change.
2. **Matchmaking buckets** in casual online modes use hidden **skill rating + loadout power**.
3. **Ranked normalizes everything**: equal upgrades, a fixed ability pool, and cosmetics only.
4. **Diminishing returns** on every upgrade curve. Levels 8–10 are mostly for bragging rights.

---

## 7. The store (no IAP)

Tabs:
1. **Featured / Daily**: a rotating selection of cosmetics and discounted upgrades, refreshed every 24 h.
2. **Abilities & Perks**: unlock and level up.
3. **Upgrades**: permanent stat levels.
4. **Cosmetics**: skins, trail effects, territory patterns, death effects, name badges.
5. **Conquest**: province buildings.
6. **Chests**: *earned only* (from missions, bosses, the season track). They are never sold for money, and drop odds are **always shown**.
7. **Exchange**: gems → coins at a fixed rate (never the other way).

**Free season track** (a "battle pass" with no paid tier): about 50 tiers of XP rewards per season, mixing coins, gems, cosmetics and an exclusive skin at the end.

**Daily missions**: 3 per day, like "Capture 30% in one match", "Take down 5 players", "Use Dash 10 times". Rewards are coins plus a small amount of gems.

---

## 8. Ads and monetization policy

- ❌ **No interstitials.** Ever.
- ❌ **No banners** during gameplay.
- ✅ **Optional rewarded ads** only, and only when the player taps a button: double match rewards, a free chest key, a Conquest revive. **Cap of about 5 per day.**
- ✅ The game is fully playable and fully completable with **zero ads**.

❓ **Decision — how does the game make money?** Options:
  - (a) Optional rewarded ads only (above). The simplest and friendliest option.
  - (b) (a) plus a **one-time "Supporter" purchase** (for example ~$3.99) that removes rewarded-ad prompts, grants the rewards automatically, and adds a cosmetic badge. No currencies are sold, so it stays "no IAP store".
  - (c) Paid up front / premium.
  - My recommendation is **(b)**. It pays for servers without compromising any of the design rules above.

---

## 9. Multiplayer with bot backfill

### 9.1 Player experience
- Tap **Play** and you're in a match within **≤ 5 s**. Always.
- Matchmaking looks for a room in your region and skill bucket. If there aren't enough humans, the room is **filled with bots**.
- Offline or no connection: the same modes run locally against bots (Conquest, Expedition and Daily always work offline).

### 9.2 Matchmaking flow
```
Player taps Play
  └─► Matchmaker: find open room (region, mode, skill+power bucket)
        ├─ Found  → join. If the room is at capacity with bots,
        │           one bot "retires" (see 9.3) to free the slot.
        └─ None   → create room, wait up to 3 s for humans,
                    then start and fill remaining slots with bots.
Room keeps target density: bots are added/removed as humans come and go.
```
- **Classic** (endless) rooms: humans join at any time and take a bot's slot.
- **Timed/Ranked**: players join only in the lobby phase. Anyone who disconnects is replaced by a bot for the rest of the round.

### 9.3 Bot design
Bots need to feel human, make varied mistakes, and scale across skill levels.

- **Utility AI** that re-evaluates every ~200 ms and picks between:
  - **Expand**: plan a loop whose size depends on *greed* and how close threats are.
  - **Return**: head home when danger rises or the trail gets long.
  - **Hunt**: go after a nearby enemy trail that's reachable in time.
  - **Flee/Defend**: back off from threats, or cut off someone attacking your area.
- **Personality parameters**: aggression, greed (loop size), caution, reaction delay (150–450 ms), aim error, vision radius, and ability use.
- **Archetypes**: Farmer (safe, small loops), Hunter (chases trails), Gambler (huge loops), Turtle (defends), Opportunist.
- **Difficulty tiers** from Recruit to Warlord. In online rooms, bot difficulty matches the room's skill bucket.
- **Retiring gracefully**: when a human needs the slot, a bot waits until it's safely inside its own territory, then "leaves", and its territory decays over ~5 s. No bot vanishes mid-fight.
- Bots get realistic names and random loadouts that fit the room.

❓ **Decision — bot disclosure.** paper.io-style games often hide bots. Options: fully hidden, a subtle icon in the post-match scoreboard, or a "show bots" setting. I lean toward **a subtle post-match indicator**. It's honest and doesn't spoil the in-match feel.

### 9.4 Netcode and architecture
- **Server-authoritative**: clients send *inputs only* (steering direction with a sequence number). The server runs the simulation. This is our main anti-cheat.
- **Shared simulation package**: the *same* game logic runs on the server (online) and on the client (offline modes, plus prediction). We write one sim, not two.
- **Tick rate**: 20–30 Hz on the server. Clients render at 60 fps with interpolation.
- **Client prediction** for your own movement and trail, with server reconciliation. Other players are interpolated about 100 ms behind.
- **Territory sync**: captures are sent as compressed deltas (run-length-encoded row spans), not full grids. Late joiners get one full compressed snapshot.
- **Interest management**: full detail within your viewport plus a margin, and a coarse downsampled minimap about once a second for everything else.
- **Capture algorithm**: when a loop closes, flood-fill from outside the loop's bounding box. Unreached cells are enclosed. The cost is proportional to the bounding box, not the whole map, so big maps stay cheap.

---

## 10. Suggested tech stack

❓ **Decision — target platforms** (web first? mobile-first? both?). The stack below assumes **web first, then wrapped for iOS/Android**, which is the fastest way to reach both.

| Layer | Recommendation | Why |
|---|---|---|
| Language | **TypeScript** everywhere | One language, so client and server share the sim |
| Monorepo | pnpm workspaces | `packages/sim`, `packages/client`, `packages/server`, `packages/shared` |
| Rendering | **PixiJS** (WebGL) | Fast 2D, good for large tile grids with dynamic textures |
| Mobile wrap | Capacitor | Ships the web build as native iOS/Android apps |
| Game server | Node.js + **uWebSockets.js** (or Colyseus for built-in rooms/matchmaking) | Low-latency WebSockets; Colyseus saves matchmaking work |
| Serialization | Binary (custom packed or msgpack) | Bandwidth on big maps |
| Persistence | Postgres (accounts, progression, Faction War) + Redis (matchmaking, room registry) | Standard and scalable |
| Save data | Local-first with cloud sync | Offline play works; progress follows you |
| Testing | Vitest for the sim, plus a **headless bot-vs-bot simulator** for balance | Balance changes get validated automatically |

Proposed repo layout:
```
packages/
  sim/       # deterministic game rules, grid, capture, collisions, bot AI
  client/    # PixiJS renderer, input, UI, offline runner
  server/    # rooms, matchmaking, bot backfill, netcode
  shared/    # protocol types, config, balance tables
tools/
  balance-sim/  # runs thousands of bot matches, reports win rates by loadout
docs/
```

---

## 11. Build roadmap

| Phase | Goal | Deliverables | Exit criteria |
|---|---|---|---|
| **0 — Prototype** | Is the core fun? | Sim package, grid + capture, one Large map, keyboard/touch controls, 3 basic bots, offline only | Playtesters want "one more round" |
| **1 — Bots & feel** | Solo play feels great | Utility AI + archetypes + difficulty tiers, danger indicators, minimap, camera zoom, combos, map shapes | Bots are hard to tell from humans in blind tests |
| **2 — Progression v1** | Reasons to keep playing | Coins/gems, abilities (Dash, Shield, Radar), 2 perk slots, upgrades, store, save data, daily missions | Balance sim shows ≤ 8% power gap |
| **3 — Multiplayer** | Real online play | Server, matchmaking, bot backfill + graceful retire, prediction/interp, Classic + Timed Arena | 40-player room stable at < 150 ms, match within 5 s |
| **4 — World Conquest** | Campaign | World map, 2–3 regions, biomes/terrain, bosses, stars, province buildings, counter-attacks | First 2 regions fully playable |
| **5 — Launch polish** | Ship it | Mobile wrap, audio, onboarding, season track, rewarded ads (capped), analytics | Soft launch |
| **6 — Live** | Keep growing | Teams, Ranked, Faction War, Expedition, Daily Challenge, Private Lobbies | — |

---

## 12. Open questions (need your input)

1. **Platforms**: web, mobile, or both? (This decides the stack in §10.)
2. **Monetization**: rewarded ads only, or also a one-time Supporter purchase? (§8)
3. **Bot disclosure**: hidden, post-match indicator, or a setting? (§9.3)
4. **Conquest setting**: a real-world map (continents/countries as regions) or a fictional world?
5. **Art direction**: flat/clean like paper.io, or something more stylized (e.g., toy-like, neon, hand-drawn)?
6. **Upgrades online**: happy with "capped in casual, normalized in Ranked"? Or should *all* online play be normalized, with upgrades only in solo modes?
7. **Scope for v1**: agree with MVP = Classic + Timed Arena + World Conquest (2–3 regions)?

---

## 13. Build status (v0.1)

**Decided:** iOS first. It is built as a TypeScript + WebGL2 game wrapped natively with Capacitor (Swift Package Manager). There are no ads and no in-app purchases.

**Built**
- Core sim: free-angle steering, trails, flood-fill capture, trail cuts, self-hits, head-ons, wall sliding. Deterministic and DOM-free, so it can move to a server.
- Bots: utility AI (expand / return / hunt / flee) with per-bot personalities and Easy/Normal/Hard/Boss tiers. Slots refill automatically. The balance probe (`npm run balance`) shows most bot deaths come from real fights, not blunders.
- Visuals:
  - One full-screen shader rebuilds smooth, raised, patterned territory from the owner grid, using a B-spline super-sampling pre-pass.
  - 19 GPU patterns, 5 of them animated.
  - Capture ripple flashes, particle bursts, camera shake, squash and stretch, and pupils that follow your heading.
- **Characters change skin and territory pattern together** (21 characters across 4 rarities).
- Modes: Classic (340-cell map, 24 rivals), Arena (3 minutes, respawns), World Conquest (3 regions × 5 levels, boss finales, 3-star par times).
- Progression: coins, gems, XP levels, daily streak rewards, characters, 3 abilities, 4 capped upgrades.
- iOS: haptics, native save storage, safe areas, fullscreen, generated icon and splash, dynamic resolution scaling, GL context-loss recovery.

**Next up** (from the roadmap)
- Multiplayer server with bot backfill (§9). The sim is already shared-code ready.
- Province buildings and counter-attacks for Conquest (§5.1, §6.6), Teams, Ranked, Faction War, Expedition.
- Real-device performance pass on older iPhones, and audio polish.
