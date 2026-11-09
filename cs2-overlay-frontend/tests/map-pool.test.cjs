const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
test('map card shows actual K/D and does not draw missing data as zero performance', async () => {
  const elements = {};
  const element = id => elements[id] ||= { innerHTML: '', querySelectorAll: () => [] };
  const context = { document: { getElementById: element, querySelectorAll: () => [] }, fetch: async () => ({ok:true,json:async()=>({totalMatches:10,bestMap:null,worstMap:null,maps:[{mapKey:'mirage',displayName:'Mirage',matches:10,avgKd:1.2,winRatePercent:0},{mapKey:'nuke',displayName:'Nuke',matches:null,avgKd:null,winRatePercent:null}]})}) };
  context.window = context;
  vm.runInNewContext(fs.readFileSync('src/map-pool-radar.js','utf8'),context);
  await context.MapPoolRadar.load('player');
  assert.doesNotMatch(element('mp-root').innerHTML, /data-metric="rating"|Level average|lookup failed/);
  assert.match(element('mp-rows').innerHTML, /1.20 K\/D/);
  assert.match(element('mp-rows').innerHTML, /width:0%/);
  assert.doesNotMatch(element('mp-radar').innerHTML, /fill-opacity="0.22"/);
});
