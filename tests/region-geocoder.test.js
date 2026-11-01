import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';

let instance = 0;
const fresh = () => import(`../src/region-geocoder.js?test=${++instance}`);
const ring = (left, bottom, right, top) => [[left, bottom], [right, bottom], [right, top], [left, top], [left, bottom]];
const feature = (name, type, coordinates) => ({type: 'Feature', properties: {name}, geometry: {type, coordinates}});
const collection = features => ({type: 'FeatureCollection', features});
const simple = collection([feature('서울특별시 테스트동', 'Polygon', [ring(126, 36, 128, 38)])]);
const response = payload => new Response(gzipSync(JSON.stringify(payload)));

test('bundled real boundaries resolve four fixed public landmarks locally and do not guess outside coverage', async t => {
  const data = await readFile(new URL('../assets/regions/korea-admin-dong-20261001.geojson.gz', import.meta.url));
  let request;
  const mock = t.mock.method(globalThis, 'fetch', async (url, options) => {
    request = {url: new URL(url), options};
    return new Response(data);
  });
  const {lookupRegionName} = await fresh();
  // Fixed public-landmark coordinates, never a user's actual location.
  for (const [coords, expected] of [
    [{lat: 37.5665, lng: 126.978}, '서울특별시 중구 명동'],
    [{lat: 37.5445, lng: 127.0374}, '서울특별시 성동구 성수1가1동'],
    [{lat: 36.3504, lng: 127.3845}, '대전광역시 서구 둔산1동'],
    [{lat: 33.4996, lng: 126.5312}, '제주특별자치도 제주시 이도2동'],
  ]) assert.equal(await lookupRegionName(coords), expected);
  assert.equal(await lookupRegionName({lat: 35.6762, lng: 139.6503}), null);
  assert.equal(await lookupRegionName({lat: 0, lng: 0}), null);
  assert.equal(mock.mock.callCount(), 1, 'successful data is reused from memory');
  assert.ok(request.url.pathname.endsWith('/assets/regions/korea-admin-dong-20261001.geojson.gz'));
  assert.equal(request.url.search, '');
  assert.equal(request.url.hash, '');
  assert.deepEqual(Object.keys(request.options).sort(), ['method', 'credentials', 'mode', 'redirect', 'cache', 'signal'].sort());
  assert.equal(request.options.method, 'GET');
  assert.equal(request.options.credentials, 'same-origin');
  assert.equal(request.options.mode, 'same-origin');
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.options.cache, 'force-cache');
  assert.equal('body' in request.options, false);
  assert.equal('headers' in request.options, false);
  for (const number of ['37.5665', '126.978', '37.5445', '127.0374']) {
    assert.equal(JSON.stringify(request).includes(number), false);
  }
});

test('polygon holes, disconnected multipolygons and bounding boxes do not produce nearest-region substitutions', async t => {
  const payload = collection([
    feature('구멍이 있는 동', 'Polygon', [ring(1, 1, 10, 10), ring(3, 3, 5, 5)]),
    feature('섬 두 곳인 동', 'MultiPolygon', [[ring(12, 1, 13, 2)], [ring(15, 1, 16, 2)]]),
  ]);
  t.mock.method(globalThis, 'fetch', async () => response(payload));
  const {lookupRegionName} = await fresh();
  assert.equal(await lookupRegionName({lat: 2, lng: 2}), '구멍이 있는 동');
  assert.equal(await lookupRegionName({lat: 4, lng: 4}), null);
  assert.equal(await lookupRegionName({lat: 3, lng: 4}), null, 'hole boundary is excluded');
  assert.equal(await lookupRegionName({lat: 1.5, lng: 12.5}), '섬 두 곳인 동');
  assert.equal(await lookupRegionName({lat: 1.5, lng: 15.5}), '섬 두 곳인 동');
  assert.equal(await lookupRegionName({lat: 1.5, lng: 14}), null, 'gap between islands is outside');
  assert.equal(await lookupRegionName({lat: 2, lng: 11}), null);
});

test('overlapping regions and shared boundaries do not return an arbitrary name', async t => {
  t.mock.method(globalThis, 'fetch', async () => response(collection([
    feature('A동', 'Polygon', [ring(1, 1, 3, 3)]),
    feature('B동', 'Polygon', [ring(2, 2, 4, 4)]),
    feature('C동', 'Polygon', [ring(4, 2, 5, 4)]),
  ])));
  const {lookupRegionName} = await fresh();
  assert.equal(await lookupRegionName({lat: 2.5, lng: 2.5}), null);
  assert.equal(await lookupRegionName({lat: 3, lng: 4}), null);
  assert.equal(await lookupRegionName({lat: 1.5, lng: 1.5}), 'A동');
});

