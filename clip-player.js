/* A paused, seekable film follows scroll; the photo renderer remains underneath. */
(() => {
  'use strict';
  window.MaisonMoonClip = {create(video) {
    if(!video) return null;
    const start=.59, preloadAt=0, tolerance=1/48;
    let loadStarted=false, broken=false, destroyed=false;
    let active=false, suspended=false, inFlight=false, inFlightTarget=0, visible=false;
    let progress=0, paintA=0, paintB=0, paintVersion=0, watchdog=0;
    let downloadController=null, blobURL=null, retryTimer=0, retryFrame=0, badSeeks=0;
    const listeners=[];
    const hide=()=>{video.style.opacity='0';visible=false;};
    const show=()=>{video.style.opacity='1';visible=true;};
    function listen(name, callback) {
      video.addEventListener(name,callback);
      listeners.push([name,callback]);
    }
    function cancelPaint() {
      paintVersion++;
      if(paintA)cancelAnimationFrame(paintA);
      if(paintB)cancelAnimationFrame(paintB);
      paintA=paintB=0;
    }
    function clearWatchdog() {
      if(watchdog)clearTimeout(watchdog);
      watchdog=0;
    }
    function clearRetry() {
      if(retryTimer)clearTimeout(retryTimer);
      if(retryFrame)cancelAnimationFrame(retryFrame);
      retryTimer=retryFrame=0;
    }
    function queuePump(delay=0) {
      if(broken||destroyed||suspended||retryTimer||retryFrame)return;
      const next=()=>{retryFrame=requestAnimationFrame(()=>{retryFrame=0;pump();});};
      if(delay)retryTimer=setTimeout(()=>{retryTimer=0;next();},delay);
      else next();
    }
    function watch(reset=false) {
      if(!active||suspended||broken||destroyed)return;
      if(reset)clearWatchdog();
      if(!watchdog)watchdog=setTimeout(timeout,5000);
    }
    function timeout() {
      if(broken||destroyed)return;
      // A slow network or decoder can still deliver metadata/seeked later.
      // Keep WebGL visible; late metadata or the pending seeked can resume.
      cancelPaint();clearWatchdog();hide();video.pause();
    }
    function fail() {
      if(broken||destroyed)return;
      broken=true;
      inFlight=false;
      cancelPaint();clearRetry();clearWatchdog();hide();video.pause();
    }
    function target() {
      const end=Math.max(0,video.duration-1/30);
      return Math.max(0,Math.min(1,(progress-start)/(1-start)))*end;
    }
    function paint() {
      if(paintA||paintB)return;
      const version=++paintVersion;
      paintA=requestAnimationFrame(()=>{
        paintA=0;
        paintB=requestAnimationFrame(()=>{
          paintB=0;
          if(version!==paintVersion||broken||destroyed||suspended||!active)return;
          if(video.seeking||video.readyState<2){watch();return;}
          if(Math.abs(video.currentTime-target())>tolerance){pump();return;}
          clearWatchdog();show();
        });
      });
    }
    function pump() {
      if(broken||destroyed||suspended||!active||!loadStarted)return;
      watch();
      if(retryTimer||retryFrame)return;
      if(!Number.isFinite(video.duration)||video.duration<=0||inFlight||video.seeking||video.readyState<1)return;
      const wanted=target();
      const prime=video.readyState===1&&video.currentTime===0;
      if(prime||Math.abs(video.currentTime-wanted)>tolerance) {
        cancelPaint();
        inFlight=true;
        watch(true);
        inFlightTarget=prime?Math.max(.001,wanted):wanted;
        try {video.currentTime=inFlightTarget;} catch(_) {fail();}
      } else if(!visible)paint();
      else clearWatchdog();
    }
    function load() {
      if(loadStarted||broken||destroyed)return;
      const source=video.dataset.src;
      if(!source){fail();return;}
      loadStarted=true;
      try {
        downloadController=new AbortController();
        fetch(source,{credentials:'same-origin',signal:downloadController.signal})
          .then(response=>{
            if(!response.ok)throw new Error('Video download failed');
            return response.blob();
          })
          .then(blob=>{
            if(destroyed||broken)return;
            blobURL=URL.createObjectURL(blob);
            video.preload='auto';
            video.src=blobURL;
            video.load();
          })
          .catch(error=>{if(!destroyed&&error?.name!=='AbortError')fail();});
      } catch(_) {fail();}
    }
    function onSeeked() {
      inFlight=false;
      if(suspended)return;
      if(video.readyState<2||Math.abs(video.currentTime-inFlightTarget)>tolerance) {
        badSeeks=Math.min(5,badSeeks+1);
        queuePump(Math.min(1000,80*2**(badSeeks-1)));
      } else {
        badSeeks=0;
        queuePump();
      }
    }
    function onData() {clearRetry();badSeeks=0;pump();}
    listen('loadedmetadata',onData);
    listen('loadeddata',onData);
    listen('seeked',onSeeked);
    listen('error',fail);
    hide();
    return {
      update(value,enabled,position) {
        if(destroyed)return;
        progress=Math.max(0,Math.min(1,value));
        if(position)video.style.objectPosition=position.map(x=>(100*x)+'%').join(' ');
        if(!enabled){this.suspend();return;}
        suspended=false;
        active=progress>=start;
        if(!active){cancelPaint();clearWatchdog();hide();}
        if(progress>=preloadAt)load();
        if(active) {
          if((paintA||paintB)&&Number.isFinite(video.duration)&&Math.abs(video.currentTime-target())>tolerance)cancelPaint();
          pump();
        }
      },
      suspend() {
        if(destroyed)return;
        suspended=true;active=false;
        cancelPaint();clearRetry();clearWatchdog();hide();video.pause();
      },
      destroy() {
        if(destroyed)return;
        suspended=true;active=false;destroyed=true;
        cancelPaint();clearRetry();clearWatchdog();hide();video.pause();
        downloadController?.abort();
        for(const [name,callback] of listeners)video.removeEventListener(name,callback);
        video.removeAttribute('src');video.load();
        if(blobURL)URL.revokeObjectURL(blobURL);
      }
    };
  }};
})();
