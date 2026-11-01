import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEncarDetail, parseEncarHtml, createEncarDetailFetcher, isEncarCarId} from '../src/providers/encar-detail.js';
import {createEncarDetailProvider} from '../server/providers/encar-detail.mjs';

const id = '41942591';
const timestamp = '2026-11-02T00:00:00Z';
// Public vehicle facts/field shapes observed on the supplied page. Any private
// examples below are deliberately fake, not copied contact or vehicle identity.
const fixture = () => ({
  vehicleId: Number(id), queryCarId: Number(id), vehicleType: 'CAR',
  category: {manufacturerName: '재규어', modelName: 'F-PACE', gradeName: '20d 포트폴리오', yearMonth: '201803', formYear: '2018', importType: 'REGULAR_IMPORT'},
  spec: {mileage: 162247, displacement: 1999, transmissionName: '오토', fuelName: '디젤', colorName: '흰색', seatCount: 5, bodyName: 'SUV'},
  advertisement: {price: 950, advertisementType: 'NORMAL', diagnosisCar: true, homeService: true},
  photos: Array.from({length: 32}, (_, i) => ({path: `/carpicture04/pic4194/${id}_${String(32 - i).padStart(3, '0')}.jpg`})),
  options: {standard: ['001','004','005','006','007','008','010','014','015','017','019','020','021','022','023','024','026','027','029','030','031','032','033','035','051','055','056','057','058','059','063','068','072','081','082','083','084','085','094','096','097']},
  condition: {accident: {recordView: true, resumeView: true}, inspection: {formats: ['TABLE']}, seizing: {seizingCount: 0, pledgeCount: 0}},
  contact: {address: '인천 서구 시험로 123'},
});
const html = (base = fixture(), url = `https://fem.encar.com/cars/detail/${id}`) => `<meta property="og:url" content="${url}"><script>__PRELOADED_STATE__ = ${JSON.stringify({cars: {base}})};</script>`;
const jsonResponse = body => new Response(JSON.stringify(body), {headers: {'content-type': 'application/json'}});
const supplements = () => ({
  options: {options: [
    {optionCd: '001', optionTypeCd: '01', optionName: '헤드램프', group: true, subOptions: [
      {optionCd: '029', optionTypeCd: '01', optionName: '헤드램프(HID)', group: false},
      {optionCd: '075', optionTypeCd: '01', optionName: '헤드램프(LED)', group: false},
    ]},
    {optionCd: '001', optionTypeCd: '02', optionName: '브레이크 잠김 방지(ABS)', group: false},
  ]},
  inspection: {vehicleId: Number(id), master: {accdient: false, simpleRepair: false, registrationDate: '2026-04-30T18:10:02'}, inners: [
    {type: {title: '원동기'}, children: [{type: {title: '오일누유'}, statusType: {title: '없음'}, statusItemTypes: [{title: '없음'}, {title: '누유'}]}]},
  ]},
  diagnosis: {vehicleId: Number(id), diagnosisDate: '2026-09-03T00:00:00', items: [{name: 'HOOD', result: '정상', resultCode: 'NORMAL'}]},
});

test('observed Encar fields produce exact KRW, 32 ID-bound photos, ten specs and 41 selected leaf options', () => {
  const detail = parseEncarDetail(parseEncarHtml(html(), id), id, timestamp, supplements());
  assert.equal(detail.id, `encar-${id}`);
  assert.equal(detail.source, 'encar');
  assert.equal(detail.sourceUrl, `https://fem.encar.com/cars/detail/${id}`);
  assert.equal(detail.title, '재규어 F-PACE 20d 포트폴리오');
  assert.equal(detail.price, 9500000);
  assert.equal(detail.photos.length, 32);
  assert.equal(detail.photos[0], `https://ci.encar.com/carpicture04/pic4194/${id}_001.jpg`);
  assert.equal(detail.specs.length, 10);
  assert.deepEqual(detail.specs.find(x => x.label === '주행거리'), {label: '주행거리', value: '162,247km'});
  const options = detail.optionGroups.flatMap(group => group.items);
  assert.equal(options.length, 41);
  for (const value of ['선루프', '헤드램프(HID)', '브레이크 잠김 방지(ABS)', '내비게이션', '후방 카메라', '열선시트(앞좌석)']) assert.ok(options.includes(value));
  assert.ok(!options.some(value => /통풍|헤드램프\(LED\)/.test(value)));
  assert.ok(!options.includes('헤드램프'));
  assert.deepEqual(detail.seller, {businessName: null, region: '인천 서구'});
  assert.equal(detail.description, null);
  assert.equal(detail.fetchedAt, timestamp);
});

