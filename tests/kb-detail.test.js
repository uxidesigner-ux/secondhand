import test from 'node:test';
import assert from 'node:assert/strict';
import {createKbDetailProvider, isKbCarId, parseKbDetail} from '../server/providers/kb-detail.mjs';
import {createDetailHandler} from '../server/detail-handler.mjs';

const id = '28882930';
const url = `https://www.kbchachacha.com/public/car/detail.kbc?carSeq=${id}`;
const photo = `https://img.kbchachacha.com/IMG/carimg/l/img08/img2888/${id}_1.jpeg`;
const product = { '@type': 'Product', name: '재규어 All New XF 2.0d Prestige (2018년형)', image: [photo, photo, 'https://img.kbchachacha.com/IMG/carimg/999_1.jpeg', 'https://example.com/28882930_2.jpeg', 'javascript:alert(1)'], offers: {url, price: '8500000', priceCurrency: 'KRW'}};
const html = `<!doctype html>
<meta property="og:url" content="https://m.kbchachacha.com/public/web/car/detail.kbc?carSeq=${id}">
<script>globalThis.__kbDetailExecuted = true;</script>
<script type="application/ld+json">${JSON.stringify({'@graph': [{'@type': 'Product', name: '추천 차량', offers: {url: url.replace(id, '999')}}, product]})}</script>
<div class="car-detail-info"><table class="detail-info-table">
<tr><th>차량정보</th><td>12가3456</td><th>연식</th><td>18년03월(18년형)</td></tr>
<tr><th>주행거리</th><td>70,346km</td><th>연료</th><td>디젤</td></tr>
<tr><th>연비</th><td>정보없음</td><th>압류</th><td><strong>없음</strong></td></tr>
</table><div class="detail-info02">
<span id="btnCarHistoryView2">사고있음</span><dl><dt>전손이력</dt><dd>없음</dd><dt>침수이력</dt><dd>없음</dd></dl>
<span>보험사고정보 조회일자 : 2026.10.26</span>
<span id="btnCarCheckView2" data-link-url="https://external.example/report?checkNum=private-token">내역보기</span>
</div></div>
<a id="btnCarHistoryView1"><span class="vs-pill__label">보험이력</span><span class="vs-pill__value">4건</span></a>
<div class="car-option"><ul class="car-option-list">
<li class="option1"><span>내비게이션</span><strong>(순정)</strong></li>
<li class="option6"><span>통풍시트</span>(<span>운전석</span><span class="disable">동승석</span>)</li>
<li class="option4 disable">헤드램프 (LED)</li><li class="option_more">전체보기</li>
</ul></div>
<div id="divSellerInfo"><div class="dealer-location"><div class="map-txt"><p>상사명 : 블루오토</p><p>주소 : 경기 수원시 권선구 비공개로 123</p></div></div><div class="dealer-info">홍길동 010-1234-5678</div></div>
<div class="etc-sec01"><div><span>차체/일반 (100,000km / 3년)</span><div class="box-txt">보증종료 / 보증종료</div></div></div>
<div class="generic-popup">무사고 보증 가입 완료</div>
<div class="related-cars"><table><tr><th>연료</th><td>전기</td></tr></table><li class="option1">추천 차량 옵션</li></div>`;

test('selected KB Product and scoped sections exclude related vehicles and personal/report data', () => {
  const detail = parseKbDetail(html, id, '2026-11-01T00:00:00.000Z');
  assert.equal(detail.id, `kb-${id}`);
  assert.equal(detail.sourceUrl, url);
  assert.equal(detail.title, product.name);
  assert.equal(detail.price, 8500000);
  assert.deepEqual(detail.photos, [photo]);
  assert.deepEqual(detail.specs, [{label: '연식', value: '18년03월(18년형)'}, {label: '주행거리', value: '70,346km'}, {label: '연료', value: '디젤'}, {label: '연비', value: '정보없음'}, {label: '압류', value: '없음'}]);
  assert.deepEqual(detail.seller, {businessName: '블루오토', region: '경기 수원시 권선구'});
  assert.equal(detail.description, null);
  assert.deepEqual(detail.highlights, []);
  assert.equal(globalThis.__kbDetailExecuted, undefined);
  assert.doesNotMatch(JSON.stringify(detail), /12가3456|010-1234-5678|홍길동|비공개로|private-token|추천 차량|무사고/);
});

test('options include only enabled main items and enabled sub-options', () => {
  const detail = parseKbDetail(html, id);
  assert.deepEqual(detail.optionGroups, [{label: '주요옵션', items: ['내비게이션 (순정)', '통풍시트 (운전석)']}]);
  assert.ok(detail.inspection.some(row => row.label === '보험이력' && row.value === '4건'));
  assert.ok(detail.inspection.some(row => row.label === '보험사고정보' && row.value === '사고있음'));
  assert.ok(detail.inspection.some(row => row.label === '보험사고정보 조회일자' && row.value === '2026.10.26'));
  assert.ok(detail.inspection.some(row => row.label.startsWith('제조사 보증') && row.value === '보증종료 / 보증종료'));
});

