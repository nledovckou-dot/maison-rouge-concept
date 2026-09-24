/* The curtain opens once. Day, moon and water then follow native page scroll. */
(() => {
  'use strict';
  const root=document.documentElement, body=document.body;
  root.dataset.sceneController='ready';
  const story=document.querySelector('.hero-story');
  const hero=document.querySelector('.hero');
  const copy=document.querySelector('.hero__copy');
  const photo=document.querySelector('.hero__room');
  const curtainCanvas=document.querySelector('.intro__fabric');
  const heroCanvas=document.querySelector('.hero__vfx');
  const clipVideo=document.querySelector('.hero__clip');
  const skip=document.querySelector('.scene-skip');
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const local=['127.0.0.1','localhost'].includes(location.hostname);
  const query=new URLSearchParams(location.search);
  const previewValue=local?query.get('scene-progress'):null;
  const clamp=x=>Math.max(0,Math.min(1,x));
  const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
  const preview=previewValue===null?null:clamp(Number(previewValue)||0);
  let curtain=null, scene=null, clip=null, curtainFrame=0, sceneFrame=0;
  let introDone=false, introStart=0, hiddenAt=0, current=0, enabled=false, failed=false;

  function position() {
    return getComputedStyle(photo).objectPosition.split(' ').map(value=>Number.parseFloat(value)/100);
  }
  function progress() {
    if(preview!==null) return preview;
    const distance=story.offsetHeight-hero.clientHeight;
    return distance>0?clamp(-story.getBoundingClientRect().top/distance):0;
  }
  function draw() {
    sceneFrame=0;
    current=enabled?progress():0;
    const day=1-smooth((current-.13)/.17);
    const night=smooth((current-.92)/.075);
    const visible=Math.max(day,night);
    root.style.setProperty('--story-progress',current.toFixed(5));
    root.style.setProperty('--day-title',day.toFixed(4));
    root.style.setProperty('--night-title',night.toFixed(4));
    root.style.setProperty('--scene-copy',visible.toFixed(4));
    root.style.setProperty('--scene-shade',(.48+.38*visible).toFixed(4));
    root.style.setProperty('--story-hint',(1-smooth((current-.06)/.12)).toFixed(4));
    copy.inert=!introDone||visible<.08;
    root.classList.toggle('scene-copy-ready',introDone&&visible>=.08);
    if(scene&&enabled) scene.render(current,position());
    clip?.update(current,enabled&&!reduced.matches&&!document.hidden,position());
  }
  function queue() {
    if(!sceneFrame&&!document.hidden) sceneFrame=requestAnimationFrame(draw);
  }
  function renderCurtain(seconds) {
    const opening=clamp((seconds-1)/4.5);
    root.style.setProperty('--curtain-p',opening.toFixed(5));
    root.style.setProperty('--intro-title',(1-smooth((seconds-.75)/.75)).toFixed(4));
    root.style.setProperty('--fabric-opacity',(1-smooth((seconds-5.55)/.65)).toFixed(4));
    root.style.setProperty('--scene-nav',smooth((seconds-4.7)/1.4).toFixed(4));
    curtainCanvas.dataset.frame=seconds.toFixed(2);
    curtain?.render(opening,seconds);
  }
  function openRoom() {
    if(introDone) return;
    introDone=true;
    cancelAnimationFrame(curtainFrame);
    root.style.setProperty('--fabric-opacity','0');
    root.style.setProperty('--scene-nav','1');
    root.classList.add('scene-open','scene-complete');
    body.classList.add('entered','intro-done');
    skip.hidden=true;
    curtain?.destroy(); curtain=null;
    draw();
  }
  function introTick(now) {
    if(introDone||document.hidden) return;
    const seconds=(now-introStart)/1000;
    if(seconds>=6.2) {openRoom();return;}
    renderCurtain(seconds);
    curtainFrame=requestAnimationFrame(introTick);
  }
  function resize() {
    if(clipVideo) {
      const scale=Math.max(hero.clientWidth/1672,hero.clientHeight/941);
      const [x,y]=position();
      Object.assign(clipVideo.style,{
        width:(448*scale)+'px',height:(550*scale)+'px',
        left:(1024*scale-(1672*scale-hero.clientWidth)*x)+'px',
        top:(350*scale-(941*scale-hero.clientHeight)*y)+'px'
      });
    }
    curtain?.resize(innerWidth,innerHeight,devicePixelRatio);
    scene?.resize(hero.clientWidth,hero.clientHeight,devicePixelRatio);
    queue();
  }
  function staticScene() {
    clip?.suspend();
    enabled=false;
    root.classList.remove('scroll-scene','has-hero-vfx');
    openRoom();
    draw();
  }
  function loadImage(src) {
    const image=new Image();
    return new Promise((resolve,reject)=>{
      image.addEventListener('load',()=>resolve(image),{once:true});
      image.addEventListener('error',reject,{once:true});
      image.src=src;
      if(image.complete&&image.naturalWidth) resolve(image);
    });
  }
  function ready(image) {
    if(image.complete&&image.naturalWidth) return Promise.resolve(image);
    return new Promise((resolve,reject)=>{
      image.addEventListener('load',()=>resolve(image),{once:true});
      image.addEventListener('error',reject,{once:true});
    });
  }

  skip.addEventListener('click',openRoom);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')openRoom();});
  document.addEventListener('focusin',event=>{
    if(!introDone&&event.target!==skip&&event.target.closest('a,button,input,summary'))openRoom();
  });
  window.addEventListener('scroll',()=>{
    if(scrollY>4&&!introDone)openRoom();
    queue();
  },{passive:true});
  window.addEventListener('resize',resize,{passive:true});
  window.addEventListener('pageshow',queue);
  window.addEventListener('hashchange',()=>{openRoom();queue();});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden) {
      clip?.suspend();
      hiddenAt=performance.now();
      cancelAnimationFrame(curtainFrame);
      cancelAnimationFrame(sceneFrame); sceneFrame=0;
    } else {
      if(!introDone&&introStart) {
        if(hiddenAt)introStart+=performance.now()-hiddenAt;
        curtainFrame=requestAnimationFrame(introTick);
      }
      hiddenAt=0;
      queue();
    }
  });
  reduced.addEventListener('change',event=>{
    if(event.matches)staticScene();
    else if(scene&&!failed) {
      enabled=true;root.classList.add('scroll-scene','has-hero-vfx');resize();
    }
  });
  curtainCanvas.addEventListener('maisoncurtainerror',()=>{
    root.classList.remove('has-cloth-vfx');curtain=null;openRoom();
  });
  heroCanvas.addEventListener('webglcontextlost',event=>{
    event.preventDefault();failed=true;scene=null;staticScene();
  });
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(resize).observe(hero);
  copy.inert=true;
  if(reduced.matches) {staticScene();return;}
  clip=window.MaisonMoonClip?.create(clipVideo);

  // Reserve the scroll distance before the browser resolves section links.
  root.classList.add('scroll-scene');
  let fabric,lunar,night;
  const assets=Promise.allSettled([
    ready(photo),
    loadImage('assets/curtain.webp').then(image=>{fabric=image;}),
    loadImage('assets/moon.webp').then(image=>{lunar=image;}),
    loadImage('assets/hero-night-water.jpg').then(image=>{night=image;})
  ]);
  const timeout=setTimeout(()=>{failed=true;staticScene();},8000);
  assets.then(()=>{
    clearTimeout(timeout);
    if(failed||reduced.matches)return;
    try {
      if(lunar&&night&&photo.naturalWidth)scene=window.MaisonHeroScene?.create(heroCanvas,photo,lunar,night);
      if(!scene){failed=true;staticScene();return;}
      enabled=true;
      root.classList.add('scroll-scene','has-hero-vfx');
      if(!introDone&&fabric)curtain=window.MaisonCurtain?.create(curtainCanvas,fabric);
      root.classList.toggle('has-cloth-vfx',Boolean(curtain));
      resize();draw();
      if(preview!==null||location.hash||scrollY>4||!curtain)openRoom();
      if(!introDone) {
        introStart=performance.now();
        if(document.hidden)hiddenAt=introStart;
        else curtainFrame=requestAnimationFrame(introTick);
      }
    } catch (_) {failed=true;staticScene();}
  });
})();
