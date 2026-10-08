# PROGRESS

_Last updated: 2026-10-08 (session 2)_

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
Send the benchmark numbers. Then Phase 1 continues:
1. Kibanda Video Hall (Blender hero building) with the VHS shelf wired to the 642 real episodes and the YouTube IFrame modal.
2. Overhead wires, posters and drains, plus the realism pass on the kit.
3. Street NPCs and boda bodas.
