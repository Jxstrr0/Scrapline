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
