(() => {
  const root=document.getElementById('player-hq');if(!root)return;
  const M=window.PlayerHQModel,KEY='cstracker-player-hq-v1',BASE='http://localhost:3000';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const invoke=(name,args)=>window.__TAURI__?.core?.invoke(name,args)??Promise.reject(new Error('Open the desktop app to access local demos.'));
  let state,storageError='',demos=[],identifier='',busy=false,selectedDemo=null,request=0,visibleMatches=6,faceit=null,identityKnown=false,loadVersion=0;
  const refreshTimes=new Map(),IDENTITY_KEY='cstracker-player-hq-identity';
  try{state=M.migrate(JSON.parse(localStorage.getItem(KEY)));}catch(e){state=M.empty();storageError=e.message;}
  const persist=()=>{if(storageError)throw new Error(storageError);try{localStorage.setItem(KEY,JSON.stringify(state));}catch{throw new Error('Local storage is full or unavailable. The previous saved snapshot is preserved; current edits are only in memory.');}};
  const $=id=>document.getElementById(id),fmt=(v,s='')=>v==null?'N/A':`${v.toFixed(1)}${s}`;
  const message=t=>$('hq-status').textContent=t;
  const profile=()=>state.profiles[identifier.toLowerCase()];
  root.innerHTML=`<div class="hq-hero"><div><span class="hq-eyebrow">YOUR PROGRESS</span><h1>Player HQ</h1></div></div>
    <div class="hq-controls hq-identity" id="hq-identity"><span id="hq-avatar" class="hq-avatar">?</span><div class="hq-identity-name"><small id="hq-role" hidden></small><strong id="hq-name">Checking account…</strong><br><small id="hq-connection">FACEIT connection</small></div><div class="hq-rank"><span id="hq-level">FACEIT · N/A</span><strong id="hq-elo">— ELO</strong></div><button id="hq-login" class="hq-primary">Log in</button></div>
    <div class="hq-status" id="hq-status" role="status"></div>
    <details class="hq-disclosure hq-filters" id="hq-filter-panel"><summary><span>Filters & data</span><small id="hq-filter-summary">All matches</small></summary><div class="hq-disclosure-body">
    <div class="hq-controls"><label>From<input type="date" id="hq-from"></label><label>Through<input type="date" id="hq-to"></label><label>Map<select id="hq-map"><option value="">All maps</option></select></label><label>Teammate<input id="hq-teammate" placeholder="Name contains…"></label><label>Comparison periods<select id="hq-period"><option value="7">7 days vs previous 7</option><option value="30" selected>30 days vs previous 30</option><option value="90">90 days vs previous 90</option></select></label><button id="hq-reset-filters">Reset filters</button></div>
    <small>Dates use match timestamps; undated demos appear in the local library. Side filters apply to demo rounds only. Online history is limited to the records returned by FACEIT.</small>
    <p><small id="hq-freshness"></small></p><button id="hq-refresh">Refresh online</button></div></details>
    <div id="hq-cards" class="hq-cards"></div>
    <section class="hq-section hq-match-section"><div class="hq-section-heading"><h2>Matches</h2><small id="hq-match-count"></small></div><div id="hq-matches" class="hq-scroll"></div><button id="hq-more" hidden>Show more matches</button></section>
    <div class="hq-secondary">
    <details class="hq-disclosure" id="hq-detail-panel" open><summary><span>Match details</span><small>Roster & performance</small></summary><div class="hq-disclosure-body" id="hq-detail">Select a match to inspect its cached or online details.</div></details>
    <details class="hq-disclosure" id="hq-library-panel" open><summary><span>Local demos</span><small id="hq-demo-count">Review queue</small></summary><div class="hq-disclosure-body"><button id="hq-demos">Refresh local demos</button><div id="hq-library"></div></div></details>
    <details class="hq-disclosure" id="hq-maps-panel" open><summary><span>Map strengths</span><small>Performance by map</small></summary><div class="hq-disclosure-body" id="hq-maps"></div></details>
    <details class="hq-disclosure" id="hq-evidence-panel" open><summary><span>Demo analysis</span><small>Openings, trades & utility</small></summary><div class="hq-disclosure-body" id="hq-evidence">Choose Analyze next to a local demo. No automatic match or player matching.</div></details>
    <details class="hq-disclosure" id="hq-journal-panel" open><summary><span>Journal & weekly objectives</span><small id="hq-journal-count">Practice & notes</small></summary><div class="hq-disclosure-body"><p>Journal entries belong to the loaded player. Suggestions require your acceptance.</p><textarea id="hq-note" placeholder="What did you learn? What will you practise?"></textarea><div class="hq-controls"><button id="hq-add-note">Save journal note</button><button id="hq-add-goal">Create weekly objective</button></div><div id="hq-journal"></div></div></details></div>`;
  function reveal(id){
    $(id).open=true;$(id).scrollIntoView?.({behavior:'smooth',block:'nearest'});
  }
  const records=()=>M.filter(profile()?.records||[],{from:$('hq-from').value,to:$('hq-to').value,map:$('hq-map').value,teammate:$('hq-teammate').value});
  function render(){
    const p=profile(),rows=records(),all=M.aggregate(rows),days=Number($('hq-period').value);
    const otherFilters={map:$('hq-map').value,teammate:$('hq-teammate').value};
    const comparison=M.compare(M.filter(p?.records||[],otherFilters),days);
    const change=(key,suffix)=>comparison.recent[key]==null||comparison.baseline[key]==null?'No comparable baseline':`${fmt(comparison.recent[key]-comparison.baseline[key],suffix)} change; ${comparison.recent.matches} vs ${comparison.baseline.matches} matches`;
    $('hq-freshness').textContent=p?`FACEIT API snapshot: ${new Date(p.fetchedAt).toLocaleString()} · ${p.records.length} matches cached on this PC. Refresh is manual (minimum 60 seconds).`:'Log in with FACEIT or inspect a local demo to begin.';
    const activeFilters=[$('hq-from').value,$('hq-to').value,$('hq-map').value,$('hq-teammate').value].filter(Boolean).length;
    $('hq-filter-summary').textContent=activeFilters?`${activeFilters} active · ${rows.length} matches`:'All matches';
    $('hq-match-count').textContent=`${Math.min(visibleMatches,rows.length)} of ${rows.length} · FACEIT API`;
    $('hq-demo-count').textContent=`${demos.length} saved locally`;
    $('hq-more').hidden=rows.length<=visibleMatches;
    $('hq-cards').innerHTML=[['Matches',all.matches,'Filtered online records; incomplete results excluded from win rate.'],['Win rate',fmt(all.winRate,'%'),`${all.resultSample} completed results · ${change('winRate',' percentage points')}`],['FACEIT rating',fmt(all.rating),`Mean of ${all.ratingSample} provider-supplied values · ${change('rating','')}`],['K/D',fmt(all.kd),`${all.kdSample} records with kills/deaths; total kills ÷ total deaths`]].map(([label,v,note])=>`<div class="hq-card"><small>${label}</small><strong class="hq-value">${v}</strong><details class="hq-metric-info"><summary>Details</summary><small>${esc(note)}</small></details></div>`).join('');
    $('hq-matches').innerHTML=rows.length?`<table><thead><tr><th>Opponent</th><th>Map / played</th><th>Result</th><th>Rating</th><th>Local replay</th></tr></thead><tbody>${rows.slice(0,visibleMatches).map(r=>`<tr><td><button data-detail="${esc(r.id)}">${esc(r.label)}</button></td><td>${esc(r.map||'Unknown map')}<br><small>${r.playedAt?esc(new Date(r.playedAt).toLocaleDateString()):'Date unavailable'}</small></td><td>${r.result||'—'} ${esc(r.score)}</td><td>${r.rating==null?'N/A':r.rating.toFixed(2)}</td><td>${state.links[r.id]?`<button data-open="${esc(state.links[r.id].demoId)}">Replay ↗</button><button data-unlink="${esc(r.id)}">Unlink</button>`:`<button data-link="${esc(r.id)}">Link demo…</button>`}</td></tr>`).join('')}</tbody></table>`:'<p class="hq-empty">No records match these filters. Load a player to fetch recent history.</p>';
    const maps=[...new Set(rows.map(r=>r.map).filter(Boolean))];
    $('hq-maps').innerHTML=maps.map(map=>{const a=M.aggregate(rows.filter(r=>r.map===map));return `<div class="hq-note"><strong>${esc(map)}</strong> · ${fmt(a.winRate,'%')} wins<br><small>${a.resultSample} completed results · FACEIT API · selected date range${a.resultSample<5?' · small sample':''}</small></div>`;}).join('')||'Map data unavailable for this selection.';
    $('hq-library').innerHTML=demos.map(d=>`<div class="hq-note"><strong>${esc(d.fileName)}</strong> <span class="hq-tag">Local demo</span><br><small>${esc(d.mapName)} · ${d.rounds} rounds · imported ${esc(new Date(d.importedAt*1000).toLocaleString())}<br>Match date unavailable; import date is not a match date.</small><div class="hq-controls"><button data-open="${esc(d.id)}">Open replay</button><button data-analyze="${esc(d.id)}">Analyze</button></div></div>`).join('')||'No cached demos. Import a demo in Demo Studio first.';
    renderJournal();
  }
  function renderJournal(){
    const entries=state.journal.filter(j=>j.profile===identifier.toLowerCase());
    $('hq-journal-count').textContent=entries.length?`${entries.filter(j=>j.kind==='Weekly objective'&&!j.done).length} active objectives · ${entries.length} entries`:'Practice & notes';
    $('hq-journal').innerHTML=state.journal.filter(j=>j.profile===identifier.toLowerCase()).slice().reverse().map(j=>`<div class="hq-objective"><small>${esc(j.kind)} · ${esc(j.createdAt.slice(0,10))}${j.due?' · due '+esc(j.due):''}</small><div><input type="text" data-edit="${esc(j.id)}" value="${esc(j.text)}" aria-label="Edit journal entry"><button data-save="${esc(j.id)}">Save</button>${j.kind==='Weekly objective'?`<button data-done="${esc(j.id)}">${j.done?'Reopen':'Complete'}</button>`:''}</div><small>${j.done?'Completed':'Active'}${j.evidence?` · demo round ${j.evidence.round}`:''}</small>${j.evidence?` <button data-example="${esc(j.id)}">Example round ↗</button>`:''}</div>`).join('');
  }
  async function fetchJson(path){const response=await fetch(BASE+path,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error(`Request failed (${response.status}). Check backend and API-key setup.`);return response.json();}
  async function load(force=false){
    if(busy)return;if(!identityKnown||!faceit)return message('Log in with FACEIT from Account to refresh your matches.');
    if(!force&&profile()){updateMapOptions();render();return message('Showing the local cached snapshot.');}
    if(Date.now()-(refreshTimes.get(identifier)||0)<60000)return message('Please wait 60 seconds between online refreshes. Cached data remains available.');
    const loadedId=identifier,version=++loadVersion;
    busy=true;refreshTimes.set(identifier,Date.now());$('hq-refresh').disabled=true;message('Fetching recent FACEIT history…');
    try{const items=await fetchJson(`/players/${encodeURIComponent(loadedId)}/faceit-match-history`);if(version!==loadVersion)return;if(!Array.isArray(items))throw new Error('Unexpected history response.');const fetchedAt=new Date().toISOString();state.profiles[loadedId.toLowerCase()]={fetchedAt,records:M.merge(profile()?.records||[],items.map(m=>M.online(m,loadedId,fetchedAt)))};persist();updateMapOptions();render();message('Snapshot saved locally. Previously collected matches are retained (up to 1,000 per player).');}
    catch(e){if(version===loadVersion){render();message(`${e.message} ${profile()?'Showing the last cached snapshot.':'No cached history available.'}`);}}finally{if(version===loadVersion){busy=false;$('hq-refresh').disabled=false;}}
  }
  function updateMapOptions(){const value=$('hq-map').value;$('hq-map').innerHTML='<option value="">All maps</option>'+[...new Set((profile()?.records||[]).map(r=>r.map).filter(Boolean))].map(m=>`<option>${esc(m)}</option>`).join('');$('hq-map').value=value;}
  async function refreshDemos(){try{demos=await invoke('list_past_demos');render();}catch(e){message(String(e));}}
  async function openDemo(id,round=null){
    await invoke('open_player_hq_demo',{id,round});
  }
  async function detail(id){
    const row=(profile()?.records||[]).find(r=>r.id===id);if(!row)return;const token=++request;
    reveal('hq-detail-panel');
    let cached=state.details[id];$('hq-detail').textContent='Loading match details…';
    try{if(!cached||Date.now()-Date.parse(cached.fetchedAt)>600000){const data=await fetchJson(`/players/${encodeURIComponent(identifier)}/faceit-match-history/${encodeURIComponent(row.externalId)}`);cached={data,fetchedAt:new Date().toISOString()};state.details[id]=cached;persist();}}
    catch(e){if(!cached){if(token===request)$('hq-detail').textContent=e.message;return;}message('Offline: displaying cached match details.');}
    if(token!==request)return;const d=cached.data;
    $('hq-detail').innerHTML=`<h3>${esc(d.competitionName||'FACEIT match')} · ${esc(d.map||'Unknown map')}</h3><p>${esc(d.teamA.name)} ${d.teamA.score??'—'} : ${d.teamB.score??'—'} ${esc(d.teamB.name)}</p><small>FACEIT API · fetched ${esc(new Date(cached.fetchedAt).toLocaleString())}. Ratings only where supplied; MVP is CSTracker's statistical selection.</small>${[d.teamA,d.teamB].map(t=>`<h3>${esc(t.name)}</h3><div class="hq-scroll"><table><tr><th>Player</th><th>K / D / A</th><th>ADR</th><th>FACEIT rating</th></tr>${t.players.map(p=>`<tr><td>${p.isMatchMvp?'★ ':''}${esc(p.nickname)}</td><td>${p.kills??'—'} / ${p.deaths??'—'} / ${p.assists??'—'}</td><td>${p.adr??'N/A'}</td><td>${p.faceitRating??'N/A'}</td></tr>`).join('')}</table></div>`).join('')}${state.links[id]?`<button data-open="${esc(state.links[id].demoId)}">Open associated local replay ↗</button>`:''}`;
  }
  function linkPicker(id){
    reveal('hq-detail-panel');
    $('hq-detail').replaceChildren();const note=document.createElement('p');note.textContent='Confirm only if this is the same match. Similar names, dates or scores do not establish a match.';const select=document.createElement('select');select.innerHTML=demos.map(d=>`<option value="${esc(d.id)}">${esc(d.fileName)} · ${esc(d.mapName)}</option>`).join('');const button=document.createElement('button');button.textContent='Confirm same match & link';button.disabled=!demos.length;button.onclick=()=>{try{M.link(state,id,select.value,true);persist();render();$('hq-detail').textContent='User-confirmed link saved locally.';}catch(e){message(e.message);}};$('hq-detail').append(note,select,button);
  }
  async function analyze(id){
    reveal('hq-evidence-panel');
    $('hq-evidence').textContent='Reading cached demo evidence…';
    try{const data=state.metrics[id]||await invoke('player_hq_demo_metrics',{id});state.metrics[id]=data;persist();selectedDemo=data;const players=[...new Map(data.rows.map(r=>[r.playerId,r.name])).entries()];
      $('hq-evidence').innerHTML=`<label>Explicitly choose player<select id="hq-demo-player"><option value="">Choose player…</option>${players.map(([pid,name])=>`<option value="${esc(pid)}">${esc(name)} · ${esc(pid)}</option>`).join('')}</select></label><div class="hq-controls"><label>Side<select id="hq-side"><option value="">Both</option><option>CT</option><option>T</option></select></label><label>Teammate (demo rounds)<input id="hq-demo-teammate" placeholder="Name contains…"></label></div><div id="hq-demo-stats"></div>`;
      for(const key of ['hq-demo-player','hq-side','hq-demo-teammate'])$(key).oninput=renderEvidence;
    }catch(e){$('hq-evidence').textContent=String(e);}
  }
  function renderEvidence(){
    const player=$('hq-demo-player').value;if(!player)return $('hq-demo-stats').textContent='Choose a player to calculate round metrics.';
    const side=$('hq-side').value,teammate=$('hq-demo-teammate').value.toLowerCase();
    const rows=selectedDemo.rows.filter(r=>!teammate||r.teammates.some(t=>t.toLowerCase().includes(teammate)));
    const a=M.demoStats(rows,player,side),deaths=rows.filter(r=>r.playerId===player&&(!side||r.side===side)&&r.openingDeath);
    $('hq-demo-stats').innerHTML=`<p><span class="hq-tag">Local demo · ${a.rounds} player-rounds</span></p><p>Opening kills / deaths: <b>${a.openingKills} / ${a.openingDeaths}</b><br>Trade kills / traded deaths: <b>${a.tradeKills} / ${a.tradedDeaths}</b><br>End-frame survival: <b>${fmt(a.survival,'%')}</b> (${a.survivalSample} known end frames)<br>Recorded utility throws: <b>${a.throws}</b></p><small>Opening = first kill event in a round. Trades use parser event flags. Survival uses the final sampled frame. Utility damage and flash effectiveness: unavailable. These are demo-derived metrics, not FACEIT ratings.</small>${deaths.length>=2?`<p>${deaths.length} opening deaths in this selection. Review positioning and available support before your first engagement.</p><button id="hq-accept">Accept weekly review objective</button>`:'<p>At least two opening deaths are required for the recurring-pattern suggestion. You can still create your own objective.</p>'}`;
    if($('hq-accept'))$('hq-accept').onclick=()=>{try{addJournal('Weekly objective',`Review ${deaths.length} opening deaths on ${selectedDemo.map}; write one alternative before each first engagement.`,{demoId:selectedDemo.demoId,round:deaths[0].round});}catch(e){message(e.message);}};
  }
  function addJournal(kind,text=$('hq-note').value,evidence=null){
    if(!identifier)return message('Load or enter a player profile before saving journal entries.');if(!text.trim())return message('Write a note or practice objective first.');
    const now=new Date();state.journal.push({id:crypto.randomUUID(),profile:identifier.toLowerCase(),kind,text:text.trim().slice(0,2000),createdAt:now.toISOString(),due:kind==='Weekly objective'?new Date(now.getTime()+7*86400000).toISOString().slice(0,10):null,done:false,evidence});persist();$('hq-note').value='';renderJournal();reveal('hq-journal-panel');message('Saved locally.');
  }
  root.addEventListener('click',async event=>{const b=event.target.closest('button');if(!b)return;try{
    if(b.dataset.open)await openDemo(b.dataset.open);
    if(b.dataset.detail)await detail(b.dataset.detail);
    if(b.dataset.link)linkPicker(b.dataset.link);
    if(b.dataset.unlink){delete state.links[b.dataset.unlink];persist();render();}
    if(b.dataset.analyze)await analyze(b.dataset.analyze);
    const id=b.dataset.save||b.dataset.done||b.dataset.example,j=state.journal.find(j=>j.id===id);
    if(j&&b.dataset.save){const input=[...root.querySelectorAll('[data-edit]')].find(e=>e.dataset.edit===id);j.text=input.value.slice(0,2000);persist();renderJournal();}
    if(j&&b.dataset.done){j.done=!j.done;persist();renderJournal();}
    if(j&&b.dataset.example)await openDemo(j.evidence.demoId,j.evidence.round);
  }catch(e){message(String(e));}});
  $('hq-login').onclick=()=>window.activateTab?.('tab-account');$('hq-refresh').onclick=()=>load(true);$('hq-demos').onclick=refreshDemos;
  $('hq-add-note').onclick=()=>{try{addJournal('Journal note');}catch(e){message(e.message);}};$('hq-add-goal').onclick=()=>{try{addJournal('Weekly objective');}catch(e){message(e.message);}};
  $('hq-more').onclick=()=>{visibleMatches+=6;render();};
  $('hq-reset-filters').onclick=()=>{for(const id of ['hq-from','hq-to','hq-map','hq-teammate'])$(id).value='';visibleMatches=6;render();};
  for(const id of ['hq-from','hq-to','hq-map','hq-teammate','hq-period'])$(id).oninput=()=>{visibleMatches=6;render();};
  function accountStatus(status){
    const next=status.faceit?.providerUserId?status.faceit:null,changed=identifier!==(next?.providerUserId||'')||!identityKnown;
    identityKnown=true;faceit=next;
    if(changed){identifier=next?.providerUserId||'';++loadVersion;++request;busy=false;visibleMatches=6;for(const id of ['hq-from','hq-to','hq-map','hq-teammate'])$(id).value='';$('hq-detail').textContent='Select a match to inspect its cached or online details.';message('');}
    $('hq-name').textContent=next?.displayName|| (next?'FACEIT player':'Your Player HQ');
    const special=next?({'drunk-noinfo':'developer','mcmacsu':'tester','xadez':'featured'}[String(next.displayName||'').toLowerCase()]||''):'';
    $('hq-name').className=special==='tester'?'fx-sonar':'';
    $('hq-name').dataset.text=$('hq-name').textContent;
    $('hq-identity').className='hq-controls hq-identity'+(special?' hq-special hq-'+special:'');
    $('hq-role').textContent=special==='developer'?'Developer':special==='tester'?'Tester':'';
    $('hq-role').hidden=!['developer','tester'].includes(special);
    const level=Number(next?.extra?.level);
    $('hq-level').textContent='';
    const levelIcon=document.createElement('img');
    levelIcon.src=Number.isInteger(level)&&level>=1&&level<=10?`assets/faceit-levels/level${level}.png`:'assets/faceit-levels/unranked.png';
    levelIcon.alt=level>=1&&level<=10?`FACEIT level ${level}`:'FACEIT unranked';levelIcon.title=levelIcon.alt;
    $('hq-level').replaceChildren(levelIcon);
    $('hq-elo').textContent=next?.extra?.elo!=null?next.extra.elo+' ELO':'— ELO';
    $('hq-connection').textContent=next?(next.extra?.identitySource==='steam-data-api'?'FACEIT profile found via Steam':'FACEIT connected'):'Log in with Steam in Account to find your FACEIT profile and matches.';
    $('hq-login').textContent=next?'Account':'Log in';$('hq-refresh').disabled=!next||busy;
    $('hq-avatar').textContent='?';
    if(next?.avatarUrl&&/^https:\/\//i.test(next.avatarUrl)){const img=document.createElement('img');img.src=next.avatarUrl;img.alt='FACEIT profile photo';img.referrerPolicy='no-referrer';img.onerror=()=>{$('hq-avatar').textContent='?';};$('hq-avatar').replaceChildren(img);}
    try{if(next)localStorage.setItem(IDENTITY_KEY,JSON.stringify({providerUserId:next.providerUserId,displayName:next.displayName}));else localStorage.removeItem(IDENTITY_KEY);}catch{}
    updateMapOptions();render();if(next&&changed)load();
  }
  window.addEventListener('cstracker-account-status',e=>accountStatus(e.detail));
  try{const cached=JSON.parse(localStorage.getItem(IDENTITY_KEY));if(cached?.providerUserId){identifier=cached.providerUserId;$('hq-name').textContent=cached.displayName||'Cached FACEIT profile';$('hq-connection').textContent='Cached profile · connection not verified';}}catch{}
  updateMapOptions();render();$('hq-refresh').disabled=true;if(storageError)message(storageError);refreshDemos();
  if(window.CSTrackerAccountStatus)accountStatus(window.CSTrackerAccountStatus);
  window.activateTab?.('tab-player-hq');
})();
