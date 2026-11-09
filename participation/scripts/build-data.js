/* Converts official NYC Open Data GeoJSON into a self-contained map dataset.
   Inputs are downloaded official geometries; outputs contain synthetic feedback. */
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const boroughRaw=JSON.parse(fs.readFileSync('/tmp/nyc_boroughs.geojson'));
const zctaRaw=JSON.parse(fs.readFileSync('/tmp/nyc_zcta.geojson'));
const boroughs=boroughRaw.features.map(f=>({type:'Feature',geometry:f.geometry,properties:{name:f.properties.boroname,code:f.properties.borocode}}));
function inRing(point,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if(((a[1]>point[1])!==(b[1]>point[1]))&&(point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0]))inside=!inside}return inside}
function inGeometry(point,geometry){const polys=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;return polys.some(poly=>inRing(point,poly[0])&&!poly.slice(1).some(hole=>inRing(point,hole)))}
function allCoords(g){return g.type==='Polygon'?g.coordinates.flat():g.coordinates.flat(2)}
function bbox(g){const c=allCoords(g);return [Math.min(...c.map(p=>p[0])),Math.min(...c.map(p=>p[1])),Math.max(...c.map(p=>p[0])),Math.max(...c.map(p=>p[1]))]}
function random(seed){let s=seed>>>0;return()=>((s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296)}
function hash(s){let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
const zctas=[];const synthetic={};const boroughCounts={};
for(const f of zctaRaw.features){const p=f.properties;const zip=p.zcta5;const inside=[Number(p.intptlon),Number(p.intptlat)];const borough=boroughs.find(b=>inGeometry(inside,b.geometry));if(!borough)continue;const area=Number(p.arealand)||0;if(area<30000)continue;const feature={type:'Feature',geometry:f.geometry,properties:{zip,borough:borough.properties.name,interior:inside}};zctas.push(feature);
  const r=random(hash(zip)),baseline=.1+.8*r(),n=250+Math.round(r()*880);const spatialScore=Math.sin((inside[0]+74)*21)*.55+Math.cos((inside[1]-40.7)*26)*.45+(r()-.5)*.45;const mode=spatialScore<-.25?0:spatialScore>.25?2:1;let probabilities=mode===0?[.70,.20,.10]:mode===1?[.35,.35,.30]:[.15,.25,.60];const jitter=(r()-.5)*.15;probabilities=[Math.max(.05,probabilities[0]+jitter),probabilities[1],Math.max(.05,probabilities[2]-jitter)];const total=probabilities.reduce((a,b)=>a+b,0);const low=Math.round(n*probabilities[0]/total),moderate=Math.round(n*probabilities[1]/total),high=n-low-moderate;synthetic[zip]={count:{low,moderate,high},ratIndex:Math.round(25+baseline*72),comments:[]};boroughCounts[borough.properties.name]=(boroughCounts[borough.properties.name]||0)+1;
}
fs.mkdirSync(path.join(root,'data'),{recursive:true});
fs.writeFileSync(path.join(root,'data/boroughs.geojson'),JSON.stringify({type:'FeatureCollection',features:boroughs}));
fs.writeFileSync(path.join(root,'data/zctas.geojson'),JSON.stringify({type:'FeatureCollection',features:zctas}));
fs.writeFileSync(path.join(root,'data/synthetic-responses.json'),JSON.stringify(synthetic,null,2));
const contextFile=path.join(root,'data/metro-context.geojson'),streetFile=path.join(root,'data/chelsea-streets.geojson');
const context=fs.existsSync(contextFile)?JSON.parse(fs.readFileSync(contextFile)):null,chelseaStreets=fs.existsSync(streetFile)?JSON.parse(fs.readFileSync(streetFile)):null;
fs.writeFileSync(path.join(root,'data/map-data.js'),'window.NYC_MAP_DATA='+JSON.stringify({boroughs:{type:'FeatureCollection',features:boroughs},zctas:{type:'FeatureCollection',features:zctas},responses:synthetic,context,chelseaStreets})+';');
console.log(JSON.stringify({boroughs:boroughs.length,zctas:zctas.length,byBorough:boroughCounts,syntheticResponses:Object.values(synthetic).reduce((s,d)=>s+d.count.low+d.count.moderate+d.count.high,0)},null,2));
