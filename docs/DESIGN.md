# Scrapline: the game as built

This file describes the game as it actually is on `main`. It grows as plan PRs land; the plan itself, with everything still to come, is [`SCRAPLINE-PLAN.md`](SCRAPLINE-PLAN.md).

## 0.1.0.0: scaffold (PR 0)

- **Setting:** Velmark, an invented alpine country. The player starts in the Haldis, its northern watchmaking valley, in a rented corner of a machine shop. The league is the Scrapline; its televised heavyweight league is the Scrapline Open at the Eisenhalle. Regional venues: Stahlbrück, Eisenau, Grauwald; club meets at the Haldis Gemeindehalle. All in `WORLD` (`src/app/state.js`). Career seasons start in 2026 (not playable yet).
- **Money:** the Velmark thaler, shown `Th 4,850` (100 pfennig), by `fmt$`.
- **Look:** the Longlight palette. Dark: base `#141413`, surfaces `#1C1B19` / `#1F1E1B`, clay `#D97757` accent, lilac `#B48CE8` readouts. Light: ivory `#FAF9F5`, `#F1EEE7`, white cards, dark clay `#A8482A` for small accent text, ground purple `#6A33AD` readouts. Damage colours green / amber / cool red, never clay. Space Grotesk for UI, JetBrains Mono for readouts. The 3D view stays dark in both themes.
- **Screens:** an intro on first visit; five tabs (Build, Bench, Fight, Shop, Career), each with cards saying what is coming and in which PR; a Settings sheet from the gear (graphics tier, auto-adjust, theme, motion, saves, install app, version).
- **3D:** a placeholder bot (plywood box, clay side panels, black HDPE front and back, four wheels, a steel horizontal spinner disc with two teeth idling) on a steel plate on a workbench under cold overhead light. Drag to orbit, pinch or wheel to zoom. Lite: Lambert / Phong, no shadows, pixel ratio 1, 30 fps cap. Full: PBR metal with a painted workshop reflection, soft shadows. Ultra: Full plus bloom (addons loaded on demand).
- **Sim:** `SCRAP_SIM` holds the seeded generator (`rng(seed)`, mulberry32) and the five weight classes (Ant 150 g, Beetle 1.5 kg, Hobby 5.5 kg, Feather 14 kg, Heavy 110 kg); everything else is a named stub.
- **Saves:** everything in localStorage under `scr-save` and `scr-slot1`–`3`, in the plan's section 15 shape with `v: 1`. Back up / Restore with `SCR1:` codes. Save safety after PEW: backup files (`scrapline-backup-YYYY-MM-DD.txt`), the storage-persist request, the "Storage: ..." line, and the quiet "no backup in 14 days" bar; `lastBackup` rides inside `scr-save`.
- **PWA:** installable, works offline, shows "New version ready" after a deploy.

## 0.1.0.1: the name

- The game is **Scrapline** (working title Servo dropped). Namespaces `SCRAP_SIM` / `SCRAP_VIS` / `SCRAP_SOUND`, storage keys and caches `scr-`, save codes `SCR1:`, backup files `scrapline-backup-YYYY-MM-DD.txt`. Save safety follows PEW: the status line says whether storage is kept and when the last backup was.

## 0.1.1.0: the build maths (PR 1)

- **Classes:** every chassis is a 2:3 grid of cells. Ant 4x6 of 25 mm, Beetle 4x6 of 45 mm, Hobby 6x9 of 50 mm, Feather 6x9 of 75 mm, Heavy 8x12 of 90 mm (its parts take 2x2 the cells). Every part is written once at beetle scale; `classMult` scales masses with the limit, lengths with the chassis, armour thickness so its weight follows the budget, spinner rpm so tip speed stays put, and motor power a little under mass above a beetle (heavies spin up slower).
- **Parts:** chassis (plywood, HDPE, aluminium, steel, titanium, custom shape), armour per face (none, HDPE thin / medium / thick, aluminium, hardened steel, AR500, titanium; weight from the face's real area), drive (one or two motors a side, brushless, high-torque gearbox), wheels (foam, rubber, polyurethane, solid, tracks), battery (small, medium, large, high-discharge), electronics (basic, dual, brushless, failsafe, fans), weapon (none, wedge, lifter, flipper, hammer, horizontal and vertical spinner, drum, undercutter, crusher, overhead saw), weapon material (aluminium, steel, S7, titanium), extras (self-righter, skid plate, anti-spinner bar, minibot). Each has a cost, workshop hours and an unlock (enforced from PR 7).
- **Layout:** drive pods sit against the sides, most weapons on the front row, everything else anywhere free; parts without a place are put somewhere sensible automatically. Exposure per cell comes from distance to each face and that face's armour.
- **What evalBuild works out:** mass and budget, centre of mass and pull, yaw inertia, outline, top speed (motor force falls with speed, traction caps the push), turn rate, clearance and front edge (wheels proud of both faces means it drives upside down), spinner stored energy, tip speed, spin-up and recoil, flipper launch and what it can lift, armour per face and the weakest one, runtime, heat (when the motors derate in a fight), cost and hours.
- **Stress report:** 25 rules in plain words: over or under budget, shafts that shear or discs that bend, bare faces and what sits behind them, slow spin-up, a flipper or lifter too weak for the class, short runtime, overheating, a battery or ESC that holds power back, brushless drive on brushed ESCs, COM off centre, a high front edge, not invertible, big recoil, slow drive; and the good news too.
- **Build tab:** for now, a class picker and the test builds, with the key numbers, the stress report and the raw result. Nothing is saved.

## Known loose ends

- Save slots exist in the save format but have no UI until PR 7.
- The control scheme and handedness settings arrive with the arena in PR 5.
