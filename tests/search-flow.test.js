import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as locationState from '../src/location-state.js';
import * as search from '../src/search.js';
import * as scope from '../src/search-scope.js';
import {createSearchCache} from '../src/search-cache.js';
import {createRouteHistory} from '../src/route-history.js';
import {createSearchLimitNotice} from '../src/search-limit.js';

// Exercise the real application handlers without browser/network dependencies.
// This minimal DOM surface tests transitions and requests, not visual rendering.
async function setup(fetchImpl,{startTime=100000}={}) {
  let time=startTime,nextTimer=0,historyWrites=0;
  const timers=new Map();
  const schedule=(callback,delay=0)=>{const id=++nextTimer;timers.set(id,{callback,at:time+delay});return id;};
  const elements=new Map();
  const element=selector=>{
    if(!elements.has(selector)){
      const node={value:'',hidden:false,open:false,dataset:{},style:{},writes:{innerHTML:0,textContent:0},
      classList:{toggle(){},add(){},remove(){}},setAttribute(){},querySelector(){return null;},querySelectorAll(){return [];},
      addEventListener(){},insertAdjacentElement(){},focus(){},blur(){},showModal(){this.open=true;},close(){this.open=false;}};
      for(const property of ['innerHTML','textContent']){
        let value='';Object.defineProperty(node,property,{get:()=>value,set:next=>{value=String(next);node.writes[property]++;}});
      }
      elements.set(selector,node);
    }
    return elements.get(selector);
  };
  const document={querySelector:element,querySelectorAll:()=>[],addEventListener(){},activeElement:null,hidden:false,body:{style:{}}};
  const location=new URL('https://used-search-api.vercel.app/');
  const history={state:null,replaceState(value){historyWrites++;this.state=structuredClone(value);},pushState(value){historyWrites++;this.state=structuredClone(value);},back(){}};
  const calls=[];
  const context=vm.createContext({console,URL,URLSearchParams,AbortController,structuredClone,document,location,history,
    window:{matchMedia:()=>({matches:false}),addEventListener(){},scrollTo(){},scrollY:0},navigator:{},
    localStorage:{getItem(){return null;},setItem(){}},requestAnimationFrame:callback=>callback(),setTimeout:schedule,clearTimeout:id=>timers.delete(id),
    ...locationState,selectedLocationText:locationState.locationText,...search,...scope,
    createSearchCache:options=>createSearchCache({...options,now:()=>time}),createRouteHistory,
    createSearchLimitNotice:()=>createSearchLimitNotice({now:()=>time}),
    initRefresh(){},recoverEncar:async({payload})=>payload,resolveDetailItem:()=>null,mountCarDetail:()=>()=>{},
    SEARCH_API_URL:'/api/search',REQUIRES_LOGIN_REDIRECT:false,PROTECTED_SEARCH_URL:location.href,
    fetch:async(url,options)=>{calls.push({url:new URL(url),options});return fetchImpl?.(url,options)||Response.json({items:[],providers:[{source:new URL(url).searchParams.get('kind')==='car'?'kb':'daangn',status:'ok'}]});},
  });
  let source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  source=source.replace(/^import .*;$/gm,'').replace('export const appReady=','const appReady=');
  vm.runInContext(source+'\nglobalThis.app={state,submitSearch,searchLive,filters,renderLimitNotice,searchLimitNotice,options,routeData,restoreRoute,appReady};',context);
  await context.app.appReady;
  const settle=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
  const advance=async milliseconds=>{
    const target=time+milliseconds;let runs=0;
    while(true){
      const next=[...timers].filter(([,timer])=>timer.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];
      if(!next)break;
      assert.ok(++runs<1000,'timer loop must be bounded');
      time=next[1].at;timers.delete(next[0]);next[1].callback();await settle();
    }
    time=target;await settle();
  };
  return {...context.app,calls,element,settle,advance,document,
    historyWrites:()=>historyWrites,timerCount:()=>timers.size};
}

const listing=(changes={})=>({id:'other-123',title:'아이폰 15',price:450000,kind:'goods',source:'other',
  sourceName:'헬로마켓',category:'digital',condition:'used',status:'selling',methods:['shipping'],region:'서울',
  url:'https://www.hellomarket.com/item/123',publishedAt:null,...changes});
const successful=(items=[],extra={})=>Response.json({items,providers:[{source:'other',status:'ok',count:items.length}],
  fetchedAt:'2026-11-06T00:00:00.000Z',partial:false,...extra});
