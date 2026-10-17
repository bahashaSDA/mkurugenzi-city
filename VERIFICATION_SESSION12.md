# Session 12 — Verification report (2026-10-16)

Everything below was measured in the running production build (`npm run build && npx vite preview
--port 4173`, Playwright, `GPU=1`), unless marked as a static tool. FPS numbers from these runs are
not meaningful. Screenshots: `research/session12-shots/`.

## Results

| Area | Test | Result |
|---|---|---|
| Road vs ground (all grids) | `npx tsx tools/road-gap.ts` (static) | **PASS**: terrain never above a road; worst +0.3 cm (low tier, at a turning circle). Before: physics up to 0.75 m under / 1.31 m over the road, low-tier terrain up to 5.75 m over it |
| Wheel contact, Land Cruiser | `tools/ground-probe.mjs <dir> rv_cruiser <road>` | hill-road ±0.2 cm, beach-road −1.6..+0.2 cm, expressway −2.6..0 cm, ridge-track (murram) 0 cm; 99.8–99.9 % of wheel samples in contact; no console errors |
| Land Cruiser doors | `CAR=rv_cruiser node tools/vehicle-test.mjs <dir> car` | **PASS**: approaching → boarding → seated → exiting → walking; door swung to 94 % on its front hinge; seat error 0.000 m while moving; 54 m driven; got out outside the car |
| Handling per car | `tools/handling-test.mjs` | Golf 0–50 km/h 5.6 s, 60–0 in 22.8 m, roll 3.6°; Corolla 6.0 s / 26.4 m / 3.5°; Cruiser 7.9 s / 29.6 m / roll 4.5° (centre of mass 0.62 m gave 4.6°, 0.78 m gave 12.7°; shipped at 0.68 m. The Cruiser is heavier and slower than the cars but its roll is only a little more than the Golf's; target 6–8° needs play-testing, K6) |
| Tyre marks / dust | `tools/handling-test.mjs` | Drift lays 200–400 rubber quads on tarmac; 618–873 track quads and 84–116 live dust puffs per 8 s off-road; ring buffer bounded at 2,600 quads / 160 puffs |
| Boutique | `tools/wardrobe-test.mjs <dir> boutique` | **12/12 PASS**: attendant serves; try-on changes the model and is free; Buy asks to confirm; charged exactly once (10,000 → 7,000, even with a forced second purchase call); owned and worn; tweed always available; re-wear free; broke = no purchase; camera restored; saved; persists after reload. Visual check: `wardrobe/boutique_1_try_on.png`, `boutique_3_after_reload.png` |
| Kinyozi | `tools/wardrobe-test.mjs <dir> kinyozi` | **7/7 PASS**: the barber serves; Abel sits in the barber chair; afro preview (cap off) free; not charged before the cut is done; taper applied and charged once (1,100 → 750); Done stands him up and closes the panel. Visual check: `kinyozi_1..4*.png` |
| Stage bench | `tools/wardrobe-test.mjs <dir> bench` | **4/5**: sits exactly on the seat in the seated pose; "Stand up" prompt; stands up at the exit spot. FAIL: when a matatu waits at the stage its F "Board" prompt is the one shown, so the E "Sit" option isn't advertised (KNOWN_ISSUES K14) |
| Wardrobe rig | `node tools/wardrobe-bindcheck.mjs` (static) | **PASS** for all 14 files: 53 joints, rest rotation ≤ 0.035°, joint positions identical; probe jacket = shipped jacket to 0.00 mm |
| Regression: character controller | `npm run test:physics` | PASS |
| Regression: walking / collision | `node tools/smoke-test.mjs <dir>` | PASS (walk, wall, 0.30 m step, 0.45 m block, 55° ramp) |
| Regression: car / boda / matatu | `node tools/vehicle-test.mjs <dir> car bike matatu` | PASS, seat error 0.000 m for all three, fare KSh 50 charged, no console errors. Note: the Corolla stopped after 16 m against a roadside lamp-post collider: the parking shoulder and the lamp line overlap (K13), not a physics fault |
| Typecheck / build | `npx tsc --noEmit`, `npx vite build` | PASS |

## Bugs found during this session's testing (and fixed)
1. Expressway west end climbed the map-edge hills at a 32 % grade; the car tumbled into a 2.6 m
   trench a naive carve rule had dug under the median → end moved to x = −1440, carve rule made
   slope-aware.
2. Turning circles were centre-to-rim fans that floated over slopes (a grey sheet in mid-air at the
   expressway end) → draped polar grids, used as colliders too.
3. Wardrobe meshes bound with Abel's inverse bind matrices lost their quantisation transform: giant
   floating shoes, face hidden → keep each file's own IBMs (the rest poses match).
4. The boutique mirror camera could end up inside a shelf (Abel's facing follows the camera) → he
   steps to a fitting spot facing the door.
5. In the kinyozi, the chair's "Sit" prompt beat "Talk to the barber" → sitting in the chair now
   calls the barber over.
6. After a cut, the cap hid the new hairstyle → cap off for the whole barber visit.

## Not verified this session
- Hoteli: eating while seated (`Sitting_Consume`) is implemented but not exercised by a test.
- Boda tyre tracks (implemented, not measured).
- Low/mid/high tier visual check of the carved road shoulders at the ridge (K12).

---

## Part 2 — features added after the first report, and the loading / lag investigation

### New features (each with its test, all run against the production build)
| Feature | Test | Result |
|---|---|---|
| Mkurugenzi Stories radio (Abel's YouTube episodes, visible player, resume) | `tools/stories-test.mjs` | 4/4 |
| Freddie's School interior, pupils, teacher, easter egg; Story Tapes | `tools/school-test.mjs` | 10/10 |
| Fuel stations, garage repairs, remapped keys | `tools/garage-test.mjs` | 8/8 |
| Weather (clear → rain) | screenshots `weather/street_clear.png`, `street_rain.png` | visual check |
| Diving, breath, surfacing | `tools/dive-test.mjs` | 5/5 |
| Cars into the sea | `tools/sea-test.mjs` | 3/3 |
| Traffic lights | `tools/lights-test.mjs` (avenue × North Street) | 4/4 |
| Commuters boarding at stages | `tools/passenger-test.mjs` | 3/3 |
| Stage shelters on the pavement (owner report: one stood on the road) | `stageSpots()` check: 23 stages, 0 on a road | fixed |
| Board through the model's real opening door, wait for it to open | `vehicle-test.mjs matatu` | pass |
| Get off: F while moving → next stage, F stopped → now; blocked kerb → nearby spot | `ONCE=1 vehicle-test.mjs matatu` | see regression run |

### Black screen + lag on opening the world (owner report) — root causes, measured
1. **Dev-server crash** (`computeColliderMovement` of undefined): the character controllers were made in
   `useMemo` and freed by React's dev double-mount cleanup. Created in the effect that frees them now
   (`Player.tsx`, `Bike.tsx`); combatants re-register on mount. The production build never had it.
2. **95 s splash**: the road-carved terrain grids were recomputed on every remount (Terrain = `Kh`,
   `carvedHeight` = 58 s of CPU in the profile). Now computed once in a Web Worker and cached
   (`world/terrainWorker.ts`, `terrainHeights.ts`).
3. **8–9 s freeze on the first frame after "Tap to enter"**: ~50 shaders compiled synchronously:
   - three's shader error check waited for the driver after each compile → off outside dev/`?debug`;
   - `compile()` skips hidden objects → `perf/compileAll.ts` shows them for the compile;
   - the first frame's sky reflection map / pipeline changed every material's variant → the world is
     primed behind the splash with real frames through post-processing, nothing hidden or culled;
   - lights appearing later (street-light pool after its own loading step, a room's lamps on entering a
     shop) changed every shader → `world/LightRig.tsx`: all dynamic lights exist from the first frame.
4. **Tier changes in play** (auto-quality dropped high → mid → low after measuring the freezes above,
   each a 7–9 s rebuild): the tier is now chosen while loading from timed frames (step down only if
   clearly too slow), remembered per browser, and never changed automatically in play (resolution
   still adapts). The first 20 s of play and seconds containing a stall are not judged.

| Measure (this PC, production build, 1280×720) | Before | After |
|---|---|---|
| Splash until "Tap to enter", first visit | 95 s | 48 s |
| Same, later visits (learned tier) | 95 s | 28 s |
| Main-thread blocked during loading | 93 s | ~8 s |
| Worst frame in the first 15 s of play | 8,900 ms | 100 ms |
| Frame rate after entering | 9 fps, freezes | steady 27–35 fps (tier Medium) |

`tools/fresh-load.mjs`, `tools/load-profile.mjs`, `tools/load-cpu.mjs` (`AFTER=1` profiles play) reproduce these.

### Splash sound
The background episode now starts muted (the only way a browser lets it autoplay) and the first tap or
key on the splash turns Mkurugenzi's voice on (YouTube player API); a "Tap for sound" chip shows it.
Not verifiable in automated tests (the splash video is disabled under automation by design).

## Part 3 — shorter loading, no lag when the world opens, every screen size (2026-10-17)

### What was slow, and the fix (each measured before/after)
| Cause | Fix |
|---|---|
| 30 model files downloaded one after another (each component asked when React reached it): a waterfall from 8 s to 15 s | `prefetchModels()` starts every world GLB the moment the renderer exists; one shared per-file cache (`systems/characterModels.ts` `useModel`) for kits, Abel, the conductor and NPCs. Downloads now end by ~3 s |
| GPU check waited on a CDN benchmark file and a render-blocking Google Fonts stylesheet (4.2 s before the game could start) | Benchmarks served from `public/benchmarks`, fonts load without blocking, game chunk requested at once: GPU known at 0.8 s |
| Same kit re-processed by every component using it (far-LOD merge with GPU read-back), ground mask re-painted per mount | Module caches in `useKit` and `Terrain` |
| First visit built and compiled the world twice (guessed "high"/"mid", measured too slow, rebuilt) | Integrated GPUs and phones start on Low; a step-down waits for the world to really remount (`terrainShown`) and the next terrain grid is precomputed |
| Priming frames passed milliseconds to `advance()` (taken as seconds): every loading frame simulated ~16 s, so frames measured 2–3x slower than in play | `tick()` passes seconds and caps the step |
| 630 ms freeze on "Tap to enter": the phase change re-rendered every world component | The world is a memoised component; only phase readers update |
| 0.6–1.3 s GPU stalls on the first frames of play (driver work three.js can't pre-trigger) | The curtain covers the screen, the game starts under it, and it lifts only after 12 frames in a row under 50 ms (max 6 s) |
| Shadow shaders compiled in play after a tier step-down (priming ran on the hidden half-built world) | Wait for the new tier's terrain before priming; two full-world frames; empty instanced meshes drawn once |
| CPU per frame: 13,800 objects re-matrixed every frame (most hidden pool bones); 10,000 static colliders stepped every physics step (1.7 ms/step) | Hidden subtrees skip matrix updates (`perf/skipHidden.ts`); static colliders exist only within ~170–210 m of the player (`systems/colliderStreaming.tsx`): 0.3 ms/step |
| Slow devices spiralled (one slow frame → up to 30 physics steps → slower frame) | A frame never advances the game more than 1/15 s (`FrameClamp`) |
| Low tier still too slow on a device | "Lite" (`perf/lite.ts`): lower resolution, sun shadow redrawn every 4th frame, shorter prop distance; no recompile; remembered |

### Device matrix (`tools/device-matrix.mjs`, production build, this PC's Intel Iris Xe)
EMULATED: screen size, pixel ratio, touch and mobile browser are real Chrome emulation; the GPU is this
PC's in every row; phone CPUs are approximated with Chrome's CPU throttle (4x / 6x), which is cruder
than a real phone. First visit (empty storage) in every row. "First 2 s" = worst frame right after the
curtain lifts.

| Device | Ready | Curtain | FPS after open | Worst frame | Worst, first 2 s | Layout |
|---|---|---|---|---|---|---|
| Desktop 1920×1080 | 28.3 s | 4.1 s | 52 | 67 ms | 67 ms | OK |
| Desktop 2560×1440 | 40.1 s | 4.9 s | 37 | 67 ms | 67 ms | OK |
| Laptop 1366×768 | 17.7 s | 3.5 s | 50 | 50 ms | 33 ms | OK |
| Laptop 1440×900 @2x | 20.0 s | 3.7 s | 46 | 67 ms | 33 ms | OK |
| iPad portrait (touch) | 17.4 s | 3.5 s | 55 | 33 ms | 33 ms | OK, touch controls |
| iPad landscape (touch) | 16.9 s | 3.5 s | 53 | 33 ms | 33 ms | OK, touch controls |
| iPhone 13 portrait, CPU 4x | 49.5 s | 8.8 s | 9 | 233 ms | 217 ms | OK, touch controls |
| iPhone 13 landscape, CPU 4x | 49.9 s | 8.8 s | 8 | 233 ms | 217 ms | OK |
| Pixel 7 portrait, CPU 4x | 50.1 s | 8.9 s | 9 | 300 ms | 300 ms | OK |
| Galaxy S9+ landscape, CPU 4x | 47.9 s | 9.1 s | 9 | 183 ms | 183 ms | OK |
| Small phone 360×640, CPU 6x | 74.6 s | 12.4 s | 6 | 283 ms | 233 ms | OK |

No page overflow, no HUD element off screen, no console errors in any row. The Pixel 7 profile without
CPU throttling: ready 14.5 s, 57 fps, worst frame 33 ms. A returning visit at 1920×1080: 17.8 s.

Before this part (same PC): 1280×720 first visit 38–48 s, worst frame right after entering 0.8–1.5 s,
1920×1080 37 fps, 4x-throttled phones 2–3 fps.

### Regression (after these changes)
smoke 7/7 (`GPU=1`), alight 4/4, garage 5/5, school 5/5, interior pass, passengers 3/3, dive 5/5,
wardrobe: boutique 12/12, kinyozi 7/7, bench 5/5 (`GPU=1`), car / bike / matatu pass (`GPU=1`).
Under the software renderer (SwiftShader, < 15 fps) the game now runs in slow motion by design, so
movement tests must use `GPU=1` (the smoke test also waits for the curtain now).

New tools: `device-matrix.mjs`, `enter-compiles.mjs`, `enter-trace.mjs`, `frame-stats.mjs`,
`physics-step.mjs`; `load-stages.mjs` (`W=`, `H=`, `TWICE=1`), `load-cpu.mjs` (`PHONE=1 CPU=4 LONG=1 WIN=1`).
