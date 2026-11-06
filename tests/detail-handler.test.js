import test from 'node:test';
import assert from 'node:assert/strict';
import {createDetailHandler} from '../server/detail-handler.mjs';
import {createCostGuard} from '../server/cost-guard.mjs';

const identities = {kb:'28882930', encar:'41942591', kcar:'EC61424432'};
const request = query => new Request('https://used.example/api/detail?' + query);

test('each car detail source dispatches only its selected provider with bounded cancellation', async () => {
  const calls = [];
  const provider = source => async ({id, signal}) => {
    assert.ok(signal instanceof AbortSignal);
    assert.equal(signal.aborted, false);
    calls.push({source,id});
    return {source,id:source+'-'+id};
  };
  const handler = createDetailHandler({getKbDetail:provider('kb'), getEncarDetail:provider('encar'), getKcarDetail:provider('kcar')});
  for (const [source,id] of Object.entries(identities)) {
    const response = await handler(request(`source=${source}&id=${id}`));
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(), {detail:{source,id:source+'-'+id}});
  }
  assert.deepEqual(calls, Object.entries(identities).map(([source,id])=>({source,id})));
});

test('invalid sources, injected IDs and cross-source identifiers never reach a detail provider', async () => {
  let calls = 0;
  const get = async () => { calls++; };
  const handler = createDetailHandler({getKbDetail:get,getEncarDetail:get,getKcarDetail:get});
  for (const query of [
    'source=__proto__&id=41942591', 'source=constructor&id=41942591',
    'source=encar&id=EC61424432', 'source=kcar&id=41942591',
    'source=encar&id=041942591', 'source=encar&id=0',
    'source=encar&id=41942591&id=41942592', 'source=kcar&source=encar&id=EC61424432',
    'source=kcar&id=EC61424432%2f..', 'source=kcar&id=EC1234567890123',
    'source=kcar&id=https%3A%2F%2Fexample.com', 'source=encar&id=41942591%00',
    'source=encar&id=41942591&nonce=123',
  ]) assert.equal((await handler(request(query))).status,400,query);
  assert.equal(calls,0);
});

test('details cache one exact provider/id; other cars stay isolated',async()=>{
  let calls=0;const handler=createDetailHandler({getEncarDetail:async({id})=>{calls++;return {source:'encar',id};}});
  const first=await handler(request('source=encar&id=41942591'));
  assert.match(first.headers.get('cache-control'),/s-maxage=600/);
  const second=await handler(request('id=41942591&source=encar'));
  assert.deepEqual(await second.json(),await first.json());assert.equal(calls,1);
  await handler(request('source=encar&id=41942592'));assert.equal(calls,2);
});

test('provider cooldown blocks server work and identifies only the exact vehicle for independent recovery',async t=>{
  t.mock.method(console,'error',()=>{});let calls=0;
  const handler=createDetailHandler({getEncarDetail:async()=>{calls++;throw Object.assign(Error('denied'),{upstreamStatus:429});}});
  const first=await handler(request('source=encar&id=41942591'));
  assert.equal((await first.json()).code,'DETAIL_UPSTREAM_UNAVAILABLE');
  const second=await handler(request('source=encar&id=41942592'));
  assert.equal(second.status,503);assert.ok(Number(second.headers.get('retry-after'))>0);
  const body=await second.json();assert.equal(body.code,'PROVIDER_COOLDOWN');assert.equal(body.source,'encar');assert.equal(body.id,'41942592');assert.equal(calls,1);
});

test('detail limiter and kill switch never run provider or emit an upstream failure marker',async()=>{
  let calls=0;const get=async()=>{calls++;return {source:'encar',id:'41942591'};};
  const handler=createDetailHandler({getEncarDetail:get,guard:createCostGuard({enabled:()=>true,requestsPerWindow:1})});
  await handler(request('source=encar&id=41942591'));
  const limited=await handler(request('source=encar&id=41942592'));
  assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('retry-after'))>0);const limitedBody=await limited.json();assert.equal(limitedBody.code,'API_RATE_LIMIT');assert.equal(limitedBody.source,undefined);assert.equal(limitedBody.id,undefined);
  const stopped=await createDetailHandler({getEncarDetail:get,guard:createCostGuard({enabled:()=>false})})(request('source=encar&id=41942591'));
  assert.equal(stopped.status,503);const stoppedBody=await stopped.json();assert.equal(stoppedBody.code,'API_DISABLED');assert.equal(stoppedBody.source,undefined);assert.equal(stoppedBody.id,undefined);assert.equal(calls,1);
});

test('only an upstream failure receives a source-bound recovery marker', async t => {
  const logs=[];
  t.mock.method(console,'error',value=>logs.push(value));
  for (const [source,id] of Object.entries(identities)) {
    for (const status of [403,407,429,500]) {
      const get = async () => { throw Object.assign(new Error('PRIVATE_BODY'),{upstreamStatus:status}); };
      const handler=createDetailHandler({getKbDetail:get,getEncarDetail:get,getKcarDetail:get});
      const response=await handler(request(`source=${source}&id=${id}`));
      assert.equal(response.status,status===500?502:503);
      assert.equal(response.headers.get('Cache-Control'),'no-store');
      const body=await response.json();
      assert.equal(body.source,source);assert.equal(body.id,id);
      assert.equal(body.code,'DETAIL_UPSTREAM_UNAVAILABLE');
      assert.doesNotMatch(JSON.stringify(body),/PRIVATE_BODY/);
    }
  }
  assert.doesNotMatch(logs.join(''),/PRIVATE_BODY|41942591|28882930|EC61424432/);
});

test('not-found details do not invite a browser retry on another route', async t => {
  t.mock.method(console,'error',()=>{});
  for (const status of [404,410]) {
    const handler=createDetailHandler({getEncarDetail:async()=>{throw Object.assign(new Error('gone'),{upstreamStatus:status});}});
    const response=await handler(request('source=encar&id=41942591'));
    assert.equal(response.status,404);
    assert.equal((await response.json()).code,undefined);
  }
});
