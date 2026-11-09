/* Shared, versioned local match model. Never join by nickname, score, map or time. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.PlayerHQModel=api;})(globalThis,()=>{
  const empty=()=>({version:1,profiles:{},links:{},journal:[],metrics:{},details:{}});
  function migrate(value){
    if(value==null)return empty();
    if(value.version!==1 || !value.profiles || !value.links || !Array.isArray(value.journal))throw new Error('Unsupported or damaged HQ data. Original data has been preserved.');
    return {...empty(),...value};
  }
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  function merge(existing,incoming){return [...new Map([...existing,...incoming].map(r=>[r.id,r])).values()].sort((a,b)=>(Date.parse(b.playedAt)||0)-(Date.parse(a.playedAt)||0)).slice(0,1000);}
  function online(item,identifier,fetchedAt){const ratings=typeof module==='object'?require('./match-ratings.js'):globalThis.MatchRatings;return {
    trackerRating:ratings.trackerRating(item,{teamA:{score:item.teamScore},teamB:{score:item.opponentScore}}),
    id:`faceit:${item.matchId}`,externalId:item.matchId,identifier,source:'faceit-api',
    playedAt:item.finishedAt||item.startedAt||null,fetchedAt,
    map:item.map||null,result:['W','L'].includes(item.result)?item.result:null,
    teammates:item.teammates||[],side:null,kills:finite(item.kills)?item.kills:null,
    deaths:finite(item.deaths)?item.deaths:null,rating:finite(item.faceitRating)?item.faceitRating:null,
    label:item.opponentTeamName||'FACEIT match',score:item.teamScore==null||item.opponentScore==null?'—':`${item.teamScore}:${item.opponentScore}`
  };}
  function link(state,matchId,demoId,confirmed,now=new Date().toISOString()){
    if(!confirmed)throw new Error('An explicit match confirmation is required.');
    const owner=Object.entries(state.links).find(([id,v])=>id!==matchId&&v.demoId===demoId);
    if(owner)throw new Error('This demo is already linked to another match. Remove that link first.');
    state.links[matchId]={demoId,method:'user-confirmed',confirmedAt:now};
  }
  function filter(records,f={}){return records.filter(r=>{
    const time=Date.parse(r.playedAt);
    return (!f.from||(Number.isFinite(time)&&time>=Date.parse(f.from)))&&
      (!f.to||(Number.isFinite(time)&&time<Date.parse(f.to)+86400000))&&
      (!f.map||r.map===f.map)&&(!f.teammate||(r.teammates||[]).some(t=>t.toLowerCase().includes(f.teammate.toLowerCase())));
  });}
  function aggregate(records){
    const results=records.filter(r=>r.result==='W'||r.result==='L'),ratings=records.map(r=>r.rating).filter(finite);
    const kd=records.filter(r=>finite(r.kills)&&finite(r.deaths));
    return {matches:records.length,resultSample:results.length,winRate:results.length?results.filter(r=>r.result==='W').length/results.length*100:null,
      ratingSample:ratings.length,rating:ratings.length?ratings.reduce((a,b)=>a+b,0)/ratings.length:null,
      kdSample:kd.length,kd:kd.reduce((n,r)=>n+r.deaths,0)>0?kd.reduce((n,r)=>n+r.kills,0)/kd.reduce((n,r)=>n+r.deaths,0):null};
  }
  function compare(records,days,now=Date.now()){
    const span=days*86400000;
    return {recent:aggregate(records.filter(r=>{const t=Date.parse(r.playedAt);return t<=now&&t>now-span;})),
      baseline:aggregate(records.filter(r=>{const t=Date.parse(r.playedAt);return t<=now-span&&t>now-2*span;}))};
  }
  function demoStats(rows,playerId,side=''){
    const selected=rows.filter(r=>r.playerId===playerId&&(!side||r.side===side));
    const survival=selected.filter(r=>typeof r.survived==='boolean');
    return {rounds:selected.length,kills:selected.reduce((n,r)=>n+r.kills,0),deaths:selected.reduce((n,r)=>n+r.deaths,0),
      openingKills:selected.filter(r=>r.openingKill).length,openingDeaths:selected.filter(r=>r.openingDeath).length,
      tradeKills:selected.reduce((n,r)=>n+r.tradeKills,0),tradedDeaths:selected.reduce((n,r)=>n+r.tradedDeaths,0),
      survival:survival.length?survival.filter(r=>r.survived).length/survival.length*100:null,survivalSample:survival.length,
      throws:selected.reduce((n,r)=>n+r.utilityThrows,0)};
  }
  return {empty,migrate,online,link,filter,aggregate,compare,demoStats,merge};
});