test('missing sections and prices remain unknown, never inferred absent or equipped', () => {
  const minimal = `<script type="application/ld+json">${JSON.stringify({...product, image: [], offers: {...product.offers, price: '문의'}})}</script>`;
  const detail = parseKbDetail(minimal, id);
  assert.equal(detail.price, null);
  assert.deepEqual(detail.specs, []);
  assert.deepEqual(detail.optionGroups, []);
  assert.deepEqual(detail.inspection, []);
  assert.deepEqual(detail.seller, {businessName: null, region: null});
});

test('mismatched and invalid vehicle identities fail closed', () => {
  assert.throws(() => parseKbDetail(html, '999'), {code: 'KB_DETAIL_FORMAT'});
  assert.throws(() => parseKbDetail('<script>not structured data</script>', id), {code: 'KB_DETAIL_FORMAT'});
  for (const invalid of ['', '0', '0123', '../28882930', '28882930&x=1', 'https://example.com', '1234567890123', 28882930]) assert.equal(isKbCarId(invalid), false);
});

test('provider requests exactly one fixed official URL with redirects disabled', async () => {
  let calls = 0;
  const get = createKbDetailProvider({fetchImpl: async (requestedUrl, options) => {
    calls++;
    assert.equal(requestedUrl, url);
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.deepEqual(options.headers, {Accept: 'text/html'});
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(html, {headers: {'Content-Type': 'text/html'}});
  }});
  assert.equal((await get({id})).price, 8500000);
  assert.equal(calls, 1);
  await assert.rejects(get({id: `${id}&url=https://example.com`}), {code: 'KB_DETAIL_ID'});
  assert.equal(calls, 1);
});

test('upstream restriction is reported once without retry', async () => {
  let calls = 0;
  const get = createKbDetailProvider({fetchImpl: async () => { calls++; return new Response('restricted', {status: 403}); }});
  await assert.rejects(get({id}), {code: 'KB_DETAIL_HTTP', upstreamStatus: 403});
  assert.equal(calls, 1);
});

test('provider enforces 2MB for declared and streamed bodies', async () => {
  const oversized = createKbDetailProvider({fetchImpl: async () => new Response('small', {headers: {'content-length': String(2 * 1024 * 1024 + 1)}})});
  await assert.rejects(oversized({id}), {code: 'KB_DETAIL_SIZE'});
  const streamed = createKbDetailProvider({fetchImpl: async () => new Response(new Uint8Array(2 * 1024 * 1024 + 1))});
  await assert.rejects(streamed({id}), {code: 'KB_DETAIL_SIZE'});
});

test('provider cancels a pending body when caller aborts', async () => {
  let cancelled = false;
  const get = createKbDetailProvider({fetchImpl: async () => new Response(new ReadableStream({cancel() { cancelled = true; }}))});
  const controller = new AbortController();
  const pending = get({id, signal: controller.signal});
  const timer = setTimeout(() => controller.abort(), 10);
  await assert.rejects(pending, {name: 'AbortError'});
  clearTimeout(timer);
  assert.equal(cancelled, true);
});

test('detail handler validates method/source/id before fetching and supports preflight', async () => {
  let calls = 0;
  const handler = createDetailHandler({getKbDetail: async () => { calls++; return {}; }});
  const request = (query, method = 'GET') => new Request(`https://used.example/api/detail?${query}`, {method});
  assert.equal((await handler(request(`source=kb&id=${id}`, 'POST'))).status, 405);
  assert.equal((await handler(request('', 'OPTIONS'))).status, 204);
  for (const query of [`source=encar&id=${id}`, `source=kb&id=kb-${id}`, `source=kb&id=${id}&id=9`, `source=kb&source=kb&id=${id}`, `source=kb&id=${id}%26x%3D1`]) assert.equal((await handler(request(query))).status, 400);
  assert.equal(calls, 0);
});

test('handler returns wrapped detail with CORS/cache and forwards bounded request signal', async () => {
  const detail = parseKbDetail(html, id);
  const handler = createDetailHandler({getKbDetail: async input => { assert.equal(input.id, id); assert.ok(input.signal instanceof AbortSignal); return detail; }});
  const response = await handler(new Request(`https://used.example/api/detail?source=kb&id=${id}`));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.match(response.headers.get('Cache-Control'), /s-maxage=60/);
  assert.deepEqual(await response.json(), {detail});
});

test('handler sanitizes upstream failures and logs only safe status metadata', async t => {
  const logs = [];
  t.mock.method(console, 'error', value => logs.push(value));
  for (const [upstreamStatus, expectedStatus] of [[403, 503], [407, 503], [429, 503], [404, 404], [410, 404], [500, 502], [null, 502]]) {
    const handler = createDetailHandler({getKbDetail: async () => { throw Object.assign(new Error('private-token seller phone'), {upstreamStatus, name: 'private-name'}); }});
    const response = await handler(new Request(`https://used.example/api/detail?source=kb&id=${id}`));
    assert.equal(response.status, expectedStatus);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.doesNotMatch(JSON.stringify(await response.json()), /private-token|seller phone|private-name/);
  }
  assert.doesNotMatch(logs.join(''), /28882930|private-token|seller phone|private-name|https:/);
  assert.equal(JSON.parse(logs[1]).upstreamStatus, 407);
});
