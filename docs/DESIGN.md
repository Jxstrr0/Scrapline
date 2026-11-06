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

## 0.1.4.0: the fight simulation (PR 4a)

- **The fight is run by the sim, not the view.** `SIM.newFight({bots, arena, seed, rules})` then `SIM.stepFight(F, inputs)` at a fixed 60 Hz, or `SIM.runFight(opts)` to the end. Same seed, same builds, same player inputs: the same fight, every time, in a browser or in node. Any number of bots, each with a team, so rumbles and tag team are just longer bot lists.
- **Bodies:** each bot is its build's outline (a box, or the custom shape with its cut corners) with the build's mass and yaw inertia, pushed by tank steering: each side's wheels push like a DC motor (full push at a standstill, none at top speed), capped by grip. Tyres scrub when turning and resist sliding sideways. A lost wheel takes its share of that side's grip, a lost drive pod its share of the push; a side with no pods, no wheels or a dead speed controller is out.
- **Height:** bots can be in the air (a flip, a big vertical spinner hit, a lifter tipping them). In the air there's no drive and no bumping into other bots; landing hurts by the drop test's maths, and a big enough throw can land a bot upside down. Upside down, a bot whose wheels stand proud of both faces drives on; anything else has to self-right (a self-righter takes 1.2 s; a flipper fires a shot) or it is stuck.
- **Wedges:** when a bot's front touches another bot, the lower edge gets under if it is lower by more than the tolerance (0.3 mm on a beetle): the other bot's front edge, or its ground clearance on any other face. The bot that's under keeps a fifth of its grip, its own weapon lands half, and the wedge's hits skip its armour's deflect. Front to front within the tolerance, a skid plate wins, then the harder edge.
- **Weapons,** each with a working zone in front of the bot (a circle round a horizontal disc):
  - **Spinners** spin up on the bench's motor curve and slow with the weapon off. A hit needs a quarter of top speed and lands stored energy x bite (a little random each time). A hit on a plate that deflects, unless the target is lifted, glances off for 30%. The disc loses that share of its energy. The target takes 65% as damage and 35% as a throw (verticals and drums throw upward), and the attacker is kicked back by the weapon's recoil.
  - **Self-damage:** a hit over the material's bend rating bends the disc (half energy from then on, and it spins up slower); a huge hit at full speed can shear the shaft.
  - **Flippers** fire a shot (12, with a second to recharge) and launch anything they can lift, as high as their energy allows. **Lifters** hold a bot up (a tenth of its grip) and tip it over after 0.8 s if the arm is long enough; any hold lets go after 10 s (the league's hold limit), and the lifter needs 2 s before it can grab again. **Hammers** swing down on the top; **crushers** bite the top and hold the bot while they close.
- **Damage:** every hit goes through the bench's damage model (absorb, plate, then the most exposed part behind the face). The fight adds the effects:
  - a dead side;
  - a damaged battery that may smoke (power drops to 60%);
  - a destroyed battery: dead, unless a failsafe ESC keeps one cell going;
  - speed controllers: one side dies below half hp, the bot dies with them;
  - the weapon motor dies below 35% (the disc only coasts), and the weapon is gone at 0;
  - a self-righter lost;
  - chassis flex: a battered chassis lets the armour absorb less.
  
  Knocks against bots and walls do a little damage too. Motors heat up and back off to half power, and the battery runs down.
- **Ends:** a knockout (immobile for 10 s: dead, both sides out, a flat battery, or stuck upside down; being thrown about doesn't stop the count), the pit (once PR 4b's arenas have one), or the bell. For now the bell goes to whoever lost the smaller share of their hp; PR 4b brings the judges.
- **The log** holds every hit, failure, flip, landing and knockout with its time, plus the seed, builds, arena and rules, and the player's inputs. The inputs are read at 30 Hz, each stick axis in 63 steps, small changes packed into a byte. So a busy round's log is about 12 KB, under the 20 KB cap. `SIM.replayFight(log)` plays the same fight again from it, and a replay's own log replays too. If a stick shaken flat out every tick ever makes the inputs too big to fit, the log keeps the story and gives up the replay (`noReplay`). Each bot's result also carries its fight flags (a bent disc, a smoking battery, a dead speed-controller side, a saved cell); a bent disc reads as a damaged weapon.
- **Two AI drivers,** each with a skill (how late it reacts, how far its aim wanders): **rush** drives at the nearest enemy with the weapon on; **keep-away** circles at a distance until its disc is up to speed (or the enemy looks away), then closes. Both back off when stuck, self-right when they need to, and fire flippers and hammers when the enemy is in reach.
- **The Fight tab** plays the fitted bot against any test build in a top-down view, both AI-driven, at 1x, 2x or 4x:
  - the view shows outlines, heading lines, weapon zones (a spinner's glows as it spins up), hit flashes, shadows in the air, and UNDER / INV / LIFTED / OUT markers;
  - under it, each bot's weapon, battery, heat and damage, and the log in words.
  
  It pauses when the phone hides the page or you leave the tab. It saves nothing.
- **`tools/fight-test.js`** fights every test build against every other, 20 seeds, both AIs (2,640 beetle fights in about half a minute), and prints win rates, damage, fight length and knockouts, with `-m` for the matchup matrix. It also checks:
  - repeatability and replay;
  - log size and NaN;
  - the step budget (about 3.5 µs a step against 2 ms);
  - carried-in damage;
  - a 4-bot rumble;
  - that the wedge gets under the brick and a flipper lands a bot upside down.
  
  The balance targets are printed, not enforced, until PR 4b.

## 0.1.5.0: opponents, arenas, judges and balance (PR 4b)

- **Arenas** (`ARENAS` in `sim/arenas.js`), each a walled square with its hazards' numbers written down like a weapon's:
  - **Test box:** walls only.
  - **Tabletop** (ants): a small table with an open pit on one side.
  - **Club box** (beetles and hobbyweights, the Gemeindehalle): a pit by one wall that opens at 0:20, and a wall pusher opposite.
  - **Regional arena** (featherweights): two pushers, a floor spinner, and a pit in a corner that opens at 0:30.
  - **The Eisenhalle** (heavyweights, the Scrapline Open): pushers on two walls, two floor spinners, and a pit that opens at 0:45.
  
  A **pusher** shoves anything in its strike zone across the floor and dents the face that meets it. A **floor spinner** hits from below, throws the bot up and sideways and spins it. Both re-arm after a few seconds. The layout turns by a quarter turn picked from the seed (same seed, same layout), and the start spots are turned to keep as far as they can from the pit and the floor spinners.
- **The judges** (`JUDGE_WEIGHTS`): at the bell, damage counts 50, aggression 25 and control 25, and the scores always add up to 100 (rounded to tenths so each row and the totals add up exactly).
  - Damage is the hp each side took off the other in this fight; carried-in damage and knocks between teammates don't count.
  - Aggression is time spent closing or in contact, less time running away.
  - Control is time the other bot spent lifted, pinned on a wall, stuck upside down, or under a wedge that is driving it about (sat still underneath isn't control). Each shove into a hazard adds a few seconds.
  
  The Fight tab shows the three scores in a table.
- **New rules:**
  - **Pin limit:** a pin (under a wedge, or against a wall) is broken after 10 s, like a lift: the pinner backs straight away from the pinned bot for 1.2 s (forwards if it was pinning with its rear).
  - **Discs against wedges:**
    - A vertical disc or drum spinning above half speed meets a wedge first, so nothing gets under its front (not even on a tie between two equal front edges).
    - A vertical that hits a sloped front (wedge, flipper, lifter) catches the lip: 1.8x the energy (drum 1.3x), no glance.
    - A sloped front adds to the chance a horizontal disc or undercutter glances off.
  - **Gyro:** a vertical disc at full speed fights turning (heavyweights' discs more so).
  - **Self-flip:** a big hit can throw a vertical spinner onto its back.
  - **Shock:** a hit with 60% or more of the disc's full energy has a small chance (per class, halved by failsafe electronics) to shake the electronics loose, whatever the armour. This is where the heavier classes' single-hit knockouts come from.
  - **Featherweights** keep a little more grip when caught on a wedge (30% against 20%).
  - **Heavyweight hits** count 1.2x, because their discs spin up slower and land fewer full hits.
- **Eight AI styles** (`AI_STYLES`): rush and keep-away from PR 4a, plus:
  - **aggressive:** rushes and fires early;
  - **cautious:** circles wide and backs away from a charge;
  - **counter:** waits, then strikes when the enemy commits;
  - **box-rush:** pushes the enemy into a wall;
  - **hazard-pusher:** lines up and pushes the enemy into the pit or a hazard;
  - **opportunist:** goes for the most damaged enemy.
  
  `"auto"` picks a style from the build:
  - spinners keep away;
  - wedges, lifters, flippers and pushers push to hazards (to the wall in a plain box);
  - everything else goes aggressive.
  
  Every style keeps off the pit from two seconds before it opens, brakes hard at its edge, backs off when stuck or when two bots are circling each other in contact, and reverses out from under a wedge.
- **15 opponents** (`OPPONENTS` in `sim/opponents.js`), three per class, each with a build within its weight limit, a driver (style and skill), a home venue and a one-line personality.
- **The Fight tab** now has:
  - pickers for the opponent (the named ones and the test builds), the arena (the class's own first) and your bot's driving style;
  - the opponent's personality line;
  - the pit and hazards in the top-down view;
  - "The pit opens at m:ss";
  - the judges' table;
  - log lines for hazards, pin releases, shocks and self-flips.
- **Balance** (`tools/fight-test.js`, 12 seeds at driver skill 0.5 and 0.85, each class in its own arena): every test build lands within 35-65% against the other test builds, give or take the sampling noise. Sloppy budget is left out of the target. Single-hit knockouts run 0.2% (ant), 0.5% (beetle), 1.3% (hobby), 3.5% (feather) and 3.6% (heavy). In beetle, wedge beats horizontal spinner 65% and vertical beats wedge 75%. The full table is in the 0.1.5.0 commit message.
- **Tuning that moved:**
  - `FIGHT`: damage share 0.40 (was 0.65), throw share 0.15 (was 0.35), vertical zone width 0.7, undercutter zone 0.8.
  - `PARTS`: horizontal disc 5,600 rpm and bite 0.62; drum 11,000 rpm; undercutter 5,500 rpm and bite 0.62.
  - The Brick test build has grippy PU wheels and an anti-spinner bar.

## 0.1.6.0: the arena, your own driving, hit feedback, sparring (PR 5)

- **The bot in 3D** (`vis/bot.js`) is made from the build, on every tier:
  - the chassis polygon extruded to its height, in its material, with an armour panel per face as thick as the plate;
  - the wheels where the layout put them (tracks as belts);
  - the weapon by type: horizontal disc, undercutter, vertical disc, drum, saw on uprights, hammer or crusher arm, flipper plate, lifter forks, a wedge's ramp;
  - a team stripe on top (clay for you, then lilac, green and blue).
  
  Damaged parts turn grey and destroyed ones vanish. Meshes are cached by build and freed when they drop out of the cache. The workshop shows the draft on the Build tab and the fitted bot elsewhere.
- **The arena** (`vis/arena.js`): a floor with a 30 cm grid, steel kerbs with glass screens (the near one left open), corner posts whose lamps light while a hazard fires, wall pushers that shove out, floor spinners that spin, and a pit under a hatch cover that slides away when it opens. Full and Ultra add a crowd beyond the walls and shadows.
- **The camera** looks down at about 55 degrees, follows the middle of the bots still in the fight and pulls back as they spread, fitting the narrower side of the screen. It shakes on hits, never under reduced motion.
- **Fight mode:** the arena fills the screen. The top bar has the clock, a note (the pit, the pin limit, self-righting), 2D and Pause. Under it is a strip per bot: a damage silhouette (each face and part green, amber or red), then weapon, battery and heat bars, and a state line. When the fight ends, a banner offers Rematch or Results.
- **Controls** (`app/controls.js`, Settings → Controls):
  - **Direct:** a stick that appears where your left thumb lands, a weapon button on the right, and a self-right button when you're stuck upside down. Left-handed swaps the sides.
  - **Tactical:** tap the floor to drive there, tap an opponent to attack it, tap your own bot to back off.
  - **Keyboard:** W A S D or the arrows, space, R. **Gamepads:** left stick, A or the right trigger, Y or B.
  - Each thumb follows its own pointer, so two never fight.
  - The weapon button switches a spinner on and off, fires a flipper or hammer, and lifts while held.
- **Assists** (`ASSISTS` in state.js; Settings → Driving assists): you drive as a rookie, which means auto-straighten, turn damping, and a disc that only spins up when they're near. Drivers (PR 8) will shrink these.
- **Hit feedback** (`vis/fx.js`): sparks scaled by the hit (Lite 90 at most, Full and Ultra 260, bloomed on Ultra), a destroyed part or broken plate flying off, smoke from a smoking battery, camera shake. Sound (`sound/synth.js`): clangs scaled by the hit, a whine following each disc, a drive hum (Settings → Sound). The phone buzzes for hits on or by you, harder for bigger ones.
- **Sparring:** any opponent in the class, any arena, one on one or a four-bot rumble, driven by you or by the AI in any style (the speed choice is for AI fights). No stakes and no repair bill. The results card has the outcome, the judges, every bot's state and the log.
- **Saves:** `SAVE_V` 4 adds `settings.controls`, `leftHanded` and `assists`.

## 0.1.7.0: the pit window, the post-mortem, replays (PR 6)

- **Best of three** (Fight tab → Format): the first to two rounds, at most three. Damage carries from round to round, and so do the failures (`newFight` takes `flags: {bent, smoke, cell, esc}`): a bent disc, a smoking battery, a failsafe cell keeping a dead battery alive, a dead speed-controller side. Stopping counts as "Bout stopped", whatever the score.
- **The pit window** (`app/pit.js`): 60 real seconds between rounds. You pick repairs from a list of what's broken; one runs at a time, and the clock keeps running while you choose. It pauses if the page is hidden or the tab is left. A repair still running at the bell is lost, and so is its spare; Ready during a repair stops it and puts the spare back. A repair longer than the time left is greyed ("no time"). Starting a repair keeps the focus in the panel, and "done" and "ten seconds left" are read out.
  - `PIT_KITS`: basic (2 wheel swaps, 2 bodges), full (4 wheels, 3 bodges, 2 belts, 2 armour panels, 1 battery), pro (adds 2 drive pods and a spare weapon, 4 bodges, 4 panels, 2 batteries). The counts are for the whole bout. Kits are free when sparring; their price times the class's `prizeScale` applies from the career on.
  - `REPAIR_TIMES`: wheel 15 s, belt 20, battery 25, armour panel 30, drive pod 35, spare weapon 30, bodge 10.
  - A swap puts the part back to new. A belt fixes a damaged weapon; a bent or wrecked one needs the spare (pro only). A bodge patches anything but the chassis or a bent disc to half strength, and only helps below half; a bodged speed controller brings its side back. A new battery stops smoking. The chassis can't be fixed in the pit, and a bent disc only with the pro kit's spare.
  - The other corner's crew (`pitAuto`) picks the repairs worth most per second until its 60 s are used: the battery and speed controllers first, then the drive, the weapon, the armour.
- **The post-mortem** (`app/report.js`), under the results:
  - a timeline of the round's hits, yours above the line and theirs below, bar height by energy, red where a part broke;
  - a damage map of your bot;
  - what went wrong, in order: every plate and part you lost with its cause ("left front wheel lost at 0:42: undercutter hit on your left side, 85 J; the left side plate had given at 0:30"; a hit after they got under you adds both front edges), plus the failures that aren't parts and how it ended;
  - a redesign hint: the biggest reason (the pit, ending upside down, a sheared shaft, being wedged when it cost you, a bent disc, a flat battery, heat, or the face that took the most), told by the stress report's own `COMBOS` line when one fits, else in plain words, with Open Build.
- **The repair bill:** a destroyed part is re-bought at its price, and a damaged one costs 10% to 60% of it by hp lost (`REPAIR_COST`). A broken chassis costs 80% to rebuild. A plate, a wheel or a drive pod is priced as its share of the set. Hours come from `REPAIR_HOURS`, halved for a damaged part. It's shown only; the career charges it from PR 7.
- **Their build is revealed** after the fight: weapon and material (and the J it stores), armour per face, chassis, drive and speed, power, extras, weight, front edge. **Copy to designs** saves it as "<name> (copy)"; you still pay to fit it.
- **Replay** re-runs the sim from the log (seed, builds, carried damage, your recorded inputs) in the same arena view, 2D included, on every tier. It plays at ½×, 1× or 2×, and a scrub bar jumps anywhere. A jump re-runs the sim from the start to that moment (a round is under 6,000 steps, a few milliseconds), so no keyframes are needed and Lite scrubs too. The scene is kept across a jump (`SCRAP_VIS.setFight(F, true)`). A round's replay ends exactly where the round did, Stop included.
- **The plan's check:** a replay run to the end matches the round it came from (winner, reason, step count, each bot's damage). `tools/fight-test.js` checks that a carried bent disc stays bent and replays the same.
- **Saves:** nothing new (no `SAVE_V` change). Copy to designs uses `designs`, which already exists.

## 0.1.8.0: the career, the circuit, money, saves (PR 7)

- **Starting:** Career tab → Start a career. A fresh start (Kelbo, PR 7): Th 1,500, hand tools, a rented corner, 32 workshop hours to begin with, nothing fitted. Bots fitted while sparring are cleared (they were free); saved designs stay. The Beetle draft is the starter bot: the default build with anything a new career can't fit swapped out (a thick HDPE front instead of steel). It costs Th 518 and 16.6 h to fit.
- **The week** (`TIME`): you act, then **Close week**. Rent comes out (`WORKSHOP_STAGES`: Th 15 a week in the corner) and the week's hours come in (16 in the corner). Unused hours carry over up to two weeks' worth. Fitting, repairs and the paid bench tests spend hours. A season is 52 weeks; the year moves on with it; twenty seasons in all.
- **Acts** (`TIME.acts`): Garage (ant and beetle), Circuit (hobby and feather), Heavyweight (the Scrapline Open, heavy), Legacy (after winning the Open). You see your act's calendar and the one before's. At the end of a season you move up if you placed top two at the act's championship or your rep reached its `repTo` (60, 160, 320); from Heavyweight to Legacy you have to win the Open final. A class outside your acts can't be fitted ("opens in the Circuit act"), and a heavyweight needs a proper shop (`maxCls`).
- **The calendar** (`SEASON_EVENTS`, the same each season): ten Garage days (six club meets, the Haldis Spring Cup, Rumble night, the Stahlbrück Beetle Cup, the Haldis Club Championship), nine Circuit days across Stahlbrück, Eisenau and Grauwald (tournaments, two rumbles, tag team, the Regional Final), eight at the Eisenhalle (five Open rounds, a rumble, tag team, the Open Final). One a week at most (Kelbo, PR 7: about ten a Garage season).
- **Entering** (this week's event card → Enter): the entry fee and the prizes (`EVENT_KINDS`, x the class's `prizeScale`), travel (`WORLD.venues` km both ways at Th 0.30 a km x the stage's travel, plus Th 45 a night away) and a pit kit (none, basic, full or pro, x `prizeScale`). The day takes 6 hours of your week plus 4 a night away. Your fitted bot goes as it is, damage and all.
- **The field:** drawn from the seed: the rivals with a bot in the class (one at most at a club meet), then the class's named opponents and the test builds (Sloppy only at club meets). Drivers get the kind's skill (club 0.45 up to championship 0.7) plus 0.08 an act; named opponents and rivals keep their own if it's higher.
- **Formats:** a club meet is a four-bot round robin (three fights each; 3 points a win, 1 a draw; level on points goes to the damage difference). Tournaments and championships are eight-bot brackets, best of one to the final and **best of three in the final**; a level bout goes to the smaller damage share. A rumble is one four-bot free-for-all, placed by the winner, then who's still going, then the least damaged. Tag team is you and a partner against two.
- **Your fights** (Kelbo, PR 7): before each one, **Drive it** (fight mode on the Fight tab; the bell hands the result straight to the career, then "To the pit" when you have another fight and a kit, or Back to the event) or **Quick sim** (the AI drives your bot at your driver skill, your crew does the pit work with your kit, and the fight is there to watch afterwards: results, post-mortem, replay). The other fights are simulated. Everyone's damage carries through the day, and the other crews do their pit work between their fights with the kind's kit. Stopping a fight or a bout forfeits it.
- **After the day:** prize money and rep by placing (rep: club 5 / 3 / 1, tournament 12 / 7 / 3, rumble 6 / 2, tag 6, championship 20 / 12 / 5 / 1). The damage goes home with the bot (`bots[cls].damage` and `flags`). The workshop card lists the repair bill (`rpBill`, the same as the post-mortem's) with Fix per part and Fix all, for thalers and hours. Unfixed damage goes to the next event. Closing the week with an event unfinished forfeits the rest.
- **Repair hours:** a damaged part now takes 0.2 + 0.6 x the share of its hp lost of the kind's hours (it was half, which charged 0.8 h for a 3% scratch on a drive pod); a destroyed one takes all of them.
- **Money** (Shop tab → The books, the last 60 lines): prizes in; parts, repairs, pit kits, entries, travel, tools, the workshop and rent out. Rent you can't pay at Close week brings the Haldis Savings Bank's one loan of Th 1,000 (Th 1,100 owed; half of every prize pays it back). Broke again ends the run, with a new career on offer (designs stay).
- **Tools** (`TOOLS`, Shop tab): hand tools to start; a 3D printer, bandsaw, drill press and welder fit in the corner; a mill, lathe and press brake need your own unit; a CNC router needs a proper shop. Parts with `unlock: tool:<id>` show "needs a drill press" on the Build tab and can be drafted but not fitted. Each tool cuts the build and repair hours of the slots it names; cuts multiply, down to half. Parts behind R&D say "needs R&D (PR 8)".
- **The workshop** (`WORKSHOP_STAGES`): a rented corner (16 h a week, up to featherweight), your own unit (Th 4,000, 22 h), a proper shop (Th 15,000, 30 h, heavyweights, travel 15% cheaper), team HQ (Th 60,000, 40 h, a trailer, travel 40% cheaper). Moving goes one stage at a time.
- **Driver skill** (`TIME.levels`, `TIME.xp`): 3 xp for a fight you drove, 1 for a quick sim, 2 more for a win. Rookie, club at 25 xp, pro at 70: the assist level (`ASSISTS`) when you drive, also shown in Settings → Driving assists. A quick sim drives at skill 0.5 + 0.002 a point of xp, up to 0.9.
- **Rivals** (`RIVALS`): Ottilie Brandt (the Haldis, flippers), Rudi Kessler (Stahlbrück, armour), Mira Vogt (Eisenau, spinners), Anselm Huber (Grauwald, hammers). Each has a bot per class and a list of upgrades: one a season, and one more for every two times you beat them (an upgrade that won't fit the weight limit is skipped). They drive better with each upgrade too. They remember every fight (`S.rivals`: wins, losses, a run, the last one) and say one line before you meet, by how the last one went. The Career tab lists them with your record.
- **Save slots** (Shop tab): three, in `scr-slot1` to `scr-slot3` (the keys PR 0 reserved, already in backup codes). Save here copies the current game; Load replaces it and keeps this phone's settings. Both ask "Sure?" first.
- **Sparring stays free practice** (Kelbo, PR 7): fresh bots, nothing charged or kept, during the career too. During an event the Fight tab shows the way back to it.
- **First-pass numbers** (a quick-sim player who never buys a tool, `pr7b`-style runs in the browser): season 1 at club level nets about Th 1,000 to 1,500 and usually reaches the Circuit act on rep or the championship; the Circuit then needs better parts (the hobby test builds use steel and AR500, behind tools), so a player who doesn't upgrade stalls there and can go broke. A whole season of quick sims runs in a few seconds on a desktop.
- **Saves:** `SAVE_V` 5. `career` (null until started; its shape is `crFresh()` in `app/career.js`), `bots[cls].flags`, `unlocks.tools`, `rivals`. The step from 4 sets `career` to null.

## Known loose ends

- Balance sits at the edges in places (0.1.5.0 numbers):
  - Lifter 65-67% in ant, beetle and hobby; Undercutter 69% in ant.
  - Drum 68%, Invertible box 68% and Hammer 32% in beetle; Drum 67% in feather; Wedge 70% in heavy.
  - The harness fails a test build more than 5 points outside 35-65% (not on a `-q` quick pass, where 4 seeds are mostly noise); inside that, it just lists it (sampling noise is about 3-4 points at 12 seeds).
  - The pit decides most small-class fights (79% of ant fights, 64% of beetle).
  - Named crushers are strong: Schraubstock 67%, Zange 86% (crushers aren't among the test builds). The career (PR 7) sets who meets whom.
- The pin limit takes over the player's drive for 1.2 s; the fight screen's note says so.
- The HUD shows the weapon's speed as a bar, not rpm.
- The 3D view doesn't interpolate between sim steps; Lite draws at 30 fps, so this hasn't mattered.
- The HUD's damage % still includes carried-in damage (the judges don't).
- Airborne bots skip collisions, so a tipped bot can land overlapping the other for a step or two before they push apart.
- Replays moved between phones: the sim uses `Math.sin`, `cos`, `atan2` and `hypot`, which browsers don't promise to round identically, so a replay could drift on another engine. Replays are only kept for the session on the same phone for now (nothing is saved), so it hasn't mattered; decide before a replay is ever shared or saved.
- Spinner disc against spinner disc (weapon clashes) isn't modelled yet: a hit is a hit on the face it lands on.
- Rounds in a best of three start with a full battery: only its damage carries.
- Each round's repair bill on the post-mortem is everything still broken after that round, so the rounds' bills overlap; the career charges only what comes home (the workshop card).
- The repair bill and the pit work only on your bot; the post-mortem covers bot 0 only (in a rumble too).
- A quick sim of a bracket runs every other fight of the round at once: on a slow phone that is a short pause (a beetle fight is about 50 ms of sim on a desktop).
- An event fight that's interrupted by a reload isn't counted, so it can be fought again.
- Rumbles and tag team are single fights, so they never get a pit window.
- After the run ends (broke twice, or twenty seasons) fitting is free again until a new career starts.
