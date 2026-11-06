import {normalizeLocation,locationFromHistory,locationSnapshot,locationText as selectedLocationText} from './location-state.js?v=1.4.1';
import {locateCurrentRegion} from './location-lookup.js?v=1.4.1';
import {lookupRegionName} from './region-geocoder.js?v=1.4.1';
import {initRefresh} from './refresh.js?v=1.4.1';
import {shareService} from './share.js?v=1.4.1';
import {mountCarDetail} from './car-detail.js?v=1.4.1';
import {resolveDetailItem} from './detail-route.js';
import {createRouteHistory} from './route-history.js';
import {recoverEncar} from './encar-fallback.js?v=1.4.1';
import {filterListings, distanceKm, validateListing} from './search.js';
import {SEARCH_API_URL,REQUIRES_LOGIN_REDIRECT,PROTECTED_SEARCH_URL,protectedSearchUrl} from './config.js?v=1.4.1';
const installRequested=new URLSearchParams(location.search).get('install')==='1';
const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const $=s=>document.querySelector(s);
const icons={back:'<path d="m14 5-7 7 7 7M7 12h14"/>',external:'<path d="M14 3h7v7m0-7L10 14"/><path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',search:'<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/>',heart:'<path d="M20.8 4.8a5.5 5.5 0 0 0-7.8 0L12 5.9l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z"/>',pin:'<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',chevron:'<path d="m9 5 7 7-7 7"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',sliders:'<path d="M4 7h8m4 0h4M4 17h3m4 0h9"/><circle cx="14" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',car:'<path d="m5 7 2-4h10l2 4 2 3v8H3v-8l2-3Zm0 0h14M6 13h2m8 0h2M5 18v3m14-3v3"/>',box:'<path d="m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4m-9 4v10M7 5l9 4"/>'};
const icon=n=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[n]||icons.box}</svg>`;
function paintIcons(root=document){root.querySelectorAll('[data-icon]').forEach(e=>e.innerHTML=icon(e.dataset.icon));}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number.isFinite(n)?new Intl.NumberFormat('ko-KR').format(n)+'원':'가격 정보 없음';
const when=value=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'확인 시각 없음';
const known=(dictionary,key)=>dictionary[key]||'정보 없음';
const sources={daangn:{name:'당근',letter:'당',color:'#ff7e36',url:()=> 'https://www.daangn.com/kr/',keyword:false},joongna:{name:'중고나라',letter:'중',color:'#10ae83',url:q=>'https://web.joongna.com/search/'+encodeURIComponent(q),keyword:true},bunjang:{name:'번개장터',letter:'번',color:'#f45458',url:q=>'https://m.bunjang.co.kr/search/products?q='+encodeURIComponent(q),keyword:true},other:{name:'헬로마켓',letter:'H',color:'#5785d5',url:q=>'https://www.hellomarket.com/search?q='+encodeURIComponent(q),keyword:true},encar:{name:'엔카',letter:'E',color:'#e53835',url:()=> 'https://car.encar.com/list/car',keyword:false},kb:{name:'KB차차차',letter:'KB',color:'#c99813',url:()=> 'https://www.kbchachacha.com/',keyword:false},kcar:{name:'K Car',letter:'K',color:'#bc1932',url:()=> 'https://www.kcar.com/bc/search',keyword:false}};
const sourceKeys=()=>state.kind==='car'?['encar','kb','kcar']:['daangn','joongna','bunjang','other'];
const sourceLogos={daangn:'daangn.svg',joongna:'joongna.svg',bunjang:'bunjang.svg',other:'hellomarket.svg',encar:'encar.png',kb:'kb.png',kcar:'kcar.svg'};
const labels={category:{all:'전체',digital:'디지털·가전',fashion:'패션·잡화',home:'가구·생활',sports:'스포츠·레저',hobby:'취미·도서'},condition:{all:'전체',new:'새 상품', 'like-new':'거의 새것',used:'사용감 있음'},method:{all:'전체',direct:'직거래',shipping:'택배거래'},status:{all:'전체',selling:'판매 중',reserved:'예약 중',sold:'판매 완료'},fuel:{all:'전체',gasoline:'가솔린',diesel:'디젤',hybrid:'하이브리드',electric:'전기',lpg:'LPG'},brand:{all:'전체',현대:'현대',기아:'기아',BMW:'BMW',벤츠:'벤츠',테슬라:'테슬라'}};
const defaults=()=>({category:'all',minPrice:'',maxPrice:'',condition:'all',method:'all',status:'all',brand:'all',minYear:'',maxMileage:'',fuel:'all'});
function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
let stored=read('used:saved',[]);if(!Array.isArray(stored))stored=[];
let snapshots=read('used:saved-records',[]);if(!Array.isArray(snapshots))snapshots=[];
const savedRecords=new Map(snapshots.filter(validateListing).map(item=>[item.id,item]));
const rejectedSavedIds=new Set(snapshots.filter(item=>!validateListing(item)).map(item=>item?.id));
const state={kind:'goods',page:'home',source:'all',query:'',sort:'recent',filters:defaults(),region:'',coords:null,radius:5,locationName:'',saved:new Set([...stored.filter(id=>typeof id==='string'&&!/^demo(?:-|$)/i.test(id)&&!rejectedSavedIds.has(id)),...savedRecords.keys()]),savedRecords,live:[],loading:false,requested:false,error:'',providers:[],fetchedAt:null,partial:false,detailId:'',detailItem:null};
let draft={},toastTimer,requestController=null,requestVersion=0;
let routeDepth=0,routeScroll=0,routeVersion=0,restoringScroll=false,liveKey='';
const searchKey=()=>JSON.stringify([state.kind,state.source,state.query]);
history.scrollRestoration='manual';
function syncQueries(){for(const id of ['query','home-query'])$('#'+id).value=state.query;}
function routeData(){return {usedRoute:true,depth:routeDepth,page:state.page,kind:state.kind,source:state.source,query:state.query,filters:{...state.filters},sort:state.sort,location:locationSnapshot(state),scrollY:routeScroll,...(state.page==='detail'?{detailId:state.detailId,detailItem:validateListing(state.detailItem)?state.detailItem:null}:{})};}
function routeUrl(){
 const url=new URL(location.href);url.search='';url.hash='';
 if(state.page!=='home')url.searchParams.set('view',state.page==='search'?'results':state.page);
 if(state.kind==='car')url.searchParams.set('kind','car');
 if(state.page==='detail')url.searchParams.set('item',state.detailId);
 if(['search','detail'].includes(state.page)&&state.query)url.searchParams.set('q',state.query);
 if(state.page!=='home'&&state.source!=='all')url.searchParams.set('source',state.source);
 return url;
}
const routeHistory=createRouteHistory({history,snapshot:routeData,url:routeUrl});
function syncRoute(){return routeHistory.sync();}
function navigate(page,{replace=false}={}){
 if(routeHistory.isPending())return;
 if($('#sheet').open)closeSheet();
 if(page===state.page)replace=true;
 routeScroll=window.scrollY;routeHistory.rememberScroll(routeScroll);syncRoute();clearCarDetail();
 const version=++routeVersion;restoringScroll=true;routeScroll=0;
 cancelSearch();state.page=page;syncQueries();
 if(!replace)routeDepth++;
 if(!(replace?syncRoute():routeHistory.push())){location.assign(routeUrl().href);return;}
 render();window.scrollTo({top:0,behavior:'auto'});
 if(page==='detail')$('#detail-page-title').focus({preventScroll:true});
 requestAnimationFrame(()=>{if(version===routeVersion)restoringScroll=false;});
}
function submitSearch(query,{reset=false}={}){
 const value=query.trim();if(!value){notify('검색어를 입력해 주세요.');return;}
 state.query=value.slice(0,80);if(reset){state.source='all';state.filters=defaults();state.sort='recent';$('#sort').value='recent';}
 if(REQUIRES_LOGIN_REDIRECT){state.page='search';searchLive();return;}
 navigate('search',{replace:state.page==='search'});searchLive();
}
async function restoreRoute(entry,onRendered){
 routeHistory.restored();
 if($('#sheet').open)closeSheet();
 clearCarDetail();cancelSearch();const version=++routeVersion;restoringScroll=true;
 routeDepth=entry?.usedRoute&&Number.isInteger(entry.depth)?entry.depth:0;
 const restoreY=entry?.usedRoute?routeHistory.scrollFor(entry):0;routeScroll=restoreY;
 const params=new URLSearchParams(location.search);
 state.kind=entry?.usedRoute?entry.kind:params.get('kind')==='car'?'car':'goods';
 state.query=entry?.usedRoute?entry.query:(params.get('q')||'').slice(0,80);
 const view=params.get('view');state.page=entry?.usedRoute?entry.page:['saved','services','detail'].includes(view)?view:state.query||view==='results'?'search':'home';
 const source=entry?.usedRoute?entry.source:params.get('source');state.source=['all',...sourceKeys()].includes(source)?source:'all';
 if(entry?.usedRoute){state.filters={...defaults(),...entry.filters};state.sort=entry.sort||'recent';}
 Object.assign(state,locationFromHistory(entry));
 state.detailId=state.page==='detail'?String(entry?.detailId||params.get('item')||'').slice(0,512):'';
 state.detailItem=state.page==='detail'?resolveDetailItem({id:state.detailId,candidates:[entry?.detailItem,...state.live,...state.savedRecords.values()]}):null;
 if(state.page==='detail'&&REQUIRES_LOGIN_REDIRECT){
  const url=new URL(protectedSearchUrl({query:state.query,kind:state.kind,source:state.source}));url.searchParams.set('view','detail');url.searchParams.set('item',state.detailId);location.assign(url.href);return;
 }
 syncQueries();$('#sort').value=state.sort;render();onRendered?.();
 if(state.page==='search'&&!REQUIRES_LOGIN_REDIRECT&&liveKey!==searchKey())await searchLive();
 if(version!==routeVersion)return;
 window.scrollTo({top:restoreY,behavior:'auto'});routeScroll=restoreY;syncRoute();
 requestAnimationFrame(()=>{if(version===routeVersion)restoringScroll=false;});
}
window.addEventListener('popstate',event=>restoreRoute(event.state));
window.addEventListener('scroll',()=>{if(restoringScroll||routeHistory.isPending())return;routeScroll=Math.max(0,window.scrollY);routeHistory.rememberScroll(routeScroll);},{passive:true});
window.addEventListener('pagehide',()=>{if(routeHistory.isPending())return;routeScroll=Math.max(0,window.scrollY);routeHistory.rememberScroll(routeScroll);syncRoute();});

function notify(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),2600);}
function persist(){try{localStorage.setItem('used:saved',JSON.stringify([...state.saved]));localStorage.setItem('used:saved-records',JSON.stringify([...state.savedRecords.values()]));}catch{notify('저장 공간을 사용할 수 없어 이번 방문에서만 찜해요.');}}
const data=()=>state.page==='saved'?[...state.savedRecords.values()]:state.live;
const placeholder='./assets/product-placeholder.svg';
const options=()=>({...state.filters,kind:state.kind,query:state.page==='saved'?'':state.query,source:state.source,region:state.region,coords:state.coords,radius:state.coords?state.radius:undefined,sort:state.sort});
function cancelSearch(){requestController?.abort();requestController=null;requestVersion++;state.loading=false;}
async function searchLive(){
 cancelSearch();
 if(state.page!=='search'){render();return;}
 state.live=[];state.providers=[];state.fetchedAt=null;state.error='';state.partial=false;state.requested=false;
 if(!state.query.trim()){render();return;}
 if(REQUIRES_LOGIN_REDIRECT&&state.query.trim()){location.assign(protectedSearchUrl({query:state.query,kind:state.kind,source:state.source}));return;}
 if(state.query.length>80){state.error='검색어는 80자 이내로 입력해 주세요.';render();return;}
 state.requested=true;state.loading=true;render();
 const controller=new AbortController();requestController=controller;const version=requestVersion;
 const timeout=setTimeout(()=>controller.abort(),25000);
 try{
  const url=new URL(SEARCH_API_URL,location.href);url.searchParams.set('q',state.query);url.searchParams.set('kind',state.kind);url.searchParams.set('source',state.source);
  const response=await fetch(url,{signal:controller.signal,cache:'no-store',headers:{Accept:'application/json'}});
  let payload=await response.json().catch(()=>null);
  if(version!==requestVersion)return;
  payload=await recoverEncar({payload,status:response.status,kind:state.kind,source:state.source,query:state.query,signal:controller.signal});
  if(version!==requestVersion)return;
  if(Array.isArray(payload?.providers))state.providers=payload.providers.filter(p=>p&&Object.hasOwn(sources,p.source)&&['ok','unavailable','error'].includes(p.status));
  state.fetchedAt=payload?.fetchedAt;state.partial=Boolean(payload?.partial);
  if(!response.ok&&!(response.status===502&&payload?.providers?.some(p=>p.status==='ok')))throw new Error(typeof payload?.error==='string'?payload.error:response.status===429?'검색 요청이 많아요. 잠시 후 다시 시도해 주세요.':`검색 서버에 연결하지 못했어요. (${response.status})`);
  if(!Array.isArray(payload?.items)||!Array.isArray(payload?.providers))throw new Error('검색 응답을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
  state.live=payload.items.filter(validateListing);
  for(const item of state.live)if(state.saved.has(item.id))state.savedRecords.set(item.id,item);
  persist();
  if(state.providers.length&&!state.providers.some(p=>p.status==='ok'))state.error='선택한 서비스에서 매물을 가져오지 못했어요. 연결 상태를 확인하거나 원문 검색을 이용해 주세요.';
 }catch(error){
  if(version!==requestVersion)return;
  state.error=error.name==='AbortError'?'검색 시간이 길어지고 있어요. 다시 검색해 주세요.':error instanceof TypeError?'네트워크 또는 검색 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.':error.message;
 }finally{clearTimeout(timeout);if(version===requestVersion){state.loading=false;requestController=null;liveKey=searchKey();render();}}
}
function filterSummary(){const f=state.filters,v=[];for(const k of state.kind==='car'?['brand','fuel','status']:['category','condition','method','status'])if(f[k]!=='all')v.push(labels[k][f[k]]);if(f.minPrice!==''||f.maxPrice!=='')v.push(`${f.minPrice!==''?money(+f.minPrice):'0원'} ~ ${f.maxPrice!==''?money(+f.maxPrice):'제한 없음'}`);if(state.kind==='car'){if(f.minYear)v.push(`${f.minYear}년부터`);if(f.maxMileage)v.push(`${(+f.maxMileage).toLocaleString()}km 이하`);}return v;}
function resetFilters(){state.filters=defaults();Object.assign(state,normalizeLocation());state.source='all';state.sort='recent';$('#sort').value='recent';if(state.page!=='saved')searchLive();else render();}
function revealSelectedSource(){
 const tabs=$('#source-tabs'),selected=tabs?.querySelector('[aria-pressed="true"]');
 if(!selected||!tabs.clientWidth)return;
 const rail=tabs.getBoundingClientRect(),item=selected.getBoundingClientRect();
 if(item.left<rail.left+5)tabs.scrollLeft-=rail.left+5-item.left;
 else if(item.right>rail.right-5)tabs.scrollLeft+=item.right-rail.right+5;
}
window.addEventListener('resize',revealSelectedSource,{passive:true});
function render(){
 if(!state.coords&&state.sort==='distance')state.sort='recent';
 $('#sort').value=state.sort;
 const home=state.page==='home',isDetail=state.page==='detail',isSaved=state.page==='saved',isMenu=isSaved||state.page==='services';
 $('#detail-header').hidden=!isDetail;$('#detail-screen').hidden=!isDetail;$('#detail-actions').hidden=!isDetail;$('.bottom-nav').hidden=isDetail;$('.footnote').hidden=home||isDetail||isSaved;
 $('.app').classList.toggle('detail-view',isDetail);
 $('.app').classList.toggle('home-view',home);
 $('#home-providers').dataset.kind=state.kind;
 $('#home-providers').innerHTML=sourceKeys().map(key=>`<li><img data-logo="${key}" src="./assets/service-logos/${sourceLogos[key]}" alt="${sources[key].name}" decoding="async"></li>`).join('');
 $('#home-screen').hidden=!home;$('#home-header').hidden=!home;$('#results-header').hidden=home||isDetail;$('#browse-screen').hidden=home||isDetail;
 $('.app').classList.toggle('results-view',!home&&!isDetail);
 $('.app').classList.toggle('menu-view',isMenu);
 $('.app').classList.toggle('services-view',state.page==='services');
 $('.app').classList.toggle('saved-view',isSaved);
 const menuTitle=state.page==='saved'?'찜한 매물':'둘러보기';
 $('#menu-page-title').hidden=!isMenu;$('#menu-page-title').textContent=isMenu?menuTitle:'';
 $('#results-header').setAttribute('aria-label',isMenu?menuTitle+' 도구':'검색 도구');
 $('.results-search-row').hidden=isMenu;
 $('#results-back').hidden=state.page!=='search';
 const savedCount=state.saved.size;
 $('#saved-count').hidden=savedCount===0;$('#saved-count').textContent=savedCount>99?'99+':String(savedCount);
 $('#saved-nav').setAttribute('aria-label',savedCount?`찜한 매물 ${savedCount}개`:'찜한 매물');
 $('#saved-nav').title=savedCount?`찜한 매물 ${savedCount}개`:'찜한 매물';
 if(isDetail){renderDetailPage();syncRoute();return;}
 $('#results-header .results-toolbar').hidden=isMenu;
 $('.results-kind-tabs').hidden=isMenu;
 $('.filter-row').hidden=isMenu;
 $('.search-banner').hidden=home||isMenu;
 $('#source-tabs').hidden=isMenu;
 $('.results-heading').hidden=isSaved;
 document.title=home?'USED — 좋은매물, 한곳에서':state.page==='saved'?'찜한 매물 — USED':state.page==='services'?'둘러보기 — USED':`${state.query?state.query+' 검색 결과':'검색 결과'} — USED`;
 syncRoute();
 const active=document.activeElement;const focusKey=['save','source','suggest'].find(key=>active?.dataset?.[key]);const focusValue=focusKey?active.dataset[focusKey]:null;const focusIndex=focusKey==='save'?[...document.querySelectorAll('[data-save]')].indexOf(active):0;
 document.querySelectorAll('[data-kind]').forEach(e=>{e.classList.toggle('active',e.dataset.kind===state.kind);e.setAttribute('aria-pressed',e.dataset.kind===state.kind);});
 document.querySelectorAll('[data-page]').forEach(e=>{const selected=e.dataset.page===state.page||(e.dataset.page==='home'&&state.page==='search');e.classList.toggle('active',selected);e.setAttribute('aria-current',selected?'page':'false');});
 $('#query').placeholder=state.kind==='car'?'어떤 차를 찾고 있나요?':'어떤 물건을 찾고 있나요?';
 $('#home-query').placeholder=state.kind==='car'?'찾는 차가 있나요?':'찾는 물건이 있나요?';
 $('#suggestions').innerHTML=(state.kind==='car'?['그랜저','쏘렌토','BMW']:['아이폰','에어팟','카메라']).map(x=>`<button data-suggest="${x}">${x}</button>`).join('');
 $('#source-tabs').innerHTML=[['all','전체'],...sourceKeys().map(k=>[k,k==='other'?'기타':sources[k].name])].map(([key,name])=>`<button data-source="${key}" aria-pressed="${state.source===key}" class="${state.source===key?'active':''}">${name}</button>`).join('');
 revealSelectedSource();
 const summary=filterSummary();$('#filter-summary').textContent=summary.join(' · ')||'필터';$('#filters-open').title=summary.join(' · ')||'필터 설정';$('#filters-open').classList.toggle('selected',!!summary.length);$('#filter-count').hidden=!summary.length;$('#filter-count').textContent=summary.length;
 const locationText=selectedLocationText(state);
 $('#location-label').textContent=locationText||'전국';$('#nearby-label').textContent=locationText||'내 주변';
 $('#nearby-open').classList.toggle('selected',Boolean(locationText));
 for(const id of ['location-open','nearby-open']){const button=$('#'+id);button.title=locationText||'전국';button.setAttribute('aria-label',`지역 설정: ${locationText||'전국'}`);}
 $('#search-status-title').textContent=state.loading?'여러 서비스에서 매물을 찾고 있어요':state.error?'검색 연결을 확인해 주세요':state.requested?'실제 검색 결과를 모았어요':REQUIRES_LOGIN_REDIRECT?'로그인 후 실제 매물을 찾아요':'검색하면 실제 매물을 찾아요';
 $('#search-status-copy').textContent=state.loading?'접근 가능한 서비스의 공개 매물을 확인하고 있어요.':state.fetchedAt?`${when(state.fetchedAt)} 확인 · 판매 여부는 원문에서 확인해 주세요.`:REQUIRES_LOGIN_REDIRECT?'검색하면 Vercel 로그인이 필요한 보호된 화면으로 이동해요.':'서비스별 연결 상태와 가져온 결과를 함께 보여 드려요.';
 const items=isSaved?data().filter(i=>state.saved.has(i.id)).reverse():filterListings(data(),options());
 $('#results-title').textContent=isSaved?'찜해 둔 매물':state.page==='services'?'중고 서비스, 한자리에':state.query?`‘${state.query}’ 검색 결과`:state.kind==='car'?'어떤 차를 찾고 있나요?':'어떤 물건을 찾고 있나요?';
 $('#result-count').textContent=state.page==='services'||state.loading?'':`${items.length}개`;$('.sort-control').hidden=state.page==='services';
 let scope=$('#saved-scope');if(!scope){scope=document.createElement('p');scope.id='saved-scope';scope.className='saved-scope';$('.results-heading').insertAdjacentElement('afterend',scope);}
 scope.hidden=isMenu||!state.requested;
 scope.textContent=state.loading?'검색 결과를 가져오는 중이에요…':`가져온 ${state.live.length}개 중 ${items.length}개 표시 · 필터는 가져온 결과에 적용돼요. 정보가 없는 매물은 해당 조건에서 제외돼요.`;
 let status=$('#provider-status');if(!status){status=document.createElement('div');status.id='provider-status';status.className='provider-status';status.setAttribute('aria-label','서비스 연결 상태');$('.search-banner').insertAdjacentElement('afterend',status);}
 status.hidden=isSaved||state.page==='services'||!state.providers.length;
 const providerDetailsOpen=status.querySelector('details')?.open;
 const providerNotes=state.providers.map(p=>({source:p.source,notes:[...new Set([p.message,p.note].filter(value=>typeof value==='string'&&value.trim()))]})).filter(p=>p.notes.length);
 status.innerHTML=state.providers.map(p=>`<span class="provider-pill ${p.status==='ok'?'ok':'unavailable'}">${esc(sources[p.source].name)} ${p.status==='ok'?`${Number.isFinite(p.count)?p.count:0}개`:p.status==='unavailable'?'연결 불가':'일시 오류'}</span>`).join('')+(state.providers.some(p=>p.status!=='ok')?'<span class="provider-limit">연결되지 않은 서비스의 매물은 포함되지 않아요.</span>':'')+(providerNotes.length?`<details class="provider-details" ${providerDetailsOpen?'open':''}><summary>서비스별 수집 범위와 연결 안내</summary><dl>${providerNotes.map(p=>`<dt>${esc(sources[p.source].name)}</dt><dd>${p.notes.map(esc).join('<br>')}</dd>`).join('')}</dl></details>`:'');
 $('#results').hidden=state.page==='services';$('#results').setAttribute('aria-busy',String(state.loading&&!isSaved));$('#results').innerHTML=state.loading&&!isSaved?skeleton():items.length?items.map(card).join(''):empty();
 $('#external').hidden=!(state.page==='services'||(state.requested&&!state.loading&&!isSaved));renderExternal();
 $('#results').querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{img.src=placeholder;},{once:true}));
 if(focusKey&&!active.isConnected){const candidates=[...document.querySelectorAll(`[data-${focusKey}]`)];const target=candidates.find(el=>el.dataset[focusKey]===focusValue)||(focusKey==='save'?(candidates[Math.min(focusIndex,candidates.length-1)]||$('#reset-results')||document.querySelector('[data-page="saved"]')):null);target?.focus({preventScroll:true});}
}
function carMeta(i){return [Number.isInteger(i.year)?`${i.year}년`:null,Number.isFinite(i.mileage)?`${(i.mileage/10000).toFixed(1)}만km`:null,labels.fuel[i.fuel]].filter(Boolean).join(' · ')||'차량 정보 없음';}
function card(i){const dist=state.coords&&Number.isFinite(i.lat)&&Number.isFinite(i.lng)?` · ${distanceKm(state.coords,i).toFixed(1)}km`:'';return `<article class="product-card"><button class="product-image" data-detail="${esc(i.id)}" aria-label="${esc(i.title)} 상세 보기"><img src="${esc(i.image||placeholder)}" alt="${esc(i.title)} 상품 이미지" loading="lazy" referrerpolicy="no-referrer"></button><button class="favorite ${state.saved.has(i.id)?'saved':''}" data-save="${esc(i.id)}" aria-label="${esc(i.title)} ${state.saved.has(i.id)?'찜 취소':'찜하기'}" aria-pressed="${state.saved.has(i.id)}">${icon('heart')}</button><div class="product-info"><span class="source-badge ${esc(i.source)}"><i></i>${esc(i.sourceName)}</span><button class="product-title" data-detail="${esc(i.id)}">${esc(i.title)}</button><p class="price">${money(i.price)}</p><div class="product-meta">${i.kind==='car'?esc(carMeta(i)):`${esc(i.region||'지역 정보 없음')}${dist}`}</div><div class="product-labels"><span class="tiny-tag blue">실제 매물</span><span class="tiny-tag">${esc(known(labels.status,i.status))}</span>${i.methods?.includes('shipping')?'<span class="tiny-tag">택배 가능</span>':''}</div><a class="listing-source-link" href="${esc(i.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(i.title)} · ${esc(i.sourceName)} 실제 매물 보기 (새 탭)">원문 보기${icon('external')}</a></div></article>`;}
function skeleton(){return `<div class="sr-only" role="status">실제 매물을 검색하고 있어요.</div>`+Array.from({length:4},()=>'<div class="skeleton-card" aria-hidden="true"><div class="skeleton-image"></div><div class="skeleton-line"></div><div class="skeleton-line short"></div></div>').join('');}
function empty(){
 const saved=state.page==='saved',error=!saved?state.error:'';
 const title=saved?'아직 찜한 매물이 없어요':!state.requested&&!error?'검색어를 입력해 주세요':error?'검색 결과를 가져오지 못했어요':'조건에 맞는 매물이 없어요';
 const copy=saved?'마음에 드는 매물의 하트를 눌러 모아 보세요.':error?esc(error):!state.requested?(REQUIRES_LOGIN_REDIRECT?'검색하면 보호된 검색 사이트로 이동해요.<br>이 프로젝트 접근 권한이 있는 Vercel 계정으로 로그인해 주세요.':'상품명이나 차종을 검색하면<br>연결 가능한 서비스의 실제 매물을 모아 보여 드려요.'):`검색어나 필터를 바꿔 보세요.<br>연결된 서비스에서 가져온 결과만 검색해요.`;
 return `<div class="empty"><div class="empty-icon">${icon(saved?'heart':'search')}</div><h3>${title}</h3><p>${copy}</p>${error?'<button class="text-button" id="retry-search">다시 검색하기</button>':!saved&&data().length?'<button class="text-button" id="reset-results">필터 초기화</button>':''}</div>`;
}
function renderExternal(){const browsing=state.page==='services',query=browsing?'':state.query;const keys=browsing?Object.keys(sources):state.source==='all'?sourceKeys():[state.source];$('#external-links').innerHTML=keys.map(k=>{const s=sources[k];return `<a class="service-link" href="${esc(s.url(query))}" target="_blank" rel="noopener noreferrer"><span class="service-letter" style="color:${s.color};background:${s.color}15">${s.letter}</span><span><strong>${s.name}</strong><small>${s.keyword&&query?`‘${esc(query)}’ 검색 결과 열기`:['encar','kb','kcar'].includes(k)?'차량 목록 열기':'서비스에서 찾아보기'}</small></span>${icon('arrow')}</a>`;}).join('');$('.external-note').textContent=browsing?'선택한 서비스의 원문 사이트로 이동해요.':state.kind==='car'?'차량 검색어와 필터는 이동한 사이트에서 다시 설정해 주세요. KB차차차는 서비스 홈으로 연결돼요.':'외부 사이트에서 필터를 다시 설정해 주세요. 당근은 서비스 홈으로 연결돼요.';}
let carDetailCleanup=null,detailMountedKey='',sheetCleanup=null,sheetVersion=0;
function cleanupSheet(){const cleanup=sheetCleanup;sheetCleanup=null;cleanup?.();}
function clearCarDetail(){carDetailCleanup?.();carDetailCleanup=null;detailMountedKey='';}
function openSheet(title,body,footer=''){ cleanupSheet();sheetVersion++; $('#sheet-body').onclick=null;$('#sheet-body').scrollTop=0;$('#sheet-title').textContent=title;$('#sheet-body').innerHTML=body;$('#sheet-footer').innerHTML=footer;paintIcons($('#sheet'));$('#sheet').showModal();document.body.style.overflow='hidden';}
function closeSheet(){cleanupSheet();$('#sheet').close();}
$('#sheet').addEventListener('close',()=>{if(!$('#sheet').open){cleanupSheet();document.body.style.overflow='';}});$('#sheet-close').onclick=closeSheet;$('#sheet').addEventListener('click',e=>{if(e.target===$('#sheet')){const r=$('#sheet').getBoundingClientRect();if(e.clientY<r.top||e.clientX<r.left||e.clientX>r.right)closeSheet();}});
function group(key,title){return `<section class="filter-group"><h3>${title}</h3><div class="options">${Object.entries(labels[key]).map(([v,l])=>`<button class="option ${draft[key]===v?'active':''}" data-option="${key}" data-value="${v}" aria-pressed="${draft[key]===v}">${l}</button>`).join('')}</div></section>`;}
function numberField(key,placeholder,unit){return `<div class="input-wrap"><input id="f-${key}" type="number" inputmode="numeric" min="0" step="1" placeholder="${placeholder}" value="${esc(draft[key])}" aria-label="${placeholder}"><span>${unit}</span></div>`;}
function filters(focusPrice=false){draft={...state.filters};let body='';if(state.kind==='car')body+=group('brand','제조사');else body+=group('category','카테고리');body+=`<section class="filter-group"><h3>가격 범위</h3><div class="input-row">${numberField('minPrice','최소 가격','원')}<span>–</span>${numberField('maxPrice','최대 가격','원')}</div></section>`;if(state.kind==='car'){body+=`<section class="filter-group"><h3>연식 · 주행거리</h3><div class="input-row">${numberField('minYear','최소 연식','년')}${numberField('maxMileage','최대 주행거리','km')}</div></section>`+group('fuel','연료');}else body+=group('condition','상품 상태')+group('method','거래 방법');body+=group('status','판매 상태')+'<p class="hint">서비스마다 제공하는 정보가 달라요. 필터는 이번에 가져온 결과에 적용되며, 해당 정보가 없는 매물은 조건에서 제외돼요.</p><p class="error" id="filter-error" role="alert"></p>';openSheet('원하는 조건으로 찾아요',body,'<button class="secondary-button" id="filter-reset">초기화</button><button class="primary-button" id="filter-apply">필터 적용하기</button>');$('#sheet-body').onclick=e=>{const b=e.target.closest('[data-option]');if(!b)return;draft[b.dataset.option]=b.dataset.value;b.parentElement.querySelectorAll('button').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',x===b);});};$('#filter-reset').onclick=()=>{draft=defaults();$('#sheet-body').querySelectorAll('input').forEach(input=>input.value='');$('#sheet-body').querySelectorAll('[data-option]').forEach(button=>{const selected=draft[button.dataset.option]===button.dataset.value;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',selected);});$('#filter-error').textContent='';};$('#filter-apply').onclick=()=>{for(const key of ['minPrice','maxPrice',...(state.kind==='car'?['minYear','maxMileage']:[])]){const val=$('#f-'+key).value;if(val!==''&&(!Number.isFinite(+val)||+val<0||!Number.isSafeInteger(+val))){$('#filter-error').textContent='0 이상의 정수를 입력해 주세요.';return;}draft[key]=val;}if(draft.minPrice!==''&&draft.maxPrice!==''&&+draft.minPrice>+draft.maxPrice){$('#filter-error').textContent='최대 가격은 최소 가격보다 커야 해요.';return;}if(draft.minYear!==''&&(+draft.minYear<1900||+draft.minYear>new Date().getFullYear()+1)){$('#filter-error').textContent='연식을 올바르게 입력해 주세요.';return;}state.filters={...draft};closeSheet();render();notify('필터를 적용했어요.');};if(focusPrice)$('#f-minPrice').focus();}
function locationSheet(){
 const selection=locationSnapshot(state);
 openSheet('어디에서 찾을까요?',`<p class="hint">동네 이름을 입력하거나 현재 위치를 사용해 보세요.</p><input id="region-input" class="location-input" aria-label="지역 이름" placeholder="예: 서울, 강남구, 성수동" maxlength="50" value="${esc(selection.coords?selection.locationName:selection.region)}"><button class="geo-button" id="geo-get">${icon('pin')}현재 위치로 찾기</button><p class="hint" id="geo-status">위치 좌표는 외부로 전송하지 않고 이 기기에서 지역명을 확인해요.</p><section class="filter-group"><h3>현재 위치 검색 반경</h3><div class="options">${[1,3,5,10,30,100].map(n=>`<button class="option ${selection.radius===n?'active':''}" data-radius="${n}" aria-pressed="${selection.radius===n}">${n}km</button>`).join('')}</div></section><p class="hint">지역을 직접 입력하면 지역명으로 검색해요. 현재 위치는 좌표가 있는 매물을 반경 안에서 보여 줘요. 위치와 반경은 이 탭의 방문 기록에 보관해 화면 이동·새로고침 때 복원해요.</p><p class="hint">지역명은 국내 행정동 경계 기준이며 GPS 오차나 경계 부근에서는 실제 주소와 다를 수 있어요. 필요하면 지역명을 직접 수정해 주세요.</p><p class="hint location-attribution">행정구역: <a href="https://sgis.kostat.go.kr/" target="_blank" rel="noopener noreferrer">통계청 SGIS</a> · <a href="https://github.com/vuski/admdongkor" target="_blank" rel="noopener noreferrer">vuski/admdongkor</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a></p><p class="error" id="geo-error" role="alert"></p>`,'<button class="secondary-button" id="all-region">전국</button><button class="primary-button" id="region-apply">지역 적용하기</button>');
 const input=$('#region-input'),getButton=$('#geo-get'),applyButton=$('#region-apply'),status=$('#geo-status'),error=$('#geo-error');
 const version=sheetVersion;
 let pending=selection,controller=null,alive=true;
 const active=()=>alive&&version===sheetVersion&&$('#sheet').open&&$('#region-input')===input;
 const cancelLookup=()=>{controller?.abort();controller=null;};
 sheetCleanup=()=>{alive=false;cancelLookup();};
 $('#sheet-body').onclick=e=>{const button=e.target.closest('[data-radius]');if(!button)return;pending.radius=+button.dataset.radius;button.parentElement.querySelectorAll('button').forEach(item=>{const selected=item===button;item.classList.toggle('active',selected);item.setAttribute('aria-pressed',selected);});};
 input.oninput=()=>{cancelLookup();pending=normalizeLocation({region:input.value,radius:pending.radius});getButton.disabled=false;applyButton.disabled=false;status.textContent='입력한 지역명으로 검색해요.';error.textContent='';};
 getButton.onclick=async()=>{
  cancelLookup();const request=new AbortController();controller=request;
  getButton.disabled=true;applyButton.disabled=true;error.textContent='';status.textContent='현재 위치와 지역명을 확인하고 있어요…';
  try{
   const found=await locateCurrentRegion({resolveName:lookupRegionName,signal:request.signal});
   if(!active()||controller!==request||request.signal.aborted)return;
   pending=normalizeLocation({...pending,coords:found.coords,locationName:found.locationName});
   input.value=pending.locationName;
   status.textContent=pending.locationName?`${pending.locationName} 주변이에요. 적용하기를 눌러 주세요.`:'현재 위치를 확인했어요. 적용하기를 눌러 주세요.';
   error.textContent=found.warning||'';
  }catch(reason){
   if(!active()||controller!==request||request.signal.aborted)return;
   status.textContent='';
   error.textContent=reason.code==='permission'?'위치 권한이 꺼져 있어요. Safari 설정에서 허용하거나 지역을 입력해 주세요.':reason.code==='unsupported'?'이 브라우저는 위치 찾기를 지원하지 않아요. 지역을 직접 입력해 주세요.':'현재 위치를 확인하지 못했어요. 다시 시도하거나 지역을 입력해 주세요.';
  }finally{
   if(active()&&controller===request){controller=null;getButton.disabled=false;applyButton.disabled=false;}
  }
 };
 $('#all-region').onclick=()=>{Object.assign(state,normalizeLocation());closeSheet();render();};
 applyButton.onclick=()=>{Object.assign(state,normalizeLocation(pending.coords?pending:{region:input.value,radius:pending.radius}));closeSheet();render();};
}
function detail(id){
 const item=data().find(x=>x.id===id)||state.savedRecords.get(id);if(!item||!validateListing(item))return;
 state.detailId=id;state.detailItem=item;navigate('detail');
}
function detailBack(){
 if(state.page!=='detail'||routeHistory.isPending())return;
 routeScroll=window.scrollY;routeHistory.rememberScroll(routeScroll);
 // Stop photos/network callbacks immediately, before the asynchronous popstate.
 clearCarDetail();cancelSearch();
 if(history.state?.usedRoute&&routeDepth>0){syncRoute();if(routeHistory.back())return;}
 navigate(state.query?'search':'home',{replace:true});if(state.page==='search'&&liveKey!==searchKey())searchLive();
}
function updateDetailSave(){
 const button=$('#detail-save');if(!button)return;
 button.textContent=state.saved.has(state.detailId)?'찜 취소':'찜하기';
 button.disabled=!state.saved.has(state.detailId)&&!validateListing(state.detailItem);
 button.setAttribute('aria-pressed',String(state.saved.has(state.detailId)));
}
function renderDetailPage(){
 const i=state.detailItem,id=state.detailId;
 document.title=i?`${i.title} — USED`:'매물 살펴보기 — USED';
 $('#detail-page-source').textContent=i?.sourceName||'USED';
 if(!i){$('#detail-page-body').innerHTML=`<div class="empty"><div class="empty-icon">${icon('box')}</div><h2>매물 정보를 불러올 수 없어요</h2><p>검색 결과나 찜한 매물에서 다시 열어 주세요.</p><button id="detail-recover" class="text-button">돌아가기</button></div>`;$('#detail-actions').hidden=true;$('#detail-recover').onclick=detailBack;return;}
 if(detailMountedKey===id){updateDetailSave();return;}
 clearCarDetail();detailMountedKey=id;
 const rich=i.kind==='car'&&['kb','encar','kcar'].includes(i.source);
 const facts=[['서비스',i.sourceName],['지역',i.region||'정보 없음'],['판매 상태',known(labels.status,i.status)],...(i.kind==='car'?[['연식',Number.isInteger(i.year)?i.year+'년':'정보 없음'],['주행거리',Number.isFinite(i.mileage)?i.mileage.toLocaleString()+'km':'정보 없음'],['연료',known(labels.fuel,i.fuel)]]:[['상품 상태',known(labels.condition,i.condition)],['거래 방법',i.methods?.map(m=>known(labels.method,m)).join(' · ')||'정보 없음']]),['수집 시각',when(i.collectedAt)],['등록 시각',when(i.publishedAt)]];
 const summary=rich?'<div id="car-detail-content"></div>':`<img class="detail-image" src="${esc(i.image||placeholder)}" alt="${esc(i.title)} 상품 이미지"><div class="product-labels"><span class="tiny-tag blue">원문에서 가져온 실제 매물</span></div><h3 class="detail-title">${esc(i.title)}</h3><p class="detail-price">${money(i.price)}</p><div class="detail-facts">${facts.map(([k,v])=>`<div><span>${k}</span>${esc(v)}</div>`).join('')}</div>`;
 const sourceLink=`<div class="detail-link"><label for="detail-url">실제 매물 링크</label><div class="detail-link-row"><input id="detail-url" type="url" value="${esc(i.url)}" readonly spellcheck="false"><button id="detail-copy" type="button" aria-label="실제 매물 링크 복사">링크 복사</button></div></div>`;
 $('#detail-page-body').innerHTML=summary+sourceLink+`<p class="hint">수집 또는 저장 당시 정보예요. 삭제·판매완료·가격 변경이 반영되지 않았을 수 있어요. 실제 판매 여부와 상세 조건은 원문에서 확인해 주세요. USED에서는 구매와 결제를 제공하지 않아요.</p>`;$('#detail-actions').innerHTML=`<button class="secondary-button" id="detail-save">${state.saved.has(id)?'찜 취소':'찜하기'}</button><a class="primary-button" href="${esc(i.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(i.sourceName)}에서 실제 매물 보기 (새 탭)">${esc(i.sourceName)}에서 보기${icon('external')}</a>`;
 if(rich)carDetailCleanup=mountCarDetail({item:i,container:$('#car-detail-content'),onUpdate:d=>{
  if(state.page!=='detail'||state.detailId!==id||routeHistory.isPending())return;
  state.detailItem={...i,title:d.title,price:d.price,image:d.photos[0]||i.image,collectedAt:d.fetchedAt};
  document.title=`${d.title} — USED`;updateDetailSave();syncRoute();
 }});
 else $('.detail-image').onerror=e=>{e.target.onerror=null;e.target.src=placeholder;};
 $('#detail-save').onclick=()=>toggleSave(id);updateDetailSave();
 if($('#detail-copy'))$('#detail-copy').onclick=async()=>{
  try{await navigator.clipboard.writeText(i.url);notify('실제 매물 링크를 복사했어요.');}
  catch{const field=$('#detail-url');if(!field||field.value!==i.url)return;field.focus();field.select();field.setSelectionRange(0,field.value.length);notify('주소를 길게 눌러 복사해 주세요.');}
 };
}
function toggleSave(id){
 if(state.saved.has(id)){state.saved.delete(id);state.savedRecords.delete(id);}
 else{const item=(state.page==='detail'&&state.detailItem?.id===id?state.detailItem:null)||data().find(x=>x.id===id);if(!item||!validateListing(item))return;if(state.savedRecords.size>=200){notify('찜은 최대 200개까지 저장할 수 있어요.');return;}state.saved.add(id);state.savedRecords.set(id,{...item,savedAt:new Date().toISOString()});}
 persist();render();notify(state.saved.has(id)?'찜한 매물에 담았어요.':'찜을 취소했어요.');
}
function info(){openSheet('USED를 소개해요',`<div class="info-block"><h3>검색할 때 실제 매물을 가져와요</h3><p>실제 검색은 접근 보호된 사이트에서 제공하며, Vercel 프로젝트 접근 권한이 있는 계정으로 로그인해야 해요. 검색어를 입력하면 연결 가능한 서비스의 공개 검색 결과에서 매물 정보를 가져와요. 각 서비스의 일부 결과를 표시하며 웹상의 모든 매물을 포함하지 않아요. 연결되지 않은 서비스와 오류는 결과 위에 표시해요.</p></div><div class="info-block"><h3>정보가 없는 경우도 있어요</h3><p>가격·사진·지역·판매 상태는 원문에서 제공한 범위만 보여요. 조건 필터는 가져온 결과에 적용하며, 정보가 없는 매물은 그 조건에서 제외돼요. 판매 여부와 변경된 가격은 원문에서 확인해 주세요.</p></div><div class="info-block"><h3>찜한 매물과 내 위치</h3><p>찜은 저장 당시 정보를 이 브라우저에 보관해요. 삭제되거나 판매가 끝난 매물도 찜에 남을 수 있어요. 다른 기기와 동기화되지 않으며 브라우저 데이터를 지우면 사라져요. 위치 좌표는 지역명 확인과 거리 계산에만 사용하며 외부로 전송하지 않아요. 선택한 위치·지역명·반경은 이 탭의 방문 기록에 보관해 뒤로가기와 새로고침 때 복원해요. 검색어와 선택한 서비스는 검색 서버와 해당 서비스에 전달돼요.</p></div><div class="info-block"><h3>거래는 원문 서비스에서</h3><p>USED는 구매·결제·채팅을 제공하지 않아요. 토스 디자인 시스템의 공개 원칙을 참고한 독립 구현이며 토스나 매물 제공 서비스의 공식 제휴 서비스가 아니에요.</p></div>`,'<button class="primary-button" id="info-done">확인했어요</button>');$('#info-done').onclick=closeSheet;}
function install(){
 const iconImage='<img src="./assets/apple-touch-icon-1.2.0.png" alt="흰 배경에 USED와 파란 도트가 있는 앱 아이콘" width="76" height="76" style="border:1px solid #e5e8eb;border-radius:18px">';
 if(REQUIRES_LOGIN_REDIRECT){
  const appUrl=new URL(PROTECTED_SEARCH_URL);appUrl.searchParams.set('install','1');
  openSheet('주소창 없이 앱으로 사용하기',`<div class="info-block">${iconImage}<h3>검색용 USED를 홈 화면에 추가해요</h3><p>현재 아이콘이 이 소개 페이지로 연결되어 있으면, 검색할 때 다른 주소로 이동하면서 브라우저의 상·하단 바가 나타나요.</p><ol><li>아래 ‘검색용 USED 열기’를 눌러 로그인해 주세요.</li><li>USED 화면이 열리면 공유 → ‘홈 화면에 추가’를 선택해요.</li><li>‘웹 앱으로 열기’가 보이면 켜고 추가해 주세요.</li></ol><p>다음부터 새 아이콘으로 열면 검색과 상세 페이지를 앱 안에서 이용할 수 있어요.</p></div>`,`<a class="primary-button" href="${esc(appUrl.href)}">검색용 USED 열기</a>`);
  return;
 }
 if(standalone()){
  openSheet('앱으로 사용 중이에요',`<div class="info-block">${iconImage}<h3>검색과 상세 페이지를 한 화면에서</h3><p>USED 안에서는 브라우저 주소창 없이 이용할 수 있어요. 로그인이나 외부 매물 원문을 열 때는 브라우저 화면이 나타날 수 있어요.</p></div>`,'<button class="primary-button" id="install-done">확인했어요</button>');
 }else{
  openSheet('주소창 없이 앱으로 사용하기',`<div class="info-block">${iconImage}<h3>이 검색 화면을 홈 화면에 추가해요</h3><ol><li>Safari에서 USED 화면이 열린 상태로 공유 버튼을 눌러 주세요.</li><li>‘홈 화면에 추가’를 선택해요.</li><li>‘웹 앱으로 열기’가 보이면 켜고, 이름이 USED인지 확인한 뒤 추가해 주세요.</li><li>새로 추가한 USED 아이콘으로 다시 열어 주세요.</li></ol><p>검색과 상세 페이지에서는 브라우저의 주소창·도구 모음 없이 이용할 수 있어요. 로그인이나 외부 원문을 열 때는 브라우저 화면이 나타날 수 있어요.</p><p>기존 GitHub 주소의 아이콘을 쓰고 있다면 새 아이콘을 사용해 주세요. 새 앱에서는 로그인이 다시 필요할 수 있어요.</p></div>`,'<button class="primary-button" id="install-done">알겠어요</button>');
 }
 $('#install-done').onclick=closeSheet;
}
document.addEventListener('click',e=>{
 const el=e.target.closest('button');if(!el)return;
 if(el.dataset.kind){state.kind=el.dataset.kind;state.source='all';state.filters=defaults();state.query='';syncQueries();if(state.page==='search')searchLive();else render();}
 if(el.dataset.source){state.source=el.dataset.source;if(state.page==='search')searchLive();else render();}
 if(el.dataset.suggest)submitSearch(el.dataset.suggest,{reset:state.page==='home'});
 if(el.dataset.save)toggleSave(el.dataset.save);
 if(el.dataset.detail)detail(el.dataset.detail);
 if(el.dataset.page)navigate(el.dataset.page);
 if(el.id==='reset-results')resetFilters();
 if(el.id==='retry-search')searchLive();
});
$('#search-form').onsubmit=e=>{e.preventDefault();submitSearch($('#query').value);$('#query').blur();};
$('#home-search-form').onsubmit=e=>{e.preventDefault();submitSearch($('#home-query').value,{reset:true});$('#home-query').blur();};
$('#query').addEventListener('input',()=>{if(!$('#query').value){state.query='';searchLive();}});
$('#sort').onchange=e=>{if(e.target.value==='distance'&&!state.coords){e.target.value=state.sort;notify('가까운순 정렬을 위해 현재 위치를 설정해 주세요.');locationSheet();return;}state.sort=e.target.value;render();};
$('#filters-open').onclick=()=>filters();$('#price-open').onclick=()=>filters(true);$('#location-open').onclick=locationSheet;$('#nearby-open').onclick=locationSheet;
$('#detail-back').onclick=detailBack;
$('#results-back').onclick=()=>{if(routeHistory.isPending())return;if(history.state?.usedRoute&&routeDepth>0){routeScroll=window.scrollY;routeHistory.rememberScroll(routeScroll);syncRoute();if(routeHistory.back())return;}navigate('home',{replace:true});};
$('#info-open').onclick=info;$('#install-open').onclick=install;$('#home-install').onclick=install;
$('#home-share').onclick=async()=>{
 const button=$('#home-share');if(button.disabled)return;button.disabled=true;
 try{
  const result=await shareService();
  if(result.status==='copied')notify('USED 링크를 복사했어요.');
  if(result.status==='manual'){
   openSheet('USED 공유하기',`<p class="hint">아래 주소를 길게 눌러 복사해 주세요.</p><div class="detail-link-row"><input id="service-share-url" type="url" aria-label="USED 서비스 주소" value="${esc(result.url)}" readonly></div>`,'<button class="primary-button" id="share-done">닫기</button>');
   $('#share-done').onclick=closeSheet;const field=$('#service-share-url');field.focus();field.select();field.setSelectionRange(0,field.value.length);
  }
 }finally{button.disabled=false;}
};
$('#home-install').hidden=standalone()&&!REQUIRES_LOGIN_REDIRECT;
$('#home-header .wordmark').onclick=e=>{e.preventDefault();navigate('home',{replace:state.page==='home'});};
for(const id of ['query','home-query'])$('#'+id).maxLength=80;
if(stored.some(id=>!state.saved.has(id))||snapshots.some(item=>!validateListing(item)))persist();
if(REQUIRES_LOGIN_REDIRECT)for(const id of ['search-form','home-search-form'])$('#'+id+' button[type=submit]').setAttribute('aria-label','로그인 후 검색');
export const appReady=new Promise((resolve,reject)=>{
 try{
  paintIcons();initRefresh();
  restoreRoute(history.state?.usedRoute?history.state:null,resolve).then(()=>{if(installRequested)install();}).catch(reject);
 }catch(error){reject(error);}
});
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
