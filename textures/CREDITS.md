# Textures

Photo textures for the Full and Ultra tiers (`src/vis/props.js`): the workshop floor, the bench top, the steel plate and the arena floor. Lite never loads them.

All from [Poly Haven](https://polyhaven.com), CC0 1.0 (public domain), fetched with `tools/get-polyhaven.py tex`: the diffuse (`_diff.jpg`) and the OpenGL normal map (`_nor.jpg`), resized to 512 px.

| Files | Asset | Author | Licence | URL | Changes |
|---|---|---|---|---|---|
| garage-floor_diff.jpg, garage-floor_nor.jpg | Garage Floor | Jenelle van Heerden | CC0 1.0 | https://polyhaven.com/a/garage_floor | 512 px. |
| plywood_diff.jpg, plywood_nor.jpg | Plywood | Rob Tuytel | CC0 1.0 | https://polyhaven.com/a/plywood | 512 px. |
| metal-plate_diff.jpg, metal-plate_nor.jpg | Metal Plate | Rob Tuytel | CC0 1.0 | https://polyhaven.com/a/metal_plate | 512 px. The diffuse was turned to greyscale. |

**Reflections** (0.1.40, `src/vis/surface.js`): an HDRI the Full and Ultra materials mirror. Fetched with `tools/get-polyhaven.py env`: the 1k `.hdr`, box-filtered down to 256 by 128 and stored as an RGBM16 PNG (light up to 16 times white; brighter lamps clip).

| File | Asset | Author | Licence | URL | Changes |
|---|---|---|---|---|---|
| env-hall.png | Empty Warehouse 01 | Sergej Majboroda | CC0 1.0 | https://polyhaven.com/a/empty_warehouse_01 | 256 by 128, RGBM16 PNG. |

**Arena floors** (0.1.42, `src/vis/props.js` `floorDress`): one tile for each venue look, Scrapline's own. Each is modelled in Blender from code and baked by `tools/blender-arena-floors.py` (geometry rendered straight down in Cycles for the mask, normals, height and occlusion; wear added in numpy), so there is no outside source and nothing to license.

| File | Asset | Author | Licence | URL | Changes |
|---|---|---|---|---|---|
| floor-deck_diff.webp, floor-deck_nor.webp, floor-deck_orm.webp | Bolted, painted steel panels (club box, regional arena, the Eisenhalle) | Built in Blender 5.2 from code, `tools/blender-arena-floors.py` | Scrapline's own | none | 1024 px colour and normals, 512 px occlusion / roughness / metalness. |
| floor-mill_diff.webp, floor-mill_nor.webp, floor-mill_orm.webp | Welded steel plate (Stahlbrück Mill) | Built in Blender 5.2 from code, `tools/blender-arena-floors.py` | Scrapline's own | none | As above. |
| floor-port_diff.webp, floor-port_nor.webp, floor-port_orm.webp | Planks (Eisenau Harbour) | Built in Blender 5.2 from code, `tools/blender-arena-floors.py` | Scrapline's own | none | As above. |
| floor-shed_diff.webp, floor-shed_nor.webp, floor-shed_orm.webp | Concrete bays (Grauwald Engine Shed) | Built in Blender 5.2 from code, `tools/blender-arena-floors.py` | Scrapline's own | none | As above. |

**Logos** (0.1.54, `textures/marks/`, drawn by `src/vis/marks.js`): the six sponsors' logos (`sponsor-*.svg`) and twelve team emblems (`team-*.svg`). These are **AI-generated**, not hand-drawn: made on 2026-11-10 with [Higgsfield](https://higgsfield.ai) (model GPT Image 2.6, SVG output) from prompts written for Scrapline. Higgsfield's terms claim no ownership of outputs and allow commercial use; they are not CC0 or CC-BY, and other users of the service may get similar images. Kelbo allowed generated art as a third kind of asset in 0.1.54 (plan section 1). `tools/make-marks.js` turns the files into the path data the game draws; the files themselves are not loaded by the game.

| Files | What | Made with | Changes |
|---|---|---|---|
| marks/sponsor-zahnrad.svg, sponsor-kaffee.svg, sponsor-seilbahn.svg, sponsor-eisenwerk.svg, sponsor-funk.svg, sponsor-bahn.svg | Logos for the six `SPONSORS` | Higgsfield, GPT Image 2.6 | None. The game recolours them black or white. |
| marks/team-ibex.svg, team-wolf.svg, team-eagle.svg, team-bull.svg, team-scorpion.svg, team-wasp.svg, team-shark.svg, team-rhino.svg, team-cobra.svg, team-fist.svg, team-piston.svg, team-anvil.svg | Team emblems | Higgsfield, GPT Image 2.6 | None. The game recolours them in the team's accent colour. |
