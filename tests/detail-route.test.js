import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveDetailItem} from '../src/detail-route.js';
import {validateListing} from '../src/search.js';

const listing=(patch={})=>({
  id:'bunjang:12345',kind:'goods',source:'bunjang',sourceName:'번개장터',
  title:'실제 매물',price:35000,url:'https://m.bunjang.co.kr/products/12345',
  image:'',category:'unknown',condition:'unknown',status:'unknown',methods:[],region:'',
  publishedAt:null,collectedAt:'2026-11-01T12:00:00Z',demo:false,...patch,
});
const kb=listing({id:'kb-28882930',kind:'car',source:'kb',sourceName:'KB차차차',category:'car',
  title:'재규어 All New XF',price:8500000,url:'https://www.kbchachacha.com/public/car/detail.kbc?carSeq=28882930'});

test('detail history resolves all provider ID formats, including goods colons and Korean slugs',()=>{
  const candidates=[
    listing(),
    listing({id:'joongna:54321',source:'joongna',sourceName:'중고나라',url:'https://web.joongna.com/product/54321'}),
    listing({id:'other:98765',source:'other',sourceName:'헬로마켓',url:'https://www.hellomarket.com/item/98765'}),
    listing({id:'daangn:아이폰-15-pro-abc',source:'daangn',sourceName:'당근',url:'https://www.daangn.com/kr/buy-sell/아이폰-15-pro-abc/'}),
    listing({id:'daangn:%EC%95%84%EC%9D%B4%ED%8F%B0-abc',source:'daangn',sourceName:'당근',url:'https://www.daangn.com/kr/buy-sell/%EC%95%84%EC%9D%B4%ED%8F%B0-abc/'}),
    kb,
    listing({id:'encar-42814979',kind:'car',source:'encar',sourceName:'엔카',category:'car',url:'https://fem.encar.com/cars/detail/42814979'}),
    listing({id:'kcar-EC61424432',kind:'car',source:'kcar',sourceName:'K Car',category:'car',url:'https://www.kcar.com/bc/detail/carInfoDtl?i_sCarCd=EC61424432'}),
  ];
  for(const candidate of candidates){
    assert.equal(validateListing(candidate),true);
    const result=resolveDetailItem({id:candidate.id,candidates});
    assert.deepEqual(result,candidate);assert.notEqual(result,candidate);
  }
});

test('snapshot lookup uses exact identity and rejects malformed or unsafe listing records',()=>{
  assert.equal(resolveDetailItem({id:'bunjang:777',candidates:[listing()]}),null);
  const badURLs=[
    'javascript:alert(1)', 'http://m.bunjang.co.kr/products/12345',
    'https://m.bunjang.co.kr.evil.test/products/12345',
    'https://user:secret@m.bunjang.co.kr/products/12345',
    'https://m.bunjang.co.kr:444/products/12345',
    'https://www.hellomarket.com/item/12345',
  ];
  for(const url of badURLs)assert.equal(resolveDetailItem({id:'bunjang:12345',candidates:[listing({url})]}),null);
  for(const price of [-1,NaN,Infinity,'35000'])assert.equal(resolveDetailItem({id:'bunjang:12345',candidates:[listing({price})]}),null);
  assert.equal(resolveDetailItem({id:'bunjang:12345',candidates:[null,{},listing({title:''})]}),null);
});

test('retired preview snapshots cannot reappear through old detail routes',()=>{
  const live=listing(),demo=listing({id:'demo-01',demo:true,title:'예시 매물'});
  assert.equal(resolveDetailItem({id:demo.id,mode:'live',candidates:[demo]}),null);
  assert.deepEqual(resolveDetailItem({id:live.id,mode:'demo',candidates:[live]}),live);
  assert.equal(resolveDetailItem({id:demo.id,mode:'demo',candidates:[live,demo]}),null);
  assert.equal(resolveDetailItem({id:kb.id,mode:'demo',candidates:[]}).price,null);
  const sameIdDemo={...kb,demo:true,title:'샘플 차량'};
  const recovered=resolveDetailItem({id:kb.id,mode:'live',candidates:[sameIdDemo]});
  assert.equal(recovered.demo,false);assert.equal(recovered.price,null);assert.notEqual(recovered.title,sameIdDemo.title);
});

test('a direct positive KB ID reconstructs only its fixed origin and unknown vehicle facts',()=>{
  const result=resolveDetailItem({id:'kb-28882930'});
  assert.equal(result.id,'kb-28882930');assert.equal(result.kind,'car');assert.equal(result.source,'kb');
  assert.equal(result.url,'https://www.kbchachacha.com/public/car/detail.kbc?carSeq=28882930');
  assert.equal(result.price,null);assert.equal(result.year,null);assert.equal(result.mileage,null);
  assert.equal(result.fuel,'unknown');assert.equal(result.condition,'unknown');assert.equal(result.status,'unknown');
  assert.deepEqual(result.methods,[]);assert.equal(result.publishedAt,null);assert.equal(result.collectedAt,null);
  assert.equal(result.image,'');assert.equal(result.region,'');assert.equal(result.demo,false);
  assert.equal(validateListing(result),false,'an incomplete direct-link placeholder cannot be saved as a real priced listing');
});

test('a KB snapshot for a different source or vehicle cannot replace the canonical detail identity',()=>{
  const mismatches=[
    {...kb,url:'https://www.kbchachacha.com/public/car/detail.kbc?carSeq=1234'},
    {...kb,url:kb.url+'&carSeq=1234'},
    {...kb,source:'encar',sourceName:'엔카',url:'https://fem.encar.com/cars/detail/28882930'},
    {...kb,kind:'goods'},
  ];
  for(const candidate of mismatches){
    const result=resolveDetailItem({id:kb.id,candidates:[candidate]});
    assert.equal(result.source,'kb');assert.equal(result.kind,'car');assert.equal(result.url,kb.url);
    assert.equal(result.price,null);assert.equal(result.title,'차량 상세정보');
  }
});

test('unavailable providers or invalid IDs never fabricate an external listing',()=>{
  for(const id of ['bunjang:12345','encar-42814979','kcar-EC61424432','kb-0','kb-028882930',
    'kb--1','kb-1e3','kb-1234567890123','kb-../28882930','https://example.test/28882930','',null,23,'x'.repeat(513),'kb-28882930\n']){
    assert.equal(resolveDetailItem({id}),null,String(id));
  }
});
