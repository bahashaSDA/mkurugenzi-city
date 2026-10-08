# VISUAL OVERHAUL SPEC: GTA-style realism for Mkurugenzi City

Brief from the project owner, 2026-10-08. It is binding alongside SPEC.md. Every requirement is kept; long examples are condensed into lists. Section numbers match the original brief.

## Core rule
Stop thinking "3D website" and think "a small open-world game that runs in a browser". The reaction we want is "wait... this is running in a browser?", not "cool Three.js website". We match the believability, density, lighting, animation and camera language of GTA V and modern open-world games, adapted for WebGL. No GTA assets, maps, characters, branding, textures or code are copied.

## 1-4. Quality bar
- Reject anything that looks like a generic Three.js demo, low-poly, cartoon, toy, Blender viewport, primitive boxes as buildings, shiny plastic characters, flat-coloured roads, fake grass or trees, floating objects, simplistic NPCs, box cars, empty streets, perfectly clean buildings or artificial lighting.
- Required stack in every scene:
  - believable architecture, physically believable materials and weathering
  - real windows with interior depth
  - signage, street clutter and utility infrastructure
  - natural lighting, shadows, AO and atmosphere
  - realistic vegetation, terrain variation
  - animated pedestrians, real vehicles and traffic
- Primitive geometry is allowed only during development. It is never final art: no cube buildings, cylinder trees, capsule humans, box cars, plane roads, flat green grass, or primitive roofs, windows, fences, lights or furniture.
- Realism comes before size. Reduce map size, building count, NPC and vehicle count first. Do not reduce texture, material, character, detail, lighting, animation or atmosphere quality. Small but believable beats large but fake.

## 5-6. Scale and physicality
- 1 unit = 1 m. Human 1.6-1.9 m, door 2.0-2.2 m, car 4-5 m, matatu 5-8 m, lane 3-3.5 m, sidewalk 1.5-3 m, floor height 2.8-4 m. Never guess proportions.
- Environments need physical relationships: walls with window recesses, frames, glass, curtains, balconies, rain stains, dust, cracks, paint variation, pipes, cables, AC units, dishes, gutters, roof structures, doors, security grilles and signage, varied so nothing looks duplicated.

## 7-8. Buildings and materials
- Geometry:
  - bevels, real window recesses, doors with depth, balconies, overhangs
  - gutters, drainage, pillars, fences, stairs, railings
  - utility boxes, pipes, AC units, satellite dishes, rooftop tanks
- No grey-plastic concrete, silver-plastic metal, blue-plane glass or brown-geometry wood.
- Every material has base colour, roughness, normal detail, variation, dirt, wear, appropriate reflection and edge behaviour.
- Material library:
  - asphalt (dry and wet), concrete (dry, dirty, painted), old paint
  - corrugated iron, rusted metal, galvanised metal
  - glass (clean and dusty), wood, road markings
  - red murram, mud, grass, leaves
  - fabric, leather, plastic, rubber, chrome (clean and dirty)
  - skin, hair
- Imperfections are mandatory: scratches, dust, faded paint, water stains, rust, mud, chipped edges, grime, oil stains, tyre marks, faded markings, repairs, and roughness variation.

## 9-13. Nairobi identity, roads, terrain, vegetation, grass
- Distinctly Nairobi and Kenyan (never generic African or generic game city), built on the research files.
- **Tarmac:** roughness variation, patches, faded markings, cracks, potholes, tyre marks, oil, edge dust, drainage, kerbs, crossings, bumps, manholes and shoulders.
- **Murram:** red-brown soil, tyre grooves, footprints, stones, puddles when wet, edge vegetation, dust and unevenness. Vehicles leave temporary tyre marks.
- **Terrain:** slopes, elevation, drainage channels, depressions, hills, shoulders, erosion and transitions. Buildings, cars, people and trees sit on it and nothing floats.
- **Trees:**
  - real trunks, multi-level branching, real leaves, irregular silhouettes
  - bark, and variation in size, rotation and species
  - LODs, impostors, instancing and wind
  - never cylinder plus sphere
- **Grass:** cards and clusters, varied heights and shades, dirt patches, flattened areas, paths, tyre disturbance, wind and terrain blending, instanced at distance.

## 14-19. Characters and animation
- **No mannequin, Roblox, low-poly, plastic doll or capsule characters.**
  - Body: believable proportions, joints, hands and fingers, feet and neck.
  - Face: eyes, lids, brows, nose, lips and ears, with skin roughness and variation.
  - Hair: cards or an optimised mesh, never helmet hair.
- **Abel** is the highest-quality character. He reads as the real person at first glance:
  - face, head shape, skin, hair, body, clothing, animation and expressions
  - realistic eyes and teeth
  - inspected in-game, not accepted just because the GLB loads
