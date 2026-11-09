// Local review bookmarks retain the exact confirmed match and demo IDs.
(() => {
 const KEY='cstracker-round-bookmarks-v1',drafts=new Map();
 const invoke=(name,args)=>window.__TAURI__.core.invoke(name,args);
 function read(){const rows=JSON.parse(localStorage.getItem(KEY)||'[]');if(!Array.isArray(rows))throw Error('Saved bookmarks could not be read. Existing data was preserved.');return rows;}
 function mount(root,matchId,demoId){
  if(!matchId)return;
  const panel=document.createElement('section');panel.className='mv-review';
  panel.innerHTML='<h2>Review rounds</h2><p>Bookmarks and notes stay on this PC.</p><div class="mv-review-form"><label>Round <input type="number" min="1" step="1" value="1" aria-label="Round number"></label><label>Note <textarea maxlength="2000" placeholder="What should you review in this round?"></textarea></label><button type="button">Save bookmark</button></div><p role="status"></p><div class="mv-bookmarks"></div>';
  root.append(panel);
  const round=panel.querySelector('input'),note=panel.querySelector('textarea'),save=panel.querySelector('button'),status=panel.querySelector('[role=status]'),list=panel.querySelector('.mv-bookmarks');
  const draft=drafts.get(matchId);if(draft){round.value=draft.round;note.value=draft.note;}
  const keep=()=>drafts.set(matchId,{round:round.value,note:note.value});round.oninput=note.oninput=keep;
  if(!demoId){status.textContent='Link the matching demo from Player HQ first. Matches are never linked automatically.';save.disabled=true;}
  async function validate(id,n){const demos=await invoke('list_past_demos');const demo=demos.find(d=>d.id===id);if(!demo)throw Error('This demo is no longer in the local library. Import it again before reviewing.');if(!Number.isInteger(n)||n<1||n>demo.rounds)throw Error(`Choose a round from 1 to ${demo.rounds}.`);}
  function render(){
   list.replaceChildren();
   try{for(const item of read().filter(b=>b.matchId===matchId)){
    const row=document.createElement('div');row.className='mv-bookmark';
    const open=document.createElement('button');open.textContent=`Open round ${item.round}`;
    open.onclick=async()=>{open.disabled=true;try{await validate(item.demoId,item.round);await invoke('open_player_hq_demo',{id:item.demoId,round:item.round});status.textContent='Opened bookmarked round in Demo Studio.';}catch(e){status.textContent=String(e.message||e);}finally{open.disabled=false;}};
    const text=document.createElement('textarea');text.value=item.note;text.maxLength=2000;text.setAttribute('aria-label',`Note for round ${item.round}`);
    const edit=document.createElement('button');edit.textContent='Save note';edit.onclick=()=>{try{const rows=read(),entry=rows.find(b=>b.id===item.id);if(!entry)throw Error('Bookmark no longer exists.');entry.note=text.value;entry.updatedAt=new Date().toISOString();localStorage.setItem(KEY,JSON.stringify(rows));status.textContent='Note saved locally.';}catch(e){status.textContent=e.message;}};
    row.append(open,text,edit);list.append(row);
   }}catch(e){status.textContent=e.message;save.disabled=true;}
  }
  save.onclick=async()=>{save.disabled=true;try{const n=Number(round.value);await validate(demoId,n);const rows=read();const existing=rows.find(b=>b.matchId===matchId&&b.demoId===demoId&&b.round===n);if(existing){status.textContent='This round is already bookmarked. Edit its note below.';return;}rows.push({id:crypto.randomUUID(),matchId,demoId,round:n,note:note.value.slice(0,2000),createdAt:new Date().toISOString()});localStorage.setItem(KEY,JSON.stringify(rows));status.textContent='Round bookmarked locally.';render();}catch(e){status.textContent=String(e.message||e);}finally{save.disabled=!demoId;}};
  render();
 }
 window.MatchReview={mount};
})();
