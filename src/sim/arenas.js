/* ---- arenas.js: ARENAS, walls, pit, pushers and floor spinner, each hazard with its impulse, damage J, vz kick and active
   time; JUDGE_WEIGHTS for a time-up decision (damage, aggression, control). PR 4b (plan 8b, 8c).
   PR 4a brings only the plain test box the debug view and tools/fight-test.js use: walls, nothing else. sizeM is the side
   at beetle scale (x len in the other classes, sim/fight.js arenaOf); wallE how bouncy the walls are; pit, when an arena
   has one, is [x0, y0, x1, y1] in m at beetle scale. ---- */
const ARENAS={
  box:{id:"box",name:"Test box",sizeM:2.4,wallE:0.35,pit:null,hazards:[]}
};
const JUDGE_WEIGHTS={damage:.5,aggression:.25,control:.25};
