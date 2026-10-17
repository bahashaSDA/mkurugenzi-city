# Session 9 — Vehicles, audio, radio, map, shops, streetlights: verification report

Every item below was reproduced or measured first, fixed at the root cause, then tested in the running
production build (`npm run build && npx vite preview --port 4173`). Tests run headless Chromium with
software GL (SwiftShader), so frame rates are not meaningful; behaviour, positions, phases and
screenshots are. Screenshots: `research/session9-shots/`.

| Test | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | pass |
| Character controller | `npm run test:physics` | pass |
| Car: walk to door → board → drive 374 m → exit | `node tools/vehicle-test.mjs <dir> car` | pass, seat error 0.000 m while moving |
| Boda: mount → ride, lean, steer → dismount | `node tools/vehicle-test.mjs <dir> bike` | pass, seat error 0.000 m |
| Ma3 nganya: walk → pay → aisle → seat → ride 163 m → alight at a stop | `node tools/vehicle-test.mjs <dir> matatu` | pass, Abel inside the body, outside it after |
| Shop: attendant at counter, menu via attendant, double-press, broke, close | `node tools/world-test.mjs <dir> shop` | 5/5 pass |
| Map: open, mission card, WASD pans (Abel doesn't move), road route | `node tools/world-test.mjs <dir> map` | 4/4 pass (410 m route, "turn right") |
| Streetlights at night (real lights on) | `node tools/world-test.mjs <dir> night` | town, CBD, estate: pass |
| Walking / collision regression | `node tools/smoke-test.mjs <dir>` | 7/7 pass, no errors |
| Draw calls, low tier, vs previous commit | `node tools/perf-probe.mjs low` | mtaa 252 (was 251), market 252 (250), Kibera 169 (169), CBD 134 (149), estate 72 (73) |

**Performance note:** split wheels at first added up to 4 draw calls per vehicle model and LOD. All
wheels of a model now share wheel 0's mesh (turned 180° for the far side), so the whole session costs
about +1 draw call. The mtaa and market were already at the 250-call low-tier budget before this
session; that pre-existing overage is unchanged and worth a separate pass.

## Root causes found and fixed

### Character in the wrong place in vehicles (Phase 2)
- **Cause 1 — timing.** Physics ran inside `useFrame` with interpolation; the player set its kinematic body
  from the car's *previous* step, so Abel trailed the car by one physics step (≈0.5 m at 30 m/s),
  jittering when a frame took 0 or 2 steps.
- **Cause 2 — rotation.** Abel's model only got the car's yaw, never its pitch/roll, so on slopes or
  braking his head went through the roof or legs through the floor.
- **Cause 3 — wrong seats.** All four nganya variants shared one hand-typed seat table from the old
  procedural model; on the real Ma3 model the back rows were *behind the bus* (Abel sat in mid-air).
- **Fix.** Explicit frame order (physics `updatePriority -100`, vehicles −50/−40, player 0). A single
  occupancy state machine (`systems/vehicles/occupancy.ts`: walking → approaching → boarding → seated →
  exiting) attaches the seated character to the vehicle's *rendered* matrix (full rotation). Seats,
  aisle, door and standing spots are now measured from each model's mesh (`systems/vehicles/layout.ts`,
  robust percentiles in the window band).

### Boarding / exiting (Phases 3–4)
- Car: F from up to 4 m → Abel walks (collision-aware) to the driver's door → reach/open (`Interact`)
  → turn and lower in (`Sitting_Enter`) → hands to the wheel → door closes → controls go live.
  Driver door blocked → passenger door and slide across. Exit checks a capsule at the door spot
  (walls, parked cars), the ground (no ledges or sea) and approaching traffic, tries the other door,
  refuses otherwise. Car holds still while getting in/out; no exit above 4 m/s.
- Matatu/nganya/bus: walk to the kerb-side door → sliding door (matatu) / folding door → step up →
  into the cabin → along the aisle → sit (or stand at the rail when full). The vehicle waits; the
  conductor steps down onto the kerb to make room and takes the fare at the door.
