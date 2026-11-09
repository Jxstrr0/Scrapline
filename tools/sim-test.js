#!/usr/bin/env node
/* Scrapline: the build-maths test (plan section 4e). Run from the repo root after `node build.js`:
     node tools/sim-test.js          the checks, plus a table of DEFAULT_CFG and every TEST_BUILDS build in every class
     node tools/sim-test.js -q       the checks only
     node tools/sim-test.js beetle   one class's table
   It cuts SCRAP_SIM out of the built index.html (so it tests what ships), runs evalBuild, and exits 1 if:
   src/sim/ calls Math.random, Date.now or performance.now (determinism, plan section 0); a part is missing a field; a test
   build is over the limit, can't be laid out, or (apart from "sloppy" and "glass") comes in more than 5% under; a result holds NaN;
   evalBuild isn't repeatable or changes its input; or an archetype has lost what makes it that archetype. */
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const args = process.argv.slice(2), quiet = args.includes("-q"), only = args.find(a => !a.startsWith("-"));
let fails = 0;
const fail = (m) => { fails++; console.log("FAIL " + m); };

/* ---- 1. banned calls in src/sim (comments stripped first, so the rule can be written down) ---- */
for (const f of fs.readdirSync(path.join(ROOT, "src/sim"))) {
  const src = fs.readFileSync(path.join(ROOT, "src/sim", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
  for (const bad of ["Math.random", "Date.now", "performance.now", "new Date"]) if (src.includes(bad)) fail(`src/sim/${f} uses ${bad}`);
}

/* ---- load the sim from the built page ---- */
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8"), at = html.indexOf("Scrapline: robot sim core");
if (at < 0) { console.log("FAIL no sim block in index.html (run node build.js)"); process.exit(1); }
const code = html.slice(html.lastIndexOf("<script>", at) + 8, html.indexOf("</script>", at));
const mod = { exports: {} };
new Function("module", "exports", code)(mod, mod.exports);
const SIM = mod.exports;

/* ---- 2. every part has its fields ---- */
const NEED = {
  chassis: ["massPerCell", "hp", "flex", "heightMm"], armour: ["thickMm", "density", "absorbPerG", "hpPerG", "deflect"],
  drive: ["pods", "massG", "speedMs", "forceN", "powerW", "heatW", "hp", "motorFrac"], wheels: ["massG", "grip", "radiusMm", "exposure", "hp"],
  battery: ["massG", "capacityWs", "dischargeW", "hp"], electronics: ["massG", "maxPowerW", "heatW", "coolingW", "idleW", "hp"],
  weapon: ["massG", "motorMassG", "powerW", "heatW", "hp"], weaponMaterial: ["massMult", "hp", "shearMult", "bite"], extras: ["massG", "hp"]
};
for (const slot in NEED) {
  if (!Array.isArray(SIM.PARTS[slot])) { fail("PARTS." + slot + " missing"); continue; }
  const ids = new Set();
  for (const p of SIM.PARTS[slot]) {
    if (ids.has(p.id)) fail(`PARTS.${slot} has ${p.id} twice`); ids.add(p.id);
    for (const k of ["id", "name", "unlock"]) if (typeof p[k] !== "string") fail(`PARTS.${slot}.${p.id} has no ${k}`);
    if (!/^(start|tool:[a-z]+|rnd:[a-z]+)$/.test(p.unlock || "")) fail(`PARTS.${slot}.${p.id} unlock "${p.unlock}"`);
    for (const k of ["cost", "hours"].concat(NEED[slot])) if (!Number.isFinite(p[k])) fail(`PARTS.${slot}.${p.id}.${k} is not a number`);
    if (p.type === "spinner" || p.type === "saw") for (const k of ["discMass", p.bodyR ? "bodyR" : "radius", "rpmMax", "shapeK", "bite", "recoil"]) if (!Number.isFinite(p[k])) fail(`PARTS.weapon.${p.id}.${k}`);
  }
}

/* ---- helpers ---- */
function walk(o, where) {   // NaN, undefined or a non-finite number anywhere (Infinity only where it means "never")
  if (typeof o === "number") { if (Number.isNaN(o)) fail(where + " is NaN"); return; }
  if (o === undefined) { fail(where + " is undefined"); return; }
  if (o && typeof o === "object") for (const k in o) walk(o[k], where + "." + k);
}
const n = (v, d) => v == null ? "never" : !Number.isFinite(v) ? "-" : v.toFixed(d || 0);
const sevs = (b, s) => b.stress.filter((x) => x.sev === s).length;

/* ---- 3. every build in every class ---- */
const builds = [{ id: "default", name: "DEFAULT_CFG", cfg: SIM.DEFAULT_CFG }].concat(SIM.TEST_BUILDS);
const head = "build      grams      %   m/s  turn  wpn J  spin  edge  clr inv  run s heat s weak   exp    Th   hrs  bad warn";
for (const cls of SIM.CLASS_IDS) {
  const rows = [];
  for (const t of builds) {
    const cfg = Object.assign({}, t.cfg, { cls }), before = JSON.stringify(cfg);
    const b = SIM.evalBuild(cfg), again = SIM.evalBuild(cfg);
    const tag = `${cls}/${t.id}`;
    if (JSON.stringify(cfg) !== before) fail(tag + ": evalBuild changed its input");
    if (JSON.stringify(b) !== JSON.stringify(again)) fail(tag + ": evalBuild is not repeatable");
    walk(b, tag);
    if (!b.valid) fail(tag + ": " + b.errors.join("; "));
    if (b.layout.unplaced.length) fail(tag + ": no room for " + b.layout.unplaced.join(", "));
    if (t.id === "sloppy" || t.id === "glass") { if (!b.stress.some((s) => s.id === "under")) fail(tag + ": should be flagged as under budget"); }
    else if (b.underBudgetPct > 5) fail(`${tag}: ${b.underBudgetPct.toFixed(1)}% under the limit`);
    /* archetypes keep their point */
    const g = SIM.WEDGE_GAUGES[cls];
    if (t.id === "wedge" && b.height.frontEdgeMm > g[0]) fail(`${tag}: wedge edge ${b.height.frontEdgeMm} mm is above the lowest gauge`);
    if (t.id === "flipper" && b.weapon.canLiftKg < b.limitKg) fail(`${tag}: flipper can't lift a class-limit bot`);
    if (["hsp", "vsp", "drum", "under"].includes(t.id) && b.weapon.spinUpS > 4) fail(`${tag}: spin-up ${b.weapon.spinUpS.toFixed(1)} s`);
    if (t.id === "invert" && !b.height.drivesInverted) fail(`${tag}: invertible box can't drive upside down`);
    if (t.id !== "glass" && t.id !== "sloppy" && b.runtimeS < 90) fail(`${tag}: runtime ${b.runtimeS.toFixed(0)} s`);
    rows.push(`${t.id.padEnd(9)} ${n(b.totalG).padStart(6)} ${(100 * b.totalG / b.limitG).toFixed(1).padStart(6)} ${n(b.driveSpeed, 1).padStart(5)} ${n(b.turnRate, 1).padStart(5)} ${n(b.weapon.energyJ).padStart(6)} ${n(b.weapon.spinUpS, 1).padStart(5)} ${n(b.height.frontEdgeMm, 1).padStart(5)} ${n(b.height.clearanceMm, 1).padStart(4)} ${(b.height.drivesInverted ? "yes" : b.height.invertible ? "srt" : "no").padStart(3)} ${n(b.runtimeS).padStart(6)} ${n(b.heat.fightDerateS).padStart(6)} ${b.weakestFace.padEnd(5)} ${n(b.exposureScore, 2).padStart(5)} ${n(b.cost).padStart(5)} ${n(b.buildHours, 1).padStart(5)} ${String(sevs(b, "bad")).padStart(4)} ${String(sevs(b, "warn")).padStart(4)}`);
  }
  if (!quiet && (!only || only === cls)) console.log(`\n${SIM.CLASSES[cls].name} (${SIM.CLASSES[cls].limitG} g)\n${head}\n${rows.join("\n")}`);
}

/* ---- 4. the layout moves the COM; an illegal place is fixed, not trusted ---- */
{
  const base = SIM.evalBuild(SIM.DEFAULT_CFG), moved = SIM.evalBuild(Object.assign({}, SIM.DEFAULT_CFG, { layout: { battery: [0, 3], electronics: [0, 2] } }));
  if (!(moved.com.x < base.com.x - 0.002)) fail(`moving the battery left didn't move the COM left (${base.com.x} -> ${moved.com.x})`);
  if (!moved.stress.some((s) => s.id === "com")) fail("a battery hung off one side should get the COM warning");
  const bad = SIM.evalBuild(Object.assign({}, SIM.DEFAULT_CFG, { layout: { weapon: [1, 4], battery: [9, 9] } }));
  if (!bad.valid || bad.layout.place.weapon[1] !== 0) fail("an illegal weapon place should be moved back to the front row");
  const over = SIM.evalBuild(Object.assign({}, SIM.DEFAULT_CFG, { armour: { front: "ar500", back: "ar500", left: "ar500", right: "ar500", top: "ar500" }, chassis: "steel" }));
  if (over.valid || over.verdict !== "over") fail("an all-AR500 steel beetle should be over the limit");
  const odd = SIM.evalBuild({ cls: "beetle", weapon: "laser" });
  if (odd.valid || !odd.errors.some((e) => /laser/.test(e))) fail("an unknown part should be reported");
  /* unknown ids from a damaged save: reported, swapped for the default part, never a crash, and mass and cost agree */
  for (const bad of [{ armour: { front: "plate9" } }, { battery: "zzz", electronics: "basic" }, { electronics: "zzz" }, { chassis: "zzz" }, { extras: ["jet"] }, { wheels: "mecanum", weapon: "zap" }]) {
    const cfg = Object.assign({}, SIM.DEFAULT_CFG, bad), lbl = JSON.stringify(bad);
    let r; try { r = SIM.evalBuild(cfg); } catch (e) { fail(`${lbl}: evalBuild threw ${e.message}`); continue; }
    if (r.valid || !r.errors.some((e) => /^Unknown/.test(e))) fail(`${lbl}: the unknown id should be reported`);
    const fixed = SIM.evalBuild(SIM.normCfg(cfg));
    if (!fixed.valid || Math.abs(fixed.totalG - r.totalG) > 1e-6) fail(`${lbl}: the default part's mass should stand in (${r.totalG} vs ${fixed.totalG})`);
    if (SIM.fitBill(null, cfg).cost !== r.cost) fail(`${lbl}: fitBill and evalBuild disagree on cost`);
  }
}

/* ---- 5. pay on fit: the whole bot from nothing is evalBuild's cost; one change pays for that part only ---- */
{
  for (const cls of SIM.CLASS_IDS) {
    const cfg = Object.assign({}, SIM.DEFAULT_CFG, { cls }), all = SIM.fitBill(null, cfg);
    if (all.cost !== SIM.evalBuild(cfg).cost) fail(`${cls}: fitBill(null) ${all.cost} != evalBuild cost ${SIM.evalBuild(cfg).cost}`);
    if (SIM.fitBill(cfg, cfg).lines.length) fail(`${cls}: an unchanged bot should cost nothing to fit`);
  }
  const a = SIM.DEFAULT_CFG, b = Object.assign({}, a, { battery: "small", armour: Object.assign({}, a.armour, { top: "none", back: "steel" }), extras: ["skid"] });
  const bill = SIM.fitBill(a, b), ids = bill.lines.map((l) => l.slot + ":" + l.id).sort().join(" ");
  if (ids !== "armour:steel battery:small extras:skid") fail("fitBill lines " + ids);
  if (!SIM.sameParts(a, Object.assign({}, a, { layout: { battery: [0, 3] } })) || SIM.sameParts(a, b)) fail("sameParts");
  const w = SIM.fitBill(a, Object.assign({}, a, { weapon: "drum" }));
  if (!w.lines.some((l) => l.slot === "weaponMaterial")) fail("a new weapon should pay for its material");
  /* taking things off: listed as removed, never as a €0 line; with no weapon the material doesn't matter */
  const off = SIM.fitBill(a, Object.assign({}, a, { weapon: "none", armour: Object.assign({}, a.armour, { back: "none" }) }));
  if (off.lines.length || off.removed.map((l) => l.slot).sort().join() !== "armour,weapon") fail("taking the weapon and a plate off: " + JSON.stringify(off));
  const pusher = Object.assign({}, a, { weapon: "none" });
  if (!SIM.sameParts(pusher, Object.assign({}, pusher, { weaponMaterial: "ti" }))) fail("with no weapon, the material shouldn't count as a change");
}

/* ---- 6. the bench (PR 3): every test on every build in every class, repeatable and finite; the measured numbers agree
   with the predictions where they should, and the impact, gauge and drop tests say what they should ---- */
{
  const finite = (o, path) => { if (typeof o === "number") { if (!isFinite(o)) return path; return null; }
    if (o && typeof o === "object") for (const k in o) { const r = finite(o[k], path + "." + k); if (r) return r; } return null; };
  for (const cls of SIM.CLASS_IDS) for (const t of SIM.TEST_BUILDS) {
    const b = SIM.evalBuild(Object.assign({}, t.cfg, { cls })), r = SIM.runBench(b), lbl = `${cls}/${t.id}`;
    if (JSON.stringify(r) !== JSON.stringify(SIM.runBench(SIM.evalBuild(Object.assign({}, t.cfg, { cls }))))) fail(`${lbl}: bench not repeatable`);
    const bad = finite(r, "bench"); if (bad) fail(`${lbl}: ${bad} is not finite`);
    if (!(r.drive.topSpeed > 0) || r.drive.topSpeed > r.drive.predicted + 1e-6 || r.drive.timeS == null) fail(`${lbl}: drive test ${r.drive.topSpeed} vs ${r.drive.predicted}`);
    if (r.weapon.kind === "spin" && !(r.weapon.spinUpS >= r.weapon.predicted * 0.99 && r.weapon.spinUpS < 10)) fail(`${lbl}: spin-up ${r.weapon.spinUpS} vs predicted ${r.weapon.predicted}`);
    if (r.weapon.kind === "flip") { const h = r.weapon.rows.map((q) => q.heightM); if (!r.weapon.rows[2].lifts || h[0] < h[1] || h[1] < h[2]) fail(`${lbl}: flipper test masses ${h}`); }
    for (const f of ["front", "back", "left", "right"]) if (r.impact.faces[f].failJ == null) fail(`${lbl}: nothing broke behind the ${f} face`);
    if (!r.impact.weakest) fail(`${lbl}: no weakest face`);
    if (r.weapon.kind === "spin" && r.endurance.derateS == null && r.endurance.runtimeS != null && Math.abs(r.endurance.runtimeS / b.runtimeS - 1) > 0.1) fail(`${lbl}: endurance ${r.endurance.runtimeS} s vs predicted ${b.runtimeS} s`);
    const m = SIM.stressReport(b, r); if (!m.some((l) => l.measured) || !m.some((l) => l.id === "impact")) fail(`${lbl}: the stress report should use the bench`);
  }
  const B = (cfg) => SIM.evalBuild(Object.assign({}, SIM.DEFAULT_CFG, cfg));
  if (SIM.runBench(SIM.evalBuild(SIM.TEST_BUILDS.find((t) => t.id === "wedge").cfg), "gauge").under !== 0) fail("nothing should get under the wedge");
  const bare = SIM.runBench(B({ armour: Object.assign({}, SIM.DEFAULT_CFG.armour, { back: "none" }) }), "impact").faces.back;
  const steel = SIM.runBench(B({ armour: Object.assign({}, SIM.DEFAULT_CFG.armour, { back: "steel" }) }), "impact").faces.back;
  if (!(bare.failJ < steel.failJ) || bare.plateJ !== 0) fail(`a bare rear should break sooner than a steel one (${bare.failJ} vs ${steel.failJ})`);
  const d = B({}), e = d.armourMapJ.front.absorbJ, h1 = SIM.hitFace(d, "front", e * 0.9);
  if (h1.plate || h1.parts.length) fail("a hit the front plate absorbs should do no damage");
  const st = SIM.damageState(d), big = e + d.armourMapJ.front.hpJ * 0.6; SIM.hitFace(d, "front", big, st); const h2 = SIM.hitFace(d, "front", big, st);
  if (!h2.plateBroken || !h2.parts.length) fail("two big hits should break the front plate and reach the parts behind it");
  if (SIM.runBench(SIM.evalBuild(SIM.TEST_BUILDS.find((t) => t.id === "invert").cfg), "drop").inverted.outcome !== "drives") fail("the invertible box should drive away upside down");
  if (SIM.runBench(SIM.evalBuild(SIM.TEST_BUILDS.find((t) => t.id === "hsp").cfg), "drop").inverted.outcome !== "rights") fail("the self-righter should put the hsp back");
  if (SIM.runBench(B({ wheels: "tracks" }), "drop").inverted.outcome !== "stuck") fail("tracks, a vertical spinner and no self-righter should be stuck upside down");
  const capped = B({ electronics: "basic", battery: "small" }), ce = SIM.runBench(capped, "endurance");
  if (!(capped.powerScale < 0.9) || Math.abs(ce.runtimeS / capped.runtimeS - 1) > 0.1) fail(`a power-capped bot's endurance (${ce.runtimeS} s) should match its prediction (${capped.runtimeS} s)`);
  const slow = Object.assign({}, B({}), {}); slow.weapon = Object.assign({}, slow.weapon, { spinPowerW: 0.5 });
  const sw = SIM.runBench(slow, "weapon"); if (sw.spinUpS !== null || !SIM.stressReport(slow, { weapon: sw }).some((l) => l.id === "spinup" && /never/.test(l.text))) fail("a disc that never gets to full speed should say so");
  if (SIM.BENCH_TESTS.length !== 6 || SIM.BENCH_TESTS.filter((t) => t.hours === 0).map((t) => t.id).join() !== "drive,weapon") fail("six tests, the drive and weapon tests free");
}

/* ---- PR 8: your own disc profile, the high-pressure flipper, minibots, the season's rules ---- */
{
  const B = (cfg) => SIM.evalBuild(Object.assign({}, SIM.DEFAULT_CFG, cfg));
  const st = B({}), mid = B({ disc: { name: "Two", teeth: 2, rim: "mid" } });
  if (Math.abs(mid.weapon.storedJ - st.weapon.storedJ) > 1e-6 || Math.abs(mid.weapon.bite - st.weapon.bite) > 1e-9 || mid.totalG !== st.totalG) fail("two teeth and a medium rim should be the stock disc");
  const heavy = B({ disc: { name: "Heavy", teeth: 1, rim: "heavy" } }), light = B({ disc: { name: "Light", teeth: 3, rim: "light" } });
  if (!(heavy.weapon.storedJ > st.weapon.storedJ && heavy.weapon.spinUpS > st.weapon.spinUpS && heavy.weapon.bite > st.weapon.bite)) fail("a one-tooth heavy rim should store more, spin up slower and bite deeper");
  if (!(light.weapon.storedJ < st.weapon.storedJ && light.weapon.bite < st.weapon.bite && light.totalG < st.totalG)) fail("a three-tooth light rim should store less, bite less and weigh less");
  if (SIM.normCfg(Object.assign({}, SIM.DEFAULT_CFG, { weapon: "wedge", disc: { teeth: 1, rim: "mid" } })).disc) fail("a disc profile belongs on a spinner only");
  if (SIM.normCfg({ disc: { teeth: 4, rim: "mid" } }).disc || SIM.normCfg({ disc: { teeth: 1, rim: "gold" } }).disc) fail("a disc profile with unknown teeth or rim should be dropped");
  if (SIM.normCfg({ disc: { teeth: 1, rim: "mid", name: "<b>" + "x".repeat(40) } }).disc.name.length > SIM.DISC_PROFILES.nameMax || /</.test(SIM.normCfg({ disc: { teeth: 1, rim: "mid", name: "<b>" } }).disc.name)) fail("a disc name is cleaned and cut short");
  const nd = Object.assign({}, SIM.DEFAULT_CFG, { disc: { name: "A", teeth: 1, rim: "mid" } });
  if (SIM.sameParts(SIM.DEFAULT_CFG, nd) || !SIM.fitBill(SIM.DEFAULT_CFG, nd).lines.some((l) => l.slot === "weaponMaterial")) fail("a new disc profile is a new disc on the bill");
  const fl = SIM.evalBuild(Object.assign({}, SIM.TEST_BUILDS.find((t) => t.id === "flipper").cfg, { cls: "beetle", weapon: "flipper2" })), f1 = SIM.evalBuild(Object.assign({}, SIM.TEST_BUILDS.find((t) => t.id === "flipper").cfg, { cls: "beetle" }));
  if (!fl.valid || !(fl.weapon.shots > f1.weapon.shots && fl.weapon.launchJ > f1.weapon.launchJ)) fail("the high-pressure flipper should fit the flipper build with more shots and a harder throw");
  if (SIM.evalBuild(Object.assign({}, SIM.DEFAULT_CFG, { cls: "ant", extras: ["minibot"] })).valid) fail("an antweight can't carry a minibot");
  for (const cls of ["beetle", "hobby", "feather", "heavy"]) { const m = SIM.evalBuild(Object.assign({}, SIM.MINIBOT.cfg, { cls: SIM.MINIBOT.cls[cls] })); if (!m.valid) fail(`the ${cls}'s minibot should be a valid build: ${m.errors.join("; ")}`); }
  if (SIM.evalBuild(SIM.DEFAULT_CFG, { limitG: 1600 }).limitG !== 1600 || heavy.valid || !SIM.evalBuild(heavy.cfg, { limitG: 1600 }).valid) fail("a season's limit should change the class limit");
  const F = SIM.newFight({ seed: 3, rules: { capJ: 50 }, bots: [{ cfg: SIM.DEFAULT_CFG, driver: { style: "auto", skill: 0.5 } }, { cfg: SIM.DEFAULT_CFG, driver: { style: "auto", skill: 0.5 } }] });
  if (Math.abs(0.5 * F.bots[0].b.weapon.inertia * F.bots[0].b.weapon.omega ** 2 - 50) > 0.01) fail("an energy cap should bring the disc's top speed down to store the cap");
  console.log("PR 8 checks: disc profiles, the high-pressure flipper, minibots, season rules");
}

/* ---- 0.1.15.3: the weapon bay (b.bay) and an open bay as a weak spot ---- */
{
  const KIND = { vsp: "slot", saw: "slot", drum: "pocket", hsp: "well", under: "underwell", hammer: "deck", flipper: "deck", flipper2: "deck",
    lifter: "deck", grabber: "deck", crusher: "deck", wedge: "none", none: "none", shell: "none", ring: "none", melty: "none" }, eps = 1e-9;
  for (const cls of SIM.CLASS_IDS) for (const w of SIM.PARTS.weapon) {
    const b = SIM.evalBuild(Object.assign({}, SIM.DEFAULT_CFG, { cls, weapon: w.id, disc: null })), y = b.bay, lbl = `${cls}/${w.id}`;
    if (!y) { fail(`${lbl}: no bay`); continue; }
    if (y.kind !== (KIND[w.id] || "?")) fail(`${lbl}: bay ${y.kind}, should be ${KIND[w.id]}`);
    const W = b.widthM, L = b.lengthM;
    for (const k of ["topFrac", "belowFrac"]) if (!(y[k] >= 0 && y[k] <= 1)) fail(`${lbl}: ${k} ${y[k]} outside 0..1`);
    if (!y.openTop && y.topFrac !== 0) fail(`${lbl}: topFrac ${y.topFrac} on a bay that isn't open from above`);
    if (!y.openBelow && y.belowFrac !== 0) fail(`${lbl}: belowFrac ${y.belowFrac} on a bay that isn't open from below`);
    if (y.kind === "none") { if (y.rect || y.u || y.openTop || y.openBelow) fail(`${lbl}: no bay, but a rect or an opening`); continue; }
    const r = y.rect;
    if (!r || r[0] < -W / 2 - eps || r[2] > W / 2 + eps || r[1] < -L / 2 - eps || r[3] > L / 2 + eps || !(r[2] > r[0]) || !(r[3] > r[1])) fail(`${lbl}: bay rect ${r} outside the body ${W} x ${L}`);
    const u = y.u && y.u.rect, want = r && [r[0] / W, -r[3] / L, r[2] / W, -r[1] / L];
    if (!u || u.some((v, i) => Math.abs(v - want[i]) > eps)) fail(`${lbl}: bay u ${u} should be ${want}`);
    if ((y.kind === "slot" || y.kind === "pocket" || y.kind === "well") !== y.openTop) fail(`${lbl}: a ${y.kind} should${y.openTop ? " not" : ""} be open from above`);
    if ((w.id === "vsp" || w.id === "drum" || w.id === "under") !== y.openBelow) fail(`${lbl}: openBelow ${y.openBelow}`);
    if (y.openTop && !(y.topFrac > 0)) fail(`${lbl}: an open bay with no share of the top`);
  }
  /* a hit from above into the bay skips the plate and lands on the weapon first */
  const b = SIM.evalBuild(Object.assign({}, SIM.TEST_BUILDS.find((t) => t.id === "hsp").cfg, { cls: "beetle" })), A = b.armourMapJ.top, E = A.absorbJ + A.hpJ * 0.5;
  const onPlate = SIM.hitFace(b, "top", E), intoBay = SIM.hitFace(b, "top", E, null, 1, true), wd = (h) => h.parts.filter((p) => p.key === "weapon").reduce((a, p) => a + p.dmg, 0);
  if (!(A.absorbJ > 0) || onPlate.parts.length || !(onPlate.plate > 0)) fail("a hit the top plate holds should do no damage behind it");
  if (intoBay.plate || intoBay.absorbed || !intoBay.bay || !intoBay.parts.length || intoBay.parts[0].key !== "weapon" || !(wd(intoBay) > wd(onPlate))) fail("a hit into the open bay should skip the plate and land on the weapon first");
  /* in a fight: no open bay, no draws (the fight is the same whatever bayMul is); a hammer finds a horizontal disc's well */
  const T = (id) => SIM.TEST_BUILDS.find((t) => t.id === id).cfg, run = (a, d, seed) => SIM.runFight({ seed, arena: "box", bots: [{ cfg: T(a), driver: { style: "auto", skill: 0.85 } }, { cfg: T(d), driver: { style: "auto", skill: 0.85 } }] });
  const mul = SIM.DAMAGE.bayMul, logOf = (a, d, seed) => JSON.stringify(run(a, d, seed).log);
  SIM.DAMAGE.bayMul = 1; const flat1 = logOf("hammer", "flipper", 5); SIM.DAMAGE.bayMul = 3; const flat3 = logOf("hammer", "flipper", 5);
  let bayHits = 0; for (let s = 1; s <= 12 && !bayHits; s++) bayHits += run("hammer", "hsp", s).log.entries.filter((e) => e.bay && e.v === 1).length;
  SIM.DAMAGE.bayMul = mul;
  if (flat1 !== flat3) fail("a fight with no open bay should not change with DAMAGE.bayMul");
  if (!bayHits) fail("a hammer should land in a horizontal disc's well now and then");
  console.log("0.1.15.3 checks: weapon bays in every class, hits into the bay");
}

/* 0.1.32: front attachments, the back slot, the grabber */
{
  const T = (id) => Object.assign({}, SIM.TEST_BUILDS.find((t) => t.id === id).cfg, { cls: "beetle" });
  for (const f of SIM.PARTS.front) for (const k of SIM.PARTS.back) {
    const b = SIM.evalBuild(Object.assign(T("vsp"), { front: f.id, back: k.id }));
    if (!b.front || b.front.id !== f.id || !b.back || b.back.id !== k.id) fail(`vsp + ${f.id} + ${k.id}: front/back missing from evalBuild`);
    if (!(b.height.frontEdgeMm > 0) || !(b.height.backEdgeMm > 0) || !(b.height.frontBareMm >= b.height.frontEdgeMm - 1e-9)) fail(`vsp + ${f.id} + ${k.id}: edges ${b.height.frontEdgeMm} / ${b.height.backEdgeMm} / ${b.height.frontBareMm}`);
    if (f.id !== "none" && !b.parts.some((p) => p.key === "front")) fail(`vsp + ${f.id}: the front isn't a part that can be hit`);
    if (k.id !== "none" && !b.parts.some((p) => p.key === "back")) fail(`vsp + ${k.id}: the back part isn't a part that can be hit`);
  }
  const base = SIM.evalBuild(T("vsp")), wl = SIM.evalBuild(Object.assign(T("vsp"), { front: "wedgelets" }));
  if (!(wl.height.frontEdgeMm < base.height.frontEdgeMm) && base.height.frontEdgeMm > 1) fail("wedgelets should lower a box's front edge");
  if (Math.abs(wl.totalG - base.totalG - SIM.part("front", "wedgelets").massG) > 1) fail(`wedgelets should weigh ${SIM.part("front", "wedgelets").massG} g, added ${wl.totalG - base.totalG}`);
  for (const w of ["wedge", "lifter", "flipper", "grabber"]) { const b = SIM.evalBuild(Object.assign(T("lifter"), { weapon: w, front: "spike" }));
    if (b.valid || !b.errors.some((e) => /own front/.test(e))) fail(`a ${w} with a front attachment should be refused`); }
  const kk = SIM.evalBuild(Object.assign(T("hsp"), { back: "kicker" }));
  if (!kk.back.kick || !(kk.back.kick.canLiftKg > 0) || !kk.height.selfRight) fail("a kicker should flick, and self-right a bot with no other righter");
  if (!(kk.power.idleW > base.power.idleW - 1e-9)) fail("a kicker should draw from the battery");
  const gb = SIM.evalBuild(T("lifter")), gr = SIM.evalBuild(Object.assign(T("lifter"), { weapon: "grabber" }));
  if (!gr.valid) fail(`the lifter test build with a grabber should be valid: ${gr.errors.join("; ")}`);
  if (!(gr.weapon.canLiftKg >= SIM.CLASSES.beetle.limitG / 1000)) fail(`a beetle grabber should lift a beetle (${gr.weapon.canLiftKg} kg)`);
  /* a grabber fight and a kicker fight replay the same from their logs; a grabber gets a grab in */
  const fight = (a, b, seed) => SIM.runFight({ seed, arena: "clubbox", bots: [{ cfg: a, driver: { style: "auto", skill: 0.8 } }, { cfg: b, driver: { style: "auto", skill: 0.8 } }] });
  let grabs = 0, kicks = 0;
  for (let s = 1; s <= 6; s++) {
    const r = fight(Object.assign(T("lifter"), { weapon: "grabber" }), T("brick"), s), r2 = fight(Object.assign(T("hsp"), { back: "kicker", front: "plow" }), T("flipper"), s);
    for (const x of [r, r2]) { const rp = SIM.replayFight(JSON.parse(JSON.stringify(x.log))); if (!rp || rp.winner !== x.winner || rp.timeS !== x.timeS) fail(`seed ${s}: a 0.1.32 fight replays differently`); }
    grabs += r.log.entries.filter((e) => e.k === "grab" && e.a === 0).length; kicks += r2.log.entries.filter((e) => e.k === "kick" && e.a === 0).length;
  }
  if (!grabs) fail("a grabber should grab in six fights against the brick");
  console.log(`0.1.32 checks: fronts x backs, own fronts, the kicker, the grabber (${grabs} grabs, ${kicks} kicks in 6 fights; replays match)`);
}

/* 0.1.34: the odd bodies (shell, ring, meltybrain, shuffler legs) */
{
  const T = (id) => Object.assign({}, SIM.TEST_BUILDS.find((t) => t.id === id).cfg, { cls: "beetle" });
  for (const id of SIM.ALL_ROUND) {
    const c = Object.assign(T("hsp"), { weapon: id, front: "none", back: "none" }), b = SIM.evalBuild(c);
    if (!b.weapon.allRound || b.weapon.mountM[0] !== 0 || b.weapon.mountM[1] !== 0) fail(`${id}: not all round at the middle`);
    if (!(b.weapon.storedJ > 60 && b.weapon.storedJ < 260)) fail(`${id}: beetle stores ${b.weapon.storedJ} J`);
    for (const k of [{ front: "spike" }, { back: "rearspike" }]) { const r = SIM.evalBuild(Object.assign({}, c, k));
      if (r.valid || !r.errors.some((e) => /all the way round/.test(e))) fail(`${id} with ${JSON.stringify(k)} should be refused`); }
    if (b.bay && b.bay.kind !== "none") fail(`${id}: bay ${b.bay.kind}`);
  }
  if (!SIM.evalBuild(Object.assign(T("hsp"), { weapon: "melty", front: "none", back: "none" })).height.drivesInverted) fail("a meltybrain should drive either way up");
  const lw = SIM.evalBuild(Object.assign(T("vsp"), { wheelbase: "legs" })), sw = SIM.evalBuild(T("vsp")), L = SIM.part("wheelbase", "legs");
  if (lw.limitG !== Math.round(sw.limitG * L.limitMul)) fail(`legs: limit ${lw.limitG}, should be ${sw.limitG} x ${L.limitMul}`);
  if (!(lw.driveSpeed < sw.driveSpeed * 0.6)) fail(`legs should be slow: ${lw.driveSpeed} vs ${sw.driveSpeed}`);
  /* fights replay the same; a meltybrain loses its sync at least once in a few fights against heavy hitters */
  const fight = (a, b, seed) => SIM.runFight({ seed, arena: "clubbox", bots: [{ cfg: a, driver: { style: "auto", skill: 0.8 } }, { cfg: b, driver: { style: "auto", skill: 0.8 } }] });
  let sync = 0;
  for (let s = 1; s <= 6; s++) for (const [a, b] of [[Object.assign(T("hsp"), { weapon: "melty", front: "none", back: "none" }), T(s % 2 ? "vsp" : "drum")],
    [Object.assign(T("hsp"), { weapon: s % 2 ? "shell" : "ring", front: "none", back: "none" }), T("wedge")], [Object.assign(T("vsp"), { wheelbase: "legs" }), T("brick")]]) {
    const r = fight(a, b, s), rp = SIM.replayFight(JSON.parse(JSON.stringify(r.log)));
    if (!rp || rp.winner !== r.winner || rp.timeS !== r.timeS) fail(`seed ${s}: a 0.1.34 fight (${a.weapon}/${a.wheelbase}) replays differently`);
    sync += r.log.entries.filter((e) => e.k === "self" && e.what === "sync").length;
  }
  if (!sync) fail("a meltybrain should lose its sync at least once in six fights against spinners");
  console.log(`0.1.34 checks: shell, ring and meltybrain all round, legs (limit x${L.limitMul}), ${sync} lost syncs in 6 fights; replays match`);
}

/* 0.1.35: the AI driving audit. A spun-up shell or a heavyweight's disc can still pivot at full lock (the gyro
   takes most of the turn, never all of it); AI drivers don't drive themselves into the pit; fights replay the same */
{
  const T = (id, cls) => Object.assign({}, SIM.TEST_BUILDS.find((t) => t.id === id).cfg, { cls });
  for (const [name, cfg] of [["beetle shell", Object.assign(T("hsp", "beetle"), { weapon: "shell", front: "none", back: "none" })],
    ["heavy vertical disc", T("vsp", "heavy")]]) {
    const F = SIM.newFight({ seed: 7, arena: "clubbox", bots: [{ cfg }, { cfg: T("brick", cfg.cls), driver: { style: "auto", skill: 0 } }] });
    const me = F.bots[0];
    for (let i = 0; i < 120; i++) SIM.stepFight(F, [{ weapon: 1 }, {}]);   // spin it up standing still
    const h0 = me.h;
    for (let i = 0; i < 120; i++) SIM.stepFight(F, [{ weapon: 1, steer: 1 }, {}]);
    const turned = Math.abs(me.h - h0);
    if (!(turned > 0.3)) fail(`${name}: turned only ${turned.toFixed(2)} rad in 2 s at full lock with the weapon up`);
    else console.log(`  ${name}: ${turned.toFixed(2)} rad in 2 s at full lock, weapon spun up`);
  }
  /* self-inflicted pit falls: a fall with no touch, no air and no hit in the second before */
  let selfPit = 0, n = 0;
  const ids = ["wedge", "hsp", "vsp", "flipper", "drum", "invert"];
  for (let s = 1; s <= 8; s++) {
    const a = T(ids[s % ids.length], "beetle"), b = T(ids[(s + 2) % ids.length], "beetle");
    const F = SIM.newFight({ seed: s, arena: s % 2 ? "clubbox" : "tabletop", bots: [{ cfg: a, driver: { style: "auto", skill: 0.8 } }, { cfg: b, driver: { style: "auto", skill: 0.8 } }] });
    const last = [-9, -9];let seen = 0;
    while (!F.over) {
      SIM.stepFight(F);
      for (const o of F.bots) { const t = F.bots[1 - o.i]; if (o.touch[t.i] != null && F.t - o.touch[t.i] < 0.05) last[o.i] = F.t; if (o.air) last[o.i] = F.t; }
      for (; seen < F.log.length; seen++) { const e = F.log[seen]; if (e.k === "pit" && F.t - last[e.v] > 1) selfPit++; }
    }
    n++;
    const r = SIM.fightResult(F), rp = SIM.replayFight(JSON.parse(JSON.stringify(r.log)));
    if (!rp || rp.winner !== r.winner || rp.timeS !== r.timeS) fail(`seed ${s}: a 0.1.35 fight replays differently`);
  }
  if (selfPit) fail(`${selfPit} self-inflicted pit falls in ${n} AI fights`);
  console.log(`0.1.35 checks: spun-up spinners pivot; ${selfPit} self-inflicted pit falls in ${n} AI fights; replays match`);
}

if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log("\nsim-test: all checks pass");
