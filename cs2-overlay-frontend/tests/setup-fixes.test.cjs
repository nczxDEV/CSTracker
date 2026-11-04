const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
test('saved key masks are never submitted as credentials; typed keys remain masked in the field',()=>{
 const context={window:{}};vm.runInNewContext(fs.readFileSync('src/api-key-fields.js','utf8'),context);const fields=context.window.ApiKeyFields;
 const events={},field={value:'',dataset:{},addEventListener:(k,f)=>events[k]=f};fields.sync(field,true);assert.equal(field.type,'password');assert(field.value);assert.equal(fields.value(field),undefined);
 events.focus();field.value='new-test-key';events.input();fields.sync(field,true);assert.equal(field.value,'new-test-key');assert.equal(fields.value(field),'new-test-key');
 field.value='';events.blur();assert.equal(fields.value(field),undefined);assert(field.value);
});
function onboarding(saved={}){
 const els={},steps=[],skips=[];let removed=false;
 function el(id){return els[id]??=( {handlers:{},classList:{add(){},remove(){},toggle(){}},addEventListener(k,f){this.handlers[k]=f;},remove(){removed=true;}});}
 skips.push(el('skip'));
 const context={document:{getElementById:el,querySelectorAll:q=>q.includes('skip-setup')?skips:steps},localStorage:{getItem:k=>saved[k]??null,setItem:(k,v)=>saved[k]=v,removeItem:k=>delete saved[k]},setTimeout:()=>1,AbortSignal,CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail;}},fetch:async()=>({ok:true,json:async()=>({faceitConfigured:true,steamConfigured:true})}),dispatchEvent:()=>{},activateTab:()=>{}};context.window=context;vm.runInNewContext(fs.readFileSync('src/onboarding.js','utf8'),vm.createContext(context));return{context,els,saved,skips};
}
test('configured keys and legacy skipped flag do not bypass the new introduction; Skip persists completion',async()=>{
 const b=onboarding({'cstracker-setup-skipped':'true'});let done=false;const completion=b.context.OnboardingWizard.checkAndShow().then(()=>done=true);await new Promise(r=>setImmediate(r));assert.equal(done,false);assert.equal(b.els['onb-continue-step1-btn'].disabled,false);b.skips[0].handlers.click();await completion;assert.equal(b.saved['cstracker-glacial-onboarding-complete'],'true');
 const restart=onboarding(b.saved);assert.equal(await restart.context.OnboardingWizard.checkAndShow(),true);
});
