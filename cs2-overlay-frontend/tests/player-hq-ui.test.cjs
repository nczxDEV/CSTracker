const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const M=require('../src/player-hq-model.js');
test('HQ renders an offline profile, filters it, saves objectives, restores them and opens linked demos',async()=>{
 const state=M.empty();state.profiles.player={fetchedAt:'2026-10-30',records:[M.online({matchId:'m1',map:'de_ancient',result:'W',teamScore:13,opponentScore:9,faceitRating:1.3,finishedAt:'2026-10-29'},'player','2026-10-30')]};M.link(state,'faceit:m1','demo',true);
 for(let i=2;i<=12;i++)state.profiles.player.records.push(M.online({matchId:`m${i}`,map:'de_ancient',result:'L'},'player','2026-10-30'));
 const storage=new Map([['cstracker-player-hq-v1',JSON.stringify(state)],['cstracker-player-hq-identity',JSON.stringify({providerUserId:'player',displayName:'Player'})]]),calls=[];
 async function boot(){const els={},events={};class E{
 constructor(id){this.id=id;this.value='';this.handlers={};this.dataset={};this.children=[];this.disabled=false;}
 set innerHTML(value){this.html=value;for(const m of value.matchAll(/id="([^"]+)"/g))els[m[1]]=new E(m[1]);for(const m of value.matchAll(/<details\b([^>]*)>/g)){const id=m[1].match(/id="([^"]+)"/)?.[1];if(id&&els[id])els[id].open=/\bopen\b/.test(m[1]);}if(els['hq-period'])els['hq-period'].value='30';}
 get innerHTML(){return this.html||'';}addEventListener(k,f){this.handlers[k]=f;}replaceChildren(){this.children=[];}append(...a){this.children.push(...a);}
 closest(){return this;}querySelectorAll(selector){return selector.includes('hq-workspace')?Object.values(els).filter(e=>/^hq-(detail|library|maps|evidence|journal)-panel$/.test(e.id)):[];} }
 els['player-hq']=new E('player-hq');const context={document:{getElementById:id=>els[id]||null,createElement:()=>new E()},PlayerHQModel:M,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},crypto:{randomUUID:()=>String(Math.random())},AbortSignal,console,fetch:async path=>{calls.push(['fetch',path]);throw Error('offline');},activateTab:id=>calls.push(['navigate',id]),addEventListener:(type,fn)=>events[type]=fn,__TAURI__:{core:{invoke:async(name,args)=>{calls.push([name,args]);if(name==='list_past_demos')return [{id:'demo',fileName:'test.dem',mapName:'de_ancient',rounds:16,importedAt:1}];return null;}}}};context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync('src/player-hq.js','utf8'),context);els.accountStatus=status=>events['cstracker-account-status']({detail:status});await new Promise(r=>setImmediate(r));return els;}
 let els=await boot();assert(els['hq-matches'].innerHTML.includes('13:9'));assert(els['hq-library'].innerHTML.includes('test.dem'));
 assert(!els['player-hq'].innerHTML.includes('name="hq-workspace"'));assert(!els['hq-account']);
 for(const id of ['hq-detail-panel','hq-library-panel','hq-maps-panel','hq-evidence-panel','hq-journal-panel'])assert.equal(els[id].open,true);
 assert.equal((els['hq-matches'].innerHTML.match(/data-detail=/g)||[]).length,6);assert.equal(els['hq-more'].hidden,false);
 els['hq-more'].onclick();assert.equal((els['hq-matches'].innerHTML.match(/data-detail=/g)||[]).length,12);assert.equal(els['hq-more'].hidden,true);
 els['hq-map'].value='de_nuke';els['hq-map'].oninput();assert(els['hq-matches'].innerHTML.includes('No records'));els['hq-map'].value='';els['hq-map'].oninput();
 assert.equal((els['hq-matches'].innerHTML.match(/data-detail=/g)||[]).length,6);
 await els['player-hq'].handlers.click({target:{closest:()=>({dataset:{link:'faceit:m1'}})}});assert.equal(els['hq-detail-panel'].open,true);
 els['hq-note'].value='Review three opening deaths';els['hq-add-goal'].onclick();assert(els['hq-journal'].innerHTML.includes('Review three opening deaths'));
 assert.equal(els['hq-journal-panel'].open,true);
 assert.equal(els['hq-detail-panel'].open,true);assert.equal(els['hq-library-panel'].open,true);
 els=await boot();assert(els['hq-journal'].innerHTML.includes('Review three opening deaths'));
 await els['player-hq'].handlers.click({target:{closest:()=>({dataset:{open:'demo'}})}});assert(calls.some(([name,args])=>name==='open_player_hq_demo'&&args.id==='demo'));
 els['hq-login'].onclick();assert(calls.some(([name,id])=>name==='navigate'&&id==='tab-account'));
 assert(!els['hq-player']);assert(els['hq-connection'].textContent.includes('not verified'));
 els.accountStatus({faceit:{providerUserId:'player',displayName:'My FACEIT name',avatarUrl:'https://example.test/avatar.png'}});
 assert.equal(els['hq-name'].textContent,'My FACEIT name');assert.equal(els['hq-login'].textContent,'Account');assert.equal(els['hq-refresh'].disabled,false);
 els.accountStatus({faceit:null,steam:{providerUserId:'steam-id'}});
 assert.equal(els['hq-login'].textContent,'Log in');assert.equal(els['hq-refresh'].disabled,true);assert(!els['hq-matches'].innerHTML.includes('13:9'));assert(!storage.has('cstracker-player-hq-identity'));
 els.accountStatus({faceit:{providerUserId:'new-id',displayName:'New player'}});await new Promise(r=>setImmediate(r));
 assert.equal(calls.filter(([name,path])=>name==='fetch'&&path.endsWith('/new-id/faceit-match-history')).length,1);
 els.accountStatus({faceit:{providerUserId:'new-id',displayName:'New player'}});await new Promise(r=>setImmediate(r));
 assert.equal(calls.filter(([name,path])=>name==='fetch'&&path.endsWith('/new-id/faceit-match-history')).length,1);
});
