import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveDetailItem, parseCarDetailId, carDetailIdentity} from '../src/detail-route.js';
import {validateListing} from '../src/search.js';

const listing=(patch={})=>({
  id:'bunjang:12345',kind:'goods',source:'bunjang',sourceName:'번개장터',
  title:'실제 매물',price:35000,url:'https://m.bunjang.co.kr/products/12345',
  image:'',category:'unknown',condition:'unknown',status:'unknown',methods:[],region:'',
  publishedAt:null,collectedAt:'2026-11-01T12:00:00Z',demo:false,...patch,
});
const kb=listing({id:'kb-28882930',kind:'car',source:'kb',sourceName:'KB차차차',category:'car',
  title:'재규어 All New XF',price:8500000,url:'https://www.kbchachacha.com/public/car/detail.kbc?carSeq=28882930'});
const encar=listing({id:'encar-41942591',kind:'car',source:'encar',sourceName:'엔카',category:'car',url:'https://fem.encar.com/cars/detail/41942591'});
const kcar=listing({id:'kcar-EC61424432',kind:'car',source:'kcar',sourceName:'K Car',category:'car',url:'https://www.kcar.com/bc/detail/carInfoDtl?i_sCarCd=EC61424432'});

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

test('direct known car IDs reconstruct only fixed origins and unknown vehicle facts',()=>{
 for(const vehicle of [kb,encar,kcar]){
  const result=resolveDetailItem({id:vehicle.id});
  assert.equal(result.id,vehicle.id);assert.equal(result.kind,'car');assert.equal(result.source,vehicle.source);
  assert.equal(result.sourceName,vehicle.sourceName);assert.equal(result.url,vehicle.url);
  assert.equal(result.price,null);assert.equal(result.year,null);assert.equal(result.mileage,null);
  assert.equal(result.fuel,'unknown');assert.equal(result.condition,'unknown');assert.equal(result.status,'unknown');
  assert.deepEqual(result.methods,[]);assert.equal(result.publishedAt,null);assert.equal(result.collectedAt,null);
  assert.equal(result.image,'');assert.equal(result.region,'');assert.equal(result.demo,false);
  assert.equal(validateListing(result),false,'an incomplete direct-link placeholder cannot be saved as a real priced listing');
 }
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

test('unknown providers and invalid IDs never fabricate an external listing',()=>{
  for(const id of ['bunjang:12345','kb-0','kb-028882930',
    'kb--1','kb-1e3','kb-1234567890123','kb-../28882930','encar-0','encar-041942591','encar-41942591/other',
    'encar-1234567890123','kcar-61424432','kcar-ec61424432','kcar-EC','kcar-EC1234567890123','kcar-EC61424432?x=1',
    'https://example.test/28882930','',null,23,'x'.repeat(513),'kb-28882930\n','encar-41942591\n','kcar-EC61424432\n']){
    assert.equal(resolveDetailItem({id}),null,String(id));
  }
});

test('Encar and K Car snapshots must match both source identity and exact vehicle URL',()=>{
 for(const vehicle of [encar,kcar]){
  const otherNumber=vehicle.url.replace(/41942591|61424432/,'99999999');
  for(const candidate of [
    {...vehicle,url:otherNumber}, {...vehicle,url:vehicle.url.replace('https:','http:')},
    {...vehicle,url:vehicle.url.replace('https://','https://user:secret@')},
    {...vehicle,url:vehicle.url.replace('.com/','.com.evil.test/')}, {...vehicle,kind:'goods'},
    {...vehicle,source:'kb',url:kb.url},
  ]){
    assert.equal(carDetailIdentity(candidate),null);
    const restored=resolveDetailItem({id:vehicle.id,candidates:[candidate]});
    assert.equal(restored.url,vehicle.url);assert.equal(restored.price,null);
  }
  const tracked={...vehicle,url:vehicle.url+(vehicle.url.includes('?')?'&':'?')+'utm_source=used'};
  assert.deepEqual(resolveDetailItem({id:vehicle.id,candidates:[tracked]}),tracked,'keep the original selected listing URL');
 }
 assert.equal(carDetailIdentity({...kcar,url:kcar.url+'&i_sCarCd=EC61424432'}),null);
 assert.equal(carDetailIdentity({...encar,url:encar.url+'/extra'}),null);
 assert.equal(parseCarDetailId(kcar.id).number,'EC61424432');
 assert.equal(resolveDetailItem({id:'encar-0',candidates:[listing({id:'encar-0'})]}),null);
 assert.equal(resolveDetailItem({id:encar.id,candidates:null}).url,encar.url);
});
