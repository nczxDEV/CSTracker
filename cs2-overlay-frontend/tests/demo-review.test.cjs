const {test}=require('node:test');
const assert=require('node:assert/strict');
const {estimatedRating,leaders,loopTick}=require('../src/demo-review.js');
const average={name:'A',rounds_played:20,kills:14,deaths:14,assists:4,kast:70,adr:70};
test('estimate uses percentage KAST and published coefficients with approximate impact',()=>{
  assert.ok(Math.abs(estimatedRating(average)-1.048378)<1e-6);
  assert.equal(estimatedRating({...average,adr:null}),null);
  assert.equal(estimatedRating({...average,rounds_played:0}),null);
  assert.equal(estimatedRating({...average,kast:101}),null);
  assert.equal(estimatedRating({...average,kills:-1}),null);
  assert.equal(estimatedRating({...average,adr:NaN}),null);
});
test('MVP preserves displayed ties and excludes unavailable ratings',()=>{
  assert.equal(leaders([average,{...average,name:'B'},{...average,adr:null}]).length,2);
  assert.equal(leaders([{...average,adr:null}]).length,0);
  assert.equal(leaders([average,{...average,name:'B',kills:30}])[0].player.name,'B');
});
test('loop handles boundaries, high playback speed overshoot and invalid intervals',()=>{
  assert.equal(loopTick(45,30,45),30);
  assert.equal(loopTick(47,30,45),32);
  assert.equal(loopTick(77,30,45),32);
  assert.equal(loopTick(40,30,45),40);
  assert.equal(loopTick(40,30,30),40);
  assert.equal(loopTick(40,null,null),40);
});
