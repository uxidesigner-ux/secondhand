import test from 'node:test';
import assert from 'node:assert/strict';
import {createSearchHandler} from '../server/handler.mjs';
import {createCostGuard} from '../server/cost-guard.mjs';
const item={id:'actual-1',title:'아이폰 15',price:790000,kind:'goods',source:'daangn',sourceName:'당근',category:'digital',condition:'used',status:'selling',methods:['direct'],region:'서울',url:'https://www.daangn.com/kr/buy-sell/test-item/'};
const retired={...item,id:'demo-01',demo:true};
const request=(qs,method='GET')=>new Request('https://example.test/api/search?'+qs,{method});
test('rejects invalid input before upstream network calls',async()=>{let calls=0;const handler=createSearchHandler({searchGoods:()=>{calls++}});for(const qs of ['q=','q=x&kind=invalid','q=x&source=https://evil.test','q='+('a'.repeat(81))])assert.equal((await handler(request(qs))).status,400);assert.equal((await handler(request('q=x','POST'))).status,405);assert.equal(calls,0);});
test('returns actual unique matching records only and exposes partial providers',async()=>{const handler=createSearchHandler({searchGoods:async()=>({items:[retired,item,item,{...item,id:'bad',url:'javascript:alert(1)'},{...item,id:'unrelated',title:'의자'}],providers:[{source:'daangn',status:'ok',count:5},{source:'bunjang',status:'unavailable',count:0}]})});const response=await handler(request('q='+encodeURIComponent('아이폰')));const body=await response.json();assert.equal(response.status,200);assert.equal(body.items.length,1);assert.equal(body.items[0].id,'actual-1');assert.equal(body.providers[0].count,1);assert.equal(body.partial,true);assert.equal(response.headers.get('access-control-allow-origin'),'*');});
test('failed upstream is a visible error, not empty success or demo fallback',async()=>{const handler=createSearchHandler({searchCars:async()=>({items:[],providers:[{source:'encar',status:'error',count:0}]})});const response=await handler(request('q=BMW&kind=car'));assert.equal(response.status,502);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual((await response.json()).items,[]);});

test('protected search links keep fixed host and escape query values without bypass tokens',async()=>{
 const {protectedSearchUrl}=await import('../src/config.js');
 const url=new URL(protectedSearchUrl({query:'아이폰&x=1',kind:'goods',source:'all'}));
 assert.equal(url.origin,'https://used-search-api.vercel.app');
 assert.equal(url.searchParams.get('q'),'아이폰&x=1');
 assert.equal(url.searchParams.get('x'),null);
 assert.equal(url.searchParams.has('_vercel_share'),false);
});

test('unknown and duplicate search parameters cannot create unbounded cache variants',async()=>{
 let calls=0;const handler=createSearchHandler({searchGoods:async()=>{calls++;}});
 for(const qs of ['q=x&nonce=1','q=x&q=y','q=x&kind=goods&kind=car','q=x&source=all&source=kb','q=x%00y'])assert.equal((await handler(request(qs))).status,400);
 assert.equal(calls,0);
});

test('search dispatch stays inside selected category and source, including all within a category',async()=>{
 const calls=[];
 const provider=kind=>async ({query,source,signal,providerGuard})=>{assert.ok(signal instanceof AbortSignal);assert.equal(typeof providerGuard.run,'function');calls.push([kind,query,source]);return {items:[],providers:[{source:source==='all'?(kind==='car'?'kb':'daangn'):source,status:'ok',count:0}]};};
 const handler=createSearchHandler({searchCars:provider('car'),searchGoods:provider('goods')});
 for(const [kind,source] of [['car','all'],['car','kb'],['goods','all'],['goods','bunjang']])assert.equal((await handler(request(`q=keyword&kind=${kind}&source=${source}`))).status,200);
 for(const qs of ['q=keyword&kind=car&source=daangn','q=keyword&kind=goods&source=encar'])assert.equal((await handler(request(qs))).status,400);
 assert.deepEqual(calls,[['car','keyword','all'],['car','keyword','kb'],['goods','keyword','all'],['goods','keyword','bunjang']]);
});

