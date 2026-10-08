# ASSETS: licence log

Every model, texture, sound, font and animation used in the build. Source, author, licence and URL are required before an asset is committed.

| Asset | File | Source | Author | Licence | URL |
|---|---|---|---|---|---|
| Droid Sans Bold (typeface JSON, subset to A to Z, 0 to 9 and basic punctuation) | `public/fonts/droid_sans_bold_caps.typeface.json` | three.js examples (via stats-gl's bundled copy) | Steve Matteson / Google | Apache 2.0 | https://github.com/mrdoob/three.js/tree/dev/examples/fonts/droid |
| Bebas Neue (UI display font) | Google Fonts CDN | Google Fonts | Ryoichi Tsunekawa | SIL OFL 1.1 | https://fonts.google.com/specimen/Bebas+Neue |
| Inter (UI text font) | Google Fonts CDN | Google Fonts | Rasmus Andersson | SIL OFL 1.1 | https://fonts.google.com/specimen/Inter |
| Murram, tarmac, kerb textures | generated at runtime (`src/world/proceduralTextures.ts`) | original code | this project | project-owned | n/a |
| Hub kit models (shacks, kiosks, block flat, pole, tank, jerrican, chair) | `public/models/hub_kit.glb` | built by `blender/scripts/build_hub_kit.py` | this project | project-owned | n/a |
| Corrugated Steel 005 (mabati roofs) | inside `hub_kit.glb` | ambientCG | Lennart Demes | CC0 1.0 | https://ambientcg.com/view?id=CorrugatedSteel005 |
| Corrugated Steel 006 A (green mabati walls) | inside `hub_kit.glb` | ambientCG | Lennart Demes | CC0 1.0 | https://ambientcg.com/view?id=CorrugatedSteel006A |
| Corrugated Steel 007 A (blue mabati walls) | inside `hub_kit.glb` | ambientCG | Lennart Demes | CC0 1.0 | https://ambientcg.com/view?id=CorrugatedSteel007A |
| Plaster 007 (mud-plaster walls) | inside `hub_kit.glb` | ambientCG | Lennart Demes | CC0 1.0 | https://ambientcg.com/view?id=Plaster007 |
| Painted Plaster 017 (kiosks, flats) | inside `hub_kit.glb` | ambientCG | Lennart Demes | CC0 1.0 | https://ambientcg.com/view?id=PaintedPlaster017 |
| Concrete 040 (plinths, bands, stones) | inside `hub_kit.glb` | ambientCG | Lennart Demes | CC0 1.0 | https://ambientcg.com/view?id=Concrete040 |
| Planks 021 (doors, shutters, poles) | inside `hub_kit.glb` | ambientCG | Lennart Demes | CC0 1.0 | https://ambientcg.com/view?id=Planks021 |
| Metal 021 (rusty meter boxes) | inside `hub_kit.glb` | ambientCG | Lennart Demes | CC0 1.0 | https://ambientcg.com/view?id=Metal021 |
| Ground 048 (Blender preview ground only, not shipped) | `blender/textures` | ambientCG | Lennart Demes | CC0 1.0 | https://ambientcg.com/view?id=Ground048 |
| Blender built-in font (kiosk sign lettering, converted to mesh) | inside `hub_kit.glb` | Blender (Bfont, DejaVu Sans derived) | DejaVu fonts team / Bitstream | Bitstream Vera licence (free, permissive) | https://dejavu-fonts.github.io/License.html |
| Basis Universal transcoder | `public/basis/` | three.js r186 | Binomial LLC | Apache 2.0 | https://github.com/BinomialLLC/basis_universal |

Texture source files are downloaded by `node tools/fetch-textures.mjs` and are not committed. No third-party models, sounds or animations are in the build yet.

Episode data in `public/content/content.json` is metadata (titles, IDs, durations) from Abel's official YouTube channel, refreshed by `tools/fetch-episodes.py`. Videos play from YouTube itself; nothing is downloaded or re-hosted.
