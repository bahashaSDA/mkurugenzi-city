# PROGRESS

_Last updated: 2026-10-08 (session 1)_

## Finished

### Phase R: research (hub scope)
- `research/abel-dossier.md`: verified timeline with sources and the privacy filter applied. **Two corrections to SPEC section 2:**
  - The first live recording at the Kenya National Theatre (29 May 2021) had about **250** attendees, not 300 (Abel's own post).
  - **Makosa Ni Yangu premiere (Oct 2024): about 6,000 attendees.** This is newer and bigger than the Click Click Bang record and is not in the spec.
- The YouTube handle is **@mkurugenziii** (three i's) per trackers; the spec says `@Mkurugenzii`. Confirm with Abel's team.
- `research/references/`: hub, vehicles, people-and-clothing, street-furniture, nature, sounds. `research/style-guide.md` holds the palettes, fonts and fictional brand list.

### Phase 0: foundation (mostly done)
- Vite 8 + React 19 + TS strict + R3F 9 + drei + Rapier, with zustand state.
- Quality tiers (detect-gpu, `?tier=` override), SPEC section 1 budgets in `src/perf/budgets.ts`, WebGL2 check, and a fallback 2D page.
- Perf overlay (dev, or `?perf`): FPS, draw calls, triangles, memory, >50 ms hitches; turns red when over budget.
- `?benchmark`: 30 s fixed camera path; logs average FPS, 1% low, worst frame, hitches, and max calls/tris; prints JSON and sets `window.__benchmark`.
- Adaptive quality: DPR steps down 0.25 at a time (min 0.75) after 3 s under target, then the tier drops; it steps back up after 10 s comfortably above target.
- Player: Rapier kinematic character controller (45° max slope, 0.35 m autostep, snap to ground, pushes dynamic bodies), walk/run/sprint/jump, GTA-style third-person camera with collision raycast, auto-recentre after 2 s and pull-out when sprinting, `V` for first person, gamepad support.
- Mobile: virtual joystick, right-side drag to look, RUN and JUMP buttons, safe areas.
- Streaming skeleton: 200 m cells at 4 Hz, tier radius; `<StreamedCell>` mounts and unmounts content (the spawn letters use it).
- Test map: heightfield ground, avenue with painted kerbs, walls, a 0.30 m and a 0.45 m step block, stairs, 30° and 55° ramps, instanced power poles, and two procedural mabati-shack rows (2 draw calls each).
- Knock-over **MKURUGENZI** letters (physics) that glide home 30 s after being knocked over.
- Splash screen with the matatu-route progress bar and "Tap to enter".
- Asset pipeline:
  - Blender scripts: `generate_lods`, `make_colliders`, `bake_lighting`, `export_district`, and a `make_test_building` end-to-end test.
  - Node tools: `optimize-assets.mjs` (meshopt, resize, KTX2 when `toktx` is present, budget gate) and `collider-audit.mjs`.

## Test results (session 1)
| Test | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run build` | pass. First-load JS is about **1.2 MB gzip** (Rapier WASM is about 1.1 MB of that); budget is 10 MB |
| `npm run test:physics` | pass (sprint min height 0.853 vs rest 0.870) |
| `npm run test:smoke` (headless Chromium, 6 checks) | **all pass**: wall holds, 0.30 m step climbs, 0.45 m block stops, 55° blocked, 30° climbable, no runtime errors |
| optimize + audit on a synthetic GLB | optimize OK; audit correctly flags a missing collider and exempts `no_collider` |
| Real-device benchmark | **not run yet.** Needs a human with a desktop GPU and a mid-range Android (`/?benchmark&perf`) |

Smoke-test FPS figures come from software rendering (SwiftShader) and say nothing about real performance.

## Bug found and fixed this session
The player sank about 17 cm into the ground while walking. Root cause: Rapier's shape casts lose precision against a single 1.6 km cuboid. Fixes:
- The ground is now a heightfield (exact, and ready for terrain).
- Long kerbs and boundary walls are split into short segments.
- The rule is written in `TestMap.tsx`; `tools/test-character-controller.mjs` guards against regressions.

## Deviations from SPEC (with reasons)
- **React 19 instead of 18.** R3F 9 (current) requires React 19.
- **TypeScript 5.9 instead of 7.0.** 7.0 is the brand-new native compiler; 5.9 is pinned for stable tooling.
- **Camera collision uses Rapier raycasts instead of three-mesh-bvh.** Colliders are simple shapes, so this is cheaper. three-mesh-bvh is installed and reserved for interaction raycasts against render meshes.

## Placeholders
- Abel's character is a capsule proxy (dark body, yellow chest stripe). It waits on the capture pipeline in SPEC 5.5.
- Textures are procedural canvas textures. They get replaced by KTX2 PBR sets (Poly Haven / ambientCG) in Phase 1.
- `content.json` episode IDs are `PLACEHOLDER_1/2`. They need real YouTube IDs, the merch URL and the contact email.
- The time of day is fixed at 16:45. The 24-minute day cycle comes in Phase 1 (`src/world/sun.ts` already has Nairobi solar geometry).
- Post-processing (SMAA, bloom, N8AO) is not added yet; tone mapping only (AgX).
- The thumbnail and outfit study for Abel is not done. Research tools couldn't view images; needs supplied channel art or a human pass.

## Open issues and blockers
1. **Blender is not installed.** The bpy scripts are syntax-checked but unrun. Install Blender 4.x, then run `blender -b --factory-startup -P blender/scripts/make_test_building.py -- --out public/models/raw`, then `npm run assets:optimize` and `npm run assets:audit`. This is the last Phase 0 item.
2. **KTX-Software (`toktx`) is not installed.** Without it the optimiser keeps PNG/JPEG.
3. Real-device benchmarks are needed for the Phase 0 "60 FPS desktop / 30+ mid-range Android" definition of done.
4. Phase R reference files exist only for the hub. Other districts get theirs before their phase (SPEC 16).

## How to run
```
npm install
npm run dev                      # http://localhost:5173  (perf overlay on in dev)
npm run build && npx vite preview --port 4173
# URL flags: ?perf  ?benchmark  ?tier=low|mid|high  ?spawn=x,z  ?debug
npm run test:physics
npx playwright install chromium && npm run test:smoke   # needs preview running on :4173
```

## Exact next step
Install Blender and run the pipeline test (open issue 1) to close Phase 0. Then run `?benchmark` on a desktop and a mid-range Android and log the numbers here. Then start **Phase 1**: hub terrain and layout from `research/references/hub-mtaa-wa-mkurugenzi.md`, then the Kibanda Video Hall with the YouTube modal.