test('inspection only uses explicit selected values, checks each vehicle identity and puts diagnosis before detailed rows', () => {
  const supplemental = supplements();
  supplemental.inspection.inners = Array.from({length: 60}, (_, i) => ({type: {title: `점검${i}`}, statusType: {title: '양호'}, statusItemTypes: [{title: '불량'}]}));
  const detail = parseEncarDetail(fixture(), id, timestamp, supplemental);
  const visible = detail.inspection.slice(0, 24);
  assert.ok(visible.some(x => x.label === '성능점검 · 사고이력' && x.value === '없음'));
  assert.ok(visible.some(x => x.label === '성능점검 · 단순수리' && x.value === '없음'));
  assert.ok(visible.some(x => x.label === '엔카진단 · 보닛' && x.value === '정상'));
  assert.ok(!detail.inspection.some(x => x.value === '불량'));
  supplemental.inspection.vehicleId = 123;
  supplemental.diagnosis.vehicleId = 123;
  assert.ok(!parseEncarDetail(fixture(), id, timestamp, supplemental).inspection.some(x => /성능점검 ·|엔카진단 ·/.test(x.label)));
  supplemental.inspection = {vehicleId: Number(id), master: {}, inners: [{type: {title: '원동기'}, statusType: null, statusItemTypes: [{title: '양호'}]}]};
  assert.ok(!parseEncarDetail(fixture(), id, timestamp, supplemental).inspection.some(x => /사고이력|단순수리|점검 · 원동기/.test(x.label)));
});

test('missing, malformed and lease/rent data stay unknown instead of becoming zero, normal or purchase price', () => {
  const base = fixture();
  base.advertisement.advertisementType = 'LEASE';
  base.spec = {mileage: -1, displacement: null, seatCount: '5'};
  base.category.yearMonth = '201899'; base.category.formYear = '';
  base.condition = {}; base.options = {};
  const detail = parseEncarDetail(base, id);
  assert.equal(detail.price, null);
  assert.ok(!detail.specs.some(row => ['주행거리', '배기량', '승차정원', '연식', '최초등록'].includes(row.label)));
  assert.deepEqual(detail.optionGroups, []);
  assert.deepEqual(detail.inspection, []);
  for (const price of [null, '', '950', -1, 0, Infinity, 1.5]) {
    base.advertisement = {advertisementType: 'NORMAL', price};
    assert.equal(parseEncarDetail(base, id).price, null);
  }
});

test('private values and arbitrary source content never escape through normalized detail', () => {
  const base = fixture();
  base.contact.no = '010-0000-0000';
  base.contact.userId = 'PRIVATE-USER';
  base.vehicleNo = '12가3456'; base.vin = 'ABCDEFGHIJKLMNOPQ';
  base.contents = {text: 'PRIVATE DESCRIPTION 010-0000-0000'};
  base.spec.tradeCompanyName = '010-0000-0000';
  base.spec.colorName = 'https://example.invalid/contact';
  base.options.standard.push('999');
  const raw = JSON.stringify(parseEncarDetail(base, id, timestamp, {options: {options: [{optionCd: '999', optionTypeCd: '01', group: false, optionName: 'user@example.invalid'}]}}));
  for (const secret of ['010-0000-0000', 'PRIVATE-USER', '12가3456', 'ABCDEFGHIJKLMNOPQ', 'PRIVATE DESCRIPTION', 'example.invalid', '시험로']) assert.ok(!raw.includes(secret));
});

