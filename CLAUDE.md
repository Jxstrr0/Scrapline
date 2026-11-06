# Notes for Claude

Scrapline is a combat-robot builder and career game by Longlight Interactive: design a fighting robot under a weight limit, prove it on the bench, drive it against an opponent whose build is just as considered, patch it in the pit, read the post-mortem and build better, from a plywood box in a rented corner of a Haldis machine shop to the televised Scrapline Open. Phone-first, free, one self-contained page (`index.html`, built from `src/`), live at https://jxstrr0.github.io/Scrapline/. The game shares its name with its in-game league, the Scrapline (its televised heavyweight league is the Scrapline Open). **The build plan is `docs/SCRAPLINE-PLAN.md`**: read it before starting any PR, do one PR at a time, tick it off in its checklist. The game as built is `docs/DESIGN.md`.

Sister project: Prairie Engine Works (`Jxstrr0/350Chev`, PEW). The stack, build script, save codes and save safety are lifted from it; when in doubt, look at how PEW does it. **PEW is the only reference.** Do not read, copy or follow the Escapement repo for anything: it only supplied the setting's names (Velmark, the Haldis).

## Stack

- Plain HTML, CSS and classic (non-module) JavaScript in a few big `<script>` blocks. No package.json, no npm, no bundler, no CI. The node scripts below are the only checks.
- three.js **r128** from cdnjs. The bloom addons for Ultra come from jsdelivr `three@0.128.0` (the `SCR_LIBS` list in `src/html/body.html`, loaded on demand through `window.__scrPost`; a Lite phone never loads them). Google Fonts: Space Grotesk (UI) and JetBrains Mono (readouts). Nothing else external.
- PWA: `manifest.webmanifest`, `icons/`, and the generated `sw.js`. Installed copies work offline.
- Assets: CC0 and CC-BY only, never NC or ND. Every one gets a line in a `CREDITS.md` next to its folder (`sounds/`, `models/`, `textures/`: name, author, licence, URL); Kelbo's own Blender work is noted as original. Ask Kelbo when a licence is unclear.
- Node 16 or newer for the scripts (22 is what was last used). Nothing to install. `tools/make-icons.js` needs Playwright (run by hand; output is committed).

## Commands (repo root)

```
node build.js            # rebuild index.html and sw.js from src/
node build.js --check    # exit 1 if either is stale, a script block does not compile, or a function is declared twice
node check-savecode.js   # 16 save-code checks: round trip, empty save, damaged and cut-off codes, other games, storage full, backup files
```

Run all three before every commit, plus `node tools/sim-test.js` and `node tools/fight-test.js` (about 40 seconds for beetle; `-q` for a quick pass that prints the balance without enforcing it, `all` for every class in about 3.5 minutes, `-m` for the matchup matrix). From PR 1, `node tools/sim-test.js` runs the build maths on `DEFAULT_CFG` and the `TEST_BUILDS` and fails if `src/sim/` uses a banned call; from PR 4a, `node tools/fight-test.js` is the balance harness. To play a local copy: `python3 -m http.server` in the repo root and open it. The service worker only registers on a real host (or with `?sw=1`), so local testing is never cached. `?fps=1` shows the frame rate and tier in the corner of the 3D view; `?sim=1` opens the raw `evalBuild()` result on the Build tab.

## Source and build

- **Edit `src/`, never `index.html` or `sw.js`.** Both are generated: `node build.js` concatenates the files listed in `src/manifest.txt`, byte for byte, then writes `sw.js`.
- Commit `src/`, `index.html` and `sw.js` together.
- `src/README.md` has the file map. Read it before moving code or adding a file.
- `src/` files are slices of one page, so a file may open or close mid-IIFE. `node --check` on one file means nothing; test the built page.
- A new `src/` file must go into `src/manifest.txt` at the right position, or the build refuses to run. Empty files are refused too: give a stub at least its header comment.

## Deploy

GitHub Pages serves the repo root from `main` (`.nojekyll` keeps Jekyll out). No workflow file: merging into `main` is the deploy. Allow a minute or two, then reload the live site. Installed copies show the "New version ready" bar because the service worker's cache name carries the version and a content hash.

**Shared host.** Every Kelbo game on GitHub Pages lives on `jxstrr0.github.io`, so they share one origin: one localStorage, one Cache Storage, one storage quota. Scrapline's localStorage keys all start `scr-` and its caches all start `scr-`; the service worker only ever deletes `scr-` caches. Never use another game's prefix (`pew2-`, or any other game's), and never delete or clear anything outside `scr-`. (That is why `build.js` is PEW's with only the cache prefix and the `SCR_LIBS` name changed.)

