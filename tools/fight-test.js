#!/usr/bin/env node
/* Scrapline: the fight harness (plan sections 7f and 8e). Run from the repo root after `node build.js`:
     node tools/fight-test.js            beetle: every test build and beetle opponent against every other, 12 seeds each at
                                         two driver skills (0.5 and 0.85); test builds drive their own "auto" style
     node tools/fight-test.js all        every class (a few minutes)
     node tools/fight-test.js hobby -q   one class, 4 seeds (quick: the balance target is printed, not enforced)
     node tools/fight-test.js -m         also print the matchup matrix (row's win % against column)
     node tools/fight-test.js -a box     fight in another arena (any ARENAS id) instead of each class's own
   It cuts SCRAP_SIM out of the built index.html (so it tests what ships) and prints, per archetype: win % against the other
   test builds (what the target is about) and against the whole field, draw %, the
   average share of hp it lost, the average fight length and the share of its fights that ended in a knockout. It exits 1
   if a fight is not repeatable, a replay from the log differs, a log is over 20 KB, a result holds NaN or a fight runs past
   the bell, a step is over budget (2 ms for a 1v1, 4 ms for a 4-bot rumble, plan section 16), carried-in damage (or a bent
   disc) is lost,
   or the plan's phone-test moments never happen (a wedge getting under a high-fronted box, a flipper landing a bot
   upside down, plan 8e: a hazard-pusher winning by the pit, the judges' scores on every decision), or a test build is
   more than 5 points outside the balance target (35-65% against the other test builds in its class, in the class's own
   arena; Sloppy budget is left out, plan section 1; one within 5 points is listed, since a few points is sampling noise).
   Named opponents (OPPONENTS, marked *) fight with their own drivers and are printed, not held to the target.
   The single-hit knockout rate (a knockout where one hit broke everything that mattered) is printed against the plan's
   lethality target. -a <arena> fights a class in another arena (the target isn't checked then). */
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const args = process.argv.slice(2), quick = args.includes("-q"), matrix = args.includes("-m");
const named = args.filter((a, i) => !a.startsWith("-") && args[i - 1] !== "-a");
let fails = 0;
const fail = (m) => { fails++; console.log("FAIL " + m); };

const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8"), at = html.indexOf("Scrapline: robot sim core");
if (at < 0) { console.log("FAIL no sim block in index.html (run node build.js)"); process.exit(1); }
const code = html.slice(html.lastIndexOf("<script>", at) + 8, html.indexOf("</script>", at));
const mod = { exports: {} };
new Function("module", "exports", code)(mod, mod.exports);
const SIM = mod.exports;

const classes = named.includes("all") ? SIM.CLASS_IDS : named.filter((c) => SIM.CLASSES[c]);
if (!classes.length) classes.push("beetle");
const ai = args.indexOf("-a"), arenaArg = ai >= 0 ? args[ai + 1] : null;
const SEEDS = quick ? 4 : 12, SKILLS = [0.5, 0.85];   // every test build drives its own "auto" style, at two skills
const builds = SIM.TEST_BUILDS;
const OUTSIDE = { sloppy: 1 };
const SLACK = 0.05;   // the target is 35-65%; a build within 5 points of it is printed, further out fails   // left out of the archetype target (plan section 1): the "how not to build" example
const cfgOf = (t, cls) => Object.assign({}, t.cfg, { cls });
const pct = (v) => (v * 100).toFixed(0).padStart(3) + "%";
const nowUs = () => Number(process.hrtime.bigint()) / 1000;
const arenaFor = (cls) => arenaArg || SIM.CLASSES[cls].arenaId;
/* the field in a class: every test build (driven by the style under test) and the class's opponents (their own drivers) */
const fieldOf = (cls) => builds.map((t) => ({ id: t.id, name: t.name, cfg: cfgOf(t, cls), arch: true }))
  .concat(SIM.OPPONENTS.filter((o) => o.cls === cls).map((o) => ({ id: o.id, name: o.name + " *", cfg: SIM.opponentCfg(o), driver: o.driver })));

