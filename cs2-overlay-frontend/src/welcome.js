/* Local identity presentation only. Provider tokens stay in the backend. */
(() => {
  const overlay=document.getElementById('welcome-overlay');if(!overlay)return;
  const cacheKey='cstracker-welcome-profile-v1',store=window.OverlaySettingsStore;
  const toggle=document.getElementById('welcome-animation-toggle');
  const feedback=document.getElementById('welcome-setting-status');
  let currentStatus=null,hasStatus=false,started=false,finish=null;
  const enabled=()=>store.loadSettings().welcomeAnimation!==false;
  const safeProfile=p=>p?.providerUserId?{provider:p.provider||'',id:String(p.providerUserId),name:String(p.displayName||'Player').slice(0,100),avatar:typeof p.avatarUrl==='string'&&/^https:\/\//i.test(p.avatarUrl)?p.avatarUrl:null}:null;
  const fromStatus=status=>safeProfile(status?.faceit||status?.steam);
  function readCached(){try{const p=JSON.parse(localStorage.getItem(cacheKey));return p&&typeof p.id==='string'&&typeof p.name==='string'?p:null;}catch{return null;}}
  function acceptStatus(status){
    const before=fromStatus(currentStatus),next=fromStatus(status);
    currentStatus=status;hasStatus=true;
    try{if(next)localStorage.setItem(cacheKey,JSON.stringify(next));else localStorage.removeItem(cacheKey);}catch{/* Presentation caching must never block login. */}
    if(finish&&(before?.id!==next?.id||before?.provider!==next?.provider))finish();
  }
  window.addEventListener('cstracker-account-status',event=>acceptStatus(event.detail));
  if(window.CSTrackerAccountStatus)acceptStatus(window.CSTrackerAccountStatus);
  function show(profile,revealApp=()=>{},offline=false){
    if(!profile){revealApp();return Promise.resolve(false);}
    if(finish)finish();
    const avatar=document.getElementById('welcome-avatar'),name=document.getElementById('welcome-name');
    name.textContent=profile.name;
    document.getElementById('welcome-source').textContent=offline?'Saved profile · offline':'Your Player HQ is ready.';
    const fallback=profile.name.trim().slice(0,2).toUpperCase()||'?';avatar.textContent=fallback;
    if(profile.avatar&&/^https:\/\//i.test(profile.avatar)){
      const image=document.createElement('img');image.alt=`${profile.name}'s profile photo`;image.src=profile.avatar;image.referrerPolicy='no-referrer';
      image.onerror=()=>{if(avatar.contains(image))avatar.textContent=fallback;};avatar.replaceChildren(image);
    }
    const launcher=document.getElementById('launcher'),previousFocus=document.activeElement,wasInert=launcher?.inert;
    if(launcher)launcher.inert=true;
    overlay.hidden=false;overlay.classList.remove('welcome-playing');void overlay.offsetWidth;overlay.classList.add('welcome-playing');
    revealApp();document.getElementById('welcome-skip').focus({preventScroll:true});
    return new Promise(resolve=>{
      let timer,frame=0;
      const halo=document.getElementById('welcome-halo'),motionStart=performance.now();
      function animateGlow(now){if(!finish||!halo)return;halo.style.transform=`rotate(${(now-motionStart)*.18}deg)`;frame=requestAnimationFrame(animateGlow);}
      const keydown=event=>{if(event.key==='Escape'){event.preventDefault();done();}else if(event.key==='Tab'){event.preventDefault();document.getElementById('welcome-skip').focus();}};
      const done=()=>{
        if(finish!==done)return;
        clearTimeout(timer);if(frame)cancelAnimationFrame(frame);finish=null;overlay.hidden=true;overlay.classList.remove('welcome-playing');
        if(launcher)launcher.inert=wasInert;
        document.removeEventListener('keydown',keydown);
        if(previousFocus&&document.contains(previousFocus))previousFocus.focus?.({preventScroll:true});
        resolve(true);
      };
      finish=done;document.addEventListener('keydown',keydown);timer=setTimeout(done,2000);
      if(halo)frame=requestAnimationFrame(animateGlow);
    });
  }
  document.getElementById('welcome-skip').addEventListener('click',()=>finish?.());
  async function start(revealApp){
    if(started){revealApp();return false;}started=true;
    try{
      if(window.__TAURI__?.core?.invoke){
        const first=await window.__TAURI__.core.invoke('claim_startup_welcome');
        if(!first){revealApp();return false;}
      }
      if(!enabled()){revealApp();return false;}
      // Bounded startup status check; a failed backend never traps the user.
      if(window.CSTrackerAccountReady)await window.CSTrackerAccountReady;
      const profile=hasStatus?fromStatus(currentStatus):readCached();
      if(!enabled()){revealApp();return false;}
      return await show(profile,revealApp,!hasStatus);
    }catch{revealApp();return false;}
  }
  toggle.checked=enabled();
  toggle.addEventListener('change',()=>{
    try{store.saveSettings({...store.loadSettings(),welcomeAnimation:toggle.checked});feedback.textContent=toggle.checked?'Welcome enabled for the next full launch.':'Welcome disabled. CS Tracker will open directly.';if(!toggle.checked)finish?.();}
    catch{toggle.checked=enabled();feedback.textContent='Could not save this preference. Please retry.';}
  });
  store.onSettingsUpdated(settings=>{toggle.checked=settings.welcomeAnimation!==false;if(!toggle.checked)finish?.();});
  document.getElementById('welcome-preview-btn').addEventListener('click',()=>{
    const profile=hasStatus?fromStatus(currentStatus):readCached();
    if(!profile){feedback.textContent='Connect FACEIT or Steam in Account to preview your personal welcome.';return;}
    show(profile,()=>{},!hasStatus);
  });
  window.WelcomeExperience={start};
})();