test('search normalization and parameter order share cache while source boundaries remain distinct',async()=>{
 let calls=0;const handler=createSearchHandler({searchGoods:async ({query})=>{calls++;assert.equal(query,'아이폰 15');return {items:[item],providers:[{source:'daangn',status:'ok',count:1}]};}});
 const first=await handler(request('q='+encodeURIComponent('  아이폰   １５ ')));
 assert.match(first.headers.get('cache-control'),/s-maxage=180/);
 const second=await handler(request('source=all&kind=goods&q='+encodeURIComponent('아이폰 15')));
 assert.deepEqual(await second.json(),await first.json());assert.equal(calls,1);
 await handler(request('source=daangn&q='+encodeURIComponent('아이폰 15')));assert.equal(calls,2);
});

test('API shedding and disabled responses never provide a browser-recovery contract',async()=>{
 let calls=0;const get=async()=>{calls++;return {items:[],providers:[{source:'encar',status:'ok',count:0}]};};
 const handler=createSearchHandler({searchCars:get,guard:createCostGuard({requestsPerWindow:1,enabled:()=>true})});
 assert.equal((await handler(request('q=BMW&kind=car'))).status,200);
 const limited=await handler(request('q=Audi&kind=car'));
 assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('retry-after'))>0);assert.equal(limited.headers.get('cache-control'),'private, no-store');
 const body=await limited.json();assert.equal(body.code,'API_RATE_LIMIT');assert.equal(body.providers,undefined);assert.equal(body.items,undefined);
 const disabled=createSearchHandler({searchCars:get,guard:createCostGuard({enabled:()=>false})});
 const stopped=await disabled(request('q=BMW&kind=car'));
 assert.equal(stopped.status,503);assert.equal((await stopped.json()).code,'API_DISABLED');assert.equal(calls,1);
});

test('search warnings are caller-specific private responses while ordinary listings keep shared CDN caching',async()=>{
 let time=0,calls=0;
 const guard=createCostGuard({enabled:()=>true,now:()=>time,identity:r=>r.headers.get('x-test-client')});
 const handler=createSearchHandler({guard,searchGoods:async()=>{calls++;return {items:[item],providers:[{source:'daangn',status:'ok'}]};}});
 const get=id=>handler(new Request('https://example.test/api/search?q='+encodeURIComponent('아이폰'),{headers:{'x-test-client':id}}));
 for(let n=1;n<=9;n++){
  const response=await get('frequent');assert.equal(response.status,200);
  assert.match(response.headers.get('cache-control'),/s-maxage=180/);
  assert.equal((await response.json()).rateLimit,undefined);
 }
 const warning=await get('frequent'),body=await warning.json();
 assert.equal(warning.status,200);
 assert.deepEqual(body.rateLimit,{scope:'ip-instance',limit:12,remaining:2,resetAfter:60});
 for(const name of ['cache-control','cdn-cache-control','vercel-cdn-cache-control'])assert.match(warning.headers.get(name),/no-store/);
 assert.equal(warning.headers.get('cache-control'),'private, no-store');
 const other=await get('new');assert.equal((await other.json()).rateLimit,undefined);assert.match(other.headers.get('cache-control'),/s-maxage=180/);
 await get('frequent');await get('frequent');time=1000;
 const blocked=await get('frequent'),blockedBody=await blocked.json();
 assert.equal(blocked.status,429);assert.equal(blocked.headers.get('retry-after'),'59');
 assert.deepEqual(blockedBody.rateLimit,{scope:'ip-instance',limit:12,remaining:0,resetAfter:59});
 assert.equal(blockedBody.items,undefined);
 for(const name of ['cache-control','cdn-cache-control','vercel-cdn-cache-control'])assert.match(blocked.headers.get(name),/no-store/);
 time=60000;
 const reset=await get('frequent');assert.equal((await reset.json()).rateLimit,undefined);assert.match(reset.headers.get('cache-control'),/s-maxage=180/);
 assert.equal(calls,1);
});

test('invalid input and disabled search do not mislabel overall service usage as a quota warning',async()=>{
 const handler=createSearchHandler({guard:createCostGuard({enabled:()=>false}),searchGoods:async()=>{throw Error('must not call');}});
 for(const [query,expected] of [['q=',400],['q=iphone',503]]){
  const response=await handler(request(query));assert.equal(response.status,expected);
  assert.equal((await response.json()).rateLimit,undefined);assert.equal(response.headers.get('cache-control'),'no-store');
 }
});
