# PROGRESS

_Last updated: 2026-10-09 (session 9)_

## Session 9: the Sketchfab library (owner supplied the API token)
- Token stored in `.env.local` (gitignored). `tools/sketchfab-fetch.mjs` fetched 27 curated CC BY models (licence
  re-checked per model; credits in `sketchfab/CREDITS.md`, ASSETS.md and the in-game **Credits** panel).
- `build_real_kit.py` grew: auto paint-material detection, livery coverage control, texture fixes (the Hiace's
  Japanese shop lettering painted out in a cleaned copy), face-winding recalculation, ground-slab dropping,
  height scaling (buildings), a tree pipeline (leaf cards keep alpha as `foliage_*_alpha`, wind sway, far LODs
  thin cards, no morph targets), and `merge-kit.mjs` takes several prefixes.
- Vehicles now: Isuzu nganyas, Kenyan Ma3 minibus, VW Crafter + Toyota Hiace + graffiti matatus, two Sacco buses
  (repainted city bus), Golf, Corolla, Land Cruiser; bodas parked at every stage. Kits: `real_vehicles_kit.glb`
  6.1 MB + `real_vehicles2_kit.glb` 5.6 MB (stream after the splash).
- Buildings (`real_buildings_kit.glb`, 10.2 MB, 2K atlases): CBD towers (Co-op House, three glass offices) on the
  CBD avenue, apartment blocks and walk-up flats on the cross streets and in Phil-It / Freddie's towns, small
  mabati shops; flats and shops are enterable.
- Trees (`real_trees_kit.glb`, 5.5 MB): jacarandas in bloom on town streets, ~260 acacias over the savanna and
  the Storyteller's Fire hills, coconut and date palms on the beach (replacing the procedural palms).
- Rejected after review: Toyota Probox (broken source mesh), "Kenyan Bus/nganya" (too crude), the pickup (it was an
  armed "technical": no weapons), the petrol station (fell apart), red-brick NY block (not Nairobi).

## Session 8: realism, the coast, 200 missions, the Grand Theatre, fights (owner feedback round 3)
Owner asked: real (not cartoon) cars and buildings from Sketchfab; health and GTA swimming; a sea after the
beach; a GTA day/night clock with great ambience at every hour; a new splash over Abel videos; ~200 missions all
about Mkurugenzi (count hidden, harder but fair, KSh pay) with GTA-style cinematic briefings; a big, expensive
theatre with an audience and episodes on a 3D screen; fighting with injuries but no weapons (SPEC 8.6 amended).

**Done**
- Real vehicles (`blender/scripts/build_real_kit.py`, `tools/merge-kit.mjs`): the owner's Sketchfab Kenyan nganya
  (CC BY), VW Crafter matatu and VW Golf are decimated per part (painted panels get 3x the budget), hidden interior
  stripped, baked into one colour/roughness/metal atlas + glass + a sharp livery material; LODs drop small parts;
  colour variants share geometry. `real_vehicles_kit.glb` 5.2 MB (streams after the splash). Original airbrushed
  liveries (`tools/paint_real_liveries.py`). They replace every procedural matatu, nganya, bus and car.
- `tools/sketchfab-models.json` + `tools/sketchfab-fetch.mjs`: 30 curated free models (Hiace, Kenyan Ma3 minibus,
  Kenyan bus, Probox, Corolla, Land Cruiser, pickup, boda, walk-up flats, offices, towers, petrol station, cinema
  interior, acacia, jacaranda, palms, street lamps). Licence re-checked before download (CC BY / CC0 only).
  **Blocked on the owner's Sketchfab API token** (downloads need an account; search does not).
- Day/night (`world/clock.ts`, `Environment.tsx`): GTA V pace (1 game minute = 2 s, 48-minute day), real Nairobi
  sun path, moon, stars, night-blue sky, dusk/dawn colour keys for sky, fog and sun, IBL re-rendered every half
  hour, exposure adaptation; sodium/LED street lamps with halos and light pools (`StreetLights.tsx`); facade
  windows light up at night; signs and LEDs brighten; HUD clock. `?time=21.5&freeze` for tests.
- Coast (`config/coast.ts`): world 4 km; coast road, sand beach (ambientCG sand), curving shore, swimmable shelf,
  drop-off. `Ocean.tsx`: PBR sea with Gerstner swell + shoaling, depth colour, swash foam, whitecaps, ripples.