## Versions

- `const VERSION="x.y.z.w";` in `src/app/state.js` (major.minor.feature.hotfix). The build folds it into the `sw.js` cache name.
- Each plan PR bumps the **third** number; a fix to the last release bumps the fourth.
- The merge commit into `main` is titled `x.y.z.w: summary`.

## Code conventions

- Three namespaces: `SCRAP_SIM` (parts maths, bench tests, the fight simulation, AI drivers; never touches the DOM or three.js; runs in plain node), `SCRAP_VIS` (three.js; draws what the sim says; the app calls `setBot`, `setRun`, `setView`, `setQuality`, `fps`; the vis never reads game state), and the app glue in `src/app/`. `SCRAP_SOUND` (the synth) is its own block.
- **The fight is simulated by `SCRAP_SIM` at a fixed 60 Hz step; the 3D view only renders it.** That is what makes fights testable and balanceable in node.
- **Determinism is a hard rule.** `SCRAP_SIM` uses one seeded generator (`rng(seed)` in `sim/rng.js`, mulberry32) passed in as an argument. `Math.random`, `Date.now` and `performance.now` are banned anywhere in `src/sim/`.
- **Units:** parts tables are in grams and millimetres; `evalBuild` is the one conversion point, and everything it returns and everything the fight uses is in kg, m, s, J, W.
- Tuning numbers live in tables, not inline, under the names the plan gives them: `CLASSES`, `PARTS`, `DEFAULT_CFG` (`sim/parts.js`), `K` (`sim/build.js`), `COMBOS`, `WEDGE_GAUGES`, `BENCH`, `BENCH_TESTS` (`sim/bench.js`), `DAMAGE` (`sim/damage.js`), `WEDGE_RULES`, `FIGHT` (`sim/fight.js`), `AI_STYLES`, `AI_SKILL` (`sim/ai.js`), `ARENAS`, `JUDGE_WEIGHTS`, `OPPONENTS` in `src/sim/`; `WORLD`, `TIME`, `WORKSHOP_STAGES`, `TOOLS`, `SEASON_EVENTS`, `REPAIR_COST`, `REPAIR_HOURS`, `PIT_KITS`, `REPAIR_TIMES`, `ASSISTS`, `RIVALS`, `RND`, `STAFF`, `SPONSORS`, `META_WAVES`, `RULES_BY_SEASON` at the top of `src/app/state.js` (plus `EVENT_KINDS`, the event formats and prizes, and `TOOL_IDS`).
- Place names live in `WORLD` (`src/app/state.js`); money is shown with `fmt$` (`Th 4,850`).
- Three graphics tiers, `lite`, `full`, `ultra` (`src/app/perf.js`). Lite is the phone default and must keep working after every change: 30 fps render cap, no shadows, no post. Every effect needs a Lite path that is cheaper, not just "off". Auto-adjust steps a tier down when the frame rate stays low; after any change, the "Graphics lowered" toast must not appear where it didn't before.
- Colours in three.js are written as sRGB hex and converted with `.convertSRGBToLinear()` (the renderer outputs sRGB); skip that and everything washes out.
- All localStorage access is wrapped in try/catch. Four keys: `scr-save`, `scr-slot1` to `scr-slot3`. **Stop and ask before adding a key**; a new one must also go into `buMake`/`buWrite` in `src/app/savecode.js` and `KEYS` in `check-savecode.js`. New fields inside `scr-save` are fine: bump `SAVE_V` and add a `MIGRATE` step in `src/app/state.js`.
- Respect `prefers-reduced-motion` (and the Motion setting, `html.reduce`) and `prefers-reduced-transparency`. The light theme (`:root[data-theme=light]`) gets every UI change; the 3D view stays dark in both themes.
- Colour roles: clay `#D97757` is the accent (buttons, weight bar, active tab; dark clay `#A8482A` for small text in the light theme); lilac `#B48CE8` / ground purple `#6A33AD` for readouts (`.readout`); damage is green / amber / a cool red (`.ok`, `.worn`, `.broke`), never clay or an orange-red. Every text colour is at least 4.5:1 on both themes; check new ones.
- Comments in plain English at the top of each file say what it holds. Keep that up when adding one.

## Testing the sim in node

`SCRAP_SIM` runs in plain node. Cut its block out of the built page; it already ends with `module.exports = SCRAP_SIM`:

```
node -e 'const h=require("fs").readFileSync("index.html","utf8"),i=h.indexOf("Scrapline: robot sim core");
require("fs").writeFileSync("/tmp/sim.js",h.slice(h.lastIndexOf("<script>",i)+8,h.indexOf("</script>",i)))'
node -e 'const SIM=require("/tmp/sim.js"); console.log(Object.keys(SIM))'
```

