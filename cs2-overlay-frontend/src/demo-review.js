/* Local review calculations. No provider rating is fabricated or overwritten. */
(function(root){
  function estimatedRating(p){
    const keys=['rounds_played','kills','deaths','assists','kast','adr'];
    if(!keys.every(k=>Number.isFinite(p[k])&&p[k]>=0)||p.rounds_played<=0||p.kast>100)return null;
    const kpr=p.kills/p.rounds_played,dpr=p.deaths/p.rounds_played,apr=p.assists/p.rounds_played;
    const impact=2.13*kpr+0.42*apr-0.41;
    // Dave's 2021 regression, including its approximate Impact input.
    return 0.0073*p.kast+0.3591*kpr-0.5329*dpr+0.2372*impact+0.0032*p.adr+0.1587;
  }
  function leaders(players){
    const rated=players.map(p=>({player:p,rating:estimatedRating(p)})).filter(p=>p.rating!==null);
    if(!rated.length)return [];
    const max=Math.max(...rated.map(p=>Math.round(p.rating*100)));
    return rated.filter(p=>Math.round(p.rating*100)===max);
  }
  function loopTick(tick,start,end){
    if(![tick,start,end].every(Number.isFinite)||end<=start)return tick;
    return tick>=end?start+(tick-start)%(end-start):tick;
  }
  const api={estimatedRating,leaders,loopTick};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DemoReview=api;
})(globalThis);
