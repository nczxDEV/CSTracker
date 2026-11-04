(() => {
  const mask='••••••••••••••••';
  function sync(field,configured){
    if(!field)return;field.type='password';field.dataset.keyConfigured=String(Boolean(configured));
    if(!field.value||field.dataset.savedMask==='true'){
      field.value=configured?mask:'';field.dataset.savedMask=String(Boolean(configured));
    }
    field.placeholder=configured?'Saved on this PC · type to replace':'Enter API key';
    if(field.dataset.keyBound)return;field.dataset.keyBound='true';
    field.addEventListener('focus',()=>{if(field.dataset.savedMask==='true'){field.value='';field.dataset.savedMask='false';}});
    field.addEventListener('blur',()=>{if(!field.value&&field.dataset.keyConfigured==='true')sync(field,true);});
    field.addEventListener('input',()=>{field.dataset.savedMask='false';});
  }
  function value(field){return field.dataset.savedMask==='true'?undefined:field.value.trim()||undefined;}
  window.ApiKeyFields={sync,value};
})();
