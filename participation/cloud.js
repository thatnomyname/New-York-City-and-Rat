/* Shared anonymous survey data. Every submission is confirmed by the server. */
(function(){
  const cfg=window.RAT_CITY_CLOUD_CONFIG||{};
  let client=null,channel=null,rows=new Map(),buffer=[],loading=false,refreshPromise=null,pollTimer=null,refreshTimer=null;
  let liveFeedback={},subscribed=false,configured=false,lastSynced=null;
  function status(message,kind='pending'){
    const node=$('cloud-status');if(!node)return;
    node.textContent=message;node.dataset.status=kind;node.classList.toggle('hidden',kind==='online');
  }
  function applyEvent(event,target=rows){const record=event.new;if(event.eventType==='DELETE'){if(event.old?.id)target.delete(event.old.id)}else if(record?.id)target.set(record.id,record)}
  function aggregate(){
    const feedback={};for(const z of zipCatalog)feedback[z.zip]={count:{low:0,moderate:0,high:0},comments:[],ratIndex:null};
    for(const row of rows.values()){
      if(!feedback[row.zip]||!Object.hasOwn(ratings,row.rating))continue;
      const item=feedback[row.zip];item.count[row.rating]++;
      if(row.comment)item.comments.push({id:row.id,rating:row.rating,text:row.comment,createdAt:row.created_at});
    }
    for(const item of Object.values(feedback))item.comments.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')||b.id.localeCompare(a.id));
    liveFeedback=feedback;
    state.feedback=liveFeedback;updateEmptyState();MAP_ADAPTER.refresh();
    if(state.selectedZip){const panel=$('detail-panel'),scroll=panel.scrollTop;renderDetails();panel.scrollTop=scroll}
  }
  function updateEmptyState(){
    $('live-empty-state').classList.toggle('hidden',!lastSynced||rows.size>0);
  }
  function queuePaint(){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{aggregate();status(subscribed?'Live · connected':'Live · refreshing every 15 seconds','online')},120)}
  async function deadline(promise){let timer;try{return await Promise.race([promise,new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(new Error('Connection timed out. Your text is kept; please try again.')),15000)})])}finally{clearTimeout(timer)}}
  async function refresh(){
    if(!client)return;if(refreshPromise)return refreshPromise;
    loading=true;buffer=[];
    refreshPromise=(async()=>{
      try{
        const snapshot=new Map();let offset=0;
        for(;;){
          const{data,error}=await deadline(client.from('rat_feedback').select('id,zip,rating,comment,created_at').order('created_at',{ascending:true}).order('id',{ascending:true}).range(offset,offset+999));
          if(error)throw error;
          for(const row of data||[])snapshot.set(row.id,row);
          if((data||[]).length<1000)break;offset+=1000;
        }
        for(const event of buffer)applyEvent(event,snapshot);
        rows=snapshot;lastSynced=new Date();aggregate();
        status(subscribed?'Live · connected':'Live · refreshing every 15 seconds','online');return true;
      }catch(error){
        for(const event of buffer)applyEvent(event);aggregate();
        status(lastSynced?'Connection interrupted · showing last synced responses':'Unable to load shared responses. Check your connection.','offline');return false;
      }finally{loading=false;buffer=[];refreshPromise=null}
    })();return refreshPromise;
  }
  function browserId(){
    let value;try{value=localStorage.getItem('rat-city-browser-id')}catch{}
    if(!value){value=crypto.randomUUID();try{localStorage.setItem('rat-city-browser-id',value)}catch{}}
    return value;
  }
  const clientId=browserId();
  function requestId(payload){
    const fingerprint=JSON.stringify(payload);let old;
    try{old=JSON.parse(sessionStorage.getItem('rat-city-pending-submission')||'null')}catch{}
    if(old?.fingerprint===fingerprint&&old.id)return old.id;
    const id=crypto.randomUUID();try{sessionStorage.setItem('rat-city-pending-submission',JSON.stringify({id,fingerprint}))}catch{}return id;
  }
  async function submit(payload){
    if(!configured||!client)throw new Error('Shared responses are not connected yet.');
    const id=requestId(payload);
    const{data,error}=await deadline(client.functions.invoke('rat-city-submit',{body:{p_request_id:id,p_client_id:clientId,p_zip:payload.zip,p_rating:payload.rating,p_comment:payload.comment}}));
    if(error){
      let reason=error.message||'';try{if(error.context?.json)reason=(await error.context.json()).error||reason}catch{}
      if(/wait|rate|too many/i.test(reason))throw new Error('Please wait 30 seconds before submitting another response.');
      throw new Error('Your response could not be confirmed. Your text is kept; please try again.');
    }
    const row=Array.isArray(data)?data[0]:data;
    if(!row?.id)throw new Error('The server did not confirm your response. Please try again.');
    // Upsert by UUID: a realtime echo or retry cannot count the same row twice.
    applyEvent({eventType:'INSERT',new:row});if(loading)buffer.push({eventType:'INSERT',new:row});
    try{sessionStorage.removeItem('rat-city-pending-submission')}catch{}
    lastSynced=new Date();aggregate();status('Live · connected','online');return row;
  }
  function initCloud(){
    aggregate();
    const url=cfg.supabaseUrl||'',key=cfg.publishableKey||'';
    configured=/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)&&key.startsWith('sb_publishable_')&&typeof window.supabase?.createClient==='function';
    if(!configured){status('Unable to connect to shared responses. Please reload the page or check your connection.','offline');return}
    client=window.supabase.createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    status('Connecting to shared responses…');
    channel=client.channel('rat-city-public-feedback').on('postgres_changes',{event:'*',schema:'public',table:'rat_feedback'},event=>{
      if(loading)buffer.push(event);else{applyEvent(event);queuePaint()}
    }).subscribe(value=>{
      subscribed=value==='SUBSCRIBED';
      if(subscribed)refresh();else if(value==='CHANNEL_ERROR'||value==='TIMED_OUT'||value==='CLOSED')status(lastSynced?'Live · refreshing every 15 seconds':'Connecting to shared responses…',lastSynced?'online':'pending');
    });
    refresh();
    pollTimer=setInterval(()=>{if(!document.hidden)refresh()},Math.max(5000,Number(cfg.pollingIntervalMs)||15000));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
    window.addEventListener('online',refresh);
    window.addEventListener('offline',()=>status('Offline · showing last synced responses','offline'));
    window.addEventListener('pagehide',event=>{if(event.persisted)return;clearInterval(pollTimer);clearTimeout(refreshTimer);if(channel)client.removeChannel(channel)});
  }
  window.RAT_CLOUD={submit,refresh,get configured(){return configured}};
  document.addEventListener('DOMContentLoaded',initCloud);
})();
