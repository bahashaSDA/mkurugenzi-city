# Mkurugenzi City — Audit (session 12, 2026-10-16)

Audit of the existing repository against the "Ultimate open-world realism" brief (Parts 1–26),
done before changing anything. Every defect listed under "Reproduced" was measured in code or in
the running production build (`npm run build && npx vite preview --port 4173`, headless Chromium
via Playwright). Where something was only read in the code it says so.

Companion documents: `IMPLEMENTATION_PLAN.md` (what is done, in what order, how it's tested),
`KNOWN_ISSUES.md` (what remains and why), `VERIFICATION_SESSION9.md` (sessions 9–11 test report).

---

## 1. Architecture (as found)

| Area | Implementation | Main files |
|---|---|---|
| Stack | React 19, TypeScript 5.9, Vite 8, three.js 0.186, React Three Fiber 9, Drei 10, `@react-three/rapier` 2.2 (Rapier 3D), zustand 5, postprocessing | `package.json` |
| Persistence | No backend for game state. Per-browser `localStorage`, versioned keys, wrapped in try/catch (economy `mk.economy.v2`, missions, health, radio, mixer, map, clock) | `src/game/economy.ts` … |
| Backend | One Vercel edge function (latest YouTube episodes) | `api/latest-episodes.ts` |
| World | 4 km square. Pure height function `heightAt()` drives terrain, physics and placement. Roads are polylines (`config/roads.ts`), drawn as ribbons. Districts: hub/mtaa, market, Kibera, Rocky Ridge, CBD, estate, five far towns, beach + sea, theatre | `world/heights.ts`, `world/Terrain.tsx`, `world/Roads.tsx`, `districts/*` |
| Assets | Blender pipeline (`blender/scripts/*`) → `public/models/raw` → `tools/optimize-assets.mjs` (KTX2 + meshopt) → `public/models`. Sketchfab vehicles/buildings/trees (credited, `ASSETS.md`), MPFB2 humans, CMU mocap + Quaternius clips | `blender/`, `tools/` |
| Physics | Rapier: terrain heightfield, box/hull colliders per kit placement, kinematic character controller (player), Rapier raycast vehicle (the car you drive), kinematic bike model (bodas), kinematic route-following traffic | `systems/player/Player.tsx`, `systems/driving/*`, `systems/vehicles/*` |
| Vehicles | Real Sketchfab models baked into two kits; wheels split out (`tools/split-wheels.mjs`); hinged/sliding doors cut out for Golf, Corolla, Crafter matatu, HiAce, nganya, bus (`build_real_kit.py` `doors` / `door_islands`) | `systems/vehicles/*`, `systems/driving/*` |
| Occupancy | One state machine for every vehicle: walking → approaching → boarding → seated → exiting; the occupant is attached to the vehicle's rendered matrix | `systems/vehicles/occupancy.ts` |
| Traffic / transit | Route loops with stops, yielding, turnarounds, dwell, fares, conductor lines | `systems/vehicles/Vehicles.tsx`, `routes.ts`, `Stages.tsx` |
| NPCs | Instanced crowds (atlas + far LOD), pedestrians on paths, shop attendants, theatre audience | `systems/npc/*`, `districts/theatre/*` |
| Audio | Web Audio mixer buses + limiter; synthesised engines; city ambience; original procedural radio (5 stations); voice via clip manifest or browser TTS | `systems/audio/*` |
| UI | HUD, radar + full map (A* GPS on the road graph), shop menus, radio HUD, mission UI, touch controls | `ui/*`, `game/navigation.ts` |
| Missions | 200 Mkurugenzi missions (data-driven), mission spawns, cutscenes, combat | `game/missionData.ts`, `game/missions.ts`, `game/MissionWorld.tsx` |
| Time | GTA-style clock, sun, street lights, night windows | `world/clock.ts`, `world/sun.ts`, `world/Environment.tsx`, `world/StreetLights.tsx` |
| Tests | Playwright scripts under `tools/` (vehicle, world, smoke, mission, audio, perf probes); `npm run test:physics` | `tools/*.mjs` |

State at the start of this session: `npx tsc --noEmit` passes. Sessions 9–11 (40 files, +3.7k
lines) were **uncommitted** in the working tree; nothing in this session discards them.

---

## 2. Reproduced defects and root causes

### D1 — Vehicles sink into roads, wheels float above them, terrain swallows roads (Parts 2.3, 3.2, 3.3)  — **FIXED this session**
- **Measured** (`npx tsx tools/road-gap.ts carve=0`): three different surfaces disagreed.
  - Roads were drawn from `heightAt()` every 4 m; the physics ground was an **8 m** heightfield;
    the low-tier visual terrain a **16 m** mesh (10.7 m mid).
  - Paved roads are graded into slopes over a 7 m blend — far finer than either grid.
  - Physics surface vs the drawn road: up to **0.75 m below** it (hill-road: the car sinks into the
    tarmac) and **1.31 m above** it (beach-road; 0.80 m expressway: wheels float over the road).
  - Low-tier terrain drawn **over** the road by up to **5.75 m** (hill-road), 2.81 m (ridge-track).
- **Root cause:** grid resolution vs road grading — not the car, suspension or model origin.
- Also found: turning circles were `CircleGeometry` fans (centre-to-rim spokes) which cut chords
  through the slope at the expressway ends and floated in the air (screenshot
  `research/session12-shots/rv_cruiser_expressway_drive1.png`).
- **Fix:** see IMPLEMENTATION_PLAN Phase 2 (`src/world/roadSurface.ts`).

### D2 — Abel walks through closed doors (Land Cruiser, Ma3, graffiti matatu) (Part 4.1) — **Cruiser FIXED; Ma3/graffiti open**
- Read from the shipped GLB (`real_vehicles_kit.glb`): the Land Cruiser had **no door nodes**; the
  Golf, Corolla, Crafter, HiAce, nganya and bus already had real hinged/sliding doors.
- Blender analysis (`find_door_islands.py`, interior face census):
  - **Land Cruiser:** doors are real mesh islands (skin, lining, frame, glass) and the cabin has a
    full interior → doors can be cut out properly.
  - **Ma3:** the model has **no passenger door at all**; the cab doors are paint on a single
    body-shell island, and the shell is hollow (almost no faces inboard above 1 m). Cutting a door
    would open onto an empty box — it needs a modelled door frame and interior first.
  - **Graffiti matatu:** a photogrammetry scan (15,168 texture islands); no door geometry exists.

### D3 — Same handling for every car (Part 3.4) — open
- `Driving.tsx`: one suspension (K = 30, rest 0.32 m, travel 0.22 m), one friction (2.4 / 1.1),
  one engine sound ('petrol') for every drivable car. Only `maxSpeed` and `power` differ per kind
  (`CAR_DIMS`). The Land Cruiser therefore rides, rolls and grips like the Golf.

### D4 — No skid marks, tyre tracks, dust or drift model (Parts 3.5, 3.6) — open
- No code exists (`grep skid|track` empty). Drifting is whatever Rapier's friction gives.

### D5 — Damage is engine health + dents only (Part 3.8) — partial
- Engine health, body dents at the impact side, bonnet smoke, coughing/dead engine exist.
  No staged visual states (lights, panels, glass), no repair point (no garage exists).

### D6 — No wardrobe, no hairstyles, kinyozi is a generic duka (Parts 9, 10) — open
- No outfit/hair code at all. `shop_barber` and `shop_boutique` exist on the hub street but open
  the generic `int_shop` duka.
- Constraint found in `abel_look.py`: `cull_hidden_body()` **deletes body skin under the suit**, and
  his buzz cut is painted onto the head texture (hair cards removed). Swapping garments therefore
  needs the exposed skin patches and fitted hair meshes built in Blender, skinned to the same rig.

### D7 — No general seating system (Part 11.1) — partial
- Seats exist only as purpose-built cases (vehicles, market stall bench for vendors, theatre).
  The player cannot sit on benches/chairs in the world.

### D8 — No weather, no underwater/diving (Parts 15.4, 16.3) — open
- `grep weather|underwater` empty. Swimming exists (surface swim, `Swim_Loop`).

### D9 — Freddie's School is not enterable (Part 12) — open
- The school is a town landmark/mission location (`config/areas.ts`, `missionData.ts`); interiors
  exist only for `int_kibera`, `int_house`, `int_shop`, `int_hoteli` (`systems/interiors/rooms.ts`).

### D10 — Missing world systems (Part 24) — open
- No traffic lights, fuel, garages/repair, collectibles, key remapping, indicators.

### D11 — Voices are browser TTS (Part 6.10) — blocked on rights/assets
- Already documented in session 9: no licensed Kenyan recordings in the repo; the clip pipeline
  (`public/audio/voice/manifest.json`) is ready.

---

## 3. What already works (verified in sessions 9–11, re-checked where noted)
- Car: walk to the door → door swings → sit → drive → exit to a safe spot (seat error 0.000 m).
- Boda: mount, ride, lean, dismount. Ma3/nganya: pay, aisle, seat, ride, alight at a stop.
- Engine voices synthesised from drivetrain RPM; radio with 5 original stations; conductor voice
  with subtitles; map + GPS on the real road graph; red/green mission markers; attendants at
  shops; streetlight kit with pooled real lights; distant-vehicle LOD hysteresis.
- Smoke, physics, vehicle, world tests (see VERIFICATION_SESSION9.md).

## 4. Risks
- **Uncommitted work:** sessions 9–12 live only in the working tree. A commit is strongly advised
  (not done without the owner's say-so).
- **Kit rebakes:** `real_vehicles*_kit.glb` must be rebuilt in order: `build_real_kit.py --only …`
  → `merge-kit.mjs` (kit 1: `rv_car,rv_cruiser,rv_matatu,rv_nganya`; kit 2:
  `rv_boda,rv_bus,rv_corolla,rv_graffiti,rv_hiace,rv_ma3`) → `optimize-assets.mjs` (only that file)
  → kit 2 only: `fix-vehicle-facing.mjs`, `add-plates.mjs` → `split-wheels.mjs`.
- **Budgets:** low tier is at ~250 draw calls in the mtaa/market already.
- **Software GL:** headless tests run SwiftShader/ANGLE; FPS figures from them are not meaningful.
- **Licensing:** several vehicle models are "Sketchfab Standard" (allowed in-project, check before
  public launch, `ASSETS.md`). Real Kenyan radio streams need broadcaster permission (none held).