const warning={scope:'ip-instance',limit:12,remaining:2,resetAfter:30};
const limited=()=>Response.json({code:'API_RATE_LIMIT',error:'잠시 후 다시 검색해 주세요.'},
  {status:429,headers:{'Retry-After':'18'}});

test('home category and selected service persist through subsequent result-page searches',async()=>{
  const app=await setup();
  app.state.kind='car';app.state.source='kb';
  app.submitSearch('그랜저');await app.settle();
  app.submitSearch('쏘렌토');await app.settle();
  assert.deepEqual(app.calls.map(({url})=>Object.fromEntries(url.searchParams)),[
    {q:'그랜저',kind:'car',source:'kb'},{q:'쏘렌토',kind:'car',source:'kb'},
  ]);
  assert.equal(app.state.kind,'car');assert.equal(app.state.source,'kb');
});

test('price, region and sorting apply locally; changing service alone triggers another scoped lookup',async()=>{
  const app=await setup();app.state.kind='car';
  app.submitSearch('그랜저');await app.settle();
  app.filters();
  app.element('#f-minPrice').value='1000000';app.element('#filter-region').value='서울';app.element('#filter-region').oninput();
  app.element('#sheet-body').onclick({target:{closest:()=>({dataset:{option:'sort',value:'price-asc'}})}});
  app.element('#filter-apply').onclick();await app.settle();
  assert.equal(app.calls.length,1);assert.equal(app.state.region,'서울');assert.equal(app.state.sort,'price-asc');
  assert.equal(app.state.filters.minPrice,'1000000');
  app.filters();
  app.element('#sheet-body').onclick({target:{closest:()=>({dataset:{option:'source',value:'encar'}})}});
  app.element('#filter-apply').onclick();await app.settle();
  assert.equal(app.calls.length,2);assert.equal(app.calls[1].url.searchParams.get('kind'),'car');
  assert.equal(app.calls[1].url.searchParams.get('source'),'encar');
});

test('identical pending submissions and successful repeat searches make one API request',async()=>{
  let resolve;
  const app=await setup(()=>new Promise(done=>{resolve=done;}));
  app.submitSearch(' 아이폰  ');app.submitSearch('아이폰');
  assert.equal(app.calls.length,1);
  resolve(Response.json({items:[],providers:[{source:'daangn',status:'ok'}]}));await app.settle();
  app.submitSearch('아이폰');await app.settle();
  assert.equal(app.calls.length,1);assert.equal(app.state.requested,true);assert.equal(app.state.loading,false);
});

test('rate-limited requests wait for Retry-After without automatic retry',async()=>{
  const app=await setup(limited);
  app.submitSearch('아이폰');await app.settle();
  assert.equal(app.calls.length,1);assert.equal(app.state.live.length,0);
  app.submitSearch('아이폰');await app.settle();
  assert.equal(app.calls.length,1);
  assert.match(app.element('#search-limit-message').textContent,/18초/);
  assert.equal(app.element('#retry-search').disabled,true);
  await app.advance(18000);
  assert.equal(app.element('#search-limit-notice').hidden,true);
  assert.equal(app.element('#retry-search').disabled,false);
  assert.equal(app.calls.length,1);
  app.submitSearch('아이폰');await app.settle();
  assert.equal(app.calls.length,2);
});

test('warning is announced once and a dismissal survives fresh responses, cache and filter renders',async()=>{
  const app=await setup(()=>successful([listing()],{rateLimit:warning}));
  app.submitSearch('아이폰');await app.settle();
  assert.equal(app.element('#search-limit-notice').hidden,false);
  assert.equal(app.element('#search-limit-notice').dataset.kind,'warning');
  const announcements=app.element('#search-limit-announcement').writes.textContent;
  app.filters();app.element('#f-minPrice').value='100';app.element('#filter-apply').onclick();await app.settle();
  app.submitSearch('아이폰');await app.settle();
  assert.equal(app.calls.length,1);
  assert.equal(app.element('#search-limit-announcement').writes.textContent,announcements);
  app.element('#search-limit-dismiss').onclick();
  app.submitSearch('아이폰 15');await app.settle();
  assert.equal(app.calls.length,2);assert.equal(app.element('#search-limit-notice').hidden,true);
  app.submitSearch('아이폰');await app.settle();
  assert.equal(app.calls.length,2);assert.equal(app.element('#search-limit-notice').hidden,true);
  await app.advance(31000);
  app.submitSearch('아이폰');await app.settle();
  assert.equal(app.calls.length,2);assert.equal(app.element('#search-limit-notice').hidden,true);
  app.submitSearch('아이폰 16');await app.settle();
  assert.equal(app.calls.length,3);assert.equal(app.element('#search-limit-notice').hidden,false);
});

