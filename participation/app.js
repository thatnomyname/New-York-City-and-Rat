/* RAT & CITY: local geographic search and shared cloud feedback. */
const $=id=>document.getElementById(id);
const ratings={low:'Not disruptive',moderate:'Moderately',high:'Highly disruptive'};
const neighborhoodCatalog=window.NYC_SEARCH_DATA?.neighborhoods||[];
const zipCatalog=window.NYC_SEARCH_DATA?.zips||[];
const state={selectedZip:null,selectedZipForForm:null,selectedNeighborhood:null,rating:null,shownComments:5,commentFilter:'all',mapFilter:'all',submitting:false,feedback:{}};
const MAP_ADAPTER={flyToBorough(){},flyToNeighborhood(){},flyToZip(){},refresh(){},reset(){}};
function counts(zip){return state.feedback[zip]?.count||{low:0,moderate:0,high:0}}
function percentages(zip){const c=counts(zip),total=c.low+c.moderate+c.high;return{total,low:Math.round(100*c.low/(total||1)),moderate:Math.round(100*c.moderate/(total||1)),high:Math.round(100*c.high/(total||1))}}
function zipBorough(zip){return zipCatalog.find(z=>z.zip===zip)?.borough||'New York City'}
function escapeHTML(str){return String(str).replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]))}
function filteredComments(zip){const comments=state.feedback[zip]?.comments||[];return state.commentFilter==='all'?comments:comments.filter(c=>c.rating===state.commentFilter)}
function openZip(zip){if(state.selectedZip!==zip)state.commentFilter='all';state.selectedZip=zip;state.shownComments=5;renderDetails()}
function closeDetails(){state.selectedZip=null;$('detail-panel').classList.add('hidden')}
function renderDetails(){
  const zip=state.selectedZip;if(!zip)return;
  const data=state.feedback[zip]||{count:counts(zip),comments:[],ratIndex:null},p=percentages(zip);
  const matching=filteredComments(zip),comments=matching.slice(0,state.shownComments);
  $('detail-panel').innerHTML=`<div class="detail-head"><div><h2>ZIP Code ${zip}</h2><p>${escapeHTML(zipBorough(zip))}, New York · ${p.total} responses</p></div><button type="button" class="close-detail" id="detail-close" aria-label="Close details">×</button></div>
    <div class="metric-grid"><div class="metric"><span>Responses</span><strong>${p.total}</strong><em>Community submissions</em></div><div class="metric"><span>Highly Disruptive</span><strong>${p.total?p.high+'%':'—'}</strong><em>Of submitted ratings</em></div></div>
    <h3>Residents' Feedback</h3><div class="feedback-bar"><i style="width:${p.low}%;background:#6fd77a"></i><i style="width:${p.moderate}%;background:#f3d64a"></i><i style="width:${p.high}%;background:#e34942"></i></div><div class="bar-key"><span>${p.low}% Low</span><span>${p.moderate}% Moderate</span><span>${p.high}% High</span></div>
    <div class="comments-heading"><h3>Residents' Comments</h3><label class="sr-only" for="comment-filter">Filter comments by disruption</label><select id="comment-filter" class="filter-select" aria-label="Filter comments by disruption">${filterOptions('comments',state.commentFilter)}</select></div>
    <div id="comment-list">${comments.length?comments.map(c=>`<article class="comment-card" data-rating="${c.rating}"><span>${ratings[c.rating]}</span><p>${escapeHTML(c.text)}</p></article>`).join(''):'<p class="empty-note" role="status">No comments in this category yet.</p>'}</div>
    ${state.shownComments<matching.length?'<button type="button" class="more-comments" id="more-comments">View more comments</button>':''}
    <p class="map-help">Public community submissions. Please avoid sharing personal details.</p>`;
  $('detail-panel').classList.remove('hidden');$('detail-close').onclick=closeDetails;
  $('comment-filter').onchange=e=>{const scroll=$('detail-panel').scrollTop;state.commentFilter=e.target.value;state.shownComments=5;renderDetails();$('detail-panel').scrollTop=scroll;$('comment-filter').focus()};
  const more=$('more-comments');if(more)more.onclick=()=>{state.shownComments+=5;renderDetails()};
}
function filterOptions(kind,current){return[['all',kind==='comments'?'All comments':'🔴 🟡 🟢 All'],['high',kind==='comments'?'Highly disruptive':'🔴 Highly disruptive'],['moderate',kind==='comments'?'Moderately':'🟡 Moderately'],['low',kind==='comments'?'Not disruptive':'🟢 Not disruptive']].map(([value,label])=>`<option value="${value}"${value===current?' selected':''}>${label}</option>`).join('')}
function normalizeSearch(value){return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\bsaint\b/g,'st').replace(/[^\p{L}\p{N}]/gu,'')}
function searchLocations(query){
  const q=normalizeSearch(query);if(!q)return[];
  const zipQuery=q.replace(/^zip(?:code)?/,'');
  if(/^\d{1,5}$/.test(zipQuery))return zipCatalog.filter(z=>z.zip.startsWith(zipQuery)).map(z=>({name:'ZIP '+z.zip,borough:z.borough,zips:[z.zip],directZip:true})).slice(0,8);
  const tokens=query.toLowerCase().replace(/[,.'’\-]/g,' ').split(/\s+/).filter(Boolean).map(normalizeSearch);
  return neighborhoodCatalog.map(entry=>{
    const terms=[entry.name,...entry.aliases||[]].map(normalizeSearch),full=normalizeSearch(entry.name+' '+entry.borough+' '+(entry.aliases||[]).join(' '));
    const score=terms.includes(q)?0:terms.some(t=>t.startsWith(q))?1:terms.some(t=>t.includes(q))?2:tokens.every(t=>full.includes(t))?3:99;
    return{entry,score};
  }).filter(x=>x.score<99).sort((a,b)=>a.score-b.score||a.entry.name.localeCompare(b.entry.name)||a.entry.borough.localeCompare(b.entry.borough)).slice(0,8).map(x=>x.entry);
}
function showResults(query){
  const box=$('search-results');box.replaceChildren();box.classList.toggle('hidden',!query.trim());if(!query.trim())return;
  const matches=searchLocations(query);
  if(!matches.length){const message=document.createElement('div');message.className='search-empty';message.textContent=/\d/.test(query)?'This ZIP is not included in the map coverage. Try a nearby neighborhood.':'No matching name. Try another spelling or enter a ZIP Code.';box.appendChild(message);return}
  for(const entry of matches){const btn=document.createElement('button');btn.type='button';btn.className='search-result';btn.setAttribute('role','option');btn.innerHTML=`${escapeHTML(entry.name)} <small>${escapeHTML(entry.borough)}, New York</small>`;btn.onclick=()=>chooseNeighborhood(entry);box.appendChild(btn)}
}
function chooseNeighborhood(entry){
  state.selectedNeighborhood=entry;state.selectedZipForForm=null;
  $('neighborhood').value=entry.name+', '+entry.borough;$('search-results').classList.add('hidden');$('selected-location').classList.add('hidden');
  MAP_ADAPTER.flyToNeighborhood(entry);showConfirmation(entry);
}
function showConfirmation(entry){
  if(!entry)return;$('confirm-card').classList.remove('hidden');const choices=$('zip-choices');choices.replaceChildren();
  for(const zip of entry.zips){const btn=document.createElement('button');btn.type='button';btn.className='zip-choice';btn.textContent=zip;btn.onclick=()=>confirmZip(zip);choices.appendChild(btn)}
  window.renderConfirmMiniMap?.(entry);
}
function confirmZip(zip){
  if(!zipCatalog.some(z=>z.zip===zip))return;
  state.selectedZipForForm=zip;$('confirm-card').classList.add('hidden');
  $('selected-location').innerHTML=`✓ Selected area: <strong>${zip}</strong> · <button type="button" id="change-zip">Change</button>`;
  $('selected-location').classList.remove('hidden');$('change-zip').onclick=()=>showConfirmation(state.selectedNeighborhood);
  MAP_ADAPTER.flyToZip(zip);
}
async function feedbackSubmit(e){
  if(state.submitting){e.preventDefault();return}
  e.preventDefault();const message=$('form-message');message.classList.add('hidden');$('rating-error').classList.add('hidden');
  if(!state.selectedZipForForm){message.textContent='Please choose a neighborhood or ZIP and confirm your area first.';message.className='form-message error';return}
  if(!state.rating){$('rating-error').classList.remove('hidden');return}
  const zip=state.selectedZipForForm,comment=$('comment').value.trim();
  const rating=state.rating,button=document.querySelector('.submit-button');
  state.submitting=true;button.disabled=true;button.textContent='SENDING…';
  try{
    if(!window.RAT_CLOUD?.configured)throw new Error('Unable to connect. Your text is kept; please try again.');
    await window.RAT_CLOUD.submit({zip,rating,comment});
    message.textContent='✓ Thank you! Your response is saved and shared with other visitors.';
    message.className='form-message';
    if($('comment').value.trim()===comment)$('comment').value='';
    if(state.rating===rating){state.rating=null;document.querySelectorAll('.rating-option').forEach(b=>b.classList.remove('selected'))}
    MAP_ADAPTER.refresh();if(state.selectedZip===zip)renderDetails();
  }catch(error){message.textContent=error.message||'Your response could not be saved. Please try again.';message.className='form-message error'}
  finally{state.submitting=false;button.disabled=false;button.textContent='SHARE YOUR EXPERIENCE'}
}
function init(){
  $('neighborhood').addEventListener('input',e=>{state.selectedZipForForm=null;$('selected-location').classList.add('hidden');$('confirm-card').classList.add('hidden');showResults(e.target.value)});
  $('neighborhood').addEventListener('focus',e=>showResults(e.target.value));
  $('neighborhood').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();const matches=searchLocations(e.target.value);if(matches.length)chooseNeighborhood(matches[0])}else if(e.key==='ArrowDown'){$('search-results').querySelector('button')?.focus();e.preventDefault()}else if(e.key==='Escape')$('search-results').classList.add('hidden')});
  document.addEventListener('click',e=>{if(!e.target.closest('.search-wrapper'))$('search-results').classList.add('hidden')});
  $('close-confirm').onclick=()=>$('confirm-card').classList.add('hidden');
  document.querySelectorAll('.rating-option').forEach(btn=>btn.addEventListener('click',()=>{state.rating=btn.dataset.rating;document.querySelectorAll('.rating-option').forEach(b=>b.classList.toggle('selected',b===btn));$('rating-error').classList.add('hidden')}));
  $('feedback-form').addEventListener('submit',feedbackSubmit);
  $('map-filter').innerHTML=filterOptions('map','all');$('map-filter').onchange=e=>{state.mapFilter=e.target.value;MAP_ADAPTER.refresh()};
}
document.addEventListener('DOMContentLoaded',init);
