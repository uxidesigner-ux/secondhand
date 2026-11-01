import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCarDetail, fetchCarDetail} from '../src/car-detail.js';

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

const extraProviders = [
  {source:'encar',number:'41942591',url:'https://fem.encar.com/cars/detail/41942591',
    photo:sequence=>`https://ci.encar.com/carpicture04/pic4194/41942591_${sequence}.jpg`},
  {source:'kcar',number:'EC61424432',url:'https://www.kcar.com/bc/detail/carInfoDtl?i_sCarCd=EC61424432',
    photo:sequence=>`https://img.kcar.com/carpicture/carpicture02/pic6142/kcar_61424432_${sequence}.jpg`},
];

test('Encar and K Car share the bounded normalizer while retaining their own canonical identity',()=>{
 for(const provider of extraProviders){
  const selected={id:`${provider.source}-${provider.number}`,source:provider.source,kind:'car',url:provider.url};
  const raw={id:selected.id,source:provider.source,sourceUrl:provider.url,title:'차량 <script>문자열</script>',price:22000000,
    photos:[provider.photo('001')],specs:[{label:'연식',value:'2022년'}],seller:{businessName:'상사',phone:'PRIVATE_PHONE'},vin:'PRIVATE_VIN'};
  const result=normalizeCarDetail(raw,selected);
  assert.equal(result.id,selected.id);assert.equal(result.source,provider.source);assert.equal(result.sourceUrl,provider.url);
  assert.equal(result.price,22000000);assert.equal(result.title,raw.title);
  assert.deepEqual(result.photos,[provider.photo('001')]);
  assert.equal(JSON.stringify(result).includes('PRIVATE_'),false);
  for(const patch of [{source:'kb'}, {id:'kb-1234'}, {sourceUrl:provider.url+'?redirect=other'}, {price:-1}, {title:null}]){
    assert.equal(normalizeCarDetail({...raw,...patch},selected),null);
  }
  assert.equal(normalizeCarDetail(raw,{...selected,demo:true}),null);
  assert.equal(normalizeCarDetail(raw,{...selected,id:selected.id+'\n'}),null);
  assert.equal(normalizeCarDetail(raw,{...selected,url:provider.url.replace(/41942591|61424432/,'99999999')}),null);
  const unknown=normalizeCarDetail({id:selected.id,source:provider.source,sourceUrl:provider.url,title:'차량 상세정보'},selected);
  assert.equal(unknown.price,null);assert.equal(unknown.description,null);
  for(const key of ['photos','specs','inspection','optionGroups','highlights'])assert.deepEqual(unknown[key],[]);
 }
});

test('new galleries accept only observed fixed image hosts and matching selected vehicle numbers',()=>{
 for(const provider of extraProviders){
  const selected={id:`${provider.source}-${provider.number}`,source:provider.source,kind:'car',url:provider.url};
  const first=provider.photo('001'), second=provider.photo('002');
  const raw={id:selected.id,source:provider.source,sourceUrl:provider.url,title:'차량',photos:[
    first,first,second+'?tracking=private#fragment',first.replace(/41942591|61424432/,'99999999'),
    first.replace('https:','http:'),first.replace('https://','https://user:secret@'),
    first.replace('.com/','.com.evil.test/'),first.replace('.com/','.com:444/'),
    first.replace('.jpg','.svg'),first.replace('/carpicture','/other'),
    'data:image/png;base64,AAAA',null,{},provider.source==='encar'?extraProviders[1].photo('001'):extraProviders[0].photo('001'),
  ]};
  assert.deepEqual(normalizeCarDetail(raw,selected).photos,[first,second]);
 }
 const provider=extraProviders[1], selected={id:`kcar-${provider.number}`,source:'kcar',kind:'car',url:provider.url};
 const searchPhoto=provider.photo('001').replace('kcar_','kcarM_');
 assert.deepEqual(normalizeCarDetail({id:selected.id,source:'kcar',sourceUrl:provider.url,title:'차량',photos:[searchPhoto]},selected).photos,[searchPhoto]);
});

const selectedCar = provider => ({id:`${provider.source}-${provider.number}`,source:provider.source,kind:'car',url:provider.url});
const providerDetail = provider => ({id:`${provider.source}-${provider.number}`,source:provider.source,sourceUrl:provider.url,title:'차량 상세정보',price:null,photos:[provider.photo('001')]});
const unavailable = provider => ({source:provider.source,id:provider.number,code:'DETAIL_UPSTREAM_UNAVAILABLE'});

