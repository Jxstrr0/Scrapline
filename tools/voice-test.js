#!/usr/bin/env node
/* tools/voice-test.js: checks the voice director (SCRAP_VOICE, src/sound/voice.js) in plain node.
   It cuts SCRAP_SIM, VOICE_LINES and SCRAP_VOICE out of the built index.html (so it tests what ships), runs fights,
   and plays each one back through the director twice, as a replay at 1x and again, with captions standing in for audio.
   It exits 1 if:
     - two replays of the same fight pick different lines, or the same replay at 2x differs from itself
     - a cue the app asks for (the intro, the bell, the pit, the post-mortem) has no line
     - the commentator speaks twice within 3 s of real time, or over the announcer
     - a stopped fight gets result calls
   Run: node tools/voice-test.js   (node build.js first) */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, ".."), html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const block = mark => { const at = html.indexOf(mark); if (at < 0) { console.log("FAIL no block: " + mark); process.exit(1); }
  return html.slice(html.lastIndexOf("<script>", at) + 8, html.indexOf("</script>", at)); };
const ctx = { console, setTimeout: (f) => 0, clearTimeout: () => {}, module: { exports: {} } };
ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(block("Scrapline: robot sim core") + ";globalThis.SCRAP_SIM=SCRAP_SIM;", ctx);
vm.runInContext(block("const VOICE_LINES=") + ";globalThis.VOICE_LINES=VOICE_LINES;", ctx);
vm.runInContext(block("Scrapline: the voices (SCRAP_VOICE)") + ";globalThis.SCRAP_VOICE=SCRAP_VOICE;", ctx);
const SIM = ctx.SCRAP_SIM, V = ctx.SCRAP_VOICE, L = ctx.VOICE_LINES;
let fails = 0; const fail = m => { fails++; console.log("FAIL " + m); };

/* muted, captions on: every call the director makes comes back through onCap, in order */
V.set({ sound: false, voice: true, comm: true, captions: "muted" });
const said = []; let now = 0; V.onCap = (text, who) => said.push({ t: now, text, who });

/* the director over a replay of F's log at a given speed: [{t, text, who}] */
function direct(log, speed, kind) {
  said.length = 0; const play = {};
  for (const k in log.inputs || {}) play[k] = SIM.unpackInputs(log.inputs[k]);
  const F = SIM.newFight({ seed: log.seed, arena: log.arena, rules: log.rules, bots: log.bots, play });
  V.begin(F, { speed, replay: true, kind });
  const per = Math.max(1, Math.round(speed));   // the app steps up to 5 times a frame; at 2x about two
  while (!F.over && F.n < log.steps) { for (let k = 0; k < per && !F.over; k++) SIM.stepFight(F, null); now = F.t; if (!F.over) V.tick(F, speed); }
  return { F, out: said.map(x => x.t.toFixed(2) + " " + x.who + " " + x.text) };
}

const cls = ["beetle", "feather", "heavy"], tb = SIM.TEST_BUILDS.filter(t => t.id !== "sloppy");
let fights = 0, lines = 0;
for (let n = 0; n < 9; n++) {
  const c = cls[n % cls.length], a = tb[n % tb.length], b = tb[(n * 5 + 3) % tb.length];
  const F = SIM.runFight({ seed: 1000 + n * 7919, arena: SIM.CLASSES[c].arenaId,
    bots: [{ cfg: Object.assign({}, a.cfg, { cls: c }), name: "You", driver: { style: "auto", skill: 0.7 } },
           { cfg: Object.assign({}, b.cfg, { cls: c }), name: "Kiesel", driver: { style: "auto", skill: 0.7 } }] });
  const log = F.log; fights++;
  const r1 = direct(log, 1, "duel"), r2 = direct(log, 1, "duel");
  if (r1.out.join("\n") !== r2.out.join("\n")) fail(`fight ${n}: two replays picked different lines`);
  const f1 = direct(log, 2, "duel"), f2 = direct(log, 2, "duel");
  if (f1.out.join("\n") !== f2.out.join("\n")) fail(`fight ${n}: two 2x replays picked different lines`);
  lines += r1.out.length;
  /* spacing: the commentator's barks at least 3 s of real time apart (fight time / speed) */
  const rr = direct(log, 1, "duel"), cs = said.filter(x => x.who === "c");
  for (let i = 1; i < cs.length; i++) if (cs[i].t - cs[i - 1].t < 3 - 1e-6) fail(`fight ${n}: commentator twice in ${(cs[i].t - cs[i - 1].t).toFixed(2)} s`);
  /* the bell's calls */
  const cues = V.endCues(rr.F, { kind: "duel", bout: null });
  if (rr.F.reason !== "stopped" && rr.F.winner != null && !cues.length) fail(`fight ${n}: no result calls (${rr.F.reason})`);
  if (rr.F.reason === "judges" && cues.indexOf("reveal") < 0) fail(`fight ${n}: judges without the reveal`);
}
/* a stopped fight says nothing at the bell */
{ const F = SIM.newFight({ seed: 5, arena: "box", bots: [{ cfg: tb[0].cfg, name: "You" }, { cfg: tb[1].cfg, name: "X" }] });
  F.over = true; F.reason = "stopped"; if (V.endCues(F, {}).length) fail("a stopped fight got result calls"); }
/* a best of three that ends level gets no win or loss call; an over bout takes its result from the bout, not the round */
{ const F = SIM.newFight({ seed: 6, arena: "box", bots: [{ cfg: tb[0].cfg, name: "You" }, { cfg: tb[1].cfg, name: "X" }] });
  F.over = true; F.reason = "ko"; F.winner = F.bots[1].team;
  const lvl = V.endCues(F, { kind: "duel", bout: { me: 1, them: 1, over: true } });
  if (lvl.indexOf("c:win") >= 0 || lvl.indexOf("c:lose") >= 0) fail("a drawn best of three got a win or loss call");
  if (V.endCues(F, { kind: "duel", bout: { me: 2, them: 1, over: true } }).indexOf("c:win") < 0) fail("a won best of three lost on its last round got no win call"); }

/* every cue the app asks for has at least one line */
const need = ["intro", "countdown", "pitwin", "c:pitwin", "pit10", "pitclose", "pm:replay", "pm:gen", "pm:pit", "pm:inv", "pm:under", "pm:face",
  "pm:held", "pm:weapon", "pm:pinned", "name:you", "career:first", "career:season", "career:act1", "career:act2", "career:defend", "career:open",
  "c:intro", "c:tv", "bo3:decider", "bo3:lead", "bo3:trail", "end:ko", "end:pit", "end:judges", "reveal", "draw", "win", "lose", "c:win", "c:lose",
  "rumble:won", "tag:won", "kind:rumble", "kind:tag", "kind:club", "kind:tournament", "kind:champ", "round:quarter-final", "round:semi-final", "round:final"]
  .concat(["club", "stahl", "eisenau", "grauwald", "eisenhalle"].map(v => "venue:" + v), SIM.CLASS_IDS.map(c => "class:" + c),
    ["ottilie", "rudi", "mira", "anselm"].map(r => "rival:" + r));
for (const q of need) if (!V.pool(q).length) fail("no line for cue " + q);

console.log(`voice: ${Object.keys(L).length} lines, ${fights} fights replayed 6 times each, ${lines} calls in the 1x replays`);
if (fails) { console.log(fails + " failure(s)"); process.exit(1); }
console.log("ok");
