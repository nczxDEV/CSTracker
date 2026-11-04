// Isolated real sidecar + SQLite checks. Never reads or modifies the user's app database.
const {spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const dir=fs.mkdtempSync(path.join(process.cwd(),'dist','hq-test-')),dbPath=path.join(dir,'app.db');
const port=18391,base=`http://127.0.0.1:${port}`;let child,errors='';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function start(){
 errors='';child=spawn(path.resolve('dist/cs2-overlay-backend-x86_64-pc-windows-msvc.exe'),[],{windowsHide:true,stdio:['ignore','ignore','pipe'],env:{...process.env,NODE_OPTIONS:'--experimental-sqlite',PORT:String(port),HOST:'127.0.0.1',DATABASE_PATH:dbPath,NODE_ENV:'production',FACEIT_OAUTH_CLIENT_ID:'',FACEIT_OAUTH_CLIENT_SECRET:''}});
 child.stderr.on('data',data=>{errors=(errors+data).slice(-3000);});
 for(let i=0;i<80;i++){try{const r=await fetch(base+'/auth/status');if(r.ok)return;}catch{}await delay(100);}throw Error('Isolated sidecar did not become ready: '+errors);
}
async function stop(){if(child&&child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r));}child=null;}
(async()=>{try{
 await start();let status=await (await fetch(base+'/auth/status')).json();assert.equal(status.capabilities.faceit,false);assert.equal(status.steam,null);
 assert.equal((await fetch(base+'/auth/faceit/login')).status,400);
 const login=await fetch(base+'/auth/steam/login',{redirect:'manual'});assert.equal(login.status,302);const url=new URL(login.headers.get('location'));const callback=new URL(url.searchParams.get('openid.return_to'));assert.equal(callback.port,String(port));
 assert.equal((await fetch(base+'/auth/steam/pending',{method:'DELETE'})).status,200);
 const failed=await (await fetch(callback)).text();assert(failed.includes('Sign-in failed'));status=await (await fetch(base+'/auth/status')).json();assert.equal(status.steam,null);
 await stop();const db=new DatabaseSync(dbPath);db.prepare('INSERT INTO linked_accounts (id,provider,provider_user_id,display_name,linked_at) VALUES (?,?,?,?,?)').run('test','steam','76561198000000000','Test identity',new Date().toISOString());db.close();
 await start();status=await (await fetch(base+'/auth/status')).json();assert.equal(status.steam.displayName,'Test identity');assert(!JSON.stringify(status).includes('access_token'));
 await fetch(base+'/auth/steam',{method:'DELETE'});await stop();await start();status=await (await fetch(base+'/auth/status')).json();assert.equal(status.steam,null);
 console.log('PASS: real isolated sidecar readiness, missing OAuth, Steam redirect, cancellation, persisted identity across restart and persisted unlink. No live provider login performed.');
 }finally{await stop();for(const name of ['app.db','app.db-wal','app.db-shm']){const file=path.join(dir,name);if(fs.existsSync(file))fs.unlinkSync(file);}fs.rmdirSync(dir);}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
