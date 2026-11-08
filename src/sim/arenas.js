/* ---- arenas.js: ARENAS and JUDGE_WEIGHTS (plan 8b, 8c).
   An arena is a walled square (sizeM is its side at beetle scale; sim/fight.js arenaOf scales every length by the class's
   len) with up to three kinds of hazard, each with its numbers here so the harness can tune them like weapons:
     pit      rect [x0, y0, x1, y1] (m, beetle scale, centred on the arena). A bot whose centre is over it, on the ground,
              falls in and is out. openS: it opens this many seconds into the round (0: open from the bell).
     pusher   a slab in a wall: rect is its strike zone, n the way it pushes (unit vector into the arena). A bot on the
              ground in the zone triggers it; for activeS it shoves everything in the zone once: kickMs of speed along n
              (m/s, x sqrt len), J of damage to the face that meets it (x the class's mass multiplier) and vzMs up (none on
              a pusher). Then it re-arms after periodS.
     spinner  a disc in the floor: at [x, y], rM its radius. Triggered and timed like a pusher. It hits from below (J, via
              the landing model), throws the bot kickMs sideways and vzMs up, and spins it by spinRad (rad/s).
   startS: a hazard stays still before this. Layout: the arena is turned by a multiple of 90 degrees picked from the
   seed (the same seed, the same layout), so a hazard isn't always on the same side of the start. Bots start on a ring at
   0.6 x half the side, turned so the pit and the floor spinners are as far from the starts as they can be (sim/fight.js
   newFight).
   Each class has its usual arena (CLASSES[cls].arenaId), which is where tools/fight-test.js balances it (Kelbo, PR 4b);
   the plain test box has walls only.
   JUDGE_WEIGHTS: a time-up decision (sim/fight.js judgeFight). Each term is shared between the teams in proportion to
   what each did, then weighted, so the scores add up to 100:
     damage      hp each team took off the other in this fight (carried-in damage doesn't count)
     aggression  seconds closing on an enemy or in contact, less seconds retreating
     control     seconds the enemy spent lifted, under a wedge that is driving it about, pinned against a wall or upside
                 down and stuck, plus a few for each time it was shoved into a hazard
   A pin (under a wedge or against a wall) lasts at most FIGHT.holdMaxS in one spell: then the pinner backs off. ---- */
const ARENAS={
  box:{id:"box",name:"Test box",sizeM:2.4,wallE:0.35,pit:null,hazards:[]},
  /* the antweights' table at club meets: small, an open pit on one side (narrowed in 0.1.12.0: it decided 79% of ant fights; again in 0.1.17.5) */
  tabletop:{id:"tabletop",name:"Tabletop",sizeM:2.0,wallE:0.3,pit:{rect:[0.84,-0.12,1.0,0.12],openS:0},hazards:[]},
  /* the Gemeindehalle's box: a pit near one wall and a pusher opposite it (narrowed in 0.1.12.0, as the tabletop's; smaller again
     and opening at 0:30 from 0.1.17.5) */
  clubbox:{id:"clubbox",name:"Club box",sizeM:2.4,wallE:0.35,pit:{rect:[0.98,-0.17,1.2,0.17],openS:30},
    hazards:[{type:"pusher",rect:[-1.2,-0.3,-0.98,0.3],n:[1,0],kickMs:2.2,J:6,vzMs:0,activeS:0.35,periodS:4,startS:0}]},
  /* the regional arenas (Stahlbrück, Eisenau, Grauwald): the pit opens a third of the way in; two pushers and a floor spinner */
  regional:{id:"regional",name:"Regional arena",sizeM:2.6,wallE:0.35,pit:{rect:[0.7,0.7,1.3,1.3],openS:30},
    hazards:[{type:"pusher",rect:[-1.3,-0.35,-1.06,0.35],n:[1,0],kickMs:2.4,J:8,vzMs:0,activeS:0.35,periodS:4,startS:0},
      {type:"pusher",rect:[-0.35,-1.3,0.35,-1.06],n:[0,1],kickMs:2.4,J:8,vzMs:0,activeS:0.35,periodS:4,startS:0},
      {type:"spinner",at:[-0.33,0.33],rM:0.16,kickMs:1.6,J:10,vzMs:1.1,spinRad:14,activeS:0.25,periodS:5,startS:0}]},
  /* the Scrapline Open's Eisenhalle: the pit opens at 45 s; pushers on two walls; two floor spinners */
  eisenhalle:{id:"eisenhalle",name:"The Eisenhalle",sizeM:2.8,wallE:0.3,pit:{rect:[-0.3,1.0,0.3,1.4],openS:45},
    hazards:[{type:"pusher",rect:[-1.4,-0.4,-1.14,0.4],n:[1,0],kickMs:2.6,J:10,vzMs:0,activeS:0.35,periodS:4,startS:0},
      {type:"pusher",rect:[1.14,-0.4,1.4,0.4],n:[-1,0],kickMs:2.6,J:10,vzMs:0,activeS:0.35,periodS:4,startS:0},
      {type:"spinner",at:[-0.7,-0.75],rM:0.17,kickMs:1.8,J:12,vzMs:1.2,spinRad:14,activeS:0.25,periodS:5,startS:0},
      {type:"spinner",at:[0.7,-0.75],rM:0.17,kickMs:1.8,J:12,vzMs:1.2,spinRad:14,activeS:0.25,periodS:5,startS:0}]}
};
const ARENA_IDS=Object.keys(ARENAS);
const JUDGE_WEIGHTS={damage:.5,aggression:.25,control:.25};
