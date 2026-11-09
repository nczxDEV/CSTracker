(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.MatchView=api;})(globalThis,()=>{
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=(v,d=0,s='')=>finite(v)?v.toFixed(d)+s:'—';
  const all=s=>[...(s.teamA?.players||[]),...(s.teamB?.players||[])];
  function leaders(players,key){const available=players.filter(p=>finite(p[key]));if(!available.length)return [];const best=Math.max(...available.map(p=>p[key]));return available.filter(p=>p[key]===best);}
  function avatar(p){const url=String(p.avatar||'');return `<span class="mv-avatar">${/^https:\/\//.test(url)?`<img src="${esc(url)}" alt="" loading="lazy">`:esc((p.nickname||'?').slice(0,2))}</span>`;}
  function rank(p){return Number.isInteger(p.skillLevel)&&p.skillLevel>=1&&p.skillLevel<=10?`<img class="mv-level" src="assets/faceit-levels/level${p.skillLevel}.png" alt="FACEIT level ${p.skillLevel}" title="FACEIT roster level ${p.skillLevel}">`:'<span title="FACEIT level unavailable">—</span>';}
  const groups={
    Summary:[['kills','K'],['deaths','D'],['assists','A'],['diff','+/−'],['kd','K/D',2],['adr','ADR',1],['headshotsPercent','HS%',1,'%'],['spottedAccuracy','S. ACC.',1,'%'],['kast','KAST',1,'%'],['displayRating','FACEIT Rating',2]],
    Advanced:[['damage','Damage'],['kr','K/R',2],['headshots','HS'],['swing','Swing',2,'%'],['mvps','Round MVPs']],
    Utility:[['utilityDamage','Utility damage'],['utilityCount','Utility thrown'],['enemiesFlashed','Enemies flashed'],['flashCount','Flashes'],['flashAssists','Flash assists']],
    'First kill':[['firstKills','First kills'],['firstDeaths','First deaths'],['entryCount','Entry attempts'],['entryWins','Entry wins']],
    Trades:[['tradeKills','Trade kills'],['tradedDeaths','Traded deaths']],
    '1vX':[['clutchWins','1vX wins'],['oneVOneWins','1v1 wins'],['oneVTwoWins','1v2 wins']],
    Multikills:[['doubleKills','2K'],['tripleKills','3K'],['quadKills','4K'],['aces','5K']]
  };
  function value(p,key){return key==='diff'?(finite(p.kills)&&finite(p.deaths)?p.kills-p.deaths:null):p[key];}
  function table(team,group,mvps,ratingLabel){
    const columns=(groups[group]||groups.Summary).map(c=>c[0]==='displayRating'?[c[0],ratingLabel,2]:c);
    const players=[...(team.players||[])].sort((a,b)=>(finite(b.displayRating)?b.displayRating:-1)-(finite(a.displayRating)?a.displayRating:-1));
    return `<section class="mv-team"><header><strong class="mv-score ${team.won?'good':''}">${num(team.score)}</strong><h2>${esc(team.name)}</h2><span class="mv-result">${team.won===true?'WIN':team.won===false?'LOSS':'RESULT PENDING'}</span><small>Avg level ${num(team.avgSkillLevel,1)}</small></header>
      <div class="mv-table-scroll" tabindex="0" aria-label="${esc(team.name)} statistics"><table><thead><tr><th>Player</th><th>Rank</th>${columns.map(c=>`<th>${c[1]}</th>`).join('')}</tr></thead><tbody>${players.map(p=>`<tr class="${mvps.includes(p)?'mv-mvp-row':''}"><th scope="row"><span class="mv-player">${avatar(p)}<span>${esc(p.nickname)} ${mvps.includes(p)?'<b class="mv-star">★</b>':''}</span></span></th><td><span class="mv-rank">${rank(p)}${finite(p.elo)?`<small>${num(p.elo)}</small>`:''}</span></td>${columns.map(([key,label,d,s])=>`<td title="${esc(label)}${finite(value(p,key))?'':' unavailable from source'}"><span class="${key==='displayRating'&&finite(p[key])?'mv-rating '+(p[key]>=(ratingLabel==='CSTracker Rating / 100'?50:1)?'good':'bad'):''}">${num(value(p,key),d,s)}</span></td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
  }
  function render(summary,group='Summary'){
    if(!summary.ratingLabel){summary={...summary,ratingLabel:'FACEIT Rating',teamA:{...summary.teamA,players:(summary.teamA.players||[]).map(p=>({...p,displayRating:p.faceitRating}))},teamB:{...summary.teamB,players:(summary.teamB.players||[]).map(p=>({...p,displayRating:p.faceitRating}))}};}
    const ratingLabel=summary.ratingLabel;
    const players=all(summary),mvps=leaders(players,'displayRating'),hero=mvps[0];
    const partial=players.some(p=>!finite(p.displayRating));
    const spotlights=[['kills','Most kills'],['damage','Most damage'],['kast','Best KAST'],['firstKills','First kills']].map(([key,label])=>{
      const winners=leaders(players,key),p=winners[0];return `<div class="mv-highlight">${p?avatar(p):'<span class="mv-avatar">—</span>'}<span>${p?esc(winners.map(w=>w.nickname).join(' / ')):'Not supplied'}</span><div><strong>${p?num(p[key],key==='kast'?1:0,key==='kast'?'%':''):'—'}</strong><small>${label}</small></div></div>`;
    }).join('');
    const heroHtml=hero?`<div class="mv-profile">${avatar(hero)}<h2>${esc(hero.nickname)}</h2><span class="mv-rank">${rank(hero)}${finite(hero.elo)?num(hero.elo):''}</span></div><div class="mv-hero-stats"><span class="mv-rating good">${num(hero.displayRating,2)}</span><small>${esc(ratingLabel)}</small><div class="mv-hero-grid"><div><strong>${num(hero.swing,2,'%')}</strong><small>Swing</small></div><div><strong>${num(hero.adr,1)}</strong><small>ADR</small></div><div><strong>${num(hero.kills)}/${num(hero.deaths)}/${num(hero.assists)}</strong><small>K / D / A</small></div><div><strong>${num(hero.headshotsPercent,1,'%')}</strong><small>Headshots</small></div></div><p>${mvps.length>1?'Tied: '+esc(mvps.map(p=>p.nickname).join(', ')):'Highest '+esc(ratingLabel)}${partial?' · Some player ratings unavailable':''}</p></div><span class="mv-award">★ ${partial?'Rating leader':'MVP'}</span>`:
      `<div class="mv-no-rating"><span class="mv-star">☆</span><h2>MVP rating unavailable</h2><p>Not enough match statistics to calculate a rating. CSTracker Rating requires kills, deaths, assists, ADR and a valid round count. Refresh completed matches to retrieve available statistics.</p></div>`;
    return `<div class="mv"><header class="mv-match-heading"><div><small>${esc(summary.competitionName||'FACEIT match')} · ${esc(summary.map||'Map unavailable')}</small><h1>${esc(summary.teamA.name)} <span>${num(summary.teamA.score)} : ${num(summary.teamB.score)}</span> ${esc(summary.teamB.name)}</h1></div></header>
      <div class="mv-showcase"><section class="mv-hero">${heroHtml}</section><aside>${spotlights}</aside></div>
      <nav class="mv-tabs" aria-label="Match statistics">${Object.keys(groups).map(key=>`<button type="button" data-group="${key}" aria-pressed="${key===group}">${key}</button>`).join('')}</nav>
      ${group!=='Summary'&&!players.some(p=>groups[group]?.some(c=>finite(p[c[0]])))?'<p class="mv-notice">These statistics were not supplied for this match.</p>':''}
      ${table(summary.teamA,group,mvps,ratingLabel)}${table(summary.teamB,group,mvps,ratingLabel)}
      ${summary.trackerRatings?'<details class="mv-method"><summary>CSTracker Rating — calculation</summary><p>Our own 0–100 match score, calculated from FACEIT statistics without a demo. Not an official FACEIT or HLTV rating. Points: 40 × min(kills per round / 1.2, 1) + 35 × min(ADR / 150, 1) + 15 × min(assists per round / 0.4, 1) + 10 × (1 − deaths per round). Each component is capped. These are product-defined weights, not a calibrated skill estimate. Missing inputs remain unavailable; no KAST is guessed. MVP is the highest score across both teams, including ties. With incomplete coverage only a rating leader is shown.</p></details>':''}${summary.estimatedRatings?'<p class="mv-notice">Estimated 2.0 · unofficial — calculated from the explicitly linked local demo, matched by Steam ID. The table otherwise shows FACEIT statistics. Estimates use a 2021 CS:GO regression with approximate Impact, not official HLTV or FACEIT ratings. Partial demos and players joining or leaving can distort results. See Demo Studio’s stat board for the formula.</p>':''}<details class="mv-method"><summary>Data sources & definitions</summary><p>FACEIT Data API · FACEIT Rating is displayed only when supplied; it is not HLTV Rating. MVP is the highest available rating from the selected source across both teams, with equal ratings shown as a tie. Incomplete rating coverage is labelled “Rating leader”. Rank icons show the match roster level. Missing values stay —, never zero. K/D and K/R are provider values; +/− is kills minus deaths. Side splits, highlights and HLTV ratings are not available from this source.</p></details></div>`;
  }
  return {render,leaders,groups};
});
