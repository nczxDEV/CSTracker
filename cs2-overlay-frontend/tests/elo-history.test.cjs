const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
test('level 10 retains timestamped history and ignores legacy prediction fields', async () => {
  const root = { innerHTML: '' };
  const context = { document: { getElementById: () => root }, fetch: async () => ({ok:true,json:async()=>({currentElo:2100,targetElo:null,matchesToTarget:4,history:[{elo:2000,recordedAt:'2026-01-01T00:00:00Z'},{elo:2100,recordedAt:'2026-01-20T00:00:00Z'}]})}) };
  context.window = context;
  vm.runInNewContext(fs.readFileSync('src/elo-forecast.js','utf8'),context);
  await context.EloForecast.load('player');
  assert.match(root.innerHTML, /Recorded ELO/);
  assert.match(root.innerHTML, /Highest FACEIT level reached/);
  assert.match(root.innerHTML, /\+100/);
  assert.match(root.innerHTML, /<svg/);
  assert.doesNotMatch(root.innerHTML, /~4 matches|HIGH CONFIDENCE|forecast\)/);
});
