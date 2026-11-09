const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('match window labels are valid UTF-8 without replacement glyphs',()=>{
 const source=new TextDecoder('utf-8',{fatal:true}).decode(fs.readFileSync('src/match-summary.js'));
 assert.ok(source.includes('FACEIT Data API · fetched'));
 assert.ok(source.includes('Loading match statistics…'));
 assert.ok(!source.includes('\uFFFD'));
 const hq=new TextDecoder('utf-8',{fatal:true}).decode(fs.readFileSync('src/player-hq.js'));
 assert.ok(!hq.includes('\uFFFD'));
 assert.ok(hq.includes("r.rating==null?'—'"));
});
test('shared match window preserves legacy HQ offline details when backend is disconnected',async()=>{
 const summary={matchId:'m1',teamA:{name:'Cached team',players:[]},teamB:{name:'Opponent',players:[]}};
 const store=new Map([['cstracker-player-hq-v1',JSON.stringify({details:{'faceit:m1':{data:summary,fetchedAt:'2026-11-01T12:00:00Z'}}})]]);
 const refresh={},root={innerHTML:'',querySelector:s=>s==='#ms-refresh'?refresh:null,querySelectorAll:()=>[]};
 const context={document:{getElementById:()=>root},location:{search:'?matchId=m1&identifier=player'},URLSearchParams,AbortSignal,Date,localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},fetch:async()=>{throw Error('offline');},MatchView:require('../src/match-view.js')};context.window=context;
 vm.runInNewContext(fs.readFileSync('src/match-summary.js','utf8'),context);
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(root.innerHTML,/Offline \/ refresh failed/);assert.match(root.innerHTML,/Cached team/);
 assert.ok(JSON.parse(store.get('cstracker-player-hq-v1')).details['faceit:m1']);
});