From PR 1, `tools/sim-test.js` does this. When physics or parts change, put the before/after numbers (and from PR 4b the balance matrix) in the commit message.

## Save codes

- **Back up** / **Restore** (Shop tab → Saves, and Settings → Saves) in `src/app/savecode.js`. A code is `SCR1:` + the four keys as JSON, LZW-squeezed, base64url, + a 6-character checksum. Restore checks the whole code before writing anything. The next format is `SCR2:`.
- The save shape is the plan's section 15: `{v, settings, career, bots, designs, unlocks, staff, sponsors, rivals, lastFight, lastBackup}`. `settings` belong to the phone: loading a save slot keeps them (`loadSlot`); restoring a backup code replaces everything.
- **Save safety** (bottom of `savecode.js`, after PEW 1.76.66): **Save backup file** / **Load backup file** (the same code as `scrapline-backup-YYYY-MM-DD.txt`, through the share sheet where it can take files, else a download), a "Storage: ..." line from `navigator.storage.persisted()`, one `persist()` request per visit once there is progress, and a once-per-visit reminder bar when there is progress and no backup for 14 days. The last backup time is `S.lastBackup`, inside `scr-save`.
- Players may paste their codes to debug a game. That is their personal data: decode and run it locally only, never send it to an outside service, and don't commit it.

## How Kelbo works

- Beginner-plus coder who tests on his phone on the live site. End every task with a plain-language summary of what changed and how to test it on a phone.
- One `claude/...` branch and pull request per plan PR, into `main`. Once the three checks pass, merge it yourself (standing permission) and delete the branch. Never push straight to `main`.
- Commit subject: `Area: what changed`. Explain the why in the body. Keep pull requests small enough to read on a phone.
- Real design decisions get asked, not guessed: stop and ask with a recommended default and two alternatives, then add the answer to the plan's section 1.
- The site and the game use the name Kelbo only, never a real name. Studio name: Longlight Interactive. Credit line: "© year Kelbo / Longlight Interactive".

## Current status (0.1.8.0)

