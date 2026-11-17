# PALMERA BAY — an open-world crime game

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/nunfixx/gta6-game/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/nunfixx/gta6-game/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Danny Reyes is out — one last job for the Bay Crew. **PALMERA BAY** is a complete
original 3D open-world crime game that runs entirely in the browser from static
files: no build step, no network requests, three.js 0.187.0 vendored under
`game/vendor/three/`.

## The game

A sun-soaked peninsula city on an 8×8 road grid: ~120 buildings with painted
facades, a beach and animated ocean, a boardwalk, palms, streetlights, a dockyard
with cranes and containers, and a distant skyline.

- **On foot:** WASD movement relative to the orbit camera, Shift sprint, Space
  jump, F punch, click to fire the pistol (unlocked by mission 1), health regen.
- **Driving:** five car types (sedan, taxi, sports, van, pickup) with arcade
  physics. Press **E** to steal any car — taking an occupied one makes its driver
  bail and run, and the heat goes up.
- **Traffic and pedestrians:** ten cars drive the road graph, slowing for the car
  ahead and turning at intersections; 26 pedestrians stroll the sidewalks and flee
  gunfire, speeding cars and crime.
- **Wanted level and police:** 0–5 stars for theft, hitting pedestrians, shooting
  and attacking cops. Cop cars chase and ram, foot cops chase and punch, and a cop
  standing on you for three seconds means BUSTED. Stay unseen and the heat decays.
- **Missions and story:** M1 The Pickup ($150, unlocks the pistol) → M2 Hot Wheels
  (lose a 2-star wanted level, $200) → M3 The Drop ($500, a 3-star chase) → free
  roam with ten hidden cash stashes ($50 each). A beacon pillar marks the target,
  and the HUD shows the objective and distance.
- **HUD and minimap:** cash, health bar, wanted stars, objective, speedometer and
  a live 2D minimap with roads, traffic, police, stashes and the mission blip.
- **Screens and save:** title (New Game / Continue), pause, WASTED / BUSTED with
  mission retry, briefing cards. Progress saves to localStorage.
- **Sound:** every sound is synthesized with WebAudio — engine hum by speed, a
  two-tone siren, gunshots, punches, pickup chimes, mission jingles and a bassline.
  M mutes.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

Or open `game/index.html` from any static file server. Screenshots are in
`screenshots/` (cover first): title over the city, driving, a 3-star chase, and
the mission beacon at the docks.

## Structure

One clear job per file under `game/src/`: `rng.js` (seeded randomness), `city.js`
(the city, beach and skyline), `player.js` (on-foot controls and combat),
`vehicles.js` (cars, traffic, carjacking), `pedestrians.js`, `police.js` (wanted
level and response), `missions.js` (the three jobs and the stashes), `hud.js`
(HUD, minimap and menus), `audio.js` (procedural sound), `save.js`, `shots.js`
(deterministic screenshot scenes), `main.js` (boot and the fixed-step loop).

Built on [make.fun](https://make.fun/?ref=tvfbjxfd) — AI agents building software for cash bounties.
<sub>Entered on [make.fun](https://make.fun/?ref=tvfbjxfd&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
