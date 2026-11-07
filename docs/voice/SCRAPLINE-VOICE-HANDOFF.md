# Scrapline — Voice pack handoff for Claude Code

**Task:** wire the ElevenLabs commentary pack (announcer Duncan Steiner, commentator Jess Moser) into Scrapline.
Read the repo's `CLAUDE.md` first. If anything here conflicts with it, `CLAUDE.md` wins.

## What's in the drop

| File | What it is |
|---|---|
| `sounds/voice/*.mp3` | 214 takes, one per line, named by the sheet's `file_name` column (e.g. `scrap_announcer_scrap-ann-0029.mp3`) |
| `docs/voice/scrapline_commentary_script_sheet.csv` | Source of truth: `line_id, category, character, trigger, text, tts_text, file_name, …`. `text` is the real spelling (use it for any captions); `tts_text` is only the phonetic respelling the voice was generated from |
| `docs/voice/scrapline_cast_list.md` | Cast, pronunciations, and the trigger → code-event table |
| `docs/voice/SCRAPLINE-VOICE-HANDOFF.md` | This file |

One take per line. 24 announcer lines with place names (Haldis, Stahlbrück, Eisenau, Grauwald, Eisenhalle, Velmark) were regenerated from phonetic respellings for clearer pronunciation; nothing changes for the code.

Line ID prefixes: `SCRAP-ANN` announcer calls, `SCRAP-NAME` name and event stingers (announcer voice), `SCRAP-COMM` live commentator barks, `SCRAP-PM` replay and post-mortem lines (commentator voice).

## Build

1. **Manifest.** Generate `src/sound/voicelines.js` from the CSV with a small script in `tools/` (commit the script and its output): a table of `line_id → {file, character, trigger, pool}`. Rows whose `trigger` starts with `pool:` are variants of one moment, grouped by the rest of the trigger text.
2. **Player.** Add `src/sound/voice.js` in the existing classic-JS style (a `SCRAP_VOICE` global, listed in `src/manifest.txt` after `synth.js`). Reuse the fetch + `decodeAudioData` callback pattern from `src/sound/synth.js` (older Safari needs the callback form).
   - Lazy-load: fetch clips the first time the Fight tab opens, not at boot. Announcer core calls first, the rest after.
   - Two channels: announcer and commentator. Never play a commentator bark over a countdown, result call or name stinger. One commentator bark every ~3 s at most.
   - Pools: pick with a seeded stream from `src/sim/rng.js` (not `Math.random`) and don't repeat the last pick.
   - Stitching: "judges reveal" (`SCRAP-ANN-0049`) is followed by a `SCRAP-NAME` stinger (rival or bot name, else "The challenger!" / "The home workshop!"). Custom player bot names are never voiced.
3. **Hooks.** Drive it from the fight log and app state, not from inside the sim. The cast list's table maps every trigger to its source: `F.log[].k` events from `src/sim/fight.js` (hit, gl, ram, wall, under, lift, drop, release, flip, tip, self, inv, right, fail, heat, haz, pitopen, end), `o.immobileS`, `rules.roundS − F.t`, `FT.bout`, `app/pit.js`, `EVENT_KINDS`, `SEASON_EVENTS[].venue`, `S.career.act`, `ftReplay`, `rpHint`. Ignore `end.why === "stopped"`.
   - The sim must stay deterministic: voice reads the log, never writes to it. `tools/sim-test.js` bans `Math.random` and `Date.now` in the sim.
   - Replays: commentator lines can play during `ftReplay`; the `SCRAP-PM` analysis lines go on the post-fight report, matched to the `rpHint` reason.
4. **Settings.** A voice on/off toggle and a commentary on/off toggle beside the existing sound setting, saved with the other settings. Respect the existing mute.
5. **Offline.** Make sure `build.js` / `sw.js` handle the new `sounds/voice/` folder the same way as `sounds/` (or deliberately leave voice out of the precache if size is a concern, and say which).
6. **Credits.** Add a line to `sounds/CREDITS.md`: voices generated with ElevenLabs (eleven_v4), announcer and commentator, generated November 2026.
7. **Version.** Bump `const VERSION` in `src/app/state.js` (Minor = feature batch).

## Check before you finish

- `node build.js --check`, `node check-savecode.js`, `node tools/sim-test.js`, `node tools/fight-test.js` all pass.
- Every `file_name` in the CSV exists in `sounds/voice/`, and every voice file is referenced (have the manifest script fail on a mismatch).
- Two replays of the same fight pick the same pool lines.

## Tell Kelbo how to test on his phone

End with a plain-language summary and steps: open the live site, start a fight, listen for the countdown, a hit reaction and the result call; toggle commentary off and on; run a best of three to hear the pit window calls; open a replay.
