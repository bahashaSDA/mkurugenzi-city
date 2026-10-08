# PROGRESS

_Last updated: 2026-10-08 (session 5)_

## Session 4: owner feedback "this looks so lame", so we switched to a vertical slice
Owner screenshot: the avenue in an empty beige plain with a capsule player.

**Diagnosis:**
1. Emptiness: buildings 30 m+ from the road.
2. No trees, cables, people or vehicles.
3. The capsule player.

**Strategy change:** finish ONE dense street to full quality before expanding (studio "vertical slice").

**Done:**
- `blender/scripts/kitlib.py`: shared kit library (refactored from build_hub_kit.py, identical output). Adds compound colliders (`COL_x__N`), and vertex-colour paint tint on white materials, so dust now *lightens* dark paint.
- `blender/scripts/build_street_kit.py` produces `street_kit.glb` (2.77 MB):
  - **7 shop units:** hardware, barber, hoteli, butchery, electronics, M-shop, boutique.
    - 4.6 x 9 m plots, 1-2 storeys, open stocked shopfronts, folding steel doors, shutter drum
    - mabati veranda on posts (walkable underneath: compound colliders)
    - hand-painted fictional signs, grilled upper windows with curtains, roof tanks, dishes
    - all units share about 10 materials, with paint from vertex colours
  - **Trees:** street tree and jacaranda in October bloom.
    - Procedural multi-level branching with bark.
    - Leaf-cluster cards rendered in Blender from CC0 leaf atlases (ragged sprays; jacaranda panicles).
    - LOD2 impostor rendered from LOD0. Wind sway in the vertex shader.
- Layout v2:
  - Continuous shop frontage on both sides of the avenue, with alleys every 5-8 plots.
  - Poles and trees (60% jacaranda) on the shoulders.
  - Market lane moved behind the west frontage (x = -12); block flats behind the east frontage.
  - Test course moved to (-600, 600).
- `src/world/Cables.tsx`: power conductors, slack telecom lines and service drops to the shops, all in ONE merged mesh.
- Spawn moved to the west pavement, looking up the street.

## Session 5: owner feedback on the characters
Owner feedback: characters looked "like skeletons / dead bodies", moved "like ancient homosapiens", and Abel's face and outfit didn't match. The owner supplied a reference photo.

Root causes found by measurement, not guesswork:
1. **"Caveman" movement.** The animation transfer was exact: a per-bone check gave 0 deg error. The *source* Quaternius clips are stylised (wide stance, bent knees). Replaced locomotion and standing idle with **CMU motion capture of real people** (`blender/scripts/mocap.py`):
   - seamless loop extraction (loop error < 1 for every clip)
   - heading correction, in-place root
   - native speeds: walk 1.33, slow 1.04, jog 3.04, run 3.75 m/s
   - BVH quirk fixed: in the CMU T-pose the hand bones point straight up, which bent every wrist 90 deg. Hands and toes now inherit their parent's alignment.
2. **Gesture clips** (phone, talking, folded arms, nod) keep the UAL upper body over **mocap legs**, combined at runtime (`src/systems/characters.ts`).
3. **"Dead body" look.** Hair, brow and lash cards were exported as **JPEG, which drops alpha**, so they rendered as solid dark slabs over faces. Now exported with alpha (AUTO). At runtime, cut-out cards alpha-test and everything else is forced opaque.
4. **Skin poking through clothes**: body skin hidden under garments is culled (ray test, below the neck only).
5. **Abel's look from the reference photo** (`blender/scripts/abel_look.py`):
   - brown tweed jacket (suit re-dyed per UV island), charcoal trousers, white shirt, dark brown tie
   - white pocket square, camel flat cap, round metal glasses, beaded bracelet
   - circle beard (moustache + mouth corners + chin) as a soft alpha stubble shell, shaped to the measured chin point
   - rounder, fuller face targets, skin lightened to medium brown, hair refit after face shaping
   - **Still a stand-in, not the exact likeness: that needs the SPEC 5.5 capture session.**
