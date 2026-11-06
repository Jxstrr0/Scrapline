#!/usr/bin/env node
/* Scrapline: the fight harness (plan sections 7f and 8e). Run from the repo root after `node build.js`:
     node tools/fight-test.js            beetle: every TEST_BUILDS build against every other, 20 seeds each, both AIs
     node tools/fight-test.js all        every class (a few minutes)
     node tools/fight-test.js hobby -q   one class, 4 seeds (quick)
     node tools/fight-test.js -m         also print the matchup matrix (row's win % against column)
   It cuts SCRAP_SIM out of the built index.html (so it tests what ships) and prints, per archetype: win %, draw %, the
   average share of hp it lost, the average fight length and the share of its fights that ended in a knockout. It exits 1
   if a fight is not repeatable, a replay from the log differs, a log is over 20 KB, a result holds NaN or a fight runs past
   the bell, a step is over budget (2 ms for a 1v1, 4 ms for a 4-bot rumble, plan section 16), carried-in damage is lost,
   or the plan's phone-test moments never happen (a wedge getting under a high-fronted box, a flipper landing a bot
   upside down). The balance targets (no archetype above 65% or below 35%) are printed, not enforced, until PR 4b. */
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const args = process.argv.slice(2), quick = args.includes("-q"), matrix = args.includes("-m");
const named = args.filter((a) => !a.startsWith("-"));
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
const SEEDS = quick ? 4 : 20, STYLES = ["rush", "keepaway"], SKILL = 0.7;
const builds = SIM.TEST_BUILDS;
const cfgOf = (t, cls) => Object.assign({}, t.cfg, { cls });
const pct = (v) => (v * 100).toFixed(0).padStart(3) + "%";
const nowUs = () => Number(process.hrtime.bigint()) / 1000;

function fight(cls, a, b, seed, style, extra) {
  return SIM.runFight(Object.assign({ seed, bots: [
    { cfg: cfgOf(a, cls), name: a.id, driver: { style, skill: SKILL } },
    { cfg: cfgOf(b, cls), name: b.id, driver: { style, skill: SKILL } }] }, extra || {}));
}
function finite(r) {
  if (!(r.timeS <= SIM.FIGHT.roundS + 1e-6) || !r.over) return false;
  for (const o of r.bots) { if (!isFinite(o.share)) return false; for (const k in o.damage) if (!isFinite(o.damage[k])) return false; for (const k in o.stats) if (!isFinite(o.stats[k])) return false; }
  return true;
}

let allSteps = 0, allUs = 0, worstFightUs = 0;
for (const cls of classes) {
  const st = {}; for (const t of builds) st[t.id] = { n: 0, w: 0, d: 0, share: 0, len: 0, ko: 0 };
  const mx = {}; for (const t of builds) { mx[t.id] = {}; for (const u of builds) mx[t.id][u.id] = { n: 0, w: 0 }; }
  let fights = 0, kos = 0, lenSum = 0, under = 0, flippedInv = 0, bigLog = 0;
  const t0 = nowUs();
  for (let i = 0; i < builds.length; i++) for (let j = i + 1; j < builds.length; j++) {
    for (const style of STYLES) for (let s = 1; s <= SEEDS; s++) {
      const swap = s % 2 === 0, A = swap ? builds[j] : builds[i], B = swap ? builds[i] : builds[j];
      const f0 = nowUs(), r = fight(cls, A, B, s * 7919 + i * 31 + j, style), us = nowUs() - f0;
      allSteps += r.log.steps; allUs += us; if (us / Math.max(r.log.steps, 1) > worstFightUs) worstFightUs = us / Math.max(r.log.steps, 1);
      fights++; lenSum += r.timeS; if (r.reason === "ko" || r.reason === "pit") kos++;
      if (!finite(r)) fail(`${cls} ${A.id} v ${B.id} seed ${s} ${style}: NaN or ran past the bell`);
      const sz = JSON.stringify(r.log).length; if (sz > bigLog) bigLog = sz;
      if (sz > SIM.FIGHT.logMaxB) fail(`${cls} ${A.id} v ${B.id}: log ${sz} B is over ${SIM.FIGHT.logMaxB}`);
      for (const e of r.log.entries) {
        if (e.k === "under" && r.bots[e.a].name === "wedge" && r.bots[e.v].name === "brick") under++;
        if (e.k === "inv" && e.inv === 1 && r.log.entries.some((q) => q.k === "flip" && q.v === e.v && q.inv === 1 && q.t <= e.t)) flippedInv++;
      }
      [A, B].forEach((t, k) => {
        const o = r.bots[k], x = st[t.id], y = k ? A : B;
        x.n++; x.share += o.share; x.len += r.timeS; if (r.reason === "ko" || r.reason === "pit") x.ko++;
        if (r.winner === k) { x.w++; mx[t.id][y.id].w++; } else if (r.winner == null) { x.d++; mx[t.id][y.id].w += 0.5; }
        mx[t.id][y.id].n++;
      });
    }
  }
  const secs = (nowUs() - t0) / 1e6;
  console.log(`\n${SIM.CLASSES[cls].name}: ${fights} fights in ${secs.toFixed(1)} s · ${pct(kos / fights)} knockouts · average ${(lenSum / fights).toFixed(1)} s · biggest log ${(bigLog / 1024).toFixed(1)} KB`);
  console.log("  archetype            win   draw  hp lost  length  KO");
  for (const t of builds) {
    const x = st[t.id], win = (x.w + x.d / 2) / x.n, flag = win > 0.65 ? "  above 65%" : win < 0.35 ? "  below 35%" : "";
    console.log(`  ${t.name.padEnd(19)} ${pct(win)}  ${pct(x.d / x.n)}  ${pct(x.share / x.n)}   ${(x.len / x.n).toFixed(1).padStart(5)} s ${pct(x.ko / x.n)}${flag}`);
  }
  if (matrix) {
    console.log("  matchups (row's win % against column; a draw counts half):");
    console.log("            " + builds.map((t) => t.id.slice(0, 5).padStart(6)).join(""));
    for (const t of builds) console.log("  " + t.id.padEnd(9) + " " + builds.map((u) => t === u ? "     ·" : String(Math.round(100 * mx[t.id][u.id].w / Math.max(mx[t.id][u.id].n, 1))).padStart(6)).join(""));
  }
  if (cls === "beetle" || classes.length === 1) {
    if (!under) fail(`${cls}: the wedge never got under the brick (plan 7f phone test)`);
    if (!flippedInv) fail(`${cls}: no flipper ever landed a bot upside down (plan 7f phone test)`);
  }
}

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
/* damage carried in from an earlier fight is there at the start */
{
  const b = SIM.evalBuild(cfgOf(T("vsp"), cls)), dmg = { armour_front: 5, drive0: 1e9, battery: 3 };
  const F = SIM.newFight({ seed: 1, bots: [{ cfg: b.cfg, damage: dmg, driver: { style: "rush", skill: 0.5 } }, { cfg: cfgOf(T("wedge"), cls), driver: { style: "rush", skill: 0.5 } }] });
  const s = F.bots[0].st;
  if (Math.abs(s.armour.front - (b.armourMapJ.front.hpJ - 5)) > 1e-9 || s.parts.drive0 !== 0 || Math.abs(s.parts.battery - (b.parts.find((p) => p.key === "battery").hpJ - 3)) > 1e-9) fail("carried-in damage didn't make it into the fight");
  const r = SIM.fightResult(F); if (r.bots[0].states.drive0 !== "destroyed" || r.bots[0].states.battery !== "damaged" || r.bots[0].states.armour_back !== "intact") fail("part states don't read the carried-in damage");
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
