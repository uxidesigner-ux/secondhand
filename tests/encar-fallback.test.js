import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverEncar} from '../src/encar-fallback.js';
import {createRecoveryGuard} from '../src/recovery-guard.js';

const listing = (changes = {}) => ({
  id: 'encar-123', title: '현대 그랜저 IG', price: 10000000,
  kind: 'car', source: 'encar', sourceName: '엔카', category: 'car', condition: 'unknown',
  status: 'unknown', methods: [], region: '서울', publishedAt: null, demo: false,
  url: 'https://fem.encar.com/cars/detail/123', ...changes,
});
const kb = listing({id: 'kb-456', source: 'kb', sourceName: 'KB차차차', url: 'https://www.kbchachacha.com/public/car/detail.kbc?carSeq=456'});
const payload = (changes = {}) => ({query: '그랜저', kind: 'car', items: [kb],
  providers: [{source: 'encar', status: 'unavailable', count: 0, message: '서버 조회 실패'}, {source: 'kb', status: 'ok', count: 1}],
  partial: true, limited: true, fetchedAt: '2026-01-01T00:00:00.000Z', ...changes});
const options = (changes = {}) => ({payload: payload(), status: 200, kind: 'car', source: 'all', query: '그랜저', ...changes});
const successful = items => ({items, provider: {source: 'encar', status: 'ok', count: items.length, total: 100, message: '브라우저 직접 조회'}});

test('protected failures, throttling, other modes and malformed payloads never request Encar', async () => {
  let calls = 0;
  const searchEncar = async () => { calls++; return successful([listing()]); };
  const cases = [
    ...[401, 403, 429, 400, 500, 503].map(status => ({status})),
    {kind: 'goods'}, {source: 'kb'}, {source: 'kcar'}, {query: ''}, {query: 'x'.repeat(81)},
    {payload: '<html>Vercel login</html>'}, {payload: null}, {payload: []},
    {payload: {items: [], providers: {}}}, {payload: payload({items: [{}]})},
    {payload: payload({providers: [null]})}, {payload: payload({providers: [{source: 'encar', status: 'bad'}]})},
    {payload: payload({query: '다른 검색'})}, {payload: payload({kind: 'goods'})},
    {payload: payload({providers: [{source: 'encar', status: 'error'}, {source: 'encar', status: 'error'}]})},
    {payload:payload({providers:[{source:'encar',status:'unavailable',code:'PROVIDER_BUSY',count:0}]})},
  ];
  for (const changes of cases) {
    const request = options({...changes, searchEncar});
    assert.equal(await recoverEncar(request), request.payload);
  }
  assert.equal(calls, 0);
});

test('successful server Encar results, including an empty result, never fetch twice', async () => {
  let calls = 0;
  for (const items of [[], [listing()]]) {
    const original = payload({items, providers: [{source: 'encar', status: 'ok', count: items.length}], partial: false});
    const result = await recoverEncar(options({payload: original, source: 'encar', searchEncar: async () => { calls++; }}));
    assert.equal(result, original);
  }
  const missing = payload({providers: [{source: 'kb', status: 'ok', count: 1}]});
  assert.equal(await recoverEncar(options({payload: missing, searchEncar: async () => { calls++; }})), missing);
  assert.equal(calls, 0);
});

test('recovery preserves other providers and only includes real, valid, unique query matches', async () => {
  const previousEncar = listing({id: 'encar-old'});
  const original = payload({items: [kb, previousEncar], error: '이전 오류'});
  const snapshot = structuredClone(original);
  const controller = new AbortController();
  let received;
  const before = Date.now();
  const result = await recoverEncar(options({payload: original, signal: controller.signal, searchEncar: async args => {
    received = args;
    return successful([listing(), listing(), listing({id: 'demo', demo: true}), listing({id: 'unrelated', title: '기아 K5'}),
      listing({id: 'unsafe', url: 'javascript:alert(1)'}), listing({id: 'kb-456'}), kb, null]);
  }}));
  assert.deepEqual(received, {query: '그랜저', limit: 30, signal: controller.signal});
  assert.deepEqual(result.items.map(item => item.id), ['kb-456', 'encar-123']);
  assert.equal(result.items[0], kb);
  assert.equal(result.providers[1], original.providers[1]);
  assert.equal(result.providers[0].status, 'ok');
  assert.equal(result.providers[0].count, 1);
  assert.equal(result.providers[0].total, 100);
  assert.equal(result.partial, false);
  assert.equal(result.limited, true);
  assert.equal('error' in result, false);
  assert.ok(Date.parse(result.fetchedAt) >= before && Date.parse(result.fetchedAt) <= Date.now());
  assert.deepEqual(original, snapshot);
});