test('all car detail requests use the same-origin API and exact provider-specific ID',async()=>{
 const providers=[{source:'kb',number,url:sourceUrl,photo:image},...extraProviders];
 for(const provider of providers){
  let requested, recoveryCalls=0;
  const controller=new AbortController();
  const result=await fetchCarDetail({item:selectedCar(provider),origin:'https://used.example',signal:controller.signal,
    fetchImpl:async(url,options)=>{requested={url,options};return Response.json({detail:providerDetail(provider)});},
    fetchEncarDetail:()=>{recoveryCalls++;},
  });
  assert.equal(requested.url.origin,'https://used.example');assert.equal(requested.url.pathname,'/api/detail');
  assert.equal(requested.url.searchParams.get('source'),provider.source);assert.equal(requested.url.searchParams.get('id'),provider.number);
  assert.deepEqual([...requested.url.searchParams.keys()],['source','id']);
  assert.equal(requested.options.credentials,'same-origin');assert.equal(requested.options.redirect,'error');
  assert.equal(requested.options.signal,controller.signal);assert.equal(result.source,provider.source);assert.equal(recoveryCalls,0);
 }
});

test('authentication, rate limits, HTML and unknown errors never trigger direct Encar requests',async()=>{
 const provider=extraProviders[0];
 let recoveryCalls=0;
 const cases=[
   ...[400,401,403,404,410,429,500].map(status=>()=>Response.json(unavailable(provider),{status})),
   ()=>new Response('<html>login</html>',{status:503,headers:{'Content-Type':'text/html'}}),
   ()=>new Response('{bad JSON',{status:502,headers:{'Content-Type':'application/json'}}),
   ...[{},{...unavailable(provider),source:'kb'},{...unavailable(provider),id:'99999999'},
     {...unavailable(provider),code:'OTHER'},[unavailable(provider)],null].map(body=>()=>Response.json(body,{status:502})),
   ()=>Response.json({detail:{...providerDetail(provider),id:'encar-99999999'}}),
 ];
 for(const response of cases){
  await assert.rejects(fetchCarDetail({item:selectedCar(provider),origin:'https://used.example',fetchImpl:async()=>response(),
    fetchEncarDetail:()=>{recoveryCalls++;return providerDetail(provider);}}));
 }
 assert.equal(recoveryCalls,0);
 for(const provider of [{source:'kb',number,url:sourceUrl,photo:image},extraProviders[1]]){
  await assert.rejects(fetchCarDetail({item:selectedCar(provider),origin:'https://used.example',
    fetchImpl:async()=>Response.json(unavailable(provider),{status:503}),fetchEncarDetail:()=>{recoveryCalls++;}}));
 }
 assert.equal(recoveryCalls,0);
});

test('only marked Encar provider failures recover through the observed browser adapter',async()=>{
 const provider=extraProviders[0], controller=new AbortController();
 for(const status of [502,503]){
  let received;
  const result=await fetchCarDetail({item:selectedCar(provider),origin:'https://used.example',signal:controller.signal,
    fetchImpl:async()=>Response.json(unavailable(provider),{status}),
    fetchEncarDetail:async options=>{received=options;return providerDetail(provider);},
  });
  assert.deepEqual(received,{id:provider.number,signal:controller.signal});assert.equal(result.id,`encar-${provider.number}`);
 }
 await assert.rejects(fetchCarDetail({item:selectedCar(provider),origin:'https://used.example',
   fetchImpl:async()=>Response.json(unavailable(provider),{status:503}),
   fetchEncarDetail:async()=>{throw new Error('PRIVATE URL/contact data');},
 }),error=>error.code==='DETAIL_UNAVAILABLE'&&!error.message.includes('PRIVATE'));
 await assert.rejects(fetchCarDetail({item:selectedCar(provider),origin:'https://used.example',
   fetchImpl:async()=>Response.json(unavailable(provider),{status:503}),
   fetchEncarDetail:async()=>({...providerDetail(provider),sourceUrl:provider.url+'/wrong'}),
 }),error=>error.code==='DETAIL_FORMAT');
});

test('cancelled detail requests never start recovery or publish late recovered data',async()=>{
 const provider=extraProviders[0];
 const before=new AbortController();before.abort();let calls=0;
 await assert.rejects(fetchCarDetail({item:selectedCar(provider),origin:'https://used.example',signal:before.signal,
   fetchImpl:async()=>{calls++;},fetchEncarDetail:async()=>{calls++;},
 }),error=>error.name==='AbortError');
 assert.equal(calls,0);
 const during=new AbortController();
 await assert.rejects(fetchCarDetail({item:selectedCar(provider),origin:'https://used.example',signal:during.signal,
   fetchImpl:async()=>{during.abort();return Response.json(unavailable(provider),{status:503});},
   fetchEncarDetail:async()=>{calls++;},
 }),error=>error.name==='AbortError');
 assert.equal(calls,0);
 const after=new AbortController();
 await assert.rejects(fetchCarDetail({item:selectedCar(provider),origin:'https://used.example',signal:after.signal,
   fetchImpl:async()=>Response.json(unavailable(provider),{status:503}),
   fetchEncarDetail:async()=>{after.abort();return providerDetail(provider);},
 }),error=>error.name==='AbortError');
});
