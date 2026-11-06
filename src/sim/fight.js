/* ---- fight.js: runFight({bots, arena, seed, rules}), the N-body fight at a fixed 60 Hz step. 2D rigid bodies with a
   cheap height axis (z, vz, inverted), WEDGE_RULES, drive, weapon state, collisions and hits, round ends, the fight log
   with the player's recorded inputs. Every bot reads {throttle, steer, weapon, selfRight} each step. PR 4a (plan 7a). ---- */
const STEP_HZ=60;
const WEDGE_RULES={};
