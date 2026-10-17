# Mkurugenzi City — Implementation plan (from session 12, 2026-10-16)

Covers every Part of the "Ultimate open-world realism" brief, in dependency order. Built on the
existing architecture (`AUDIT.md`); nothing is rewritten from scratch. Status is honest:
**Done** = implemented and verified in the running build (test named), **Partial** = some of it
works (what is missing is listed), **Not started**, **Blocked** (needs something outside the code).

Test conventions: `npm run build && npx vite preview --port 4173`, then the Playwright tools below
(`GPU=1` uses the real GPU; default is software GL). FPS from software GL is not meaningful.

---

## Phase 1 — Audit and reproduce  (**Done**)
- `AUDIT.md`, this plan, `KNOWN_ISSUES.md`. Measurement tools added: `tools/road-gap.ts`
  (road vs ground on every grid), `tools/ground-probe.mjs` (wheel contact vs the drawn road while
  driving a road), `tools/handling-test.mjs` (acceleration, braking, roll, drift, marks, dust).

## Phase 2 — Physics and collision foundation
| Item | Status | Implementation | Test / completion criterion |
|---|---|---|---|
| Road / terrain / physics agreement (D1) | **Done** | `src/world/roadSurface.ts`: ribbons built once; same triangles drawn and used as trimesh colliders (`Roads.tsx` `RoadColliders`); terrain heightfield and visual mesh carved under roads with a slope-aware rule; kerb skirts; draped turning circles; `surfaceAt()` for parked cars, traffic, bodas, exit checks | `npx tsx tools/road-gap.ts`: terrain never above a road on physics/low/mid/high (≤ 2 cm) — **PASS**. `ground-probe.mjs` (Land Cruiser): hill-road ±0.2 cm, beach-road −1.6..+0.2 cm, expressway −2.6..0 cm, ridge-track 0 cm, 99.8–99.9 % of wheel samples in contact |
| Expressway climbing the map-edge hills at 32 % | **Done** | West end moved to x = −1440 (`config/roads.ts`, turnaround, route) | Expressway probe above |
| Per-vehicle handling (D3) | **Done (cars)** | `HANDLING` table (`systems/driving/state.ts`): mass, centre of mass, springs, damping, travel, grip, off-road grip, drivetrain (FWD Golf/Corolla, 4×4 Cruiser), brakes, steering, engine voice | `handling-test.mjs`: Golf 0–50 in 5.6 s / 60–0 in 23 m / 3.7° roll; Cruiser 7.8 s / 32 m / more roll |
| Surface grip, handbrake drift | **Done** | Per-wheel surface (`surfaceKind`: tarmac, murram, dirt, sand) sets friction each physics step; Space locks the rears and lowers their lateral grip, recovering smoothly | `handling-test.mjs` drift section |
| Skid marks, tyre tracks, dust, tyre smoke (D4) | **Done** | `systems/driving/tyreMarks.ts` + `TyreFx.tsx`: one ring-buffer mesh (2,600 quads), one 160-particle pool; rubber only while sliding on tarmac, tracks on murram/dirt/sand, dust by speed, smoke by slip; fade after 2 min. Car (4 wheels) and boda (2) | `handling-test.mjs`: marks laid in drift, tracks + dust off-road; screenshots `research/session12-shots/handling/` |
| Tyre audio | **Done** | `systems/audio/tyres.ts`: continuous squeal (tarmac slip) + gravel crunch (off-road), mixed under the engine | Listen test (manual); no per-frame restarts by construction |
| Collision categories | Partial | Buildings/kit pieces solid (box/hull), poles have colliders (session 9). Missing: knock-over light props | — |
| Staged damage + repair (D5) | Partial | Engine health, dents, smoke exist. **Next:** visual stages (lights, glass), garage repair point | — |
| Traffic vs pedestrians | Partial (session 9) | Yielding, gap keeping. **Next:** blocked-road timeout + reroute | — |