test('rejects invalid IDs, unrelated JSON identity, source URLs and HTML identities without evaluating scripts', () => {
  for (const value of ['', '0', '001', '../1', '1?x=y', '1#x', 1, '1'.repeat(13)]) {
    assert.equal(isEncarCarId(value), false);
    assert.throws(() => parseEncarDetail(fixture(), value), {code: 'ENCAR_DETAIL_ID'});
  }
  for (const change of [{vehicleId: 42}, {queryCarId: 42}, {vehicleType: 'TRUCK'}, {sourceUrl: `https://evil.invalid/cars/detail/${id}`}]) {
    assert.throws(() => parseEncarDetail({...fixture(), ...change}, id), {code: 'ENCAR_DETAIL_FORMAT'});
  }
  for (const value of [html(fixture(), `https://fem.encar.com.evil.invalid/cars/detail/${id}`), html(fixture(), 'https://fem.encar.com/cars/detail/42'), '<html>login</html>', html().replace(' = {', ' = alert({'), html() + html()]) {
    assert.throws(() => parseEncarHtml(value, id), {code: 'ENCAR_DETAIL_FORMAT'});
  }
});

test('only exact ID photos on the fixed image host survive, with no query, foreign port, credentials or scheme', () => {
  const base = fixture(); const valid = `/carpicture04/pic4194/${id}_001.jpg`;
  base.photos = [valid, {path: valid}, {path: valid}, ...[
    '/carpicture04/pic4194/123_001.jpg', '/carsdata/option_images/option1-1.png',
    `https://ci.encar.com.evil.invalid${valid}`, `http://ci.encar.com${valid}`, `https://user@ci.encar.com${valid}`,
    `https://ci.encar.com:8443${valid}`, `${valid}?url=https://evil.invalid`, `${valid}#private`,
    `javascript:alert(1)`, `data:image/png;base64,AAA`, `//evil.invalid${valid}`, '\\evil.invalid\\x.jpg',
  ].map(path => ({path}))];
  assert.deepEqual(parseEncarDetail(base, id).photos, [`https://ci.encar.com${valid}`]);
});

test('server performs one HTML request then only fixed public optional GETs; an unavailable supplement keeps base information', async () => {
  const requests = [];
  const get = createEncarDetailProvider({fetchImpl: async (url, options) => {
    requests.push({url: new URL(url), options});
    if (url.startsWith('https://fem.encar.com/')) return new Response(html());
    return new Response('unavailable', {status: 407});
  }});
  const detail = await get({id});
  assert.equal(detail.photos.length, 32);
  assert.equal(detail.optionGroups.flatMap(group => group.items).length, 41);
  assert.equal(requests.length, 4);
  assert.equal(requests[0].url.href, `https://fem.encar.com/cars/detail/${id}`);
  for (const {url, options} of requests) {
    assert.ok(['https://fem.encar.com', 'https://api.encar.com'].includes(url.origin));
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit'); assert.equal(options.mode, 'cors');
    assert.deepEqual(Object.keys(options.headers), ['Accept']);
  }
});

test('browser uses readside JSON with native CORS and never requests HTML or credentials', async () => {
  const requested = [];
  const optional = supplements();
  const get = createEncarDetailFetcher({fetchImpl: async (url, options) => {
    requested.push({url, options});
    if (url.includes('?include=')) return jsonResponse(fixture());
    if (url.endsWith('/options/standard')) return jsonResponse(optional.options);
    if (url.includes('/inspection/')) return jsonResponse(optional.inspection);
    return jsonResponse(optional.diagnosis);
  }});
  const detail = await get({id});
  assert.equal(detail.price, 9500000);
  assert.equal(requested.length, 4);
  assert.ok(requested.every(request => request.url.startsWith('https://api.encar.com/v1/readside/')));
  assert.ok(requested.every(request => request.options.mode === 'cors' && request.options.credentials === 'omit'));
  assert.ok(detail.inspection.some(row => row.label === '엔카진단 · 보닛'));
});

