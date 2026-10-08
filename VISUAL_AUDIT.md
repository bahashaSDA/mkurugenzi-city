# VISUAL AUDIT: Mkurugenzi City (2026-10-08)

Method:
- Ran the build and captured fixed-camera screenshots in `research/visual-tests/v0-before-overhaul/` (hub street, wide, shack alley, avenue, kiosk close-up, character).
- Compared them against about 90 freely licensed Nairobi reference photos in `research/visual-references/`.
- Measured real colours from those photos (`research/visual-references/PALETTES.md`).
- Profiled draw calls and triangles per tier.

**Verdict: the current build fails the VISUAL_OVERHAUL_SPEC quality bar. It reads as a Three.js demo.** The Blender kit pieces are a reasonable start up close in Blender renders, but in-game the lighting, ground, layout and missing life make the whole scene look fake.

Performance baseline (software GL, so look at calls and tris only):

| Tier | Draw calls (budget) | Triangles (budget) |
|---|---|---|
| Low | 110-139 (250) | 114k-187k (400k) |
| High | 137 (900) | 435k (3M) |

There is headroom for quality.

## Findings
Each finding gives the problem, why it looks fake, the affected files, the fix, the perf impact and the priority.

### C1. No environment lighting (IBL)
- **Problem:** Metal roofs render near black and shaded walls go black-green. There is a hemisphere light but no environment map.
- **Why fake:** PBR metals reflect their surroundings; with nothing to reflect they turn black. Real galvanised roofs read bright grey from the sky. Shade in Nairobi is filled by bright sky light.
- **Files:** `src/world/Environment.tsx`
- **Fix:** Sky-matched image-based lighting. The live sky is rendered into a low-res environment cube with a warm ground bounce, and it follows time of day.
- **Perf:** one small cube render at start and on time changes. **Priority: CRITICAL**

### C2. Ground is one saturated red texture to the horizon
- **Problem:** The plane is uniform `#9C4A2A` with tiny pebbles, has no macro variation and is perfectly flat.
- **Why fake:** Measured Nairobi roadside murram is pale dusty tan (`#CDB596` to `#D7BE9E`). Red-brown (`#B88F73`) appears mainly on worn paths and wet ground. Real ground has paths, ruts, grass patches, litter and slopes. Visible tiling and uniformity scream "game plane".
- **Files:** `src/districts/testmap/TestMap.tsx`, `src/world/proceduralTextures.ts`
- **Fix:**
  - PBR soil (ambientCG CC0) in the measured palette, with large-scale variation to break tiling.
  - Darker worn paths, grass and dirt transitions.
  - Later, real heightfield terrain with drainage.
- **Perf:** +2 textures, shader noise. **Priority: CRITICAL**

### C3. Endless empty plain, no skyline, no vegetation
- **Problem:** Past the shacks the world is empty red ground meeting a white haze. There are no trees, hills or distant city.
- **Why fake:** Every Nairobi photo is framed by trees (green canopy `#264750` to `#98AD85`) and buildings. Emptiness to the horizon is the strongest "demo" signal.
- **Files:** world layout, skybox
- **Fix:**
  - Cylindrical distant skyline and hills layer (SPEC 6).
  - Real tree assets (jacaranda, eucalyptus, Nandi flame, neem-like street trees) with LODs and impostors.
  - Shrink the playable hub boundary with natural edges.
- **Perf:** impostors and instancing. **Priority: CRITICAL**

### C4. Player is a capsule
- **Problem:** A black capsule with a sphere head.
- **Fix:** A temporary realistic human (MPFB2/MakeHuman in Blender: proper body, clothing, hair cards, rigged with idle/walk/run). The final Abel likeness follows the capture pipeline (SPEC 5.5).
- **Perf:** about 15-25k tris and 1 skinned mesh. **Priority: CRITICAL**

### C5. Streets are empty: no people, vehicles or motion
- **Fix:** Instanced, animated NPC crowds (MPFB2 bases with 40+ variants), boda bodas, matatus, parked cars, chickens and dogs; steam and smoke.
- **Perf:** must use GPU skinning and impostors at distance. **Priority: CRITICAL**

