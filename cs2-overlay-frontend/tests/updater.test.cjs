const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('plain-script updater downloads before stopping backend and installing',async()=>{
 const calls=[],elements={};for(const id of ['update-current-version','update-status-dot','update-status-label','check-update-btn','install-update-btn','update-progress-status','update-notes-hint'])elements[id]={style:{},classList:{add(){},remove(){}},addEventListener(k,f){this[k]=f;}};
 const core={Channel:class {},invoke:async(command,args)=>{calls.push(command);if(command==='plugin:updater|check')return {rid:7,version:'9.0.0',body:'Notes'};if(command==='plugin:updater|download'){args.onEvent.onmessage({event:'Finished'});return 8;}if(command==='plugin:updater|install')assert.deepEqual(JSON.parse(JSON.stringify(args)),{updateRid:7,bytesRid:8});}};
 const ctx={document:{getElementById:id=>elements[id]},console,setTimeout(){},__TAURI__:{core,app:{getVersion:async()=> '0.4.7'}}};ctx.window=ctx;
 vm.runInNewContext(fs.readFileSync('src/updater.js','utf8'),ctx);
 await elements['check-update-btn'].click();await elements['install-update-btn'].click();
 assert.deepEqual(calls,['plugin:updater|check','plugin:updater|download','prepare_for_update','plugin:updater|install']);
});
test('updater refuses installation when backend shutdown fails',async()=>{
 const calls=[],elements={};for(const id of ['update-current-version','update-status-dot','update-status-label','check-update-btn','install-update-btn','update-progress-status','update-notes-hint'])elements[id]={style:{},classList:{add(){},remove(){}},addEventListener(k,f){this[k]=f;}};
 const core={Channel:class {},invoke:async(command,args)=>{calls.push(command);if(command==='plugin:updater|check')return {rid:7,version:'9.0.0'};if(command==='plugin:updater|download')return 8;if(command==='prepare_for_update')throw new Error('Backend did not stop');}};
 const ctx={document:{getElementById:id=>elements[id]},console:{warn(){}},setTimeout(){},__TAURI__:{core,app:{getVersion:async()=> '0.4.7'}}};ctx.window=ctx;
 vm.runInNewContext(fs.readFileSync('src/updater.js','utf8'),ctx);
 await elements['check-update-btn'].click();await elements['install-update-btn'].click();
 assert.ok(!calls.includes('plugin:updater|install'));
 assert.match(elements['update-progress-status'].textContent,/Backend did not stop/);
 assert.equal(elements['install-update-btn'].disabled,false);
});
for(const outcome of ['available','none','offline']) test('startup notification: '+outcome,async()=>{
 const elements={},timers=[];
 for(const id of ['update-current-version','update-status-dot','update-status-label','check-update-btn','install-update-btn','update-progress-status','update-notes-hint','update-banner','update-banner-label','update-banner-view','update-banner-dismiss'])elements[id]={hidden:true,style:{},classList:{add(){},remove(){}},addEventListener(k,f){this[k]=f;}};
 const ctx={document:{getElementById:id=>elements[id]},console:{warn(){}},setTimeout:f=>timers.push(f),__TAURI__:{core:{Channel:class{},invoke:async()=>{if(outcome==='offline')throw Error('Offline');return outcome==='available'?{rid:1,version:'0.4.8'}:null;}},app:{getVersion:async()=> '0.4.7'}}};ctx.window=ctx;
 vm.runInNewContext(fs.readFileSync('src/updater.js','utf8'),ctx);
 for(let i=0;i<5;i++)await Promise.resolve();await timers[0]();
 assert.equal(elements['update-banner'].hidden,outcome!=='available');
 if(outcome==='available'){
  assert.match(elements['update-banner-label'].textContent,/Update available.*0.4.8/);
  elements['update-banner-dismiss'].click();assert.equal(elements['update-banner'].hidden,true);
 }else assert.equal(elements['update-status-label'].textContent,undefined);
});
