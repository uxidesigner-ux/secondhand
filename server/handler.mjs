import { validateListing, filterListings } from '../src/search.js';
const allowedSources = {goods:['all','daangn','joongna','bunjang','other'],car:['all','encar','kb','kcar']};
const headers = {'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS','X-Content-Type-Options':'nosniff'};
const json=(body,status=200,cache=false)=>Response.json(body,{status,headers:{...headers,'Cache-Control':cache?'public, max-age=0, s-maxage=60':'no-store'}});
export function createSearchHandler({searchGoods,searchCars}) {
  return async request => {
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(request.method!=='GET')return json({error:'GET 요청만 지원해요.'},405);
    const p=new URL(request.url).searchParams;
    const query=(p.get('q')||'').normalize('NFKC').trim();
    const kind=p.get('kind')||'goods',source=p.get('source')||'all';
    if(!query||query.length>80||/[\u0000-\u001f\u007f]/u.test(query))return json({error:'검색어를 1~80자로 입력해 주세요.'},400);
    if(!Object.hasOwn(allowedSources,kind)||!allowedSources[kind].includes(source))return json({error:'지원하지 않는 검색 유형이에요.'},400);
    // User input is only a keyword. Upstream origins are fixed inside provider modules.
    const signal=AbortSignal.any([AbortSignal.timeout(18000),request.signal]);
    try {
      const result=await (kind==='car'?searchCars:searchGoods)({query,source,limit:30,signal});
      const seen=new Set();
      const valid=result.items.filter(i=>i.demo!==true&&validateListing(i)&&!seen.has(i.id)&&seen.add(i.id));
      const items=filterListings(valid,{kind,source,query,sort:'recent'});
      const providers=result.providers.map(provider=>({...provider,count:items.filter(i=>i.source===provider.source).length}));
      const ok=providers.some(p=>p.status==='ok');
      const partial=providers.some(p=>p.status!=='ok');
      console.info(JSON.stringify({event:'search_complete',kind,source,counts:providers.map(p=>({source:p.source,status:p.status,count:p.count}))}));
      return json({query,kind,items,providers,fetchedAt:new Date().toISOString(),partial,limited:true,...(!ok?{error:'현재 원문 서비스에 연결하지 못했어요. 잠시 후 다시 검색해 주세요.'}:{})},ok?200:502,ok);
    } catch(error) {
      console.error('search_failed',error?.name||'Error');
      return json({error:'매물을 불러오지 못했어요. 잠시 후 다시 검색해 주세요.',items:[],providers:[],partial:true},502);
    }
  };
}
