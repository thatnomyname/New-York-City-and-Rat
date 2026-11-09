/* WebGL-free geographic map. Official NYC polygons + ZIP-aggregated community feedback.
   Self-contained SVG implementation; works even from a local file:// URL. */
(function(){
  const source=window.NYC_MAP_DATA;
  if(!source){console.error('Map bundle missing: data/map-data.js');return}
  const svgNS='http://www.w3.org/2000/svg';
  const boroughs=source.boroughs.features,zctas=source.zctas.features;
  const zctaByZip=new Map(zctas.map(f=>[f.properties.zip,f]));
  const pxy=([lon,lat])=>[(lon+74.28)*1600,(40.94-lat)*1800];
  function walkCoordinates(geometry,cb){const rec=c=>typeof c[0]==='number'?cb(c):c.forEach(rec);rec(geometry.coordinates)}
  function bounds(geometry){let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;walkCoordinates(geometry,p=>{const [x,y]=pxy(p);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y)});return{x0,y0,x1,y1}}
  function pathOf(g,project=pxy){const polys=g.type==='Polygon'?[g.coordinates]:g.coordinates;const out=[];for(const rings of polys)for(const ring of rings){if(!ring.length)continue;out.push('M'+ring.map(p=>{const [x,y]=project(p);return x.toFixed(1)+' '+y.toFixed(1)}).join('L')+'Z')}return out.join('')}
  function linePathOf(g,project=pxy){const lines=g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:[];return lines.filter(l=>l.length>=2).map(line=>'M'+line.map(p=>{const [x,y]=project(p);return x.toFixed(1)+' '+y.toFixed(1)}).join('L')).join('')}
  function hash(s){let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
  function rng(seed){let s=seed>>>0;return()=>((s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296)}
  function inRing(p,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside}return inside}
  function inPolygon(p,g){const polys=g.type==='Polygon'?[g.coordinates]:g.coordinates;return polys.some(poly=>inRing(p,poly[0])&&!poly.slice(1).some(hole=>inRing(p,hole)))}
  let svg,boroughGroup,zipGroup,dotGroup,labelGroup,selectionGroup,viewport;
  const overviewCenter={x:450,y:395},overview={x:-150,y:-269,w:1200,h:1328};let view={...overview},active=null,lastShownZip=null,animationFrame=null;
  function overviewView(){if(!viewport?.clientWidth||!viewport?.clientHeight)return{...overview};const h=overview.w*viewport.clientHeight/viewport.clientWidth;return{...overview,x:overviewCenter.x-overview.w/2,y:overviewCenter.y-h/2,h}}
  const zipBounds=new Map(zctas.map(f=>[f.properties.zip,bounds(f.geometry)]));
  function el(tag,attrs={}){const node=document.createElementNS(svgNS,tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,String(v));return node}
  function unit(){if(Object.values(state.feedback).reduce((n,d)=>n+d.count.low+d.count.moderate+d.count.high,0)<5000)return 1;const scale=overview.w/view.w;return scale>=3.5?1:scale>=1.7?5:20}
  function setViewBox(){svg.setAttribute('viewBox',`${view.x} ${view.y} ${view.w} ${view.h}`);$('dot-value').textContent=`1 dot = ${unit()} response${unit()===1?'':'s'}`;paintSelection()}
  function paintSelection(){
    if(!selectionGroup)return;selectionGroup.replaceChildren();
    zipGroup.querySelectorAll('path').forEach(p=>p.classList.toggle('selected',p.dataset.zip===lastShownZip));
    const f=zctaByZip.get(lastShownZip);
    if(!f)return;
    const d=pathOf(f.geometry);
    selectionGroup.append(el('path',{d,class:'selected-zip-halo','fill-rule':'evenodd','vector-effect':'non-scaling-stroke'}),el('path',{d,class:'selected-zip-outline','fill-rule':'evenodd','vector-effect':'non-scaling-stroke'}));
    const [x,y]=pxy(f.properties.interior),px=view.w/Math.max(1,viewport.clientWidth);
    const badge=el('g',{class:'selected-zip-label'});
    badge.appendChild(el('rect',{x:x-42*px,y:y-14*px,width:84*px,height:28*px,rx:7*px}));
    const label=el('text',{x,y:y+4*px,'font-size':12*px});label.textContent='ZIP '+lastShownZip;badge.appendChild(label);selectionGroup.appendChild(badge);
  }
  function animateTo(target,duration=650){if(animationFrame)cancelAnimationFrame(animationFrame);const start={...view},begin=performance.now();function tick(now){const t=Math.min(1,(now-begin)/duration),e=1-Math.pow(1-t,3);view={x:start.x+(target.x-start.x)*e,y:start.y+(target.y-start.y)*e,w:start.w+(target.w-start.w)*e,h:start.h+(target.h-start.h)*e};setViewBox();if(t<1)animationFrame=requestAnimationFrame(tick);else{animationFrame=null;refresh()}}animationFrame=requestAnimationFrame(tick)}
  function focusBounds(b,margin=1.2){const cx=(b.x0+b.x1)/2,cy=(b.y0+b.y1)/2;const ratio=viewport.clientWidth/Math.max(1,viewport.clientHeight);let w=Math.max(75,(b.x1-b.x0)*margin),h=Math.max(75,(b.y1-b.y0)*margin);if(w/h>ratio)h=w/ratio;else w=h*ratio;animateTo({x:cx-w/2,y:cy-h/2,w,h})}
  function visible(b){return !(b.x0>view.x+view.w||b.x1<view.x||b.y0>view.y+view.h||b.y1<view.y)}
  function buildDots(){const u=unit(),out=[];for(const f of zctas){const b=zipBounds.get(f.properties.zip);if(!visible(b))continue;const d=state.feedback[f.properties.zip];if(!d)continue;for(const rating of ['low','moderate','high']){if(state.mapFilter!=='all'&&rating!==state.mapFilter)continue;const r=rng(hash(f.properties.zip+'-'+rating));const desired=Math.round(d.count[rating]/u),radius=Math.max(.5,2.3*view.w/Math.max(1,viewport.clientWidth));let count=0,tries=0;while(count<desired&&tries<desired*70+200){tries++;const coord=[f.properties.interior[0],f.properties.interior[1]];const x=b.x0+r()*(b.x1-b.x0),y=b.y0+r()*(b.y1-b.y0);const lon=x/1600-74.28,lat=40.94-y/1800;coord[0]=lon;coord[1]=lat;if(!inPolygon(coord,f.geometry))continue;const fill=rating==='low'?'#6fd77a':rating==='moderate'?'#f3d64a':'#e34942';out.push(`<circle data-rating="${rating}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius.toFixed(2)}" fill="${fill}" stroke="#ffffffa8" stroke-width="${Math.max(.25,radius*.18).toFixed(2)}"/>`);count++}}}dotGroup.innerHTML=out.join('')}
  function refresh(){const closeScale=overview.w/view.w>=1.3;zipGroup.style.display=closeScale?'':'none';boroughGroup.style.pointerEvents=closeScale?'none':'';for(const name of ['Bronx','Manhattan','Queens','Brooklyn','Staten Island']){const node=labelGroup.querySelector(`[data-label="${name}"]`);if(node)node.style.display=closeScale?'none':''}setViewBox();buildDots();$('map-mode').textContent=active?active+' · Exploration':'NYC Overview'}
  function showBorough(name){const f=boroughs.find(b=>b.properties.name===name);if(!f)return;active=name;lastShownZip=null;closeDetails();focusBounds(bounds(f.geometry),1.25)}
  function showNeighborhood(entry){const features=entry.zips.map(z=>zctaByZip.get(z)).filter(Boolean);if(features.length){active=entry.borough;lastShownZip=null;closeDetails();const b=features.reduce((out,f)=>{const t=zipBounds.get(f.properties.zip);return{x0:Math.min(out.x0,t.x0),y0:Math.min(out.y0,t.y0),x1:Math.max(out.x1,t.x1),y1:Math.max(out.y1,t.y1)}},{x0:Infinity,y0:Infinity,x1:-Infinity,y1:-Infinity});focusBounds(b,1.5)}else showBorough(entry.borough)}
  function showZip(zip){const f=zctaByZip.get(zip);if(!f)return;lastShownZip=zip;active=zipBorough(zip);closeDetails();paintSelection();focusBounds(zipBounds.get(zip),1.65)}
  function reset(){active=null;lastShownZip=null;closeDetails();animateTo(overviewView())}
  function zoom(factor){if(animationFrame)cancelAnimationFrame(animationFrame);animationFrame=null;const c={x:view.x+view.w/2,y:view.y+view.h/2};let w=Math.max(45,Math.min(overview.w*1.2,view.w*factor)),h=w*viewport.clientHeight/viewport.clientWidth;view={x:c.x-w/2,y:c.y-h/2,w,h};active=active||'NYC';refresh()}
  function selectZip(zip){lastShownZip=zip;zipGroup.querySelectorAll('path').forEach(p=>p.classList.toggle('selected',p.dataset.zip===zip));paintSelection();openZip(zip)}
  function initialize(){
    viewport=$('map-viewport');view=overviewView();$('map-stage').style.display='none';svg=el('svg',{class:'svg-geo-map',viewBox:`${view.x} ${view.y} ${view.w} ${view.h}`,role:'img','aria-label':'Real NYC and surrounding metropolitan land, borough and ZCTA boundaries, and ZIP-level feedback dots'});viewport.appendChild(svg);
    const landGroup=el('g'),roadGroup=el('g'),contextLabels=el('g');boroughGroup=el('g');zipGroup=el('g');dotGroup=el('g',{'data-layer':'feedback-dots'});labelGroup=el('g');selectionGroup=el('g',{class:'geo-selection','data-layer':'selected-zip','aria-hidden':'true'});svg.append(landGroup,boroughGroup,roadGroup,zipGroup,dotGroup,contextLabels,labelGroup,selectionGroup);
    if(source.context){for(const f of source.context.features){if(f.properties.kind==='land'){landGroup.appendChild(el('path',{d:pathOf(f.geometry),class:'metro-land','fill-rule':'evenodd'}))}else if(f.properties.kind==='road'){roadGroup.appendChild(el('path',{d:linePathOf(f.geometry),class:'metro-road'}))}}}
    for(const [name,lon,lat] of [['New Jersey',-74.31,40.72],['Hudson River',-74.04,40.75],['Westchester',-73.82,40.97],['Long Island',-73.56,40.65]]){const [x,y]=pxy([lon,lat]);const t=el('text',{x,y,class:'context-label'});t.textContent=name;contextLabels.appendChild(t)}
    for(const f of boroughs){const path=el('path',{d:pathOf(f.geometry),class:'geo-borough','fill-rule':'evenodd'});const title=el('title');title.textContent=f.properties.name;path.appendChild(title);path.addEventListener('click',()=>{if(overview.w/view.w<1.3)showBorough(f.properties.name)});boroughGroup.appendChild(path)}
    for(const f of zctas){const path=el('path',{d:pathOf(f.geometry),class:'geo-zcta','fill-rule':'evenodd','data-zip':f.properties.zip});const title=el('title');title.textContent='ZIP '+f.properties.zip;path.appendChild(title);path.addEventListener('click',()=>selectZip(f.properties.zip));zipGroup.appendChild(path)}
    const names=[['Bronx',-73.88,40.85],['Manhattan',-73.972,40.774],['Queens',-73.805,40.729],['Brooklyn',-73.955,40.648],['Staten Island',-74.155,40.58]];
    for(const [name,lon,lat] of names){const [x,y]=pxy([lon,lat]);const t=el('text',{x,y,class:'geo-label','data-label':name});t.textContent=name;labelGroup.appendChild(t)}
    for(const f of zctas)state.feedback[f.properties.zip]={count:{low:0,moderate:0,high:0},comments:[],ratIndex:null};
    document.querySelector('.map-area').classList.add('svg-ready');
    MAP_ADAPTER.flyToBorough=showBorough;MAP_ADAPTER.flyToNeighborhood=showNeighborhood;MAP_ADAPTER.flyToZip=showZip;MAP_ADAPTER.refresh=refresh;MAP_ADAPTER.reset=reset;
    $('zoom-in').onclick=()=>zoom(.72);$('zoom-out').onclick=()=>{if(view.w>800)reset();else zoom(1.38)};
    $('reset-map').onclick=reset;
    let drag=null;svg.addEventListener('pointerdown',e=>{e.stopPropagation();drag={x:e.clientX,y:e.clientY,v:{...view},moved:false}});svg.addEventListener('pointermove',e=>{e.stopPropagation();if(!drag)return;const dx=(e.clientX-drag.x)*drag.v.w/viewport.clientWidth,dy=(e.clientY-drag.y)*drag.v.h/viewport.clientHeight;if(Math.abs(dx)+Math.abs(dy)>2)drag.moved=true;view={...drag.v,x:drag.v.x-dx,y:drag.v.y-dy};setViewBox()});svg.addEventListener('pointerup',e=>{e.stopPropagation();if(drag?.moved){e.preventDefault();refresh()}drag=null});svg.addEventListener('pointerleave',()=>{if(drag){drag=null;refresh()}});svg.addEventListener('pointercancel',()=>{drag=null;refresh()});svg.addEventListener('wheel',e=>{e.preventDefault();e.stopPropagation();zoom(e.deltaY>0?1.17:.86)},{passive:false});
    if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>{if(viewport.clientWidth>0&&viewport.clientHeight>0){view.h=view.w*viewport.clientHeight/viewport.clientWidth;setViewBox();refresh()}}).observe(viewport);
    refresh();
  }
  document.addEventListener('DOMContentLoaded',initialize);
  let miniEntry=null,miniObserver=null,miniSize='';
  function drawConfirmMiniMap(){
    const host=document.querySelector('.mini-map');
    if(!host||!miniEntry||host.clientWidth<1||host.clientHeight<1)return;
    const entry=miniEntry,candidates=entry.zips.map(z=>zctaByZip.get(z)).filter(Boolean);
    host.querySelector('svg')?.remove();host.querySelector('.mini-map-message')?.remove();
    if(!candidates.length){
      const message=document.createElement('p');message.className='mini-map-message';
      message.textContent='Map unavailable for this area. Please use the ZIP buttons below.';
      host.appendChild(message);return;
    }
    const width=host.clientWidth,height=host.clientHeight;
    miniSize=width+'x'+height;
    let bb={x0:Infinity,y0:Infinity,x1:-Infinity,y1:-Infinity};
    for(const f of candidates){const b=zipBounds.get(f.properties.zip);bb.x0=Math.min(bb.x0,b.x0);bb.y0=Math.min(bb.y0,b.y0);bb.x1=Math.max(bb.x1,b.x1);bb.y1=Math.max(bb.y1,b.y1)}
    // Fit real geography to a screen-pixel viewBox. Text and road widths must
    // not use geographic units, which previously magnified them over the ZIPs.
    const padding=28,scale=Math.min(Math.max(1,width-padding*2)/Math.max(1,bb.x1-bb.x0),Math.max(1,height-padding*2)/Math.max(1,bb.y1-bb.y0));
    const cx=(bb.x0+bb.x1)/2,cy=(bb.y0+bb.y1)/2;
    const screen=coord=>{const [x,y]=pxy(coord);return[width/2+(x-cx)*scale,height/2+(y-cy)*scale]};
    const frame={x0:cx-width/(2*scale),y0:cy-height/(2*scale),x1:cx+width/(2*scale),y1:cy+height/(2*scale)};
    const intersects=b=>!(b.x1<frame.x0||b.x0>frame.x1||b.y1<frame.y0||b.y0>frame.y1);
    const mini=el('svg',{class:'true-mini-svg',viewBox:`0 0 ${width} ${height}`,role:'group','aria-label':`${entry.name}: select your approximate ZIP area`});
    host.appendChild(mini);
    const land=el('g',{'aria-hidden':'true'}),neighbors=el('g',{'aria-hidden':'true'}),areas=el('g'),streets=el('g',{'aria-hidden':'true'}),outlines=el('g',{'aria-hidden':'true'}),roadLabels=el('g',{'aria-hidden':'true'}),zipLabels=el('g',{'aria-hidden':'true'});
    mini.append(land,neighbors,areas,streets,outlines,roadLabels,zipLabels);
    for(const f of (source.context?.features||[]))if(f.properties.kind==='land'&&intersects(bounds(f.geometry)))land.appendChild(el('path',{d:pathOf(f.geometry,screen),class:'mini-land','fill-rule':'evenodd'}));
    // Borough land fills the surroundings, avoiding floating ZIP polygons.
    for(const f of boroughs)if(intersects(bounds(f.geometry)))land.appendChild(el('path',{d:pathOf(f.geometry,screen),class:'mini-borough-land','fill-rule':'evenodd'}));
    const candidateZips=new Set(entry.zips);
    for(const f of zctas)if(!candidateZips.has(f.properties.zip)&&intersects(zipBounds.get(f.properties.zip)))neighbors.appendChild(el('path',{d:pathOf(f.geometry,screen),class:'mini-neighbor-zip','fill-rule':'evenodd'}));
    const occupied=[];
    for(const f of candidates){
      const zip=f.properties.zip,selected=state.selectedZipForForm===zip;
      const path=el('path',{d:pathOf(f.geometry,screen),class:'mini-real-zip'+(selected?' selected':''),'fill-rule':'evenodd','data-zip':zip,tabindex:'0',role:'button','aria-label':'Select ZIP '+zip,'aria-pressed':String(selected)});
      const title=el('title');title.textContent='Select ZIP '+zip;path.appendChild(title);
      path.addEventListener('click',()=>confirmZip(zip));
      path.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();confirmZip(zip)}});
      areas.appendChild(path);
      outlines.appendChild(el('path',{d:pathOf(f.geometry,screen),class:'mini-zip-outline'+(selected?' selected':''),'fill-rule':'evenodd'}));
      const [anchorX,anchorY]=screen(f.properties.interior);
      let x=Math.max(36,Math.min(width-36,anchorX)),y=Math.max(16,Math.min(height-16,anchorY)),box;
      const fits=(px,py)=>!occupied.some(b=>!(px+34<b.x0||px-34>b.x1||py+14<b.y0||py-14>b.y1));
      let placed=false;
      for(const dy of [0,-30,30,-60,60,-90,90]){for(const dx of [0,-70,70]){const px=Math.max(36,Math.min(width-36,anchorX+dx)),py=Math.max(16,Math.min(height-16,anchorY+dy));if(fits(px,py)){x=px;y=py;placed=true;break}}if(placed)break}
      box={x0:x-32,y0:y-12,x1:x+32,y1:y+12};occupied.push(box);
      const label=el('g',{class:'mini-zip-badge'});
      if(Math.hypot(x-anchorX,y-anchorY)>5)zipLabels.appendChild(el('path',{d:`M${anchorX} ${anchorY}L${x} ${y}`,class:'mini-label-leader'}));
      label.appendChild(el('rect',{x:box.x0,y:box.y0,width:64,height:24,rx:6}));
      const t=el('text',{x,y:y+4,class:'mini-zip-label'});t.textContent=zip;label.appendChild(t);zipLabels.appendChild(label);
    }
    document.querySelectorAll('#zip-choices .zip-choice').forEach(button=>button.classList.toggle('selected',button.textContent===state.selectedZipForForm));
    const roadData=entry.name==='Chelsea'&&entry.borough==='Manhattan'?(source.chelseaStreets?.features||[]):(source.context?.features||[]).filter(f=>f.properties.kind==='road');
    const labelCandidates=[];
    for(const f of roadData){
      if(!intersects(bounds(f.geometry)))continue;
      streets.appendChild(el('path',{d:linePathOf(f.geometry,screen),class:'mini-road'}));
      const name=f.properties.name;
      if(!name||name.length>23||/PEDESTRIAN|BIKE|RAMP|UNNAMED|LINK/i.test(name))continue;
      const lines=f.geometry.type==='LineString'?[f.geometry.coordinates]:f.geometry.type==='MultiLineString'?f.geometry.coordinates:[];
      for(const line of lines)for(let i=1;i<line.length;i++){
        const a=screen(line[i-1]),b=screen(line[i]),length=Math.hypot(b[0]-a[0],b[1]-a[1]);
        const x=(a[0]+b[0])/2,y=(a[1]+b[1])/2,labelWidth=name.length*5.4+8;
        if(length<labelWidth*.7||x-labelWidth/2<8||x+labelWidth/2>width-8||y<14||y>height-14)continue;
        labelCandidates.push({name,x,y,length,box:{x0:x-labelWidth/2,y0:y-9,x1:x+labelWidth/2,y1:y+9}});
      }
    }
    const shown=new Set();
    for(const item of labelCandidates.sort((a,b)=>b.length-a.length)){
      if(shown.size>=5)break;
      if(shown.has(item.name)||occupied.some(b=>!(item.box.x1+6<b.x0||item.box.x0-6>b.x1||item.box.y1+6<b.y0||item.box.y0-6>b.y1)))continue;
      occupied.push(item.box);shown.add(item.name);
      const text=el('text',{x:item.x,y:item.y+3,class:'mini-street-label'});text.textContent=item.name;roadLabels.appendChild(text);
    }
  }
  window.renderConfirmMiniMap=function(entry){
    const host=document.querySelector('.mini-map');if(!host)return;
    miniEntry=entry;miniSize='';host.classList.add('true-mini');drawConfirmMiniMap();
    // A hidden panel has no dimensions. Redraw once it opens or changes width.
    if(!miniObserver&&typeof ResizeObserver!=='undefined'){
      miniObserver=new ResizeObserver(()=>{if(host.clientWidth>0&&host.clientHeight>0&&miniSize!==host.clientWidth+'x'+host.clientHeight)drawConfirmMiniMap()});
      miniObserver.observe(host);
    }
  };
})();
