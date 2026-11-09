// Shared match window for Player Summary and Player HQ. One view and bounded cache.
(() => {
 const root=document.getElementById('ms-root'),params=new URLSearchParams(location.search);
 const matchId=params.get('matchId'),identifier=params.get('identifier')||'-',KEY='cstracker-match-details-v2';
 let snapshot=null,group='Summary',status='',busy=false,demoStats=null,demoStatus='';
 async function loadDemoStats(){
  demoStats=null;demoStatus='';const id=linkedDemo();if(!id)return;
  try{demoStats=await window.__TAURI__.core.invoke('player_hq_demo_metrics',{id});if(!demoStats.playerStats?.length)demoStatus='Linked demo needs re-importing for detailed ratings.';}catch{demoStatus='Linked demo statistics could not be loaded.';}
 }
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function cache(){try{return JSON.parse(localStorage.getItem(KEY))||{};}catch{return {};}}
 function legacy(){try{return JSON.parse(localStorage.getItem('cstracker-player-hq-v1'))?.details?.['faceit:'+matchId]||null;}catch{return null;}}
 function linkedDemo(){try{return JSON.parse(localStorage.getItem('cstracker-player-hq-v1'))?.links?.['faceit:'+matchId]?.demoId;}catch{return null;}}
 function paint(){
  root.innerHTML=`<div class="mv-toolbar"><span role="status">${esc(status)}${demoStatus?' · '+esc(demoStatus):''}</span><button id="ms-refresh" ${busy?'disabled':''}>Refresh</button>${linkedDemo()?'<button id="ms-replay">Open linked demo</button>':''}</div>`+(snapshot?window.MatchView.render(window.MatchRatings?window.MatchRatings.enrich(snapshot.data,demoStats):snapshot.data,group):'<div class="mv-empty">'+esc(status||'Loading match statistics…')+'</div>');
  window.MatchReview?.mount(root,matchId,linkedDemo());
  root.querySelector('#ms-refresh').onclick=()=>load(true);
  root.querySelectorAll('[data-group]').forEach(b=>b.onclick=()=>{group=b.dataset.group;paint();});
  const replay=root.querySelector('#ms-replay');if(replay)replay.onclick=async()=>{try{await window.__TAURI__.core.invoke('open_player_hq_demo',{id:linkedDemo(),round:null});}catch(e){status=String(e);paint();}};
 }
 async function load(force=false){
  if(!matchId){status='Missing match ID';paint();return;}
  if(busy)return;
  busy=true;await loadDemoStats();busy=false;
  snapshot=cache()[matchId]||legacy();
  if(!force&&snapshot?.data?.schemaVersion===2&&Date.now()-Date.parse(snapshot.fetchedAt)<600000){status='Cached FACEIT snapshot · '+new Date(snapshot.fetchedAt).toLocaleString();paint();return;}
  busy=true;status=snapshot?'Refreshing cached match…':'Loading match statistics…';paint();
  try{
   const response=await fetch(`http://localhost:3000/players/${encodeURIComponent(identifier)}/faceit-match-history/${encodeURIComponent(matchId)}`,{signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw new Error('Match request failed ('+response.status+')');
   const data=await response.json();if(!data?.teamA||!data?.teamB)throw new Error('Incomplete match response');
   snapshot={data,fetchedAt:data.fetchedAt||new Date().toISOString()};
   status='FACEIT Data API · fetched '+new Date(snapshot.fetchedAt).toLocaleString();
   try{const entries=cache();entries[matchId]=snapshot;const bounded=Object.fromEntries(Object.entries(entries).sort((a,b)=>Date.parse(b[1].fetchedAt)-Date.parse(a[1].fetchedAt)).slice(0,20));localStorage.setItem(KEY,JSON.stringify(bounded));}catch{status+=' · Could not save offline copy';}
  }catch(e){status=snapshot?'Offline / refresh failed · cached '+new Date(snapshot.fetchedAt).toLocaleString():e.message;}
  finally{busy=false;paint();}
 }
 document.title='Match Summary - CS Tracker';load();
})();