test('a protected 502 with a failed provider can recover, including a genuine zero result', async () => {
  for (const items of [[listing()], []]) {
    const original = payload({items: [], providers: [{source: 'encar', status: 'error', count: 0}], error: '현재 연결 실패'});
    const result = await recoverEncar(options({payload: original, status: 502, source: 'encar', searchEncar: async () => successful(items)}));
    assert.equal(result.providers[0].status, 'ok');
    assert.equal(result.providers[0].count, items.length);
    assert.equal(result.partial, false);
    assert.equal('error' in result, false);
  }
});

test('recovery retains partial state when another provider is unavailable', async () => {
  const otherProvider = {source: 'kcar', status: 'unavailable', count: 0};
  const original = payload({providers: [...payload().providers, otherProvider]});
  const result = await recoverEncar(options({payload: original, searchEncar: async () => successful([listing()])}));
  assert.equal(result.partial, true);
  assert.equal(result.providers[2], otherProvider);
});

test('browser failure and malformed recovery preserve server listings without exposing raw errors', async () => {
  const original = payload();
  for (const searchEncar of [
    async () => { throw new TypeError('PRIVATE_QUERY https://private.test/?secret=123'); },
    async () => ({items: {}, provider: {source: 'encar', status: 'ok'}}),
    async () => ({items: [], provider: {source: 'kb', status: 'ok'}}),
  ]) {
    const result = await recoverEncar(options({payload: original, searchEncar}));
    assert.equal(result.items, original.items);
    assert.equal(result.providers[1], original.providers[1]);
    assert.equal(result.providers[0].status, 'unavailable');
    assert.match(result.providers[0].message, /브라우저에서도/);
    assert.equal(result.partial, true);
    assert.equal(result.fetchedAt, original.fetchedAt);
    assert.equal(JSON.stringify(result).includes('PRIVATE_QUERY'), false);
    assert.equal(JSON.stringify(result).includes('private.test'), false);
    assert.equal(original.providers[0].message, '서버 조회 실패');
  }
});

test('cancelled requests never publish recovery results or turn cancellation into provider failures', async () => {
  const controller = new AbortController();
  const reason = new DOMException('검색 변경', 'AbortError');
  controller.abort(reason);
  let calls = 0;
  await assert.rejects(recoverEncar(options({signal: controller.signal, searchEncar: async () => { calls++; }})), error => error === reason);
  assert.equal(calls, 0);
  for (const rejects of [false, true]) {
    const active = new AbortController();
    await assert.rejects(recoverEncar(options({signal: active.signal, searchEncar: async () => {
      active.abort(reason);
      if (rejects) throw new TypeError('network interrupted');
      return successful([listing()]);
    }})), error => error === reason);
  }
  await assert.rejects(recoverEncar(options({searchEncar: async () => { throw reason; }})), error => error === reason);
});

test('server cooldown may recover through public CORS, but browser failures wait five minutes', async () => {
  let time=0,calls=0;
  const recoveryGuard=createRecoveryGuard({now:()=>time});
  const original=payload({providers:[{source:'encar',status:'unavailable',code:'PROVIDER_COOLDOWN',count:0}]});
  const searchEncar=async()=>{calls++;throw new TypeError('network');};
  await recoverEncar(options({payload:original,searchEncar,recoveryGuard}));
  await recoverEncar(options({payload:original,searchEncar,recoveryGuard}));
  assert.equal(calls,1);
  time=300_000;
  const result=await recoverEncar(options({payload:original,recoveryGuard,searchEncar:async()=>{calls++;return successful([listing()]);}}));
  assert.equal(calls,2);assert.equal(result.providers[0].status,'ok');
  const blocked=await recoverEncar(options({payload:original,status:429,recoveryGuard,searchEncar}));
  assert.equal(blocked,original);assert.equal(calls,2);
});

test('browser recovery guard bounds concurrent calls and releases without cooldown on cancellation', async () => {
  let release,calls=0;
  const recoveryGuard=createRecoveryGuard();
  const searchEncar=()=>{calls++;return new Promise(resolve=>{release=resolve;});};
  const first=recoverEncar(options({searchEncar,recoveryGuard}));
  const second=options({searchEncar,recoveryGuard});
  assert.equal(await recoverEncar(second),second.payload);assert.equal(calls,1);
  release(successful([listing()]));await first;
  await assert.rejects(recoverEncar(options({recoveryGuard,searchEncar:async()=>{throw new DOMException('cancel','AbortError');}})),{name:'AbortError'});
  const next=await recoverEncar(options({recoveryGuard,searchEncar:async()=>successful([listing()])}));
  assert.equal(next.providers[0].status,'ok');
});
