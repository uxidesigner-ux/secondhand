import test from 'node:test';
import assert from 'node:assert/strict';
import {createDecipheriv} from 'node:crypto';
import {buildEncarUrl, normalizeEncarCar, parseEncarResponse, searchCars, selectKbClasses, parseKbListings, buildKcarRequest, parseKcarResponse} from '../server/providers/cars.mjs';
const fixture = {
  Id:'42814979',Manufacturer:'현대',Model:'더 뉴 그랜저 IG',Badge:'2.5',BadgeDetail:'익스클루시브',
  Price:2180,Year:202005,FormYear:'2020',Mileage:61410,FuelType:'가솔린',SellType:'일반',OfficeCityState:'울산',
  Photos:[{type:'001',location:'/carpicture10/pic4280/42805193_001.jpg',updatedDate:'2026-10-07T00:26:16Z'}]
};
test('Encar adapter preserves real units and links without inventing listing dates or seller status',()=>{
 const item=normalizeEncarCar(fixture,'2026-11-01T10:00:00Z');
 assert.equal(item.price,21800000);assert.equal(item.year,2020);assert.equal(item.mileage,61410);
 assert.equal(item.url,'https://fem.encar.com/cars/detail/42814979');assert.equal(item.image,'https://ci.encar.com/carpicture10/pic4280/42805193_001.jpg');
 assert.equal(item.publishedAt,null);assert.equal(item.status,'unknown');assert.deepEqual(item.methods,[]);assert.equal(item.demo,false);
});
test('Encar does not present lease charges as purchase prices or accept malformed rows',()=>{
 assert.equal(normalizeEncarCar({...fixture,Lease:'1'}),null);
 assert.equal(normalizeEncarCar({...fixture,SellType:'렌트'}),null);
 assert.equal(normalizeEncarCar({...fixture,Price:NaN}),null);
 assert.equal(normalizeEncarCar({...fixture,Id:'../x'}),null);
 assert.equal(normalizeEncarCar({...fixture,Photos:[{type:'001',location:'https://malicious.test/a.jpg'}]}).image,'');
});
test('Encar search uses bounded public keyword expression and strips DSL punctuation',()=>{
 const url=buildEncarUrl('그랜저 (IG)._..',10000);
 assert.equal(url.origin,'https://api.encar.com');assert.equal(url.searchParams.get('sr'),'|MobileModifiedDate|0|40');
 assert.equal(url.searchParams.get('q'),'(And.Hidden.N._.CarType.A._.Search.keyword(그랜저 IG).)');
 assert.throws(()=>buildEncarUrl('()._'));
});
test('Encar shape changes fail closed and duplicates collapse',()=>{
 assert.throws(()=>parseEncarResponse({SearchResults:{}}));
 assert.equal(parseEncarResponse({Count:2,SearchResults:[fixture,fixture]}).items.length,1);
});
test('KB chooses observed manufacturer/model codes with longest model name',()=>{
 const rows=[{makerName:'현대',makerCode:'101',className:'그랜저',classCode:'1101'},{makerName:'BMW',makerCode:'107',className:'X5',classCode:'777'}];
 assert.deepEqual(selectKbClasses(rows,'그랜저 IG'),{classes:['1101'],makers:[]});
 assert.deepEqual(selectKbClasses(rows,'BMW'),{classes:[],makers:['107']});
 assert.deepEqual(selectKbClasses(rows,'없는모델'),{classes:[],makers:[]});
});
test('KB listing HTML yields exact advertised price and fields without fabricated fuel',()=>{
 const html=`<div class="area " data-car-seq="1234"><a data-ga4='{"params":{"vehicle_info":"현대 그랜저IG 2.4 모던","vehicle_price":"790만원"}}'><img src="https://img.kbchachacha.com/IMG/carimg/l/car.jpeg?width=720&amp;x=1"></a><div class="data-line"><span>17/08식(18년형)</span><span>123,456km</span><span>경기</span></div></div>`;
 const result=parseKbListings(html,'그랜저',24,'2026-11-01T10:00:00Z');
 assert.equal(result.length,1);assert.equal(result[0].price,7900000);assert.equal(result[0].year,2018);assert.equal(result[0].mileage,123456);assert.equal(result[0].fuel,'unknown');assert.equal(result[0].region,'경기');
 assert.equal(parseKbListings(html,'BMW').length,0);
 assert.equal(parseKbListings(html.replace('790만원','가격상담'),'그랜저').length,0);
});

