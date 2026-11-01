import { createCipheriv } from 'node:crypto';
/**
 * Encar's unauthenticated public search, observed in car.encar.com/list/car.
 * iNav Search.QueryWithPlaceholder supplies the keyword expression used below.
 * No cookies, credentials, private API, CAPTCHA bypass, or third-party proxy.
 */
const ENCAR_API = 'https://api.encar.com/search/car/list/mobile';
const CAR_SOURCES = ['encar', 'kb', 'kcar'];
const fuels = { '가솔린': 'gasoline', '디젤': 'diesel', '가솔린+전기': 'hybrid', '디젤+전기': 'hybrid', '전기': 'electric', 'LPG': 'lpg', 'LPG(일반인 구입)': 'lpg', 'LPG+전기': 'hybrid' };
const text = value => typeof value === 'string' ? value.trim() : '';

// Diagnostics deliberately omit request URLs, search terms, response bodies, and headers.
const safeToken = value => typeof value === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(value) ? value : null;
const responseMeta = response => {
  const type = response.headers.get('content-type')?.split(';')[0]?.trim();
  return { upstreamStatus: response.status, contentType: type && /^[A-Za-z0-9.+-]+\/[A-Za-z0-9.+-]+$/.test(type) ? type : null };
};
async function fetchCar(url, options) {
  let response;
  try { response = await fetch(url, options); }
  catch (error) { error.stage = 'fetch'; throw error; }
  if (!response.ok) throw Object.assign(new Error('Upstream HTTP failure'), responseMeta(response), {stage: 'http'});
  return response;
}
async function carJson(response) {
  try { return await response.json(); }
  catch (error) { Object.assign(error, responseMeta(response), {stage: 'json'}); throw error; }
}
function logCarFailure(source, error, startedAt) {
  console.warn(JSON.stringify({
    event: 'car_provider_failure', source,
    stage: ['fetch','http','json','schema'].includes(error?.stage) ? error.stage : 'provider',
    elapsedMs: Math.max(0, Date.now() - startedAt),
    errorName: safeToken(error?.name), causeCode: safeToken(error?.cause?.code),
    upstreamStatus: Number.isInteger(error?.upstreamStatus) ? error.upstreamStatus : null,
    contentType: typeof error?.contentType === 'string' ? error.contentType : null,
  }));
}

export function buildEncarUrl(query = '', limit = 24) {
  // Prevent user text from becoming a facet expression. Spaces remain keyword text.
  const term = String(query).normalize('NFKC').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (String(query).trim() && !term) throw new Error('검색어에 문자 또는 숫자를 입력해 주세요.');
  const url = new URL(ENCAR_API);
  url.searchParams.set('count', 'true');
  url.searchParams.set('q', term ? `(And.Hidden.N._.CarType.A._.Search.keyword(${term}).)` : '(And.Hidden.N._.CarType.A.)');
  url.searchParams.set('sr', `|MobileModifiedDate|0|${Math.max(1, Math.min(40, Math.floor(Number(limit) || 24)))}`);
  return url;
}

export function normalizeEncarCar(car, collectedAt = new Date().toISOString()) {
  if (!car || !/^\d+$/.test(String(car.Id))) return null;
  // Lease/rental headline prices are not comparable to a cash purchase price.
  if (car.Lease === '1' || (car.SellType && car.SellType !== '일반')) return null;
  const price = Math.round(Number(car.Price) * 10000); // Official cards display Price in 만원.
  if (!Number.isSafeInteger(price) || price <= 0) return null;
  const title = [car.Manufacturer, car.Model, car.Badge, car.BadgeDetail].map(text).filter(Boolean).join(' ');
  if (!title) return null;
  const photo = Array.isArray(car.Photos) ? (car.Photos.find(p => p.type === '001') || car.Photos[0])?.location : null;
  const image = typeof photo === 'string' && /^\/carpicture[\w/.-]+\.(?:jpg|jpeg|png)$/i.test(photo) ? `https://ci.encar.com${photo}` : '';
  const year = /^\d{4}$/.test(String(car.FormYear)) ? Number(car.FormYear) : Number.isFinite(Number(car.Year)) && Number(car.Year) >= 190001 ? Math.floor(Number(car.Year) / 100) : null;
  const mileage = typeof car.Mileage === 'number' && Number.isSafeInteger(car.Mileage) && car.Mileage >= 0 ? car.Mileage : null;
  return {
    id: `encar-${car.Id}`, title, price, kind: 'car', source: 'encar', sourceName: '엔카',
    category: 'car', condition: 'unknown', methods: [], status: 'unknown',
    region: text(car.OfficeCityState), lat: null, lng: null, publishedAt: null,
    collectedAt, image, url: `https://fem.encar.com/cars/detail/${car.Id}`,
    brand: text(car.Manufacturer) || null, year, mileage, fuel: fuels[car.FuelType] || 'unknown',
    fuelLabel: text(car.FuelType), demo: false,
  };
}

