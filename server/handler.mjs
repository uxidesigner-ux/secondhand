import { validateListing, filterListings } from '../src/search.js';
import {createCostGuard, createProviderGuard, CostGuardError, guardFailure} from './cost-guard.mjs';
const allowedSources = {goods:['all','daangn','joongna','bunjang','other'],car:['all','encar','kb','kcar']};
const headers = {'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS','X-Content-Type-Options':'nosniff'};
const json=(body,status=200,cache=false,extra={})=>Response.json(body,{status,headers:{...headers,'Cache-Control':cache?'public, max-age=0, s-maxage=180':'no-store',...extra}});
const privateRateHeaders={'Cache-Control':'private, no-store','CDN-Cache-Control':'no-store','Vercel-CDN-Cache-Control':'no-store'};
export function createSearchHandler({searchGoods,searchCars,guard=createCostGuard(),providerGuard=createProviderGuard()}) {
  return async request => {
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(request.method!=='GET')return json({error:'GET 요청만 지원해요.'},405);
    const p=new URL(request.url).searchParams;
    if([...p.keys()].some(key=>!['q','kind','source'].includes(key)||p.getAll(key).length!==1))return json({error:'지원하지 않는 검색 조건이에요.'},400);
    const input=(p.get('q')||'').normalize('NFKC').trim();
    const query=input.replace(/\s+/g,' ');
    const kind=p.get('kind')||'goods',source=p.get('source')||'all';
    if(!query||input.length>80||/[\u0000-\u001f\u007f]/u.test(input))return json({error:'검색어를 1~80자로 입력해 주세요.'},400);
    if(!Object.hasOwn(allowedSources,kind)||!allowedSources[kind].includes(source))return json({error:'지원하지 않는 검색 유형이에요.'},400);
    try {
      // Normalized semantic keys prevent URL parameter ordering/encoding from
      // causing repeated upstream work. No arbitrary caller URLs are fetched.
      const result=await guard.run({request,key:JSON.stringify([kind,source,query]),includeRateLimit:true,load:async()=>{
        const result=await (kind==='car'?searchCars:searchGoods)({query,source,limit:30,signal:AbortSignal.timeout(18000),providerGuard});
        const seen=new Set();
        const valid=result.items.filter(i=>i.demo!==true&&validateListing(i)&&!seen.has(i.id)&&seen.add(i.id));
        const items=filterListings(valid,{kind,source,query,sort:'recent'});
        const providers=result.providers.map(provider=>({...provider,count:items.filter(i=>i.source===provider.source).length}));
        const ok=providers.some(p=>p.status==='ok');
        const partial=providers.some(p=>p.status!=='ok');
        console.info(JSON.stringify({event:'search_complete',kind,source,counts:providers.map(p=>({source:p.source,status:p.status,count:p.count}))}));
        return {body:{query,kind,items,providers,fetchedAt:new Date().toISOString(),partial,limited:true,...(!ok?{error:'현재 원문 서비스에 연결하지 못했어요. 잠시 후 다시 검색해 주세요.'}:{})},status:ok?200:502};
      }});
      const rateLimit=result.rateLimit;
      return rateLimit?json({...result.body,rateLimit},result.status,false,privateRateHeaders):json(result.body,result.status,result.status===200);
    } catch(error) {
      if(error instanceof CostGuardError){const failure=guardFailure(error);return json(failure.body,failure.status,false,{...failure.headers,...(failure.body.rateLimit?privateRateHeaders:{})});}
      console.error('search_failed',error?.name||'Error');
      return json({error:'매물을 불러오지 못했어요. 잠시 후 다시 검색해 주세요.',items:[],providers:[],partial:true},502);
    }
  };
}
