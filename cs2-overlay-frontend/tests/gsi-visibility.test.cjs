const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('GSI panels require a verified packet and never reuse another Steam account availability',()=>{
 const events={},storage=new Map(),panels=[{},{}];const context={document:{querySelectorAll:()=>panels},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},addEventListener:(k,f)=>events[k]=f};context.window=context;
 vm.runInNewContext(fs.readFileSync('src/gsi-visibility.js','utf8'),context);
 const account=id=>events['cstracker-account-status']({detail:{steam:{providerUserId:id}}});
 const state=value=>events['cstracker-gsi-state']({detail:value});
 account('one');assert(panels.every(p=>p.hidden));state({connected:true,localPlayer:{steamId:'two'}});assert(panels.every(p=>p.hidden));
 state({connected:true,localPlayer:{steamId:'one'}});assert(panels.every(p=>!p.hidden));state({connected:false});assert(panels.every(p=>!p.hidden));
 account('three');assert(panels.every(p=>p.hidden));account('one');assert(panels.every(p=>!p.hidden));
});