export function parseEncarResponse(payload, collectedAt) {
  if (!payload || !Array.isArray(payload.SearchResults) || !Number.isFinite(Number(payload.Count))) throw Object.assign(new Error('엔카 검색 응답 형식이 변경됐어요.'), {stage:'schema'});
  const unique = new Map();
  for (const car of payload.SearchResults) {
    const item = normalizeEncarCar(car, collectedAt);
    if (item) unique.set(item.id, item);
  }
  return { items: [...unique.values()], total: Number(payload.Count) };
}

async function searchEncar({ query, limit, signal }) {
  const timeout = AbortSignal.timeout(9000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const response = await fetchCar(buildEncarUrl(query, limit), {
    headers: { Accept: 'application/json' }, signal: combined, redirect: 'error',
  });
  const payload = await carJson(response);
  const {items,total} = parseEncarResponse(payload, new Date().toISOString());
  return { items, provider: { source: 'encar', status: 'ok', count: items.length, total,
    message: '엔카 공개 검색 결과예요. 일부 결과를 표시하며 리스·렌트는 제외해요. 판매 상태와 최신 가격은 원문에서 확인해 주세요.' } };
}

// KB's public search form uses these endpoints and classCode/makerCode parameters.
const KB_ROOT = 'https://www.kbchachacha.com/public/search/';
let kbClassCache = null;
const cleanText = value => String(value ?? '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const fold = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, '');

export function selectKbClasses(rows, query) {
  const term = fold(query);
  if (!term) return {classes: [],makers: []};
  const classes = rows.filter(row => row.className && term.includes(fold(row.className)) && /^\d+$/.test(String(row.classCode)));
  const longest = Math.max(0,...classes.map(row => fold(row.className).length));
  const best = classes.filter(row => fold(row.className).length === longest);
  if (best.length) return {classes: [...new Set(best.map(row=>String(row.classCode)))],makers: []};
  const makers = rows.filter(row => row.makerName && term.includes(fold(row.makerName)) && /^\d+$/.test(String(row.makerCode)));
  return {classes: [],makers: [...new Set(makers.map(row=>String(row.makerCode)))]};
}

export function parseKbListings(html, query='', limit=24, collectedAt=new Date().toISOString()) {
  const items = new Map();
  const blocks = [...String(html).matchAll(/<div\s+class="area(?:\s[^\"]*)?"\s+data-car-seq="(\d+)"[^>]*>([\s\S]*?)(?=<div\s+class="area(?:\s[^\"]*)?"\s+data-car-seq="\d+"|$)/g)];
  const words = String(query).normalize('NFKC').toLocaleLowerCase('ko-KR').trim().split(/\s+/).filter(Boolean);
  for (const [,id,block] of blocks) {
    const ga = block.match(/data-ga4='([^']*)'/);
    if (!ga) continue;
    let info;try {info=JSON.parse(cleanText(ga[1])).params;}catch {continue;}
    const title = cleanText(info?.vehicle_info);
    if (!title || words.some(word=>!title.toLocaleLowerCase('ko-KR').includes(word))) continue;
    const priceText = cleanText(info?.vehicle_price);
    if (!/^[\d,]+만원$/.test(priceText)) continue;
    const price = Number(priceText.replace(/[^\d]/g,''))*10000;
    if (!Number.isSafeInteger(price)||price<=0) continue;
    const picture = block.match(/(?:src|data-src)="(https:\/\/img\.kbchachacha\.com\/IMG\/carimg\/[^\"]+)"/);
    const line=block.match(/<div class="data-line">([\s\S]*?)<\/div>/)?.[1]||'';
    const details=[...line.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)].map(m=>cleanText(m[1]));
    const yearText=details[0]?.match(/\((\d{2,4})년형\)/)?.[1];
    let year=yearText?Number(yearText):null;
    if(year!==null&&year<100)year+=year<=new Date().getFullYear()%100+1?2000:1900;
    const km=details.find(v=>/^[\d,]+km$/.test(v));
    items.set(`kb-${id}`,{id:`kb-${id}`,title,price,kind:'car',source:'kb',sourceName:'KB차차차',category:'car',condition:'unknown',methods:[],status:'unknown',region:details[2]||'',lat:null,lng:null,publishedAt:null,collectedAt,image:picture?cleanText(picture[1]):'',url:`https://www.kbchachacha.com/public/car/detail.kbc?carSeq=${id}`,brand:null,year,mileage:km?Number(km.replace(/[^\d]/g,'')):null,fuel:'unknown',demo:false});
  }
  return [...items.values()].slice(0,Math.max(1,Math.min(40,Number(limit)||24)));
}