test('429 retains the previous same-scope result under its original query and allows cached results',async()=>{
  const app=await setup(url=>new URL(url).searchParams.get('q')==='아이폰'?successful([listing()]):limited());
  app.state.source='other';
  app.submitSearch('아이폰');await app.settle();
  app.submitSearch('에어팟');await app.settle();
  assert.equal(app.calls.length,2);assert.equal(app.state.query,'에어팟');
  assert.equal(app.state.live.length,1);assert.equal(app.state.retainedQuery,'아이폰');
  assert.equal(app.options().query,'아이폰');
  assert.equal(search.filterListings(app.state.live,app.options()).length,1);
  assert.equal(app.element('#results-title').textContent,'이전 ‘아이폰’ 검색 결과');
  assert.match(app.element('#results').innerHTML,/https:\/\/www\.hellomarket\.com\/item\/123/);
  app.submitSearch('카메라');await app.settle();
  assert.equal(app.calls.length,2);assert.equal(app.state.retainedQuery,'아이폰');
  app.submitSearch('아이폰');await app.settle();
  assert.equal(app.calls.length,2);assert.equal(app.state.retainedQuery,null);
  assert.equal(app.state.live.length,1);assert.equal(app.element('#results-title').textContent,'‘아이폰’ 검색 결과');
  await app.advance(18000);
  assert.equal(app.calls.length,2);
  app.submitSearch('에어팟');await app.settle();
  assert.equal(app.calls.length,3);
});

test('blocked searches never retain listings from another category or selected service',async()=>{
  for(const change of [{kind:'car',source:'all'},{kind:'goods',source:'bunjang'}]){
    const app=await setup(url=>new URL(url).searchParams.get('q')==='아이폰'?successful([listing()]):limited());
    app.state.source='other';app.submitSearch('아이폰');await app.settle();
    app.submitSearch('에어팟');await app.settle();
    Object.assign(app.state,change);app.submitSearch('새 검색');await app.settle();
    assert.equal(app.calls.length,2);assert.equal(app.state.live.length,0);assert.equal(app.state.retainedQuery,null);
  }
});

test('countdown only updates notice controls and stops outside the results screen',async()=>{
  const app=await setup(limited);app.submitSearch('아이폰');await app.settle();
  const writes=app.element('#results').writes.innerHTML,historyWrites=app.historyWrites();
  const announcementWrites=app.element('#search-limit-announcement').writes.textContent;
  await app.advance(5000);
  assert.match(app.element('#search-limit-message').textContent,/13초/);
  assert.equal(app.element('#results').writes.innerHTML,writes);assert.equal(app.historyWrites(),historyWrites);
  assert.equal(app.element('#search-limit-announcement').writes.textContent,announcementWrites);
  app.state.page='saved';app.renderLimitNotice();
  assert.equal(app.element('#search-limit-notice').hidden,true);assert.equal(app.timerCount(),0);
  await app.advance(30000);assert.equal(app.calls.length,1);
  app.state.page='search';app.renderLimitNotice();
  assert.equal(app.element('#search-limit-notice').hidden,true);
});

test('returning from details after the wait preserves old results without automatically retrying the rejected query',async()=>{
  const app=await setup(url=>new URL(url).searchParams.get('q')==='아이폰'?successful([listing()]):limited());
  app.state.source='other';app.submitSearch('아이폰');await app.settle();
  app.submitSearch('에어팟');await app.settle();
  const entry=structuredClone(app.routeData());
  app.state.page='detail';app.renderLimitNotice();
  await app.advance(20000);
  await app.restoreRoute(entry);await app.settle();
  assert.equal(app.calls.length,2);assert.equal(app.state.retainedQuery,'아이폰');
  assert.equal(app.state.live.length,1);assert.equal(app.options().query,'아이폰');
  assert.equal(app.element('#search-limit-notice').hidden,true);
  // A reload with no in-memory list must also require an explicit new search.
  const fresh=await setup();await fresh.restoreRoute(entry);await fresh.settle();
  assert.equal(fresh.calls.length,0);assert.equal(fresh.state.live.length,0);
  fresh.submitSearch('에어팟');await fresh.settle();assert.equal(fresh.calls.length,1);
});
