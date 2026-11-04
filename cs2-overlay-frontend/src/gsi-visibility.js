/* A successful local-player GSI packet establishes availability, not a config download. */
(() => {
  let account=window.CSTrackerAccountStatus?.steam?.providerUserId||null,live=null;
  const key=id=>'cstracker-gsi-confirmed:'+id;
  function render(){
    const id=account||live?.localPlayer?.steamId;
    let known=false;try{known=Boolean(id&&localStorage.getItem(key(id))==='true');}catch{}
    const connected=Boolean(live?.connected&&live.localPlayer?.steamId&&(!account||live.localPlayer.steamId===account));
    document.querySelectorAll('[data-gsi-stats]').forEach(el=>{el.hidden=!(known||connected);});
  }
  window.addEventListener('cstracker-account-status',event=>{account=event.detail?.steam?.providerUserId||null;render();});
  window.addEventListener('cstracker-gsi-state',event=>{
    live=event.detail;
    if(live?.connected&&live.localPlayer?.steamId){try{localStorage.setItem(key(live.localPlayer.steamId),'true');}catch{}}
    render();
  });
  render();
})();