test('invalid coordinates and already cancelled calls never fetch data', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => response(simple));
  const {lookupRegionName} = await fresh();
  for (const coords of [null, undefined, [], {}, {lat: '37', lng: 127}, {lat: 37, lng: '127'}, {lat: NaN, lng: 127}, {lat: 91, lng: 127}, {lat: 37, lng: 181}, {lat: 37, lng: Infinity}]) {
    await assert.rejects(lookupRegionName(coords), {name: 'TypeError'});
  }
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(lookupRegionName({lat: 37, lng: 127}, {signal: controller.signal}), {name: 'AbortError'});
  assert.equal(mock.mock.callCount(), 0);
});

test('an in-flight cancellation does not cancel another caller or poison its successful cache', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', (_url, {signal}) => {
    calls++;
    if (calls === 1) return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), {once: true}));
    return Promise.resolve(response(simple));
  });
  const {lookupRegionName} = await fresh();
  const controller = new AbortController();
  const first = lookupRegionName({lat: 37, lng: 127}, {signal: controller.signal});
  const cancelled = assert.rejects(first, {name: 'AbortError'});
  const second = lookupRegionName({lat: 37, lng: 127});
  controller.abort();
  await cancelled;
  assert.equal(await second, '서울특별시 테스트동');
  assert.equal(await lookupRegionName({lat: 37, lng: 127}), '서울특별시 테스트동');
  assert.equal(calls, 2);
});

test('cancelling a stalled compressed body cancels its reader', async t => {
  let cancelled = false;
  let reading;
  const started = new Promise(resolve => { reading = resolve; });
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({
    pull() { reading(); }, cancel() { cancelled = true; },
  })));
  const {lookupRegionName} = await fresh();
  const controller = new AbortController();
  const pending = lookupRegionName({lat: 37, lng: 127}, {signal: controller.signal});
  await started;
  controller.abort();
  await assert.rejects(pending, {name: 'AbortError'});
  assert.equal(cancelled, true);
});

test('network timeout ends after twelve seconds without retry', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const mock = t.mock.method(globalThis, 'fetch', (_url, {signal}) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), {once: true});
  }));
  const {lookupRegionName} = await fresh();
  const pending = lookupRegionName({lat: 37, lng: 127});
  t.mock.timers.tick(12000);
  await assert.rejects(pending, {name: 'TimeoutError'});
  assert.equal(mock.mock.callCount(), 1);
});

test('network, HTTP, gzip and malformed geometry failures are safe and never cached', async t => {
  for (const [name, fail] of [
    ['network', () => { throw new Error('PRIVATE coordinates request body'); }],
    ['HTTP', () => new Response('PRIVATE server response', {status: 403})],
    ['gzip', () => new Response('not gzip PRIVATE')],
    ['schema', () => response({features: []})],
    ['geometry', () => response(collection([feature('동', 'Polygon', [[[126, 37], [NaN, 38], [128, 38], [126, 37]]])]))],
  ]) await t.test(name, async t => {
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => { calls++; return calls === 1 ? fail() : response(simple); });
    const {lookupRegionName} = await fresh();
    await assert.rejects(lookupRegionName({lat: 37, lng: 127}), error => {
      assert.equal(error.message.includes('PRIVATE'), false);
      assert.equal(error.message.includes('37'), false);
      return error.name === 'Error';
    });
    assert.equal(await lookupRegionName({lat: 37, lng: 127}), '서울특별시 테스트동');
    assert.equal(calls, 2);
  });
});

test('compressed data is bounded at 4MB and decompressed data at 16MB', async t => {
  for (const kind of ['declared', 'streamed', 'decoded']) await t.test(kind, async t => {
    let cancelled = false;
    t.mock.method(globalThis, 'fetch', async () => {
      if (kind === 'decoded') return new Response(gzipSync(' '.repeat(16 * 1024 * 1024 + 1)));
      return new Response(new ReadableStream({
        pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); },
        cancel() { cancelled = true; },
      }, {highWaterMark: 0}), {headers: kind === 'declared' ? {'content-length': String(4 * 1024 * 1024 + 1)} : {}});
    });
    const {lookupRegionName} = await fresh();
    await assert.rejects(lookupRegionName({lat: 37, lng: 127}), {name: 'Error'});
    if (kind !== 'decoded') assert.equal(cancelled, true);
  });
});
