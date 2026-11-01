import test from 'node:test';
import assert from 'node:assert/strict';
import {createSearchHandler} from '../server/handler.mjs';
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
