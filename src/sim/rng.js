<script>
/* ===================== Servo: robot sim core (SERVO_SIM) =====================
   Parts maths, bench tests, the fight simulation and the AI drivers. Never touches the DOM or three.js, and runs in plain
   node: cut this <script> block out of the built index.html (search for "Servo: robot sim core") and require it; it ends
   with module.exports = SERVO_SIM. One IIFE spread over sim/rng.js, parts.js, build.js, combos.js, bench.js, fight.js,
   damage.js, ai.js, arenas.js and opponents.js (in that order); the export object is at the end of opponents.js.

   Determinism is a hard rule: everything random comes from one seeded generator passed in as an argument. Math.random,
   Date.now and performance.now are banned anywhere in src/sim/ (tools/sim-test.js, from PR 1, fails if it finds them).
   Units: parts tables are in grams and millimetres; evalBuild (sim/build.js) is the one conversion point, and everything
   after it is kg, m, s, J, W.

   This file: the seeded generator. rng(seed) returns a function giving floats in [0, 1) (mulberry32: 32-bit state, fast,
   and the same sequence in every browser and in node). Helpers take that function as their first argument. */
const SERVO_SIM=(function(){
"use strict";
function rng(seed){let a=(seed>>>0)||0x9E3779B9;return function(){a=(a+0x6D2B79F5)>>>0;let t=a;
  t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
const rRange=(r,lo,hi)=>lo+(hi-lo)*r();            // float in [lo, hi)
const rInt=(r,lo,hi)=>lo+Math.floor((hi-lo+1)*r()); // integer in [lo, hi]
const rPick=(r,arr)=>arr[Math.floor(arr.length*r())];
