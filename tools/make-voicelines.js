#!/usr/bin/env node
/* Scrapline: builds src/sound/voicelines.js (the voice pack's manifest) from docs/voice/scrapline_commentary_script_sheet.csv.
     node tools/make-voicelines.js           write src/sound/voicelines.js (then node build.js)
     node tools/make-voicelines.js --check   exit 1 if it is out of date, without writing
   Each sheet row becomes VOICE_LINES[line_id] = {f, c, q, p, d, t}:
     f  the file in sounds/voice/ (the sheet's file_name)
     c  "a" announcer (Duncan Steiner) or "c" commentator (Jess Moser), from the sheet's character
     q  the cue the game asks for (CUE below turns the sheet's trigger text into one; a few lines get a narrower cue by
        id, SUB, so "A whole wheel just came off!" only plays when a wheel goes)
     p  1 when the cue has more than one line (a pool: rows whose trigger starts "pool:", or rows that share one trigger)
     d  the clip's length in seconds, counted from its MP3 frames (the director times the calls with it)
     t  the caption: the sheet's text with the [delivery tags] taken out (tts_text is only the respelling the voice read)
   It fails, writing nothing, when a row's file is missing from sounds/voice/, a file there is in no row, or a trigger
   maps to no cue. Plain node, nothing to install. */
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, ".."), SHEET = path.join(ROOT, "docs/voice/scrapline_commentary_script_sheet.csv");
const DIR = path.join(ROOT, "sounds/voice"), OUT = path.join(ROOT, "src/sound/voicelines.js"), check = process.argv.includes("--check");
const die = m => { console.log("FAIL " + m); process.exit(1); };

/* a CSV parser for the sheet: quoted fields with "" escapes and commas inside quotes */
function csv(s) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < s.length; i++) { const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { row.push(f); f = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && s[i + 1] === "\n") i++; row.push(f); f = ""; if (row.length > 1 || row[0]) rows.push(row); row = []; }
    else f += ch; }
  if (f || row.length) { row.push(f); rows.push(row); }
  const head = rows.shift(); return rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] || ""])));
}

/* the clip's length from its MPEG audio frames (MPEG-1/2/2.5 layer III), skipping an ID3v2 tag */
function mp3Secs(file) {
  const b = fs.readFileSync(file); let i = 0, n = 0, secs = 0;
  if (b.slice(0, 3).toString() === "ID3") i = 10 + ((b[6] & 127) << 21 | (b[7] & 127) << 14 | (b[8] & 127) << 7 | (b[9] & 127));
  const BR = { 1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], 2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160] };
  const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
  while (i + 4 <= b.length) {
    if (b[i] !== 0xFF || (b[i + 1] & 0xE0) !== 0xE0) { i++; continue; }
    const ver = (b[i + 1] >> 3) & 3, lay = (b[i + 1] >> 1) & 3, bi = b[i + 2] >> 4, si = (b[i + 2] >> 2) & 3, pad = (b[i + 2] >> 1) & 1;
    if (ver === 1 || lay !== 1 || bi === 0 || bi === 15 || si === 3) { i++; continue; }
    const sr = SR[ver][si], spf = ver === 3 ? 1152 : 576, br = BR[ver === 3 ? 1 : 2][bi] * 1000, len = Math.floor(spf / 8 * br / sr) + pad;
    if (len < 4) { i++; continue; }
    secs += spf / sr; n++; i += len;
  }
  if (!n) die(`${path.basename(file)} has no MP3 frames`);
  return Math.round(secs * 100) / 100;
}

