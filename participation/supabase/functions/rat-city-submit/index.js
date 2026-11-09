// Public survey endpoint. Only the server invokes the database writer.
const PUBLIC_BROWSER_KEY = 'sb_publishable_Pg-QvF90n_mHhjXd2GBsKg_yU0XAVTU';
const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:cors});
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return json({error:'Method not allowed'},405);
  if(req.headers.get('apikey')!==PUBLIC_BROWSER_KEY)return json({error:'Invalid application key'},401);
  try{
    // Bound the request before parsing; the survey comment itself is <=500 chars.
    const reader=req.body?.getReader();if(!reader)return json({error:'Missing body'},400);
    const chunks=[];let size=0;
    for(;;){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>8192){await reader.cancel();return json({error:'Request too large'},413)}chunks.push(value)}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
    let body;try{body=JSON.parse(new TextDecoder().decode(bytes))}catch{return json({error:'Invalid JSON'},400)}
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if(!body||typeof body!=='object'||!uuid.test(body.p_request_id)||!uuid.test(body.p_client_id)||!/^\d{5}$/.test(body.p_zip)||!['low','moderate','high'].includes(body.p_rating)||typeof body.p_comment!=='string'||[...body.p_comment].length>500)return json({error:'Invalid submission'},400);
    const params={p_request_id:body.p_request_id,p_client_id:body.p_client_id,p_zip:body.p_zip,p_rating:body.p_rating,p_comment:body.p_comment.trim()};
    const url=Deno.env.get('SUPABASE_URL'),secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if(!url||!secret)return json({error:'Submission service not configured'},503);
    const response=await fetch(url+'/rest/v1/rpc/rat_city_submit',{method:'POST',headers:{apikey:secret,Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify(params),signal:AbortSignal.timeout(12000)});
    const result=await response.json();
    if(!response.ok){const message=String(result.message||'');if(/wait 30 seconds/i.test(message))return json({error:'Please wait 30 seconds before another submission'},429);if(/outside map coverage|Invalid rating|too long|already used/i.test(message))return json({error:'Invalid submission'},400);return json({error:'Unable to save response'},503)}
    return json(result);
  }catch{return json({error:'Unable to save response. Please try again.'},503)}
});