function fight(cls, a, b, seed, style, extra, skill) {
  const drv = (x) => x.driver ? Object.assign({}, x.driver) : { style, skill: skill == null ? 0.7 : skill };
  return SIM.runFight(Object.assign({ seed, arena: arenaFor(cls), bots: [
    { cfg: cfgOf(a, cls), name: a.id, driver: drv(a) }, { cfg: cfgOf(b, cls), name: b.id, driver: drv(b) }] }, extra || {}));
}
/* the judges' scores: finite, each column adds up to its weight and the totals to 100 */
function judgeOk(r) {
  const sc = r.judge && r.judge.scores; if (!sc) return false; const ks = Object.keys(sc), W = SIM.JUDGE_WEIGHTS, near = (a, b) => Math.abs(a - b) < 1e-6;
  for (const k of ks) for (const t of ["damage", "aggression", "control", "total"]) if (!isFinite(sc[k][t])) return false;
  for (const t of ["damage", "aggression", "control"]) if (!near(ks.reduce((a, k) => a + sc[k][t], 0), 100 * W[t])) return false;
  return near(ks.reduce((a, k) => a + sc[k].total, 0), 100);
}
function finite(r) {
  if (!(r.timeS <= SIM.FIGHT.roundS + 1e-6) || !r.over) return false;
  for (const o of r.bots) { if (!isFinite(o.share)) return false; for (const k in o.damage) if (!isFinite(o.damage[k])) return false; for (const k in o.stats) if (!isFinite(o.stats[k])) return false; }
  return true;
}

let allSteps = 0, allUs = 0, worstFightUs = 0, pitByPusher = 0, judgedOk = 0, judged = 0;
for (const cls of classes) {
  const field = fieldOf(cls), st = {}, mx = {};
  for (const t of field) { st[t.id] = { n: 0, w: 0, d: 0, share: 0, len: 0, ko: 0, an: 0, aw: 0 }; mx[t.id] = {}; for (const u of field) mx[t.id][u.id] = { n: 0, w: 0 }; }
  let fights = 0, kos = 0, oneHit = 0, pits = 0, decisions = 0, lenSum = 0, under = 0, flippedInv = 0, bigLog = 0;
  const t0 = nowUs();
  for (let i = 0; i < field.length; i++) for (let j = i + 1; j < field.length; j++) {
    for (const sk of SKILLS) for (let s = 1; s <= SEEDS; s++) {
      const swap = s % 2 === 0, A = swap ? field[j] : field[i], B = swap ? field[i] : field[j], style = "auto";
      const f0 = nowUs(), r = fight(cls, A, B, s * 7919 + i * 31 + j, style, null, sk), us = nowUs() - f0;
      allSteps += r.log.steps; allUs += us; if (r.log.steps >= 600 && us / r.log.steps > worstFightUs) worstFightUs = us / r.log.steps;   // a short fight is mostly warm-up
      fights++; lenSum += r.timeS;
      if (r.reason === "ko" || r.reason === "pit") kos++;
      if (r.reason === "pit") pits++;
      if (r.reason === "judges" || r.reason === "draw" && r.timeS >= SIM.FIGHT.roundS - 1e-6) { decisions++; judged++; const e = r.log.entries[r.log.entries.length - 1]; if (e && e.k === "end" && e.j && judgeOk(r)) judgedOk++; }
      if (r.reason === "ko") { const lo = r.bots.find((o) => o.out === "ko"); if (lo && lo.stats.failHits === 1) oneHit++; }
      if (r.reason === "pit" && r.winner != null && r.bots[r.winner].style === "hazard") pitByPusher++;
      if (!finite(r)) fail(`${cls} ${A.id} v ${B.id} seed ${s} skill ${sk}: NaN or ran past the bell`);
      const sz = JSON.stringify(r.log).length; if (sz > bigLog) bigLog = sz;
      if (sz > SIM.FIGHT.logMaxB) fail(`${cls} ${A.id} v ${B.id}: log ${sz} B is over ${SIM.FIGHT.logMaxB}`);
      for (const e of r.log.entries) {
        if (e.k === "under" && r.bots[e.a].name === "wedge" && r.bots[e.v].name === "brick") under++;
        if (e.k === "inv" && e.inv === 1 && r.log.entries.some((q) => q.k === "flip" && q.v === e.v && q.inv === 1 && q.t <= e.t)) flippedInv++;
      }
      [A, B].forEach((t, k) => {
        const o = r.bots[k], x = st[t.id], y = k ? A : B;
        x.n++; x.share += o.share; x.len += r.timeS; if (r.reason === "ko" || r.reason === "pit") x.ko++;
        const w = r.winner === k ? 1 : r.winner == null ? 0.5 : 0;
        if (r.winner === k) { x.w++; mx[t.id][y.id].w++; } else if (r.winner == null) { x.d++; mx[t.id][y.id].w += 0.5; }
        if (y.arch) { x.an++; x.aw += w; }   // the target is a test build's record against the other test builds
        mx[t.id][y.id].n++;
      });
    }
  }
  const secs = (nowUs() - t0) / 1e6, heavyish = cls === "feather" || cls === "heavy";
    const an = SIM.ARENAS[arenaFor(cls)].name;
  console.log(`\n${SIM.CLASSES[cls].name} in ${/^The /.test(an) ? an : "the " + an}: ${fights} fights in ${secs.toFixed(1)} s · ${pct(kos / fights)} knockouts (${pct(pits / fights)} pit) · ${pct(decisions / fights)} decisions · single-hit KOs ${(100 * oneHit / fights).toFixed(1)}% (target ${heavyish ? "3-8%" : "under 3%"}) · average ${(lenSum / fights).toFixed(1)} s · biggest log ${(bigLog / 1024).toFixed(1)} KB`);
  console.log("  archetype          vs builds  all  draw  hp lost  length  KO");
  const off = [], near = [];
  for (const t of field) {
    const x = st[t.id], all = (x.w + x.d / 2) / x.n, win = x.an ? x.aw / x.an : all, out = win > 0.65 ? "  above 65%" : win < 0.35 ? "  below 35%" : "";
    if (out && t.arch && !OUTSIDE[t.id]) (win > 0.65 + SLACK || win < 0.35 - SLACK ? off : near).push(`${t.name} ${pct(win).trim()}`);
    console.log(`  ${t.name.padEnd(19)} ${pct(win)}  ${pct(all)}  ${pct(x.d / x.n)}  ${pct(x.share / x.n)}   ${(x.len / x.n).toFixed(1).padStart(5)} s ${pct(x.ko / x.n)}${t.arch ? (OUTSIDE[t.id] ? "  (outside the target)" : out) : ""}`);
  }
  console.log("  (* a named opponent, driving its own style; the 35-65% target is for the test builds)");
  if (near.length) console.log(`  outside 35-65% by less than ${Math.round(SLACK * 100)} points (sampling noise at this many seeds is about 3-4): ${near.join(", ")}`);
  if (off.length && !arenaArg && !quick) fail(`${cls}: archetypes more than ${Math.round(SLACK * 100)} points outside 35-65%: ${off.join(", ")}`);
  if (matrix) {
    console.log("  matchups (row's win % against column; a draw counts half):");
    console.log("              " + field.map((t) => t.id.slice(0, 5).padStart(6)).join(""));
    for (const t of field) console.log("  " + t.id.slice(0, 11).padEnd(11) + " " + field.map((u) => t === u ? "     ·" : String(Math.round(100 * mx[t.id][u.id].w / Math.max(mx[t.id][u.id].n, 1))).padStart(6)).join(""));
  }
  if (cls === "beetle" || classes.length === 1) {
    if (!under) fail(`${cls}: the wedge never got under the brick (plan 7f phone test)`);
    if (!flippedInv) fail(`${cls}: no flipper ever landed a bot upside down (plan 7f phone test)`);
  }
}
if (!arenaArg && classes.some((c) => SIM.ARENAS[SIM.CLASSES[c].arenaId].pit) && !pitByPusher) fail("a hazard-pusher never won by the pit (plan 8e phone test)");
if (judged && judgedOk < judged) fail(`${judged - judgedOk} decisions have no judges' scores in the log`);

