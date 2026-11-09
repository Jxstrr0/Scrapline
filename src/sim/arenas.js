/* ---- arenas.js: ARENAS and JUDGE_WEIGHTS (plan 8b, 8c).
   An arena is a walled square (sizeM is its side at beetle scale; sim/fight.js arenaOf scales every length by the class's
   len) with up to four kinds of hazard, each with its numbers here so the harness can tune them like weapons:
     pit      rect [x0, y0, x1, y1] (m, beetle scale, centred on the arena). A bot whose centre is over it, on the ground,
              falls in and is out. openS: it opens this many seconds into the round (0: open from the bell).
     pusher   a slab in a wall: rect is its strike zone, n the way it pushes (unit vector into the arena). A bot on the
              ground in the zone triggers it; for activeS it shoves everything in the zone once: kickMs of speed along n
              (m/s, x sqrt len), J of damage to the face that meets it (x the class's mass multiplier) and vzMs up (none on
              a pusher). Then it re-arms after periodS.
     spinner  a disc in the floor: at [x, y], rM its radius. Triggered and timed like a pusher. It hits from below (J, via
              the landing model), throws the bot kickMs sideways and vzMs up, and spins it by spinRad (rad/s).
     flame    a grate in the floor (0.1.37, Kelbo's improvements, part two): rect. It runs on the clock, whoever is on it:
              from startS, every periodS it shows a pilot light for warnS and then burns for activeS. A bot on the ground
              on the grate while it burns takes heat (heatFrac of its drive's and its weapon's heat budget a second: stay
              and the motors derate, as on the bench's heat test) and Jps of damage a second from below (x the class's
              mass multiplier, in licks every tickS). It doesn't shove. The AI keeps off it while the pilot is lit or it
              burns (sim/ai.js).
   startS: a hazard stays still before this. Layout: the arena is turned by a multiple of 90 degrees picked from the
   seed (the same seed, the same layout), so a hazard isn't always on the same side of the start. Bots start on a ring at
   0.6 x half the side, turned so the pit and the floor spinners are as far from the starts as they can be (sim/fight.js
   newFight).
   line: one sentence for the player on what is in it (the career's event line, app/career.js crEvLine).
   Each class has its usual arena (CLASSES[cls].arenaId), which is where tools/fight-test.js balances it (Kelbo, PR 4b);
   the plain test box has walls only. A career event fights in its venue's arena instead where the venue has one
   (WORLD.venues[v].arena, 0.1.28.0); tools/fight-test.js -a <id> balances a class there.
   JUDGE_WEIGHTS: a time-up decision (sim/fight.js judgeFight). Each term is shared between the teams in proportion to
   what each did, then weighted, so the scores add up to 100:
     damage      hp each team took off the other in this fight (carried-in damage doesn't count)
     aggression  seconds closing on an enemy or in contact, less seconds retreating
     control     seconds the enemy spent lifted, under a wedge that is driving it about, pinned against a wall or upside
                 down and stuck, plus a few for each time it was shoved into a hazard
   A pin (under a wedge or against a wall) lasts at most FIGHT.holdMaxS in one spell: then the pinner backs off. ---- */