## Phase 3 — Doors, seating, character transitions
| Item | Status | Implementation | Test |
|---|---|---|---|
| Land Cruiser hinged doors (D2) | **Done** | `build_real_kit.py` `door_islands` for `rv_cruiser`; kit 1 rebuilt (merge → optimize → split-wheels); existing `carRide()` door choreography drives it | `CAR=rv_cruiser node tools/vehicle-test.mjs <dir> car`: approaching → boarding → seated → exiting → walking, door opened to 94 %, seat error 0.000 m, 54 m driven, exit outside. Shot `research/session12-shots/cruiser/car_1b_door_open.png` |
| Ma3 / graffiti matatu: no boarding through bodywork | **Done (interim)** | Vehicles whose model has no kerb-side door are "express": never stop for passengers, never pull over for a wave, no board prompt (`Vehicles.tsx` `carries()`) | Code path; matatu test still boards door-equipped vehicles |
| Ma3 real passenger door + interior | Not started | Needs Blender work: cut the kerb-side door panel, model door frame/step, line the hollow shell, benches (KNOWN_ISSUES K2) | vehicle-test matatu on `rv_ma3` |
| Interior / first-person camera per vehicle | Partial | V first-person exists on foot; per-vehicle interior cam not built | — |

## Phase 4 — Public transport and NPC behaviour
- **Done (this session):** commuters wait at stages, walk to the door of a stopped matatu/nganya/bus one at a time, step in (passenger count), others get off and walk away (`systems/npc/StagePassengers.tsx`). `tools/passenger-test.mjs` 3/3.
- Session 9 delivered: fares (charged once, broke handling), conductor voice + subtitles from one
  `say()`, routes/stops/dwell, seat layouts from the model. **Not started:** visible NPC passengers
  walking to the door and boarding (today occupancy is a counter); timeouts for blocked traffic.

## Phase 5 — Radio and sound
- **Done (this session):** Mkurugenzi Stories station (`systems/audio/stories.ts`, `ui/StoriesPlayer.tsx`): Abel's episodes newest first through YouTube's visible player; resumes where you left off; next episode at the end; promos and shorts skipped. `tools/stories-test.mjs` 4/4. Episode list refreshed (644; live feed for new uploads).
- Done earlier: five original stations, positional muffling outside nganyas, engine voices.
  **Next:** "Mkurugenzi Stories" as an episode-structured station (episode id, title, duration,
  transcript, resume policy) — needs authorised audio (KNOWN_ISSUES K4). Real Kenyan streams:
  **Blocked** on broadcaster permission; the station list must stay configurable.

## Phase 6 — Customisation and businesses
| Item | Status | Implementation | Test |
|---|---|---|---|
| Wardrobe (D6) | **Done** | `game/wardrobe.ts` (catalogue, owned, worn, versioned save `mk.wardrobe.v1`, charge-once, legacy merch migration); `blender/scripts/build_wardrobe.py` → 8 outfits (Mkurugenzi merch at mkurugenzi.ke prices + street/work wear) with skin patches; `systems/player/wardrobe.ts` binds them to Abel's bones; `ui/WardrobePanel.tsx` at Utafraaaia Boutique (mirror view, try on, confirm, wear, cap) | `wardrobe-test.mjs boutique` 12/12 |
| Kinyozi (D6) | **Done** | New `int_kinyozi` room (Blender: mirror, hydraulic chair, tools shelf, waiting bench, pay counter); Barber Kevo; 5 fitted MPFB2 haircuts + house buzz; sit in the chair → mirror view → preview → confirm → 4 s cut with clippers → paid once on completion | `wardrobe-test.mjs kinyozi` 7/7 |
| Seating (D7) | **Done (first set)** | `game/seating.ts` on the theatre seat: registry, occupancy (Abel or NPC claim), Sit/Stand prompts, exit spots, free or fixed camera; seats at every stage shelter (3 each), hoteli benches (16), kinyozi chair + bench; seated eating clip `Sitting_Consume` | `wardrobe-test.mjs bench` 4/5 (K14) |
| Visible vendors | Done (session 9) | Attendants behind every counter; barber added | — |