- **Clothing:** thickness, folds, seams, collars, wrinkles and fabric roughness; shoes with soles, stitching and dirt.
- **Animation:**
  - idle breathing, weight shift, foot placement
  - walk, jog, sprint, turns and stops, looking around
  - hand and head movement
  - progressive turning and blending
- **Mandatory foot IK** on stairs, slopes, kerbs and uneven ground: no floating, buried or sliding feet.
- **NPC life:**
  - walk, talk, wait, sit, carry objects, cross roads
  - look at shops, use phones, buy food, talk to vendors
  - enter and exit buildings, wait for and ride matatus, interact with each other
- **NPC variety:** clothing, height, body type, hair, age, accessories and gait. No clones.

## 20-23. Vehicles, physics, traffic, matatu
- **Hero vehicles:** proper body, glass, head and tail lights, mirrors, door seams, wheels, tyres and rims, windscreen, and a visible interior (steering wheel, seats, dashboard).
- **Physics:** suspension, acceleration, braking, steering, body roll, wheel spin, grip, weight, turning radius and slopes. Vehicles stay attached to the road.
- **Traffic:**
  - drives LEFT; stops at intersections and lights, queues, overtakes, turns
  - stops at stages, reacts to pedestrians, avoids collisions
  - varied vehicles, no identical repeats
- **The Mkurugenzi matatu is a hero vehicle:**
  - detailed body and correct proportions
  - graffiti that looks physically painted on, never a flat UI texture on a cube
  - tint, chrome, LEDs and lights
  - interior: seats, dash, wheel and speakers
  - route info and fictional branding

## 24-27. Lighting, shadows, AO, atmosphere (huge priority)
- Cinematic, physically believable lighting; never generic bright ambient.
  - **Morning:** warm, long shadows, haze.
  - **Midday:** overhead sun, short shadows, strong sky light.
  - **Evening:** golden light, long shadows.
  - **Night:** dark, with street, shop and vehicle lights, windows, signs, subtle bloom. Never a blue-tinted daytime.
- Shadows ground everything: contact shadows, cascaded shadows, and baked where possible. No realtime shadow on every tiny object.
- AO is strategic (under cars and balconies, between walls, around windows and stairs) and never overdone.
- Atmosphere: fog, distance haze, aerial perspective, dust, humidity, morning mist and night atmosphere.

## 28-29. Camera and motion
- Game camera, not an orbit viewer:
  - smooth follow with inertia and slight lag, auto distance
  - avoids walls, tightens in alleys, widens in vehicles, reacts to sprint
  - keeps the character in focus
- Nothing is frozen: trees, grass, clothes, breathing, traffic, signs, cables, flags, smoke, food steam, dust, birds, reacting pedestrians, suspension.

## 30-32. Storytelling, clutter, imperfection
- Every area tells a story. A food stall, for example, has cooking gear, steam, food, customers, chairs, waste, a sign, a vendor and foot traffic. Schools and the CBD get the same treatment.
- Controlled clutter, instanced and atlased:
  - poles, wires, signs, posters, bins, crates, chairs, stalls
  - drains, tanks, parked motorbikes and cars, newspaper stands
  - barriers, cables, dishes, washing lines, small shops, building materials
- Procedural variation: the same asset looks different each time (clean, faded, dirty, rusty, postered, graffiti) via material parameters and decals.

## 33-37. Textures, LOD, streaming, performance, auto-scaling
- KTX2 with mipmaps, normal, roughness and AO maps, and atlases. Hero assets up to 2048, important assets 1024-2048, distant 512-1024. No 4K everywhere: maximise perceived detail per MB.
- LOD0, LOD1, LOD2 and LOD3/impostor for every major asset, with no visible transitions.
- Streaming cells: load only the current and nearby areas plus the skyline, asynchronously, with no loading screens. Use predictive streaming from player velocity and direction.
- Quality tiers LOW, MEDIUM, HIGH and ULTRA (desktop).
- Auto-scaling watches FPS, frame time, GPU and memory. It reduces resolution, then shadow resolution, then LOD distance, NPC update rate, distant vegetation, post-processing and traffic, and protects texture quality the longest.

## 38-41. Frame time, hitching, instancing, draw calls
- Targets: high desktop 60+, mid laptop 45-60, mid phone 30-45, low phone a stable 30. **1% lows and frame-time consistency matter most**; a 300 ms freeze every few seconds is unacceptable.
- Zero hitching on district entry: the player keeps moving while near assets load first, then far assets, then LOD transitions.
- Aggressive instancing for repeated items, but never instance things that should look unique.
- Atlases, shared materials, batching and merging keep the material count low.