/* a flame grate with the usual numbers: where, when it first lights, how often */
const FLAME=(rect,startS,periodS)=>({type:"flame",rect,warnS:1.2,activeS:2.5,periodS,startS,heatFrac:0.3,Jps:6,tickS:0.5});
const ARENAS={
  box:{id:"box",name:"Test box",line:"Walls only.",sizeM:2.4,wallE:0.35,pit:null,hazards:[]},
  /* the antweights' table at club meets: small, an open pit on one side (narrowed in 0.1.12.0: it decided 79% of ant fights; again in 0.1.17.5) */
  tabletop:{id:"tabletop",name:"Tabletop",line:"A small table with an open pit on one side.",sizeM:2.0,wallE:0.3,pit:{rect:[0.84,-0.12,1.0,0.12],openS:0},hazards:[]},
  /* the Gemeindehalle's box: a pit near one wall and a pusher opposite it (narrowed in 0.1.12.0, as the tabletop's; smaller again
     and opening at 0:30 from 0.1.17.5) */
  clubbox:{id:"clubbox",name:"Club box",line:"A pit by one wall opens at 0:30; a ram in the wall opposite.",sizeM:2.4,wallE:0.35,pit:{rect:[0.98,-0.17,1.2,0.17],openS:30},
    hazards:[{type:"pusher",rect:[-1.2,-0.3,-0.98,0.3],n:[1,0],kickMs:2.2,J:6,vzMs:0,activeS:0.35,periodS:4,startS:0}]},
  /* the regional arenas (Stahlbrück, Eisenau, Grauwald): the pit opens a third of the way in; two pushers and a floor spinner */
  regional:{id:"regional",name:"Regional arena",line:"A corner pit opens at 0:30; two rams and a floor spinner.",sizeM:2.6,wallE:0.35,pit:{rect:[0.7,0.7,1.3,1.3],openS:30},
    hazards:[{type:"pusher",rect:[-1.3,-0.35,-1.06,0.35],n:[1,0],kickMs:2.4,J:8,vzMs:0,activeS:0.35,periodS:4,startS:0},
      {type:"pusher",rect:[-0.35,-1.3,0.35,-1.06],n:[0,1],kickMs:2.4,J:8,vzMs:0,activeS:0.35,periodS:4,startS:0},
      {type:"spinner",at:[-0.33,0.33],rM:0.16,kickMs:1.6,J:10,vzMs:1.1,spinRad:14,activeS:0.25,periodS:5,startS:0}]},
  /* the three regional venues (0.1.28.0, Kelbo: the arena follows the venue, WORLD.venues[v].arena; the hazards are the same
     three kinds, laid out for the place). look names the vis's dressing for it (vis/arena.js ARENA_LOOK). The "regional"
     arena above stays as the featherweights' test arena and a Sandbox choice. */
  /* Stahlbrück's rolling mill: a slag trough along one wall opens at 0:30; the press in the wall opposite shoves hard but
     slowly; one floor roller; the furnace vent by the fourth wall burns every 9 s from 0:12 (0.1.37) */
  stahl:{id:"stahl",name:"Stahlbrück Mill",line:"A slag trough along one wall opens at 0:30; a heavy press opposite, a floor roller and a furnace vent that burns every 9 s.",look:"mill",sizeM:2.6,wallE:0.3,pit:{rect:[1.06,-0.45,1.3,0.45],openS:30},
    hazards:[{type:"pusher",rect:[-1.3,-0.5,-1.06,0.5],n:[1,0],kickMs:2.8,J:10,vzMs:0,activeS:0.35,periodS:5,startS:0},
      {type:"spinner",at:[0,0.72],rM:0.15,kickMs:1.6,J:10,vzMs:1.1,spinRad:14,activeS:0.25,periodS:5,startS:0},
      FLAME([-0.35,-0.95,0.35,-0.7],12,9)]},
  /* Eisenau's harbour shed: bigger and bouncier (timber fenders); the dock hatch in the middle of one wall opens at 0:20;
     two soft, quick fender rams face each other across the floor; no spinner */
  eisenau:{id:"eisenau",name:"Eisenau Harbour",line:"Bouncy timber fenders; the dock hatch opens early, at 0:20; two quick fender rams.",look:"port",sizeM:2.7,wallE:0.38,pit:{rect:[-0.4,1.03,0.4,1.35],openS:20},
    hazards:[{type:"pusher",rect:[-1.4,-0.65,-1.16,0.05],n:[1,0],kickMs:2.4,J:7,vzMs:0,activeS:0.3,periodS:3.5,startS:0},
      {type:"pusher",rect:[1.16,-0.65,1.4,0.05],n:[-1,0],kickMs:2.4,J:7,vzMs:0,activeS:0.3,periodS:3.5,startS:0}]},
  /* Grauwald's engine shed: the turntable in the middle (a wide, slow floor spinner that turns more than it throws, from
     0:10); a long, thin inspection pit near one wall opens at 0:30; one ram */
  grauwald:{id:"grauwald",name:"Grauwald Engine Shed",line:"The turntable in the middle starts turning at 0:10; a long inspection pit opens at 0:30; one ram.",look:"shed",sizeM:2.6,wallE:0.35,pit:{rect:[-0.95,0.82,-0.25,0.98],openS:30},
    hazards:[{type:"spinner",at:[0,0],rM:0.3,kickMs:0.8,J:3,vzMs:0.5,spinRad:9,activeS:0.5,periodS:6,startS:10},
      {type:"pusher",rect:[1.06,-0.8,1.3,-0.2],n:[-1,0],kickMs:2.4,J:8,vzMs:0,activeS:0.35,periodS:4,startS:0}]},
  /* the Scrapline Open's Eisenhalle: the pit opens at 45 s; pushers on two walls; two floor spinners; a flame grate in the middle burns every 10 s from 0:20 (0.1.37) */
  eisenhalle:{id:"eisenhalle",name:"The Eisenhalle",line:"The pit opens at 0:45; rams on two walls, two floor spinners and a flame grate in the middle that burns every 10 s.",sizeM:2.8,wallE:0.3,pit:{rect:[-0.3,1.0,0.3,1.4],openS:45},
    hazards:[{type:"pusher",rect:[-1.4,-0.4,-1.14,0.4],n:[1,0],kickMs:2.6,J:10,vzMs:0,activeS:0.35,periodS:4,startS:0},
      {type:"pusher",rect:[1.14,-0.4,1.4,0.4],n:[-1,0],kickMs:2.6,J:10,vzMs:0,activeS:0.35,periodS:4,startS:0},
      {type:"spinner",at:[-0.7,-0.75],rM:0.17,kickMs:1.8,J:12,vzMs:1.2,spinRad:14,activeS:0.25,periodS:5,startS:0},
      {type:"spinner",at:[0.7,-0.75],rM:0.17,kickMs:1.8,J:12,vzMs:1.2,spinRad:14,activeS:0.25,periodS:5,startS:0},
      FLAME([-0.3,-0.2,0.3,0.2],20,10)]}
};
const ARENA_IDS=Object.keys(ARENAS);
const JUDGE_WEIGHTS={damage:.5,aggression:.25,control:.25};
