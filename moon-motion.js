/* Deterministic, scroll-scrubbed choreography. The sky arc is art-directed.
 * Contact, displaced volume, ballistic droplets and wave damping share one clock.
 * Projectile reference: openstax.org/books/university-physics-volume-1/pages/4-3-projectile-motion
 * Water entry reference: thales.mit.edu/bush/index.php/2010/03/14/water-entry-and-cavity-dynamics/
 */
(() => {
  'use strict';
  const config=Object.freeze({
    start:.28, impact:.67, rest:.84, radius:31,
    sourceY:290, surfaceY:578, centerX:1230.5, waterRadius:121.5,
    restY:638, secondsPerProgress:3, arcWidth:52
  });
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const ease=v=>{v=clamp(v);return v*v*(3-2*v);};
  const fall=config.surfaceY-config.radius-config.sourceY;
  const flightDuration=(config.impact-config.start)*config.secondsPerProgress;
  const gravity=2*fall/(flightDuration*flightDuration);
  const entrySpeed=gravity*flightDuration;
  // Radial offsets, outward velocity, upward launch speed, radius and release delay.
  const drops=Object.freeze([
    [-21,-67,176,3.1,0],[-13,-38,149,2.1,.018],[-5,-16,169,1.5,.035],
    [7,24,180,2.8,.012],[16,59,166,2.7,.022],[25,42,145,1.9,.030],
    [-27,-35,139,1.6,.045],[29,62,158,2.0,.035]
  ].map(Object.freeze));

  function sample(value) {
    const p=clamp(value);
    const s=clamp((p-config.start)/(config.impact-config.start));
    let x=config.centerX+config.arcWidth*Math.sin(Math.PI*s)**2;
    let y=config.sourceY+fall*s*s;
    const wetTime=(p-config.impact)*config.secondsPerProgress;
    if(p>=config.impact) {
      const u=clamp((p-config.impact)/(config.rest-config.impact));
      const distance=config.restY-(config.surfaceY-config.radius);
      // Hermite entry matches incoming velocity, then dissipates it at the bowl floor.
      const tangent=entrySpeed*(config.rest-config.impact)*config.secondsPerProgress;
      y=config.surfaceY-config.radius+tangent*u+(3*distance-2*tangent)*u*u+(tangent-2*distance)*u*u*u;
      x=config.centerX;
    }
    let rise=0;
    // Spherical-cap volume / free surface area, including its small feedback on immersion.
    for(let i=0;i<4;i++) {
      const h=clamp(y+config.radius-(config.surfaceY-rise),0,2*config.radius);
      rise=h*h*(config.radius-h/3)/(config.waterRadius*config.waterRadius);
    }
    // The moon is already in the daytime sky; lighting changes, never its presence.
    return {p,x,y,radius:config.radius,alpha:1,
      rotation:.22*s,wetTime,waterY:config.surfaceY-rise,
      submerged:clamp((y+config.radius-(config.surfaceY-rise))/(2*config.radius))};
  }

  function droplets(value) {
    const state=sample(value);
    return drops.map(([offset,vx,speed,radius,delay])=>{
      const t=state.wetTime-delay;
      const launchY=sample(config.impact+delay/config.secondsPerProgress).waterY;
      const settledY=config.surfaceY-4*config.radius**3/(3*config.waterRadius**2);
      const life=(speed+Math.sqrt(speed*speed-2*gravity*(launchY-settledY)))/gravity;
      const active=t>0&&t<life;
      return {x:config.centerX+offset+vx*Math.max(0,t),
        y:launchY-speed*Math.max(0,t)+.5*gravity*Math.max(0,t)**2,
        vx,vy:-speed+gravity*Math.max(0,t),radius,active,
        opacity:active?ease(t/.035)*ease((life-t)/.055):0};
    });
  }
  window.MaisonMoonMotion={sample,droplets,config,gravity,entrySpeed};
})();
