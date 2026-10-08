# PLAN: Mkurugenzi City

Source of truth: `SPEC.md`. This file is the build approach; `PROGRESS.md` is the live status.

## Guiding decisions
1. **Data-driven world.** District layouts, interactables and content live in `src/config/*` and `public/content/content.json`. Systems never hard-code places.
2. **Procedural first, authored later.** Until Blender assets exist, districts are assembled from procedural, instanced kit pieces (shacks, kiosks, poles) generated in code. Each kit piece has the **same interface** as a future GLB (render mesh + collider descriptor + LOD), so swapping in Blender exports changes data, not systems.
3. **One physics world (Rapier).** Kinematic character controller for the player; fixed colliders for static geometry (boxes/hulls only); dynamic bodies sleep when idle.
4. **Budgets enforced by code.** `src/perf/budgets.ts` holds the SPEC section 1 numbers; the dev overlay turns red when exceeded; `?benchmark` logs average and 1% low FPS.
5. **Zero per-frame allocation.** Scratch vectors at module scope; no `new` inside `useFrame`.

## Architecture
```
src/app        React shell: splash, HUD mount, fallback page
src/perf       tier detection (detect-gpu + WebGL2 check), budgets, adaptive DPR, overlay, benchmark
src/world      streaming grid (200 m cells), terrain, sky/day-night, roads
src/systems    player (controller + camera), input (keyboard/touch/gamepad), interaction, audio, save
src/districts  one folder per district: builds kit instances from config
src/ui         HUD, minimap, phone, prompts, video modal
src/config     world layout, district coordinates, quality presets
```

## Streaming
- Grid of 200 m cells over 1.6 km = 8 x 8 cells. A district registers which cells it occupies.
- Each frame (throttled to 4 Hz) the player cell is computed; cells within radius R (tier: low 1, mid 2, high 2) are requested; cells beyond R+1 are disposed.
- Phase 0 ships the skeleton (cell bookkeeping + debug view). Phase 2 adds worker-based GLB loading.

## Milestones
| # | Milestone | Status |
|---|---|---|
| R | Research: Abel dossier, hub refs, cross-cutting refs, style guide | done (hub only; other districts before each phase) |
| 0.1 | Vite + React + TS strict + R3F + Rapier scaffold, git | done |
| 0.2 | Quality tiers, budgets, perf overlay, `?benchmark` | done (real-device runs pending) |
| 0.3 | Player: kinematic controller, third-person camera with collision, first-person toggle, sprint/jump | done |
| 0.4 | Test map with solid walls, steps, slope, dynamic MKURUGENZI letters | done |
| 0.5 | Streaming skeleton | done |
| 0.6 | Blender headless scripts + gltf-transform pipeline + collider audit | scripts written; need Blender installed to run |
| 1.x | Hub dressing, video hall, NPCs, day-night, phone, minimap, mobile controls | next sessions |

## Risks
- **Blender is not installed on this machine**, so the scripted pipeline can't be verified yet.
- Abel's likeness depends on the capture session (SPEC 5.5); a temporary capsule/proxy is used until then.
- Real-device perf testing (Tecno/Infinix) needs a human with the phone; results go in PROGRESS.md.
