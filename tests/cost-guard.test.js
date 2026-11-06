import test from 'node:test';
import assert from 'node:assert/strict';
import {createCostGuard,createProviderGuard,publicApiEnabled,clientKey} from '../server/cost-guard.mjs';

const request = headers => new Request('https://used.example/api/search?q=x',{headers});
const success = value => ({status:200,body:{value}});
const deferred = () => {let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const options = extra => ({enabled:()=>true,requestsPerWindow:100,...extra});

test('API requires an explicit enable policy and trusts only the Vercel-overwritten real IP',()=>{
  assert.equal(publicApiEnabled({VERCEL:'1'},{}),false);
  assert.equal(publicApiEnabled({VERCEL:'1',USED_PUBLIC_API_ENABLED:'TRUE'},{}),false);
  assert.equal(publicApiEnabled({VERCEL:'1',USED_PUBLIC_API_ENABLED:'true'}),true);
  assert.equal(publicApiEnabled({USED_PUBLIC_API_ENABLED:'false'}),false);
  assert.equal(publicApiEnabled({},{}),false);
  assert.equal(publicApiEnabled({}, {enabled:true}),true);
  assert.equal(clientKey(request({'x-real-ip':'203.0.113.4','x-forwarded-for':'198.51.100.9'}),{VERCEL:'1'}),'203.0.113.4');
  assert.equal(clientKey(request({'x-forwarded-for':'198.51.100.9'}),{VERCEL:'1'}),'unknown');
  assert.equal(clientKey(request({'x-real-ip':'a,b'}),{VERCEL:'1'}),'unknown');
  assert.equal(clientKey(request({'x-real-ip':'203.0.113.4'}),{}),'local');
});

test('same-key concurrent requests share one operation; a canceled caller does not abort it',async()=>{
  const guard=createCostGuard(options({concurrency:1})),wait=deferred();let calls=0;
  const controller=new AbortController();
  const first=guard.run({request:new Request('https://used.example/',{signal:controller.signal}),key:'same',load:()=>{calls++;return wait.promise;}});
  const second=guard.run({request:request(),key:'same',load:()=>{calls++;}});
  controller.abort();
  await assert.rejects(guard.run({request:request(),key:'different',load:()=>{calls++;}}),{code:'API_BUSY',status:503});
  assert.equal(calls,1);
  wait.resolve(success('done'));
  assert.deepEqual(await first,success('done'));assert.deepEqual(await second,success('done'));
  assert.equal(guard.stats().inFlight,0);
});

test('fresh cache prevents work, returned copies cannot poison cache, expiry permits a new load',async()=>{
  let time=0,calls=0;const guard=createCostGuard(options({ttlMs:100,now:()=>time}));
  const run=()=>guard.run({request:request(),key:'one',load:async()=>success(++calls)});
  await run();const cached=await run();cached.body.value=999;
  assert.deepEqual(await run(),success(1));assert.equal(calls,1);
  time=100;assert.deepEqual(await run(),success(2));assert.equal(calls,2);
});

test('error responses and thrown loads are not cached and release concurrency',async()=>{
  const guard=createCostGuard(options({concurrency:1}));let calls=0;
  for(let i=0;i<2;i++)assert.equal((await guard.run({request:request(),key:'error',load:async()=>{calls++;return {status:502,body:{error:'upstream'}};}})).status,502);
  await assert.rejects(guard.run({request:request(),key:'throw',load:async()=>{throw Error('upstream');}}),/upstream/);
  assert.deepEqual(await guard.run({request:request(),key:'throw',load:async()=>success(3)}),success(3));
  assert.equal(calls,2);assert.equal(guard.stats().inFlight,0);
});

test('cache count, per-entry bytes and total bytes remain bounded',async()=>{
  const guard=createCostGuard(options({maxEntries:2,maxBytes:200,maxEntryBytes:150}));let calls=0;
  const run=(key,value)=>guard.run({request:request(),key,load:async()=>{calls++;return success(value);}});
  await run('a','A');await run('b','B');await run('c','C');
  assert.equal(guard.stats().cacheEntries,2);assert.ok(guard.stats().cacheBytes<=200);
  await run('a','A');assert.equal(calls,4);
  await run('large','x'.repeat(200));await run('large','x'.repeat(200));assert.equal(calls,6);
  assert.ok(guard.stats().cacheEntries<=2);assert.ok(guard.stats().cacheBytes<=200);
});

test('rate buckets reset after a window and full active client maps fail closed',async()=>{
  let time=0,calls=0;const guard=createCostGuard(options({now:()=>time,requestsPerWindow:2,maxClients:2,windowMs:1000,identity:r=>r.headers.get('x-test-client')}));
  const run=id=>guard.run({request:request({'x-test-client':id}),key:id,load:async()=>success(++calls)});
  await run('a');await run('a');await run('b');
  await assert.rejects(run('a'),{code:'API_RATE_LIMIT',status:429,retryAfter:1});
  await assert.rejects(run('c'),{code:'API_BUSY',status:503});
  assert.equal(calls,2);assert.equal(guard.stats().clients,2);
  time=1000;await run('c');assert.equal(calls,3);assert.equal(guard.stats().clients,1);
});

test('kill switch stops both fresh work and cached results before any load',async()=>{
  let enabled=true,calls=0;const guard=createCostGuard(options({enabled:()=>enabled}));
  const run=key=>guard.run({request:request(),key,load:async()=>success(++calls)});
  await run('one');enabled=false;
  await assert.rejects(run('one'),{code:'API_DISABLED',status:503});
  await assert.rejects(run('two'),{code:'API_DISABLED',status:503});assert.equal(calls,1);
});

test('provider limits are independent; 403/407/429 trigger cooldown and expiry resumes work',async()=>{
  for(const upstreamStatus of [403,407,429]){
    let time=0,calls=0;const guard=createProviderGuard({now:()=>time,cooldownMs:1000});
    await assert.rejects(guard.run('encar',async()=>{calls++;throw Object.assign(Error('blocked'),{upstreamStatus});}),/blocked/);
    await assert.rejects(guard.run('encar',async()=>{calls++;}),{code:'PROVIDER_COOLDOWN',retryAfter:1});
    assert.equal(await guard.run('kb',async()=>42),42);
    time=1000;assert.equal(await guard.run('encar',async()=>{calls++;return 8;}),8);assert.equal(calls,2);
  }
});

test('provider concurrent load is bounded and unknown providers never execute',async()=>{
  const guard=createProviderGuard({concurrency:1}),wait=deferred();let calls=0;
  const first=guard.run('kb',()=>wait.promise);
  await assert.rejects(guard.run('kb',async()=>{calls++;}),{code:'PROVIDER_BUSY'});
  await assert.rejects(guard.run('__proto__',async()=>{calls++;}),{code:'PROVIDER_INVALID'});
  wait.resolve('done');assert.equal(await first,'done');assert.equal(calls,0);
  assert.equal(await guard.run('kb',async()=>7),7);
});

test('search quota metadata starts at 80 percent, blocks after the limit and expires with its window',async()=>{
  let time=0,calls=0;
  const guard=createCostGuard({enabled:()=>true,now:()=>time});
  const run=()=>guard.run({request:request(),key:'same',includeRateLimit:true,load:async()=>success(++calls)});
  for(let i=1;i<=9;i++)assert.equal((await run()).rateLimit,undefined);
  const tenth=await run();
  assert.deepEqual(tenth.rateLimit,{scope:'ip-instance',limit:12,remaining:2,resetAfter:60});
  time=1250;
  assert.equal(tenth.rateLimit.resetAfter,59);
  assert.equal((await run()).rateLimit.remaining,1);
  assert.equal((await run()).rateLimit.remaining,0);
  await assert.rejects(run(),error=>{
    assert.equal(error.code,'API_RATE_LIMIT');assert.equal(error.status,429);
    assert.deepEqual(error.rateLimit,{scope:'ip-instance',limit:12,remaining:0,resetAfter:59});
    assert.equal(error.retryAfter,59);return true;
  });
  time=60000;
  assert.equal(tenth.rateLimit,undefined);
  assert.equal((await run()).rateLimit,undefined);
  assert.equal(calls,1);
});

test('shared memory and in-flight data never share one caller quota with another',async()=>{
  let time=0,calls=0;
  const guard=createCostGuard({enabled:()=>true,now:()=>time,identity:r=>r.headers.get('x-test-client')});
  const run=(id,key='warm',load=async()=>success(++calls),includeRateLimit=true)=>guard.run({request:request({'x-test-client':id}),key,load,includeRateLimit});
  for(let i=0;i<9;i++)await run('busy');
  const wait=deferred();
  const first=run('busy','shared',()=>{calls++;return wait.promise;});
  const second=run('new','shared');
  time=5000;wait.resolve(success('done'));
  const [busy,other]=await Promise.all([first,second]);
  assert.deepEqual(busy.rateLimit,{scope:'ip-instance',limit:12,remaining:2,resetAfter:55});
  assert.equal(other.rateLimit,undefined);
  assert.equal(busy.body.rateLimit,undefined);assert.equal(other.body.rateLimit,undefined);
  assert.equal((await run('third','shared')).rateLimit,undefined);
  assert.equal((await run('busy','shared',undefined,false)).rateLimit,undefined);
  assert.equal(calls,2);
});

test('slow responses do not revive expired warnings and non-quota failures carry no quota',async()=>{
  let time=0;
  const guard=createCostGuard({enabled:()=>true,requestsPerWindow:1,now:()=>time});
  const result=await guard.run({request:request(),key:'slow',includeRateLimit:true,load:async()=>{time=61000;return success('done');}});
  assert.equal(result.rateLimit,undefined);
  const disabled=createCostGuard({enabled:()=>false});
  await assert.rejects(disabled.run({request:request(),key:'none',includeRateLimit:true,load:async()=>success('bad')}),error=>{
    assert.equal(error.code,'API_DISABLED');assert.equal(error.rateLimit,undefined);return true;
  });
  const pending=deferred(),busy=createCostGuard({enabled:()=>true,requestsPerWindow:2,concurrency:1});
  const first=busy.run({request:request(),key:'one',includeRateLimit:true,load:()=>pending.promise});
  await assert.rejects(busy.run({request:request(),key:'two',includeRateLimit:true,load:async()=>success('bad')}),error=>{
    assert.equal(error.code,'API_BUSY');assert.equal(error.rateLimit,undefined);return true;
  });
  pending.resolve(success('done'));await first;
});