test('base HTTP restrictions, JSON/schema errors and CORS failures have no retries or secondary requests', async t => {
  for (const status of [403, 407, 429, 404]) {
    let calls = 0;
    const get = createEncarDetailFetcher({fetchImpl: async () => { calls++; return new Response('restricted', {status}); }});
    await assert.rejects(get({id}), {code: 'ENCAR_DETAIL_HTTP', upstreamStatus: status});
    assert.equal(calls, 1);
  }
  for (const respond of [() => new Response('<html>login</html>'), () => jsonResponse({...fixture(), vehicleId: 999}), () => { throw new TypeError('Failed to fetch'); }]) {
    let calls = 0;
    const get = createEncarDetailFetcher({fetchImpl: async () => { calls++; return respond(); }});
    await assert.rejects(get({id})); assert.equal(calls, 1);
  }
  let calls = 0;
  const get = createEncarDetailFetcher({fetchImpl: async () => { calls++; return jsonResponse(fixture()); }});
  await assert.rejects(get({id: '../41942591'}), {code: 'ENCAR_DETAIL_ID'});
  assert.equal(calls, 0);
});

test('caller cancellation before and during base/enrichment never returns stale data', async () => {
  const pending = (_url, {signal}) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), {once: true}));
  const already = new AbortController(); already.abort(); let calls = 0;
  await assert.rejects(createEncarDetailFetcher({fetchImpl: async () => { calls++; }})({id, signal: already.signal}), {name: 'AbortError'});
  assert.equal(calls, 0);
  for (const duringEnrichment of [false, true]) {
    const controller = new AbortController(); let started;
    const began = new Promise(resolve => { started = resolve; });
    const get = createEncarDetailFetcher({fetchImpl: async (url, options) => {
      if (duringEnrichment && url.includes('?include=')) return jsonResponse(fixture());
      started(); return pending(url, options);
    }});
    const request = get({id, signal: controller.signal});
    await began; controller.abort();
    await assert.rejects(request, {name: 'AbortError'});
  }
});

test('nine-second deadline bounds base and all optional calls using the same budget', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  for (const duringEnrichment of [false, true]) {
    let started, calls = 0;
    const began = new Promise(resolve => { started = resolve; });
    const get = createEncarDetailFetcher({fetchImpl: async (url, {signal}) => {
      calls++;
      if (duringEnrichment && url.includes('?include=')) return jsonResponse(fixture());
      started(); return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), {once: true}));
    }});
    const request = get({id}); await began;
    t.mock.timers.tick(9000);
    if (duringEnrichment) { assert.equal((await request).photos.length, 32); assert.equal(calls, 4); }
    else { await assert.rejects(request, {name: 'TimeoutError'}); assert.equal(calls, 1); }
  }
});

test('2MB declared and streaming limits cancel bodies, including a stalled body on abort', async () => {
  for (const declared of [true, false]) {
    let cancelled = false;
    const body = new ReadableStream({pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); }, cancel() { cancelled = true; }}, {highWaterMark: 0});
    const get = createEncarDetailFetcher({fetchImpl: async () => new Response(body, {headers: declared ? {'content-length': String(2 * 1024 * 1024 + 1)} : {}})});
    await assert.rejects(get({id}), {code: 'ENCAR_DETAIL_SIZE'}); assert.equal(cancelled, true);
  }
  let started, cancelled = false;
  const began = new Promise(resolve => { started = resolve; });
  const get = createEncarDetailFetcher({fetchImpl: async () => new Response(new ReadableStream({pull() { started(); }, cancel() { cancelled = true; }}))});
  const controller = new AbortController(); const request = get({id, signal: controller.signal});
  await began; controller.abort(); await assert.rejects(request, {name: 'AbortError'}); assert.equal(cancelled, true);
  assert.throws(() => parseEncarHtml(' '.repeat(2 * 1024 * 1024 + 1), id), {code: 'ENCAR_DETAIL_SIZE'});
});
