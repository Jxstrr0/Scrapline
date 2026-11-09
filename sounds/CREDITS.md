# Sounds

Recorded one-shots layered under the synth on the Full and Ultra tiers (`src/sound/synth.js`, `samples`). Lite never loads them and keeps the synth alone. The effects pack in `sfx/` (below) is Kelbo's own; some of it plays on every tier.

All files in this folder (not `sfx/` or `voice/`) are from CC0 1.0 (public domain) packs from OpenGameArt:

- **100 CC0 metal and wood SFX** by rubberduck, CC0 1.0, https://opengameart.org/content/100-cc0-metal-and-wood-sfx
- **75 CC0 breaking/falling/hit SFX** by rubberduck, CC0 1.0, https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx
- **27 Metal Audio Samples** by blacklodgegames, CC0 1.0, https://opengameart.org/content/27-metal-audio-samples-sfx

Changes: each clip was trimmed, peak-normalised, given a 40 ms fade-out and encoded to mono 44.1 kHz mp3 at 80 kbps; part2 was cut to 0.9 s.

| File | Source clip | Pack | Author | Licence |
|---|---|---|---|---|
| hit1.mp3 | metal_hit_01 | 100 CC0 metal and wood SFX | rubberduck | CC0 1.0 |
| hit2.mp3 | metal_hit_04 | 100 CC0 metal and wood SFX | rubberduck | CC0 1.0 |
| hit3.mp3 | metal_hit_05 | 100 CC0 metal and wood SFX | rubberduck | CC0 1.0 |
| hit4.mp3 | bfh1_metal_hit_03 | 75 CC0 breaking/falling/hit SFX | rubberduck | CC0 1.0 |
| big1.mp3 | metal_slam_01 | 100 CC0 metal and wood SFX | rubberduck | CC0 1.0 |
| big2.mp3 | metal_sheet_03 | 100 CC0 metal and wood SFX | rubberduck | CC0 1.0 |
| big3.mp3 | metal_sheet_06 | 100 CC0 metal and wood SFX | rubberduck | CC0 1.0 |
| big4.mp3 | dull_metal_collision_11 | 27 Metal Audio Samples | blacklodgegames | CC0 1.0 |
| wall1.mp3 | dull_metal_collision_06 | 27 Metal Audio Samples | blacklodgegames | CC0 1.0 |
| wall2.mp3 | dull_metal_collision_09 | 27 Metal Audio Samples | blacklodgegames | CC0 1.0 |
| wall3.mp3 | dull_metal_collision_04 | 27 Metal Audio Samples | blacklodgegames | CC0 1.0 |
| land1.mp3 | bfh1_metal_falling_03 | 75 CC0 breaking/falling/hit SFX | rubberduck | CC0 1.0 |
| land2.mp3 | bfh1_metal_falling_04 | 75 CC0 breaking/falling/hit SFX | rubberduck | CC0 1.0 |
| land3.mp3 | dull_metal_collision_01 | 27 Metal Audio Samples | blacklodgegames | CC0 1.0 |
| part1.mp3 | bfh1_breaking_02 | 75 CC0 breaking/falling/hit SFX | rubberduck | CC0 1.0 |
| part2.mp3 | rapid_clangs_01 | 27 Metal Audio Samples | blacklodgegames | CC0 1.0 |
| haz1.mp3 | dull_metal_collision_07 | 27 Metal Audio Samples | blacklodgegames | CC0 1.0 |
| haz2.mp3 | dull_metal_collision_13 | 27 Metal Audio Samples | blacklodgegames | CC0 1.0 |

## Voices (`voice/`)

The announcer (Duncan Steiner) and commentator (Jess Moser), 214 lines: voices generated with ElevenLabs (eleven_v4), announcer and commentator, generated November 2026, for Kelbo / Longlight Interactive. The script is Kelbo's (`docs/voice/scrapline_commentary_script_sheet.csv`); the clips were re-encoded to 64 kbps mono MP3 for the page. Listed in `src/sound/voicelines.js` (built by `tools/make-voicelines.js`). Since 0.1.17.2 the game loads the same files from `https://assets.longlight.games/scrapline/voice/` (Longlight's asset host) and falls back to this folder; keep the two in step.

## sfx/: the effects pack (original)

Kelbo's own work: generated with ElevenLabs (eleven_text_to_sound_v2), November 2026, from the prompts in Kelbo's SFX sheet; two takes each, the better one kept. Changes: trimmed, peak-normalised to -1 dBFS, a 40 ms fade-out, mono 44.1 kHz mp3 at 80 kbps; the three crowd beds are 20 s loops with the last second crossfaded into the first (no fade), so they loop without a seam. The wheel layouts' effects (caster, mecanum, swerve; 0.1.31) were generated the same way from prompts written for them, and both takes of each are kept as variants.

Every tier: crowd_club, crowd_reg, crowd_big (looped beds), cheer1-2, ooh1-2, groan1-2, clap1-2, bell, pitopen, ratchet, drill, clamp, charger. Full and Ultra only (with the recorded clangs): spin_h, spin_v, spin_drum, spin_saw, spin_under, flip1-2, fliphp, hammer1-2, lifter, crush, ply1-2, hdpe, ti, ar, tyre1-2, scrape1-2, snap1-2, bend1-2, partoff1-2, thud, land1-2, pusher, floorspin, selfright, powerdown, smoke.

| File | Author | Licence |
|---|---|---|
| sfx/ar.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/bell.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/bend1.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/bend2.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/charger.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/cheer1.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/cheer2.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/clamp.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/clap1.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/clap2.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/crowd_big.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/crowd_club.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/crowd_reg.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/crush.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/drill.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/flip1.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/flip2.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/fliphp.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/floorspin.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/groan1.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/groan2.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/hammer1.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/hammer2.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/hdpe.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/land1.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/land2.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/lifter.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/ooh1.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/ooh2.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/partoff1.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/partoff2.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/pitopen.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/ply1.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/ply2.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/powerdown.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/pusher.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/ratchet.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/scrape1.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/scrape2.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/selfright.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/smoke.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/snap1.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/snap2.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/spin_drum.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/spin_h.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/spin_saw.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/spin_under.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/spin_v.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/thud.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/ti.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/tyre1.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/tyre2.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/caster1.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/caster2.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/mecanum1.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/mecanum2.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/swerve1.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
| sfx/swerve2.mp3 | Kelbo (ElevenLabs, original) | Original work, Longlight Interactive |
