const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('command bar keeps all destinations, original logo and account access',()=>{
 const html=fs.readFileSync('src/launcher.html','utf8');const nav=html.match(/<nav[^>]*id="launcher-nav"[\s\S]*?<\/nav>/)[0];
 const targets=[...nav.matchAll(/data-tab-target="([^"]+)"/g)].map(m=>m[1]);
 for(const id of ['tab-player-hq','tab-overview','tab-appearance','tab-setup','tab-saved','tab-player-summary','tab-demo-analyzer','tab-time-performance','tab-dodge-or-play','tab-account']){assert(targets.includes(id));assert(html.includes(`id="${id}"`));}
 assert(html.includes('src="assets/logo.png" alt="CS Tracker" class="launcher-logo"'));assert(html.includes('id="account-avatar-btn"'));
 assert.equal(targets.length,10);assert(!nav.includes('command-shortcuts'));assert(!nav.includes('command-breadcrumb'));
});
test('navigation updates breadcrumb and closes the menu; Escape restores focus, outside click dismisses',()=>{
 const handlers={};let focused=false;const current={textContent:''},toggle={focus:()=>{focused=true;}};
 const menu={open:true,contains:e=>e==='inside',querySelectorAll:()=>[{dataset:{tabTarget:'tab-player-hq'},querySelector:()=>({textContent:'Player HQ'})},{dataset:{tabTarget:'tab-demo-analyzer'},querySelector:()=>({textContent:'Demo Analyzer'})}]};
 const document={getElementById:id=>({'launcher-menu':menu,'launcher-menu-toggle':toggle,'launcher-current-page':current}[id]),activeElement:'inside',addEventListener:(key,fn)=>handlers[key]=fn};
 const context={document,window:{}};vm.runInNewContext(fs.readFileSync('src/launcher-navigation.js','utf8'),context);
 context.window.LauncherNavigation.sync('tab-player-hq');assert.equal(current.textContent,'Player HQ');assert.equal(menu.open,false);assert.equal(focused,true);
 context.window.LauncherNavigation.sync('tab-demo-analyzer');assert.equal(current.textContent,'Demo Studio');
 menu.open=true;handlers.click({target:'inside'});assert.equal(menu.open,true);handlers.click({target:'outside'});assert.equal(menu.open,false);
 let prevented=false;menu.open=true;focused=false;handlers.keydown({key:'Escape',preventDefault:()=>{prevented=true;}});assert.equal(menu.open,false);assert(focused&&prevented);
});
