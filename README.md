# Turf.io

A territory-capture game in the spirit of paper.io 2, built for iOS. It has no ads, big arenas, and a store you can't pay into that sells real progression, not just cosmetics.

- **Pick a character and you pick your land.** Each of the 21 characters has its own body *and* its own animated territory pattern: polka dots, honeycomb, flames, a starfield, circuits, a flowing rainbow and more. The same pattern is painted on your blob, your trail and every inch you claim.
- **Crisp at any resolution.** The whole arena is drawn by GPU shaders from a tiny owner grid, with no bitmaps. Edges are smoothed and anti-aliased at the device's native pixel density, and captures ripple outward with a flash.
- **Big maps, full lobbies.** Classic uses a 340-cell arena with 24 rivals. Bots fill every lobby, with personalities (farmers, hunters, gamblers) and difficulty tiers.
- **Modes:** Classic (endless, one life), Arena (3-minute showdown with respawns) and Conquest (15 levels across 3 regions, each region ending in a boss).
- **Progression without IAP:** coins and gems unlock characters, abilities (Dash, Shield, Freeze) and capped upgrades. You also get levels, daily login rewards and stars.

See [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md) for the full design plan and roadmap.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 (mouse aims, WASD/arrows steer, Space = ability)
```

## Build for iOS

You need a Mac with Xcode 16+ and Node 20+. The iOS project lives in `ios/` and uses Capacitor 8 with Swift Package Manager, so there is no CocoaPods step.

```bash
npm install
npm run ios        # builds the web bundle, syncs it into ios/, opens Xcode
```

In Xcode, select the **App** target and go to **Signing & Capabilities**. Pick your team, change the bundle id if `io.turf.game` is taken, choose your iPhone and press Run.

- Minimum iOS: **15.0** (WebGL 2). Runs on iPhone and iPad, portrait or landscape, fullscreen with the status bar hidden.
- After code changes, `npm run ios:sync` rebuilds and copies the web bundle without reopening Xcode.
- Saves use native Preferences, so progress survives WebView storage purges. Haptics use the Taptic Engine.
- The app icon and splash are in `ios/App/App/Assets.xcassets`. They are generated from the game's own renderer (see `resources/`).

## Project layout

```
src/
  sim/        deterministic game rules: grid, movement, capture flood-fill, collisions, bot AI
  render/     WebGL2 renderer + all GLSL (territory, trails, characters, particles)
  content/    characters (skin + pattern), Conquest levels, bot names
  game/       match session (modes, events, camera, input)
  meta/       profile, economy, upgrades, rewards
  ui/         menus, shop, HUD, results (plain DOM + CSS)
  platform/   iOS bridges: haptics, storage, synthesized audio
tests/        simulation unit tests (npm test)
tools/        balance probe (npm run balance)
ios/          native Xcode project (Capacitor)
```

The simulation in `src/sim` has no DOM dependencies, so the same code can run on a multiplayer server later (design doc §9).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check and production build to `dist/` |
| `npm test` | Simulation unit tests |
| `npm run balance` | Bot-vs-bot balance probe (death causes, captures) |
| `npm run ios` | Build, sync to iOS and open Xcode |
