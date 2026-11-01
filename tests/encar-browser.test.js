import test from 'node:test';
import assert from 'node:assert/strict';
import {searchEncarInBrowser} from '../src/providers/encar.js';

const car = {
  Id: '42814979', Manufacturer: '현대', Model: '더 뉴 그랜저 IG', Price: 2180,
  FormYear: '2020', Mileage: 61410, FuelType: '가솔린', SellType: '일반',
  Photos: [{type: '001', location: '/carpicture10/pic4280/42805193_001.jpg'}],
};
const reply = rows => new Response(JSON.stringify({Count: 100, SearchResults: rows}), {headers: {'Content-Type': 'application/json'}});

// Browser CORS itself is verified in the real browser; these tests enforce our
// request contract, cancellation and untrusted-response boundaries offline.
test('browser Encar uses only the fixed public endpoint with native CORS and no credentials', async t => {
  let request;
  t.mock.method(globalThis, 'fetch', async (url, options) => { request = {url: new URL(url), options}; return reply([car, car, {...car, Id: '2', Lease: '1'}]); });
  const result = await searchEncarInBrowser({query: '그랜저 (IG)._..'});
  assert.equal(request.url.origin, 'https://api.encar.com');
  assert.equal(request.url.pathname, '/search/car/list/mobile');
  assert.equal(request.url.searchParams.get('q'), '(And.Hidden.N._.CarType.A._.Search.keyword(그랜저 IG).)');
  assert.equal(request.url.searchParams.get('sr'), '|MobileModifiedDate|0|30');
  assert.deepEqual(request.options.headers, {Accept: 'application/json'});
  assert.equal(request.options.method, 'GET');
  assert.equal(request.options.mode, 'cors');
  assert.equal(request.options.credentials, 'omit');
  assert.equal(request.options.redirect, 'error');
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].url, 'https://fem.encar.com/cars/detail/42814979');
  assert.equal(result.items[0].price, 21800000);
  assert.equal(result.items[0].status, 'unknown');
  assert.equal(result.items[0].demo, false);
  assert.deepEqual({...result.provider, message: undefined}, {source: 'encar', status: 'ok', count: 1, total: 100, message: undefined});
  assert.match(result.provider.message, /브라우저/);
});

test('browser Encar bounds requested and displayed result counts even when upstream ignores limit', async t => {
  const rows = Array.from({length: 50}, (_, i) => ({...car, Id: String(i + 1)}));
  let url;
  t.mock.method(globalThis, 'fetch', async input => { url = new URL(input); return reply(rows); });
  const large = await searchEncarInBrowser({limit: 1000});
  assert.equal(url.searchParams.get('sr'), '|MobileModifiedDate|0|40');
  assert.equal(large.items.length, 40);
  assert.equal((await searchEncarInBrowser({limit: 2})).items.length, 2);
});

test('browser Encar aborts before a request and while waiting for a response', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', (_url, {signal}) => {
    calls++;
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), {once: true}));
  });
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(searchEncarInBrowser({signal: cancelled.signal}), {name: 'AbortError'});
  assert.equal(calls, 0);
  const active = new AbortController();
  const result = searchEncarInBrowser({signal: active.signal});
  active.abort();
  await assert.rejects(result, {name: 'AbortError'});
  assert.equal(calls, 1);
});

test('browser Encar cancels a stalled response body when a search is superseded', async t => {
  let cancelled = false;
  let bodyStarted;
  const started = new Promise(resolve => { bodyStarted = resolve; });
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({
    pull() { bodyStarted(); },
    cancel() { cancelled = true; },
  })));
  const controller = new AbortController();
  const pending = searchEncarInBrowser({signal: controller.signal});
  await started;
  controller.abort();
  await assert.rejects(pending, {name: 'AbortError'});
  assert.equal(cancelled, true);
});

test('browser Encar times out after nine seconds without retrying', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  let calls = 0;
  t.mock.method(globalThis, 'fetch', (_url, {signal}) => {
    calls++;
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), {once: true}));
  });
  const pending = searchEncarInBrowser({query: '그랜저'});
  t.mock.timers.tick(9000);
  await assert.rejects(pending, {name: 'TimeoutError'});
  assert.equal(calls, 1);
});

test('browser Encar rejects HTTP, CORS, JSON and schema failures without another route or retry', async t => {
  for (const [label, response, expected] of [
    ['HTTP403', () => new Response('denied', {status: 403}), {stage: 'http', upstreamStatus: 403}],
    ['HTTP429', () => new Response('limited', {status: 429}), {stage: 'http', upstreamStatus: 429}],
    ['CORS', () => { throw new TypeError('Failed to fetch'); }, {name: 'TypeError'}],
    ['JSON', () => new Response('<html>unexpected</html>'), {stage: 'json'}],
    ['schema', () => new Response(JSON.stringify({Count: 0, SearchResults: {}})), {stage: 'schema'}],
  ]) {
    await t.test(label, async t => {
      const mock = t.mock.method(globalThis, 'fetch', async () => response());
      await assert.rejects(searchEncarInBrowser(), expected);
      assert.equal(mock.mock.callCount(), 1);
    });
  }
});

test('browser Encar enforces the 2MB body limit both declared and streamed', async t => {
  for (const declared of [true, false]) {
    await t.test(declared ? 'content-length' : 'chunked body', async t => {
      let cancelled = false;
      const body = new ReadableStream({
        pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); },
        cancel() { cancelled = true; },
      }, {highWaterMark: 0});
      t.mock.method(globalThis, 'fetch', async () => new Response(body, {
        headers: declared ? {'content-length': String(2 * 1024 * 1024 + 1)} : {},
      }));
      await assert.rejects(searchEncarInBrowser(), {stage: 'body'});
      assert.equal(cancelled, true);
    });
  }
});