## Phase 7 — Map and world
| Item | Status | Implementation | Test |
|---|---|---|---|
| Freddie's School interior (D9) | **Done** | `int_school` in the interior kit: reception (sign, notice board, bench), Form 2 East and Form 1 West (blackboards, double desks with benches, windows), head teacher's office; open doorways, colliders; Mwalimu Otieno, a receptionist, 8 pupils at their desks (voiced, `rooms.ts SCHOOL_*`); readable board and notices; free desks to sit at | `tools/school-test.mjs` 10/10 |
| Easter egg + collectibles | **Done** | `game/collectibles.ts`: 12 Story Tapes at open landmarks (never on roads) + the Class of '99 photo; reward once, saved, bonus for all; tapes are episodes to watch from the bag | `school-test.mjs` (photo, tape picked once) |
| Weather (D8) | **Done** | `world/weather.ts` + `WeatherFx.tsx`: clear/cloudy/overcast/drizzle/rain, smooth blends; sky, sun, stars, moon, fog; wet glossy roads and ground; wet grip; rain streaks outdoors; rain sound (muffled in cars/indoors); HUD label; `?weather=` | Screenshots `weather/street_clear.png`, `street_rain.png` |
| Diving (D8) | **Done** | C dives / Space rises / drift up; seabed floor; breath bar; out of breath: damage and forced up (no re-dive until 60 %); underwater fog, tint, bubbles, muffled mix | `tools/dive-test.mjs` 5/5 |
| Cars and bodas in the sea (16.1) | **Done** | Drag, power cut, flooding engine past 0.55 m | `tools/sea-test.mjs` 3/3 |
| Traffic lights (24.1) | **Done** | `world/junctions.ts` finds 31 main-road junctions from the road network; 45 s cycle; heads on each approach's left kerb (solid); traffic stops on red/amber | `tools/lights-test.mjs` 4/4 at avenue x North Street |
| Fuel stations + garage (24.2, 24.3) | **Done** | `game/stations.ts`: the 5 petrol stations; 45 L tanks that drain with throttle, gauge, low/empty warnings; fill up (KSh 180/L, partial if broke) and repairs (engine + dents) charged once at the shown price; map icons | `tools/garage-test.mjs` 8/8 |
| Key remapping + settings (19.3, 19.4) | **Done** | `systems/input.ts` binding layer (swap on conflict, saved); `ui/SettingsPanel.tsx`: volumes per bus, mute, keys | `garage-test.mjs` (F moved to T) |

## Phase 8 — Population and activities — Partial (crowds, beach life, 200 missions exist)
## Phase 9 — Optimisation and regression — continuous (`perf-probe.mjs`, `smoke-test.mjs`)

---

## Session 12 changes (files)
- New: `src/game/wardrobe.ts`, `src/game/seating.ts`, `src/systems/player/wardrobe.ts`, `src/ui/WardrobePanel.tsx`, `blender/scripts/build_wardrobe.py`, `public/models/wardrobe/*`, `tools/wardrobe-test.mjs`, `tools/wardrobe-bindcheck.mjs`, `VERIFICATION_SESSION12.md`,
  `src/world/roadSurface.ts`, `src/systems/driving/tyreMarks.ts`, `src/systems/driving/TyreFx.tsx`,
  `src/systems/audio/tyres.ts`, `tools/road-gap.ts`, `tools/ground-probe.mjs`, `tools/handling-test.mjs`.
- Changed: `world/Roads.tsx`, `world/Terrain.tsx`, `config/roads.ts`, `systems/vehicles/routes.ts`,
  `systems/vehicles/exitCheck.ts`, `systems/vehicles/Vehicles.tsx`, `systems/driving/{Driving,Bike,state}.tsx|ts`,
  `app/Game.tsx` (debug handles + TyreFx), `blender/scripts/build_real_kit.py`, `tools/vehicle-test.mjs`,
  `public/models/real_vehicles_kit.glb` (Cruiser doors).
