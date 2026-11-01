import test from 'node:test';
import assert from 'node:assert/strict';
import {locateCurrentRegion} from '../src/location-lookup.js';

// Public landmark coordinate used only by these in-memory unit tests.
const coords = {lat: 37.5663, lng: 126.9779};
const position = {coords: {latitude: coords.lat, longitude: coords.lng}};
const immediate = {getCurrentPosition(success) { success(position); }};
const pendingGps = () => {
  const callbacks = {};
  return {callbacks, geolocation: {getCurrentPosition(success, failure, options) {
    Object.assign(callbacks, {success, failure, options});
  }}};
};
const isAbort = error => error.name === 'AbortError';

test('valid GPS passes only coordinates and signal to the local name resolver', async () => {
  const controller = new AbortController();
  const gps = pendingGps();
  let received;
  const request = locateCurrentRegion({geolocation: gps.geolocation, signal: controller.signal,
    resolveName: async (...args) => { received = args; return '  서울 중구 명동\n\u0000\u200b  '; }});
  assert.deepEqual(gps.callbacks.options, {timeout: 10000, maximumAge: 60000, enableHighAccuracy: false});
  gps.callbacks.success(position);
  assert.deepEqual(await request, {coords, locationName: '서울 중구 명동', warning: ''});
  assert.deepEqual(received, [coords, {signal: controller.signal}]);
});

test('name sanitization removes controls and limits the label to 50 characters', async () => {
  const result = await locateCurrentRegion({geolocation: immediate, resolveName: () => `\n  ${'동'.repeat(55)}\t `});
  assert.equal(result.locationName, '동'.repeat(50));
  assert.equal(result.warning, '');
});

test('native permission, unavailable and timeout errors expose safe codes only', async () => {
  for (const [nativeCode, expected] of [[1, 'permission'], [2, 'unavailable'], [3, 'timeout'], [99, 'unavailable']]) {
    let resolved = false;
    await assert.rejects(locateCurrentRegion({
      geolocation: {getCurrentPosition(success, failure) { failure({code: nativeCode, message: 'PRIVATE native error'}); }},
      resolveName: () => { resolved = true; },
    }), error => error.code === expected && !error.message.includes('PRIVATE'));
    assert.equal(resolved, false);
  }
  await assert.rejects(locateCurrentRegion({geolocation: null}), error => error.code === 'unsupported');
  await assert.rejects(locateCurrentRegion({geolocation: {getCurrentPosition() { throw new Error('PRIVATE thrown error'); }}}),
    error => error.code === 'unavailable' && !error.message.includes('PRIVATE'));
});

test('invalid and out-of-range coordinates never reach name lookup', async () => {
  let calls = 0;
  for (const coordinates of [null, {}, {latitude: NaN, longitude: 127}, {latitude: 37, longitude: Infinity},
    {latitude: 91, longitude: 127}, {latitude: 37, longitude: -181}, {latitude: '37', longitude: 127}]) {
    await assert.rejects(locateCurrentRegion({geolocation: {getCurrentPosition(success) { success({coords: coordinates}); }},
      resolveName: () => { calls++; }}), error => error.code === 'unavailable');
  }
  assert.equal(calls, 0);
});

test('own timeout settles GPS if the platform never calls back and ignores late success', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const gps = pendingGps();
  let calls = 0;
  const request = locateCurrentRegion({geolocation: gps.geolocation, resolveName: () => { calls++; }});
  const rejection = assert.rejects(request, error => error.code === 'timeout');
  t.mock.timers.tick(10000);
  await rejection;
  gps.callbacks.success(position);
  await Promise.resolve();
  assert.equal(calls, 0);
});

test('settled GPS and lookup remove their abort listeners and clear the native watchdog', async t => {
  const controller = new AbortController();
  const add = t.mock.method(controller.signal, 'addEventListener');
  const remove = t.mock.method(controller.signal, 'removeEventListener');
  const clear = t.mock.method(globalThis, 'clearTimeout');
  await locateCurrentRegion({geolocation: immediate, signal: controller.signal, resolveName: async () => '명동'});
  assert.equal(clear.mock.callCount(), 1);
  assert.equal(add.mock.callCount(), 2);
  assert.equal(remove.mock.callCount(), 2);
  for (const entry of add.mock.calls) assert.ok(remove.mock.calls.some(call => call.arguments[1] === entry.arguments[1]));
});

test('abort before GPS starts is immediate even when the abort reason is not an AbortError', async () => {
  const controller = new AbortController();
  controller.abort(new Error('PRIVATE reason'));
  let calls = 0;
  await assert.rejects(locateCurrentRegion({signal: controller.signal,
    geolocation: {getCurrentPosition() { calls++; }}, resolveName: () => { calls++; }}), isAbort);
  assert.equal(calls, 0);
});

test('abort during pending GPS clears listeners and rejects without running a late lookup', async t => {
  const controller = new AbortController();
  const remove = t.mock.method(controller.signal, 'removeEventListener');
  const clear = t.mock.method(globalThis, 'clearTimeout');
  const gps = pendingGps();
  let calls = 0;
  const request = locateCurrentRegion({geolocation: gps.geolocation, signal: controller.signal, resolveName: () => { calls++; }});
  const rejection = assert.rejects(request, isAbort);
  controller.abort();
  await rejection;
  gps.callbacks.success(position);
  gps.callbacks.failure({code: 1});
  await Promise.resolve();
  assert.equal(calls, 0);
  assert.equal(remove.mock.callCount(), 1);
  assert.equal(clear.mock.callCount(), 1);
});

test('abort immediately after GPS success prevents the name resolver from starting', async () => {
  const controller = new AbortController();
  const gps = pendingGps();
  let calls = 0;
  const request = locateCurrentRegion({geolocation: gps.geolocation, signal: controller.signal, resolveName: () => { calls++; }});
  const rejection = assert.rejects(request, isAbort);
  gps.callbacks.success(position);
  controller.abort();
  await rejection;
  assert.equal(calls, 0);
});

test('abort during local lookup rejects promptly and consumes late completion or failure', async () => {
  for (const lateFailure of [false, true]) {
    const controller = new AbortController();
    let finish, fail, started;
    const began = new Promise(resolve => { started = resolve; });
    const request = locateCurrentRegion({geolocation: immediate, signal: controller.signal, resolveName: () => {
      started();
      return new Promise((resolve, reject) => { finish = resolve; fail = reject; });
    }});
    const rejection = assert.rejects(request, isAbort);
    await began;
    controller.abort();
    await rejection;
    if (lateFailure) fail(new Error('PRIVATE late failure'));
    else finish('명동');
    await Promise.resolve();
  }
});

test('name failure, missing resolver and unsupported regions preserve the valid GPS coordinates', async () => {
  for (const resolveName of [undefined, () => null, () => undefined, () => '\n \u0000', () => ({name: 'invalid'}),
    () => { throw new Error('PRIVATE name failure'); }, async () => { throw new Error('PRIVATE asynchronous failure'); }]) {
    const result = await locateCurrentRegion({geolocation: immediate, resolveName});
    assert.deepEqual(result.coords, coords);
    assert.equal(result.locationName, '');
    assert.equal(result.warning, '현재 위치는 확인했지만 지역명을 표시하지 못했어요.');
    assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  }
});
