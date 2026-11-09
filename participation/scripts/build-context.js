/* Prepare local metropolitan background and Chelsea street context. */
const fs=require('fs');const path=require('path');const root=path.resolve(__dirname,'..');
const rect={xmin:-74.60,ymin:40.15,xmax:-73.25,ymax:41.20};
const land=JSON.parse(fs.readFileSync('/tmp/ne_land.geojson'));
const roads=JSON.parse(fs.readFileSync('/tmp/ne_roads.geojson'));
const chelsea=JSON.parse(fs.readFileSync('/tmp/chelsea_streets.geojson'));
function clipRing(input){let poly=input.slice();for(const [edge,inside,intersect] of [
  ['left',p=>p[0]>=rect.xmin,(a,b)=>[rect.xmin,a[1]+(b[1]-a[1])*(rect.xmin-a[0])/(b[0]-a[0])]],
  ['right',p=>p[0]<=rect.xmax,(a,b)=>[rect.xmax,a[1]+(b[1]-a[1])*(rect.xmax-a[0])/(b[0]-a[0])]],
  ['bottom',p=>p[1]>=rect.ymin,(a,b)=>[a[0]+(b[0]-a[0])*(rect.ymin-a[1])/(b[1]-a[1]),rect.ymin]],
  ['top',p=>p[1]<=rect.ymax,(a,b)=>[a[0]+(b[0]-a[0])*(rect.ymax-a[1])/(b[1]-a[1]),rect.ymax]]]){
    const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ina=inside(a),inb=inside(b);if(ina&&inb)out.push(b);else if(ina&&!inb)out.push(intersect(a,b));else if(!ina&&inb){out.push(intersect(a,b));out.push(b)}}poly=out;if(!poly.length)break
  }if(poly.length>2)poly.push(poly[0]);return poly
}
let clipped=[];for(const feature of land.features){const polys=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;for(const poly of polys){const rings=poly.map(clipRing).filter(r=>r.length>=4);if(rings.length)clipped.push(rings)}}
const roadFeatures=roads.features.filter(f=>{if(!['Major Highway','Secondary Highway','Beltway'].includes(f.properties.type))return false;let match=false;const visit=c=>{if(typeof c[0]==='number'){if(c[0]>=rect.xmin&&c[0]<=rect.xmax&&c[1]>=rect.ymin&&c[1]<=rect.ymax)match=true}else c.forEach(visit)};visit(f.geometry.coordinates);return match}).map(f=>({type:'Feature',geometry:f.geometry,properties:{name:f.properties.name||'',type:f.properties.type,rank:f.properties.scalerank}}));
const streetFeatures=chelsea.features.filter(f=>f.geometry&&f.geometry.coordinates).map(f=>({type:'Feature',geometry:f.geometry,properties:{name:f.properties.stname_label||''}}));
const context={type:'FeatureCollection',features:[{type:'Feature',properties:{kind:'land'},geometry:{type:'MultiPolygon',coordinates:clipped}},...roadFeatures.map(f=>({...f,properties:{...f.properties,kind:'road'}}))]};
fs.writeFileSync(path.join(root,'data/metro-context.geojson'),JSON.stringify(context));
fs.writeFileSync(path.join(root,'data/chelsea-streets.geojson'),JSON.stringify({type:'FeatureCollection',features:streetFeatures}));
console.log({landPolygons:clipped.length,roads:roadFeatures.length,chelseaStreets:streetFeatures.length});
