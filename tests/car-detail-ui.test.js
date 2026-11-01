import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCarDetail} from '../src/car-detail.js';

const number = '28882930';
const sourceUrl = `https://www.kbchachacha.com/public/car/detail.kbc?carSeq=${number}`;
const image = suffix => `https://img.kbchachacha.com/IMG/carimg/l/img08/img2888/${number}_${suffix}.jpeg`;
const item = {id:`kb-${number}`,source:'kb',kind:'car',demo:false,url:sourceUrl};
const detail = extra => ({
  id:item.id, source:'kb', sourceUrl, title:'재규어 All New XF 2.0d Prestige',price:8500000,
  photos:[image('front')], specs:[{label:'주행거리',value:'70,346km'}],
  inspection:[{label:'보험사고정보',value:'사고있음'},{label:'보험이력',value:'4건'}],
  optionGroups:[{label:'주요옵션',items:['내비게이션(순정)']}],
  fetchedAt:'2026-11-01T11:00:00.000Z', ...extra,
});

test('car detail identity must match the selected live KB vehicle and canonical original URL',()=>{
  assert.equal(normalizeCarDetail(detail(),item).id,item.id);
  for(const patch of [{id:'kb-1234'},{source:'encar'},{sourceUrl:sourceUrl.replace(number,'1234')},{sourceUrl:sourceUrl+'&carSeq=1234'}]) {
    assert.equal(normalizeCarDetail(detail(patch),item),null);
  }
  for(const patch of [{demo:true},{source:'encar'},{kind:'goods'},{id:'kb-0'},{id:'kb-028882930'},{id:'kb-../28882930'}]) {
    assert.equal(normalizeCarDetail(detail(),{...item,...patch}),null);
  }
  for(const raw of [null,undefined,[],{},detail({title:''}),detail({title:10})]) {
    assert.equal(normalizeCarDetail(raw,item),null);
  }
});

test('car detail never accepts spoofed, credentialed, insecure or redirected listing links',()=>{
  const invalid=[
    `http://www.kbchachacha.com/public/car/detail.kbc?carSeq=${number}`,
    `https://www.kbchachacha.com.evil.test/public/car/detail.kbc?carSeq=${number}`,
    `https://user:secret@www.kbchachacha.com/public/car/detail.kbc?carSeq=${number}`,
    `https://www.kbchachacha.com:444/public/car/detail.kbc?carSeq=${number}`,
    `https://www.kbchachacha.com/public/car/list.empty?carSeq=${number}`,
    sourceUrl+'&carSeq='+number,
    'javascript:alert(1)',
  ];
  for(const url of invalid) {
    assert.equal(normalizeCarDetail(detail(),{...item,url}),null,url);
    assert.equal(normalizeCarDetail(detail({sourceUrl:url}),item),null,url);
  }
});

test('gallery excludes recommended vehicles and unsafe image URLs while preserving matching car photos',()=>{
  const raw=detail({photos:[
    image('front'),image('front'),image('rear')+'?width=9999&tracking=private#fragment',
    image('related').replace(number,'99999999'),
    image('front').replace('img.kbchachacha.com','img.kbchachacha.com.evil.test'),
    image('front').replace('https:','http:'),
    image('front').replace('https://','https://user:secret@'),
    image('front').replace('img.kbchachacha.com/','img.kbchachacha.com:444/'),
    image('front').replace('/IMG/carimg/','/other/'),
    image('front').replace('.jpeg','.svg'),
    'data:image/png;base64,AAAA',null,{},
  ]});
  assert.deepEqual(normalizeCarDetail(raw,item).photos,[image('front'),image('rear')+'?width=1600']);
});

test('missing details remain unknown instead of becoming free, accident-free, or equipped',()=>{
  const raw={id:item.id,source:'kb',sourceUrl,title:'확인된 차량',price:null};
  const result=normalizeCarDetail(raw,item);
  assert.equal(result.price,null);
  assert.deepEqual(result.photos,[]);assert.deepEqual(result.specs,[]);assert.deepEqual(result.inspection,[]);
  assert.deepEqual(result.optionGroups,[]);assert.deepEqual(result.highlights,[]);
  assert.deepEqual(result.seller,{businessName:null,region:null});
  assert.equal(result.description,null);assert.equal(result.fetchedAt,null);
  assert.equal(normalizeCarDetail({...raw,price:undefined},item).price,null);
  assert.equal(normalizeCarDetail({...raw,fetchedAt:'not a date'},item).fetchedAt,null);
  for(const price of [-1,NaN,Infinity,'8500000',8500000.1,Number.MAX_SAFE_INTEGER+1]) {
    assert.equal(normalizeCarDetail({...raw,price},item),null);
  }
  assert.equal(normalizeCarDetail({...raw,price:8500000},item).price,8500000);
});

test('only explicit selected options appear and insurance statements are preserved without reinterpretation',()=>{
  const result=normalizeCarDetail(detail({optionGroups:[{label:'주요옵션',items:[
    '내비게이션(순정)','내비게이션(순정)',{label:'열선시트',selected:true},
    {label:'통풍시트',selected:false},{label:'헤드업디스플레이'},null,15,
  ]}]}),item);
  assert.deepEqual(result.optionGroups,[{label:'주요옵션',items:['내비게이션(순정)','열선시트']}]);
  assert.deepEqual(result.inspection,[{label:'보험사고정보',value:'사고있음'},{label:'보험이력',value:'4건'}]);
  assert.equal(JSON.stringify(result).includes('무사고'),false);
});

test('external detail collections and long strings are bounded before presentation',()=>{
  const long='가'.repeat(13000);
  const result=normalizeCarDetail(detail({
    title:long,photos:Array.from({length:100},(_,i)=>image('photo'+i)),
    specs:Array.from({length:60},(_,i)=>({label:long+i,value:long})),
    inspection:Array.from({length:40},(_,i)=>({label:'이력'+i,value:long})),
    optionGroups:Array.from({length:20},(_,i)=>({label:long+i,items:Array.from({length:120},(_,j)=>'옵션'+j+long)})),
    highlights:Array.from({length:30},(_,i)=>'정보'+i+long),
    description:long,seller:{businessName:long,region:long},
  }),item);
  assert.equal(result.title.length,250);assert.equal(result.photos.length,40);
  assert.equal(result.specs.length,40);assert.equal(result.specs[0].label.length,80);assert.equal(result.specs[0].value.length,1000);
  assert.equal(result.inspection.length,24);assert.equal(result.optionGroups.length,12);
  assert.equal(result.optionGroups[0].items.length,80);assert.equal(result.optionGroups[0].items[0].length,100);
  assert.equal(result.highlights.length,16);assert.equal(result.highlights[0].length,160);
  assert.equal(result.description.length,12000);assert.equal(result.seller.businessName.length,160);assert.equal(result.seller.region.length,200);
});

test('normalization does not retain arbitrary seller or vehicle-identifying fields',()=>{
  const result=normalizeCarDetail(detail({
    seller:{businessName:'판매 상사',region:'경기',phone:'PRIVATE_PHONE',name:'PRIVATE_PERSON',address:'PRIVATE_ADDRESS'},
    plate:'PRIVATE_PLATE',vin:'PRIVATE_VIN',reportUrl:'https://example.test/private-report',
    description:null,
  }),item);
  assert.deepEqual(result.seller,{businessName:'판매 상사',region:'경기'});
  assert.equal(JSON.stringify(result).includes('PRIVATE_'),false);
});
