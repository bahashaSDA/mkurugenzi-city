# BUILD PROMPT: MKURUGENZI CITY (3D Open World Website for Abel Mutua)

Version 2: adds the Abel dossier, a mandatory research phase, and a real-world Nairobi reference library.

Paste this whole document into Claude Code at the start of the project. Save it in the repo root as `SPEC.md` so every future session can re-read it.

---

## 0. YOUR ROLE

You are a senior open-world game developer and technical artist with 30 years of experience shipping large city games, now specialised in real-time 3D for the web. You think like a lead on a GTA-style project: world first, performance budgets always, every object solid, every street worth exploring. You also know how Bruno Simon builds playful physics portfolios and you use those tricks only where they make the world more fun.

You are building **Mkurugenzi City**, a browser-based open world that celebrates Kenyan storyteller Abel Mutua ("Mkurugenzi") and his fans ("Wakurugenzi").

Work like a professional:
- Plan before coding. Write the plan to `PLAN.md` and keep `PROGRESS.md` updated after every milestone so work can resume in a new session.
- Commit after every working milestone with a clear message.
- Never silently leave placeholders. If something is a placeholder, list it in `PROGRESS.md` under "Placeholders".
- Test performance after every milestone, not at the end.
- Keep a licence log in `ASSETS.md` for every model, texture, sound and animation you use (source, author, licence, URL).

---

## 1. QUALITY TARGET (BE REALISTIC ABOUT THE PLATFORM)

The goal is the most realistic open-world city a web browser can run smoothly. It runs in a browser on normal Kenyan phones and laptops, so it cannot match GTA V's raw detail. Instead, match GTA's *feeling*: a dense, believable, living city that rewards exploration.

Visual target: **grounded realism**. Use PBR materials, real-world scale, proper lighting, weathered surfaces, dirt, posters, wires, signage clutter and lots of life. No cartoon outlines and no toy look.

Measurable performance targets (these define "no lag"):

| Device tier | Example | Target FPS | Max draw calls | Max triangles on screen |
|---|---|---|---|---|
| Low | Tecno/Infinix mid-range Android | 30 stable | 250 | 400k |
| Mid | Recent Android / older laptop | 45 to 60 | 500 | 1.2M |
| High | Gaming laptop / desktop | 60+ | 900 | 3M |

Also:
- First load (to playable): under 10 MB transferred and under 8 seconds on a 4G connection.
- No frame should take longer than 50 ms during normal play (no hitches when entering districts).
- Zero garbage-collection spikes from per-frame allocations.

---

## 2. PROJECT CONTEXT: ABEL MUTUA DOSSIER (VERIFIED PUBLIC FACTS, OCTOBER 2026)

This is a starting dossier compiled from public news sources. Section 2B tells you how to verify and expand it.

**2.1 Identity**
- Full name: Abel Mutua Musyoka. Known as **"Mkurugenzi"** (Swahili for "director"). Fans are the **"Wakurugenzi"**.
- Born 28 August 1986, Nairobi. Grew up in Kibera, later moved to Laini in Ngong.
- Education: Ayany Estate Primary School, Makueni Boys High School, diploma from the Kenya Institute of Mass Communication (KIMC).
- Roles: actor, script writer, filmmaker, producer, voice-over artist, YouTube storyteller, podcaster, entrepreneur. Active since 2007.

**2.2 Career timeline (use for the "About Abel" timeline and world easter eggs)**
- Late 2000s: rises to fame as **Freddie**, a mischievous student on a Citizen TV high school drama (2007 to 2012 era; exited in 2016).
- Script writer for The Real Househelps of Kawangware, Hapa Kule News, Anda Kava, Mother in Law, and K24's TV LOL. Created and wrote Sue and Johnnie.
- 2012: works alongside Philip Karanja; later co-founds **Phil-It Productions** with Philip Karanja and Bob Muriithi. Abel writes and is Creative Director; Phil directs.
- 2018: honoured at the Young Entrepreneurs Awards.
- 2020: pandemic lockdown. He tells stories to his family at home; his wife Judy suggests posting them. The YouTube storytelling era begins.
- May 2021: first live audience recording at the **Kenya National Theatre** (300 seats), then a bigger live show at **Nairobi Cinema**. Merch (t-shirts, jackets) sold alongside tickets.
- 2021: Grand Little Lie released on the Phil-It website and in Nairobi cinemas; later on Netflix.
- July 2022: **Click Click Bang** premieres at Nairobi Cinema, KSh 2.5M from 2,500 attendees, a Kenyan premiere record. Wins six Kalasha Awards with the Phil-It team. Acquired by Netflix in 2023.
- 2023: Top Content Creator (KUZA Awards), YouTube Influencer of the Year (Pulse).
- 2024: Untying Kantai premieres on Showmax (May). Makosa Ni Yangu premieres on philittv.com. The Mkurugenzi Podcast ranks third most listened podcast in Kenya on Spotify. Men's Conference on Valentine's Day addressing gender-based violence.
- 2025: AMVCA nominations.
- **24 June 2026: crosses 1,000,000 YouTube subscribers** (YouTube Gold Creator Award). Channel shows about 8.2M views and 2.2M watch hours per 28 days around that time.
- Has publicly called for a **20,000-seat indoor arena** in East Africa, citing Kigali as the example.

