const {test}=require('node:test');const assert=require('node:assert/strict');
const M=require('../src/player-hq-model.js');
test('online refresh retains older collected matches and replaces exact IDs only',()=>{
 const old=[{id:'faceit:1',playedAt:'2026-10-01',rating:null},{id:'faceit:2',playedAt:'2026-10-02'}];
 const result=M.merge(old,[{id:'faceit:1',playedAt:'2026-10-01',rating:1.4}]);assert.equal(result.length,2);assert.equal(result.find(r=>r.id==='faceit:1').rating,1.4);
});
test('migration preserves existing profiles, notes and explicit links; rejects unsupported data',()=>{
 const state=M.empty();state.journal.push({text:'Keep this'});state.links.a={demoId:'b'};
 assert.deepEqual(M.migrate(JSON.parse(JSON.stringify(state))),state);assert.throws(()=>M.migrate({version:2}));
});
test('missing ratings, incomplete results and zero deaths remain unavailable',()=>{
 const record=M.online({matchId:'a',result:null,faceitRating:null,kills:5,deaths:0},'player','2026-10-30');
 const a=M.aggregate([record]);assert.equal(a.rating,null);assert.equal(a.winRate,null);assert.equal(a.kd,null);assert.equal(a.matches,1);
});
test('links require confirmation and cannot attach the same demo to unrelated records',()=>{
 const state=M.empty();assert.throws(()=>M.link(state,'a','demo',false));M.link(state,'a','demo',true);assert.throws(()=>M.link(state,'b','demo',true));assert.equal(state.links.a.method,'user-confirmed');
});
test('date filters use actual played date; teammates and unknown maps filter honestly',()=>{
 const rows=[{playedAt:'2026-10-01',map:'de_ancient',teammates:['Duo']},{playedAt:null,map:null}];
 assert.equal(M.filter(rows,{from:'2026-10-01',to:'2026-10-01'}).length,1);assert.equal(M.filter(rows,{teammate:'du'}).length,1);assert.equal(M.filter(rows,{map:'de_nuke'}).length,0);
});
test('comparison periods do not overlap or count future and undated matches',()=>{
 const now=Date.parse('2026-10-30T00:00:00Z');const rows=[{playedAt:'2026-10-29',result:'W'},{playedAt:'2026-10-20',result:'L'},{playedAt:'2026-11-01',result:'W'},{playedAt:null,result:'W'}];
 const c=M.compare(rows,7,now);assert.equal(c.recent.winRate,100);assert.equal(c.baseline.winRate,0);assert.equal(c.recent.matches,1);assert.equal(c.baseline.matches,1);
});
test('demo metrics use selected identity and side; missing survival is not counted dead',()=>{
 const row={playerId:'id',side:'CT',kills:2,deaths:1,openingKill:false,openingDeath:true,tradeKills:1,tradedDeaths:0,utilityThrows:2,survived:null};
 const a=M.demoStats([row,{...row,side:'T',survived:true}], 'id','CT');assert.equal(a.rounds,1);assert.equal(a.survival,null);assert.equal(a.openingDeaths,1);assert.equal(a.throws,2);assert.equal(M.demoStats([row],'other').rounds,0);
});
