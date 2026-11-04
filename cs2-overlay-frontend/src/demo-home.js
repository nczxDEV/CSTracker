(() => {
  const $=id=>document.getElementById(id);
  let entries=[],loading=false;
  const el=(tag,text,cls='')=>{const e=document.createElement(tag);e.textContent=text;e.className=cls;return e};
  function setLoading(value,message='Opening demo…'){
    loading=value; $('studio-loading').hidden=!value;$('studio-loading-stage').textContent=message;
    $('demo-import-btn').disabled=value;
  }
  function render(){
    const list=$('past-demo-list');list.replaceChildren();const query=$('past-demo-search').value.toLowerCase();
    for(const item of entries.filter(e=>[e.fileName,e.mapName,...e.players].join(' ').toLowerCase().includes(query))){
      const card=el('button','','past-demo-card');card.type='button';
      card.append(el('span',item.mapName.replace(/^de_/, '').toUpperCase(),'past-map'),el('strong',item.fileName),el('small',`${item.rounds} rounds · ${new Date(item.importedAt*1000).toLocaleString()}`),el('small',item.players.join(' · ')));
      card.addEventListener('click',async()=>{
        if(loading)return;setLoading(true,'Opening saved replay…');
        try{await window.DemoReplay.show(await window.__TAURI__.core.invoke('open_past_demo',{id:item.id}));}
        catch(e){$('demo-import-status').textContent=String(e)}finally{setLoading(false)}
      });list.append(card);
    }
    if(!list.children.length)list.append(el('p',entries.length?'No matching demos.':'Your imported demos will appear here.','detail-note'));
  }
  async function refresh(){try{entries=await window.__TAURI__.core.invoke('list_past_demos');render()}catch(e){$('past-demo-list').textContent=String(e)}}
  $('past-demo-search').addEventListener('input',render);
  $('studio-home-btn').addEventListener('click',()=>{window.DemoReplay.pause();$('studio-home').hidden=false;$('demo-workspace').hidden=true;$('studio-home-btn').hidden=true;refresh()});
  for(const id of ['coach-setup-entry','coach-open-settings'])$(id).addEventListener('click',()=>$('coach-settings-dialog').showModal());
  $('coach-settings-done').addEventListener('click',()=>$('coach-settings-dialog').close());
  window.DemoHome={setLoading,refresh,opened(){ $('studio-home').hidden=true;$('studio-home-btn').hidden=false; }};
  if(window.__TAURI__?.core?.invoke)refresh();
})();
