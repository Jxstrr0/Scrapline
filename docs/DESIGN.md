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

## 0.1.2.0: the Build tab (PR 2)

- **Pinned on top:** the weight bar (clay, amber from 97%, red only if a loaded design is over), grams left, and a summary line: speed, weapon energy, weakest face, runtime, and a verdict (Ready, Flaws, Over, Can't fit).
- **Rows:** Class (one bot per class, each with its own draft and designs), Chassis, Armour (a top-down sketch with each face drawn by strength; pick a face, pick a plate, or put one plate on all four sides), Drive & wheels, Power (battery, speed controllers), Weapon, Weapon material, Extras, Layout & side profile, Stress report, Designs. Every option shows its price and a delta line against the draft: grams, then the two numbers that matter most for that slot (speed, weapon J, armour J, runtime, front edge, heat). An option that would go over the limit says by how much and is refused.
- **Layout editor:** the chassis grid, shaded by exposure, with the centre of mass marked. Tap a part, tap where it goes (or drag). Drive pods stay on their side; most weapons stay on the front row; a horizontal spinner on any edge. "Put everything back" returns to the automatic layout. Moving parts is free.
- **Side profile:** the bot from the side to scale, with clearance, front edge, height, whether it drives upside down, and how many of the class's common wedges get under it.
- **Pay on fit, no refund:** edits make a draft. The Fit bar shows how many parts changed, the price and the workshop hours; Fit lists the bill part by part, then fits it. From the career (PR 7) it charges the money; parts taken off are gone. Undo returns the draft to the fitted bot.
- **Designs:** save the draft under a name (12 per class), load one back into the draft (it says what fitting it would cost), delete with a second tap. The twelve test builds are there as starting points.
- **Save:** `v` 2. `settings.buildCls` is the class on the Build tab; `bots[cls]` holds `{cfg, damage, draft}`.

## 0.1.2.1: fixes from a review of PRs 1 and 2

- **Damaged saves can't break the Build tab:** an unknown part id (from an old or hand-edited save) is reported and swapped for the default part everywhere, so the weight, the bill and the layout all agree; a draft or design with missing fields is filled in.
- **Taking parts off** shows as "N taken off" on the Fit bar and in the bill, not as a free "part changed". Changing the material of no weapon is no change.
- **Fitting keeps damage** on the parts you didn't change (it only mattered from PR 4a, but it would have been a free repair).
- **Custom shape:** the two cut corners are armoured with the front plate and weigh what they should (about 27 g more on a beetle).
- **Layout:** tapping another part switches to it; a drag released off the tab still lands; the "won't fit" message says what is actually wrong.
- Option buttons that would go over the limit get a dashed border instead of fading their text below readable contrast.

## 0.1.3.0: the bench (PR 3)

- **What it tests:** the fitted bot of the class on the Build tab. Nothing fitted yet: it offers to fit the draft. Draft changes not fitted: it says so. Refit or move a part and the old results go stale.
- **Six tests,** each with a small chart and the numbers in words:
  - **Drive:** a 2.4 m straight (longer in bigger classes) and a spin on the spot: top speed reached (against the prediction), time, how far an off-centre COM pulls it, turn rate, push.
  - **Weapon:** spinners spin up with a real motor curve (less torque at low rpm, a little windage), so the measured spin-up is a touch slower than the prediction; then a hit on a fixed anvil (energy landed, rpm lost, time to recover) and how far the recoil throws you back. Flippers and lifters against four test masses; hammers, crushers and pushers by their energy.
  - **Impact:** a swinging mass hits each face, harder each swing (15% steps), on a fresh bot each time, until a part behind it dies: when the plate gives, which part dies first and at what energy. The weakest side is marked. This uses the first half of the fight's damage model: the plate's absorb, then its hp, then the most exposed part behind that face, a destroyed part passing 70% of what's left to the next.
  - **Wedge gauge:** the class's common edge heights slid under your front edge: which get under you, which you get under, which are too close to call (within the wedge tolerance).
  - **Endurance:** fight-pace bursts of drive and weapon until the battery is flat: runtime, heat in each motor group, when they overheat and back off to half power.
  - **Drop:** from a big flipper throw, on its wheels and upside down: what's damaged, whether it can still drive, and whether it drives inverted, rights itself or is stuck.
- **Cost:** drive and weapon tests are free and instant; the impact (2 h), gauge (0.5 h), endurance (1.5 h) and drop (1 h) tests take workshop hours, scaled by class. Nothing is charged before the career. The rig is safe: nothing it breaks stays broken.
- **The stress report** uses the measured numbers once a test has run (runtime, overheating, spin-up, wedges that get under you), adds the weak side from the impact test and drop failures, and tags those lines "Bench", here and on the Build tab.
- **Save:** `v` 3. `bots[cls].bench` says which tests have run on the fitted bot; the results themselves are worked out again (the sim is deterministic).

## Known loose ends

- Save slots exist in the save format but have no UI until PR 7.
- The control scheme and handedness settings arrive with the arena in PR 5.
