import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDaangn,parseJoongna,parseBunjang,parseHello,searchGoods} from '../server/providers/goods.mjs';
const now='2026-11-01T10:00:00.000Z';

test('Daangn public loader records retain direct URLs, listing coordinates and known dates',()=>{
  const context={state:{loaderData:{route:{buySellArticles:[{href:'/kr/buy-sell/test-abc123/',title:'아이폰',price:'300000',thumbnail:'https://img.example.com/item.jpg',region:{name:'성수동'},contentCoordinates:[{latitude:37.5,longitude:127.0}],status:'Ongoing',createdAt:'2026-10-31T10:00:00Z'}]}}}};
  const result=parseDaangn(`<script>window.__remixContext = ${JSON.stringify(context)};</script>`,now);
  assert.equal(result[0].url,'https://www.daangn.com/kr/buy-sell/test-abc123/');
  assert.equal(result[0].lat,37.5);assert.equal(result[0].condition,'unknown');assert.deepEqual(result[0].methods,[]);
  assert.equal(result[0].publishedAt,'2026-10-31T10:00:00.000Z');assert.equal(result[0].collectedAt,now);
});

test('Joongna Flight JSON is decoded without executing scripts or mistaking cafe items for direct products',()=>{
  const data={items:[{objectType:'product',platformType:1,seq:123,title:'테스트',price:20000,url:'https://img.example.com/i.jpg',locationNames:['서울 성동구'],sortDate:'2026-11-01 19:00:00'},{objectType:'product',platformType:2,seq:321,title:'카페 글',price:1000}]};
  const payload=[1,`6:${JSON.stringify(['$',null,null,{state:data}])}\n`];
  const result=parseJoongna(`<script>self.__next_f.push(${JSON.stringify(payload)})</script>`,now);
  assert.equal(result.length,1);assert.equal(result[0].url,'https://web.joongna.com/product/123');
  assert.equal(result[0].updatedAt,now);assert.equal(result[0].publishedAt,null);assert.equal(result[0].status,'unknown');
});

test('Bunjang excludes sponsored products and external ads, expands only image resolution placeholder',()=>{
  const row={pid:123,name:'에어팟',price:80000,type:'PRODUCT',ad:false,status:'SELLING',productImage:'https://media.bunjang.co.kr/product/123_1_w{res}.jpg',updatedAt:now};
  const payload={data:{searchSpec:{uiBlockList:[{blockType:'productList.grid.main',searchResponse:{data:[row,{...row,pid:124,ad:true},{...row,pid:125,type:'EXTERNAL_AD'},{...row,pid:123}]}}]}}};
  const result=parseBunjang(payload,now);
  assert.equal(result.length,1);assert.equal(result[0].image,'https://media.bunjang.co.kr/product/123_1_w640.jpg');
  assert.equal(result[0].url,'https://m.bunjang.co.kr/products/123');assert.equal(result[0].region,'');
});

test('HelloMarket ignores ad data and normalizes explicit source states without inventing region or coordinates',()=>{
  const payload={props:{initialState:{searchData:{itemData:[{itemIdx:123,title:'상품',price:4000,usedType:{code:'AsNew'},sellState:{code:'ForSale'},categories:[{name:'휴대폰'}],imageUrl:'javascript:alert(1)',timestamp:1793527200000}],naverAdList:[{title:'광고',price:1}]}}}};
  const result=parseHello(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(payload)}</script>`,now);
  assert.equal(result.length,1);assert.equal(result[0].condition,'like-new');assert.equal(result[0].category,'digital');
  assert.equal(result[0].image,'');assert.equal(result[0].region,'');assert.equal(result[0].lat,undefined);
});

test('format changes fail explicitly instead of silently claiming zero results',()=>{
  assert.throws(()=>parseDaangn('<html>Login required</html>'),/PAGE_FORMAT_CHANGED/);
  assert.throws(()=>parseJoongna('<html>Bot check</html>'),/PAGE_FORMAT_CHANGED/);
  assert.throws(()=>parseBunjang({data:{error:'unauthorized'}}),/PAGE_FORMAT_CHANGED/);
  assert.throws(()=>parseHello('<html>Changed</html>'),/PAGE_FORMAT_CHANGED/);
});

test('search returns per-provider restriction status without retrying or bypassing a denial',async()=>{
  const oldFetch=globalThis.fetch;let calls=0;
  globalThis.fetch=async url=>{calls++;assert.match(url,/q=%EC%95%84%EC%9D%B4%ED%8F%B0%20%26%20%3C/);return new Response('denied',{status:403});};
  try {
    const result=await searchGoods({query:'아이폰 & <',source:'bunjang'});
    assert.equal(calls,1);assert.deepEqual(result.items,[]);assert.equal(result.providers[0].status,'unavailable');
  } finally {globalThis.fetch=oldFetch;}
});

test('empty queries do not make upstream requests',async()=>{
  const oldFetch=globalThis.fetch;globalThis.fetch=()=>{throw Error('must not fetch');};
  try {const result=await searchGoods({query:'  '});assert.equal(result.items.length,0);assert.equal(result.providers.length,4);}
  finally {globalThis.fetch=oldFetch;}
});


test('missing or blank prices are excluded rather than rendered as free listings',()=>{
  const rows=[null,'',undefined,' ',0,'0'].map((value,index)=>({pid:index+1,name:'상품',price:value,type:'PRODUCT',ad:false,status:'SELLING'}));
  const payload={data:{searchSpec:{uiBlockList:[{blockType:'productList.grid.main',searchResponse:{data:rows}}]}}};
  const result=parseBunjang(payload,now);
  assert.equal(result.length,2);assert.ok(result.every(item=>item.price===0));
});
