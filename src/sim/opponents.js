/* ---- opponents.js: OPPONENTS (plan 8d), named bots across the classes, each with a build in the player's config format
   (cfg; its cls is the entry's; a few turn the tuning dials, 0.1.33), a driver {style (AI_STYLES), skill 0..1}, where it comes from (a WORLD venue key: club,
   stahl, eisenau, grauwald, eisenhalle) and a one-line personality. 15 in PR 4b, growing toward 40 as content. META_WAVES (PR 8)
   decides which turn up each season. opponentCfg(op) is its build with the class filled in. Then the SCRAP_SIM export
   object. ---- */
const OPPONENTS=[
  /* antweights: the tabletop at club meets */
  {id:"zahnrad",name:"Zahnrad",cls:"ant",from:"club",driver:{style:"keepaway",skill:0.45},
    line:"Cut from a watch-case blank by an apprentice who should have been finishing bezels. Spins up before the bell, every time.",
    cfg:{chassis:"hdpe",armour:{front:"steel",back:"hdpe10",left:"hdpe10",right:"hdpe10",top:"hdpe15"},drive:"dual",wheels:"rubber",battery:"large",electronics:"dual",weapon:"vsp",weaponMaterial:"steel",extras:[]}},
  {id:"kiesel",name:"Kiesel",cls:"ant",from:"club",driver:{style:"hazard",skill:0.4},
    line:"Doesn't hit you. Just keeps walking you toward the edge, like a pebble in a shoe.",
    cfg:{chassis:"hdpe",armour:{front:"steel",back:"steel",left:"ar500",right:"ar500",top:"steel"},drive:"gearbox",wheels:"pu",battery:"large",electronics:"dual",weapon:"wedge",weaponMaterial:"steel",extras:["skid"]}},
  /* beetleweights: the Gemeindehalle's club box */
  {id:"feierabend",name:"Feierabend",cls:"beetle",from:"club",driver:{style:"cautious",skill:0.55},
    line:"Waits for the disc to sing, takes one swing, then clocks off early. Has never once stayed late.",
    cfg:{chassis:"hdpe",armour:{front:"hdpe15",back:"hdpe10",left:"hdpe10",right:"hdpe10",top:"hdpe6"},drive:"dual",wheels:"solid",battery:"large",electronics:"dual",weapon:"hsp",weaponMaterial:"steel",extras:["selfright"]}},
  {id:"holzwurm",name:"Holzwurm",cls:"beetle",from:"club",driver:{style:"aggressive",skill:0.6},
    line:"Low, quick and always eating something. Started life as a plywood offcut and holds a grudge about it.",
    cfg:{chassis:"hdpe",armour:{front:"steel",back:"hdpe10",left:"hdpe10",right:"hdpe10",top:"hdpe15"},drive:"dual",wheels:"rubber",battery:"large",electronics:"dual",weapon:"under",weaponMaterial:"steel",extras:[]}},
  {id:"kehrschaufel",name:"Kehrschaufel",cls:"beetle",from:"club",driver:{style:"boxrush",skill:0.5},
    line:"A dustpan with opinions, low on small wheels. Sweeps you into the corner and leans on you until the clock runs out.",
    cfg:{chassis:"steel",armour:{front:"ar500",back:"hdpe15",left:"ar500",right:"ar500",top:"hdpe15"},drive:"gearbox",wheels:"pu",battery:"large",electronics:"dual",weapon:"wedge",weaponMaterial:"steel",extras:["skid"],tune:{wheel:-1,bias:-1}}},
  {id:"schraubstock",name:"Schraubstock",cls:"beetle",from:"stahl",driver:{style:"aggressive",skill:0.6},
    line:"Built in a Stahlbrück tool room by people who measure in hundredths. Bites, holds, and doesn't apologise.",
    cfg:{chassis:"alu",armour:{front:"steel",back:"hdpe15",left:"ar500",right:"ar500",top:"steel"},drive:"dual",wheels:"rubber",battery:"large",electronics:"dual",weapon:"crusher",weaponMaterial:"steel",extras:[]}},
  /* hobbyweights: the club box, scaled up */
  {id:"uhrwerk",name:"Uhrwerk",cls:"hobby",from:"club",driver:{style:"aggressive",skill:0.6},
    line:"A drum geared like a tower clock. It never hurries and it never stops.",
    cfg:{chassis:"hdpe",armour:{front:"steel",back:"hdpe10",left:"hdpe15",right:"hdpe15",top:"hdpe10"},drive:"dual",wheels:"rubber",battery:"large",electronics:"dual",weapon:"drum",weaponMaterial:"steel",extras:[]}},
  {id:"faehrmann",name:"Fährmann",cls:"hobby",from:"eisenau",driver:{style:"hazard",skill:0.6},
    line:"From the Eisenau docks. Picks you up and carries you to the pit, unhurried, like freight.",
    cfg:{chassis:"hdpe",armour:{front:"steel",back:"hdpe15",left:"steel",right:"steel",top:"hdpe15"},drive:"gearbox",wheels:"pu",battery:"large",electronics:"dual",weapon:"lifter",weaponMaterial:"steel",extras:[]}},
  {id:"prellbock",name:"Prellbock",cls:"hobby",from:"grauwald",driver:{style:"boxrush",skill:0.55},
    line:"A buffer stop from the Grauwald yards, on small wheels with lead in the tail. No weapon, no hurry, no give. You'll meet the wall eventually.",
    cfg:{chassis:"steel",armour:{front:"ar500",back:"ar500",left:"ar500",right:"ar500",top:"steel"},drive:"gearbox",wheels:"solid",battery:"large",electronics:"failsafe",weapon:"none",weaponMaterial:"steel",extras:["skid"],tune:{wheel:-1,bias:-2}}},
  /* featherweights: the regional arenas */
  {id:"walzwerk",name:"Walzwerk",cls:"feather",from:"stahl",driver:{style:"aggressive",skill:0.7},
    line:"A rolling mill on wheels. Feeds you in at one end and doesn't much care what comes out.",
    cfg:{chassis:"hdpe",armour:{front:"ar500",back:"hdpe10",left:"hdpe15",right:"hdpe15",top:"hdpe10"},drive:"dual",wheels:"rubber",battery:"large",electronics:"dual",weapon:"drum",weaponMaterial:"s7",extras:[]}},
  {id:"hochofen",name:"Hochofen",cls:"feather",from:"stahl",driver:{style:"cautious",skill:0.7},
    line:"Takes its time getting hot. Once it is, the regional crews start finding reasons to be in the car park.",
    cfg:{chassis:"hdpe",armour:{front:"steel",back:"hdpe10",left:"hdpe10",right:"hdpe10",top:"hdpe15"},drive:"dual",wheels:"rubber",battery:"hd",electronics:"dual",weapon:"vsp",weaponMaterial:"s7",extras:[]}},
  {id:"nachtschicht",name:"Nachtschicht",cls:"feather",from:"grauwald",driver:{style:"counter",skill:0.7},
    line:"Built on night shifts in a Grauwald signal box. Patient, quiet, and then very loud, once.",
    cfg:{chassis:"alu",armour:{front:"ar500",back:"hdpe15",left:"ar500",right:"ar500",top:"steel"},drive:"dual",wheels:"rubber",battery:"large",electronics:"dual",weapon:"hammer",weaponMaterial:"steel",extras:[]}},
  /* heavyweights: the Eisenhalle */
  {id:"glockenschlag",name:"Glockenschlag",cls:"heavy",from:"eisenhalle",driver:{style:"opportunist",skill:0.8},
    line:"The Open's favourite. Rings once on the hour, and on whoever looks most dented.",
    cfg:{chassis:"hdpe",armour:{front:"ar500",back:"hdpe10",left:"hdpe10",right:"hdpe10",top:"hdpe15"},drive:"dual",wheels:"rubber",battery:"hd",electronics:"dual",weapon:"vsp",weaponMaterial:"s7",extras:[]}},
  {id:"lawine",name:"Lawine",cls:"heavy",from:"eisenhalle",driver:{style:"hazard",skill:0.8},
    line:"A flipper from the high valleys. Starts small, picks up speed, and ends with you somewhere you didn't choose.",
    cfg:{chassis:"alu",armour:{front:"ar500",back:"hdpe15",left:"steel",right:"steel",top:"hdpe15"},drive:"dual",wheels:"pu",battery:"large",electronics:"dual",weapon:"flipper",weaponMaterial:"steel",extras:[]}},
  {id:"zange",name:"Zange",cls:"heavy",from:"eisenhalle",driver:{style:"counter",skill:0.75},
    line:"Blacksmith's tongs, televised. Lets you come to it, then holds on long after it's polite.",
    cfg:{chassis:"steel",armour:{front:"ar500",back:"hdpe10",left:"steel",right:"steel",top:"hdpe15"},drive:"gearbox",wheels:"rubber",battery:"large",electronics:"dual",weapon:"crusher",weaponMaterial:"steel",extras:[]}}
];
const opponentCfg=op=>Object.assign({},op.cfg,{cls:op.cls});
return{rng,rRange,rInt,rPick,CLASSES,CLASS_IDS,classMult,PARTS,FACES,part,DISC_PROFILES,MINIBOT,normDisc,sameDisc,DEFAULT_CFG,TEST_BUILDS,TUNE,TUNE_IDS,normTune,normCfg,unknownIds,cellOn,footprints,placeOk,autoLayout,K,evalBuild,fitBill,sameParts,OWN_FRONT,COMBOS,stressReport,WEDGE_GAUGES,BENCH,BENCH_TESTS,runBench,benchPartName,STEP_HZ,WEDGE_RULES,FIGHT,newFight,stepFight,runFight,replayFight,fightResult,packInputs,unpackInputs,zoneTouch,faceAt,toWorld,weaponZone,PART_STATES,DAMAGE,damageState,hitOrder,hitFace,landHit,damageEffects,damageTaken,partStates,damageShare,AI_STYLES,AI_STYLE_IDS,AI_SKILL,autoStyle,ARENAS,ARENA_IDS,JUDGE_WEIGHTS,OPPONENTS,opponentCfg,arenaOf,pitOpen};
})();
if(typeof module!=="undefined"&&module.exports)module.exports=SCRAP_SIM;
</script>