- **Limitation (documented):** the vehicle models are single baked meshes with no separate doors, so
  doors do not visibly swing on hinges. Door open/close/slide *sounds* are synchronised with the
  animation instead. Real hinged doors need asset work (split door panels in `build_real_kit.py`).

### Motorcycle (Phase 5) — new
`systems/driving/Bike.tsx`: bodas at every stage are rideable. Own kinematic bike model: throttle/brake/
walk-back, bicycle-model steering with speed-dependent range, centripetal lean, per-wheel ground rays
(pitch on slopes), sprung suspension, Rapier character controller for collisions (crash sound and
health on hard hits), 60 Hz substeps. Rider pose `Riding_Loop` is synthesised (driving-pose arms on
seated legs). **Asset bug found:** the boda model was baked tail-first (`forward="-x"` in the bake
table maps to −Z); fixed in the GLB (`tools/fix-vehicle-facing.mjs`) and in the bake config.
**Limitation:** no leg-swing clip exists, so mounting uses `Sitting_Enter`; hands are placed by the
pose, not IK.

### Wheels, suspension, ground contact (Phase 14)
- **Cause.** Every vehicle was one baked mesh: wheels could not turn, steer or move, and traffic
  stayed perfectly level on slopes.
- **Fix.** `tools/split-wheels.mjs` separates the real wheel meshes out of the shipped kits (tyre
  islands → wheels, axle centre + radius in extras) for 40 LODs across cars, Hiaces, Crafters,
  nganyas, Ma3, buses, boda. The driven car's Rapier raycast wheels now *are* those wheels (same
  centres/radii, suspension pre-loaded so tyres rest exactly on the road), and the wheel meshes take
  the physics spin, steer and suspension travel. Traffic wheels roll with distance (θ = d / r) and the
  front pair steers from route curvature; bodies pitch between the road heights under each axle, with
  a slight dive/squat. File sizes stayed in budget (6.42 MB / 5.88 MB of 6.5).
- **Limitation:** the graffiti "Story Time" matatu is a scan with broken tyre geometry; its wheels stay
  static. (That model was also baked sideways at 2× size — fixed: turned and scaled to 5.1 m.)

### The "engine drone" (Phase 6)
- **Cause.** There was no engine sound at all: the drone was the synthesised club music, played by
  every matatu/bus/nganya within 70 m, with a sub-bass note sustained through every bar.
- **Fix.** Engine voices synthesised from the drivetrain (`systems/audio/engine.ts`: per-cylinder
  firing pulses, gearbox → RPM, load-dependent filter, intake, road noise; petrol, diesel, heavy,
  single-cylinder boda). A pool of 5 positional voices for the nearest traffic, faded in/out (no
  cut-offs). Music now only from nganyas (muffled through the body from outside) and the vehicle you
  ride; the sub note decays instead of sustaining. New mixer buses (sfx, engines, ambience, world,
  radio, voice) with a limiter. City ambience (`CityAudio.tsx`): traffic bed following real traffic,
  market murmur, birds by day, crickets at night, sea, distant horns, footsteps by surface.

### Radio (Phase 7) — new
`systems/audio/radio.ts` + `ui/RadioHud.tsx`: five fictional stations (Nganya Radio, Mtaa FM,
Nairobi Drive — distinct original procedural sets; Mkurugenzi Radio and The Storyteller — original
spoken programmes). `,` `.` station, `-` `=` volume, `R` on/off (touch buttons on phones). Tuning static
covers switches, exactly one source plays, stations keep "playing" while tuned away, radio stops on
exit and resumes the same station on re-entry. All music is original synthesis — nothing copied.

### Conductor voice (Phase 8)
- **Cause.** Conductor lines were only toasts; nothing ever triggered audio.
- **Fix.** `systems/audio/voice.ts`: one `say()` shows the subtitle and speaks the line; deduped, newer
  lines replace older ones, distance-attenuated, mute and volume aware. Context library
  `game/conductorLines.ts` (calling, invite, fare, full, broke, depart, arrive, wait, alight, hail),
  Kenyan Swahili/Sheng with English subtitles, never the same line twice in a row.