### H1. Kiosks are the wrong archetype
- **Problem:** Plastered hut with vertical bars and a flat board.
- **Reality (photos: Argwings Kodhek Rd, Tigoni Rd, Chaka Rd):**
  - welded steel-sheet box in one strong colour (measured red `#AF3339` / `#9F1F29`)
  - canted lower front panel, perforated vent strip along the top
  - welded-wire mesh hatch, price-circle stickers and glued posters
  - a separate overhanging sign box, a mabati lean-to at the back
  - sits on a broken concrete slab, with stools, umbrellas and a bin beside it
- **Files:** `blender/scripts/build_hub_kit.py`
- **Fix:** Rebuild the kiosk to that construction with fictional brands, plus a decal and poster system.
- **Perf:** same tris. **Priority: HIGH**

### H2. Housing reads as isolated cubes on a grid
- **Problem:** Each shack is a free-standing 3 x 3 m box in a regular grid.
- **Reality (photos: Kibera rooftops, riparian Kibra, railway):**
  - long terraced rows of rooms (10-20 m) under shared, mostly **rusty orange-brown** roofs (measured `#524634`, `#93846D`, bleached `#D3C6B0`)
  - pitched and gabled as well as mono-pitch roofs
  - patchwork walls (rusted, green, blue and white sheets, mud, timber, concrete block)
  - irregular plots, alleys 1 m wide, washing lines, buckets, drains
- **Files:** `build_hub_kit.py`, `src/districts/hub/layout.ts`
- **Fix:**
  - A modular row-house generator (rooms snap into rows of 3-6, roofs merge, wall panels mix materials).
  - An organic layout along curved paths instead of a grid.
- **Perf:** fewer, larger meshes means fewer instances. **Priority: HIGH**

### H3. Roofs look uniform grey or black
- **Problem:** One galvanised texture with sparse rust patches.
- **Fix:** Rust-dominant roof materials in the measured palette, sheet-by-sheet colour variation (vertex colour per sheet), overlapping sheets and edge sag.
- **Priority: HIGH**

### H4. Tarmac is dark and featureless
- **Problem:** Near-black procedural texture.
- **Reality:** Sunlit Nairobi tarmac reads pale grey (`#C6C7C0`), with patches, cracks, oil, dusty edges and faded markings.
- **Fix:** PBR asphalt with decals for patches, cracks and potholes, plus dust edge blending.
- **Priority: HIGH**

### H5. No overhead cables
- **Reality:** Every reference photo has dense tangled cables between timber poles.
- **Fix:** Catenary cable generator (instanced thin tubes between pole tops plus random service drops to roofs).
- **Perf:** cheap. **Priority: HIGH**

### H6. Development geometry visible in the hub
- **Problem:** The Phase 0 test course (grey walls, stairs, ramps) sits next to the spawn.
- **Fix:** Only render and load it with `?testcourse` (tests pass that flag).
- **Priority: HIGH**

### H7. No post-processing
- **Problem:** No AO, AA, bloom or grading. Contact points look disconnected and edges alias.
- **Fix:** Tiered post-processing:
  - LOW: tone mapping only
  - MID: SMAA and light bloom
  - HIGH: N8AO, SMAA, bloom, subtle vignette
  - ULTRA: higher AO quality
- **Perf:** HIGH tier only. **Priority: HIGH**

### H8. Hard, flat shadows with only one frustum
- **Fix:** Softer filtering, a larger map near the player, cascades (three CSM) on HIGH.
- **Priority: HIGH**

### M1. Fog and haze colour don't match the sky
- **Fix:** Aerial-perspective fog matched to the horizon colour, with a slight warm dust tint. **Priority: MEDIUM**

### M2. Walls still too clean
- **Fix:** Stronger vertex dust and rust, water-stain decals, posters and graffiti, handwritten signs. **Priority: MEDIUM**

### M3. Clutter missing
- **Problem:** No buckets, washing lines, crates, charcoal sacks, umbrellas or bins.
- **Fix:** Clutter kit plus placement rules per storytelling spot. **Priority: MEDIUM**

### M4. Spawn letters are bright untextured yellow
- **Fix:** Painted-steel material with chips and dust. **Priority: MEDIUM**

### M5. LOD pops
- **Fix:** Dithered cross-fade between LODs. **Priority: MEDIUM**

### L1. Kerb stripes look too crisp
- **Fix:** Weathered texture. **Priority: LOW**

## What is acceptable today
- Real-scale kit pieces with geometric corrugation, timber doors and grilles.
- The KTX2 and meshopt pipeline, instanced LOD system, collision and performance headroom.
- The episode content system.
