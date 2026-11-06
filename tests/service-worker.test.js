import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const code=await readFile(new URL('../sw.js',import.meta.url),'utf8');
function worker(){
  const handlers={},entries=new Map();let requests=0;
  const key=value=>new URL(typeof value==='string'?value:value.url,'https://used.test/').href;
  const cache={match:async request=>entries.get(key(request))?.clone(),put:async(request,response)=>entries.set(key(request),response.clone())};
  vm.runInNewContext(code,{URL,Response,Request,Set,Promise,
    self:{location:{href:'https://used.test/sw.js',origin:'https://used.test'},addEventListener:(name,handler)=>{handlers[name]=handler;}},
    caches:{open:async()=>cache},fetch:async()=>{requests++;return new Response('network-'+requests);}});
  return {entries,get requests(){return requests;},async request(path,mode='cors'){
    let pending;handlers.fetch({request:{url:new URL(path,'https://used.test/').href,method:'GET',mode},respondWith:value=>{pending=value;}});
    return pending?await pending:null;
  }};
}
test('versioned shell files and region data are reused without extra network transfers',async()=>{
  const sw=worker();
  for(const path of ['/src/search-cache.js','/src/recovery-guard.js','/assets/regions/korea-admdong-20261001.json.gz']){
    const first=await sw.request(path),second=await sw.request(path);
    assert.equal(await first.text(),await second.text());
  }
  assert.equal(sw.requests,3);
});
test('search and detail APIs never enter the offline worker cache',async()=>{
  const sw=worker();
  assert.equal(await sw.request('/api/search?q=test&kind=goods'),null);
  assert.equal(await sw.request('/api/detail?source=kb&id=123'),null);
  assert.equal(sw.requests,0);assert.equal(sw.entries.size,0);
});
test('navigation stays fresh without accumulating query-specific offline documents',async()=>{
  const sw=worker();
  await sw.request('/?q=one&view=results','navigate');
  await sw.request('/?q=two&view=results','navigate');
  assert.equal(sw.requests,2);assert.deepEqual([...sw.entries.keys()],['https://used.test/index.html']);
  await sw.request('/unrecognized.js');
  assert.equal(sw.entries.size,1);
});
