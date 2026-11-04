(() => {
  const menu=document.getElementById('launcher-menu');
  const toggle=document.getElementById('launcher-menu-toggle');
  const current=document.getElementById('launcher-current-page');
  if(!menu||!toggle||!current)return;
  function sync(targetId){
    const page=Array.from(menu.querySelectorAll('[data-tab-target]')).find(button=>button.dataset.tabTarget===targetId);
    if(page)current.textContent=targetId==='tab-demo-analyzer'?'Demo Studio':page.querySelector('.nav-label').textContent;
    const wasOpen=menu.open;menu.open=false;
    // Keep keyboard focus visible when its destination item becomes hidden.
    if(wasOpen&&menu.contains(document.activeElement))toggle.focus();
  }
  document.addEventListener('click',event=>{if(menu.open&&!menu.contains(event.target))menu.open=false;});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&menu.open){menu.open=false;toggle.focus();event.preventDefault();}
  });
  window.LauncherNavigation={sync};
})();
