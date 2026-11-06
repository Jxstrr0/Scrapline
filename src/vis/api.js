/* ---- vis/api.js: the SCRAP_VIS public object. The app calls these; the vis never reads game state. ---- */
let started=false;
return{
  init(canvas){if(started)return;started=true;V.view="workshop";initRenderer(canvas);rebuild();bindOrbit(canvas);requestAnimationFrame(frame);},
  setQuality(tier){tier=tier==="ultra"||tier==="full"?tier:"lite";if(tier===V.tier&&V.mats)return;V.tier=tier;if(started)rebuild();},
  /* the workshop's bot: an evalBuild() result (null: the placeholder). Cached by build hash; old meshes are disposed */
  setBot(b){const k=b?JSON.stringify(b.cfg):null;if(k===V.botK)return;V.botK=k;V.botB=b||null;if(started&&V.mats)placeBot();},
  /* your sponsors' colours ({side, top}: "#rrggbb" or nothing), on your bot in the workshop and as bot 0 in a fight */
  setPaint(p){const k=JSON.stringify(p||{});if(k===V.paintK)return;V.paintK=k;V.paint=p&&(p.side||p.top)?{side:p.side||null,top:p.top||null}:null;if(started&&V.mats)placeBot();},
  /* {spin, reduce (no camera shake), fxLow (Settings → Effects: Reduced: a few sparks, no flying parts, light smoke)} */
  setRun(o){Object.assign(V.run,o||{});},
  /* "workshop" or "arena" */
  setView(name){V.view=name==="arena"?"arena":"workshop";if(started)showView();},
  /* the fight to draw in the arena view (a SCRAP_SIM fight object; null clears it). The vis reads it, never steps it */
  setFight(F,keep){if(!started)return;if(!F){arenaClear();showView();return;}if(F===AR.F)return;if(keep&&arenaRebind(F))return;buildArena(F);fxInit();showView();},   // keep: a replay seek, same scene
  /* hit feedback: the sim's fx events ({k, x, y, E, v}) and {k:"part", v, key} when a part is destroyed */
  fx(list){if(started&&list&&list.length)fxEvents(list);},
  /* one bot's part states ({key: "intact"|"damaged"|"destroyed"}, from SCRAP_SIM.partStates) */
  damage(i,states){const B=AR.bots[i];if(B)botDamage(B.mesh,states);},
  /* a point on the canvas (CSS px) to the arena floor in sim metres, or null */
  pick(x,y){return arenaPick(x,y);},
  /* the workshop's bot as a picture (a w x h canvas), for the bot card; null without a renderer */
  shot(w,h){return started?shotBot(w,h):null;},
  fps(){return V.fpsObj;},
  get tier(){return V.tier;},
  get view(){return V.view;},
  _state:V,_arena:AR
};
})();
window.SCRAP_VIS=SCRAP_VIS;
</script>
