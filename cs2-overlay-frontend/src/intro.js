(() => {
  const overlay=document.getElementById('onboarding-overlay'),logo=document.getElementById('glacial-logo');if(!overlay||!logo)return;
  const intro=overlay.querySelector('.glacial-intro'),scene=intro.querySelector('.glacial-scene'),copy=scene.querySelector('.glacial-copy'),header=intro.querySelector('header');
  intro.insertBefore(copy,intro.querySelector('footer'));overlay.prepend(scene);overlay.prepend(header);header.classList.add('glacial-header');
  const setup=header.querySelector('[data-onb-goto]');
  setup.classList.add('glacial-setup-primary');copy.append(setup);
  let frame=0,stopped=false;const start=performance.now();
  function stop(){stopped=true;cancelAnimationFrame(frame);}
  function tick(now){
    if(stopped||!overlay.isConnected||overlay.classList.contains('onb-hidden'))return stop();
    const angle=(now-start)/5000*Math.PI*2,orbit=window.innerWidth<650?18:42;
    logo.style.transform=`translate(calc(-50% + ${Math.sin(angle)*orbit}px),calc(-50% + ${Math.cos(angle)*12}px)) rotateY(${Math.sin(angle)*28}deg) rotateX(8deg) scale(${1+Math.cos(angle)*.035})`;
    frame=requestAnimationFrame(tick);
  }
  window.addEventListener('cstracker-intro-step',event=>{if(event.detail<0)return stop();setup.hidden=event.detail!==0;overlay.dataset.setupStep=String(event.detail);});
  frame=requestAnimationFrame(tick);
})();
