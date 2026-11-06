/* ---- damage.js: hits on faces (absorb, armour hp, then the most exposed part behind it), part failures and their
   effects, self-damage to discs and shafts, and each part's end state: intact, damaged or destroyed. PR 4a (plan 7b). ---- */
const PART_STATES=["intact","damaged","destroyed"];
