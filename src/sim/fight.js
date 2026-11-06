/* ---- fight.js: runFight({bots, arena, seed, rules}), the N-body fight at a fixed 60 Hz step. 2D rigid bodies with a
   cheap height axis (z, vz, inverted), WEDGE_RULES, drive, weapon state, collisions and hits, round ends, the fight log
   with the player's recorded inputs. Every bot reads {throttle, steer, weapon, selfRight} each step. PR 4a (plan 7a). ---- */
const STEP_HZ=60;
/* WEDGE_RULES: who gets under whom on front-to-front contact. tolMm (beetle scale, x edge in other classes): the lower edge
   must beat the other by more than this; within it, it's a tie (edge material and skid plates decide, PR 4a). The bench's
   wedge gauge (PR 3) already reads tolMm. */
const WEDGE_RULES={tolMm:0.3};
