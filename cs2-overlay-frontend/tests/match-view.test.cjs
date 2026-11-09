const {test}=require('node:test'),assert=require('node:assert/strict');
const view=require('../src/match-view.js');
const player=(name,rating)=>({nickname:name,skillLevel:10,faceitRating:rating,kills:20,deaths:10,assists:5});
const match=players=>({teamA:{name:'A',score:13,won:true,players:players.slice(0,1)},teamB:{name:'B',score:9,won:false,players:players.slice(1)}});
test('same renderer uses highest rating across teams, preserves ties and explicit source',()=>{
 const players=[player('A',1.1),player('B',1.6),player('C',1.6)];
 assert.deepEqual(view.leaders(players,'faceitRating').map(p=>p.nickname),['B','C']);
 const html=view.render(match(players));
 assert.match(html,/Tied: B, C/);assert.match(html,/FACEIT Rating/);assert.match(html,/level10.png/);
 assert.match(html,/★ MVP/);assert.doesNotMatch(html,/Level 10<\/span>/);
});
test('missing ratings do not promote a top fragger to rating MVP; incomplete coverage is labelled',()=>{
 const noRating=view.render(match([player('A',null),player('B',null)]));
 assert.match(noRating,/MVP rating unavailable/);assert.doesNotMatch(noRating,/★ MVP/);
 const partial=view.render(match([player('A',1.6),player('B',null)]));
 assert.match(partial,/Rating leader/);assert.match(partial,/Some player ratings unavailable/);
});
test('escapes names and does not load arbitrary avatar URL schemes',()=>{
 const p={...player('<img src=x onerror=alert(1)>',1.3),avatar:'javascript:alert(1)'};
 const html=view.render(match([p,player('B',1)]),'Utility');
 assert.doesNotMatch(html,/src="javascript:|<img src=x/);assert.match(html,/&lt;img/);
 assert.match(html,/These statistics were not supplied/);
});