async function searchKb({query,limit,signal}) {
  const timeout=AbortSignal.timeout(9000);
  const combined=signal?AbortSignal.any([signal,timeout]):timeout;
  const read=async url=>{const response=await fetchCar(url,{headers:{Accept:'text/html,application/json'},signal:combined,redirect:'error'});return response;};
  const url=new URL('list.empty',KB_ROOT);
  if(String(query).trim()){
    if(!kbClassCache||kbClassCache.expires<Date.now()){
      const d=await carJson(await read(new URL('carClass.json',KB_ROOT)));
      if(!Array.isArray(d?.result?.code))throw Object.assign(Error('KB model response changed'),{stage:'schema'});
      kbClassCache={rows:d.result.code,expires:Date.now()+3600000};
    }
    const match=selectKbClasses(kbClassCache.rows,query);
    if(!match.classes.length&&!match.makers.length)return {items:[],provider:{source:'kb',status:'unavailable',count:0,message:'KB차차차는 제조사 또는 대표모델명이 포함된 검색어로 찾아 주세요. 예: 그랜저, 쏘렌토, BMW.'}};
    if(match.classes.length)url.searchParams.set('classCode',match.classes.join(','));
    else url.searchParams.set('makerCode',match.makers.join(','));
  }
  url.searchParams.set('page','1');
  const html=await (await read(url)).text();
  // Do not turn an access challenge or changed document into a successful empty search.
  if(!html.includes('data-ga4')&&!html.includes('검색 결과')&&!html.includes('검색결과'))throw Object.assign(Error('KB listing response changed'),{stage:'schema'});
  const items=parseKbListings(html,query,limit);
  const makerNames=[...new Set((kbClassCache?.rows||[]).map(row=>row.makerName).filter(Boolean))].sort((a,b)=>b.length-a.length);
  for(const item of items)item.brand=makerNames.find(name=>item.title.startsWith(name+' '))||null;
  return {items,provider:{source:'kb',status:'ok',count:items.length,message:'KB차차차 제조사·대표모델 검색의 첫 페이지 일부 매물이에요. 판매 상태와 최신 가격은 원문에서 확인해 주세요.'}};
}

