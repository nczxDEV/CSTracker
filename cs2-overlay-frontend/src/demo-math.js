/* Shared replay math; also exercised directly by Node regression tests. */
(function (root) {
  function interpolateYaw(from, to, fraction) {
    if (!Number.isFinite(from)) return Number.isFinite(to) ? to : 0;
    if (!Number.isFinite(to)) return from;
    const delta = ((to - from + 180) % 360 + 360) % 360 - 180;
    return from + delta * Math.max(0, Math.min(1, fraction));
  }
  function radarPointer(clientX,clientY,rect,width,height,zoom,panX,panY) {
    return {x:((clientX-rect.left)*width/rect.width-width/2-panX)/zoom+width/2,
      y:((clientY-rect.top)*height/rect.height-height/2-panY)/zoom+height/2};
  }
  function pointInPolygon(x,y,points) {
    let inside=false;
    for(let i=0,j=points.length-1;i<points.length;j=i++){
      const [ax,ay]=points[i],[bx,by]=points[j];
      if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
    }
    return inside;
  }
  function calloutAt(zones,x,y,threshold=null,lower=false) {
    const matches=zones.filter(zone=>{
      const a=zone.MinBound,b=zone.MaxBound;
      return a&&b&&x>=a.X&&x<=b.X&&y>=a.Y&&y<=b.Y&&
        (threshold==null||(lower?a.Z<threshold:b.Z>=threshold));
    }).sort((a,b)=>(a.MaxBound.X-a.MinBound.X)*(a.MaxBound.Y-a.MinBound.Y)-(b.MaxBound.X-b.MinBound.X)*(b.MaxBound.Y-b.MinBound.Y));
    const zone=matches[0];
    return zone ? (zone.EnglishName || zone.Name.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ')) : null;
  }
  // Pure lookup: the result depends only on the requested tick, never seek direction.
  function framePair(frames, tick) {
    if (!frames?.length) return null;
    let low = 0, high = frames.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (frames[mid].tick <= tick) low = mid; else high = mid - 1;
    }
    const before = frames[low], after = frames[Math.min(low + 1, frames.length - 1)];
    const fraction = after.tick > before.tick ? Math.max(0, Math.min(1, (tick - before.tick) / (after.tick - before.tick))) : 0;
    return { before, after, fraction };
  }
  function roundScore(rounds, current, tick) {
    const ct = new Set(current.ctPlayerIds || []), t = new Set(current.tPlayerIds || []);
    let ctScore = 0, tScore = 0;
    const previous = rounds.filter(r => r.number < current.number).sort((a,b)=>a.number-b.number);
    // A partial recording cannot establish the missing rounds' score.
    if (previous.length && previous[0].number !== 1 || !previous.length && current.number !== 1) return null;
    for (let i=1;i<previous.length;i++) if(previous[i].number!==previous[i-1].number+1)return null;
    if (previous.length && previous.at(-1).number !== current.number-1) return null;
    for (const r of [...previous, ...(tick >= current.endTick ? [current] : [])]) {
      if (r.isKnifeRound) continue;
      const ids = r.winnerSide === 'counter-terrorist' ? r.ctPlayerIds : r.winnerSide === 'terrorist' ? r.tPlayerIds : null;
      if (!ids?.length) return null;
      const a=ids.filter(id=>ct.has(id)).length, b=ids.filter(id=>t.has(id)).length;
      if (a===b || Math.max(a,b)<Math.ceil(ids.length/2)) return null;
      if(a>b)ctScore++;else tScore++;
    }
    return {ct:ctScore,t:tScore};
  }
  function timelineEvents(events, start, end) {
    return events.filter(e=>['kill','grenade','bomb'].includes(e.kind) && Number.isFinite(e.tick) && e.tick>=start && e.tick<=end)
      .map(e=>({...e,position:100*(e.tick-start)/Math.max(1,end-start)}));
  }
  const api = { interpolateYaw, radarPointer, pointInPolygon, calloutAt, framePair, roundScore, timelineEvents };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DemoMath = api;
})(globalThis);