- **Limitation (documented):** no licensed voice recordings exist in the project, and the only local
  TTS voices are robotic US English, so lines are spoken by the browser's built-in speech synthesiser
  (a Kenyan Swahili / Kenyan English voice where the browser has one — Edge and Android Chrome do).
  Web Speech can't be spatialised, so it's attenuated by distance, not panned. Pre-recorded clips are
  supported with no code change: drop files in `public/audio/voice/` with a `manifest.json`, and they
  play positionally through Web Audio.

### Map, GPS, mission markers (Phases 9–11)
- New full-screen map and radar (`ui/MapUI.tsx`): cased roads by class, named streets, districts,
  POIs, layer filters, zoom (wheel, buttons, PgUp/PgDn, pinch), pan (drag, WASD), recenter (C),
  mission details card, set/remove destination, clear route; gameplay input locked while open.
- GPS (`game/navigation.ts`): road graph from the same polylines as the 3D roads; A*; next-turn chip.
  **Bug found:** the graph was split in two (49/117 nodes reachable) because T-junction stubs were
  never linked — fixed (117/117).
- One marker system everywhere (`ui/icons.ts`): **green** = mission available (rounded square = story,
  circle = side job), **red** = active objective (diamond + pulse), green check = completed, purple =
  your waypoint. Shapes differ, so colour is never the only cue.

### Traffic, U-turns, junctions (Phase 11 / 16)
- **Bugs found.** The expressway route ran 110 m past the end of the road and turned back through the
  concrete median. Dead-end routes reversed in place (an impossible hairpin for a matatu). Crossing
  traffic never yielded.
- **Fix.** Roundabouts with islands at both expressway ends (median stops short), turning circles at
  the dead ends; routes circulate clockwise (Kenya keeps left). Route E is now a real loop. Crossing
  vehicles yield with a deterministic right of way (no deadlocks). Traffic keeps a gap behind the car
  you drive.

### Distant vehicles (Phase 15)
- **Cause.** On the low tier, the kit loader merged each vehicle's mid LOD into an untextured average-
  colour mesh from just 38 m, so approaching vehicles looked blurry and unfinished.
- **Fix.** Vehicles keep a textured mid LOD on every tier; LOD switching has hysteresis (no flicker).

### Shops (Phase 12)
- **Cause.** Every shop menu opened with nobody there.
- **Fix.** `systems/npc/Attendants.tsx`: attendants at kiosks, the chips booth, market stalls (seated on
  the bench), beach kiosks and the duka/hoteli interiors, behind the real counters. They turn to face
  you, greet, talk while you order, nod and thank you, say when you can't afford something, and say
  goodbye. Menus only open through them, from the counter. A double press charges once. **Geometry bug
  fixed:** the beach-kiosk counter was flush against a solid wall, leaving no room for a vendor.

### Streetlights (Phase 13)
- New Blender-built kit (`blender/scripts/build_lights_kit.py` → `lights_kit.glb`, 0.9 MB): galvanised
  octagonal cobra-head poles (town roads), grey LED columns (CBD, arterials), double-arm median lights
  (expressway), cast post-top lanterns (estates); PBR, weathering, LODs, and **colliders** (cars used
  to drive through the old poles).
- Lighting: a fixed pool of real spot lights for the nearest lamps (3 / 6 / 10 by tier, so no shader
  recompiles at dusk), handed between lamps by fading, shadows from the nearest on high tier. Lenses
  glow only at night. Far lamps keep a small glare and a modest ground pool under the actual head.

### Vehicle damage (Phase 16, truncated in the brief)
Engine health per car (kept when parked), body dents at the impact side (the car's own mesh copy),
bonnet smoke, a coughing engine at low health, and a dead engine at zero.

## Known limitations / follow-ups
1. No separate door meshes, so doors don't swing (asset work needed).
2. Voices use browser TTS until licensed recordings exist (clip pipeline ready).
3. No IK for hands and feet on wheels or bars; poses come from clips.
4. Graffiti matatu wheels stay static (broken scan geometry).
5. The graffiti matatu carries a real-looking number plate (KAW 408Y) from its Sketchfab source;
   consider repainting it like the other liveries.
6. The fixes to the shipped GLBs (`fix-vehicle-facing`, `split-wheels`) must be re-run after any full
   rebake of the real vehicle kits (rebake first, then facing, then wheels).
