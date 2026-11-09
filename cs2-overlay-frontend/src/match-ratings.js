(function(root){
  const math=typeof module==='object'?require('./demo-review.js'):root.DemoReview;
  function trackerRating(p,summary){
    const scores=[summary.teamA?.score,summary.teamB?.score];
    const rounds=Number.isInteger(p.roundsPlayed)&&p.roundsPlayed>0?p.roundsPlayed:
      scores.every(v=>Number.isInteger(v)&&v>=0)?scores[0]+scores[1]:null;
    if(!rounds||!['kills','deaths','assists','adr'].every(k=>Number.isFinite(p[k])&&p[k]>=0)||p.deaths>rounds)return null;
    const score=40*Math.min(p.kills/rounds/1.2,1)+35*Math.min(p.adr/150,1)+15*Math.min(p.assists/rounds/0.4,1)+10*(1-p.deaths/rounds);
    return Math.round(score*100)/100;
  }
  function enrich(summary,demo){
    const players=[...(summary.teamA?.players||[]),...(summary.teamB?.players||[])];
    // Never rank official and estimated ratings against one another.
    const official=players.some(p=>Number.isFinite(p.faceitRating));
    const eligible=demo?.source==='local-demo' && demo.map===summary.map;
    const stats=eligible?(demo.playerStats||[]):[];
    const estimate=p=>{
      const matches=typeof p.steamId==='string'?stats.filter(s=>s.steamid===p.steamId):[];
      return matches.length===1?math.estimatedRating(matches[0]):null;
    };
    const useDemo=!official&&players.length>0&&players.every(p=>estimate(p)!==null);
    const label=official?'FACEIT Rating':useDemo?'Estimated 2.0 · unofficial':'CSTracker Rating / 100';
    const convert=p=>{
      let rating=p.faceitRating,source='FACEIT Rating';
      if(!official){
        rating=useDemo?Math.round(estimate(p)*100)/100:trackerRating(p,summary);
        source=label;
      }
      return {...p,displayRating:rating,ratingSource:source};
    };
    return {...summary,ratingLabel:label,estimatedRatings:useDemo,trackerRatings:!official&&!useDemo,
      teamA:{...summary.teamA,players:(summary.teamA?.players||[]).map(convert)},
      teamB:{...summary.teamB,players:(summary.teamB?.players||[]).map(convert)}};
  }
  if(typeof module==='object')module.exports={enrich,trackerRating};else root.MatchRatings={enrich,trackerRating};
})(globalThis);
