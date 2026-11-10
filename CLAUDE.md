# Notes for Claude

Scrapline is a combat-robot builder and career game by Longlight Interactive: design a fighting robot under a weight limit, prove it on the bench, drive it against an opponent whose build is just as considered, patch it in the pit, read the post-mortem and build better, from a plywood box in a rented corner of a Haldis machine shop to the televised Scrapline Open. Phone-first, free, one self-contained page (`index.html`, built from `src/`), live at https://scrapline.longlight.games/. The game shares its name with its in-game league, the Scrapline (its televised heavyweight league is the Scrapline Open). **The build plan is `docs/SCRAPLINE-PLAN.md`**: read it before starting any PR, do one PR at a time, tick it off in its checklist. The game as built is `docs/DESIGN.md`.

Sister project: Prairie Engine Works (`Jxstrr0/350Chev`, PEW). The stack, build script, save codes and save safety are lifted from it; when in doubt, look at how PEW does it. **PEW is the only reference.** Do not read, copy or follow the Escapement repo for anything: it only supplied the setting's names (Velmark, the Haldis).

## Stack

- Plain HTML, CSS and classic (non-module) JavaScript in a few big `<script>` blocks. No package.json, no npm, no bundler, no CI. The node scripts below are the only checks.
- three.js **r128** from cdnjs. The bloom addons for Ultra come from jsdelivr `three@0.128.0` (the `SCR_LIBS` list in `src/html/body.html`, loaded on demand through `window.__scrPost`; a Lite phone never loads them). Google Fonts: Space Grotesk (UI) and JetBrains Mono (readouts). The voice pack loads from Longlight's asset host, `https://assets.longlight.games/scrapline/voice/` (Cloudflare R2, filled from the private `Jxstrr0/longlight-assets` repo; `VOICE_CDN` in `src/sound/voice.js`), with the repo's own `sounds/voice/` as the fallback (Kelbo, 0.1.17.2). Nothing else external.
- PWA: `manifest.webmanifest`, `icons/`, and the generated `sw.js`. Installed copies work offline.
- Assets: CC0 and CC-BY only, never NC or ND. Every one gets a line in a `CREDITS.md` next to its folder (`sounds/`, `models/`, `textures/`: name, author, licence, URL); Kelbo's own Blender work is noted as original. Ask Kelbo when a licence is unclear.
- Node 16 or newer for the scripts (22 is what was last used). Nothing to install. `tools/make-icons.js` needs Playwright (run by hand; output is committed). `tools/pack-model.py` (packs a glTF into one `.glb`) and `tools/get-polyhaven.py` (fetches a Poly Haven model, texture or HDRI) need Python 3; run by hand, output committed. `tools/blender-arena-kit.py` builds `models/arena-kit.glb` (and `tools/blender-bot-shells.py` builds `models/bot-shells.glb`, `tools/blender-bot-weapons.py` builds `models/bot-weapons.glb`, `tools/blender-bot-wheels.py` builds `models/bot-wheels.glb`, `tools/blender-bot-detail.py` builds `models/bot-detail.glb`) with `bpy` (Blender as a Python module, `pip install bpy` in a venv); run by hand, output committed. `tools/blender-arena-floors.py` bakes the arena floor tiles (`textures/floor-*.webp`) and needs `bpy`, `numpy` and `Pillow` in the same venv.

## Commands (repo root)

```
node build.js            # rebuild index.html and sw.js from src/
node build.js --check    # exit 1 if either is stale, a script block does not compile, or a function is declared twice
node check-savecode.js   # 16 save-code checks: round trip, empty save, damaged and cut-off codes, other games, storage full, backup files
```

Run all three before every commit, plus `node tools/sim-test.js`, `node tools/voice-test.js` (the voice director: two replays say the same lines; every cue the app asks for has a line), `node tools/make-voicelines.js --check` (the voice lines match the sheet and `sounds/voice/`; run it without `--check` after changing the sheet) and `node tools/fight-test.js` (about 40 seconds for beetle; `-q` for a quick pass that prints the balance without enforcing it, `all` for every class in about 3.5 minutes, `-m` for the matchup matrix). From PR 1, `node tools/sim-test.js` runs the build maths on `DEFAULT_CFG` and the `TEST_BUILDS` and fails if `src/sim/` uses a banned call; from PR 4a, `node tools/fight-test.js` is the balance harness. To play a local copy: `python3 -m http.server` in the repo root and open it. The service worker only registers on a real host (or with `?sw=1`), so local testing is never cached. `?fps=1` shows the frame rate and tier in the corner of the 3D view; `?sim=1` opens the raw `evalBuild()` result on the Build tab.

