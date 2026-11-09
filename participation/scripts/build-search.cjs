// Build a local gazetteer from NYC DCP label points; no runtime geocoder.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),ctx={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'data/map-data.js'),'utf8'),ctx);
const map=ctx.window.NYC_MAP_DATA;
const names=JSON.parse(fs.readFileSync(path.join(root,'data/neighborhood-names.geojson'),'utf8'));
function ringContains(p,r){let inside=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside}return inside}
function contains(p,g){return(g.type==='Polygon'?[g.coordinates]:g.coordinates).some(poly=>ringContains(p,poly[0])&&!poly.slice(1).some(r=>ringContains(p,r)))}
const zipRecords=map.zctas.features.map(f=>({zip:f.properties.zip,borough:map.boroughs.features.find(b=>contains(f.properties.interior,b.geometry))?.properties.name||'New York City',geometry:f.geometry}));
function distance(p,g){if(contains(p,g))return 0;let best=Infinity;const scale=[84200,111200];for(const poly of(g.type==='Polygon'?[g.coordinates]:g.coordinates))for(const r of poly)for(let i=1;i<r.length;i++){const a=[(r[i-1][0]-p[0])*scale[0],(r[i-1][1]-p[1])*scale[1]],b=[(r[i][0]-p[0])*scale[0],(r[i][1]-p[1])*scale[1]],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,-(a[0]*dx+a[1]*dy)/(dx*dx+dy*dy||1)));best=Math.min(best,Math.hypot(a[0]+t*dx,a[1]+t*dy))}return best}
const aliases={
  Soho:['SoHo','So Ho','苏活区','苏豪区'],Dumbo:['DUMBO','Down Under the Manhattan Bridge Overpass'],
  'Greenwich Village':['The Village','格林威治村'],'West Village':['西村'],Chinatown:['China Town','唐人街'],
  'Upper East Side':['UES','上东区'],'Upper West Side':['UWS','上西区'],Harlem:['哈莱姆'],'Central Harlem':['Harlem','哈莱姆'],
  Williamsburg:['威廉斯堡'],Flushing:['法拉盛'],Chelsea:['切尔西'],Astoria:['阿斯托里亚'],
  'Park Slope':['公园坡'],'St. George':['Saint George'],'Clinton':['Hells Kitchen',"Hell’s Kitchen","Hell's Kitchen"],
  'Bedford Stuyvesant':['Bed Stuy','Bed-Stuy','Bedford-Stuyvesant'],'Financial District':['FiDi'],
  'Long Island City':['LIC','长岛市'],Tribeca:['TriBeCa'],Nolita:['NoLIta'],Noho:['NoHo']
};
const entries=names.features.map(f=>{const name=f.properties.Name,borough=f.properties.Borough,center=f.geometry.coordinates;const nearby=zipRecords.filter(z=>z.borough===borough).map(z=>({zip:z.zip,distance:distance(center,z.geometry)})).sort((a,b)=>a.distance-b.distance);const selected=nearby.filter((z,i)=>i===0||z.distance<=1000).slice(0,4);return{name,borough,center,zips:selected.map(z=>z.zip),aliases:aliases[name]||[],source:'NYC DCP Neighborhood Names'}});
// Every name remains searchable; each match offers nearby ZIPs for confirmation,
// rather than claiming that a label point defines a neighborhood boundary.
const payload={source:{title:'NYC DCP Neighborhood Names',item:'https://www.arcgis.com/home/item.html?id=a0eaeedf7e574d2cbf42919e142e7ced',url:'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/Neighborhood_Names/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson',retrieved:'2026-11-03',note:'Label points locate names, not definitive neighborhood boundaries. ZIP candidates are nearby polygons requiring user confirmation.'},neighborhoods:entries,zips:zipRecords.map(({zip,borough})=>({zip,borough}))};
fs.writeFileSync(path.join(root,'data/neighborhood-search.js'),'window.NYC_SEARCH_DATA='+JSON.stringify(payload)+';\n');
console.log(JSON.stringify({neighborhoods:entries.length,zips:payload.zips.length,missingCandidates:entries.filter(e=>!e.zips.length).map(e=>e.name)}));
