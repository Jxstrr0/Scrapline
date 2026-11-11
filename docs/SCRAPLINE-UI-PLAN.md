# Scrapline: UI overhaul, round two (build plan)

Written against Scrapline 0.1.56.0. It turns the picked mock-up (the "Combined" row: Test Cell as the base, the Drawing Board post-mortem, the Fight Night matchup) into five small releases.

Hand this file to a Claude Code session, e.g.:

> Read `CLAUDE.md`, then `docs/SCRAPLINE-UI-PLAN.md`. Do release A only. Stop when it's merged and give me the phone test.

Commit this file as `docs/SCRAPLINE-UI-PLAN.md` so every session can find it. `CLAUDE.md` and `docs/SCRAPLINE-PLAN.md` still rule: where this file and `CLAUDE.md` disagree, `CLAUDE.md` wins.

Mock-ups (Kelbo can open them; a code session can't, so the wireframes in this file are the spec): https://claude.ai/artifact/KEoEr76NxmaYkmGnaBUVBJ

---

## 0. Ground rules for this plan

Everything in `CLAUDE.md` applies. The ones that bite here:

- **No changes to `src/sim/`.** Every number this plan shows already comes out of `evalBuild`, `runBench`, `stressReport` or the fight log. If a release seems to need a sim change, stop and ask.
- **No new localStorage key.** One new field inside `scr-save` (release D), with a `SAVE_V` bump and a `MIGRATE` step.
- **The light theme gets every change**, in the same PR. Check every new text colour for 4.5:1 on both themes and list the pairs in the PR body.
- **Lite must keep working.** Nothing here adds 3D work; release E removes some (the plan view pauses the 3D render).
- **Reuse what exists** before adding a class: `.card`, `.acc` rows, `.seg`, `subNav`, `.fitbar.gobar`, `.chip`, `.readout`, `.bntag`, `emptyHtml`, `goTo` / `data-go`, `pageIn`.
- **Colour roles stay as they are:** clay for the accent and the weight bar, lilac for readouts, green / amber / cool red for damage and for "good / weak / bad". An opponent is drawn in its own team colour (`ftTeamCol`), never a fixed blue.
- Motion goes off with `html.reduce`. New tap targets are at least 44 px tall.
- Scrapline keeps its own look. No studio branding on game screens.
- One `claude/...` branch and PR per release. Each bumps the third `VERSION` number. Listed here as 0.1.57 to 0.1.61; if another release lands first, take the next free numbers.
- Before every commit: `node build.js`, `node build.js --check`, `node check-savecode.js`, `node tools/sim-test.js`, `node tools/voice-test.js`, `node tools/make-voicelines.js --check`, `node tools/fight-test.js`.
- After each release: add its row to section 1 and the checklist of `docs/SCRAPLINE-PLAN.md`, an entry in `docs/HISTORY.md`, the status and phone-test lines in `CLAUDE.md`, and the changed screens in `docs/DESIGN.md`. Tick the checklist at the bottom of this file.
- End each release with a plain summary: what changed, how to test it on a phone.

---

## 1. Decisions

"Default" rows are the recommended answer and have not been confirmed one by one. Build to the default; if Kelbo changes one, edit the row and note the date.

| Topic | Decision |
|---|---|
| Direction | **Kelbo picked the Combined row** (11 Nov 2026): the bot as a data sheet with calculated and bench numbers side by side, a bench you run as a session, a post-mortem drawn on the bot, a matchup card before a fight |
| Order | **Sheet, bench, post-mortem, matchup, plan view.** Each release stands on its own; stopping after any of them leaves the game whole |
| Build default page | **Parts** until a bot is fitted in the class, **Sheet** after (Kelbo confirmed, 11 Nov 2026) |
| Spin-up gap on the sheet | **Words only, never amber** (Kelbo, 11 Nov 2026): the bench is always a little slower than the calculation, so the gap is said in dim text |
| 3D on Build (default) | **3D stays the default view.** Plan is a switch (release E), remembered in settings. Alternatives: plan first; no plan view |
| Their numbers on the matchup (default) | **Shown once you have fought them.** Today an opponent's build is revealed after a fight (`rpReveal`), so the tape shows their weapon, driver style and weight before a first meeting and their numbers after it. Alternatives: always show everything; never show their numbers |
| Untested warning (default) | **One advice line on the matchup, never a block.** For example an ungauged front edge against a wedge. It only points at a bench test. Alternatives: no warnings; warn on Build too |
| Judges | **Already shown** (`ftJudges`). They become bars with the same numbers; nothing new is revealed |
| Tape on Build | **Dropped.** Build gets a one-line Next bout banner in a career, nothing more |
| Tokens | **Scrapline's own tokens** (`src/css/style.css`). No outside design system |
| Sim | **Untouched** by all five releases |

---

## 2. What changes, in one loop

Today the four screens each stand alone. After this plan they pass the same numbers along:

1. **Build › Sheet** says what the maths predicts and what the bench measured, row by row. A row with no bench number has a button to test it.
2. **Bench** runs the tests you picked as one session and shows each reading against its prediction.
3. **Fight › Spar** opens on a matchup card: you and them, your side using bench numbers where you have them.
4. **Post-mortem** draws what went wrong on the bot, numbered, with a Fix it and a Test it button that lead back to 1 and 2.

The example bot in the wireframes is the default beetleweight (`DEFAULT_CFG`, "Splinter"): 1,481 g of 1,500; 2.64 m/s; a vertical spinner storing 139 J; front edge 2.5 mm; runtime 148 s.

---

## 3. Shared pieces (build in release A, reuse after)

**`src/app/sheet.js`** (new; add to `src/manifest.txt` after `app/bench.js`, with a header comment):

- `SHEET_ROWS`: a table, one entry per sheet row: `{id, label, test, calc(b), bench(res, b), fmt, tol, better}`. `test` is a `BENCH_TESTS` id. `calc` reads the `evalBuild` result; `bench` reads that test's `runBench` result. `tol` is how far apart the two may be before the row is marked; `better` is `"hi"`, `"lo"` or `null` (null: never marked, the two are just shown).
- `sheetRows(cls, cfg)`: returns `[{id, label, test, calc, bench, state, delta, hours}]` with `state` one of `ok`, `off`, `none` (not tested), `stale` (tested before the last fit), `draft` (the draft differs from the fitted bot). It uses `benchMeasured(cls, cfg)`, `bnDone`, `bnResult` and `bnHours`; nothing is stored.
- `sheetNum(cls, rowId)`: the best number for one row, bench if measured, else calc, with a flag saying which. Releases C and D use it.

Starting rows (take the field names from the header comments of `sim/build.js` and `sim/bench.js`; do not guess them):

| Row | Test | Calc | Bench |
|---|---|---|---|
| Top speed | drive | drive speed | measured top speed |
| Push | drive | push force | measured push |
| Spin on the spot | drive | turn rate | measured turn rate |
| Spin-up | weapon | predicted spin-up | measured spin-up |
| Hit energy | weapon | stored energy | energy delivered to the anvil |
| Runtime | endurance | runtime | measured runtime |
| Weakest face | impact | that face's rating | the energy at which it failed |
| Front edge | gauge | front edge height | the lowest gauge that got under |
| Drop | drop | none (shows a dash) | what broke, or "survived" |

Leave weapon rows out for a bot with no weapon. The test dummy has no row (it is three fights, too slow to work out for a table).

**Check first, in release A:** on the default bot the bench gives a spin-up of 1.50 s against a predicted 1.32 s, and 106 J delivered against 139 J stored. Find out whether each pair measures the same thing (for example, the same share of full speed). If a pair measures two different things, label both honestly and set `better: null` so the row is never marked amber. Do not change either number. Put what you found in the PR body.

**Deep link to a test:** `BN.pick` (an array of test ids, in memory only). `goTo("bench")` with `BN.pick` set opens the Bench with those tests ticked (release B). In release A, before the session exists, the button just opens the Bench and scrolls to that test's card.

**CSS:** one block in `style.css` headed `/* ---- the sheet, the matchup, the drawn post-mortem (UI round two) ---- */`, with the light-theme overrides directly under it.

---

## 4. Release A (0.1.57): the sheet

**Files:** `src/app/sheet.js` (new), `src/app/build.js`, `src/html/body.html`, `src/css/style.css`, `src/manifest.txt`.

**Today:** under the weight bar, `#bCap` shows four stats and a verdict chip; `#bRows` lists the sections in `B_SECS`.

**After:**

```
Splinter                     Beetleweight
[ Next bout: vs Türkeil · wedge        › ]   career only
Mass budget        1,481 / 1,500 g · 19 g left
[chassis|armour  |weapon |drive|batt|e]
 336     455      390     165   110  25
[ Sheet ][ Parts ]
              Calc        Bench
Top speed     2.64 m/s    2.63 m/s  ✓
Push          14.5 N      14.5 N    ✓
Spin-up       1.32 s      1.50 s
Hit energy    139 J       106 J delivered
Runtime       148 s       146 s     ✓
Weakest face  back        [Test · 2 h]
Front edge    2.5 mm      [Test · 0.5 h]
[ Nothing fitted yet  €523 · 17.2 h   Fit ]
```

1. **Sheet / Parts switch** under the weight bar, a `.seg` with two buttons. State is `B.page`, in memory, picked by the default in section 1 each time the class changes. Parts is today's `#bRows`, unchanged. The verdict chip moves beside the switch.
2. **The sheet** is a real `<table>` (caption "Calculated and bench numbers", `<th scope>` on both axes). The Bench cell by `state`:
   - `ok`: the number and a tick, with the `.bntag` "Bench" style.
   - `off`: the number in amber and the gap in words ("0.18 s slower").
   - `none`: a small button, "Test · 0.5 h" (or "Test · free"), which sets `BN.pick` and goes to the Bench.
   - `stale`: the old state is gone, so show "Run again" as the same button.
   - `draft`: plain text, "Fit first". The bench only tests the fitted bot.
   Marks never rely on colour alone: a tick, a word or a button says the same thing.
3. **`#bCap` goes away** on the Sheet page (its four stats are sheet rows now) and stays on the Parts page, so changing a part still shows its effect at once.
4. **Mass budget bands.** The weight bar fill is cut into one band per group (chassis, armour, weapon, drive, battery, electronics, extras when there are any), in clay at two alternating strengths with a 1 px gap, widths from the mass breakdown `evalBuild` already returns. Under the bar, one small label per band with its grams. Tapping a band or its label opens that section on the Parts page (the same path as the post-mortem's Fix it). The `near` and `over` states and the meter's ARIA values stay as they are.
5. **Next bout banner**, career only, one line above the weight bar: the next fight when an event day is on (`crNext`), else the next event you can enter, by name and week. It names an opponent only when the draw is already known. Tapping it goes to Career › This week. Hidden in Sandbox and when there is nothing ahead.
6. `?sim=1` keeps working.

**Done when:** the Sheet shows a number in every Calc cell for every weapon type and class without errors; fitting, then running Drive on the Bench, fills three Bench cells; changing a part on the draft turns the Bench column to "Fit first"; both themes read cleanly at 360 px wide.

---

## 5. Release B (0.1.58): the bench session

**Files:** `src/app/bench.js`, `src/css/style.css`.

**Today:** one card per test with Run / Again, and "Run all seven".

**After:**

```
Bench · Splinter · Beetleweight      3 of 7 tested
[Drive 2.63 m/s ✓][Weapon 1.50 s][Endurance 146 s ✓]
┌ Weapon test · spin-up ─────────────────┐
│ 1.50 s        0.18 s slower than calc  │
│ (the spin-up trace, with a line at     │
│  the calculated time)                  │
│ 106 J delivered · 4,363 rpm after a hit│
│ 0.8 s back to speed                    │
└────────────────────────────────────────┘
Not tested yet
[x] Wedge gauge   front edge, 2.5 mm on the sheet   0.5 h
[x] Impact        back armour on the sheet          2 h
[ ] Drop                                            1 h
[ ] Test dummy                                      1 h
[ 2 tests picked · 2.5 h on the bench   Run session ]
```

1. **Tested strip:** a chip per finished test with its headline reading (the first sheet row for that test). Tapping a chip opens that test's card; one card is open at a time (`BN.open`).
2. **The open card** leads with the reading in large readout type and one line comparing it with the calculation, then today's plot (`BN_PLOT`), key and text lines unchanged. On the weapon plot add one thin vertical line at the calculated spin-up, labelled "calc".
3. **Not tested yet:** the remaining tests as rows with a real checkbox, the reason from the sheet where there is one, and the hours. `BN.pick` holds the ticks. "Pick all" replaces "Run all seven".
4. **Run session bar** (`.fitbar.gobar`, pinned like the Fight bar): the count, the summed hours (`bnHours`) and "Run session". It runs the picked tests through the existing `bnRun` path, so hours are charged exactly as today, and it is disabled with the reason when the workshop is short of hours. Free tests run without the bar: a free row has a Run button of its own.
5. **What the bench says** stays above everything once a test has run (0.1.44's rule), unchanged.
6. Arriving from a sheet button: the test is ticked and its row scrolled into view.
7. The "nothing fitted", "draft has changes" and "changed since its last tests" messages stay.

**Done when:** a session of two paid tests charges the same hours as running them one by one did; the weapon card shows the calc line; Watch on the test dummy still plays.

---

## 6. Release C (0.1.59): the post-mortem, drawn

**Files:** `src/app/report.js`, `src/app/fight.js` (only `ftJudges` and `ftSil`, if the drawing needs a bigger size), `src/css/style.css`.

**Today:** `rpHtml` shows the hit timeline, a 112 px silhouette (`rpSil`), the "What went wrong" list (`rpCauses`), the redesign hint (`rpHint`) with Fix it, Replay and Share, then the repair bill and their build.

**After:**

```
Lost on the judges              45.5 to 54.5
Went the full 90 s. Nobody took damage.
┌──────────── FRONT ────────────┐
│            (1)                │  the bot from above,
│      (2)                      │  full card width
│                               │
│                (3)            │
└──────────── BACK ─────────────┘
(1) Front edge, 2.5 mm: Türkeil's wedge got under it 8 times.
(2) Weapon: 0 hits landed.
(3) Armour: all four faces intact.
On their wedge for 74 s of 90
[▓▓▓▓░▓▓▓▓▓░▓▓▓▓▓░▓▓▓▓▓░▓▓▓▓]   0 s … 90 s
Judges      You        Türkeil
Damage      25  ████|████  25
Aggression  12.6 ██|██     12.4
Control     7.9  █|████    17.1
[ Fix it: Body ] [ Test it: Wedge gauge · 0.5 h ] [ Replay ]
```

1. **Headline:** the result line from `ftResult`, the reason, and the judges' totals when the bell decided it.
2. **The drawing:** the silhouette grows to the card's width (about 200 px tall), same part colours and key as today. Up to three numbered markers sit on it: a face marker at the middle of that face, a part marker on that part's cells (`layout.place`). Markers are drawn in the canvas and repeated as an ordered list beside it, so a screen reader gets the same three points.
3. **The notes:** number 1 is the subject of `rpHint`; the rest are `rpCauses` in order. Three at most; the rest sit behind "Show all" (an `.acc` row). When nothing broke and nothing was lost, say so in one line and draw no markers. The wording comes from `rpCauses` and `rpHint` as they are; this release changes where the words sit, not what they say.
4. **A second lane on the timeline:** the stretches your bot spent under, pinned or held, from the log's `under`, `release`, `grab` and `lift` events, as blocks along the same 0 to round-length axis as the hit bars, with one summary line ("On their wedge for 74 s of 90"). Leave the lane out when the total is under 3 s. Opponent blocks use the opponent's team colour.
5. **Judges as bars:** `ftJudges` keeps its `<table>` and its numbers and gains a bar in each cell (width from the score). The post-mortem shows it only when the judges decided.
6. **Test it:** a small table `RP_TEST` beside `RP_FIX`, hint kind to bench test (`under` to gauge, `face` and `impact` to impact, `runtime` and `heat` to endurance, `drop` and `inv` to drop, weapon kinds to weapon). When the hint maps to a test that has not run on the fitted bot, add a "Test it" button that sets `BN.pick` and opens the Bench. Fix it, Replay and Share stay.
7. The repair bill, their build and the fight log cards are untouched.

**Done when:** a lost spar against a wedge shows the lane and a marker on the front edge; a knockout shows a marker on the part that died; a clean win shows no markers; a replay code's post-mortem and a daily's still render.

---

## 7. Release D (0.1.61): the matchup

**Files:** `src/app/fight.js`, `src/app/state.js`, `src/app/career.js` (one call in the bout record), `src/css/style.css`. Check `check-savecode.js` still passes with the new field.

**Today:** Fight › Spar is four rows (Opponent, Format, Arena, Driver) and the Fight bar.

**After:**

```
[Spar][Daily][School][Highlights][Codes]
 YOU                VS            OPPONENT
 Splinter                          Türkeil
 Vertical spinner                    Wedge
 1,481 g                           1,486 g
Tale of the tape        your side: bench readings
 2.63 m/s   ████|███    Top speed     1.92 m/s
 106 J      ████|       Hit energy   no weapon
 148 s      ██|████     Runtime          303 s
 Back                   Weakest face      Back
Last meeting                    Post-mortem ›
 45.5 to 54.5, on the judges
! Front edge not gauged. 2.5 mm on the sheet,
  and they run a wedge.        [Gauge · 0.5 h]
Format ›  Arena ›  Driver ›
[ Splinter vs Türkeil      Change opponent   Fight ]
```

1. **The matchup card** sits above the rows on the Spar page: badge (`lvBadge`), name, team, weapon and weight for each corner; then the tape.
2. **Your side of the tape** uses `sheetNum`: a bench number carries the "Bench" tag, a calculated one does not.
3. **Their side** follows the decision in section 1: before a first meeting, their name, team, weapon, driver style and weight (all of which `ftOppLine` already shows) and dashes in the tape with one line, "Fight them once to see their numbers". After a meeting, their numbers from `evalBuild(opp.cfg)`. In a rumble the card shows the picked opponent only, with "and two more" under it.
4. **Bars** are two bars meeting in the middle, scaled to the larger of the two numbers. No bar for a text row (weakest face).
5. **Last meeting:** win or loss, how it ended and the judges' totals, from the new record below. "Post-mortem" shows only while that fight is still the shown result (`ftShown`); otherwise the line is plain text. Nothing here before a first meeting.
6. **One advice line at most**, from a small table `MATCH_ADVICE` in `fight.js`, first match wins:
   - their weapon is a wedge, lifter or flipper and your gauge test has not run: "Front edge not gauged" with a Gauge button;
   - their weapon is a spinner and your impact test has not run: "Armour not tested" with an Impact button;
   - your runtime is shorter than the round: "The battery won't last the round" with an Endurance button.
   It never blocks Fight. No line when nothing matches.
7. **Rows:** the Opponent row stays (its picker is how you change opponent; "Change opponent" on the Fight bar opens it and scrolls to it). Format, Arena and Driver are unchanged.
8. **The record.** New field `S.met`, a map from a key to `{w, l, last:{won, why, you, them}}`: `why` is the fight's `reason`, `you` and `them` the judges' totals when there were any. Written in `ftRecord` for a spar (not for a replay, a daily, a drill or a bench run) and where the career records a bout (`crRivalMeet` and its callers). Keep Career and Sandbox apart the same way `S.reel` does. Cap it at the 60 most recent entries. `SAVE_V` goes to 20; `MIGRATE[19]` adds an empty `met`; `freshState`, `hydrate` and the career reset learn the field.

**Done when:** a first spar shows dashes on their side and no Last meeting; the second shows their numbers and the last score; the record is still there after a reload and after a Back up then Restore; `node check-savecode.js` passes; an old save loads.

---

## 8. Release E (0.1.62): the plan view

Last, and the one to drop if the first four feel like enough.

**Files:** `src/app/build.js`, `src/app/state.js` (one settings field), `src/html/body.html`, `src/css/style.css`.

1. **A Plan / 3D switch** in the top corner of `#view` on the Build tab only. The choice is `settings.buildView` (`"3d"` by default), a field inside `scr-save`, set through `freshSettings` with no version bump needed if a missing value reads as `"3d"`.
2. **Plan** is an SVG laid over the 3D canvas, dark in both themes like the rest of `#view`: the chassis outline, each part as a labelled block (from `SIM.footprints` and the build's `layout.place`, the same maths as `bLayout`), each face's armour as an edge stroke coloured and weighted as in `bArmourMap`, the centre of mass, and "FRONT" at the top.
3. **Tapping a part or a face** opens its section on the Parts page. Moving parts stays in the Layout section for now.
4. **While Plan is showing the 3D render is paused**, on every tier, and resumed on switching back or leaving the tab. Check the "Graphics lowered" toast never appears because of the switch.
5. The switch is hidden on the home screen and during a fight.

**Done when:** the plan matches the Layout section's grid for every class and body style; switching back shows the 3D bot at once; with Motion reduced the switch does not animate.

---

## 9. Phone test for the whole set

On Lite, in both themes, portrait and landscape:

- Build opens on Parts for a new class and on Sheet once a bot is fitted; the switch works; the weight bar shows bands that add up to the total, and tapping one opens its section.
- A sheet row with no bench number has a Test button that lands on the Bench with that test ticked.
- A bench session of two tests charges the right hours in a career and is free in Sandbox; the weapon card shows the calc line; the sheet's Bench column fills in afterwards.
- Fight › Spar shows the matchup card; their numbers appear after one fight; the advice line appears against a wedge with no gauge test and goes once the gauge has run.
- A lost fight's post-mortem shows numbered markers on the bot, the pinned lane when there was pinning, judges as bars, and Fix it and Test it buttons that land in the right place.
- Build › Plan shows the labelled bot from above and 3D comes back when switched.
- Everything in `CLAUDE.md`'s "What to test on a phone" still holds, the save round trip above all.

---

## 10. Out of scope

- Any change to parts, physics, the bench maths, the fight, the AI or the balance.
- New art, models, sounds or voice lines.
- Career, Shop, Daily, School, Highlights and Codes pages, beyond the Next bout banner's link.
- The matchup card on a career event's own screens (a later release, if the Spar one earns it).
- Dragging parts on the plan view.
- The studio-wide ideas in `LONGLIGHT-STUDIO.md`.

---

## Checklist

- [x] A, 0.1.58.0 (0.1.57 was taken by the pin fix, so B to E are 0.1.59 to 0.1.62): the sheet (Sheet / Parts on Build, calculated and bench numbers, mass bands, Next bout banner). Found on the two pairs: spin-up is the same quantity by two routes (energy over power on the sheet; a run motor with torque and air losses on the bench), so the gap is shown in words and never marked; hit energy is two things (stored, and delivered = stored x bite), labelled so and never marked. Both `better: null`.
- [x] B, 0.1.59.0: the bench session (tested strip, one open card with its calc line, pick and run). The Run session bar shows only while a test is ticked, so it never covers the list.
- [x] C, 0.1.60.0: the post-mortem, drawn (numbered markers, the pinned lane, judges as bars, Test it). The log has no end for a spell under a wedge, so the lane replays the fight from its log and reads the bot's state each step; no sim change. The judges' table stays on the result card just above, with bars; the post-mortem's headline carries the two totals.
- [x] D, 0.1.61.0: the matchup (tale of the tape, last meeting, one advice line, `S.met`, `SAVE_V` 20). Hit energy on the tape is the stored energy on both sides, never the bench's anvil hit, so the two numbers compare. A rumble is not recorded (there is no one opponent to record it against); each round of a best of three is. The Fight bar's button reads Change, to fit beside Fight at 360 px.
- [x] E, 0.1.62.0: the plan view (Plan / 3D on Build, remembered in settings). The switch is in the view's bottom right corner, stacked, because the top corners hold the name, the money and two buttons. Pausing the render needed one line in `src/vis/workshop.js`, which the file list above left out. The top face has no edge, so the plan shows the four sides only.
