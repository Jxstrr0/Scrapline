#!/usr/bin/env node
/* tools/voice-test.js: checks the voice director (SCRAP_VOICE, src/sound/voice.js) in plain node.
   It cuts SCRAP_SIM, VOICE_LINES and SCRAP_VOICE out of the built index.html (so it tests what ships), runs fights,
   and plays each one back through the director twice, as a replay at 1x and again, with captions standing in for audio.
   It exits 1 if:
     - two replays of the same fight pick different lines, or the same replay at 2x differs from itself
     - a cue the app asks for (the intro, the bell, the pit, the post-mortem) has no line
     - the commentator speaks twice within 3 s of real time, or over the announcer
     - a stopped fight gets result calls
     - with sound on (a fake audio clock, the timing() part): two clips are ever heard at once, in an intro, a live
       fight with slow decodes, the bell's calls, a replay whose speed changes, or the pit window; an intro holds the
       fight past INTRO_MAX; the bell isn't right after the countdown; a clip plays after a stop
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


/* ---- keeping time (0.1.56.1): the same voice block again, with sound on, on a fake clock ----
   A second copy of SCRAP_VOICE gets a fake audio context (clips "decode" after a set delay and report when they start
   and stop), a fake fetch, and fake timers, all on one clock this test winds forward. Every clip that plays is logged
   as [start, end]; no two may overlap, whatever the decode delay, the replay speed, or what cut in. */
