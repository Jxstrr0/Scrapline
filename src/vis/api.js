/* ---- vis/api.js: the SERVO_VIS public object. The app calls these; the vis never reads game state. ---- */
let started=false;
return{
  init(canvas){if(started)return;started=true;initRenderer(canvas);rebuild();bindOrbit(canvas);requestAnimationFrame(frame);},
  setQuality(tier){tier=tier==="ultra"||tier==="full"?tier:"lite";if(tier===V.tier&&V.bot)return;V.tier=tier;if(started)rebuild();},
  setBot(cfg){/* PR 5: rebuild the parametric bot from the build, cached by build hash */},
  setRun(o){Object.assign(V.run,o||{});},
  setView(name){/* PR 5: "workshop", "arena", "replay" */},
  fps(){return V.fpsObj;},
  get tier(){return V.tier;},
  _state:V
};
})();
window.SERVO_VIS=SERVO_VIS;
</script>
