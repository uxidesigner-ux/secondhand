import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as locationState from '../src/location-state.js';
import * as search from '../src/search.js';
import * as scope from '../src/search-scope.js';
import {createSearchCache} from '../src/search-cache.js';
import {createRouteHistory} from '../src/route-history.js';

// Exercise the real application handlers without browser/network dependencies.
// This minimal DOM surface tests transitions and requests, not visual rendering.
async function setup(fetchImpl) {
  const elements=new Map();
  const element=selector=>{
    if(!elements.has(selector))elements.set(selector,{value:'',hidden:false,open:false,dataset:{},style:{},textContent:'',
      classList:{toggle(){},add(){},remove(){}},setAttribute(){},querySelector(){return null;},querySelectorAll(){return [];},
      addEventListener(){},insertAdjacentElement(){},focus(){},blur(){},showModal(){this.open=true;},close(){this.open=false;}});
    return elements.get(selector);
  };
  const document={querySelector:element,querySelectorAll:()=>[],addEventListener(){},activeElement:null,body:{style:{}}};
  const location=new URL('https://used-search-api.vercel.app/');
  const history={state:null,replaceState(value){this.state=structuredClone(value);},pushState(value){this.state=structuredClone(value);},back(){}};
  const calls=[];
  const context=vm.createContext({console,URL,URLSearchParams,AbortController,structuredClone,document,location,history,
    window:{matchMedia:()=>({matches:false}),addEventListener(){},scrollTo(){},scrollY:0},navigator:{},
    localStorage:{getItem(){return null;},setItem(){}},requestAnimationFrame:callback=>callback(),setTimeout:()=>1,clearTimeout(){},
    ...locationState,selectedLocationText:locationState.locationText,...search,...scope,createSearchCache,createRouteHistory,
    initRefresh(){},recoverEncar:async({payload})=>payload,resolveDetailItem:()=>null,mountCarDetail:()=>()=>{},
    SEARCH_API_URL:'/api/search',REQUIRES_LOGIN_REDIRECT:false,PROTECTED_SEARCH_URL:location.href,
    fetch:async(url,options)=>{calls.push({url:new URL(url),options});return fetchImpl?.(url,options)||Response.json({items:[],providers:[{source:new URL(url).searchParams.get('kind')==='car'?'kb':'daangn',status:'ok'}]});},
  });
  let source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  source=source.replace(/^import .*;$/gm,'').replace('export const appReady=','const appReady=');
  vm.runInContext(source+'\nglobalThis.app={state,submitSearch,searchLive,filters,appReady};',context);
  await context.app.appReady;
  const settle=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
  return {...context.app,calls,element,settle};
}

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

test('rate-limited responses are retried only by a later user request and never cached',async()=>{
  const app=await setup(()=>Response.json({error:'잠시 후 다시 검색해 주세요.'},{status:429}));
  app.submitSearch('아이폰');await app.settle();
  assert.equal(app.calls.length,1);assert.equal(app.state.live.length,0);
  app.submitSearch('아이폰');await app.settle();
  assert.equal(app.calls.length,2);
});