- Swimming (front crawl / treading water, body pitch, wave-height float), health (GTA bar under the radar, regen to
  50, food heals, fall damage, WASTED -> nearest hospital, KSh 500 bill, limp below 30).
- Mocap clips added without a full character rebuild (`blender/scripts/add_clips.py`, new `mocap.py` options):
  swim, boxing guard, jab/hook/cross, kick, knockdown, lying hurt, get up, limp (CMU). Pedestrians got the fight set.
- Fights (`systems/combat`): punch combos (LMB/R), kick (Q), guard (RMB/G), soft lock-on; pedestrians fight back or
  flee, bystanders scatter, knock-downs, lying hurt, getting up and limping away; mission opponents (red markers);
  car-jacking (F at the driver door of slow traffic: the driver runs or fights).
- Missions v2 (`game/missionData.ts`, `missions.ts`, `cutscene.ts`): 200 missions in 14 chapters of Abel's public
  story (privacy rules kept: no family, invented characters). Objectives: go, drive (timed), deliver, matatu, talk,
  watch, eat, scout, races, chases, fights, collect, swim to a buoy, golden-hour shots (time skip). Difficulty and
  pay ramp (KSh 400 -> ~8,400; finales x2; first 50 pay ~KSh 70,000). Only the next 3 givers are shown. Letterboxed
  briefings (orbit, over-the-shoulder, aerial fly-to-objective, reveal), yellow-highlighted objective line, timers,
  counters, MISSION PASSED/FAILED (E to retry), synthesised stingers.
- Grand Theatre (`districts/theatre`): 60 x 64 m in the CBD, limestone facade, glowing marquee, glass lobby, canopy,
  fly tower, ticket booth (KSh 50,000), corridors, 22 raked rows / 1,584 seats, proscenium, drapes, screen. Full
  house of baked seated crowd (skinned pose -> static, meshoptimizer-simplified, instanced: ~12 draw calls for ~700
  people). Sit in Row J and the episode plays on the 3D screen (YouTube embed); the sky light dims indoors.
- Splash v2: muted Mkurugenzi episode background (small 360p player scaled up, poster first; skipped on data-saver,
  2G/3G and automation), big time-based counter, cycling words, letter-by-letter title, curtain wipe.
- Buildings: photographic facade tiles (`tools/paint_facades_photo.py`: real brick/plaster/concrete with glass
  panes, curtains and dust) replace the illustrated upper floors, glass towers and houses in `town_kit.glb`.
- Map/radar: sea and beach, theatre and hospital icons; new discoverable areas.

**Honest gaps**
- Only 3 real vehicle models until the Sketchfab token arrives; buildings are still the procedural kit with better
  facades (real Sketchfab buildings are queued). Beach has no palms, kiosks or umbrellas yet; one mission step asks
  for a drink at "the beach kiosk", which has no shop yet.
- Sketchfab Standard licence (Crafter, Golf): fine inside the game, raw files must not be redistributed (gitignored).
- Software-GL tests take ~4 minutes to compile shaders; real-device performance with the ocean, theatre audience
  and new vehicles is not measured yet (`?benchmark`).
- The splash design is my interpretation: the owner's reference GIF did not come through (only its <img> tag).

## Session 7: GTA-style city life (owner feedback round 2)
Owner asked: fix boarding; eating view; enter any house; all GTA functions (fighting, stealing cars...),
missions with a map bottom-left; money in KSh; talk to people; many more people, ~90% in Mkurugenzi merch;
more towns far away; realistic cars you can enter and drive; matatu stages and waving; Kibera trees,
washing lines, poles, sewage and dirt; Abel's face closer to his photo; matatus/nganyas like the photos.

**Done (each verified in the browser by a test in tools/)**
- Boarding fixed (F was never wired) and matatu stages with shelters at every stop; E at a stage or H by any
  route waves one down; the conductor waits at the door. `tools/ride-test.mjs`: wave, board, ride 160 m, alight.
- KSh money everywhere; the boutique sells the real Mkurugenzi range at the shop's prices.
- Eating: Abel turns from the counter, camera swings round, food/drink in his hands, meals take several bites.
- Vehicles v2 from real side profiles: NTSA matatu, pimped HiAce, three graffiti nganyas with headboards, Sacco
  bus, four car types; see-through windows with seats and passengers inside.
