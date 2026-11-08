# Notes for Claude

Scrapline is a combat-robot builder and career game by Longlight Interactive: design a fighting robot under a weight limit, prove it on the bench, drive it against an opponent whose build is just as considered, patch it in the pit, read the post-mortem and build better, from a plywood box in a rented corner of a Haldis machine shop to the televised Scrapline Open. Phone-first, free, one self-contained page (`index.html`, built from `src/`), live at https://scrapline.longlight.games/. The game shares its name with its in-game league, the Scrapline (its televised heavyweight league is the Scrapline Open). **The build plan is `docs/SCRAPLINE-PLAN.md`**: read it before starting any PR, do one PR at a time, tick it off in its checklist. The game as built is `docs/DESIGN.md`.

Sister project: Prairie Engine Works (`Jxstrr0/350Chev`, PEW). The stack, build script, save codes and save safety are lifted from it; when in doubt, look at how PEW does it. **PEW is the only reference.** Do not read, copy or follow the Escapement repo for anything: it only supplied the setting's names (Velmark, the Haldis).

## Stack

- Plain HTML, CSS and classic (non-module) JavaScript in a few big `<script>` blocks. No package.json, no npm, no bundler, no CI. The node scripts below are the only checks.
- three.js **r128** from cdnjs. The bloom addons for Ultra come from jsdelivr `three@0.128.0` (the `SCR_LIBS` list in `src/html/body.html`, loaded on demand through `window.__scrPost`; a Lite phone never loads them). Google Fonts: Space Grotesk (UI) and JetBrains Mono (readouts). The voice pack loads from Longlight's asset host, `https://assets.longlight.games/scrapline/voice/` (Cloudflare R2, filled from the private `Jxstrr0/longlight-assets` repo; `VOICE_CDN` in `src/sound/voice.js`), with the repo's own `sounds/voice/` as the fallback (Kelbo, 0.1.17.2). Nothing else external.
- PWA: `manifest.webmanifest`, `icons/`, and the generated `sw.js`. Installed copies work offline.
- Assets: CC0 and CC-BY only, never NC or ND. Every one gets a line in a `CREDITS.md` next to its folder (`sounds/`, `models/`, `textures/`: name, author, licence, URL); Kelbo's own Blender work is noted as original. Ask Kelbo when a licence is unclear.
- Node 16 or newer for the scripts (22 is what was last used). Nothing to install. `tools/make-icons.js` needs Playwright (run by hand; output is committed). `tools/pack-model.py` (packs a glTF into one `.glb`) and `tools/get-polyhaven.py` (fetches a Poly Haven model or texture) need Python 3; run by hand, output committed. `tools/blender-arena-kit.py` builds `models/arena-kit.glb` (and `tools/blender-bot-shells.py` builds `models/bot-shells.glb`) with `bpy` (Blender as a Python module, `pip install bpy` in a venv); run by hand, output committed.

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

GitHub Pages serves the repo root from `main` (`.nojekyll` keeps Jekyll out). No workflow file: merging into `main` is the deploy. Allow a minute or two, then reload the live site. Installed copies show the "New version ready" bar because the service worker's cache name carries the version and a content hash.

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
- Tuning numbers live in tables, not inline, under the names the plan gives them: `CLASSES`, `PARTS`, `DEFAULT_CFG` (`sim/parts.js`), `K` (`sim/build.js`), `COMBOS`, `WEDGE_GAUGES`, `BENCH`, `BENCH_TESTS` (`sim/bench.js`), `DAMAGE` (`sim/damage.js`), `WEDGE_RULES`, `FIGHT` (`sim/fight.js`), `AI_STYLES`, `AI_SKILL` (`sim/ai.js`), `ARENAS`, `JUDGE_WEIGHTS`, `OPPONENTS` in `src/sim/`; `WORLD`, `TIME`, `WORKSHOP_STAGES`, `TOOLS`, `SEASON_EVENTS`, `REPAIR_COST`, `REPAIR_HOURS`, `PIT_KITS`, `REPAIR_TIMES`, `ASSISTS`, `RIVALS`, `RND`, `STAFF`, `SPONSORS`, `META_WAVES`, `RULES_BY_SEASON` at the top of `src/app/state.js` (plus `EVENT_KINDS`, the event formats and prizes, and `TOOL_IDS`).
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

## Current status (0.1.17.4)

The full log from PR 0 to 0.1.17.4 (what each version added, the tables and
save fields it brought) is `docs/HISTORY.md`. Read the matching entry before
changing a system it describes; add each new release there and update this
section.

- Built: the whole plan, PR 0 to PR 10. Build tab with body styles and
  weapon bays, bench tests, the 60 Hz fight sim with judges, hazards, 15
  opponents and 8 AI styles, driving with assists, best of three with the pit
  window, post-mortem and replay, the career (acts, events, money, rivals,
  tools), R&D, staff, sponsors, meta and rules, tutorial, bot card, trophies,
  free assets and Blender props on Full/Ultra, the battle screen, the voice
  pack (from `assets.longlight.games`, local fallback), effects sounds, and
  material maps on Full/Ultra, smarter AI driving (paths round the pit, pit
  and shove escapes, flanking, hit-and-run). Money is euros. `SAVE_V` is 8.
- Next (Kelbo's order, plan section 1): 0.1.18 a home screen with Career and
  Sandbox modes (separate garages), 0.1.19 a readability pass, 0.1.20+ the
  rest of the Full/Ultra graphics push (Blender weapon parts, visible damage;
  Lite unchanged), then slow-motion replays, paint and a bracket screen.
  Merged branches delete themselves on GitHub.
- What to test on a phone after any change: the loading bar finishes and the
  workshop renders on Lite; every tab opens; a spar starts, drives and ends,
  with sound (crowd, bells, the announcer's intro and Skip, captions with
  Sound off); a best of three reaches the pit and the next round; a replay
  plays and scrubs; Build changes show in the workshop; a career event is
  fought and a week closes; a save slot saves and loads; Back up then Restore
  round trips; Settings opens and the theme switches; on Full, no "Graphics
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