## 42-47. Post, reflections, water, rain, night, interiors
- **Post-processing, subtle:** AgX/ACES tone mapping, SMAA, light bloom, AO, grading, light vignette, and DoF only in cinematics. No overuse of bloom, chromatic aberration, motion blur, vignette or sharpening.
- **Reflections, cheapest convincing:** screen-space or planar for hero interiors, probes for vehicles and buildings, faked through material response at distance. No ray tracing.
- **Water:** reflection, refraction where justified, waves, roughness, depth colour and shoreline blending. Never a flat blue plane.
- **Rain:** darker roads, lower roughness, puddles, reflections, people react, spray, visible tyre tracks, and changes to sound, sky and light.
- **Night** is a highlight: street, shop, vehicle and window lights, signs, fog, wet roads, city glow and arena lights. Mostly emissive and baked; few realtime lights.
- **Interiors** are never empty boxes: furniture, lights, walls, floors, ceilings, decor, cables, objects and signs.

## 48-50. Interaction, physics, UI
- Physical interactions: hand reaches, door rotates on its hinge, character enters, door closes. The same applies to vehicles, chairs, drawers, gates and switches.
- Full physics only for the player, the active vehicle and nearby interactables. Everything else is static or simple, and bodies sleep aggressively.
- Minimal HUD (minimap, contextual prompts, quest notification, objective indicator); everything else lives in the phone.

## 51-53. Start screen, spawn, cinematic check
- Intro: black screen, then distant Nairobi ambience, city lights, a camera move through the city past traffic, pedestrians and the matatu, the title, arrival at Abel, then PLAY. Never spawn in an empty field.
- The first 30 seconds show people, vehicles, buildings, movement, sound, detail, traffic, vegetation and good light.
- Every major location gets cinematic shots: street level, player view, vehicle view, rooftop, sunset, night, close-up and wide establishing shot. Anything that looks like a Three.js demo is not finished.

## 54-56. Quality gate and rejection rule
- Before marking any asset complete, it must pass all of these:
  - Does it look real, with correct scale?
  - Does the material behave like the real thing, and does light interact naturally with it?
  - Is the detail enough at viewing distance, with believable imperfections?
  - Does it sit on the ground and cast and receive shadows correctly?
  - Does it hold up from multiple angles and while moving?
- Reject your own output if it is low-poly, cartoonish, plastic, toy-like, too smooth, primitive, empty, repetitive, procedurally obvious, floating, flat, generic or unrealistic. Never accept "good enough for WebGL".
- Be honest about the browser: aim for GTA-style believability within a browser budget. A distant impostor is fine; a nearby cube is not. A distant NPC impostor is fine; a nearby capsule is not. 100 believable instanced trees beat 500 cheap ones.

## 57-58. Profiling and visual regression
- Permanent dev perf mode showing FPS, frame time, 1% low, draw calls, triangles, textures, GPU memory estimate, active NPCs, active vehicles, streaming cells, loaded assets and physics bodies.
- `?benchmark` runs a fixed cinematic route and records average FPS, 1% low, worst frame, calls, tris, memory and streaming hitches.
- `/research/visual-tests/` holds fixed-camera screenshots after every major visual change:
  - hub_day, hub_sunset, hub_night
  - cbd_day, cbd_night
  - school_day, backlot_day
  - character_closeup, vehicle_closeup

## 59-62. Priority, density, audio, target
- **Priority 1 (hero):** Abel, the main vehicle, immediate buildings, roads, nearby NPCs, landmarks.
- **Priority 2:** nearby environment, vegetation, street furniture, traffic, shops.
- **Priority 3:** mid-distance buildings, distant NPCs and vehicles.
- **Priority 4:** skyline.
- Density: almost every view combines architecture, people, vehicles, vegetation, signs, infrastructure, street objects, shadows and depth.
- Positional audio for traffic, pedestrians, matatus, bodas, shops, construction, birds, dogs, music, generators, rain and wind, with distance falloff.

## 63. Implementation order
1. Audit the existing implementation and write VISUAL_AUDIT.md.
2. Rank every problem: CRITICAL, HIGH, MEDIUM or LOW.
3. Fix the rendering foundation: colour management, tone mapping, lighting, shadows, AO, fog, environment lighting, camera, exposure and post-processing.
4. Replace hero assets: Abel, the main matatu, immediate buildings, roads, trees, NPCs.
5. Build the environment material library.
6. Build the LOD and streaming system.
7. Populate with realistic detail.
8. Improve NPC and vehicle animation.
9. Day, night and weather.
10. Profile.
11. Run visual regression tests.
12. Only then add new gameplay.

## 64-66. No faking, definition of done, final command
- Never hide weak assets with fog, darkness, camera distance, blur, bloom or cinematic effects. Fix the asset.
- The overhaul is done when all of these hold:
  - Abel looks human, and the city looks like an inhabited Kenyan city.
  - Buildings and roads are believable and look used.
  - Vegetation is natural, vehicles look real, and NPCs look and behave human.
  - Lighting is cinematic day and night, the camera feels like a game, and the atmosphere has depth.
  - The world is dense, frame times are stable, there are no loading freezes, and the player forgets it's a browser.
- **A milestone is complete only when it works, meets the realism target, and stays performant.** The browser is the platform; the game is the product.
