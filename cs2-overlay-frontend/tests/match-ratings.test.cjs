const {test}=require('node:test'),assert=require('node:assert/strict');
const {enrich}=require('../src/match-ratings.js'),view=require('../src/match-view.js');
const player={nickname:'A',steamId:'76561198000000001',faceitRating:null};
const match={map:'de_nuke',teamA:{players:[player]},teamB:{players:[]}};
const demo={source:'local-demo',map:'de_nuke',playerStats:[{steamid:player.steamId,name:'Different name',rounds_played:20,kills:14,deaths:14,assists:4,kast:70,adr:70}]};
test('demo-free score selects MVP without inventing KAST or official ratings',()=>{
 const a={...player,kills:23,deaths:10,assists:5,adr:130.2,roundsPlayed:19};
 const b={...a,nickname:'B',kills:18,deaths:11,assists:6,adr:102.1};
 const result=enrich({...match,teamA:{players:[a,b]}},null);
 assert.equal(result.ratingLabel,'CSTracker Rating / 100');
 assert.equal(result.teamA.players[0].displayRating,84.99);
 assert.ok(result.teamA.players[0].displayRating>result.teamA.players[1].displayRating);
 assert.equal(result.teamA.players[0].kast,undefined);
 assert.match(view.render(result),/★ MVP/);
});
test('custom score is bounded, handles score-derived rounds and rejects missing inputs',()=>{
 const {trackerRating}=require('../src/match-ratings.js');
 const p={kills:100,deaths:0,assists:100,adr:300};
 const s={teamA:{score:13},teamB:{score:6}};
 assert.equal(trackerRating(p,s),100);
 assert.equal(trackerRating({...p,adr:null},s),null);
 assert.equal(trackerRating({...p,deaths:20},s),null);
 assert.equal(trackerRating(p,match),null);
});
test('linked demo estimates use exact identity and explicit source without mutating FACEIT stats',()=>{
 const data=enrich(match,demo);assert.ok(data.teamA.players[0].displayRating>1);
 assert.equal(player.faceitRating,null);assert.match(view.render(data),/Estimated 2.0 · unofficial/);assert.match(view.render(data),/★ MVP/);
});
test('missing KAST, wrong map, missing ID and duplicate identities cannot fabricate ratings',()=>{
 for(const d of [null,{...demo,map:'de_mirage'},{...demo,playerStats:[{...demo.playerStats[0],kast:null}]},{...demo,playerStats:[...demo.playerStats,...demo.playerStats]}])assert.equal(enrich(match,d).teamA.players[0].displayRating,null);
 assert.equal(enrich({...match,teamA:{players:[{...player,steamId:null}]}},demo).teamA.players[0].displayRating,null);
});
test('official ratings take precedence and are never mixed with estimates',()=>{
 const data=enrich({...match,teamB:{players:[{...player,nickname:'B',faceitRating:1.3}]}},demo);
 assert.equal(data.ratingLabel,'FACEIT Rating');assert.equal(data.teamA.players[0].displayRating,null);assert.equal(data.teamB.players[0].displayRating,1.3);
});
