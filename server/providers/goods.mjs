/**
 * Anonymous public search adapters, verified against official web pages 2026-11-01.
 * These are website interfaces, not contracted/stable public partner APIs.
 * No login cookies, CAPTCHA bypass, seller profiles or contact details are collected.
 */
const NAMES = { daangn: '당근', joongna: '중고나라', bunjang: '번개장터', other: '헬로마켓' };
const SOURCES = Object.keys(NAMES);
const MAX_BYTES = 3_500_000;
const price = value => typeof value === 'number' ? value : typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : NaN;
const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const https = value => { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; } catch { return ''; } };
const ownList = (value, key) => {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value[key])) return value[key];
  for (const v of Object.values(value)) {
    const found = ownList(v, key);
    if (found) return found;
  }
  return null;
};
function base(source, collectedAt) {
  return { source, sourceName: NAMES[source], kind: 'goods', category: 'unknown', condition: 'unknown',
    methods: [], status: 'unknown', region: '', publishedAt: null, updatedAt: null, collectedAt, demo: false };
}
function clean(items, limit) {
  const seen = new Set();
  return items.filter(i => {
    if (!i.id || !i.title || !Number.isSafeInteger(i.price) || i.price < 0 || !i.url || seen.has(i.id)) return false;
    seen.add(i.id); return true;
  }).slice(0, limit);
}
function scripts(html) { return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]; }
function jsonScript(html, id) {
  const match = scripts(html).find(m => new RegExp(`\\bid=["']${id}["']`).test(m[1]));
  if (!match) throw new Error('PAGE_FORMAT_CHANGED');
  return JSON.parse(match[2]);
}
export function parseDaangn(html, collectedAt = new Date().toISOString(), limit = 24) {
  const match = scripts(html).find(m => /^\s*window\.__remixContext\s*=/.test(m[2]));
  if (!match) throw new Error('PAGE_FORMAT_CHANGED');
  const context = JSON.parse(match[2].replace(/^\s*window\.__remixContext\s*=\s*/, '').replace(/;\s*$/, ''));
  const list = ownList(context?.state?.loaderData, 'buySellArticles');
  if (!list) throw new Error('PAGE_FORMAT_CHANGED');
  return clean(list.map(p => {
    const url = new URL(p.href || '', 'https://www.daangn.com');
    if (url.hostname !== 'www.daangn.com' || !url.pathname.startsWith('/kr/buy-sell/')) return {};
    const coord = p.contentCoordinates?.[0];
    return { ...base('daangn', collectedAt), id: `daangn:${url.pathname.split('/').filter(Boolean).at(-1)}`,
      title: p.title, price: price(p.price), image: https(p.thumbnail), url: url.href,
      region: typeof p.region?.name === 'string' ? p.region.name : '',
      ...(Number.isFinite(coord?.latitude) && Number.isFinite(coord?.longitude) ? {lat:coord.latitude,lng:coord.longitude} : {}),
      publishedAt: date(p.createdAt), updatedAt: date(p.boostedAt),
      status: ({Ongoing:'selling',Reserved:'reserved',Closed:'sold'})[p.status] || 'unknown' };
  }), limit);
}
export function parseJoongna(html, collectedAt = new Date().toISOString(), limit = 24) {
  // Next.js Flight chunks are JSON arrays containing line-delimited records.
  const records = [];
  for (const script of scripts(html)) {
    for (const match of script[2].matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\)\s*;?(?=$|self\.)/g)) {
      try { const payload = JSON.parse(match[1]); if (typeof payload[1] === 'string') records.push(payload[1]); } catch { /* unsupported record */ }
    }
  }
  let list = null;
  for (const line of records.join('').split('\n')) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    try {
      const record = JSON.parse(line.slice(colon + 1));
      const candidate = ownList(record, 'items');
      if (candidate && (!candidate.length || candidate.some(p => p.objectType === 'product'))) { list = candidate; break; }
    } catch { /* Flight import/binary/text records aren't JSON models. */ }
  }
  if (!list) throw new Error('PAGE_FORMAT_CHANGED');
  // Only direct marketplace product entries; don't reinterpret cafe/article identifiers.
  return clean(list.filter(p => p.objectType === 'product' && p.platformType === 1 && Number.isSafeInteger(p.seq)).map(p => ({
    ...base('joongna', collectedAt), id:`joongna:${p.seq}`, title:p.title, price:price(p.price),
    image:https(p.url), url:`https://web.joongna.com/product/${p.seq}`,
    region:Array.isArray(p.locationNames) ? p.locationNames.filter(v=>typeof v==='string').join(' · ') : '',
    updatedAt:typeof p.sortDate === 'string' ? date(p.sortDate.replace(' ','T')+'+09:00') : null,
  })), limit);
}
export function parseBunjang(payload, collectedAt = new Date().toISOString(), limit = 24) {
  const blocks = payload?.data?.searchSpec?.uiBlockList;
  if (!Array.isArray(blocks)) throw new Error('PAGE_FORMAT_CHANGED');
  const block = blocks.find(b => b.blockType === 'productList.grid.main');
  const list = block?.searchResponse?.data;
  if (!Array.isArray(list)) throw new Error('PAGE_FORMAT_CHANGED');
  return clean(list.filter(p => p.type === 'PRODUCT' && !p.ad && Number.isSafeInteger(p.pid)).map(p => ({
    ...base('bunjang', collectedAt), id:`bunjang:${p.pid}`, title:p.name, price:price(p.price),
    image:https(p.productImage?.replace('{res}','640')), url:`https://m.bunjang.co.kr/products/${p.pid}`,
    status:({SELLING:'selling',RESERVED:'reserved',SOLD:'sold'})[p.status]||'unknown', updatedAt:date(p.updatedAt),
  })), limit);
}
function helloCategory(categories) {
  const names = (categories || []).map(c=>c.name);
  if (names.some(n=>['휴대폰','태블릿','노트북','컴퓨터','카메라','가전제품'].includes(n))) return 'digital';
  if (names.some(n=>['여성의류','남성의류','가방','신발','패션잡화'].includes(n))) return 'fashion';
  return 'unknown';
}
export function parseHello(html, collectedAt = new Date().toISOString(), limit = 24) {
  const data = jsonScript(html, '__NEXT_DATA__');
  const list = data?.props?.initialState?.searchData?.itemData;
  if (!Array.isArray(list)) throw new Error('PAGE_FORMAT_CHANGED');
  return clean(list.filter(p=>Number.isSafeInteger(p.itemIdx)).map(p=>({
    ...base('other',collectedAt),id:`other:${p.itemIdx}`,title:p.title,price:price(p.price),
    image:https(p.imageUrl),url:`https://www.hellomarket.com/item/${p.itemIdx}`,
    category:helloCategory(p.categories),
    condition:({New:'new',AsNew:'like-new',Used:'used'})[p.usedType?.code]||'unknown',
    status:({ForSale:'selling',Reserved:'reserved',SoldOut:'sold'})[p.sellState?.code]||'unknown',
    // Feed timestamp is presented as item recency; it is not documented as creation time.
    updatedAt:Number.isFinite(p.timestamp)?date(new Date(p.timestamp).toISOString()):null,
  })),limit);
}
async function fetchText(url, signal) {
  const response = await fetch(url,{signal:AbortSignal.any([AbortSignal.timeout(12000),...(signal?[signal]:[])]),
    headers:{Accept:'text/html,application/json;q=0.9', 'User-Agent':'USED-Search/1.0 (+https://uxidesigner-ux.github.io/secondhand/)'}});
  if (!response.ok) throw new Error(`UPSTREAM_${response.status}`);
  if (Number(response.headers.get('content-length'))>MAX_BYTES) throw new Error('RESPONSE_TOO_LARGE');
  const reader=response.body.getReader();let bytes=0,text='';const decoder=new TextDecoder();
  for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_BYTES){await reader.cancel();throw new Error('RESPONSE_TOO_LARGE');}text+=decoder.decode(value,{stream:true});}
  return text+decoder.decode();
}
const requests={
  daangn:{url:q=>`https://www.daangn.com/kr/search/buy-sell/?q=${encodeURIComponent(q)}`,parse:parseDaangn},
  joongna:{url:q=>`https://web.joongna.com/search/${encodeURIComponent(q)}`,parse:parseJoongna},
  // Observed in the official public web bundle index.CuVroltI.js (2026-11-01).
  bunjang:{url:q=>`https://api.bunjang.co.kr/api/search/v8/mw/product/specs/keyword?q=${encodeURIComponent(q)}`,parse:(s,...args)=>parseBunjang(JSON.parse(s),...args)},
  other:{url:q=>`https://www.hellomarket.com/search?q=${encodeURIComponent(q)}`,parse:parseHello},
};
export async function searchGoods({query,source='all',limit=24,signal,providerGuard}={}) {
  const q=String(query||'').trim().slice(0,100);
  const keys=source==='all'?SOURCES:SOURCES.includes(source)?[source]:[];
  if(!q)return {items:[],providers:keys.map(source=>({source,status:'unavailable',count:0,message:'검색어를 입력해 주세요.'}))};
  const take=Math.max(1,Math.min(60,Number.isFinite(+limit)?Math.floor(+limit):24));
  const results=await Promise.all(keys.map(async source=>{
    const adapter=requests[source];
    try {
      const text=await (providerGuard?providerGuard.run(source,()=>fetchText(adapter.url(q),signal)):fetchText(adapter.url(q),signal));
      const items=adapter.parse(text,new Date().toISOString(),take);
      return {items,provider:{source,status:'ok',count:items.length,message:source==='daangn'?'원문 검색 범위 일부이며 전국 전체 매물이 아니에요.':'공개 검색 결과 일부를 가져왔어요.'}};
    } catch(error) {
      const guarded=['PROVIDER_COOLDOWN','PROVIDER_BUSY'].includes(error?.code);
      const unavailable=guarded||/UPSTREAM_(401|403|407|429)/.test(error.message);
      return {items:[],provider:{source,status:unavailable?'unavailable':'error',count:0,...(guarded?{code:error.code,retryAfter:error.retryAfter}:{}),message:guarded?error.message:unavailable?'서비스에서 자동 조회를 제한하고 있어요.':error.name==='TimeoutError'?'조회 시간이 초과됐어요.':'현재 이 서비스의 검색 결과를 불러오지 못했어요.'}};
    }
  }));
  return {items:results.flatMap(r=>r.items),providers:results.map(r=>r.provider)};
}
