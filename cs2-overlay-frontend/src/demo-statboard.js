(()=>{
  const $=id=>document.getElementById(id), el=(tag,text,cls='')=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n;};
  const num=(v,d=0)=>Number.isFinite(v)?v.toFixed(d):'—';
  window.DemoStatboard={render(summary,round){
    const content=$('demo-stat-content');content.replaceChildren();
    const players=(summary.playerStats||[]).filter(p=>p.rounds_played>0);
    if(!players.length){content.append(el('p','This older replay has no detailed match statistics. Import the original .dem again to calculate them. Your saved replay remains available.'));return;}
    const winners=DemoReview.leaders(players),complete=players.every(p=>DemoReview.estimatedRating(p)!==null);
    const hero=el('section','','demo-mvp');
    hero.append(el('small',complete?'★ MATCH MVP · ESTIMATED 2.0':'★ RATING LEADER · PARTIAL COVERAGE'));
    hero.append(el('h2',winners.length?winners.map(w=>w.player.name).join(' · '):'Rating unavailable'));
    if(winners.length){hero.append(el('strong',num(winners[0].rating,2),'demo-mvp-rating'));hero.append(el('p',`${winners.length>1?'Tied highest':'Highest'} unofficial estimate across the recorded match. Not an HLTV award.`));}
    content.append(hero);
    const columns=[['kills','K'],['deaths','D'],['assists','A'],['adr','ADR',1],['kast','KAST %',1],['headshot_pct','HS %',1],['opening_kills','Opening K'],['traded_deaths','Traded D'],['utility_damage','Utility dmg'],['flash_duration_dealt','Enemy flash s',1]];
    const ordered=[...players].sort((a,b)=>(DemoReview.estimatedRating(b)??-Infinity)-(DemoReview.estimatedRating(a)??-Infinity));
    const wrap=el('div','','demo-stat-table-wrap'),table=el('table'),head=el('thead'),tr=el('tr');
    for(const label of ['Player','Side now','Rounds',...columns.map(c=>c[1]),'Estimated 2.0'])tr.append(el('th',label));
    head.append(tr);table.append(head);const body=el('tbody');
    for(const p of ordered){const row=el('tr'),isMvp=winners.some(w=>w.player===p);row.append(el('th',`${isMvp?'★ ':''}${p.name}`));row.lastChild.scope='row';
      const id=String(p.steamid),side=round.ctPlayerIds?.includes(id)?'CT':round.tPlayerIds?.includes(id)?'T':'—';
      row.append(el('td',side),el('td',num(p.rounds_played)));
      for(const [key,,d]of columns)row.append(el('td',num(p[key],d||0)));
      row.append(el('td',num(DemoReview.estimatedRating(p),2),'demo-rating'));body.append(row);
    }
    table.append(body);wrap.append(table);content.append(wrap);
    const note=el('details'),title=el('summary','Calculation & data source');note.append(title);
    note.append(el('p','Local demo statistics · awpy 3.1.1 · Knife rounds excluded. KAST uses a 5.25-second trade window. These are full recorded-match totals, not statistics up to the playhead. Players are identified from kill/damage events and assumed to have played every recorded round; joiners, leavers, partial recordings and small samples can produce misleading estimates.'));
    note.append(el('p','Unofficial 2021 CS:GO regression: 0.0073 × KAST + 0.3591 × kills/round − 0.5329 × deaths/round + 0.2372 × estimated impact + 0.0032 × ADR + 0.1587. Estimated impact = 2.13 × kills/round + 0.42 × assists/round − 0.41. KAST is a percentage from 0 to 100. No CS2 calibration or separate CT/T weighting.'));
    const link=el('a','Read the original methodology');link.href='https://dave.xn--tckwe/posts/reverse-engineering-hltv-rating/';link.target='_blank';link.rel='noreferrer';note.append(link);content.append(note);
  }};
})();