**2.3 Brand and voice (most important for the world's personality)**
- Catchphrases: **"Utafraaaia"** (you will not like what happens next) and **"I got you"** (a gripping story is coming).
- YouTube shows: Young and Stupid (real-life stories), Headline Hitters (global news retold as stories), Stories of My Life, Celebrity First Encounters.
- Channel tagline (paraphrased): a storytelling platform to entertain, educate and inform.
- Tone: Sheng and Swahili mixed with English, self-deprecating humour, dramatic pauses before the twist, cinematic narration of ordinary Nairobi life.
- Business: his wife **Judy Nyawira** is his creative partner and manager (relevant for the pitch, not for in-world content).

**2.4 Official channels**
- YouTube: https://www.youtube.com/@Mkurugenzii
- Instagram: @abelmutua
- TikTok and Facebook: "Abel Mutua"
- The Mkurugenzi Podcast (Spotify and YouTube)
- Phil-It films: https://www.philittv.com (pay-per-view, KES 250 per film)

**2.5 Privacy boundaries (mandatory)**
Do NOT research, store or put into the world: his home location, his child, family members' private lives, school details, finances, health, family bereavements, or online controversies and gossip. Do not build anything around his political views; the world stays apolitical. Only use his public, professional persona and work.

**Rights and likeness rules (mandatory):**
- Abel has approved the use of his likeness. Build his character as an exact likeness using the capture pipeline in section 5.5. Keep the model in one GLB file so it can be updated easily.
- Do not clone or synthesise his voice. Use text speech bubbles, plus real clips only if supplied later in `/public/audio/approved/`.
- Do not use TV station logos, real matatu Sacco names, real company logos or real brand billboards. Invent fictional Kenyan brands (for example "Mjengo Cement", "Chapo Express", "Kibanda FM").
- Name the school district "Freddie's School" rather than using the TV show's trademarked name or footage.
- Video content plays from his official YouTube via the YouTube IFrame API. Do not download or re-host his videos.
- Real landmarks (KICC, Kenya National Theatre, Nairobi Cinema, KIMC, Kigali's BK Arena) are used as **reference for "inspired-by" buildings**. Capture their shape, scale, materials and feel, but give them fictional names and no real logos or signage.

---

## 2B. PHASE R: RESEARCH BEFORE MODELLING (MANDATORY)

Real-life accuracy is the core of this project. Every structure must look like it was lifted from the real Nairobi. Before modelling any district, research it.

**R.1 Research tools**
- Use web search and web fetch to research online. If those tools are not available in your environment, stop and ask the user to provide reference photos, then continue.
- Good sources: Wikipedia and Wikimedia Commons, Google Street View descriptions, news photo galleries (Nation, Standard, Citizen Digital, K24, Kenyans.co.ke), architecture sites, matatu culture features, YouTube vlogs walking through Nairobi streets, government and institution websites.
- Reference images are for **study only**. Never copy a photo into the build as a texture unless it is CC0 or properly licensed and logged in ASSETS.md.

**R.2 Abel research**
- Verify and update section 2 with anything newer: latest shows, latest film, subscriber count, upcoming live shows, merch, awards, new catchphrases, recurring story characters and running jokes from his episodes.
- Study 10+ of his recent YouTube thumbnails and channel art: note the colour palette, typography style, his usual outfits and poses. Use this for the world's UI style and Abel's in-game outfits.
- Respect section 2.5 at all times.
- Output: `/research/abel-dossier.md` with sources listed.

**R.3 Structure research (one file per district)**
For every building and prop, document in `/research/references/<district>.md`:
1. **Real-world reference:** what real place or object it's based on, with source links.
2. **Dimensions:** real measurements (height, width, storeys, door and window sizes, road widths, pavement widths). If unknown, estimate from photos using a 1.75 m person or a standard door (2.1 m x 0.9 m) for scale, and say it's an estimate.
3. **Materials:** what it's really made of (mabati, iron sheet gauge, mud and wattle, concrete block, glass curtain wall, terrazzo, timber) and how it ages (rust, dust, peeling paint, water stains).
4. **Colour palette:** sampled colours as hex values.
5. **Signage and text:** hand-painted vs printed, font style, languages (English, Swahili, Sheng), typical wording.
6. **Life and clutter:** what people, vehicles, animals, sounds and objects are always around it.
7. **Time-of-day behaviour:** how it looks at morning rush, midday, evening and night.
Model only after the reference file exists.

**R.4 Research deliverables (Definition of Done for Phase R)**
- `/research/abel-dossier.md`
- `/research/references/` with one file per district plus `vehicles.md`, `people-and-clothing.md`, `street-furniture.md`, `nature.md`, `sounds.md`
- `/research/style-guide.md` summarising the final palette, materials, signage rules and fictional brand list

---

## 2C. REAL-WORLD REFERENCE LIBRARY (STARTING NOTES, EXPAND IN PHASE R)

These are the real-life details that make it feel like Nairobi and not a generic city. Verify and expand them during research.

**Environment and climate**
- Nairobi sits at about 1,795 m altitude, about 1.3° south of the equator. The sun is close to overhead at noon year round. Days are about 12 hours: sunrise around 6:30, sunset around 18:45, with a short twilight. Configure the day and night cycle to match.
- Highland light: crisp blue skies, puffy afternoon clouds, cool misty mornings in some months.
- **Red murram soil** everywhere off the tarmac: red-brown dust on walls, shoes, car bottoms and road edges.
- Trees and plants: **jacaranda** (purple blossoms, especially October to November), Nandi flame, eucalyptus, acacia on the outskirts, bougainvillea on walls and fences, banana plants in compounds.
- Birds: **marabou storks** in trees around the CBD, crows, pigeons, ibis.

**Roads and traffic (critical details)**
- **Kenya drives on the LEFT.** Vehicles are right-hand drive. All traffic logic, matatu doors (left side) and lane logic must follow this.
- Number plates: white front plate, yellow rear plate, format like "KDA 123A". Use fictional combinations only.
- Road signs follow British-style design: red triangle warnings, round red-ring prohibitions, km/h speed limits.
- Common sights: speed bumps (often unpainted), potholes, faded zebra crossings, roundabouts, concrete kerbs painted black and white or yellow, pedestrians walking on road edges, hawkers between cars in traffic jams.
- Matatu stages: crowded, touts calling destinations and route numbers, matatus parked at angles, conductors hanging from doors.

**Matatus (research "nganya" culture in depth)**
- Two main types: 14-seater Toyota Hiace style vans (about 5.4 m long) and 25 to 33-seater minibuses on Isuzu or Mitsubishi truck chassis (about 7.5 to 8 m long).
- Nganya style: full-body airbrushed graffiti (celebrities, cartoons, slogans), tinted windows, chrome rims, LED and neon underglow and interior lights, huge sound systems, TV screens inside, custom upholstery, a yellow stripe along the side, route number and destination painted on the front, slogans on the rear windscreen.
- Design an original Mkurugenzi nganya following these rules, with no real Sacco names or celebrity faces other than approved Abel art.

**Boda bodas**
- Mostly 125 to 150 cc commuter motorbikes, about 2 m long, often red or black, with a passenger seat, crash bars, fluffy seat covers, rear-view mirrors with decorations, a rider wearing a reflective vest and sometimes a helmet, sometimes carrying an extra helmet for the passenger.

**Informal settlement street (hub, inspired by Kibera and Eastlands)**
- Single-room homes of about 3 m x 3 m, walls of mud and wattle plastered or of corrugated iron, rusted **mabati** (corrugated iron sheet) roofs held down with stones and old tyres, roof height about 2.2 to 2.6 m.
- Narrow footpaths between houses, open drainage channels with small plank bridges, tangled electricity wires, plastic water tanks, washing lines, satellite dishes on rusty roofs.
- Shops: small kiosks with hand-painted signs, often painted in bright single colours, iron grilles at the counter, crates of soda bottles stacked outside, sacks of charcoal, mitumba (second-hand clothes) hung on lines, butcheries with red-painted fronts and hanging meat, "Hoteli" cafes with plastic chairs, barbershops with hand-painted haircut menus, mobile money booths, video halls with handwritten film schedules on chalkboards.
- Also research the Kibera railway line running through the settlement (people walk and trade on the tracks), and markets like Toi Market for clutter and layout.
- Clutter: plastic chairs, jerricans, charcoal jikos with smoke, handcarts (mkokoteni), wooden benches, old car tyres, plastic sheeting, posters for church crusades and concerts.

**Kenyan secondary school (Freddie's School)**
- Single-storey classroom blocks with corrugated roofs, verandas with pillars, louvred glass windows, wooden doors painted green or blue, walls painted cream with a coloured base band.
- Assembly ground with a flag pole, a school motto painted on a wall, a gate with a watchman's booth, a dining hall, dormitories with bunk beds, a dusty football pitch with metal goal posts, water tanks, a bell (often a hanging rim of metal struck with a rod).
- Uniforms: school sweaters in a single colour, white or blue shirts, ties, grey or navy trousers and skirts, black shoes.

**Media college (KIMC-inspired, add near Freddie's School)**
- Research the KIMC campus in South C: modest institutional buildings, studios, students with cameras and tripods. Use it for a small "where Freddie learned his craft" area.

**Nairobi CBD (inspired by real streets)**
- Research Kenyatta Avenue, Moi Avenue, City Hall Way, Tom Mboya Street and the area around KICC.
- KICC is the iconic cylindrical tower with a saucer-shaped top and a cone-roofed amphitheatre beside it. Build an "inspired-by" landmark tower with a similar silhouette for the skyline.
- Mix of 1970s concrete office blocks, glass towers, colonial-era stone buildings, covered walkways, street hawkers, shoe shiners, newspaper vendors, bus stops with crowds, traffic police, city council askaris.
- Kenya National Theatre and Nairobi Cinema: research both. Abel's first live shows happened there. Build an "inspired-by" theatre in the CBD (see 7.8).

**Film backlot**
- Research Kenyan film production sets and studios: lighting stands, gaffer tape, cable runs, crew tents, catering, generators, camera dollies, video village monitors.

**Arena**
- Research Kigali's BK Arena (the example Abel cited) and similar modern indoor arenas for scale, entrance plazas, roof structures, seating bowls, LED facades. Design an original arena using those proportions.

**Savanna edge (Storyteller's Fire)**
- Research Nairobi National Park, where open savanna sits with the city skyline visible in the distance. Acacia trees (umbrella thorn and whistling thorn), golden grass, rocky outcrops, a big open sky.

**People and clothing**
- Research everyday Nairobi fashion: office wear, hustler streetwear, kanga and kitenge wraps, Maasai shukas in some areas, school uniforms, mama mboga aprons, boda boda reflector vests, church outfits on Sundays, matatu touts in caps and jackets.

**Sounds**
- Matatu hooting and loud music, touts shouting destinations, hawkers calling, boda boda engines, church choirs, roosters, dogs, rain on mabati roofs, distant traffic hum, radio talk shows in Swahili.

---

## 3. TECH STACK

**Web app**
- Vite + React 18 + TypeScript (strict mode)
- three.js (latest stable), @react-three/fiber, @react-three/drei
- @react-three/rapier for physics (character controller, vehicles, colliders)
- three-mesh-bvh for fast raycasts (interaction, camera collision)
- recast-navigation-js for NPC navmesh pathfinding
- postprocessing (pmndrs) with N8AO for ambient occlusion
- zustand for game state
- Howler.js or three PositionalAudio for spatial sound
- KTX2 (Basis Universal) textures, meshopt or Draco geometry compression
- @gltf-transform/cli for the asset optimisation pipeline
- r3f-perf or stats-gl for an in-game performance overlay (dev builds only)

**Free asset creation tools**
- **Blender 4.x**, run headless via Python (`blender -b -P script.py`) so you can generate, clean, LOD, bake and export assets with scripts.
- **MPFB2** (the official MakeHuman plugin for Blender) for realistic human characters: Abel's base body and rig, NPCs, street vendors.
- **Mixamo** (free with an Adobe account) for character animations: idle, walk, run, jump, sit, talk, wave, dance. Retarget to MPFB2 rigs. If Mixamo is unavailable, use the CC0 Quaternius Universal Animation Library.

**Free asset sources (CC0 preferred, log all in ASSETS.md)**
- Poly Haven: HDRIs, PBR textures, props
- ambientCG: PBR textures (mabati, concrete, asphalt, rusted metal, dirt)
- Quaternius and Kenney: CC0 base vehicles, props and city kits, to be retextured and detailed for a Nairobi look
- Freesound (CC0/CC-BY): street ambience, matatu horns, crowd sounds, boda boda engines
- Sketchfab: only CC0 or CC-BY models, credited

---

## 4. REPOSITORY STRUCTURE

```
/
├── SPEC.md                 (this document)
├── PLAN.md                 (your build plan)
├── PROGRESS.md             (status, placeholders, known issues)
├── ASSETS.md               (licence log)
├── blender/
│   ├── scripts/            (bpy scripts: generate, LOD, bake, export)
│   ├── source/             (.blend source files per district)
│   └── characters/         (MPFB2 character sources)
├── tools/
│   └── optimize-assets.mjs (gltf-transform pipeline)
├── public/
│   ├── models/             (optimised .glb only)
│   ├── textures/           (.ktx2)
│   ├── hdri/
│   ├── audio/
│   └── content/content.json
└── src/
    ├── app/                (React shell, UI, menus)
    ├── world/              (streaming, districts, terrain, roads)
    ├── districts/          (one folder per district)
    ├── systems/            (player, vehicles, drone, npc, traffic, quests,
    │                        interaction, daynight, audio, weather, save)
    ├── ui/                 (HUD, minimap, phone menu, dialogs, video modal)
    ├── perf/               (quality tiers, device detection, budgets)
    └── config/             (world layout, district coordinates, content)
```

---

## 5. ASSET PIPELINE (THIS IS WHAT KEEPS IT REALISTIC AND LAG-FREE)

**5.1 Blender rules**
- Real-world scale: 1 unit = 1 metre. Y up in three.js, so -Z is north.
- Every exported object needs:
  - `LOD0` (full detail), `LOD1` (about 40% triangles), `LOD2` (about 10% or an impostor billboard)
  - A collision mesh named `COL_<name>`: simple boxes, capsules or convex hulls. Never use the render mesh for collision except for terrain.
- Texel density: about 512 px per metre for hero assets at street level, 256 px per metre for background buildings.
- Use trim sheets and texture atlases for buildings. Many buildings should share one material.
- Bake ambient occlusion and lightmaps in Blender (Cycles) for static buildings, into a second UV channel.
- Add realism through detail layers: vertex-colour grime at the base of walls, rust streaks, faded paint, decals for posters, graffiti, cracks and water stains.

**5.2 Scripted pipeline (write these bpy scripts)**
1. `generate_lods.py`: decimate to LOD1 and LOD2, preserving silhouettes.
2. `bake_lighting.py`: bake AO and lightmaps per district.
3. `make_colliders.py`: auto-generate `COL_` boxes and hulls, with manual override support.
4. `export_district.py`: export each district as separate chunk GLBs.

**5.3 Web optimisation (`tools/optimize-assets.mjs`)**
- gltf-transform: dedup, prune, weld, instance, simplify where safe, meshopt compression, textures converted to KTX2 (ETC1S for colour and roughness, UASTC for normal maps), resize to max 2048 px (hero) or 1024 px (everything else).
- Fail the build if any chunk exceeds its budget: district chunk under 4 MB, hero character under 2.5 MB, NPC under 600 KB.

**5.4 Characters (MPFB2)**
- Abel: built as an exact likeness (section 5.5). Outfits based on his real signature looks, plus a jacket with a "MKURUGENZI" chest print (original design). During early phases, before the capture session is done, use a temporary MPFB2 body matched to his height and build, then replace it.
- 12 NPC base bodies with varied ages, body types and skin tones that reflect Nairobi's real population. Generate 40+ visual variants by swapping clothing, colours and accessories (school uniforms, mama mboga kanga, boda boda reflector vest, office suits, hustler streetwear, KIMC student look).
- Low-poly game rig, max 50 bones for NPCs. Use GPU skinning. NPCs far away use animated impostors or are culled.

**5.5 Abel's exact likeness**

Abel's likeness is approved for this project. Build him as close to the real person as possible.

**Capture pipeline:**

1. **Photo capture session with Abel:**
   - 80 to 150 photos of his head and shoulders, taken in 3 rings around him (eye level, above, below), every 10 to 15 degrees.
   - Soft, even light (overcast outdoors or two softboxes), no harsh shadows, no flash glare, plain background.
   - Neutral face, mouth closed, eyes open, hair as he normally wears it. Phone camera at max resolution is fine; lock focus and exposure.
   - Extra sets: a full-body A-pose set for body proportions, a smile set, and close-ups of eyes, ears and teeth.
   - Record his exact height and take reference photos of his signature outfits, shoes and accessories.
   - Short video clips of him walking, laughing and telling a story, to guide animation and expressions.
2. **Reconstruction (free tools):**
   - Meshroom (AliceVision, free, open source) or RealityScan (free mobile app) to build the raw 3D head and texture.
3. **Clean-up in Blender:**
   - Wrap the scanned head onto the MPFB2 base mesh topology (shrinkwrap plus manual sculpt) so it keeps a clean, animation-ready game mesh and rig.
   - Bake the scan detail into a normal map and the colour into a 2048 px albedo texture. Hand-paint fixes for eyes, hairline and any scan holes.
   - Create blend shapes (shape keys) for blink, smile, laugh, talk (basic visemes) and the "Utafraaaia" surprised face.
   - Hair as card-based hair or sculpted mesh with alpha, not strand hair (too heavy for web).
   - Match his real walk and gestures using the video clips when choosing and tweaking Mixamo animations.
4. **Budgets:** Abel's model under 2.5 MB, under 25k triangles at LOD0, with LOD1 and LOD2.
5. **Likeness check:** render turntable images (front, side, three-quarter, smiling) next to the reference photos and fix any differences in face shape, skin tone, eyes, nose, lips and hairline until it reads as him at first glance. Share the renders with Abel's team for final feedback.
6. **Swap-in:** replace the temporary body GLB with the final model; no other code changes needed.

Optional alternative if he prefers it: a stylised version (slightly exaggerated proportions, still clearly him), built from the same scan.

Note: MetaHuman (Unreal Engine) is not an option here because its licence restricts use outside Unreal, and this project runs on three.js.

---

## 6. THE WORLD MAP

Total playable area: about **1.6 km x 1.6 km**, plus a skybox of distant Nairobi hills and skyline. Coordinates are in metres; (0,0) is the spawn.

```
                    N (-Z)
   [Utafraaaia     [CBD: Mkurugenzi      [Wakurugenzi
    House hill]     Tower]                Arena]
   (-600,-550)     (0,-500)              (600,-600)
          \            |                    /
           \           |                   /
[Freddie's School]--[Mtaa wa Mkurugenzi]--[Phil-It Studios
   (-500, 0)          HUB (0,0)             Backlot] (500,0)
                       |
                [Matatu Stage] (0,120)
                       |
              [Savanna edge: Storyteller's Fire]
                       (250, 650)
                    S (+Z)
```

**Road network**
- A ring road links all districts, plus a central avenue running north to south through the hub.
- Murram (dirt) side roads in the hub and residential areas.
- Tarmac with faded lane markings, potholes (as decals and slight geometry dips) and bumps.
- Bus stops, roundabouts, footbridges, open drainage channels (with railings and colliders), electricity poles with sagging wires.

**Skyline and landmarks**
- The arena and Mkurugenzi Tower must be visible from almost anywhere, for orientation.
- Distant mountains and city silhouettes are a cylindrical skybox layer, not geometry.

---

## 7. DISTRICTS (FULL DETAIL)

Each district needs: a hero landmark, at least 8 interactive points, at least 1 secret, 1 quest badge (except the hub), ambient NPCs, a unique ambient soundscape and a load trigger radius.

### 7.1 Mtaa wa Mkurugenzi (HUB, Phase 1)
A dense, lively Nairobi neighbourhood street inspired by Kibera and Eastlands.
- **Buildings:** mabati shacks, two-storey block flats with balconies and washing lines, small shops with hand-painted signs, a church, a chang'aa-free "Kibanda FM" radio shop, a barbershop, a M-Pesa-style mobile money kiosk (fictional brand), a hardware shop, a chips kibanda with an animated fryer and steam.
- **Kibanda Video Hall (hero building):** wooden benches, CRT TV, VHS shelves. Every VHS tape is a YouTube episode loaded from `content.json`. Pull a tape off the shelf (physics animation), then the YouTube modal opens.
- **Barbershop:** a TV on the wall plays the latest Headline Hitters thumbnail. Interact to watch.
- **Merch kiosk:** mannequins with Mkurugenzi merch. Interact to open an external shop link (configurable).
- **Spawn scene (Bruno Simon touch):** giant 3D letters spelling "MKURUGENZI" stand at the spawn. They are physics objects that the player can knock over, and they slowly reset after 30 seconds.
- **Street life:** mama mboga stalls, a mkokoteni (handcart) to push, kids playing football (a ball you can kick with real physics), chickens, a stray dog that follows you briefly, hawkers calling out (text bubbles in Sheng and Swahili), boda bodas weaving through traffic.
- **Secret:** a back alley wall covered in fan graffiti; one tag is a hidden clue to Utafraaaia House.
- **Matatu Stage (south end):** the fast travel point (see 8.3).

### 7.2 Freddie's School (Phase 2)
A Kenyan secondary school: gate with a watchman, assembly ground with flag pole, classroom blocks, staffroom, dining hall, dormitory, football pitch, school bus.
- Classrooms: each blackboard holds one show (Young and Stupid, Stories of My Life, etc.) with chalk-style writing and an interactive desk.
- Staffroom notice board: latest news and announcements from `content.json`.
- Principal's office: About Abel (career timeline as framed certificates on the wall).
- Freddie NPC: a cheeky student character in the corridor who tells origin-story snippets.
- Bruno Simon touch: football on the pitch with goals that count your shots.
- **Badge 1:** found in the principal's desk drawer.

### 7.3 Phil-It Studios Backlot (Phase 2)
An industrial studio lot: gated entrance with security booth, sound stages, warehouses, trailers, light towers, cables on the ground, catering truck.
- One set per film. The Click Click Bang set has police tape, squad cars (fictional livery), a crime scene. The Grand Little Lie and Makosa Ni Yangu sets are dressed to match each story.
- Director's chair: sit down and the camera switches to a "film camera" view with letterbox bars. Shout "Action!" (button) to play the trailer.
- Clapperboard interaction opens each film's page on philittv.com.
- **Badge 2:** inside the editing suite.

### 7.4 CBD and Mkurugenzi Tower (Phase 2)
Modern Nairobi CBD: glass towers, a plaza with fountain, traffic lights, pedestrian crossings, hawkers, a bank (fictional), corporate billboards (fictional brands).
- Mkurugenzi Tower lobby with reception NPC. Working elevator with floor buttons:
  - Floor 5: Mkurugenzi Podcast studio (mics, acoustic panels, ON AIR light). Plays latest podcast episodes.
  - Floor 12: Writers' room (whiteboards with story maps, sticky notes).
  - Floor 20: Boardroom for business and bookings. A contact form or mailto link (configurable in `content.json`).
  - Rooftop: city view, helipad and the **drone pad** (Phase 3).
- **Badge 3:** in the writers' room.

### 7.5 Utafraaaia House (Phase 3)
An abandoned colonial-era house on a misty hill at the edge of town. Only reachable on foot via a winding path.
- Night-only extra effects: flickering lights, wind, creaking doors.
- Every door is a story setup. Opening it triggers the "Utafraaaia!" moment: camera shake, sound sting, lights dip, then the story (episode) opens.
- Light puzzle: find 3 candles to light the main hall.
- Keep it fun-spooky, not horror. Nothing graphic.
- **Badge 4:** in the attic after the puzzle.

### 7.6 Storyteller's Fire (Phase 3)
Savanna at the southern edge: acacia trees, tall grass (GPU-instanced and wind-animated), a campfire with logs, a starry sky at night.
- Sit by the fire and the camera lowers to seated height. The smoke rises and forms simple 3D story scenes (particle-based).
- Stars above are clickable: each constellation is a story collection.
- Calm, warm soundscape: crickets, crackling fire, distant city hum.
- **Badge 5:** hidden under a rock near the acacia.

### 7.7 Wakurugenzi Arena (silhouette in Phase 1, full in Phase 3)
A 20,000-seat indoor arena with a striking original roof design, giant LED screens outside, a parking area, ticket gates and food stalls.
- Locked until the player holds all 5 badges. Locked state: the gate shows "Collect all 5 Mkurugenzi badges to enter" and a badge counter.
- Inside: a full bowl of seats (instanced crowd with animated impostors), stage, giant screen, light show.
- The **Arena Show**: a choreographed lights and camera sequence ending with Abel's latest or featured video on the big screen.
- **Fan Wall:** visitors can leave a short message that appears as glowing text in the crowd lights. Messages pass a profanity filter. Store them in a simple backend (Supabase or Firebase free tier), configurable and optional.

### 7.8 Wakurugenzi Live Theatre (CBD, Phase 2)
An "inspired-by" version of the Kenya National Theatre and Nairobi Cinema, where his first live shows happened.
- Exterior: a period theatre facade with a marquee board showing "WAKURUGENZI LIVE" and current show titles from `content.json`, a ticket booth, a queue of fans, posters for his films (original poster art).
- Interior: red seats, a stage with a single armchair and spotlight (his live storytelling setup). Sit in the audience and a featured live-recorded episode plays.
- A merch table in the foyer with t-shirts and jackets (link to the real merch shop if supplied).

### 7.9 Media College (beside Freddie's School, Phase 2)
A small KIMC-inspired campus: a studio block with an ON AIR sign, students carrying cameras and tripods, a notice board, a small radio studio. It tells the "where he learned his craft" chapter and links to his career timeline.

### 7.10 Trophy and milestone moments (place across the world)
- **1 Million plaque:** an original gold "1,000,000 Wakurugenzi" plaque (not a copy of YouTube's plaque design) in the Mkurugenzi Tower lobby, with a celebration effect when the player first sees it.
- Award shelf in the boardroom: Kalasha, KUZA, Pulse and Young Entrepreneurs awards as original trophy designs with labels.
- Click Click Bang premiere billboard in the CBD with the record "2,500 fans, KSh 2.5M premiere".

---

## 8. GAMEPLAY SYSTEMS

### 8.1 Player character: YOU PLAY AS ABEL MUTUA
The player controls **Abel Mutua himself**, exploring his own city the way you control the main character in a GTA game. Every system in this document is built around him as the playable hero.

**Camera**
- Third-person camera like GTA: over-the-shoulder, smooth follow with slight lag, camera collision via BVH raycasts so it never clips through walls.
- Free orbit with mouse or right-side touch drag; camera auto-recentres behind Abel after 2 seconds of no input.
- Camera pulls in closer in tight alleys and interiors, pulls out wider on open roads and when running.
- First-person toggle (V key or a button) to see the city through Abel's eyes.
- Cinematic camera on special moments: entering a district for the first time, the "Utafraaaia" moments, sitting in the director's chair, the Arena Show.

**Movement (GTA-style)**
- Walk, jog, sprint (shift or double-tap the joystick), with a smooth stamina-free sprint (keep it relaxed, this is exploring, not survival).
- Jump, climb low walls and fences (vault animation under 1.2 m), step up kerbs and stairs naturally.
- Sit on benches, chairs, matatu seats, the storyteller's armchair and the director's chair.
- Open doors, push the mkokoteni, kick balls, knock over cones and letters.
- Enter and exit vehicles with proper animations: open the matatu door, climb in, sit, close the door. Hop on and off the boda boda. Launch and land the drone.
- Rapier kinematic character controller: handles slopes (max 45°), steps (max 0.35 m), and never passes through any collider.
- Footstep sounds by surface (tarmac, murram, wood, grass, metal) using raycast material tags.
- Idle animations that feel like him after 10 seconds without input: checking his phone, adjusting his jacket, stretching, laughing to himself, waving at nearby NPCs.

**Abel's personality in play**
- NPCs recognise him. People wave, shout "Mkurugenzi!", ask for selfies (a quick photo pose animation), touts call him to their matatu, kids run up to him. Keep it frequent enough to feel famous, not annoying.
- Context lines when he interacts with places (text bubbles, or real voice clips if supplied): for example at the video hall "Hii ni story ya..." before an episode, or "Utafraaaia!" before a twist.
- A small emote wheel (hold Q or tap the emote button): wave, laugh, dance, "I got you" point, thinking pose, selfie.
- Outfit change at his house or a wardrobe in the Mkurugenzi Tower: switch between his signature looks (based on the research in section 2B).

**Story framing**
- The game opens with Abel arriving in Mkurugenzi City by matatu. He is the Mkurugenzi of this city, and the world reacts to him as its director.
- The main quest is Abel walking through his own life story: the street he grew up on, the school where Freddie was born, the media college, the studio, the theatre where Wakurugenzi Live started, and finally the arena he dreams of.
- Quest text speaks to the player as Abel ("Mkurugenzi, the Wakurugenzi are waiting for you at the arena.").

### 8.2 Controls
- Desktop: WASD or arrows, mouse look, E to interact, F to enter or exit vehicles, M for map, Tab for the phone menu, Esc to pause.
- Mobile: left virtual joystick, right side drag to look, contextual action buttons that appear only when relevant (Interact, Enter vehicle, Sit). Big touch targets.
- Gamepad support (Gamepad API) as a bonus.

### 8.3 Matatu (fast travel and drivable)
- A detailed original matatu: custom graffiti livery with "MKURUGENZI" art, LED underglow, loud interior, a conductor NPC hanging at the door.
- **Fast travel mode:** at a matatu stage, choose a destination from a stage board. The matatu drives itself along the road spline to the district stage while the conductor shouts stops ("Tahidi! Tahidi! Panda tuende!"). The camera stays in a cinematic chase view. The world streams in during the ride, which hides loading.
- **Free drive mode (Phase 2):** the player can drive the matatu (Rapier raycast vehicle: suspension, steering, braking, handbrake). Arcade-realistic handling, not a simulator.
- In-vehicle radio: original or royalty-free tracks only, plus a "Mkurugenzi Podcast" station that plays podcast audio if URLs are supplied.

### 8.4 Boda boda (Phase 2)
- Ride a boda boda for quick personal travel. Lean in corners, horn button. Same vehicle physics module as the matatu.

### 8.5 Drone (Phase 3)
- Launch from the Mkurugenzi Tower rooftop pad. Free flight over the city with smooth inertia, max altitude 250 m, soft boundary at the world edge.
- In drone mode, district landmarks show floating labels. Tap one to land there.
- This is the "wow" view of the whole city, especially at night.

### 8.6 NPCs and traffic
- Pedestrians walk on the navmesh between points of interest, wait at crossings, chat in groups, and react (step aside, wave) when the player bumps them. No violence or damage systems at all.
- Vehicle traffic: matatus, boda bodas, private cars and a fictional bus follow road splines with simple lane logic, stop at lights and slow down for the player. **All traffic drives on the LEFT** with right-hand drive vehicles, as in real Kenya. Matatus stop at stages and bus stops to load passengers, and boda bodas filter between cars like they do in real traffic.
- Performance LOD: full animation under 40 m, reduced update rate at 40 to 100 m, impostor sprites at 100 to 200 m, culled beyond.
- Max 60 active NPCs and 25 vehicles on low tier; 150 and 50 on high tier.

### 8.7 Interaction system
- Raycast plus proximity check. Interactable objects glow subtly and show a prompt ("E: Watch episode").
- Each interactable is defined in data (`config/interactables.ts`): id, type (video, link, dialog, sit, pickup, door), payload.

### 8.8 Quest and progression
- Main quest: "Collect the 5 Mkurugenzi badges to unlock the Arena Show". Quest log in the phone menu.
- Side activities: score goals at Freddie's School, find all graffiti tags, watch 10 episodes, light the Utafraaaia candles.
- Progress saved in localStorage (wrap all access in try/catch).

### 8.9 Phone menu (GTA-style)
- An in-game phone UI with apps: Map, Quests, Episodes (list from content.json), Fast Travel, Settings (graphics quality, volume, controls), About Abel, Credits (from ASSETS.md).

### 8.10 Minimap and map
- Minimap in the corner (rendered from a pre-baked top-down map texture, not a second live camera, to save performance). Full map on M with district names and the player arrow.

### 8.11 Day and night cycle
- One full day lasts 24 real minutes. Sun direction, sky colour, fog colour and ambient light are all interpolated.
- Use Nairobi's real sun path: latitude about 1.3° S, sunrise about 6:30, sunset about 18:45, sun nearly overhead at noon, short twilight. Morning mist is optional; red dust haze in the afternoon light.
- At night: street lights turn on (emissive plus a limited number of real point lights near the player, the rest faked with emissive and bloom), shop signs glow, the arena LED screens dominate the skyline.
- Settings toggle to lock the time of day.

### 8.12 Weather (Phase 3, optional)
- Light rain: GPU particle rain near the camera only, wet surface look (roughness reduced, puddle decals reflect), rain sounds. Toggle in settings.

### 8.13 Audio
- Spatial ambience zones per district: hub (hawkers, music from shops, hooting), school (bells, kids), backlot (generators, crew chatter), CBD (traffic, crowd), savanna (crickets, wind), arena (crowd roar).
- Crossfade between zones. Master, music and effects volume controls. Audio starts only after the first user gesture (browser rule).

### 8.14 Content config (`public/content/content.json`)
Everything Abel's team might change lives here, not in code: episode list (YouTube IDs, titles, show name), podcast links, film links, merch link, contact email or form URL, featured video for the arena show, announcements. Optionally fetch the latest uploads with the YouTube Data API if an API key is provided in `.env`.

---

## 9. COLLISION RULES (NOTHING SOLID CAN BE WALKED THROUGH)

- Every building, wall, fence, pole, vehicle, stall, bench, tree trunk, rock, railing and furniture piece has a collider.
- Use simple shapes: boxes, capsules and convex hulls generated from `COL_` meshes. Use trimesh colliders only for terrain and complex static ground.
- Small clutter (cups, papers) has no collider and must be too small to matter visually.
- Dynamic physics objects (balls, cones, crates, the MKURUGENZI letters, mkokoteni) are rigid bodies that sleep when idle.
- Invisible world-boundary walls plus a natural edge (hills, fences, river) so players never fall out of the world.
- Doors use kinematic colliders that open with an animation.
- Write an automated collider audit script that lists every mesh in a district without a matching collider and fails the build if any non-exempt mesh is missing one.
- Physics simulation only runs for bodies within 150 m of the player. Distant dynamic bodies sleep.

---

## 10. PERFORMANCE ARCHITECTURE (HOW WE GET "NO LAG")

1. **World streaming:** divide the map into 200 m x 200 m cells. Load the cells around the player (radius depends on quality tier) in a background worker. Unload cells more than 2 rings away. Preload the destination district during matatu rides.
2. **LOD everywhere:** three.js LOD objects for buildings and props, impostors for distant buildings, trees and NPCs.
3. **Instancing:** InstancedMesh or BatchedMesh for repeated items (street lights, poles, grass, trees, mabati sheets, crowd seats, NPC impostors).
4. **Material discipline:** fewer than 40 unique materials per district. Share atlases and trim sheets.
5. **Culling:** frustum culling plus district-level occlusion zones (interiors only render when the player is inside or looking through a door).
6. **Lighting:** baked lightmaps and AO for static geometry. One directional sun with cascaded shadow maps (2 cascades on low, 3 on high), shadows only within 80 m. Max 8 real-time point lights near the player.
7. **Post-processing by tier:** Low: tone mapping only. Mid: plus SMAA and light bloom. High: plus N8AO, bloom and subtle vignette. Use AgX or ACES tone mapping.
8. **Adaptive quality:** detect the GPU tier on start (detect-gpu library) and keep monitoring FPS. If FPS stays under target for 3 seconds, step down resolution scale (DPR clamped between 0.75 and 2), shadow quality, LOD distance and NPC density automatically.
9. **No per-frame allocations:** reuse vectors, quaternions and matrices. No new objects in `useFrame`.
10. **Textures:** KTX2 only, mipmapped, GPU-compressed. Dispose textures and geometries when cells unload.
11. **Loading:** the first load contains only the hub at LOD1, the player, the matatu and the arena silhouette. Everything else streams in after play starts.
12. **Perf testing:** add a dev overlay (FPS, draw calls, triangles, memory) and a `?benchmark` mode that flies a fixed camera path and logs average and 1% low FPS. Run it after every milestone and log results in PROGRESS.md.

---

## 11. BRUNO SIMON TECHNIQUES (USE ONLY WHERE THEY ADD FUN)

Use these playful physics ideas in specific spots only. The rest of the world stays grounded and realistic.
- The knock-over "MKURUGENZI" letters at spawn.
- Kickable football in the hub and at Freddie's School.
- Traffic cones and crates near the backlot that react to the matatu and boda boda.
- Mkokoteni you can push.
- Satisfying small details: dust puffs when you land a jump, tyre marks fading on the murram, signs that wobble when bumped.
- A short, fun intro: the matatu drives up to the spawn and drops you off, doubling as the loading sequence.

---

## 12. LOADING AND FIRST EXPERIENCE

1. Splash screen: "MKURUGENZI CITY" title, a progress bar styled like a matatu moving along a route, and a "Tap to enter" button (needed to unlock audio).
2. Intro: matatu pulls into the hub stage at golden hour, conductor shouts, door opens, and Abel steps out onto his street with a wave to the crowd at the stage. A short tooltip shows controls for the detected device.
3. First quest prompt appears: "Welcome Mkurugenzi. Find the Kibanda Video Hall."
4. The Video Hall teaches the interaction system, then the main badge quest starts.

---

## 13. UI STYLE

- Clean, modern HUD inspired by GTA: minimal on-screen elements, minimap bottom-left, quest text top-right, contextual prompts centred low.
- Fonts: one bold display font and one clean sans (Google Fonts, with fallbacks).
- Colour accents drawn from matatu culture (bold yellows, deep greens, neon pinks at night) while keeping text readable.
- All UI responsive and touch-friendly. Respect safe areas on phones.

---

## 14. ACCESSIBILITY AND FALLBACKS

- Graphics quality presets (Low, Medium, High, Auto) in settings.
- Reduced motion option (disables camera shake and heavy effects).
- Subtitles for all dialogue.
- If WebGL2 is not available, or the device is too weak, show a fallback 2D page with Abel's links, episodes and contact.

---

## 15. BUILD PHASES AND DEFINITION OF DONE

### Phase R: Research (runs first, then again before each new district)
- Complete everything in section 2B.
- **Done when:** the Abel dossier, the district reference files and the style guide exist in `/research/`, with sources.

### Phase 0: Foundation
- Repo, tooling, asset pipeline scripts, Blender headless scripts, optimisation script, perf overlay, benchmark mode, quality tiers, streaming system skeleton, empty test map with player controller and collisions.
- **Done when:** the player walks around a test map at 60 FPS on desktop and 30+ on a mid-range Android, can't pass through test walls, and the asset pipeline exports one test building with LODs and colliders.

### Phase 1: Pitch Demo
- Mtaa wa Mkurugenzi hub fully dressed, Kibanda Video Hall working with YouTube, barbershop, merch kiosk, MKURUGENZI letters, street NPCs and boda boda traffic, day and night cycle, hub soundscape, matatu intro and fast travel shell (destination locked "Coming soon"), arena silhouette on the skyline, phone menu, minimap, settings, mobile controls.
- **Done when:** a first-time visitor can load in under 8 seconds on 4G, explore the hub for 10+ minutes with no hitches, and watch episodes. Benchmark targets in section 1 are met.

### Phase 2: City Expansion
- Freddie's School, Media College, Phil-It Studios Backlot, CBD with Mkurugenzi Tower and the Wakurugenzi Live Theatre, the 1 Million plaque and award shelf, full road network and traffic, drivable matatu and boda boda, badges 1 to 3, district streaming fully working.
- **Done when:** the player can travel between all Phase 2 districts by foot, matatu and boda boda with no loading pauses, and every district meets its budgets.

### Phase 3: Full World
- Drone flyover, Utafraaaia House, Storyteller's Fire, badges 4 and 5, full Wakurugenzi Arena with Arena Show and Fan Wall, weather, side activities.
- **Done when:** the full quest can be completed start to finish and the Arena Show plays.

### Phase 4: Polish and Launch
- Bug pass, collider audit pass, perf pass on 3 real devices (low, mid, high), SEO meta tags and social share image, credits screen from ASSETS.md, analytics (privacy-friendly, e.g. Plausible), deploy to Vercel or Cloudflare Pages with long cache headers on hashed assets and Brotli compression.
- **Done when:** a final benchmark log, a placeholder list (should be empty or approved) and a deployed URL are in PROGRESS.md.

---

## 16. HOW TO WORK ACROSS SESSIONS

- At the start of every session, read SPEC.md, PLAN.md, PROGRESS.md and the relevant `/research/` files before writing code.
- Before modelling any building, open its reference file and match its real dimensions, materials, colours and clutter. If the reference file is missing, do the research first.
- After building each district, do a **reality check**: compare screenshots against the reference notes and list anything that looks fake, too clean, wrong scale or un-Kenyan. Fix it before moving on.
- Work one milestone at a time. Do not start a new district until the current one passes its budget and collider audit.
- When you hit a hard technical limit (for example a feature that would break the mobile FPS target), stop, explain the trade-off in PROGRESS.md and propose the closest alternative instead of shipping something laggy.
- At the end of each session, update PROGRESS.md with: what was finished, benchmark results, open issues, placeholders and the exact next step.

Start now with Phase R. Research Abel and the hub district first, write the research files, then write PLAN.md with your detailed approach, then begin Phase 0.
