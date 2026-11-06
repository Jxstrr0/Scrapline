/* ===================== app/controls.js: driving =====================
   Two schemes, picked in Settings: direct (left-thumb stick, right-thumb weapon button, swapped when left-handed) and
   tactical (tap where to go, tap the opponent to attack, tap your bot to back off). Both produce the same per-step
   {throttle, steer, weapon, selfRight}. Multi-touch by pointerId with setPointerCapture; keyboard WASD + space + R;
   gamepad. ASSISTS by driver skill. Arrives in PR 5 (plan section 9). */
const CONTROLS={read(){return{throttle:0,steer:0,weapon:0,selfRight:0};}};