// K Car publishes this request formatter in its own anonymous web client.
// These fixed values are transport formatting constants, not account credentials.
export function buildKcarRequest(query='', limit=24) {
  const params={wr_txt_idx:String(query).normalize('NFKC').trim().slice(0,80),pageno:1,limit:Math.max(1,Math.min(40,Math.floor(Number(limit)||24))),orderFlag:true,orderBy:'sort_ordr:desc'};
  if(!params.wr_txt_idx)delete params.wr_txt_idx;
  const cipher=createCipheriv('aes-128-cbc',Buffer.from('SKFJ2424DasfaJRI'),Buffer.from('sfq241sf3dscs321'));
  return {enc:Buffer.concat([cipher.update(JSON.stringify(params),'utf8'),cipher.final()]).toString('base64')};
}

export function parseKcarResponse(payload,collectedAt=new Date().toISOString()) {
  if(!payload?.data||!Array.isArray(payload.data.rows)||!Number.isFinite(Number(payload.data.totalCnt)))throw Object.assign(Error('K Car response changed'),{stage:'schema'});
  const items=new Map();
  for(const row of payload.data.rows){
    if(!/^EC\d+$/.test(String(row.carCd))||row.rentRegYn==='Y')continue;
    const title=cleanText(row.carWhlNm);
    const advertised=row.dcFlag==='Y'&&Number(row.dcPrc)>0?Number(row.dcPrc):Number(row.prc);
    const price=Math.round(advertised*10000);
    if(!title||!Number.isSafeInteger(price)||price<=0)continue;
    const image=typeof row.lsizeImgPath==='string'&&row.lsizeImgPath.startsWith('https://img.kcar.com/carpicture/')?row.lsizeImgPath:'';
    const year=/^\d{6}$/.test(String(row.mfgDt))?Number(String(row.mfgDt).slice(0,4)):null;
    const mileage=/^\d+$/.test(String(row.milg))?Number(row.milg):null;
    const item={id:`kcar-${row.carCd}`,title,price,kind:'car',source:'kcar',sourceName:'K Car',category:'car',condition:'unknown',methods:[],status:'unknown',region:cleanText(row.cntrRgnNm),lat:null,lng:null,publishedAt:null,collectedAt,image,url:`https://www.kcar.com/bc/detail/carInfoDtl?i_sCarCd=${row.carCd}`,brand:cleanText(row.mnuftrNm)||null,year,mileage,fuel:fuels[row.fuelNm]||'unknown',fuelLabel:cleanText(row.fuelNm),demo:false};
    items.set(item.id,item);
  }
  return {items:[...items.values()],total:Number(payload.data.totalCnt)};
}

async function searchKcar({query,limit,signal}) {
  const timeout=AbortSignal.timeout(9000);
  const combined=signal?AbortSignal.any([signal,timeout]):timeout;
  const response=await fetchCar('https://api.kcar.com/bc/search/list/drct',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(buildKcarRequest(query,limit)),signal:combined,redirect:'error'});
  const {items,total}=parseKcarResponse(await carJson(response));
  return {items,provider:{source:'kcar',status:'ok',count:items.length,total,message:'K Car 공개 직영차 검색 결과 일부예요. 판매 상태와 최신 가격은 원문에서 확인해 주세요.'}};
}

export async function searchCars({ query = '', source = 'all', limit = 24, signal } = {}) {
  const selected = source === 'all' ? CAR_SOURCES : CAR_SOURCES.filter(s => s === source);
  const results = await Promise.all(selected.map(async provider => {
    const startedAt = Date.now();
    try { return await ({encar:searchEncar,kb:searchKb,kcar:searchKcar}[provider])({query,limit,signal}); }
    catch (error) { logCarFailure(provider, error, startedAt); return {items: [],provider: {source: provider,status: 'error',count: 0,
      message: error?.name === 'AbortError' || error?.name === 'TimeoutError' ? `${({encar:'엔카',kb:'KB차차차',kcar:'K Car'}[provider])} 응답이 지연되고 있어요. 다시 검색해 주세요.` : `${({encar:'엔카',kb:'KB차차차',kcar:'K Car'}[provider])} 검색에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.`}}; }
  }));
  return { items: results.flatMap(r => r.items), providers: results.map(r => r.provider) };
}
