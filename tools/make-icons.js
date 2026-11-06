#!/usr/bin/env node
/* Scrapline: render the PWA icons into icons/ (192, 512, 512 maskable, 180 apple-touch).
 * Needs Playwright (preinstalled in Claude Code cloud sessions; elsewhere npm i -g playwright and
 * NODE_PATH=$(npm root -g) node tools/make-icons.js). Output is committed; re-run only to change the mark.
 * The mark: a horizontal spinner disc seen from above, two teeth on the rim, a hub and four bolt holes, clay on the
 * Longlight base (#D97757 on #141413). Placeholder art until Kelbo draws a real one. */
"use strict";
const { chromium } = require("playwright"), fs = require("fs"), path = require("path");
const OUT = path.join(__dirname, "..", "icons");
const CLAY = "#D97757", BASE = "#141413";
/* 100x100 artboard. s = mark scale about the centre (the maskable icon keeps the mark inside the inner 80% safe zone) */
function disc() {
  const R = 34, P = (r, a) => [50 + r * Math.cos(a), 50 + r * Math.sin(a)], f = q => q[0].toFixed(2) + " " + q[1].toFixed(2);
  /* each tooth is a block standing proud of the rim, leaning into the spin (clockwise), with its striking face square */
  let teeth = "";
  for (const a0 of [-0.45, Math.PI - 0.45]) {
    const a1 = a0 + 0.42, out = R + 10;
    teeth += `M${f(P(R - 4, a0))}L${f(P(out, a0 + 0.06))}L${f(P(out, a1 - 0.02))}L${f(P(R - 4, a1 + 0.14))}Z`;
  }
  let holes = "";
  for (let i = 0; i < 4; i++) { const q = P(12, i * Math.PI / 2 + Math.PI / 4); holes += `<circle cx="${q[0].toFixed(2)}" cy="${q[1].toFixed(2)}" r="2.4" fill="${BASE}"/>`; }
  return `<path d="${teeth}" fill="${CLAY}"/><circle cx="50" cy="50" r="${R}" fill="${CLAY}"/>` +
    `<circle cx="50" cy="50" r="${R - 5}" fill="none" stroke="${BASE}" stroke-width="1.4" opacity=".55"/>` +
    `<circle cx="50" cy="50" r="6" fill="${BASE}"/>${holes}`;
}
function svg(s) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><rect width="100" height="100" fill="${BASE}"/>
<g transform="translate(50 50) scale(${s}) rotate(-20) translate(-50 -50)">${disc()}</g></svg>`;
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch(), jobs = [["icon-192.png", 192, 1.0], ["icon-512.png", 512, 1.0], ["icon-512-maskable.png", 512, 0.76], ["apple-touch-icon.png", 180, 0.9]];
  for (const [f, n, s] of jobs) {
    const p = await b.newPage({ viewport: { width: n, height: n }, deviceScaleFactor: 1 });
    await p.setContent(`<body style="margin:0;background:${BASE}">${svg(s)}</body>`);
    await p.screenshot({ path: path.join(OUT, f), clip: { x: 0, y: 0, width: n, height: n } }); await p.close(); console.log("wrote icons/" + f);
  }
  await b.close();
})();
