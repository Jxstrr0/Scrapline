# Scrapline: the game as built

This file describes the game as it actually is on `main`. It grows as plan PRs land; the plan itself, with everything still to come, is [`SCRAPLINE-PLAN.md`](SCRAPLINE-PLAN.md).

## 0.1.0.0: scaffold (PR 0)

- **Setting:** Velmark, an invented alpine country. The player starts in the Haldis, its northern watchmaking valley, in a rented corner of a machine shop. The league is the Scrapline; its televised heavyweight league is the Scrapline Open at the Eisenhalle. Regional venues: Stahlbrück, Eisenau, Grauwald; club meets at the Haldis Gemeindehalle. All in `WORLD` (`src/app/state.js`). Career seasons start in 2026 (not playable yet).
- **Money:** euros, shown `€4,850` (whole amounts), by `fmt$`.
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
- **Wedges:** when a bot's front touches another bot, the lower edge gets under if it is lower by more than the tolerance (0.3 mm on a beetle): the other bot's front edge, or its ground clearance on any other face. The bot that's under keeps a fifth of its grip (40% in feather, 45% in heavy, from 0.1.12.0), its own weapon lands half, and the wedge's hits skip its armour's deflect. Front to front within the tolerance, a skid plate wins, then the harder edge.
- **Weapons,** each with a working zone in front of the bot (a circle round a horizontal disc):
  - **Spinners** spin up on the bench's motor curve and slow with the weapon off. A hit needs a quarter of top speed and lands stored energy x bite (a little random each time). A hit on a plate that deflects, unless the target is lifted, glances off for 30%. The disc loses that share of its energy. The target takes 65% as damage and 35% as a throw (verticals and drums throw upward), and the attacker is kicked back by the weapon's recoil.
  - **Self-damage:** a hit over the material's bend rating bends the disc (half energy from then on, and it spins up slower); a huge hit at full speed can shear the shaft.
  - **Flippers** fire a shot (18 from 0.1.12.0, was 12; with a second to recharge) and launch anything they can lift, as high as their energy allows. In ant, beetle and hobby (0.1.17.5) a flip also throws the bot further forward (`FIGHT.flipThrow`), leaves it without drive for about half a second when it lands (`flipStunS`), and counts as 2 s of control for the judges (`flipCtrlS`). **Lifters** hold a bot up (a tenth of its grip) and tip it over after 0.8 s if the arm is long enough; any hold lets go after 10 s (the league's hold limit), and the lifter needs 2 s before it can grab again. **Hammers** swing down on the top; **crushers** bite the top and hold the bot while they close.
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
  - **Tabletop** (ants): a small table with an open pit on one side (0.16 by 0.24 m at beetle scale from 0.1.17.5).
  - **Club box** (beetles and hobbyweights, the Gemeindehalle): a pit by one wall that opens at 0:30 (0.22 by 0.34 m; 0.1.17.5), and a wall pusher opposite.
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
  - **Featherweights** keep a little more grip when caught on a wedge (30% against 20%; 40% from 0.1.12.0, when heavyweights got 45%).
  - **Heavyweight hits** count 1.2x, because their discs spin up slower and land fewer full hits.
- **Eight AI styles** (`AI_STYLES`): rush and keep-away from PR 4a, plus:
  - **aggressive:** rushes and fires early;
  - **cautious:** circles wide and backs away from a charge;
  - **counter:** waits, then strikes when the enemy commits;
  - **box-rush:** pushes the enemy into a wall;
  - **hazard-pusher:** lines up and pushes the enemy into the pit or a hazard;
  - **opportunist:** goes for the most damaged enemy.
  
  `"auto"` picks a style from the build (changed in 0.1.17.4, see there):
  - undercutters rush; the other spinners and saws keep away;
  - wedges go aggressive;
  - lifters, flippers and pushers push to hazards (to the wall in a plain box);
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

- **Starting:** Career tab → Start a career. A fresh start (Kelbo, PR 7): €1,500, hand tools, a rented corner, 32 workshop hours to begin with, nothing fitted. Bots fitted while sparring are cleared (they were free); saved designs stay. The Beetle draft is the starter bot: the default build with anything a new career can't fit swapped out (a thick HDPE front instead of steel). It costs €518 and 16.6 h to fit.
- **The week** (`TIME`): you act, then **Close week**. Rent comes out (`WORKSHOP_STAGES`: €15 a week in the corner) and the week's hours come in (16 in the corner). Unused hours carry over up to two weeks' worth. Fitting, repairs and the paid bench tests spend hours. A season is 52 weeks; the year moves on with it; twenty seasons in all.
- **Acts** (`TIME.acts`): Garage (ant and beetle), Circuit (hobby and feather), Heavyweight (the Scrapline Open, heavy), Legacy (after winning the Open). You see your act's calendar and the one before's. At the end of a season you move up if you placed top two at the act's championship or your rep reached its `repTo` (60, 160, 320); from Heavyweight to Legacy you have to win the Open final. A class outside your acts can't be fitted ("opens in the Circuit act"), and a heavyweight needs a proper shop (`maxCls`).
- **The calendar** (`SEASON_EVENTS`, the same each season): ten Garage days (six club meets, the Haldis Spring Cup, Rumble night, the Stahlbrück Beetle Cup, the Haldis Club Championship), nine Circuit days across Stahlbrück, Eisenau and Grauwald (tournaments, two rumbles, tag team, the Regional Final), eight at the Eisenhalle (five Open rounds, a rumble, tag team, the Open Final). One a week at most (Kelbo, PR 7: about ten a Garage season).
- **Entering** (this week's event card → Enter): the entry fee and the prizes (`EVENT_KINDS`, x the class's `prizeScale`), travel (`WORLD.venues` km both ways at €0.30 a km x the stage's travel, plus €45 a night away) and a pit kit (none, basic, full or pro, x `prizeScale`). The day takes 6 hours of your week plus 4 a night away. Your fitted bot goes as it is, damage and all.
- **The field:** drawn from the seed: the rivals with a bot in the class (one at most at a club meet), then the class's named opponents and the test builds (Sloppy only at club meets). Drivers get the kind's skill (club 0.45 up to championship 0.7) plus 0.08 an act; named opponents and rivals keep their own if it's higher.
- **Formats:** a club meet is a four-bot round robin (three fights each; 3 points a win, 1 a draw; level on points goes to the damage difference). Tournaments and championships are eight-bot brackets, best of one to the final and **best of three in the final**; a level bout goes to the smaller damage share. A rumble is one four-bot free-for-all, placed by the winner, then who's still going, then the least damaged. Tag team is you and a partner against two.
- **Your fights** (Kelbo, PR 7): before each one, **Drive it** (fight mode on the Fight tab; the bell hands the result straight to the career, then "To the pit" when you have another fight and a kit, or Back to the event) or **Quick sim** (the AI drives your bot at your driver skill, your crew does the pit work with your kit, and the fight is there to watch afterwards: results, post-mortem, replay). The other fights are simulated. Everyone's damage carries through the day, and the other crews do their pit work between their fights with the kind's kit. Stopping a fight or a bout forfeits it. So does a driven fight the app closes on (a reload, the phone killing the page): it's recorded as a forfeit the next time the Career tab opens. Rumbles and tag team are one fight with no pit window, so they take no pit kit.
- **After the day:** prize money and rep by placing (rep: club 5 / 3 / 1, tournament 12 / 7 / 3, rumble 6 / 2, tag 6, championship 20 / 12 / 5 / 1). The damage goes home with the bot (`bots[cls].damage` and `flags`). The workshop card lists the repair bill (`rpBill`, the same as the post-mortem's) with Fix per part and Fix all, for euros and hours. Unfixed damage goes to the next event. Closing the week with an event unfinished forfeits the rest.
- **Repair hours:** a damaged part now takes 0.2 + 0.6 x the share of its hp lost of the kind's hours (it was half, which charged 0.8 h for a 3% scratch on a drive pod); a destroyed one takes all of them.
- **Money** (Shop tab → The books, the last 60 lines): prizes in; parts, repairs, pit kits, entries, travel, tools, the workshop and rent out. Rent you can't pay at Close week brings the Haldis Savings Bank's one loan of €1,000 (€1,100 owed; half of every prize pays it back). Broke again ends the run, with a new career on offer (designs stay).
- **Tools** (`TOOLS`, Shop tab): hand tools to start; a 3D printer, bandsaw, drill press and welder fit in the corner; a mill, lathe and press brake need your own unit; a CNC router needs a proper shop. Parts with `unlock: tool:<id>` show "needs a drill press" on the Build tab and can be drafted but not fitted. Each tool cuts the build and repair hours of the slots it names; cuts multiply, down to half. Parts behind R&D say "needs R&D (PR 8)".
- **The workshop** (`WORKSHOP_STAGES`): a rented corner (16 h a week, up to featherweight), your own unit (€4,000, 22 h), a proper shop (€15,000, 30 h, heavyweights, travel 15% cheaper), team HQ (€60,000, 40 h, a trailer, travel 40% cheaper). Moving goes one stage at a time.
- **Driver skill** (`TIME.levels`, `TIME.xp`): 3 xp for a fight you drove, 1 for a quick sim, 2 more for a win. Rookie, club at 25 xp, pro at 70: the assist level (`ASSISTS`) when you drive, also shown in Settings → Driving assists. A quick sim drives at skill 0.5 + 0.002 a point of xp, up to 0.9.
- **Rivals** (`RIVALS`): Kayla Rauch (the Haldis, flippers), Mitch Gerber (Stahlbrück, armour), Mira Vogt (Eisenau, spinners), Anselm Huber (Grauwald, hammers). Each has a bot per class and a list of upgrades: one a season, and one more for every two times you beat them (an upgrade that won't fit the weight limit is skipped). They drive better with each upgrade too. They remember every fight (`S.rivals`: wins, losses, a run, the last one) and say one line before you meet, by how the last one went. The Career tab lists them with your record.
- **Save slots** (Shop tab): three, in `scr-slot1` to `scr-slot3` (the keys PR 0 reserved, already in backup codes). Save here copies the current game; Load replaces it and keeps this phone's settings. Both ask "Sure?" first.
- **Sparring stays free practice** (Kelbo, PR 7): fresh bots, nothing charged or kept, during the career too. During an event the Fight tab shows the way back to it.
- **First-pass numbers** (a quick-sim player who never buys a tool, `pr7b`-style runs in the browser): season 1 at club level nets about €1,000 to 1,500 and usually reaches the Circuit act on rep or the championship; the Circuit then needs better parts (the hobby test builds use steel and AR500, behind tools), so a player who doesn't upgrade stalls there and can go broke. A whole season of quick sims runs in a few seconds on a desktop.
- **Saves:** `SAVE_V` 5. `career` (null until started; its shape is `crFresh()` in `app/career.js`), `bots[cls].flags`, `unlocks.tools`, `rivals`. The step from 4 sets `career` to null.

## 0.1.9.0: research, team, sponsors, meta (PR 8)

- **R&D** (`RND`, Shop tab): one project at a time; put hours in from the week's (each project's hours and price, some need a tool first). Done projects unlock their parts: high-discharge cells, your own disc profile, the high-pressure flipper (pneumatics), the crusher, brushless drive, the overhead saw (Circuit act), minibots (Circuit), titanium (Circuit), the custom chassis (Circuit). A finished project says what it opened.
- **Your own disc** (Build tab, weapon row, Kelbo): one to three teeth (one bites 15% harder and kicks back 10% more; three bite 12% less and kick back 15% less) and a light, medium or heavy rim (0.85, 1, 1.2 of the disc's mass; a heavy rim stores more and spins up slower), plus a name of up to 24 characters (renaming is free: the fitted disc takes the name). The medium two-tooth disc is the stock one, number for number. Changing it pays for the disc's material again.
- **The team** (`STAFF`, Shop tab): one person per role, two to pick from in each (a cheaper one from the start, a better one from the Circuit act). Wages are weekly (salary / 52): the first week on hiring, then at each Close week. Engineer: build and repair hours down 15% or 30% on top of the tools, and the stress report's impact and drop lines on paper, without the bench. Fabricator: needed to fit custom work; cuts its hours. Driver (Kelbo): quick sims at skill 0.7 or 0.86. Pit crew: the pit window's repairs 25% or 40% quicker, for you and for your quick sims.
- **Sponsors** (`SPONSORS`, Career tab): after a podium, with enough rep, an offer comes (one at a time; it lapses at the season end). Signing pays the season's money at once, less the weeks gone (a quarter at least). Each has a paint slot (side panels or a patch on the top plate) and a target (podiums, wins, a championship place, rep gained; only results after signing count). At the season end they renew and pay again if you hit it, and drop you if you didn't. Two at most, one per slot. One you drop or swap out won't offer again that season.
- **The meta** (`META_WAVES`): spinner era, wedge era, undercutter era, armour era, a season each, round and round. The era's weapons come first when an event's field is drawn. The Career tab names this season's and next season's.
- **Rules** (`RULES_BY_SEASON`, announced a season ahead, and they add up): season 2 on, the spinner energy cap (150 J at beetle scale, scaled by class; a bigger disc just spins slower); season 3 on, a floor spinner in the club box; season 4 on, the beetle limit at 1.6 kg; season 6 on, the count is eight seconds. (Season numbers count from 1 here; the table's `season` is the one before.)
- **Minibots** (Kelbo): with the project done and the extra fitted, a little HDPE wedge pusher one class down starts behind you, on your team, driven by the AI (rush). It doesn't count for a knockout, the judges (nothing done to it or by it scores), placings or the damage bill, and it goes out when you do.
- **The kit line** (`KIT_LINE`, Legacy act, Kelbo): publish one of your designs (once a season). At each season end it fights the class's test builds in the sim (one seed each at skill 0.6, so publishing and the season end pause for a moment on a phone); income = €400 x the class's prize scale x its win rate x (1 + rep / 200).
- **Saves:** `SAVE_V` 6: `career.rnd {cur, put, done}`, `career.offers`, `career.kit`, `career.repY0`; `staff` and `sponsors` are arrays of `{id, y, w}`.

## 0.1.9.1: hotfix

- A comment in `ftOverlay` had swallowed the declaration after it, so every fight threw and never reached its bell banner (from 0.1.9.0's review fixes). Split back into two lines.

## 0.1.10.0: the tutorial, bot cards, trophies, Effects, landscape (PR 9)

- **The tutorial** (`app/help.js`, Kelbo: coached, on a loaner): eight steps, each a spotlight on the real control and a card. 1 a loaner beetle; 2 load the Wedge from Designs → Starting points; 3 fit it; 4 run the impact test on the Bench; 5 read it; 6 spar Feierabend (a careful club bot), one on one, you driving; 7 read the post-mortem; 8 that's the loop. The steps with a task move on by themselves when it's done; the card says which tab a step is on if you wander off, and hides in fight mode and while a sheet is open. Offered once, after the intro, to a new player (a save from before 0.1.10.0 counts as seen); **Settings → Tutorial** runs it again; **Leave the tutorial** ends it at any step.
- **The loaner:** starting takes a copy of the whole game, then clears the career, bots, staff and sponsors. While it runs nothing is written to storage (`TUT_ON` in `save()`), and saving to a slot is refused. Ending puts the copy back and keeps the phone's settings. Closing the page mid-tutorial loses nothing. Loading a slot or restoring a backup ends it first. Ending it puts back the class you had picked. A backup taken mid-tutorial holds the real game, not the loaner, and the backup reminder waits until the tutorial is over.
- **Restoring a career fixed** (older than PR 9): the restore check still expected the PR 0 career shape (`rep` an object, `loan` a number, `events` a list), so any backup holding a career from 0.1.8.0 on was refused as damaged. It now checks `crFresh()`'s shape on saves from v5 on; `check-savecode.js` has a career in today's shape.
- **The bot card** (the camera button over the 3D view, Kelbo): a 1080 x 1350 picture. The fitted bot (the draft when nothing is fitted) from a fixed three-quarter view (`SCRAP_VIS.shot(w, h)`: an off-screen render target at twice the size, scaled down, no bloom), its name (a matching saved design's name, else the disc's, else "My beetleweight"; you can rename it on the card, not stored), class, weight against the limit, weapon, top speed, weapon energy, weakest side, run time and its career record in the class. No 3D: the top-down sketch instead. Share (the share sheet with the picture where it takes files) or Save picture (a download), PEW's `phoSave`.
- **Trophies** (Kelbo): every event you win puts a trophy on the shelf (Career tab); a championship win and a move up an act are gold. Each one has a card (cup, event, venue, year and week, class, weapon, act) to share or save. Kept in `career.trophies`, newest first, 80 at most; a new career starts an empty shelf.
- **Effects** (Settings, Kelbo: its own setting): Reduced is a quarter of the sparks (six at most a hit), no parts flying off, three puffs of smoke at most, and small steady hit rings in the 2D view. Motion still covers the camera shake and the menus.
- **Landscape:** on a phone on its side (under 560 px tall), the 3D view is the left 44% and the tab and its tab bar are on the right, instead of a strip under the view. The tutorial card sits over the panel.
- **Polish:** the Career tab's old "Team, sponsors and R&D (PR 8)" placeholder card is gone.
- **Saves:** `SAVE_V` 7: `settings.effects`, `settings.tutDone`, `career.trophies`. No new localStorage key.

## 0.1.11.0: free props, textures and recorded sounds on Full and Ultra (PR 10)

- **Props** (`vis/props.js`): 20 CC0 models from Poly Haven (`models/`, credited in `models/CREDITS.md`), packed to `.glb` with `tools/pack-model.py` (copied from PEW) by `tools/get-polyhaven.py`. Each workshop stage has its own set of 8 or 9 behind and beside the bench (`SHOP_SPOTS`: a vice, oil and a shelf in the corner; a welding cart and gas in the unit; a drill press and hand truck in the shop; a desk and a multimeter at the HQ), at about half real scale so they read next to the long coded bench (`SHOP_UNITS` 2.4 units a metre). The clubbox, tabletop, regional and Eisenhalle arenas get a few beyond their walls at real size (`ARENA_SPOTS`). The stage follows the career's workshop (`SCRAP_VIS.setStage`, `visStage()` in `app/build.js`); outside a career it is the corner. Each file loads once and is kept; GLTFLoader comes with the on-demand addons (`SCR_LIBS`). About 60-90k triangles in the workshop on Full, 16-44k in the arenas.
- **Textures** (`textures/`, Poly Haven CC0, 512 px): the workshop floor, the bench top, the steel plate and the arena floor, each with a normal map. Each one is tinted so its average matches the coded colour, so the scene keeps the Lite palette and gains grain and wear.
- **Recorded sounds** (`sounds/`, three CC0 packs from OpenGameArt, credited in `sounds/CREDITS.md`): 18 short mp3s (about 120 KB) for hits, big hits, walls, landings, hazards and parts coming off. On Full and Ultra one plays under each synth clang (random variant, pitch and volume by hit energy) and the synth drops to under half; until they decode, the synth plays alone. A part coming off has a sound only with the recordings.
- **Lite** loads none of it: no models, textures, sounds or GLTFLoader, the same triangles and the same synth as 0.1.10.0. A tier change drops the props and textures.
- **Not yet:** Kelbo's Blender models (stage interiors, the arena shell and hazards (done in 0.1.13.0), a trailer, trophies, hero shells). They drop in the same way: pack with `tools/pack-model.py`, add to `PROP_FILES` and the spots, credit as original.
- **Saves:** nothing new (no `SAVE_V` change).

## 0.1.12.0: a balance pass

Measured with `node tools/fight-test.js all -m` (12 seeds at driver skill 0.5 and 0.85, each class in its own arena) before and after. Every test build now lands within 35-65% against the other test builds or no more than 2 points outside it, which is inside the sampling noise (before: up to 5 points out).

- **Pits:** the tabletop's pit is narrower (0.2 by 0.3 m at beetle scale, was 0.28 by 0.4) and so is the club box's (0.26 by 0.4 m, was 0.34 by 0.52). Pit finishes drop from 79% to 68% of ant fights, 64% to 56% in beetle, 56% to 47% in hobby, so weapons decide more of them.
- **`PARTS`:**
  - Pneumatic flipper: 18 shots (was 12). It ran out of gas in long fights and lost on the judges. The high-pressure flipper is 24 (was 20), so it stays the upgrade.
  - Hammer: 30 J a blow (was 25).
  - Drum: bite 0.88 (was 1.00). This also tones down the Invertible box, which carries a drum.
  - Vertical disc: bite 0.85 (was 0.90).
  - Lifter: forks reach 45 mm (was 60), so it has to drive in further to get under.
- **`WEDGE_RULES.underGripClass`:** a bot riding up a wedge keeps 40% of its grip in feather (was 30%) and 45% in heavy (was 20%), so a heavyweight wedge can't steer its victim around for a judges' win.
- **Before → after**, against the other test builds:

  | Build | Ant | Beetle | Hobby | Feather | Heavy |
  |---|---|---|---|---|---|
  | Wedge | 49 → 51 | 53 → 59 | 51 → 61 | 65 → 60 | 70 → 61 |
  | Lifter | 67 → 66 | 65 → 65 | 66 → 61 | 63 → 57 | 61 → 61 |
  | Flipper | 42 → 38 | 37 → 46 | 43 → 39 | 41 → 55 | 35 → 48 |
  | Horizontal spinner | 59 → 67 | 58 → 60 | 64 → 67 | 56 → 65 | 63 → 66 |
  | Vertical spinner | 54 → 53 | 63 → 61 | 64 → 62 | 66 → 67 | 62 → 63 |
  | Drum | 59 → 58 | 68 → 62 | 57 → 53 | 67 → 60 | 62 → 59 |
  | Hammer | 37 → 41 | 32 → 38 | 41 → 46 | 43 → 39 | 54 → 50 |
  | Undercutter | 69 → 61 | 66 → 58 | 53 → 51 | 51 → 49 | 45 → 43 |
  | Glass cannon | 52 → 52 | 47 → 44 | 48 → 48 | 40 → 43 | 40 → 38 |
  | Brick | 41 → 47 | 36 → 40 | 39 → 48 | 40 → 39 | 37 → 45 |
  | Invertible box | 55 → 55 | 68 → 63 | 65 → 56 | 65 → 63 | 66 → 63 |

- **Named opponents** (not held to the target): Zange 86 → 82%, Walzwerk 75 → 69%, Schraubstock 68 → 67%. Zange is the Eisenhalle's top bot with a 0.75-skill driver, so it stays strong; crusher damage turned out not to be what makes it win. Lawine went up, 42 → 62%.
- **Single-hit knockouts:** 0.6% ant, 0.5% beetle, 2.0% hobby, 3.1% feather, 7.1% heavy (was 3.4%: the harder hammer and the heavier wedge victims). All are inside the plan's targets.
- **Saves:** nothing new (no `SAVE_V` change). A fitted bot keeps its parts; the new numbers apply from the next fight.

## 0.1.13.0: the arena kit (Blender) and a visual pass

- **The arena kit** (`models/arena-kit.glb`, 185 KB, about 3,900 triangles for every piece): original models, built in Blender 5.2 from a script (`tools/blender-arena-kit.py`, run with `bpy`) and packed like the other props. Full and Ultra only; the coded pieces show until it loads, and stay on Lite.
  - **Walls:** kerb units with a sloped steel face, bolts and a cap, tiled along each wall; screen uprights along the far and side walls (none on the camera's side, so nothing stands between you and the bots).
  - **Corner posts** with a base plate, gussets and a caged beacon; the beacons glow amber while a hazard fires.
  - **Wall rams:** yellow with black diagonal stripes on the top and the face (modelled at the rams' real 1 by 3 shape, so the stripes don't stretch), and a light bar that glows while it fires.
  - **Floor spinners:** a bolted disc with a toothed bar and a ring that glows while it fires.
  - **The pit:** a real hole in the floor with a dark well under it, so a bot that drops in is seen to fall; a striped edge round it; the floor grid stops at its edge. The cover slides off as before.
  - **Stands** with a seated crowd round the back and both sides of the club box, the regional arena and the Eisenhalle (not the test box or the tabletop); the old flat crowd moves back and up to read as the upper seats. The props beyond the walls sit in the gap in front of the stands.
  - The many kerb, stand and pit-edge clones are merged into one mesh per material when they land, so the kit costs a few draw calls (about 85 in the Eisenhalle on Full).
- **Ultra's bloom target has a 24-bit depth buffer** (three's default there is 16-bit): thin layers no longer flicker through, which had broken the bots' team stripe into dashes on Ultra.
- **Lite:** unchanged (the same picture as 0.1.12.0, pixel for pixel, in every arena).
- **Saves:** nothing new (no `SAVE_V` change).
- **Still to come from Blender:** the workshop's room for each stage, the trailer, trophies and hero shells. Each is a script like the kit's, or Kelbo's own export, dropped in through `vis/props.js`.

## 0.1.14.0: body styles

A new Build row, **Body**, between Chassis and Armour. The body is the chassis's shape, separate from its material, and it changes the numbers (`PARTS.body` in `sim/parts.js`; Plain is neutral, so old builds and saves play the same):

| Body | Mass | Chassis hp | Height | Other | Unlock |
|---|---|---|---|---|---|
| Plain box | x1 | x1 | x1 | | start |
| Scrap frame | x0.8 | x0.7 | x1 | +0.15 flex | start |
| Slab | x1.1 | x1.1 | x1 | sides deflect +0.1 | start |
| Wedge shell | x1.1 | x1 | x0.85 | lower front edge, top deflects +0.15 | welder |
| Dome | x1.12 | x1.05 | x1.15 | top deflects +0.3; too tall to drive upside down on small wheels | press |
| Pancake | x0.95 | x1 | x0.7 | wheels stand proud, so it drives either way up but rides higher | mill |
| Invertible | x1.2 | x1 | x1 | always drives upside down | CNC |

Balance (beetle, each body on a test build against the other eleven, 6 seeds x skills .5 / .85): every body is within about 10 points of the plain box on the same build. Pancake runs 5 to 14 points under (a wedge gets under the higher ride), and pays for it with the weight it saves. The heavy bodies don't fit on the near-limit test builds as they are: a player trades armour for them.

The 3D bot draws each body in code on every tier: a sloped top with side cheeks, a half-ellipsoid dome, steel corner guards, bare tubes, a wider flat lid, a plate underneath. Blender shells for Full and Ultra are still to come.

## 0.1.15.0: Blender shells for the body styles

- `models/bot-shells.glb` (92 KB) is original, built in Blender from `tools/blender-bot-shells.py` (bpy; steps at its top) and packed with `tools/pack-model.py`. Pieces: `wedge_top` (sloped lid with two ribs, a hinge strip and a sharpened lip), `wedge_cheek_l` / `_r`, `dome_shell` (a rim flange and a crown seam), `slab_skirt_l` / `_r` (thick bevelled side skirts), `slab_guard` (an angle-iron corner guard with a cap), `pancake_lid` (chamfered, with two side hatches), `invert_plate` (two skid rails; drawn top and mirrored underneath), `scrap_tube`, `scrap_weld`, and each body's bolt heads.
- Each piece is modelled in a unit body (x the width, z the length with the front at -z, y in chassis heights from the top of the box) and `shellBody` in `vis/bot.js` stretches it to the bot. Bolt heads are pre-squashed for a typical beetle's proportions so they come out round.
- The game puts its own materials on (the armour or chassis of the face each piece covers, steel for fasteners), and each piece carries that face's part key, so damage greys a shell as it does the coded shape.
- Full and Ultra only. `botShells` (`vis/props.js`) starts the load the first time a bot is drawn; until it lands, or if it fails, the coded shapes stand in, and when it lands the workshop's bot is drawn again. A bot already in a fight keeps its shape. The bot cache key carries whether the shells were in (`botHash`).
- Wedge, Dome, Pancake and Invertible shells replace the top; Slab and Scrap frame keep the flat top plate and add skirts, guards, tubes and welds to it. The scrap frame gains a cross brace on Full.
- Lite is unchanged (no load, the coded shapes). The sim is untouched.

## 0.1.15.1: body deltas

A Body option's delta line on Build now shows what it does to the bot's height (`mm tall`, lower is green) and whether it gains or loses driving upside down, ahead of the armour and front edge (up to three changes, against two for other rows). The plan's Body styles row has the final numbers.

## 0.1.15.2: body balance on every class

The body styles were balanced on beetle only. Run on every class (each body on each test build against the other eleven, 6 seeds x skills .5 / .85), the low bodies fell well under in feather and heavy: Pancake 4.5 and 8.5 points under the plain box on average, 20 to 25 under on the heavy hammer and horizontal spinner; Wedge shell 18 to 20 under on the heavy hammer and Brick. A low body shrinks the side, front and back plates, and their hp went with their mass, so it paid twice.

**A plate's hp and absorb now go with its thickness, not its height** (`evalBuild` in `sim/build.js`; Kelbo: both ways). A low body's shorter plates weigh less and keep a full-height plate's hp; a tall body's bigger ones weigh more without adding hp. The top plate is unchanged.

Mean change against the plain box on the same test build (worst single build in brackets), after:

| Body | Ant | Beetle | Hobby | Feather | Heavy |
|---|---|---|---|---|---|
| Scrap frame | -2 (-7) | -1 (-5) | +1 (-8) | 0 (-9) | -1 (-9) |
| Slab | 0 (-8) | -3 (-11) | +1 (-6) | -2 (-8) | -1 (-5) |
| Wedge shell | -3 (-13) | -2 (-12) | +1 (-11) | 0 (-10) | -2 (-15) |
| Dome | -9 (-17) | 0 (-1) | 0 (-1) | 0 (-2) | +1 (0) |
| Pancake | -4 (-11) | -1 (-13) | 0 (-7) | +1 (-9) | -2 (-13) |
| Invertible | -2 (-7) | -4 (-6) | -1 (-3) | 0 (-5) | +3 (+1) |

Pancake in feather was -4.5 and in heavy -8.5 (worst -25). The Dome only fits on the Glass cannon and Sloppy budget; its ant -17 on the Glass cannon was there before. Bodies that don't fit a near-limit test build aren't counted (a player trades armour for them).

## 0.1.15.3: weapon bays

`evalBuild` works out the weapon bay (`b.bay`, `bayOf` in `sim/build.js`): the opening the body leaves round the weapon.

| Weapon | Bay | Open | Share of the top (ant, beetle, heavy / hobby, feather) |
|---|---|---|---|
| Vertical disc | slot through the body | above and below | 0.042 / 0.036 |
| Saw | slot | above | 0.037 / 0.031 |
| Drum | pocket at the front | above and below | 0.113 / 0.098 |
| Horizontal disc | round well in the top | above | 0.320 / 0.281 |
| Undercutter | round well underneath | below | 0.177 / 0.162 (of the underside) |
| Hammer, flipper, lifter, crusher | flat deck | closed | 0 |
| Wedge, no weapon | none | closed | 0 |

**An open bay is a weak spot** (Kelbo). A hit from above (a hammer, a crusher, a saw's hit or its grind) comes down into the bay with a chance of the bay's share of the top x `DAMAGE.bayMul` (0.2). When the target is upside down, its underside faces up, so the underside's share counts instead (a vertical disc's slot, a drum's pocket and an undercutter's well go through). A hit into the bay skips the top plate (no absorb, no plate hp, no glancing off) and lands on the weapon first (disc, motor and belt are one part), then the parts behind the top as usual (`hitFace(b, face, E, st, absorbMul, bay)` in `sim/damage.js`). Landings never go into the bay. The fight draws from its generator only when the target has a bay open on that side, so fights without one are exactly as before. The log entry carries `bay:1`, and the post-mortem and the fight log say "straight into your open weapon bay".

So the chance of a hit going into the bay is 6.4% for a horizontal disc, 2.3% for a drum, 0.8% for a vertical disc, 0.7% for a saw and 3.5% for an undercutter that is upside down. In hobby and feather it is 5.6%, 2.0%, 0.7%, 0.6% and 3.2%. At `bayMul` 1 the hammer jumped 14-20 points in hobby, feather and heavy, because the top plate normally soaks up a hammer blow completely. At 0.2 the builds with a bay lose 0-3 points and the hammer gains 4-7 in the bigger classes. The test builds have no saw or crusher, so the hammer is the only one that uses the bay.

Win % against the other test builds (12 seeds x skills .5 / .85), before -> after:

| Build | Ant | Beetle | Hobby | Feather | Heavy |
|---|---|---|---|---|---|
| Horizontal spinner | 67 -> 68 | 60 -> 62 | 67 -> 65 | 65 -> 64 | 66 -> 64 |
| Vertical spinner | 53 -> 51 | 61 -> 62 | 62 -> 62 | 67 -> 65 | 63 -> 64 |
| Drum | 58 -> 60 | 62 -> 61 | 53 -> 51 | 60 -> 59 | 59 -> 59 |
| Glass cannon | 52 -> 53 | 44 -> 41 | 48 -> 48 | 43 -> 41 | 38 -> 37 |
| Invertible box | 55 -> 55 | 63 -> 62 | 56 -> 56 | 63 -> 63 | 63 -> 63 |
| Hammer | 41 -> 38 | 38 -> 39 | 46 -> 51 | 39 -> 46 | 50 -> 54 |

Every other build is unchanged. The ant and beetle moves are noise: an ant hammer blow is about 2 J, so the bay does nothing there, but the extra draw changes which seeds play out how. Hammer against the horizontal spinner: hobby 21 -> 50%, feather 25 -> 35%, heavy 60 -> 83%.

**Drawn** (`vis/bot.js`, every tier): the chassis is extruded in layers round the bay, with a notch or a hole cut by `polyMinus`. A slot goes through the body for a vertical disc; a saw gets a recess in the top. A drum gets a pocket, and a horizontal disc sits low in its well (an undercutter in a recess from below). The front armour plate parts round any bay that reaches the front, and the top plate is cut over it. A deck is a flat plate on the box top where a raised top is cut away: a wedge lid, a dome (redrawn as a height field round the cut) or a shell. Arms and flipper plates lie on the deck. Walls under a raised top hide the hollow, and the team stripe stops short of the bay. On Full and Ultra, `models/bot-shells.glb` has slotted variants of the wedge, dome, pancake and invertible shells and their bolts (`<piece>__<variant>_<A|B>`, 116 of them, each with a sleeve wall and a bevelled lip; 95 KB to 660 KB). `shellVariant` picks one by matching the bay's unit-body rect: A is for the ant, beetle and heavy proportions, B for hobby and feather. A weapon moved off its default place in the layout finds no variant, so that bot falls back to the coded shapes, which cut any bay.

## 0.1.15.4: the battle screen

Kelbo asked for a fight screen where the bots and their parts are easy to see. The four picks (plan section 1): a camera that frames both bots, a bot map on each card, a team ring, a hit flash with a damage number, and name tags.

**Camera** (`arenaTick` in `vis/arena.js`). It frames the box round the bots still in the arena (minibots and bots out don't count). Each bot counts as a circle of 1.25x its body's half diagonal, not `o.rad`, which reaches out to the weapon. The span never drops below 2.2 scene units (or 4.6 bot radii), so a clinch doesn't fill the screen, and never grows past the arena plus a margin. It pulls out quickly when the bots split (rate 4/s) and closes in gently (1.6/s), and follows at 4/s. The centre stays within 95% of the arena's half width, so a bot by the wall is still in shot.
- The app tells the vis where the HUD covers the view (`SCRAP_VIS.setRun({inset:{t,b}})`, from `ftInsets` in `app/fight.js`). The top is the bottom of the cards, or 55% of that on a wide screen where the cards sit in the corners. The bottom is the replay bar (72 px), the direct controls (up to 130 px, or a fifth of the height) or 16 px. The camera fits the bots in the clear band and aims past the middle so they sit in it.
- **Pinch** on the view (two fingers) or the mouse wheel nudges the zoom from 0.55x to 1.8x (`FT.zoom`, `setRun({zoom})`). It stays for the session. A second finger never counts as a tactical tap (`ctlTap`).

**Cards** (`ftEnter` / `ftOverlay`). One per main bot, yours on the left, theirs on the right (two rows in a rumble, smaller). Each card has a top edge in the bot's team colour and a 62 px **bot map** (`ftMap`): the top-down outline from `b.polygon`, every part's grid cells filled in its state colour (green, amber, red; a broken part crossed out), W, B and E letters on the weapon, battery and electronics when they are big enough, each armour face stroked along its edge in its state (dashed grey where there is none), and the wheels as rounded tabs. The map is redrawn only when a state changes.
- **Bars:** Weapon (spin-up or shots left; amber when worn, red when broken or bent, "none" for a wedge or pusher), Drive (the mean of what each side has left, zero if a side is out) and Battery (charge; red on smoke, amber under 20% or damaged).
- **Worst part** in words, ranked weapon, electronics, battery, drive, wheels, then plates and chassis: "Left front motor worn", "Weapon broken", "Front plate gone", or "No damage".
- **Status** in lilac: upside down, lifted, under a wedge, overheating, immobile with the count, counted out, in the pit.
- Landscape (height under 560 px) uses a 52 px map, thinner bars and no status line.

**On the arena floor** (`botTag`, `botMarks` in `vis/arena.js`; every tier). The **team ring** that sat under each bot was taken out in 0.1.16.1 (Kelbo: it made the contact between the bots hard to see). A **name tag** over each main bot: a dark pill with a team dot, the same size on screen at any zoom (22 px, 18 px with more than two bots), drawn over everything. Lite uses a smaller tag canvas.

**Hit flash and damage numbers** (`vis/fx.js`). A hit, flip or hazard flashes the parts it damaged white-hot: the sim's fx event carries `keys` (the parts hurt, the plate of the face, the chassis) and `d` (the share of the bot's health it took), from `damageBot` through `F.fxHit`. Only with fx on, so tests and replays without fx are untouched. A hit that damaged nothing, or only parts that aren't drawn, flashes the whole bot. At most four flashes a second, three and softer under reduced motion. The ring flashes too. Each hit or hazard that took at least half a percent floats "-4%" up from the name tag for a second (a light cool red from 8%). Lite uses a smaller canvas and shows three at a time; reduced motion fades it in place. Effects Reduced keeps the numbers: they are information.

No sim numbers change (the fx fields don't touch the fight), and nothing new is saved (no `SAVE_V` change).

## 0.1.16.0: the voice pack

Kelbo's ElevenLabs pack: 214 lines, Duncan Steiner on the PA (the announcer) and Jess Moser on Radio Velmark (the commentator). The script, cast list and handoff are in `docs/voice/`; the clips are in `sounds/voice/` (re-encoded to 64 kbps mono, about 6 MB).

- **Lines** (`src/sound/voicelines.js`, `VOICE_LINES`): generated from the CSV by `node tools/make-voicelines.js`. Each line has a cue (`countdown`, `end:ko`, `c:hit`, `pm:face`, `name:Kiesel`, `rival:ottilie` ...), its speaker, its length (read from the MP3 frames) and its caption. Narrow cues (`c:hit:wheels`, `c:fail:weapon`) fall back to the wider pool. `--check` fails on a missing or unreferenced file, or a trigger the tool can't map.
- **Player** (`src/sound/voice.js`, `SCRAP_VOICE`): loads when the Fight tab opens, four clips at a time, with the announcer's core calls first. It keeps the MP3 bytes and decodes a clip when it's needed (the last 20 decoded are kept; the callback form of `decodeAudioData` for older Safari). It plays through its own gain on `SCRAP_SOUND`'s context (`voiceBus`), and `talk(until)` ducks the clangs under a voice and keeps the context awake past the bell. On every tier, Lite included.
- **Two channels.** The announcer gets the countdown, result calls, name stingers, the count, the pit opening and the pit window. The commentator barks at most once every 3 s of real time, never over the announcer. The announcer's mid-fight calls wait up to 2 s for a bark to finish, then hand over to the commentator's version.
- **Deterministic picks.** The live calls run on fight time with a `SCRAP_SIM.rng` stream seeded from the fight's seed, and the last six lines said are skipped, so the same fight at the same speed says the same lines. `node tools/voice-test.js` replays fights through the director and checks this.
- **Before a fight** the fight holds (the clock stays full) while the intro plays, with a Skip button. The first driven bout of an event day gets the full welcome: fight night, a new season, the act (Circuit, Heavyweight) the first time, "defending champions" in Legacy, the venue, the event, the commentator's opener (the TV one at the Eisenhalle), the class and the format. Every bout gets the round in a bracket, then "The challenger!" (your name is never voiced) and the rival's intro or the opponent's name stinger, then the countdown. Round 2 or 3 of a best of three: "pit's closed", "this is the decider" at one round each, the countdown. If nothing is loaded yet, the fight starts at once.
- **At the bell:** judges' decision, a judges' bark (split or control when it was), the reveal and the winner's name stinger; or the KO, pit, rumble or tag call; win or lose; the best of three's score after round 1; a first win (`career.fw`) or the Open title in a career; the commentator's sign-off. A stopped fight says nothing.
- **Pit:** "pit window open" and the commentator watching the crew, "ten seconds left", and "pit's closed" at the start of the next round.
- **Replays:** "let's look at that again" and the commentator's live calls (no opener). The results card plays one post-mortem line matched to `rpHint`'s kind (pit, upside down, weapon, wedged, a face, pinned, held up, general).
- **Settings:** Voices (on/off), Commentary (off leaves the announcer), Captions (when muted / off). Muted means Sound or Voices off: the same calls then come up as captions at the bottom of the fight.
- **Rivals renamed for the recordings:** Ottilie Brandt is now Kayla Rauch, Rudi Kessler Mitch Gerber; the ids (`ottilie`, `rudi`) and saves are unchanged.
- **Saves:** `SAVE_V` 8 (`settings.voice`, `comm`, `captions`; `career.fw`, `actSaid`). Offline: the clips aren't precached; the service worker keeps each one once it's fetched, and `build.js` folds them into the cache hash.

## Known loose ends

- Balance (0.1.12.0 numbers): the Horizontal spinner sits just over 65% in ant, hobby and heavy (67%, 67%, 66%), the Lifter at 66% in ant and the Vertical spinner at 67% in feather. All are within the sampling noise. The spinner's disc is shared with the Glass cannon, which is already near the bottom, so nerfing the part would push the Glass cannon under.
  - The pit still decides most small-class fights (68% of ant, 56% of beetle).
  - Named bots are stronger than the test builds by design (better drivers): Zange 82%, Glockenschlag 75%, Holzwurm 71%. The career sets who meets whom.
- The pin limit takes over the player's drive for 1.2 s; the fight screen's note says so.
- The HUD shows the weapon's speed as a bar, not rpm.
- The 3D view doesn't interpolate between sim steps; Lite draws at 30 fps, so this hasn't mattered.
- The results card's damage % still includes carried-in damage (the judges don't).
- The fight camera frames bots on the floor; a bot flipped high in the air can leave the top of the shot for a moment.
- Airborne bots skip collisions, so a tipped bot can land overlapping the other for a step or two before they push apart.
- Replays moved between phones: the sim uses `Math.sin`, `cos`, `atan2` and `hypot`, which browsers don't promise to round identically, so a replay could drift on another engine. Replays are only kept for the session on the same phone for now (nothing is saved), so it hasn't mattered; decide before a replay is ever shared or saved.
- Spinner disc against spinner disc (weapon clashes) isn't modelled yet: a hit is a hit on the face it lands on.
- Rounds in a best of three start with a full battery: only its damage carries.
- Each round's repair bill on the post-mortem is everything still broken after that round, so the rounds' bills overlap; the career charges only what comes home (the workshop card).
- The repair bill and the pit work only on your bot; the post-mortem covers bot 0 only (in a rumble too).
- A quick sim of a bracket runs every other fight of the round at once: on a slow phone that is a short pause (a beetle fight is about 50 ms of sim on a desktop).
- Rumbles and tag team are single fights, so they never get a pit window.
- After the run ends (broke twice, or twenty seasons) fitting is free again until a new career starts.

## 0.1.17.0: the bots' materials on Full and Ultra

Kelbo: "crank the material quality for the bots". The first piece of the plan's graphics push, pulled forward; Lite is untouched.

- **Maps made in code** (`src/vis/surface.js`): every material a bot is drawn in gets a tiling 256 px albedo, normal and roughness set, from seeded value noise and a few drawn marks, so it is the same every visit, costs no download and needs no credit. Steel is brushed along the panel with scratches; aluminium is brushed finer the other way; titanium carries a faint warm and blue heat tint; AR500, hardened steel and the custom chassis are mill scale (dark blotches with flaking edges, pitted); a disc shows turning marks in rings round its hub; plywood has grain and wandering growth rings; HDPE has orange peel; rubber is a tread of blocks and grooves; the clay, team and sponsor paints are a clearcoat (`MeshPhysicalMaterial`) over faint orange peel. The albedo only varies round a light grey and `material.color` is the coded colour divided by the albedo's mean, so each surface still averages its Lite colour.
- **Made in a worker.** The fields take about half a second to compute, so `surfStart` runs `surfFields` in a blob worker (a sync timeout where blob workers aren't allowed) and `surfLand` turns them into `DataTexture`s and puts them on every material made from the set: the tier's, the cached bots', the workshop's bot, the bots in a fight. Until they land the materials are flat PBR, as before. A tier change drops a late result (`SURF.gen`).
- **UVs** (`uvProject`): `buildBot` ends by projecting every mesh onto the plane its normal faces most, in the bot's metres, one tile every `SURF.tile` = 0.09 m x the class scale, so grain runs at one density over chassis, plates, cheeks, arms and the Blender shells alike (a shell's geometry is copied per bot for it, and disposed with the bot). A disc keeps the cylinder's cap UVs so the rings centre on the hub; a tyre keeps the cylinder's UVs, repeated so the tread runs round the wheel (`uvRepeat`).
- **Wheels** on Full and Ultra: an open tyre with the tread round a brushed aluminium hub with a face, both tagged with the wheel's part key so they spin and grey together. Lite keeps its one cylinder.
- **The reflection** (`shopEnv`): a bigger painted room (512 x 256), with a lighter band at the horizon so bare metal shows a wall line, four strip lights with glow and floor pools, a window and a warm lamp.
- **Tuning that mattered:** brushed normals at strength 1-1.2 and a roughness spread of ±0.06 to ±0.08; at 3+ and ±0.15 the strip lights broke into black-and-white stripes across every plate. The disc's rings: 22 a tile (60 aliased into noise).
- **Lite** is byte for byte the same code path: Phong and Lambert, no maps, no projection (`SURF.tile` 0), the single-mesh wheels.


## 0.1.17.1: the effects pack

Kelbo's ElevenLabs effects (`sounds/sfx/`, 52 mp3s, about 1.4 MB, credited in `sounds/CREDITS.md`), played by `SCRAP_SOUND` (`sound/synth.js`) through the same compressor as the clangs, so a voice ducks them.

- **API:** `sfx(id, v)` plays one effect (a random take where there are two, pitch ±4%, at most one per id every 60 ms); `prep()` fetches the fight's effects (the Fight tab calls it; before the first tap it waits for it); `crowd(id)` loops a crowd bed ("club", "reg", "big", or null to fade out) and is a no-op for the bed already playing, so the overlay calls it with the motors. `stop()` fades the crowd and waits for a stinger (the bell, the cheer) as it waits for a voice before suspending the context.
- **Every tier** (about 300 KB when the Fight tab opens, plus a 200 KB bed per arena when its first fight starts): the crowd bed, an ooh for a hit over 60 J/kg, a groan for a weapon giving out or a bot dying (one crowd reaction every 3.5 s), the bell when the intro ends and at the end, a cheer for a knockout or the pit, applause for the judges, the pit opening; in the workshop the ratchet (Fit), the clamp (a bench test), the drill (a repair, at home or in the pit window) and the charger (Close week), loaded on the first tap (about 60 KB).
- **Full and Ultra** (loaded with the clangs): a spinner's spin-up each time it climbs past a third of full speed from under a tenth; the flipper (high-pressure for `flipper2`), hammer, lifter and crusher on their hits; a material layer under every hit, picked by the plate on the face hit or the chassis behind it (plywood, HDPE, titanium, anything else steel; a tyre when a wheel took it); scrapes under a wedge and grinding, a bent disc, a sheared shaft, a part torn off (instead of the old part clip), hard landings and wall hits, pushers and floor spinners, self-righting, smoke, a dead battery.
- **Lite** gets the every-tier list and nothing else; the synth, the motors and the fight are unchanged.

## 0.1.17.4: smarter AI driving

The AI (`sim/ai.js`) drives the opponents, AI spars and the player's quick sims, so both sides get it.

- **Paths** (`AI_NAV`, `aiPath`): the way to the goal bends round the pit (open, or opening within `pitSoonS`), the floor spinners and pushers (unless it is shoving the enemy into one), and round the enemy when the goal is past it.
- **Pit escape** (`aiPitOut`): a bot over the pit's edge drives out towards open floor, forwards or backwards, whichever end points that way, never reversing into the wall behind a pit.
- **Shove escape** (`aiShove`): a bot driven back towards the pit (within `pitShove` radii) or a hazard (half that) turns across the shove instead of pushing straight back.
- **Tactics** (`AI_SKILL.tactics`, 0.25 to 1 by skill, rerolled every 2-4 s): flank a bot with a weapon on its front; a spinner that landed a hit and dropped under `reSpin` of its speed backs off to spin up.
- **autoStyle:** each build was fought with every style against the auto field in every class. Undercutters do best rushing and wedges going aggressive; discs and drums do best on counter, but that ran them over 65% (vertical disc 80% in beetle, horizontal 70% in hobby), so they keep away.
- **Results:** new vs old over 4840 fights, 53.3%, with 17% more hits; self pit falls 312 vs 392, pushed in 832 vs 924. `fight-test all` passes in every class.

## 0.1.17.5: flippers and smaller pits

Kelbo's pick: flippers were the weak build in the small classes and the pit ended most knockouts there. Measured with `node tools/fight-test.js all -m` before and after; feather and heavy are unchanged (none of the new numbers apply there).

- **Flippers** (ant, beetle, hobby; `FIGHT.flipThrow`, `flipStunS`, `flipCtrlS`): a flipper's flip throws 1.6 / 1.8 / 1.8 m/s further forward (x sqrt len), the bot that lands has no drive for 0.6 / 0.6 / 0.5 s, and each flip counts 2 s of control for the judges. A flip near the pit or a wall can finish the fight, and a flipper that keeps flipping wins the decision.
- **Pits:** the tabletop's pit is 0.16 by 0.24 m (was 0.2 by 0.3); the club box's is 0.22 by 0.34 m (was 0.26 by 0.4) and opens at 0:30 (was 0:20).
- **Results** (KOs, the pit's share of them, decisions):
  - Ant: 81% to 71%, pit 68% to 49%, decisions 19% to 29%. Flipper 31 to 53, Undercutter 68 to 52, Lifter 66 to 64, Hammer 39 to 43.
  - Beetle: 74% to 66%, pit 58% to 44%, decisions 26% to 34%. Flipper 41 to 46, Undercutter 63 to 52, Horizontal spinner 59 to 64.
  - Hobby: 67% to 57%, pit 48% to 34%, decisions 33% to 43%. Flipper 35 to 49, Undercutter 55 to 45, Lifter 64 to 58, Wedge 64 to 66.
  - Every test build is inside 35-65% or within the 5-point slack; the harness passes in every class.

## 0.1.18.0: home screen, Career and Sandbox

Kelbo's pick: PEW's way. The first-visit intro is the home screen.

- **Home screen:** the title, the pitch and two cards, **Career** (€1,500, hand tools and a rented corner; twenty seasons to the Scrapline Open) and **Sandbox** (every part, class, arena and opponent, free to fit, no calendar), over the live workshop: the bot shows above the text in portrait and beside it in landscape (the pitch paragraph is hidden on a short landscape screen). The HUD, panel and tabs are hidden until a card is picked (`html.home`). Picking a card sets the mode, then offers the tutorial as before.
- **Modes:** `S.mode` is `career` or `sandbox`. Sandbox behaves as the game did with no career. Each mode has its own garage: `setMode` (`src/app/career.js`) swaps `S.bots` with `S.parked`; saved designs are shared. Switching is refused mid-fight, in the tutorial, or while you're at an event.
- **Where to switch:** Settings → Mode; the Career tab in Sandbox (it shows where your career stands, with a Switch to Career button); Start career switches to Career by itself. The Shop's no-career card says which mode you're in.
- **Save:** `SAVE_V` 9. `MIGRATE[8]` puts a save with a career in Career and any other in Sandbox, with an empty `parked`, so nobody loses a bot. A backup code with a bad `mode` or `parked` is refused.

## 0.1.19.0: readability and Fix it

- **Build stats:** the pinned line under the weight bar is four labelled cells: Top speed (m/s), Hit energy (J; Weapon when it has none), Weak side, Battery (minutes:seconds), then the verdict chip. Under 380 px wide it wraps to two columns.
- **Text sizes:** row summaries 14 px; option notes, design notes, career notes, kit notes and the post-mortem key 13 px; face buttons and bench tags 11 px. Every text colour is at least 4.5:1 on both themes (muted 6.1 to 7.7, dim 4.6 to 6.0).
- **Fix it:** the post-mortem's redesign hint has a Fix it button naming a Build row. `RP_FIX` (`src/app/report.js`) maps the stress-report line behind the hint (shear and spin-up to Weapon, bend to Weapon material, bare faces and impact to Armour, runtime, heat and power to Power, COM and nose to Layout, a high front edge to Body, drop to Chassis, upside down and righter to Extras, slow and pusher to Drive), or else the hint's kind (the pit to Drive, ended upside down to Extras, got under to Body, a battered face to Armour). Tapping it opens the Build tab with that row open, scrolled to just under the pinned bar. A hint with no row (it held up) keeps Open Build.

## 0.1.20.0: daily challenge and replay codes

- **Daily challenge** (`src/app/daily.js`, a card on the Fight tab). `dlPick(day)` hashes "scr-daily:" plus the date (FNV) into `SIM.rng`, which picks the class, then an opponent from that class's `OPPONENTS` (else a test build), the arena (the class's home arena 60% of the time, else another, never the plain box) and the fight seed. Everyone gets the same bout on the same day. Bring: the fitted bot, any saved design of that class or a starting point. You drive; Sandbox rules (nothing paid, no damage kept). Score: win 2000, draw 1000, loss 0; plus 10 per second left on a knockout; plus damage dealt, to 999. A stopped fight doesn't count. `S.daily = {last, streak, top, best, tries}`: today's best, best ever, tries today, and the streak of days in a row with at least one fight. Rematch on the end screen reads Try again.
- **Replay codes.** `SCRRP1:` plus `{v, ver, seed, arena, rules, steps, bots, inputs}` from the fight log, squeezed with the backup code's LZW and base64url, plus its 6-character checksum (about 750 characters). Share on the post-mortem opens it with Copy; Watch a code on the Fight tab checks the whole code (empty, a backup code, not a code, newer, damaged) and plays it in the replay viewer through `ftRpFight`. A code from another version plays with a warning, since a changed sim can play it out differently. Restore refuses a replay code and says where it goes.