- PR 0 done: scaffold. Five tabs (Build, Bench, Fight, Shop, Career) with cards naming what each PR brings; the intro; the Settings sheet (graphics tier, auto-adjust, theme, motion, saves, install, version); PWA with the update bar; `SCR1:` save codes and PEW's save safety; `WORLD` and `fmt$`; the Longlight palette in both themes; a placeholder bot (plywood box, clay side panels, horizontal spinner idling) on a steel plate on a workbench in 3D (Lite / Full shadows / Ultra bloom).
- 0.1.0.1: renamed Servo to Scrapline (namespaces `SCRAP_*`, keys and caches `scr-`, codes `SCR1:`); save safety and every doc rebased on PEW alone.
- PR 1 done (0.1.1.0): the build maths. `CLASSES` (grid, cell size, scaling), `PARTS` (nine slots, every option at beetle scale; `classMult` scales it), the chassis grid (`footprints`, `placeOk`, `autoLayout`), `DEFAULT_CFG`, `TEST_BUILDS` (12 archetypes), `K` and `evalBuild` (SI out), `COMBOS` and `stressReport`, `WEDGE_GAUGES`. `tools/sim-test.js` checks it all. The Build tab shows the raw result for any class and test build (nothing saved yet).
- PR 2 done (0.1.2.0): the Build tab. Weight bar and summary pinned on top; rows for class, chassis, armour (top-down sketch, per face), drive and wheels, power, weapon, material, extras, layout (grid editor with exposure and COM) and side profile, stress report, designs (plus the test builds as starting points). Every option shows its price and a delta line. Edits are a draft in `S.bots[cls].draft`; the Fit bar shows `SIM.fitBill` and fitting pays full price, no refund (charged from PR 7). Over the limit is refused. `SAVE_V` 2: `settings.buildCls`.
- 0.1.2.1: review fixes. `normCfg` swaps unknown ids for the defaults (`unknownIds(cfg)` lists them for `evalBuild`'s errors), so mass, bill and layout agree; `fitBill` returns `removed` too; `sameParts` ignores the material with no weapon; fitting clears damage only on changed parts; the custom shape's cut corners are armoured; a rule that throws in `stressReport` is skipped.
- Files added beyond the plan's PR 0 manifest list: `app/pwa.js` (the service worker and update bar, as in PEW), `app/shop.js` (the Shop tab; the plan's list had no file for it) and `html/ld-vis.html` (a loading-bar step).
- PR 3 done (0.1.3.0): bench tests. `sim/bench.js`: `BENCH`, `BENCH_TESTS`, `runBench(b, id)` and the six tests (drive, weapon, impact per face, wedge gauge, endurance, drop), measured by running the build (mostly at the 60 Hz step), deterministic. `sim/damage.js` gets the first half of the damage model: `damageState`, `hitOrder`, `hitFace` (absorb, plate hp, then the most exposed part behind the face). `WEDGE_RULES.tolMm` exists. `stressReport(b, m)` uses measured numbers (lines tagged `measured`). The Bench tab tests the **fitted** bot only, and the rig is safe: nothing it breaks is kept (Kelbo, PR 3). Drive and weapon tests are free; the rest cost workshop hours from PR 7. `SAVE_V` 3: `bots[cls].bench = {sig, done}`; results are worked out again, never stored. The Build tab's stress report shows Bench lines when the draft is the tested bot.
- PR 4a done (0.1.4.0): the fight sim.
  - **`sim/fight.js`:** `newFight` / `stepFight` / `runFight` / `replayFight` / `fightResult`.
    - N bots at 60 Hz with teams.
    - Tank-steer drive capped by grip; a height axis (air, landings, upside down, self-righting).
    - `WEDGE_RULES` on any front contact.
    - Weapon zones and hits: spinners, flippers, lifters, hammers, crushers, saws. Bent discs and sheared shafts.
    - Collisions and walls, heat and battery.
    - Knockout after 10 s immobile; a pit when an arena has one. A lift lets go after 10 s (`FIGHT.holdMaxS`).
    - Time-up goes to the smaller damage share until PR 4b's judges.
    - Tuning in `FIGHT`.
  - **The log:** hits, failures, flips, landings, plus the player's inputs (30 Hz, 63 levels per axis, packed into base64url), capped at 20 KB. `replayFight(log)` reproduces it.
  - **`sim/damage.js`:** effects (`damageEffects`), `landHit` (the bench's drop uses it), `damageState(b, dmg)` with carried damage, `damageTaken`, `partStates`, `damageShare`. Damage keys are part keys, `armour_<face>` and `chassis`.
  - **`sim/ai.js`:** rush and keep-away with `AI_SKILL`.
  - **`ARENAS.box`:** the plain test box.
  - **The Fight tab:** the fitted bot against any test build, AI against AI, in the top-down debug view with readouts and the log in words. It pauses when hidden or when the tab is left, and saves nothing (no `SAVE_V` change).
  - **`tools/fight-test.js`:** the harness, with checks (repeatability, replay, log size, step budget, carried damage, rumble, the phone-test moments). Balance targets are printed only.
- PR 4b done (0.1.5.0): opponents, arenas, judges, balance.
  - **`sim/arenas.js`:** `ARENAS`: box, tabletop (ant), clubbox (beetle, hobby), regional (feather), eisenhalle (heavy).
    - Pits with an opening time (`openS`); wall pushers and floor spinners, each with impulse, J, vz kick and active time.
    - The layout turns by a quarter turn from the seed.
    - `JUDGE_WEIGHTS` .5 / .25 / .25.
  - **`sim/fight.js`:**
    - `arenaOf`, hazards and the pit.
    - The judges (`judgeFight`, `F.judge`, the end log entry carries `j`); "under" control counts only while the wedge drives.
    - The pin limit (10 s, then `release`: the pinner drives straight away).
    - `WEDGE_RULES.discGuard`, `FIGHT.lip`, `slope`, `gyro` and `gyroClass`, `selfFlip`.
    - `FIGHT.shock` (single-hit KOs per class), `FIGHT.lethal`.
  - **`sim/ai.js`:** eight `AI_STYLES` and `autoStyle`.
  - **`sim/opponents.js`:** 15 `OPPONENTS` with `opponentCfg`.
  - **The Fight tab:** opponent, arena and style pickers, the personality line, the judges' table, and the hazards in the debug view.
  - **`tools/fight-test.js`:** 12 seeds at skills 0.5 and 0.85. The target is each test build's record against the other test builds; a build more than 5 points outside 35-65% fails (plan section 1).
  - **Tuned:** the Brick test build has PU wheels and an anti-spinner bar; horizontal, drum and undercutter discs were slowed. The numbers are in `docs/DESIGN.md`.
  - **Saves:** nothing new (no `SAVE_V` change).
- PR 5 done (0.1.6.0): the arena, driving, hit feedback, sparring.
  - **`vis/bot.js`:** the parametric bot from the build (chassis, armour per face, wheels, weapon by type, team stripe), damage greying, the cache by build hash with disposal. The workshop shows the draft on Build, the fitted bot elsewhere (`visBot()` in `app/build.js`).
  - **`vis/arena.js`, `vis/fx.js`:** the arena from `F.arena`, the follow camera, sparks, flying parts, smoke, shake. `SCRAP_VIS.setView`, `setFight`, `fx`, `damage`, `pick`.
  - **`app/controls.js`:** direct and tactical, keyboard, gamepad, `ASSISTS` (rookie for now).
  - **`sound/synth.js`:** `SCRAP_SOUND`.
  - **The Fight tab:** sparring, one on one or a rumble, you or the AI driving, fight mode full screen with the HUD, the results card.
  - **Saves:** `SAVE_V` 4 (`settings.controls`, `leftHanded`, `assists`).
- PR 6 done (0.1.7.0): the pit window, post-mortem, replay.
  - **Best of three** in sparring (first to two). Damage and failures carry between rounds (`newFight` bots take `flags: {bent, smoke, cell, esc}`).
  - **`app/pit.js`:** the 60 s pit window between rounds. `PIT_KITS` (basic, full, pro; free when sparring, Kelbo) and `REPAIR_TIMES` in `state.js`; one repair at a time, the clock runs while you choose and pauses when hidden. `pitItems`, `pitApply`, and `pitAuto` (the other crew).
  - **`app/report.js`:** the post-mortem: hit timeline, damage map, cause chain, a redesign hint from `COMBOS`, the repair bill (`REPAIR_COST`, `REPAIR_HOURS`; shown, charged from PR 7), their build revealed with Copy to designs.
  - **Replay** (`app/fight.js`): re-runs the sim from the log in the arena view or 2D, ½× to 2×; the scrub bar re-runs from the start to the moment (no keyframes), on every tier. `SCRAP_VIS.setFight(F, true)` keeps the scene; `SIM.unpackInputs` is exported.
  - **Saves:** nothing new (no `SAVE_V` change).
- PR 7 done (0.1.8.0): the career, circuit, money, saves.
  - **`app/career.js`:** Start a career is a fresh start (Th 1,500, hand tools, nothing fitted; designs stay; Kelbo). Act, then Close week: rent out, the week's hours in (`TIME`, `WORKSHOP_STAGES`). Four acts (`TIME.acts`), moving up on the act's championship or rep. `SEASON_EVENTS` (about ten a Garage season, Kelbo) with `EVENT_KINDS`: club round robins, eight-bot brackets with a best-of-three final, rumbles, tag team. Entry, travel (`WORLD.venues` km and nights) and a pit kit.
  - **Event days:** the field from the seed (rivals, named opponents, test builds); before each fight, drive it (`ftEvent` in `app/fight.js`, the pit window after) or Quick sim (the AI drives at your skill, your crew pits; Kelbo). Damage carries through the day and home (`bots[cls].damage`, `flags`); the workshop card fixes it for money and hours. Prizes, rep, the bank's one loan, broke twice ends the run.
  - **Rules in the career:** tools (`TOOLS`, Shop tab) unlock parts and cut hours; classes open by act and workshop (`crFitBlock`). Driver xp sets the assist level (`crLevel`). `RIVALS` remember fights, upgrade a step a season, and talk.
  - **Shop tab:** workshop, tools, pit kit prices, the books, the three save slots.
  - **Sparring stays free practice** (Kelbo).
  - **Saves:** `SAVE_V` 5 (`career`, `bots[cls].flags`, `unlocks.tools`, `rivals`).
- Next: PR 8, R&D, team, sponsors, meta.
- What to test on a phone after any change: the loading bar finishes and the workshop renders on Lite; every tab opens; a spar starts, drives and ends; a best of three reaches the pit and the next round; a replay plays and scrubs; a career starts, a club meet is entered and fought (one driven, one quick sim), a repair is paid and a week closes; a save slot saves and loads; Settings opens and the theme switches; Back up then Restore round trips; portrait and landscape; no console errors on desktop.

## Longlight brand (studio pieces only)

Scrapline uses the Longlight palette as its own look (plan section 2). The studio logo applies only to studio pieces: the studio logo or splash, the "Longlight Interactive" credit line, the studio block on a credits or about screen, and any link back to the studio site (https://jxstrr0.github.io/Kelbo.Website/). Use the official logo files from `Jxstrr0/Kelbo.Website` (`assets/press/longlight-logo-dark` / `-light`); copy them in, never hotlink, redraw or recolour them. Name: always "Longlight Interactive" in full.
