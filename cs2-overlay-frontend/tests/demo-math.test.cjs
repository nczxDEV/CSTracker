const { test } = require('node:test');
const assert = require('node:assert/strict');
const { interpolateYaw } = require('../src/demo-math.js');
const {radarPointer,pointInPolygon,calloutAt}=require('../src/demo-math.js');
const fs=require('node:fs'),path=require('node:path');

test('hover coordinates invert radar pan, zoom and CSS scaling',()=>{
  assert.deepEqual(radarPointer(360,275,{left:10,top:20,width:512,height:512},1024,1024,2,100,-50),{x:556,y:536});
  assert(pointInPolygon(5,5,[[0,0],[10,0],[10,10],[0,10]]));
  assert(!pointInPolygon(20,5,[[0,0],[10,0],[10,10],[0,10]]));
});
test('callouts respect floor and return nothing outside known areas',()=>{
  const z=(name,lo,hi)=>({Name:name,MinBound:{X:0,Y:0,Z:lo},MaxBound:{X:10,Y:10,Z:hi}});
  const zones=[z('Upper',0,100),z('Lower',-200,-100)];
  assert.equal(calloutAt(zones,5,5,-50,false),'Upper');
  assert.equal(calloutAt(zones,5,5,-50,true),'Lower');
  assert.equal(calloutAt(zones,50,50),null);
});
test('every bundled radar has finite callout bounds or community polygons',()=>{
  const root=path.join(__dirname,'../src/assets/demo-radars');
  for(const radar of fs.readdirSync(path.join(root,'radars'))){
    const map=radar.replace(/\.png$/,'').replace(/_lower$/,'').replace(/_night$/,'');
    const zones=JSON.parse(fs.readFileSync(path.join(root,map+'-places.json'),'utf8'));
    assert(zones.length>0,map);
    for(const zone of zones){
      if(zone.RadarPolygon){assert(zone.RadarPolygon.length>=3);continue;}
      for(const axis of ['X','Y','Z']){assert(Number.isFinite(zone.MinBound[axis]));assert(zone.MaxBound[axis]>=zone.MinBound[axis]);}
    }
  }
});

test('crosses the compass boundary by two degrees instead of spinning', () => {
  assert.equal(interpolateYaw(359, 1, .5), 360);
  assert.equal(interpolateYaw(1, 359, .5), 0);
  assert.equal(interpolateYaw(179, -179, .5), 180);
  assert.equal(interpolateYaw(-179, 179, .5), -180);
});
test('preserves ordinary turns and clamps interpolation', () => {
  assert.equal(interpolateYaw(10, 50, .5), 30);
  assert.equal(interpolateYaw(20, 20, .5), 20);
  assert.equal(interpolateYaw(10, 50, -1), 10);
  assert.equal(interpolateYaw(10, 50, 2), 50);
});
test('missing angle samples cannot produce NaN', () => {
  assert.equal(interpolateYaw(NaN, 45, .5), 45);
  assert.equal(interpolateYaw(45, NaN, .5), 45);
});

test('frame lookup is direction independent and handles sparse samples and boundaries',()=>{
  const {framePair}=require('../src/demo-math.js');
  const frames=[{tick:100,players:[{id:'a',health:100}]},{tick:140,players:[{id:'a',health:0}]},{tick:200,players:[]}];
  const expected=framePair(frames,120);
  assert.equal(expected.fraction,.5);
  assert.equal(expected.before.players[0].health,100);
  for(const tick of [200,100,190,141,120]) framePair(frames,tick);
  assert.deepEqual(framePair(frames,120),expected);
  assert.equal(framePair(frames,140).before.players[0].health,0);
  assert.equal(framePair(frames,0).fraction,0);
  assert.equal(framePair(frames,300).before.tick,200);
  assert.equal(framePair([],120),null);
  assert.equal(framePair([frames[0]],120).fraction,0);
});

test('match score follows identities through halftime, ignores knife and counts end once',()=>{
 const {roundScore}=require('../src/demo-math.js');
 const r=(number,winnerSide,swap=false)=>({number,winnerSide,endTick:number*100,ctPlayerIds:swap?['b','c']:['a','d'],tPlayerIds:swap?['a','d']:['b','c']});
 const rounds=[r(1,'terrorist'),r(2,'counter-terrorist'),r(3,'terrorist',true)];
 assert.deepEqual(roundScore(rounds,rounds[2],250),{ct:1,t:1});
 assert.deepEqual(roundScore(rounds,rounds[2],300),{ct:1,t:2});
 assert.deepEqual(roundScore(rounds,rounds[2],250),{ct:1,t:1});
 rounds[0].isKnifeRound=true;
 assert.deepEqual(roundScore(rounds,rounds[2],250),{ct:0,t:1});
 assert.equal(roundScore(rounds.slice(1),rounds[2],250),null);
 rounds[1].ctPlayerIds=[];
 assert.equal(roundScore(rounds,rounds[2],250),null);
});
test('timeline event positions match round time and exclude shots and invalid ticks',()=>{
 const {timelineEvents}=require('../src/demo-math.js');
 const events=[{kind:'kill',tick:100},{kind:'grenade',tick:150},{kind:'bomb',tick:200},{kind:'shot',tick:160},{kind:'kill',tick:90},{kind:'kill',tick:NaN}];
 assert.deepEqual(timelineEvents(events,100,200).map(e=>e.position),[0,50,100]);
 assert.equal(timelineEvents([{kind:'kill',tick:100}],100,100)[0].position,0);
});
