/* ---- sim/bench.js: the six bench tests (drive, weapon, impact per face, wedge gauge, endurance, drop), PR 3 (plan
   section 6), and WEDGE_GAUGES: the leading-edge heights (mm) of the wedges, lifters and forks common in each class, low
   to high. The stress report (sim/combos.js) already reads them: a front edge above most of them means most wedges in the
   class get under you. ---- */
const WEDGE_GAUGES={
  ant:    [0.5,1,1.5,2,3],
  beetle: [1,1.5,2,3,4,6],
  hobby:  [1,2,3,4,6,8],
  feather:[1.5,2,3,5,7,10],
  heavy:  [2,3,4,6,9,12]
};