test('K Car request matches public client AES format and bounds query/limit',()=>{
 const {enc}=buildKcarRequest('그랜저',10000);
 const decipher=createDecipheriv('aes-128-cbc',Buffer.from('SKFJ2424DasfaJRI'),Buffer.from('sfq241sf3dscs321'));
 const params=JSON.parse(Buffer.concat([decipher.update(Buffer.from(enc,'base64')),decipher.final()]).toString('utf8'));
 assert.equal(params.wr_txt_idx,'그랜저');assert.equal(params.limit,40);assert.equal(params.pageno,1);
});
test('K Car normalizes only public vehicle fields and rejects malformed rows',()=>{
 const raw={carCd:'EC61424432',carWhlNm:'현대 더 뉴 그랜저 하이브리드 가솔린 2.4 르블랑',prc:'2200',milg:'114196',mfgDt:'202205',mnuftrNm:'현대',cntrRgnNm:'서울',fuelNm:'가솔린+전기',lsizeImgPath:'https://img.kcar.com/carpicture/carpicture02/pic6142/kcarM_61424432_001.jpg',rentRegYn:'N',selerMpno:'private-not-retained'};
 const {items,total}=parseKcarResponse({data:{totalCnt:584,rows:[raw,raw,{...raw,carCd:'../../bad'}]}});
 assert.equal(total,584);assert.equal(items.length,1);assert.equal(items[0].price,22000000);assert.equal(items[0].fuel,'hybrid');assert.equal(items[0].year,2022);assert.equal(items[0].mileage,114196);assert.equal(items[0].url,'https://www.kcar.com/bc/detail/carInfoDtl?i_sCarCd=EC61424432');assert.equal('selerMpno' in items[0],false);
 assert.throws(()=>parseKcarResponse({data:{}}));
 assert.equal(parseKcarResponse({data:{totalCnt:1,rows:[{...raw,rentRegYn:'Y'}]}}).items.length,0);
});

test('car upstream diagnostics record HTTP403 without search terms, URLs or body', async t => {
 const query='PRIVATE_QUERY_987';
 const logs=[];
 t.mock.method(globalThis,'fetch',async()=>new Response('PRIVATE_SELLER_BODY_654',{status:403,headers:{'content-type':'text/html; charset=utf-8'}}));
 t.mock.method(console,'warn',value=>logs.push(value));
 const result=await searchCars({query,source:'encar'});
 assert.equal(result.providers[0].status,'error');
 assert.equal(logs.length,1);
 const diagnostic=JSON.parse(logs[0]);
 assert.equal(diagnostic.event,'car_provider_failure');
 assert.equal(diagnostic.source,'encar');assert.equal(diagnostic.upstreamStatus,403);
 assert.equal(diagnostic.stage,'http');assert.equal(diagnostic.contentType,'text/html');
 assert.equal(diagnostic.errorName,'Error');assert.equal(diagnostic.causeCode,null);
 assert.ok(Number.isInteger(diagnostic.elapsedMs)&&diagnostic.elapsedMs>=0);
 assert.deepEqual(Object.keys(diagnostic).sort(),['event','source','stage','elapsedMs','errorName','causeCode','upstreamStatus','contentType'].sort());
 assert.equal(logs[0].includes(query),false);assert.equal(logs[0].includes('PRIVATE_SELLER_BODY'),false);assert.equal(logs[0].includes('https://'),false);
});
test('car network diagnostics keep cause codes while omitting raw error messages', async t => {
 const logs=[];
 t.mock.method(globalThis,'fetch',async()=>{throw Object.assign(new TypeError('failed URL with PRIVATE_QUERY'),{cause:{code:'UND_ERR_CONNECT_TIMEOUT',message:'private upstream details'}});});
 t.mock.method(console,'warn',value=>logs.push(value));
 await searchCars({query:'PRIVATE_QUERY',source:'encar'});
 const diagnostic=JSON.parse(logs[0]);
 assert.equal(diagnostic.stage,'fetch');assert.equal(diagnostic.errorName,'TypeError');
 assert.equal(diagnostic.causeCode,'UND_ERR_CONNECT_TIMEOUT');assert.equal(diagnostic.upstreamStatus,null);
 assert.equal(logs[0].includes('PRIVATE_QUERY'),false);assert.equal(logs[0].includes('private upstream'),false);
});