- Driving (`tools/drive-test.mjs`): ~40 parked cars, F at the driver's door, raycast-vehicle physics, chase cam,
  speedometer, horn, handbrake, F to get out.
- World 3.2 km with five far towns (CBD + Mkurugenzi Tower, Wakurugenzi Arena, Phil-It Studios Town, Utafraaaia
  Estate, Freddie's School Town) and the Storyteller's Fire hill; 4 new matatu routes.
- Missions (7) with beacons, objective box, timer and KSh rewards; radar bottom-left; full map (M) with waypoint.
  `tools/mission-test.mjs`.
- Talk to anyone (E). Interiors: E at almost any door, furnished rooms, eat/drink, TV episodes, shop counters.
  `tools/interior-test.mjs`.
- Crowd: 12 merch fans (~90% of people), crowd texture atlases (2 draw calls per person).
- Kibera: trees, washing lines, litter, power lines with roof drops, open sewage drains, mud and ash.
- Abel face v2 (oval head, eyes, smile; 22-landmark thin-plate warp of the owner photo).

**Not done (decision needed / honest gaps)**
- Fighting and stealing cars: SPEC 8.6 says "no violence or damage systems"; waiting for the owner's decision.
- Performance (software-GL counts from `tools/perf-probe.mjs`, worst spot = market/mtaa; budgets in brackets):
  low 232-235 calls (250) / 0.5-0.69M tris (0.4M); mid 503-562 calls (500) / 1.2-1.57M tris (1.2M);
  high 677-757 calls (900) / 2.0-2.6M tris (3M). High passes; low passes on calls; mid and low triangles
  are over. Done this session: crowd texture atlases (2 calls per person), merged far LODs with GPU-averaged
  colours, merged roads/stages/median, NPC shadows by distance, tier terrain resolution. Next: lighter
  market produce at LOD0, collapse street/hub kit materials, then real-device `?benchmark` runs.

## Session 6: a bigger city to live in (market, Kibera, matatus, rocks, points)
Owner brief (19 photos): busy mama mboga market, buy and eat/drink with earned points, shops and food places,
Kibera like the rooftop photo, enterable homes, a big city with many roads and a highway, matatus and pimped
nganyas with fare, seats, standing, a maroon-uniformed conductor and loud bass music, rocky places, Abel's face from his photo.

**Done**
- Economy (`src/game/`): points (start 300; +2 per 100 m walked; +15 per new episode watched; +20 at video halls),
  27 items with prices (banana 10, chai 30, soda 60, chips 100, pilau 200, nyama choma 350...). Buy, then eat or drink now (GTA-style animation, fills the "shiba" bar) or take it away (bag, `I`).
- Market (52 x 52 m, 5 aisles of stalls with umbrellas, produce and price cards), kiosks, hoteli, butchery, boutique, chips booths: press `E` to shop.
- Kibera (west, on a 20 m hillside): ~2,000 terraced mabati rows squeezed back to back on 1.3 m alleys, matte rust roofs, murram lanes and the old railway path. Enterable homes (look around, walk out) and video halls that play Abel's episodes.
- Roads: avenue, Kibera Road, Stage Road, North Street, East Road, South Road, a dual-carriageway expressway with a median, and murram shortcuts. Terrain heights are graded flat under paved roads.
- Matatus, nganyas (3 pimped liveries, LED strips, loud bass), Sacco buses and cars on 3 routes with stops.
  `F` boards at the door when stopped; the conductor (maroon uniform) takes the fare; you sit or stand if it is full; `F` gets off at the next stop. Music is synthesised in the browser, never copied from YouTube.
- Rocky Ridge (south-east): broken hills, clusters of big crags and boulder fields (grey Rock030).
- Ambient crowd: a pool of people that follows Abel and respawns out of sight, at market stalls (mama mboga and buyers), Kibera doorways and alleys, kiosks and pavements.
- Abel's face is projected from the owner's photo (dev/demo only; see ASSETS.md).
- Fixes: road ribbons were back-face culled (wrong winding); Kibera roofs looked grey (too metallic); the smoke-test course got buried by the new hill (`?testcourse` now flattens a pad).

**Still to do (honest)**
- Shop interiors (kiosks and shops are served from outside); Utafraaaia shop interior.
- Matatu and bus riding is untested on real devices; check vehicle draw calls and Kibera triangle counts on a phone (`?benchmark`).
- Boda bodas, washing lines in Kibera alleys, more stalls clutter.

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
