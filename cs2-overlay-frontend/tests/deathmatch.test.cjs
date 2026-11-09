const {test}=require('node:test');
const assert=require('node:assert/strict');
const {modeOf}=require('../src/deathmatch-model.js');
const fs=require('node:fs'),vm=require('node:vm');
function bootFinder(count=1,failProbe=false) {
  const elements={}, timers=[], intervals=[], events={}, calls=[];
  class Element {
    constructor(){this.value='';this.children=[];this.checked=false;this.style={setProperty:(k,v)=>this.style[k]=v,getPropertyValue:k=>this.style[k]};this.classList={add(){},toggle(){}};this.handlers={};this.dataset={};}
    append(...nodes){this.children.push(...nodes)}
    replaceChildren(...nodes){this.children=nodes}
    setAttribute(){} contains(){return false}
    addEventListener(k,f){this.handlers[k]=f}
    showModal(){this.open=true}
    createTHead(){const e=new Element();this.append(e);return e}
    createTBody(){const e=new Element();this.append(e);return e}
    insertRow(){const e=new Element();this.append(e);return e}
  }
  const document={hidden:false,documentElement:new Element(),getElementById:id=>elements[id]??=new Element(),
    createElement:()=>new Element(),createTextNode:t=>t,querySelectorAll:()=>[],addEventListener:(k,f)=>events[k]=f};
  const settings={uiTheme:'glass',panelOpacity:.6,backgroundMode:'gradient'};
  const cards=[{ip:'8.8.8.8:27015',provider:'pracc',mode:'Multi-CFG',map:'de_mirage',region:'Europe',lines:['Multi-CFG'],live:{freshness:'fresh',age_seconds:0,server_current_users:8},slots_configured:24}];
  while(cards.length<count)cards.push({...cards[0],ip:'8.8.4.'+cards.length+':27015'});
  const effect=class{stop(){calls.push(['stop'])}};
  const context={document,console,Option:class extends Element {constructor(t,v){super();this.value=v}},
    localStorage:{getItem:()=>null},setTimeout:(f,ms)=>{timers.push({f,ms});return timers.length},clearTimeout(){},setInterval:(f,ms)=>intervals.push({f,ms}),
    addEventListener:(k,f)=>events[k]=f,MatrixRain:effect,GalaxyBackground:effect,CyberpunkBackground:effect,TeamSpiritBackground:effect,
    OverlaySettingsStore:{loadSettings:()=>settings,onSettingsUpdated:f=>events.settings=f,applyUiTheme:t=>calls.push(['theme',t]),applyBackground:s=>calls.push(['background',s])},
    DeathmatchModel:{modeOf},__TAURI__:{core:{invoke:async(command)=>{calls.push([command]);if(command==='dm_catalog')return{cards};if(command==='dm_probe'&&failProbe)throw Error('No response');if(command==='dm_probe')return{ping:25,players:8,bots:0,slots:24,map:'de_mirage'};if(command==='dm_players')return[{name:'Player'},{name:''}];}}}};
  context.window=context;
  vm.runInNewContext(fs.readFileSync('src/deathmatch.js','utf8'),context);
  return {elements,timers,intervals,events,calls,document};
}
async function settle(){for(let i=0;i<20;i++)await Promise.resolve()}
test('finder applies Appearance and automatically measures ping, stopping when hidden',async()=>{
  const b=bootFinder();await settle();
  assert.equal(b.elements.grid.children.length,1);
  assert(b.calls.some(c=>c[0]==='theme'&&c[1]==='glass'));
  b.timers.find(t=>t.ms===500).f();await settle();
  assert(b.calls.some(c=>c[0]==='dm_probe'));
  assert(!b.elements.measure);
  b.events.settings({uiTheme:'hud',panelOpacity:.3,backgroundMode:'solid'});
  assert(b.calls.some(c=>c[0]==='theme'&&c[1]==='hud'));
  const count=b.calls.length;b.document.hidden=true;
  b.intervals.find(t=>t.ms===30000).f();await settle();assert.equal(b.calls.length,count);
});
test('PRACC roster retains names and explicitly reports missing FACEIT levels',async()=>{
  const b=bootFinder();await settle();
  const tile=b.elements.grid.children[0];
  await tile.children[1].children[1].children[0].onclick();
  assert.equal(b.elements['detail-provider'].textContent,'PRACC');
  const table=b.elements.players.children[0],rows=table.children[1].children;
  assert.equal(rows[0].children[0].textContent,'Player');
  assert.equal(rows[0].children[1].textContent,'Unavailable');
  assert.equal(rows[1].children[0].textContent,'Name unavailable');
});
test('provider categories distinguish rotating CFG from guns and specialist DM',()=>{
  for(const [mode,expected] of [['Multi-CFG','cfg'],['MULTICFGDM','cfg'],['All Weapons','guns'],
    ['DM','guns'],['PISTOLDM','pistol'],['HSDM','hs'],['Headshot only','hs'],['AWPDM','awp'],['AIMDM','aim']]) {
    assert.equal(modeOf({mode}),expected,mode);
  }
  assert.equal(modeOf({lines:['Frankfurt','Rifles']}),'guns');
  assert.equal(modeOf({mode:'Experimental'}),'unknown');
  assert.equal(modeOf({mode:'Multi-CFG',lines:['Pistol phase']}),'cfg');
});

test('automatic ping continues beyond the first batch and terminates failed queries',async()=>{
 const b=bootFinder(25,true);await settle();b.timers[0].f();await settle();
 assert.equal(b.calls.filter(c=>c[0]==='dm_probe').length,24);
 assert.equal(b.elements.grid.children[0].children[0].children[1].textContent,'No response');
 b.timers[b.timers.length-1].f();await settle();
 assert.equal(b.calls.filter(c=>c[0]==='dm_probe').length,25);
 assert.equal(b.elements.grid.children[24].children[0].children[1].textContent,'No response');
});