/* trigger text -> cue. Order matters: the first match wins. */
const RIVAL_ID = { "Kayla Rauch": "ottilie", "Mitch Gerber": "rudi", "Mira Vogt": "mira", "Anselm Huber": "anselm" };   // RIVALS ids (app/state.js) stay as they were, so saves keep their records
const CUE = [
  [/^event day start: self intro$/, () => "intro"],
  [/venue welcome .*\(venue=(\w+)\)/, m => "venue:" + m[1]],
  [/^class intro: (\w+)$/, m => "class:" + m[1]],
  [/^event kind intro: (club meet|tournament|championship|rumble|tag team)/, m => "kind:" + { "club meet": "club", tournament: "tournament", championship: "champ", rumble: "rumble", "tag team": "tag" }[m[1]]],
  [/^bracket round: (quarter-final|semi-final|final)/, m => "round:" + m[1]],
  [/^rival intro: (.+)$/, m => RIVAL_ID[m[1]] ? "rival:" + RIVAL_ID[m[1]] : null],
  [/countdown/, () => "countdown"],
  [/^pool: arena pit opens mid-fight/, () => "pitopen"],
  [/^pool: pit window opens/, () => "pitwin"],
  [/^pit window: 10 seconds left/, () => "pit10"],
  [/^pool: pit window closes/, () => "pitclose"],
  [/^pool: bot immobile, 10-second count/, () => "count"],
  [/\(reason=ko\)/, () => "end:ko"],
  [/\(reason=pit\)/, () => "end:pit"],
  [/\(reason=judges\)/, () => "end:judges"],
  [/^judges reveal/, () => "reveal"],
  [/\(reason=draw\)/, () => "draw"],
  [/^pool: player wins the fight/, () => "win"],
  [/^pool: player loses the fight/, () => "lose"],
  [/^rumble: last bot moving/, () => "rumble:won"],
  [/^tag team: both opponents out/, () => "tag:won"],
  [/^best of three: player leads/, () => "bo3:lead"],
  [/^best of three: player trails/, () => "bo3:trail"],
  [/^best of three: decider/, () => "bo3:decider"],
  [/^career: first ever win/, () => "career:first"],
  [/^career: new season/, () => "career:season"],
  [/^career: moved up to the Circuit/, () => "career:act1"],
  [/^career: moved up to the Heavyweight/, () => "career:act2"],
  [/^career: Scrapline Open won/, () => "career:open"],
  [/^career: defending champion intro/, () => "career:defend"],
  [/^name stinger: AI bot (.+)$/, m => "name:" + m[1]],
  [/^name stinger: rival (.+)$/, m => RIVAL_ID[m[1]] ? "name:rv:" + RIVAL_ID[m[1]] : null],
  [/^name stinger: player/, () => "name:you"],
  [/^pool: name stinger generic tag/, () => "name:tag"],
  [/^event name stinger: (.+)$/, m => "event:" + m[1]],
  /* the commentator */
  [/^pool: match start self intro/, () => "c:intro"],
  [/^Eisenhalle TV intro/, () => "c:tv"],
  [/^pool: fight start/, () => "c:start"],
  [/^pool: weapon hit/, () => "c:hit"],
  [/^pool: glancing hit/, () => "c:gl"],
  [/^pool: ram \/ wall slam/, () => "c:ram"],
  [/^pool: got under/, () => "c:under"],
  [/^pool: lifted/, () => "c:lift"],
  [/^pool: hold released/, () => "c:release"],
  [/^pool: flipped/, () => "c:flip"],
  [/^flipper fires, can't lift/, () => "c:heavy"],
  [/^pool: self-flip/, () => "c:self"],
  [/^pool: landed inverted/, () => "c:inv"],
  [/^pool: self-righted/, () => "c:right"],
  [/\(fail (shock|esc|flat|part|cell)\)/, m => "c:fail:" + m[1]],
  [/^pool: motor overheating/, () => "c:heat"],
  [/^pool: arena hazard hit/, () => "c:haz"],
  [/^pool: arena pit opens/, () => "c:pitopen"],
  [/^pool: bot into the arena pit/, () => "c:pit"],
  [/^pool: immobile, count running/, () => "c:still"],
  [/^pool: final seconds/, () => "c:final"],
  [/^pool: judges' criteria/, () => "c:judges"],
  [/^pool: momentum swing/, () => "c:swing"],
  [/^pool: player wins$/, () => "c:win"],
  [/^pool: player loses$/, () => "c:lose"],
  [/^pool: rumble/, () => "c:rumble"],
  [/^pool: tag team/, () => "c:tag"],
  [/^pool: minibot/, () => "c:mini"],
  [/^pool: pit window between rounds/, () => "c:pitwin"],
  [/^pool: slow-mo replay intro/, () => "pm:replay"],
  [/^redesign hint: went into the pit/, () => "pm:pit"],
  [/^redesign hint: ended upside down/, () => "pm:inv"],
  [/^redesign hint: they got under you/, () => "pm:under"],
  [/^redesign hint: a face took the damage/, () => "pm:face"],
  [/^redesign hint: it held up/, () => "pm:held"],
  [/^pool: general analysis/, () => "pm:gen"]
];
/* lines that only fit part of their pool's moment get a narrower cue (app/fight.js asks for the narrow one first) */
const SUB = {
  "SCRAP-COMM-0012": "c:hit:side", "SCRAP-COMM-0016": "c:hit:wheels",
  "SCRAP-COMM-0019": "c:ram:wall", "SCRAP-COMM-0022": "c:ram:wall",
  "SCRAP-COMM-0047": "c:fail:wheel", "SCRAP-COMM-0048": "c:fail:weapon", "SCRAP-COMM-0049": "c:fail:armour",
  "SCRAP-COMM-0051": "c:heat:drive", "SCRAP-COMM-0052": "c:heat:weapon",
  "SCRAP-COMM-0053": "c:haz:spinner", "SCRAP-COMM-0055": "c:haz:pusher",
  "SCRAP-COMM-0068": "c:judges:split", "SCRAP-COMM-0069": "c:judges:control",
  "SCRAP-COMM-0073": "c:swing:run", "SCRAP-COMM-0085": "c:rumble:half", "SCRAP-COMM-0086": "c:rumble:late",
  "SCRAP-COMM-0088": "c:tag:help", "SCRAP-COMM-0092": "c:mini:under",
  "SCRAP-PM-0012": "pm:weapon", "SCRAP-PM-0013": "pm:pinned", "SCRAP-PM-0014": "pm:spin",
  "SCRAP-NAME-0017": "name:champ"
};

const rows = csv(fs.readFileSync(SHEET, "utf8"));
if (!rows.length) die("the sheet has no rows");
const files = new Set(fs.readdirSync(DIR).filter(n => n.endsWith(".mp3"))), used = new Set(), out = [], count = {};
for (const r of rows) {
  const id = r.line_id, ch = r.character === "announcer" ? "a" : r.character === "commentator" ? "c" : null;
  if (!/^SCRAP-(ANN|NAME|COMM|PM)-\d{4}$/.test(id)) die(`odd line_id "${id}"`);
  if (!ch) die(`${id}: character "${r.character}"`);
  if (!files.has(r.file_name)) die(`${id}: ${r.file_name} is not in sounds/voice/`);
  if (used.has(r.file_name)) die(`${id}: ${r.file_name} is used twice`);
  used.add(r.file_name);
  let q = SUB[id] || null;
  if (!q) for (const [re, fn] of CUE) { const m = r.trigger.match(re); if (m) { q = fn(m); break; } }
  if (!q) die(`${id}: no cue for trigger "${r.trigger}"`);
  const t = r.text.replace(/\[[^\]]*\]\s*/g, "").replace(/\s+/g, " ").trim();
  if (!t) die(`${id}: empty caption`);
  out.push({ id, f: r.file_name, c: ch, q, d: mp3Secs(path.join(DIR, r.file_name)), t, pool: /^pool:/.test(r.trigger), trig: r.trigger });
  count[q] = (count[q] || 0) + 1;
}
for (const f of files) if (!used.has(f)) die(`sounds/voice/${f} is in no row of the sheet`);
for (const o of out) o.p = o.pool || count[o.q] > 1 ? 1 : 0;

const js = JSON.stringify;
const body = out.map(o => `${js(o.id)}:{f:${js(o.f)},c:${js(o.c)},q:${js(o.q)},p:${o.p},d:${o.d},t:${js(o.t)}}`).join(",\n");
const text = `<script>
/* ===================== Scrapline: the voice pack's lines (VOICE_LINES) =====================
   Generated by tools/make-voicelines.js from docs/voice/scrapline_commentary_script_sheet.csv: do not edit by hand, run
   the tool again. ${out.length} lines, one take each, in sounds/voice/ (ElevenLabs eleven_v4, November 2026; sounds/CREDITS.md).
   line_id -> {f file, c "a" announcer Duncan Steiner / "c" commentator Jess Moser, q the cue the game asks for (the tool
   turns the sheet's trigger into it), p 1 when the cue is a pool of variants, d seconds, t the caption}. Played by
   SCRAP_VOICE (sound/voice.js). */
const VOICE_LINES={
${body}};
</script>
`;
if (check) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  if (cur !== text) die("src/sound/voicelines.js is out of date: run node tools/make-voicelines.js");
  console.log(`voicelines: ${out.length} lines, ${Object.keys(count).length} cues, up to date`);
} else {
  fs.writeFileSync(OUT, text);
  console.log(`wrote src/sound/voicelines.js: ${out.length} lines, ${Object.keys(count).length} cues, ${Math.round(out.reduce((a, o) => a + o.d, 0))} s of audio`);
}
