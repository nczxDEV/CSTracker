const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('plain-script updater downloads before stopping backend and installing',async()=>{
 const calls=[],elements={};for(const id of ['update-current-version','update-status-dot','update-status-label','check-update-btn','install-update-btn','update-progress-status','update-notes-hint'])elements[id]={style:{},classList:{add(){},remove(){}},addEventListener(k,f){this[k]=f;}};
 const core={Channel:class {},invoke:async(command,args)=>{calls.push(command);if(command==='plugin:updater|check')return {rid:7,version:'9.0.0',body:'Notes'};if(command==='plugin:updater|download'){args.onEvent.onmessage({event:'Finished'});return 8;}if(command==='plugin:updater|install')assert.deepEqual(JSON.parse(JSON.stringify(args)),{updateRid:7,bytesRid:8});}};
 const ctx={document:{getElementById:id=>elements[id]},console,setTimeout(){},__TAURI__:{core,app:{getVersion:async()=> '0.4.7'}}};ctx.window=ctx;
 vm.runInNewContext(fs.readFileSync('src/updater.js','utf8'),ctx);
 await elements['check-update-btn'].click();await elements['install-update-btn'].click();
 assert.deepEqual(calls,['plugin:updater|check','plugin:updater|download','prepare_for_update','plugin:updater|install']);
});
