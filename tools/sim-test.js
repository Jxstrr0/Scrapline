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
    if (p.type === "spinner" || p.type === "saw") for (const k of ["discMass", "radius", "rpmMax", "shapeK", "bite", "recoil"]) if (!Number.isFinite(p[k])) fail(`PARTS.weapon.${p.id}.${k}`);
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
  /* taking things off: listed as removed, never as a Th 0 line; with no weapon the material doesn't matter */
  const off = SIM.fitBill(a, Object.assign({}, a, { weapon: "none", armour: Object.assign({}, a.armour, { back: "none" }) }));
  if (off.lines.length || off.removed.map((l) => l.slot).sort().join() !== "armour,weapon") fail("taking the weapon and a plate off: " + JSON.stringify(off));
  const pusher = Object.assign({}, a, { weapon: "none" });
  if (!SIM.sameParts(pusher, Object.assign({}, pusher, { weaponMaterial: "ti" }))) fail("with no weapon, the material shouldn't count as a change");
}

if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log("\nsim-test: all checks pass");
