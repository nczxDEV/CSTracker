const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function boot({storage=new Map(),settings={welcomeAnimation:true},profile,offline=false,claim=true}={}){
 const timers=new Map(),frames=new Map(),events={},els={},calls=[];let seq=0;
 class E{
  constructor(id){this.id=id;this.hidden=true;this.children=[];this.handlers={};this.classes=new Set();this.classList={add:k=>this.classes.add(k),remove:k=>this.classes.delete(k)};this.offsetWidth=100;}
  set textContent(v){this.text=v;this.children=[];}get textContent(){return this.text||'';}
  addEventListener(k,fn){this.handlers[k]=fn;}replaceChildren(...c){this.children=c;}contains(c){return this.children.includes(c);}focus(){calls.push(['focus',this.id]);}
 }
 for(const id of ['welcome-overlay','welcome-animation-toggle','welcome-setting-status','welcome-avatar','welcome-name','welcome-source','welcome-skip','welcome-preview-btn','launcher'])els[id]=new E(id);
 const document={getElementById:id=>els[id],createElement:()=>new E('img'),activeElement:els.launcher,contains:()=>true,addEventListener:(k,fn)=>events[k]=fn,removeEventListener:k=>delete events[k]};
 const context={document,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},setTimeout:(fn,ms)=>{const id=++seq;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),addEventListener:(k,fn)=>events[k]=fn,OverlaySettingsStore:{loadSettings:()=>({...settings}),saveSettings:s=>Object.assign(settings,s),onSettingsUpdated:fn=>events.settings=fn},__TAURI__:{core:{invoke:async name=>{calls.push(['invoke',name]);return claim;}}}};
 els['welcome-halo']={style:{}};
 context.requestAnimationFrame=fn=>{const id=++seq;frames.set(id,fn);return id;};context.cancelAnimationFrame=id=>frames.delete(id);
 context.performance={now:()=>0};context.window=context;context.CSTrackerAccountReady=Promise.resolve(offline?null:{faceit:profile||null});
 vm.runInNewContext(fs.readFileSync('src/welcome.js','utf8'),vm.createContext(context));
 if(!offline)events['cstracker-account-status']({detail:{faceit:profile||null}});
 return{els,calls,events,settings,storage,context,timers,frames,tick(now){for(const [id,fn] of [...frames]){frames.delete(id);fn(now);}},advance(){for(const [id,timer] of [...timers]){timers.delete(id);timer.fn();}},start:()=>context.WelcomeExperience.start(()=>calls.push(['reveal']))};
}
const player={provider:'faceit',providerUserId:'p1',displayName:'xadez',avatarUrl:'https://example.test/avatar.png'};
async function flush(){for(let i=0;i<5;i++)await Promise.resolve();}
test('welcome shows saved identity for exactly two seconds and releases focus and inert',async()=>{
 const b=boot({profile:player});const done=b.start();await flush();
 assert.equal(b.els['welcome-overlay'].hidden,false);assert.equal(b.els['welcome-name'].textContent,'xadez');assert.equal(b.els['welcome-avatar'].children[0].src,player.avatarUrl);assert.equal(b.els.launcher.inert,true);
 assert.equal([...b.timers.values()][0].ms,2000);b.advance();assert.equal(await done,true);assert.equal(b.els['welcome-overlay'].hidden,true);assert(!b.els.launcher.inert);
 await b.start();assert.equal(b.calls.filter(c=>c[0]==='invoke').length,1);
});
test('disabled preference survives a subsequent boot and is not lost on save',async()=>{
 const settings={welcomeAnimation:true,uiTheme:'glass'};const b=boot({profile:player,settings});b.els['welcome-animation-toggle'].checked=false;b.els['welcome-animation-toggle'].handlers.change();
 assert.equal(settings.welcomeAnimation,false);assert.equal(settings.uiTheme,'glass');const second=boot({profile:player,settings});assert.equal(await second.start(),false);assert.equal(second.els['welcome-overlay'].hidden,true);
});
test('native launch claim prevents replay on WebView reload',async()=>{
 const b=boot({profile:player,claim:false});assert.equal(await b.start(),false);assert.equal(b.timers.size,0);
});
test('offline restart uses presentation metadata only; confirmed logout clears it',async()=>{
 const storage=new Map();boot({profile:{...player,accessToken:'must-not-be-cached'},storage});assert(![...storage.values()].join('').includes('must-not-be-cached'));
 const offline=boot({storage,offline:true});const done=offline.start();await flush();assert.equal(offline.els['welcome-source'].textContent,'Saved profile · offline');offline.advance();await done;
 const logout=boot({storage});assert.equal(await logout.start(),false);assert.equal(storage.size,0);
});
test('Escape and profile change dismiss the greeting and cancel timers',async()=>{
 const b=boot({profile:player});const done=b.start();await flush();b.events.keydown({key:'Escape',preventDefault(){}});await done;assert.equal(b.timers.size,0);
 b.els['welcome-preview-btn'].handlers.click();assert.equal(b.els['welcome-overlay'].hidden,false);b.events['cstracker-account-status']({detail:{faceit:null}});assert.equal(b.els['welcome-overlay'].hidden,true);assert.equal(b.timers.size,0);
});
test('missing image falls back to initials and username is literal text',async()=>{
 const b=boot({profile:{...player,displayName:'<img onerror=evil>'}});const done=b.start();await flush();b.els['welcome-avatar'].children[0].onerror();assert.equal(b.els['welcome-avatar'].textContent,'<I');assert.equal(b.els['welcome-name'].textContent,'<img onerror=evil>');b.advance();await done;
});
test('signed out and no saved account never blocks app startup',async()=>{
 const b=boot();assert.equal(await b.start(),false);assert(b.calls.some(c=>c[0]==='reveal'));assert.equal(b.timers.size,0);
});
test('RGB halo moves between frames and stops when welcome closes',async()=>{
 const b=boot({profile:player});const done=b.start();await flush();b.tick(100);const before=b.els['welcome-halo'].style.transform;b.tick(200);assert.notEqual(b.els['welcome-halo'].style.transform,before);assert.equal(b.frames.size,1);b.advance();await done;assert.equal(b.frames.size,0);
});