6. **Pedestrian variety** (`blender/scripts/npc_look.py`):
   - mama mboga and auntie: blouse and skirt with kitenge headwraps
   - student: bottle-green and grey school uniform with short cropped hair
   - boda rider: hi-vis reflective vest (skinned with the garment's weights)
   - elder: shirt and trousers instead of duplicate overalls
7. Preview renders now hide the glTF importer's 1 m bone-shape sphere, which had faked a "black face" in early checks.

**Budgets:** Abel 1.80 MB; pedestrians 0.51-0.59 MB.

**Tests:** smoke 6/7. The 30 deg ramp check climbed to 3.51 m but ran out of time at about 10 FPS under software GL; it passes at normal speed. Physics, audit and build pass. In-game screenshots are in `research/visual-tests/v4-mocap-abel/`.

## Session 4b: people (VISUAL_OVERHAUL V7, first pass)
**Characters**
- MPFB2 (MakeHuman for Blender) installed as a Blender extension, plus the MakeHuman CC0 system assets.
- `blender/scripts/build_humans.py` builds characters headless from data: phenotype, African skin set, eyes, brows, hair, clothes, shoes, and the `game_engine` rig.
- **Abel stand-in**: a man of about 38, sturdy build, short black hair, shirt, jeans and shoes. It stays a stand-in until the SPEC 5.5 capture.
- **8 pedestrians**: mama mboga, hustler, office worker, student, elder, young woman, worker, auntie.

**Animations**
- Quaternius Universal Animation Library 1 + 2 (CC0), retargeted by `blender/scripts/retarget.py`. It aligns rest directions per bone and transfers rotation deltas, scaling pelvis motion by leg length.
- Abel has 27 clips: idle, walk, jog, sprint, jump, sit, phone, talk, carry, climb, dance and others. No combat clips.
- Pedestrians have 9 clips each.
- Verified with pose renders (`check_anims.py`) and a lineup (`check_lineup.py`).

**Optimisation**
- Pedestrians are simplified with meshoptimizer, which preserves UV seams. Blender's decimation at 17% shattered the textures and was rejected after the lineup check.
- Static animation channels are stripped and keys resampled.
- Pedestrians drop normal maps.
- Sizes: Abel 1.93 MB (budget 2.5); each pedestrian 0.54-0.58 MB (budget 0.6).

**Runtime**
- `AbelModel.tsx`: the clip follows real ground speed, with playback scaled to it so feet don't slide. Jump states are handled, and idle personality kicks in after 10 s (folded arms, phone, talking).
- `Pedestrians.tsx`:
  - **Walkers** stroll under the verandas and step aside for Abel.
  - **Standers** wait at kiosks and shops, then turn and nod "Yes" when Abel passes.
  - **Sitters** use the chairs.
  - Every pedestrian has a kinematic capsule collider.
  - Pool sizes: low 10, mid 18, high 28. Only people near the camera animate.

**Tests**
- Typecheck, build, collider audit and physics all pass.
- Smoke test: 5/7. The 2 "did not move far enough" checks ran at 1-4 FPS. A CPU profile showed the page main thread **56% idle**, so the cost is SwiftShader (software GPU) competing with other processes (CPU at 87%: the user's Chrome tab, a VS Code update). This is an environment limit, not game code, but **real-device numbers are still needed**.

**Honest gaps**
- First load is now about **15 MB**: JS 1.2, kits 6.1, textures 1.6, characters 6.5. That's over the SPEC 10 MB target. Fix: load pedestrians and far kit LODs after "Tap to enter" (progressive streaming, V10).
- Character materials: each person costs 5-7 draw calls. Atlasing is needed before larger crowds.
- No vehicles yet (V8). Abel is a stand-in, not the likeness (SPEC 5.5).

## Session 3: auto-updating episodes, real-world references, visual overhaul started

### Episodes update automatically
| Situation | How it's handled | Status |
|---|---|---|
| Video **removed or privated** | `isAvailable()` asks YouTube oEmbed (CORS-enabled, 404 = gone) right before a video is shown or played; cached 24 h | Tested: real ID available, fake ID hidden |
| **New upload** | `api/latest-episodes.ts` (Vercel Edge function, no API key) reads the channel feed; the game merges new uploads into `content.json` | Tested locally: merged 2 new videos live (644 total). Works on any host once deployed |
| **Full refresh** | `.github/workflows/refresh-episodes.yml` reruns `tools/fetch-episodes.py` daily at 06:00 Nairobi and commits changes; the host redeploys | Needs the repo on GitHub plus a host |

The same `/api/latest-episodes` handler is mounted in `vite dev`/`vite preview` (vite.config.ts), so it works locally too.

### Real-world reference library
- `tools/fetch-references.py`: about 90 freely licensed Wikimedia Commons photos across 9 topics: kiosks, informal settlement, Kibera railway, matatus, boda boda, CBD streets, markets, roads, landmarks. Attribution is in each folder's `SOURCES.md`. They are study only (photos are git-ignored and re-downloadable).
- `tools/sample-palettes.py` produces `research/visual-references/PALETTES.md`, colours measured from the photos. Key findings:
  - Real murram is pale dusty tan (`#CDB596`), not saturated red.
  - Sunlit tarmac reads pale grey.
  - Kibera roofs are rust-brown and bleached.
  - Kiosk red is `#AF3339` / `#9F1F29`.

### Visual overhaul (VISUAL_OVERHAUL_SPEC.md, the owner's brief saved in the repo)
- `VISUAL_AUDIT.md`: 5 critical, 8 high, 5 medium and 1 low finding, with causes, files, fixes and perf impact.
- `VISUAL_OVERHAUL_PLAN.md`: milestones V1-V11, each done only when it works, passes the realism gate and stays performant.
- **V1 rendering foundation (first pass):**
  - Sky-matched IBL with a warm murram ground bounce (fixes black metal roofs and black shade).
  - Tiered post-processing: N8AO, SMAA, light bloom and vignette, AgX.
  - Shadows: 4096 on high, texel-snapped to stop shimmer.
  - Haze-coloured aerial fog; the test course is hidden unless `?testcourse`.
- **V2 ground and road (first pass):**
  - PBR murram (ambientCG CC0, KTX2) tinted to measured colours, with two-scale anti-tiling and macro variation.
  - Worn red-brown paths and grass patches from a mask generated from the hub layout.
  - Bleached PBR asphalt with edge dust, wheel tracks and worn dashes.
- **V3 real Nairobi kiosk (first pass)**, rebuilt from the photos:
  - welded steel box with a canted front
  - wire-mesh hatch, vent perforations, price-circle stickers
  - raised sign box, painted side brand, posters
  - stocked shelves, mabati lean-to, broken slab
  - fictional brands: "MAMA WANJIKU KIOSK / SODA BARIDI" and "PESA HARAKA AGENT"
- Visual regression baselines: `research/visual-tests/v0-before-overhaul/` and `v1-lighting-ground/` (`node tools/visual-tests.mjs <label>`, fixed cameras via `?cam=`).

### Session 3 tests and budgets
- Typecheck and build pass. Smoke test 7/7, physics pass, collider audit pass, hub_kit 3.30 MB.
- Whole-frame budgets (now counting shadow and post passes; the overlay previously undercounted with post-processing on):

  | Tier | Draw calls (budget) | Triangles (budget) |
  |---|---|---|
  | Low | 168 (250) | 225k (400k) |
  | Mid | 231 (500) | 316k (1.2M) |
  | High | 246 (900) | 429k (3M) |

- First load is now about 6.2 MB: JS 1.2 + kit 3.3 + ground/road textures 1.6 (budget 10 MB).

### Honest status against the overhaul bar
Better lit and grounded, but **not yet game-quality**. Still missing:
- people, vehicles and trees
- terraced housing and an organic layout
- cables and clutter
- a horizon
- a real character

Those are V4-V8. Known limitation: vertex-colour grime can only darken, so dust doesn't show on red paint. That needs the shader dust layer in the material library.


## Session 2: what was finished

### Corrections confirmed by Abel's team (now in SPEC.md and research/abel-dossier.md)
- First Kenya National Theatre recording (29 May 2021): about **250** attendees, not 300.
- Makosa Ni Yangu premiere (Oct 2024): about **6,000** attendees, a new record.
- YouTube handle: **@mkurugenziii** (three i's). Channel ID `UC4tjY2tTltEKePusozUxtSA`.

### Real episode list
- `tools/fetch-episodes.py` reads **metadata only** from the official channel (yt-dlp `--flat-playlist`; no video downloaded or re-hosted) and writes `public/content/content.json`.
- **642 episodes:**

  | Show | Count |
  |---|---|
  | Mkurugenzi Minisodes | 216 |
  | Headline Hitters | 147 |
  | Young and Stupid | 133 |
  | Mkurugenzi Diastories | 52 |
  | Other stories | 38 |
  | Celebrity First Encounters | 23 |
  | Stories of My Life | 13 |
  | Live streams | 10 |
  | The Play House | 9 |
  | Shorts | 1 |

- Every episode has its season and episode number parsed from the title.
- Four home-purchase vlogs are excluded (SPEC 2.5 privacy).
- Featured video for the Arena Show: "A Milli, A Milli..." (the 1M celebration stream). The Makosa Ni Yangu trailer ID is linked to its film entry.
- To refresh later: `pip install yt-dlp && python tools/fetch-episodes.py`.

### Phase 0 closed: Blender pipeline verified end to end
- Blender **4.5.10 LTS** installed (winget). KTX-Software **4.4.2** installed (signed official installer).
- `make_test_building.py`: kiosk, then LODs, colliders and export, then `optimize-assets` and `collider-audit`. All pass.
- Fixed in the scripts: missing `__file__` when chaining scripts; decimating tiny meshes; invalid meshes after decimation (`validate()`).

### Phase 1 started: realistic hub kit built in Blender
`blender/scripts/build_hub_kit.py` builds ten real-scale pieces from the hub research. Each has hand-made LOD0/1/2 and a collider:

| Piece | LOD0 / LOD1 / LOD2 tris |
|---|---|
| shack_mabati_green / blue / mud_plaster | ~1,200 / 112-132 / 48 |
| kiosk_pesa ("PESA HARAKA") / kiosk_duka ("DUKA LA MAMA") | 2,432-3,156 / 640-672 / 208 |
| block_flat (3 storeys, balconies, washing, roof tanks) | 5,912 / 856 / 464 |
| power_pole, water_tank, jerrican, plastic_chair | decimated, all < 250 |

- Real corrugated geometry on LOD0 roofs. Roofs are held down with stones and tyres. Doors and shutters are timber, windows grilled, and the signs are lettered in 3D.
- Weathering is in vertex colours: red murram dust at wall bases, grime, and rust patches on mabati. three.js multiplies it into the base colour, and the Blender preview now does the same, so renders are honest.
- PBR textures are CC0 from ambientCG (`node tools/fetch-textures.mjs`), all logged in ASSETS.md.
- One shared `hub_kit.glb`: **3.17 MB** (budget 4 MB), with KTX2 textures (ETC1S colour, UASTC normals at 512 px per the SPEC 5.1 texel density) and meshopt geometry.
- Runtime:
  - `useKit` reads the kit (KTX2 + meshopt).
  - `KitInstances` draws every placement with GPU instancing. Instances are re-bucketed into LODs by camera distance at up to 4 Hz with no per-frame allocation. LOD distances depend on tier (low 18/70 m, mid 25/90 m, high 35/110 m).
  - One box or convex-hull collider per placement.
- `src/districts/hub/layout.ts`: a market lane (x = 0) lined with kiosks, chairs and jerricans; block flats facing the avenue (x = 14); dense shack fields with 1 m footpaths, E-W paths and water tanks.
  - About 900 placements.
  - Kept clear: spawn plaza, test course, avenue and matatu stage.

## Test results (session 2)
| Test | Result |
|---|---|
| typecheck / build | pass |
| `npm run test:physics` | pass |
| `npm run test:smoke` (7 checks, incl. walking into a real hub kiosk) | **all pass**, no runtime errors |
| `assets:optimize` / `assets:audit` | hub_kit 3.17 MB OK / PASS |
| Budget check, low tier (software GL) | 110-139 draw calls (budget 250); 114k-187k tris (budget 400k) |
| Budget check, high tier | 137 calls (900), 435k tris (3M) |

Problems found and fixed during testing:
- Automatic decimation left LOD1 shacks at 1,441 tris, which put the low tier at **1.4M tris**. Hand-made LODs fixed it (LOD1 112, LOD2 48).
- Wall UVs were streaked: bmesh normals were not updated before projection.
- The texture set I first used for roofs (CorrugatedSteel008A) turned out to be yellow paint. Replaced with weathered galvanised 005 plus vertex-colour rust.
- The kit preload ran before the renderer existed, so the KTX2 loader was missing and loading failed.
- The kiosk test gave a false PASS: strafing curves the path because of camera auto-recentre. It now walks straight into the kiosk side.
- `?minimal` now keeps all colliders but skips district rendering, so physics tests run at usable FPS under software GL.

## How to benchmark (needs real devices; software GL numbers are meaningless)
**Desktop / laptop:**
1. `npm run build && npx vite preview --port 4173`
2. Open `http://localhost:4173/?benchmark&perf` and click **Tap to enter**.
3. Don't touch anything for about 35 s. A box appears with the results (avgFps, low1Fps, worstFrameMs, hitches, maxCalls, maxTris). Press **Copy** and paste it to Claude.

**Android phone (same Wi-Fi as this PC):**
1. On the PC: `npm run serve:phone`. If Windows Firewall asks, allow Node.js on **Private networks**.
2. On the phone's Chrome: open `http://192.168.0.109:4173/?benchmark&perf` (the PC's Wi-Fi address on 2026-10-08; run `ipconfig` if it changes).
3. Tap **Tap to enter**, leave the phone alone for about 35 s, press **Copy**, and send the text.

## Deviations from SPEC (with reasons)
- React 19 instead of 18 (R3F 9 requires it). TypeScript 5.9 instead of 7.0.
- Camera collision uses Rapier raycasts (cheaper with simple colliders). three-mesh-bvh is reserved for interaction.
- Kit pieces ship as one shared GLB per district kit (shared textures) rather than per-cell chunks; per-cell placement streaming comes with Phase 2 streaming.

## Placeholders
- Abel's character is a capsule proxy; it waits on the capture pipeline (SPEC 5.5).
- Ground, tarmac and kerb are still procedural canvas textures (to be replaced with KTX2 PBR).
- The merch URL, contact email and podcast links in content.json are empty (need Abel's team).
- Time of day is fixed at 16:45. Post-processing is not added yet. The thumbnail and outfit study is not done.

## Open issues and next realism pass (honest reality check of the hub screenshots)
1. No people, animals or traffic yet. The street reads empty (NPCs are Phase 1).
2. No overhead wires between poles, no washing lines between shacks, no posters, no open drains, no litter.
3. Kiosk rows are too evenly spaced; shacks need more variety (2-room shacks, lean-tos, fences, extensions).
4. Shack walls are still cleaner than real Kibera mabati. Push the dust and rust further and add water stains.
5. All ~900 placements are always loaded; they still need splitting per streaming cell.
6. Draw calls: about 130 on low tier with nothing else in the scene. NPCs and traffic will need a material atlas to stay under 250.
7. `npm audit`: 3 high-severity advisories in `braces`/`micromatch`, which come only through the local `@gltf-transform/cli` dev tool. They never ship and only see our own glob patterns. Revisit when gltf-transform updates.
8. Real-device benchmarks are still pending (see "How to benchmark").

## Exact next step
Per VISUAL_OVERHAUL_SPEC, no new gameplay until the visual foundation passes:
1. **V4:** a row-house generator in Blender (terraced rooms, shared rust-brown roofs, patchwork walls) and an organic curved-alley layout matching the Kibera photos.
2. **V5:** catenary cables and service drops, plus the clutter kit.
3. **V6:** real trees with impostors, grass cards, and the horizon layer.
4. Real-device benchmark numbers are still needed (see "How to benchmark").
