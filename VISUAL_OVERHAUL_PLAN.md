# VISUAL OVERHAUL PLAN

Follows VISUAL_OVERHAUL_SPEC section 63. Each milestone is **done only when it works, passes the realism gate (side by side with the reference photos in `research/visual-references/`) and stays within the tier budgets.** Each milestone ends with a fixed-camera capture: `node tools/visual-tests.mjs v<N>-<name>`.

| # | Milestone | Fixes audit items | Status |
|---|---|---|---|
| V1 | **Rendering foundation:** sky-matched IBL, tiered post-processing (SMAA/N8AO/bloom/vignette, AgX), softer and denser shadows, aerial fog, exposure, dev geometry hidden | C1, H6, H7, H8, M1 | first pass done (session 3). Open: cascaded shadows, exposure for other times of day |
| V2 | **Ground and road materials:** measured-palette PBR murram with macro variation and worn paths, sun-bleached PBR asphalt, weathered kerbs | C2, H4, L1 | first pass done (session 3). Open: decals (cracks, potholes, oil), kerb weathering, terrain relief |
| V3 | **Real kiosk:** steel-box construction from the Nairobi photos, fictional brands, poster and decal system | H1, M2 | first pass done (session 3). Open: dust that lightens paint (shader dust layer), dents, real goods meshes, printed-poster textures |
| V4 | **Row-house generator and organic layout:** terraced rooms, shared rusty roofs, patchwork walls, curved alleys | H2, H3 | |
| V5 | **Utility cables and clutter kit:** catenary wires, service drops, buckets, washing lines, crates, umbrellas, bins, charcoal sacks | H5, M3 | |
| V6 | **Vegetation and horizon:** real trees (jacaranda in bloom, eucalyptus, street trees) with impostors and wind; grass cards; skyline and hills layer; tighter natural boundary | C3 | |
| V7 | **Human characters:** MPFB2 realistic temporary Abel and an NPC base set, rigged, idle/walk/run blended, foot IK | C4 | |
| V8 | **Life:** NPC crowds with behaviours, boda bodas, hero matatu, traffic on the left | C5 | |
| V9 | **Time of day:** 24-minute day, real night lighting, rain | - | |
| V10 | **Streaming and LOD v2:** per-cell placement streaming, predictive loading, LOD cross-fade, impostors | M5 | |
| V11 | **Profiling and regression:** real-device benchmarks on all tiers, visual regression set (day, sunset, night) | - | |

Rule: no new gameplay features until V1-V8 pass the realism gate.

## Honest limits (browser platform)
- GTA V's raw detail is not reachable in WebGL on Kenyan mid-range phones. We aim for GTA-style *believability* where the player looks: up close, at street level, in the first 30 seconds.
- "Pixel-perfect" copies of real places are neither possible nor allowed. The photos are CC-BY-SA and others' work; we may study them but not copy them as textures. We match measured proportions, construction, materials, colours and clutter instead.
- Realistic humans need source models: MPFB2 (CC0 bodies), Mixamo or Quaternius animations, and the approved Abel capture session.