async function timing() {
  const clk = { ms: 0, timers: [], id: 0, lat: 40 }, heard = [], live = new Set();
  const byFile = {}; for (const id in L) byFile[L[id].f] = id;
  const run = to => { for (;;) { const due = clk.timers.filter(t => t.at <= to).sort((x, y) => x.at - y.at || x.id - y.id)[0]; if (!due) break;
    clk.timers.splice(clk.timers.indexOf(due), 1); clk.ms = Math.max(clk.ms, due.at); due.f(); } clk.ms = to; };
  const later = (f, ms) => { clk.timers.push({ f, at: clk.ms + (ms || 0), id: ++clk.id }); return clk.id; };
  const actx = { get currentTime() { return clk.ms / 1000; },
    decodeAudioData(raw, ok) { const id = byFile[Buffer.from(raw).slice(3).toString()]; later(() => ok({ id, duration: L[id].d - 0.03 }), clk.lat); },
    createGain: () => ({ gain: {}, connect() {} }),
    createBufferSource() { const s = { connect() {}, start(when) { s.h = { id: s.buffer.id, who: L[s.buffer.id].c, t0: when, t1: when + s.buffer.duration }; heard.push(s.h); live.add(s); },
      stop() { if (s.h && live.has(s)) { live.delete(s); s.h.t1 = Math.min(s.h.t1, Math.max(s.h.t0, clk.ms / 1000)); } } }; return s; } };
  const c2 = { console, module: { exports: {} }, setTimeout: later, clearTimeout: id => { clk.timers = clk.timers.filter(t => t.id !== id); },
    performance: { now: () => clk.ms }, fetch: url => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(Uint8Array.from(Buffer.from("ID3" + url.split("/").pop())).buffer) }),
    SCRAP_SOUND: { voiceBus: () => ({ ctx: actx, out: {} }), talk() {} } };
  c2.globalThis = c2; vm.createContext(c2);
  vm.runInContext(block("Scrapline: robot sim core") + ";globalThis.SCRAP_SIM=SCRAP_SIM;", c2);
  vm.runInContext(block("const VOICE_LINES=") + ";globalThis.VOICE_LINES=VOICE_LINES;", c2);
  vm.runInContext(block("Scrapline: the voices (SCRAP_VOICE)") + ";globalThis.SCRAP_VOICE=SCRAP_VOICE;", c2);
  const S2 = c2.SCRAP_SIM, W = c2.SCRAP_VOICE; W.set({ sound: true, voice: true, comm: true, captions: "muted" }); W.load();
  for (let k = 0; k < 4000 && W.loaded < W.total; k++) await new Promise(r => setImmediate(r));
  if (W.loaded !== W.total) { fail(`fake clock: ${W.loaded} of ${W.total} clips loaded`); return; }
  const wind = secs => { const to = clk.ms + secs * 1000; while (clk.ms < to) run(Math.min(to, clk.ms + 10)); };
  /* no two clips at once; in a sequence, a little air between them */
  const clean = (what, air) => { const h = heard.slice().sort((x, y) => x.t0 - y.t0); let worst = 0;
    for (let i = 1; i < h.length; i++) { const over = h[i - 1].t1 - h[i].t0; worst = Math.max(worst, over);
      if (over > 1e-6) fail(`${what}: ${h[i].id} starts ${over.toFixed(2)} s before ${h[i - 1].id} ends`);
      else if (air && -over < air - 0.02) fail(`${what}: only ${(-over).toFixed(2)} s between ${h[i - 1].id} and ${h[i].id}`); }
    return h; };
  const fresh = lat => { W.stop(); heard.length = 0; live.clear(); clk.lat = lat; };
  const mk = (n, c) => { const a = tb[n % tb.length], b = tb[(n * 5 + 3) % tb.length];
    return { seed: 1000 + n * 7919, arena: S2.CLASSES[c].arenaId, bots: [{ cfg: Object.assign({}, a.cfg, { cls: c }), name: "You", driver: { style: "auto", skill: 0.7 } },
      { cfg: Object.assign({}, b.cfg, { cls: c }), name: "Kiesel", driver: { style: "auto", skill: 0.7 } }] }; };
  const opt = q => ({ opt: q });

  /* 1. the intro: every venue's first bout of the day, as app/fight.js builds it. It never holds the fight past
        INTRO_MAX unless the calls that always play (venue, event, names, countdown) are longer than that by themselves. */
  let longest = 0, longWhat = "", was = 0;
  const days = [["club", "Haldis Spring Cup", "beetle", "club", null, null], ["stahl", "Stahlbrück Feather Open", "feather", "tournament", "quarter-final", "ottilie"],
    ["eisenau", "Eisenau Hobby Cup", "hobby", "tournament", "semi-final", null], ["grauwald", "Grauwald Hobby Cup", "hobby", "tournament", "final", "rudi"],
    ["eisenhalle", "Scrapline Open", "heavy", "champ", "quarter-final", "mira"], ["eisenhalle", "Scrapline Open Final", "heavy", "champ", "final", "anselm"]];
  for (let n = 0; n < days.length * 4; n++) { const [venue, event, klass, kind, round, rival] = days[n % days.length], F = S2.newFight(mk(n, "beetle"));
    const cues = [opt("intro"), opt("career:season")]; if (n === 4) cues.push("career:act2"); if (n % 6 === 5) cues.push(opt("career:defend"));
    cues.push("venue:" + venue, "event:" + event, opt(venue === "eisenhalle" ? "c:tv" : "c:intro"), opt("class:" + klass), opt("kind:" + kind));
    if (round) cues.push(opt("round:" + round)); cues.push("name:you", rival ? { opt: "rival:" + rival, alt: "name:rv:" + rival } : "name:Kiesel", "countdown");
    const len = ids => ids.reduce((a, id) => a + L[id].d + W.GAP, 0), isOpt = new Set(cues.filter(q => q.opt).map(q => q.opt));
    W.begin(F, { kind: "duel" }); was = Math.max(was, len(W.introIds(cues.map(q => q.opt || q))));   // every call, as it was before the cap
    fresh(40); W.begin(F, { kind: "duel" }); let done = -1; const t0 = clk.ms;
    if (!W.intro(cues, () => { done = (clk.ms - t0) / 1000; })) { fail("intro: nothing to play for " + venue); continue; }
    wind(90); const h = clean("intro at " + venue, W.GAP), must = len(h.filter(x => !isOpt.has(L[x.id].q)).map(x => x.id)), extra = h.some(x => isOpt.has(L[x.id].q));
    if (done < 0) fail("intro at " + venue + " never finished");
    if (done > (extra ? W.INTRO_MAX : Math.max(W.INTRO_MAX, must)) + 0.3) fail(`intro at ${venue}: holds the fight ${done.toFixed(1)} s (the cap is ${W.INTRO_MAX} s, the calls that always play are ${must.toFixed(1)} s)`);
    if (n !== 4 && done > W.INTRO_MAX + 0.3) fail(`intro at ${venue}: ${done.toFixed(1)} s without a once-a-career call`);
    if (!h.some(x => /^name:(rv:|Kiesel)/.test(L[x.id].q) || /^rival:/.test(L[x.id].q))) fail("intro at " + venue + " never names the opponent");
    if (h.length && L[h[h.length - 1].id].q !== "countdown") fail("intro at " + venue + " does not end on the countdown");
    if (h.length && Math.abs(done - (h[h.length - 1].t1 - t0 / 1000) - W.GAP) > 0.1) fail(`intro at ${venue}: the bell comes ${(done - (h[h.length - 1].t1 - t0 / 1000)).toFixed(2)} s after the countdown`);
    if (done > longest) { longest = done; longWhat = venue + ", " + event; } }
  /* a later round: the pit closing, the decider, the countdown, all kept */
  { fresh(40); const F = S2.newFight(mk(1, "beetle")); W.begin(F, {}); let done = -1; W.intro(["pitclose", "bo3:decider", "countdown"], () => { done = clk.ms; }); wind(30);
    if (clean("round 3 intro", W.GAP).length !== 3) fail("round 3 intro lost a call"); }

  /* 2. live fights with a slow phone's decodes (350 ms): the calls, then the bell's calls and the post-mortem line */
  let barks = 0, pmKept = 0, pmCut = 0, endMax = 0;
  for (let n = 0; n < 6; n++) { fresh(350); const F = S2.newFight(mk(n, cls[n % 3])); W.begin(F, { speed: 1, kind: "duel" });
    while (!F.over) { S2.stepFight(F, null); run(clk.ms + 1000 / 60); if (!F.over) W.tick(F, 1); }
    barks += clean(`live fight ${n}`).length; heard.length = 0;
    const t0 = clk.ms / 1000; W.end(F, { kind: "duel", bout: null }); const nEnd = W.endCues(F, { kind: "duel", bout: null }).length;
    W.seq([["pm:gen"]], { queue: true, soon: true }); wind(60);
    const h = clean(`bell of fight ${n}`, W.GAP), pm = h.filter(x => /^pm:/.test(L[x.id].q));
    if (pm.length) { pmKept++; if (pm[0].t0 - t0 > W.PM_WAIT + 1) fail(`fight ${n}: the post-mortem line starts ${(pm[0].t0 - t0).toFixed(1)} s after the bell`); } else if (nEnd) pmCut++;
    if (h.length) endMax = Math.max(endMax, h[h.length - 1].t1 - t0); }

  /* 3. replays: the opening line, then the director; the speed changes mid-fight (1x, 2x, 4x and back) */
  for (let n = 0; n < 6; n++) { fresh(n % 2 ? 350 : 40); const log = S2.runFight(mk(n, cls[n % 3])).log, play = {};
    for (const k in log.inputs || {}) play[k] = S2.unpackInputs(log.inputs[k]);
    const F = S2.newFight({ seed: log.seed, arena: log.arena, rules: log.rules, bots: log.bots, play });
    W.end(F, {}); W.seq(["end:ko", "win", "c:win"]); wind(1.2);   // the results card is still talking when Replay is pressed
    W.begin(F, { speed: 1, replay: true, kind: "duel" }); W.seq(["pm:replay"]);
    while (!F.over && F.n < log.steps) { const sp = [1, 2, 4, 1][Math.floor(F.t / 7) % 4];
      for (let k = 0; k < sp && !F.over; k++) S2.stepFight(F, null); run(clk.ms + 1000 / 60); if (!F.over) W.tick(F, sp); }
    const h = clean(`replay ${n}`); if (!h.some(x => L[x.id].q === "pm:replay")) fail(`replay ${n}: no opening line`); }

  /* 4. a stop (pause, skip, leaving the tab) silences a clip still being decoded */
  { fresh(500); W.seq(["pitwin", "c:pitwin"]); wind(0.1); W.stop(); heard.length = 0; wind(10); if (heard.length) fail("a clip played after a stop: " + heard[0].id); }
  /* 5. the pit window: its two calls, then the ten-second call queued behind anything still playing */
  { fresh(200); W.seq(["pitwin", "c:pitwin"]); wind(3); W.say("pit10"); wind(20); if (clean("pit window", W.GAP).length !== 3) fail("the pit window lost a call"); }

  console.log(`timing: the longest intro holds ${longest.toFixed(1)} s (${longWhat}; ${was.toFixed(1)} s with every call), cap ${W.INTRO_MAX} s`);
  console.log(`timing: ${barks} live calls with 350 ms decodes, none overlapping; the bell's calls end within ${endMax.toFixed(1)} s; post-mortem line kept ${pmKept}, left out ${pmCut}`);
}

timing().then(() => {
  console.log(`voice: ${Object.keys(L).length} lines, ${fights} fights replayed 6 times each, ${lines} calls in the 1x replays`);
  if (fails) { console.log(fails + " failure(s)"); process.exit(1); }
  console.log("ok");
});