## Source and build

- **Edit `src/`, never `index.html` or `sw.js`.** Both are generated: `node build.js` concatenates the files listed in `src/manifest.txt`, byte for byte, then writes `sw.js`.
- Commit `src/`, `index.html` and `sw.js` together.
- `src/README.md` has the file map. Read it before moving code or adding a file.
- `src/` files are slices of one page, so a file may open or close mid-IIFE. `node --check` on one file means nothing; test the built page.
- A new `src/` file must go into `src/manifest.txt` at the right position, or the build refuses to run. Empty files are refused too: give a stub at least its header comment.

## Deploy

GitHub Pages serves the repo root from `main` (`.nojekyll` keeps Jekyll out). No deploy workflow: merging into `main` is the deploy. (`.github/workflows/publish-release.yml` only publishes a GitHub Release for each new `VERSION`, which is where the studio site gets this game's version number; free, no keys.) Allow a minute or two, then reload the live site. Installed copies show the "New version ready" bar because the service worker's cache name carries the version and a content hash.

**Own address, same prefixes.** Since November 2026 every Longlight game has its own subdomain (Scrapline is `scrapline.longlight.games`), so each game has its own localStorage, Cache Storage and storage quota. Saves made before the move stay on the old shared origin, `jxstrr0.github.io` (Kelbo accepted that); the old address forwards here. The prefix rules still apply: Scrapline's localStorage keys all start `scr-` and its caches all start `scr-`; the service worker only ever deletes `scr-` caches. Never use another game's prefix (`pew2-`, or any other game's), and never delete or clear anything outside `scr-`. (That is why `build.js` is PEW's with only the cache prefix and the `SCR_LIBS` name changed.)

## Versions

- `const VERSION="x.y.z.w";` in `src/app/state.js` (major.minor.feature.hotfix). The build folds it into the `sw.js` cache name.
- Each plan PR bumps the **third** number; a fix to the last release bumps the fourth.
- The merge commit into `main` is titled `x.y.z.w: summary`.

## Code conventions

- Three namespaces: `SCRAP_SIM` (parts maths, bench tests, the fight simulation, AI drivers; never touches the DOM or three.js; runs in plain node), `SCRAP_VIS` (three.js; draws what the sim says; the app calls `setBot`, `setRun`, `setView`, `setQuality`, `fps`; the vis never reads game state), and the app glue in `src/app/`. `SCRAP_SOUND` (the synth) is its own block.
- **The fight is simulated by `SCRAP_SIM` at a fixed 60 Hz step; the 3D view only renders it.** That is what makes fights testable and balanceable in node.
- **Determinism is a hard rule.** `SCRAP_SIM` uses one seeded generator (`rng(seed)` in `sim/rng.js`, mulberry32) passed in as an argument. `Math.random`, `Date.now` and `performance.now` are banned anywhere in `src/sim/`.
- **Units:** parts tables are in grams and millimetres; `evalBuild` is the one conversion point, and everything it returns and everything the fight uses is in kg, m, s, J, W.
- Tuning numbers live in tables, not inline, under the names the plan gives them: `CLASSES`, `PARTS`, `DEFAULT_CFG` (`sim/parts.js`), `K` (`sim/build.js`), `COMBOS`, `WEDGE_GAUGES`, `BENCH`, `BENCH_TESTS` (`sim/bench.js`), `DAMAGE` (`sim/damage.js`), `WEDGE_RULES`, `FIGHT` (`sim/fight.js`), `AI_STYLES`, `AI_SKILL` (`sim/ai.js`), `ARENAS`, `JUDGE_WEIGHTS`, `OPPONENTS` in `src/sim/`; `WORLD`, `TIME`, `WORKSHOP_STAGES`, `TOOLS`, `SEASON_EVENTS`, `REPAIR_COST`, `REPAIR_HOURS`, `PIT_KITS`, `REPAIR_TIMES`, `ASSISTS`, `RIVALS`, `RND`, `STAFF`, `SPONSORS`, `META_WAVES`, `RULES_BY_SEASON`, `LEGACY` at the top of `src/app/state.js` (plus `EVENT_KINDS`, the event formats and prizes, and `TOOL_IDS`).
- Place names live in `WORLD` (`src/app/state.js`); money is shown with `fmt$` (`€4,850`).
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

## Current status (0.1.46.0)

The full log from PR 0 to 0.1.46.0 (what each version added, the tables and
save fields it brought) is `docs/HISTORY.md`. Read the matching entry before
changing a system it describes; add each new release there and update this
section.

- Built: the whole plan, PR 0 to PR 10. Build tab with body styles and
  weapon bays, bench tests, the 60 Hz fight sim with judges, hazards, 15
  opponents (28 from 0.1.36, 30 from 0.1.46, the newer ones built round the newer parts) and 8 AI styles, driving with assists, best of three with the pit
  window, post-mortem and replay, the career (acts, events, money, rivals,
  tools), R&D, staff, sponsors, meta and rules, tutorial, bot card, trophies,
  free assets and Blender props on Full/Ultra, the battle screen, the voice
  pack (from `assets.longlight.games`, local fallback), effects sounds, and
  material maps on Full/Ultra, smarter AI driving (paths round the pit, pit
  and shove escapes, flanking, hit-and-run), a home screen with Career and
  Sandbox modes (separate garages, `S.mode` / `S.parked`; Mode in Settings),
  labelled Build stats and Fix it buttons on the post-mortem (`RP_FIX`).
  A daily challenge and `SCRRP1:` replay codes
  (`src/app/daily.js`), arena floor markings and lighting (`arenaDecal`), one dressing scale (`AR.D`) for props, stands and crowd, and Blender weapon parts on Full/Ultra (`models/bot-weapons.glb`), visible damage on Full/Ultra (`src/vis/wear.js`), and teams: team and bot names, two colours and a badge built in code, opponents with teams of their own (`src/app/livery.js`, `src/vis/badge.js`), Build sections that open one at a time, automatic slow-motion on big moments in replays (`ftSlowPlan`, `src/app/fight.js`), a drawn bracket for tournament days with the draw shown before you enter (`crBracketHtml`, `src/app/career.js`), and a highlight reel: each season's best five moments, the season reel and the Fight tab's Highlights card (`src/app/reel.js`, `S.reel`). An arena for each regional venue: the Stahlbrück Mill, Eisenau Harbour and the Grauwald Engine Shed, with their own hazards, look and lighting; a career event fights in its venue's arena (`WORLD.venues[v].arena`, `crArenaId`; `ARENA_LOOK` in `src/vis/arena.js`). From Kelbo's polish list: Skip to the next week with an event you can enter (`crSkip`), and Watch it, a simmed career fight played back like a live bout with the result at the bell (`ftWatch`, `toastHold`); Dev mode in Settings (+€1,000 and Unlock all for a career, `settings.dev`) and an easier first season (start €2,500, cheaper basic kit, bigger club and tournament prizes, 45 rep to leave the Garage); a fit can run into next week's hours (0.1.30.1); wheel layouts (0.1.31: caster, six and eight wheels, mecanum and swerve, which slide sideways with the Slide button; `PARTS.wheelbase`, `models/bot-wheels.glb`); front attachments and a back slot (0.1.32: wedgelets, forks, plow, ram spike; rear wedge, rear spike, a back-up flipper that kicks and self-rights; the front swaps in the pit between rounds, `pitFronts`; `PARTS.front`, `PARTS.back`, `models/bot-attach.glb`) and the Grabber, an R&D weapon that clamps a bot and carries it to the pit; tuning dials (0.1.33: voltage, wheel size, weight bias, five steps each, free with no Fit, turned in the pit between rounds; `TUNE`, `cfg.tune`); odd bodies (0.1.34: shell and ring spinners and the meltybrain, which hit all round and leave no room for a front or a back, the meltybrain losing its sync on big hits; Shuffler legs with a 15% higher weight limit; `ALL_ROUND`, `FIGHT.melty`, `models/bot-odd.glb`); an audit of the AI's driving (0.1.35: a spun-up gyro can't stop a bot turning, `FIGHT.gyroFloor`; a shell drives with either end and arcs; the pit check looks its stopping distance ahead, a stall watchdog, a grabber lets go at the pit's edge; `AI_NAV`); 13 more named opponents (0.1.36); flame grates (0.1.37: a floor hazard on a clock that heats the motors and burns the underside, at Stahlbrück and in the Eisenhalle; `FLAME` in `sim/arenas.js`, `stepFlame`, `flamePhase`, `aiFlameOut`, `flameMesh`); the bench test dummy (0.1.38: a seventh bench test, three parked boxes hit in the real fight sim, with a Watch replay; `BENCH_DUMMIES`, `benchDummy`, `bnWatch`); life after the Open (0.1.39: the Open title read from the career's Finals, legend levels that cut the champion's own heavyweight limit and sharpen the fields, a bigger prize for a defended Final, a hall of fame of ended careers, Dev mode's Win the Open; `LEGACY`, `crTitle`, `crLegend`, `crHallAdd`, `S.hall`); the look (0.1.40, Full and Ultra: a tone curve that leaves colours under 0.76 alone, a real HDRI for reflections in `textures/env-hall.png`, bigger shadow maps, Ultra's anti-aliasing and vignette; a contact shadow under every bot on every tier; `LOOK`, `toneCurve`, `envApply`, `blobMake`); the bots' parts (0.1.41: wheel wells in the chassis and arches in the side plates on every tier; on Full and Ultra, Blender tyres per wheel type, hubs, tracks that run, bolts that belong to their plate, a power light in the team's colour and a removable link, from `models/bot-detail.glb`; `wheelWells`, `sidePlateGeo`, `botTracks`, `boltMeshes`, `botDetail`); the arenas (0.1.42: on Full and Ultra a floor tile for each venue look, modelled and baked in Blender, `textures/floor-*.webp`, and kit walls with work lights, board frames and lighting masts; on every tier a worn floor, hit marks that stay for the round, and a strip of venue boards; `floorDress`, `arenaWear`, `fxMark`, `wallBoards`); UI, room to work (0.1.43, the first of three UI releases: the Fight tab is four pages behind a strip, Spar, Daily, Highlights and Codes, with Opponent, Format, Arena and Driver as rows that open one at a time and a Fight bar pinned at the bottom; in portrait the 3D view shrinks to a strip on Shop and Career; shorter intro text; `subNav`, `FT.sub`, `FT.open`, `ftRow`, `ftSum`, `ftResSub`, `.gobar`); UI, the desk (0.1.44: Career is four pages, This week, Season, Sponsors and Record, with a Close week bar pinned at the bottom of This week; Shop in a career is five, Workshop, R&D, Team, Books and Saves; the bench verdict sits above the tests; `CR.sub`, `CR_SUBS`, `crWeekBar`, `SH.sub`, `SH_SUBS`); UI, feel (0.1.45: tabs and pages fade up, buttons press in, money and rep count in the header with the change under them, and an empty page is a card with the button that fills it; all of it off with Motion reduced; `pageIn`, `countTo`, `hudDelta`, `emptyHtml`, `goTo` and `data-go` in `src/app/boot.js`); two more vertical spinners (0.1.46: the eggbeater, an open frame that spins up fastest, bites deepest and bends early, from the mill; the drisk, a thick narrow drum that is the heaviest and hardest to bend, from the lathe; `beater` and `drisk` in `PARTS.weapon` and the fight's id tables, `wp_beater` and `wp_drisk` in `models/bot-weapons.glb`). In `src/vis/`, reach the sim with `typeof SCRAP_SIM!=="undefined"`: it is a top-level `const`, so `window.SCRAP_SIM` is always undefined. Money is euros. `SAVE_V` is 15.
- Next (Kelbo, plan section 1): 0.1.47, the driving school (drills with medals on the Fight tab); then whichever pitched idea Kelbo picks, and more of the polish pass from his list.
  Merged branches delete themselves on GitHub.
- What to test on a phone after any change: the loading bar finishes and the
  workshop renders on Lite; every tab opens; a spar starts, drives and ends,
  with sound (crowd, bells, the announcer's intro and Skip, captions with
  Sound off); a best of three reaches the pit and the next round; a replay
  plays and scrubs, slows for big hits and the knockout, and Slow-mo switches off; a tournament day draws its bracket (the draw shows in the Enter sheet) and fills it in as you win; a fight's best moment shows on the Fight tab's Highlights card and Watch all plays the clips back to back; an event at Stahlbrück, Eisenau or Grauwald fights in its own arena; Skip to week N closes the weeks to the next fight you can enter; Settings → Dev mode On shows +€1,000 and Unlock all; Watch it plays a simmed fight out and the result only shows at the bell; Build changes show in the workshop; a mecanum or swerve bot shows Slide in a fight and slides sideways while it's held; Build → Front & back fits a front and a back that show on the bot, and a best of three's pit has a Front row whose swap is on in the next round; a grabber clamps a bot and drives it to the pit, and a back-up flipper kicks; Build → Tuning turns three dials with no Fit, big wheels look bigger, and the pit's Dials row is on the bot next round; a shell spinner, a ring and a meltybrain spin round the bot and clear the front and back, a meltybrain hit hard loses its sync, and Shuffler legs step and raise the weight limit; a spun-up shell still turns at full lock, and AI bots keep out of the pit and don't sit stuck by Grauwald's long pit; the flame grate at Stahlbrück and in the Eisenhalle shows a pilot light, then burns, and a bot held on it heats up (its strip says Overheating) while AI bots drive off it; Bench → Test dummy runs, shows three bars and a line per dummy, and Watch plays one back as a replay; Dev mode's Win the Open makes a career the champion (the Career card shows the title, the legend level and a lower heavyweight limit), an over-limit heavyweight is refused at an event with the grams, a won Final says Title defended, and a restarted career shows in the Hall of fame; on Full and Ultra bright metal and paint roll off (no flat white patches), metal mirrors a hall's strip lights, Ultra's edges are smooth and its corners a little darker, and every tier has a soft shadow under each bot; every bot but a slab shows its wheels in arches in its sides (Lite too), and on Full and Ultra the tyres have tread, a tracked bot has link tracks that run as it drives, plates have bolts and the deck has a power light in the team's colour that goes out when the bot is knocked out; on Full and Ultra each venue has its own floor (steel panels, welded plate at Stahlbrück, planks at Eisenau, concrete at Grauwald) with no flat grid, walls with work lights and a lighting mast at each far corner; on every tier the floor is worn, a big hit leaves a mark on it until the round ends, and boards along the far wall name the venue; the Fight tab opens on Spar under a strip of four pages (Spar, Daily, Highlights, Codes), its four picker rows open one at a time and show what is picked, the Fight bar stays at the bottom and starts the fight, and a result shows under the page it came from; on Shop and Career the 3D view is a short strip in portrait and full size again on the other tabs; Career opens on This week under a strip of four pages (This week, Season, Sponsors, Record) with the Close week bar at the bottom, Shop in a career has five pages (Workshop, R&D, Team, Books, Saves) and the backup buttons are on Saves, and on Bench What the bench says is above the tests once one has run; switching tabs and pages fades the page up, buttons press in under a finger, fitting or closing a week counts the money in the header with the change under it, an empty Highlights, Sponsors or trophy shelf shows a card with a button that takes you where to fill it, and with Settings → Motion Reduced none of that moves; Build → Weapon lists the Eggbeater and the Drisk (in a career after the mill and the lathe), each shows on the bot (an open frame; a thick toothed disc poking out of the front) and spins in a fight; a career event is
  fought and a week closes; a save slot saves and loads; Back up then Restore
  round trips; the Daily challenge fights and keeps a score; a Share code from a
  post-mortem plays back through Watch a code; Settings opens and the theme switches; on Full, no "Graphics
  lowered" toast; portrait and landscape; no console errors on desktop. The
  full checklist is at the end of `docs/HISTORY.md`.

## Longlight brand (studio pieces only)

Scrapline uses the Longlight palette as its own look (plan section 2). The studio logo applies only to studio pieces: the studio logo or splash, the "Longlight Interactive" credit line, the studio block on a credits or about screen, and any link back to the studio site (https://longlight.games/). Use the official logo files from `Jxstrr0/Kelbo.Website` (`assets/press/longlight-logo-dark` / `-light`); copy them in, never hotlink, redraw or recolour them. Name: always "Longlight Interactive" in full.

## Studio catalogue

`LONGLIGHT-STUDIO.md` (repo root) covers every Longlight game: looks, names
already taken, storage and cache prefixes (once one shared origin), a reuse map and
improvement ideas. Read it before pitching new ideas, names or looks, and
before building a system another Longlight game may already have. This file
wins where the two disagree. Don't edit the copy here: the master is
`.github/LONGLIGHT-STUDIO.md` in Jxstrr0/Kelbo.Website; it gets recopied.