/* ---- the checks that don't depend on the class ---- */
const cls = classes[0], T = (id) => builds.find((t) => t.id === id);
/* repeatable */
for (const [a, b, s, style] of [["vsp", "wedge", 3, "rush"], ["flipper", "invert", 5, "keepaway"], ["hammer", "lifter", 9, "rush"], ["hsp", "drum", 2, "keepaway"]]) {
  const r1 = JSON.stringify(fight(cls, T(a), T(b), s, style)), r2 = JSON.stringify(fight(cls, T(a), T(b), s, style));
  if (r1 !== r2) fail(`${a} v ${b} seed ${s}: the same fight came out differently`);
}
/* a player with a jittery thumb: the log stays under the cap and the replay matches exactly */
{
  /* a busy thumb: the stick never rests (full sweeps at 1.5 and 1.1 Hz with a tremor on top), the weapon toggles every half
     second, self-right pressed now and then */
  const jitter = (F) => { const t = F.n / 60; return { 0: { throttle: 0.9 * Math.sin(2 * Math.PI * 1.5 * t) + 0.05 * Math.sin(F.n * 3.1), steer: 0.85 * Math.cos(2 * Math.PI * 1.1 * t) + 0.05 * Math.sin(F.n * 2.3), weapon: (F.n >> 5) & 1, selfRight: (F.n % 300) < 20 ? 1 : 0 } }; };
  const opts = { seed: 42, bots: [{ cfg: cfgOf(T("vsp"), cls), name: "you", driver: null }, { cfg: cfgOf(T("flipper"), cls), name: "ai", driver: { style: "rush", skill: 0.9 } }], inputs: jitter };
  const r = SIM.runFight(opts), sz = JSON.stringify(r.log).length;
  if (sz > SIM.FIGHT.logMaxB) fail(`player fight: log ${sz} B is over the cap`);
  const rp = SIM.replayFight(JSON.parse(JSON.stringify(r.log)));
  const strip = (x) => JSON.stringify(Object.assign({}, x, { log: Object.assign({}, x.log, { inputs: null }) }));
  if (strip(rp) !== strip(r)) fail("replaying the player fight from its log came out differently");
  if (!r.log.inputs[0]) fail("the player's inputs are missing from the log");
  console.log(`\nplayer fight: ${r.log.steps} steps, log ${(sz / 1024).toFixed(1)} KB (inputs ${(r.log.inputs[0].d.length / 1024).toFixed(1)} KB)${strip(rp) === strip(r) ? ", replay matches" : ""}`);
}
/* a replay's log replays too */
{
  const r = SIM.runFight({ seed: 11, bots: [{ cfg: cfgOf(T("wedge"), cls), driver: null }, { cfg: cfgOf(T("hsp"), cls), driver: { style: "rush", skill: 0.7 } }],
    inputs: (F) => ({ 0: { throttle: Math.sin(F.n / 40), steer: Math.cos(F.n / 55), weapon: 0 } }) });
  const r1 = SIM.replayFight(r.log), r2 = r1 && SIM.replayFight(JSON.parse(JSON.stringify(r1.log)));
  if (!r2 || JSON.stringify(r2.bots) !== JSON.stringify(r.bots) || r2.winner !== r.winner) fail("replaying a replay's log came out differently");
}
/* a lifter lets go whichever bot it holds (bot 0 included), within the hold limit */
{
  let longest = 0, lifts = 0;
  for (let s = 1; s <= 6; s++) for (const order of [["wedge", "lifter"], ["lifter", "wedge"], ["brick", "lifter"]]) {
    const F = SIM.newFight({ seed: s, bots: order.map((id) => ({ cfg: cfgOf(T(id), cls), name: id, driver: { style: "rush", skill: 0.7 } })) }), held = [0, 0];
    while (!F.over) { SIM.stepFight(F); F.bots.forEach((o, k) => { if (o.held != null) { if (!held[k]) lifts++; held[k] += F.dt; longest = Math.max(longest, held[k]); } else held[k] = 0; }); }
  }
  if (!lifts) fail("the lifter never lifted the wedge or the brick");
  if (longest > SIM.FIGHT.holdMaxS + 0.05) fail(`a lifter held a bot for ${longest.toFixed(1)} s, past the ${SIM.FIGHT.holdMaxS} s limit`);
}
/* PR 4b review: the pin limit breaks a pin made with the front or the rear; player fights replay in every arena;
   no start sits on a floor spinner; a front-to-front tie never puts a bot under a disc at speed */
{
  for (const rev of [false, true]) {
    const F = SIM.newFight({ seed: 1, arena: "box", bots: [{ cfg: cfgOf(T("brick"), cls), driver: null }, { cfg: cfgOf(T("wedge"), cls), driver: null }] }), [A, B] = F.bots, H = F.arena.half;
    B.x = H - 0.12 * B.M.len; B.y = 0; B.h = 0; A.x = B.x - 0.3 * A.M.len; A.y = 0; A.h = rev ? Math.PI : 0;
    /* every release has to break contact before its back-off ends (a bot that then drives itself back onto the wedge is its own business) */
    let rel = null, broke = 0, rels = 0;
    for (let n = 0; n < 60 * 40 && !F.over; n++) { const L = F.log.length; SIM.stepFight(F, { 0: { throttle: rev ? -1 : 1 }, 1: {} });
      for (let k = L; k < F.log.length; k++) if (F.log[k].k === "release" && F.log[k].a === 0) { if (rel != null) break; rel = F.t; rels++; }
      if (rel != null && !(A.touch[1] != null && F.t - A.touch[1] < 0.05)) { broke++; rel = null; }
      else if (rel != null && F.t - rel > SIM.FIGHT.releaseS + 0.3) { fail(`${cls}: a ${rev ? "rear" : "front"} pin didn't break when the pinner backed off at ${rel.toFixed(1)} s`); rel = null; } }
    if (!rels) fail(`${cls}: a ${rev ? "rear" : "front"} pin against the wall never hit the pin limit`);
  }
  let bad = 0, n = 0;
  for (const arena of SIM.ARENA_IDS) for (let s = 1; s <= 3; s++) {
    const ids = SIM.TEST_BUILDS.map((t) => t.id), a = ids[s % ids.length], b = ids[(s * 5 + 3) % ids.length];
    const r = SIM.runFight({ seed: s * 1013 + 7, arena, bots: [{ cfg: cfgOf(T(a), cls), driver: null }, { cfg: cfgOf(T(b), cls), driver: { style: "auto", skill: 0.7 } }],
      inputs: (F) => ({ 0: { throttle: Math.sin(F.n / 37 + s), steer: Math.cos(F.n / 53), weapon: (F.n >> 6) & 1, selfRight: (F.n % 200) < 10 ? 1 : 0 } }) });
    const rp = SIM.replayFight(JSON.parse(JSON.stringify(r.log))), strip = (x) => JSON.stringify(Object.assign({}, x, { log: Object.assign({}, x.log, { inputs: null }) }));
    n++; if (!rp || strip(rp) !== strip(r)) { bad++; fail(`a player fight in ${arena} (seed ${s}) replayed differently`); }
  }
  let onSpin = 0;
  for (const arena of SIM.ARENA_IDS) for (let s = 1; s <= 16; s++) for (const nb of [2, 3, 4]) {
    const F = SIM.newFight({ seed: s, arena, bots: Array.from({ length: nb }, () => ({ cfg: cfgOf(T("wedge"), cls), driver: { style: "rush", skill: 0.5 } })) });
    for (const h of F.arena.haz) if (h.type === "spinner") for (const o of F.bots) if (Math.hypot(o.x - h.at[0], o.y - h.at[1]) < h.rM + o.rad) onSpin++;
  }
  if (onSpin) fail(`${onSpin} starts sit on a floor spinner`);
  for (const [x, y] of [["hammer", "drum"], ["drum", "hammer"]]) {
    const F = SIM.newFight({ seed: 2, arena: "box", bots: [{ cfg: cfgOf(T(x), cls), driver: null }, { cfg: cfgOf(T(y), cls), driver: null }] }), [A, B] = F.bots;
    A.x = -0.2 * A.M.len; A.y = 0; A.h = 0; B.x = 0.2 * B.M.len; B.y = 0; B.h = Math.PI; const D = x === "drum" ? A : B;
    for (let k = 0; k < 60 && !F.over; k++) { D.wp.om = D.b.weapon.omega; D.fx.weaponOk = false; SIM.stepFight(F, { 0: { throttle: 0.6 }, 1: { throttle: 0.6 } }); }
    if (F.log.some((e) => e.k === "under" && F.bots[e.v] === D)) fail(`a ${x === "drum" ? y : x} got under a drum spinning at full speed`);
  }
  console.log(`review checks: pins break front and rear, ${n - bad}/${n} arena replays match, starts clear of floor spinners, tie-break respects the disc guard`);
}
/* the worst stick there is (flat out, flipping every tick, 4 bots): the log still fits, giving up the replay if it must */
{
  const flick = (F) => { const o = {}; for (let i = 0; i < 4; i++) o[i] = { throttle: (F.n >> 1) & 1 ? 1 : -1, steer: (F.n >> 2) & 1 ? 1 : -1, weapon: (F.n >> 1) & 1, selfRight: (F.n >> 3) & 1 }; return o; };
  const r = SIM.runFight({ seed: 5, bots: ["vsp", "hsp", "wedge", "flipper"].map((id) => ({ cfg: cfgOf(T(id), cls), name: id, driver: null })), inputs: flick });
  const sz = JSON.stringify(r.log).length;
  if (sz > SIM.FIGHT.logMaxB) fail(`worst-case stick: log ${sz} B is over the cap`);
  if (!r.log.noReplay) { const rp = SIM.replayFight(JSON.parse(JSON.stringify(r.log))); if (!rp || JSON.stringify(rp.bots) !== JSON.stringify(r.bots)) fail("worst-case stick: the replay differs"); }
  else if (SIM.replayFight(r.log) !== null) fail("a log without its inputs should refuse to replay");
  console.log(`worst-case stick: log ${(sz / 1024).toFixed(1)} KB${r.log.noReplay ? " (replay given up)" : ", replay matches"}`);
}
/* damage carried in from an earlier fight is there at the start */
{
  const b = SIM.evalBuild(cfgOf(T("vsp"), cls)), dmg = { armour_front: 5, drive0: 1e9, battery: 3 };
  const F = SIM.newFight({ seed: 1, bots: [{ cfg: b.cfg, damage: dmg, driver: { style: "rush", skill: 0.5 } }, { cfg: cfgOf(T("wedge"), cls), driver: { style: "rush", skill: 0.5 } }] });
  const s = F.bots[0].st;
  if (Math.abs(s.armour.front - (b.armourMapJ.front.hpJ - 5)) > 1e-9 || s.parts.drive0 !== 0 || Math.abs(s.parts.battery - (b.parts.find((p) => p.key === "battery").hpJ - 3)) > 1e-9) fail("carried-in damage didn't make it into the fight");
  const r = SIM.fightResult(F); if (r.bots[0].states.drive0 !== "destroyed" || r.bots[0].states.battery !== "damaged" || r.bots[0].states.armour_back !== "intact") fail("part states don't read the carried-in damage");
}
/* a best of three's next round: a bent disc carries in (flags), and the round replays from its log with it */
{
  const bots = [{ cfg: cfgOf(T("vsp"), cls), damage: { weapon: 2 }, flags: { bent: true }, driver: { style: "rush", skill: 0.6 } }, { cfg: cfgOf(T("hsp"), cls), driver: { style: "rush", skill: 0.6 } }];
  const F = SIM.newFight({ seed: 11, bots });
  if (!F.bots[0].flags.bent || F.bots[1].flags.bent) fail("a carried-in bent disc isn't bent at the start (or the other bot's is)");
  const r = SIM.runFight({ seed: 11, bots }), q = SIM.replayFight(r.log);
  if (!r.log.bots[0].flags || !r.log.bots[0].flags.bent) fail("the log doesn't keep the carried-in bent disc");
  if (!q || q.winner !== r.winner || q.timeS !== r.timeS || JSON.stringify(q.bots[0].damage) !== JSON.stringify(r.bots[0].damage)) fail("a round with a carried-in bent disc doesn't replay the same");
}
/* a battery the failsafe kept going in round 1 keeps going in round 2 (the cell carries), and a dead controller side stays dead */
{
  const b = SIM.evalBuild(cfgOf(T("vsp"), cls)), bat = b.parts.find((p) => p.key === "battery").hpJ;
  const mk = (flags) => SIM.newFight({ seed: 12, bots: [{ cfg: b.cfg, damage: { battery: bat }, flags, driver: { style: "rush", skill: 0.6 } }, { cfg: cfgOf(T("hsp"), cls), driver: { style: "rush", skill: 0.6 } }] }).bots[0];
  if (mk(null).fx.dead !== "battery") fail("a destroyed battery with no failsafe cell should start dead");
  const o = mk({ cell: true, esc: "left" });
  if (o.fx.dead || !o.flags.cell || o.flags.esc !== "left" || !o.fx.sides.left.out) fail("carried-in failsafe cell or dead controller side lost at the start of a round");
}
/* a 4-bot rumble: runs, ends, within its step budget */
{
  const f0 = nowUs(); const r = SIM.runFight({ seed: 7, bots: ["vsp", "hsp", "wedge", "flipper"].map((id) => ({ cfg: cfgOf(T(id), cls), name: id, driver: { style: "rush", skill: 0.7 } })) });
  const us = (nowUs() - f0) / Math.max(r.log.steps, 1);
  if (!finite(r)) fail("the rumble ran past the bell or holds NaN");
  if (us > 4000) fail(`rumble step ${us.toFixed(0)} µs is over 4 ms`);
  console.log(`rumble: ${r.reason}, winner ${r.winner == null ? "none" : r.bots[r.winner].name}, ${r.timeS} s, ${us.toFixed(1)} µs a step`);
}
const mean = allUs / Math.max(allSteps, 1);
console.log(`steps: ${allSteps.toLocaleString("en-GB")} at ${mean.toFixed(1)} µs each on average, ${worstFightUs.toFixed(1)} µs in the slowest fight (budget 2000 µs)`);
if (mean > 2000 || worstFightUs > 2000) fail("a 1v1 step is over the 2 ms budget");
console.log(fails ? `\nfight-test: ${fails} check(s) failed` : "\nfight-test: all checks pass");
process.exit(fails ? 1 : 0);
