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
  const api = { interpolateYaw, radarPointer, pointInPolygon, calloutAt };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DemoMath = api;
})(globalThis);
