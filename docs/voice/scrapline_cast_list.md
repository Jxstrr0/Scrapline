# Scrapline — Commentary pack v3: cast list

Game code `SCRAP` · model `eleven_v4` · 1 take per line · 221 lines, ~9,250 spoken characters
Checked against the Scrapline repo (`src/sim/fight.js`, `src/app/fight.js`, `src/app/pit.js`, `src/app/career.js`, `src/app/state.js`) on 7 Nov 2026.

## Cast

| Character | Name | Direction | Voice (voice_id) |
|---|---|---|---|
| `announcer` | **Duncan Steiner** | Big-arena PA voice, Canadian, booming and theatrical. Owns intros, countdowns, pit calls, results, name and event stingers. Never mocks a losing crew. | **Cast: Tyler – Arena Announcer & Event Host** (`GyIXYY876myKNtA1j8NI`), Canadian |
| `commentator` | **Jess Moser** | Radio Velmark play-by-play, Canadian, quick and warm, knows the workshop side, dry humour. Owns live barks, replays and the post-mortem. On TV at the Eisenhalle in the Heavyweight act. | **Cast: Megan – Expressive & Playful** (`k56mKR2rds72oUAqTsob`), Canadian |

Keep the two voices clearly different in pitch and pace, since live barks and announcer calls can land close together.

## Name changes (apply in the repo too)

| Old | New | Why |
|---|---|---|
| Ottilie Brandt | **Kayla Rauch** | Clashed with Station Keeper's Ottilie Brandvold |
| Rudi Kessler | **Mitch Gerber** | Kessel/Kessler is used in Red Skies and Escapement |

Mira Vogt and Anselm Huber stay. Added in 0.1.67.1: Fenna Pohl and Hedda Sauter (first written as Fenna Kessler and Hedda Brandt, renamed before recording for the same clashes), and a grudge-match pool (SCRAP-ANN-0070 to 0072). Bot names, venues and event names are canon and unchanged.

## Pronunciation (canon German-style names)

Record the name stingers first in the audition. Duncan's place-name lines were regenerated from the respellings below (sheet column `tts_text`). Megan's lines use the plain spelling and were kept as recorded.

| Name | IPA | TTS respelling (Duncan) |
|---|---|---|
| Haldis | /ˈhaldɪs/ | Hall-diss |
| Gemeindehalle | /ɡəˈmaɪ̯ndəˌhalə/ | Guh-mine-duh-hall-uh |
| Stahlbrück | /ˈʃtaːlbʁʏk/ | Shtahl-brook |
| Eisenau | /ˈaɪ̯zənaʊ̯/ | Eye-zen-ow |
| Grauwald | /ˈɡʁaʊ̯valt/ | Grouw-vald |
| Eisenhalle | /ˈaɪ̯zənˌhalə/ | Eye-zen-hall-uh |
| Zahnrad | /ˈtsaːnʁaːt/ |  |
| Kiesel | /ˈkiːzəl/ |  |
| Feierabend | /ˈfaɪ̯ɐˌʔaːbn̩t/ |  |
| Holzwurm | /ˈhɔltsvʊʁm/ |  |
| Glockenschlag | /ˈɡlɔkn̩ʃlaːk/ |  |
| Zange | /ˈtsaŋə/ |  |
| Uhrwerk | /ˈuːɐ̯vɛʁk/ |  |
| Lawine | /laˈviːnə/ |  |
| Hochofen | /ˈhoːxˌʔoːfn̩/ |  |
| Walzwerk | /ˈvaltsvɛʁk/ |  |
| Rauch | /ʁaʊ̯x/ |  |
| Vogt | /foːkt/ |  |
| Pohl | /poːl/ | Pole |
| Sauter | /ˈzaʊ̯tɐ/ | Zow-ter |

## How the lines map to the game

Every `trigger` in the sheet names the real event or state, so wiring is a lookup:

| Trigger in sheet | Where it comes from |
|---|---|
| venue welcome | `SEASON_EVENTS[].venue`: club, stahl, eisenau, grauwald, eisenhalle |
| class intro | `day.cls`: ant, beetle, hobby, feather, heavy |
| event kind intro, bracket round | `EVENT_KINDS` (club league, tournament bracket, champ, rumble, tag) and `crNext().label` (quarter-final, semi-final, final) |
| countdown | fight start (`SIM.newFight` / first step) |
| hit, glancing hit, ram, wall, under, lift, drop/release, flip, tip, self, inv, right, fail (shock/esc/flat/part/cell), heat, haz, pitopen | `F.log[].k` events from `src/sim/fight.js` (`gl=1` on a glancing hit, `heavy=1` on a failed flip) |
| arena pit | `pitopen` event, then `out==="pit"` |
| immobile count | `o.immobileS > 0` (KO at `rules.koS`, 10 s) |
| final seconds | `rules.roundS − F.t ≤ 10` (round is 90 s) |
| fight ends | `end` event: `why` = ko, pit, judges, draw (ignore `stopped`) |
| judges' criteria | `stepJudge` / `judgeFight` (aggression, damage, control) |
| best of three, pit window | `FT.bout` wins and `app/pit.js` (60 s `PIT_S`) |
| tag team | 2v2 with all four bots in the box at once (no swapping) |
| minibot | dropped at the bell when the parent has the minibot extra |
| career lines | `S.career.act` (Garage → Circuit → Heavyweight → Legacy), first win, season start |
| replay / post-mortem | `ftReplay` and `rpHint` in `app/report.js` (pit, inverted, got under, armour face, held up) |

## Wiring notes

- **Live fights:** announcer calls plus sparse commentator barks with a cooldown (one every few seconds at most, never over a countdown or result call). Fuller commentary belongs in the replay.
- **Pools:** rows whose `trigger` starts with "pool:" are variants. Pick with the seeded RNG (`src/sim/rng.js`), not `Math.random`, so replays stay deterministic, and avoid repeating the last one played.
- **Stitching:** "judges reveal" and intros can be followed by a `SCRAP-NAME` stinger. Custom player bot names can't be voiced, so the player gets "The challenger!" / "The home workshop!".
- **Loading:** load the pack when the Fight tab opens, not at boot.
- **Credits:** add the ElevenLabs lines to the repo's credits file when they ship.
