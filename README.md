# Coldstore

A round-based tactical first-person shooter in the browser, on three.js: two teams of
four, short rounds, an economy, a buy menu, and a charge to plant or defuse in a
decommissioned Antarctic food depot. Single player against bots, static files, no build
step, no network.

Entry for make.fun's [three.js tactical FPS bounty](https://make.fun/bounty/threejs-fps-02).

[![bounty](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/KayleeWoods/coldstore-fps02/rank.svg)](https://make.fun/bounty/threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/KayleeWoods/coldstore-fps02/reward.svg)](https://make.fun/bounty/threejs-fps-02)

## Play it

```bash
node serve.ts          # http://localhost:8080
```

Click **Enter the depot** to lock the mouse.

| key | action |
| --- | --- |
| `W A S D` | move |
| mouse | look |
| left button | fire |
| `R` | reload |
| `Ctrl` / `C` | crouch |
| `1` / `2` | primary / sidearm |
| `B` | buy menu (buy phase only: `1`-`4` buys) |
| `G` | throw the frost charge |
| `E` | plant or defuse the charge |

## What is in it

- **Round loop**: buy phase, live round, round end, an economy that pays for kills, plants
  and round wins, best of nine.
- **Two sites**: A, the freezer hall, and B, the loading bay. Raiders plant a charge;
  Depot defuses it or runs the clock out. Eliminations end a round too.
- **Gunplay**: hitscan against a body built from a head sphere over a stack of torso
  spheres, so headshots pay; recoil and spread that punish firing while moving; crouch
  and stop to tighten.
- **Four weapons and a grenade**: a sidearm, an SMG, a rifle and a scoped rifle with
  distinct damage, rate of fire, spread and price, plus a timed frost charge.
- **Bots**: waypoint routes to a site, hold angles, acquire by sight cone plus line of
  sight, hear gunfire and investigate, fire in bursts with a reaction delay, plant and
  defuse.
- **Look**: one palette (cold enamel, oxidized steel, one warm amber), every surface
  textured procedurally on a canvas at load (rivets, grime, concrete stains, stencilled
  crates), sodium lamps with real point lights, fog, soft blob shadows, stencilled site
  signage and hazard plates.
- **HUD**: health, money, round timer, score, weapon and ammo, grenade count, killfeed,
  round banner, buy menu, bomb indicator.
- **Audio**: procedural WebAudio only, no sound files: shots, reloads, footsteps,
  impacts, charge beeps and the detonation.

## Layout

```
main.ts              the program the grader runs: copies game/ and screenshots/ to /output,
                     writes dossier.json
serve.ts             static server for local play (Node standard library only)
game/index.html      canvas, HUD markup and the single import map for "three"
game/src/main.js     bootstrap, fixed-step loop, rendering, screenshot modes
game/src/state.js    the one game state, its factory and reset helpers
game/src/player.js   movement, collision, hit volumes, damage
game/src/weapons.js  weapon table, spread and recoil, hitscan, reload, grenade
game/src/bots.js     bot routes, holds, sight, hearing, bursts, planting
game/src/rounds.js   phase machine, economy, bomb timer, win resolution
game/src/map.js      map boxes, collision, line of sight, geometry and set dressing
game/src/hud.js      DOM HUD, buy menu, killfeed
game/src/audio.js    procedural sound
game/src/fx.js       pooled tracers, impacts, smoke
game/src/textures.js procedural surface textures
game/vendor/three/   three.js 0.187.0, unmodified
```

The simulation runs on a fixed 1/60 s step; rendering interpolates and never feeds back
into the simulation. No allocation in the per-tick path: scratch vectors are module
level. Every random draw comes from the seeded generator in `state.js`, so a run is
identical given the same replies.

## Screenshots

`screenshots/` holds four 1280x480 captures of the game, produced by the `?shot=`
modes (`start`, `play`, `bomb`, `end`), which stage one pose and one cast and freeze.

## Licence

MIT, see `LICENSE`.
