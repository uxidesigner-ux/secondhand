import test from 'node:test';
import assert from 'node:assert/strict';
import {createKcarDetailProvider, isKcarCarId, parseKcarDetail} from '../server/providers/kcar-detail.mjs';

const id = 'EC61424432';
const photo = number => `https://img.kcar.com/carpicture/carpicture02/pic6142/kcar_61424432_${String(number).padStart(3, '0')}.jpg`;
// Small synthetic fixture using the observed public response's field contract.
const fixture = () => ({success: true, data: {
  rvo: {carCd: id, carWhlNm: '현대 그랜저 하이브리드', salprc: 2200, wklyDcPrc: null,
    mfgDt: '202205', regModelyr: '2023', milg: '114196', fuelTypecdNm: '가솔린+전기',
    trnsmsncdNm: '오토', engdispmnt: '2359', carctgr: '대형차', extrColorNm: '흰색',
    drvgYnNm: '전륜', pasngrCnt: '5', rentRegYn: 'N', leseCarYn: '3', mmLeseCharge: '28',
    userCenterName: '영등포직영점', centerRegionnm: '서울', acdtHistComnt: '단순수리',
    vin: 'PRIVATE_VIN', cno: 'PRIVATE_PLATE', selerMpno: 'PRIVATE_PHONE',
    carDtlDesc: 'PRIVATE_FREEFORM_PHONE', usrNm: 'PRIVATE_SELLER', fullAddr: 'PRIVATE_ADDRESS'},
  photoList: [{carCd: id, elanPath: photo(2), sortOrdr: '2'}, {carCd: id, elanPath: photo(1), sortOrdr: '1'}],
  optList: [
    {carCd: id, optnCd: '022', optnNm: '열선시트 : 운전석', optionType: '내장', gneptYn: 'Y'},
    {carCd: id, optnCd: '034', optnNm: '블랙박스', optionType: '편의', gneptYn: 'N'},
  ],
  carhistory: {carCd: id, owncarDmgeAcdtCnt: '1', othrcarWrdgAcdtCnt: '0', gnrlTtlsAcdtCnt: '0',
    ownrChngCnt: '2', rentHistYn: 'Y', iqyDt: '20261003', cno: 'PRIVATE_PLATE'},
  googleAccessToken: 'PRIVATE_TOKEN', memberInfo: {id: 'PRIVATE_MEMBER'},
}});

test('K Car selected vehicle details preserve units, canonical identity and explicit history', () => {
  const result = parseKcarDetail(fixture(), id, '2026-11-02T00:00:00Z');
  assert.equal(result.source, 'kcar');
  assert.equal(result.id, `kcar-${id}`);
  assert.equal(result.sourceUrl, `https://www.kcar.com/bc/detail/carInfoDtl?i_sCarCd=${id}`);
  assert.equal(result.title, '현대 그랜저 하이브리드');
  assert.equal(result.price, 22000000);
  assert.deepEqual(result.photos, [photo(1), photo(2)]);
  const specs = Object.fromEntries(result.specs.map(row => [row.label, row.value]));
  assert.equal(specs['연식'], '2022년 05월식 (2023년형)');
  assert.equal(specs['주행거리'], '114,196km');
  assert.equal(specs['배기량'], '2,359cc');
  assert.equal(specs['승차인원'], '5명');
  const inspection = Object.fromEntries(result.inspection.map(row => [row.label, row.value]));
  assert.equal(inspection['사고진단'], '단순수리');
  assert.equal(inspection['내차 피해 보험이력'], '1건');
  assert.equal(inspection['타차 가해 보험이력'], '0건');
  assert.equal(inspection['소유자변경'], '2회');
  assert.equal(inspection['대여용 사용이력'], '있음');
  assert.equal(inspection['보험이력 조회일'], '2026.10.03');
  assert.equal('침수이력' in inspection, false);
  assert.deepEqual(result.seller, {businessName: '영등포직영점', region: '서울'});
  assert.equal(result.description, null);
  assert.deepEqual(result.highlights, []);
  assert.equal(result.fetchedAt, '2026-11-02T00:00:00Z');
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
});

test('K Car identity and success schema fail closed before an unrelated vehicle can appear', () => {
  for (const valid of ['EC1', 'EC61424432', 'EC123456789012']) assert.equal(isKcarCarId(valid), true);
  for (const invalid of [null, 123, '61424432', 'kcar-EC61424432', 'EC1234567890123', 'EC1/../2', 'ec1', 'EC1?x=1']) {
    assert.equal(isKcarCarId(invalid), false);
    assert.throws(() => parseKcarDetail(fixture(), invalid), {code: 'KCAR_DETAIL_ID'});
  }
  for (const payload of [{}, {success: false, data: fixture().data}, {success: true, data: {rvo: null}},
    {success: true, data: {rvo: {...fixture().data.rvo, carCd: 'EC1'}}},
    {success: true, data: {rvo: {...fixture().data.rvo, carWhlNm: ''}}}]) {
    assert.throws(() => parseKcarDetail(payload, id), {code: 'KCAR_DETAIL_FORMAT'});
  }
});

test('advertised weekly discount takes precedence exactly as the public UI, never monthly lease quotes', () => {
  for (const [discount, expected] of [[2150, 21500000], ['2100.5', 21005000], [0, 22000000], ['', 22000000], [null, 22000000], ['bad', 22000000]]) {
    const payload = fixture(); payload.data.rvo.wklyDcPrc = discount;
    assert.equal(parseKcarDetail(payload, id).price, expected);
  }
  for (const base of [null, '', ' ', 'bad', 0, -1, Number.MAX_SAFE_INTEGER]) {
    const payload = fixture(); payload.data.rvo.salprc = base;
    payload.data.rvo.mmLeseCharge = 28; payload.data.rvo.leseN1 = 300;
    assert.equal(parseKcarDetail(payload, id).price, null);
  }
  const rental = fixture(); rental.data.rvo.rentRegYn = 'Y';
  assert.equal(parseKcarDetail(rental, id).price, null);
});

test('photos retain only exact selected vehicle images and exclude advertisements, reports and unsafe paths', () => {
  const payload = fixture();
  payload.data.photoList.push(
    {carCd: id, elanPath: photo(1), sortOrdr: '4'},
    {carCd: 'EC999', elanPath: photo(3)},
    {carCd: id, elanPath: photo(3).replace('61424432_', '614244320_')},
    {carCd: id, elanPath: 'https://img.kcar.com/ucms/ad.png'},
    {carCd: id, elanPath: 'https://evil.test/carpicture/kcar_61424432_001.jpg'},
    {carCd: id, elanPath: photo(4).replace('https:', 'http:')},
    {carCd: id, elanPath: photo(4).replace('https://', 'https://user:pass@')},
    {carCd: id, elanPath: photo(4).replace('img.kcar.com', 'img.kcar.com:444')},
    {carCd: id, elanPath: photo(4).replace('/carpicture02/', '/reports/')},
    {carCd: id, elanPath: photo(4).replace('kcar_', 'kcarM_')},
  );
  assert.deepEqual(parseKcarDetail(payload, id).photos, [photo(1), photo(2)]);
});

test('installed optList is separate from all-option catalogs and aftermarket flags do not mean absent', () => {
  const payload = fixture();
  payload.data.optList.push(payload.data.optList[0],
    {carCd: 'EC999', optnCd: '123', optnNm: '다른 차량 옵션', optionType: '편의', gneptYn: 'Y'},
    {carCd: id, optnCd: '125', optnNm: '', optionType: '편의', gneptYn: 'Y'},
  );
  payload.data.carOptionList011 = [{carCd: id, optnCd: '999', optnNm: '전체 카탈로그 미선택 옵션', optionType: '외관'}];
  assert.deepEqual(parseKcarDetail(payload, id).optionGroups, [
    {label: '내장', items: ['열선시트 : 운전석']},
    {label: '편의', items: ['블랙박스 (비순정)']},
  ]);
});

test('missing values and a mismatched history remain unknown instead of zero, accident-free or equipped', () => {
  const payload = {success: true, data: {rvo: {carCd: id, carWhlNm: '차량'}, carhistory: {...fixture().data.carhistory, carCd: 'EC999'}}};
  const result = parseKcarDetail(payload, id);
  assert.equal(result.price, null);
  assert.deepEqual(result.specs, []);
  assert.deepEqual(result.inspection, []);
  assert.deepEqual(result.photos, []);
  assert.deepEqual(result.optionGroups, []);
  assert.deepEqual(result.seller, {businessName: null, region: null});
});

test('normalized collections and strings are bounded', () => {
  const payload = fixture();
  payload.data.rvo.carWhlNm = '가'.repeat(500);
  payload.data.photoList = Array.from({length: 300}, (_, i) => ({carCd: id, elanPath: photo(i + 1), sortOrdr: i + 1}));
  payload.data.optList = Array.from({length: 300}, (_, i) => ({carCd: id, optnCd: i, optnNm: '옵션' + i, optionType: '편의'}));
  const result = parseKcarDetail(payload, id);
  assert.equal(result.title.length, 200);
  assert.equal(result.photos.length, 40);
  assert.equal(result.optionGroups[0].items.length, 40);
});

test('provider requests one observed fixed endpoint without auth, redirects or encryption credentials', async () => {
  const calls = [];
  const provider = createKcarDetailProvider({fetchImpl: async (url, options) => {
    calls.push({url: new URL(url), options}); return Response.json(fixture());
  }});
  await assert.rejects(provider({id: '../not-a-car'}), {code: 'KCAR_DETAIL_ID'});
  assert.equal(calls.length, 0);
  const result = await provider({id});
  assert.equal(result.photos.length, 2);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.origin, 'https://api.kcar.com');
  assert.equal(calls[0].url.pathname, '/bc/car-info-detail-of-ng');
  assert.deepEqual(Object.fromEntries(calls[0].url.searchParams), {i_sCarCd: id, i_sPassYn: '', i_sPosYn: '', bltbdKnd: 'CM050'});
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.credentials, 'omit');
  assert.deepEqual(calls[0].options.headers, {Accept: 'application/json'});
});

test('upstream restrictions and HTML challenges fail once with safe errors', async () => {
  for (const status of [302, 403, 407, 429]) {
    let calls = 0;
    const provider = createKcarDetailProvider({fetchImpl: async () => { calls++; return new Response('PRIVATE_BLOCK_BODY', {status}); }});
    await assert.rejects(provider({id}), {code: 'KCAR_DETAIL_HTTP', upstreamStatus: status});
    assert.equal(calls, 1);
  }
  const html = createKcarDetailProvider({fetchImpl: async () => new Response('<html>PRIVATE_LOGIN_PAGE</html>')});
  await assert.rejects(html({id}), {code: 'KCAR_DETAIL_FORMAT'});
  const network = createKcarDetailProvider({fetchImpl: async () => { throw new Error('PRIVATE_NETWORK_URL'); }});
  await assert.rejects(network({id}), {code: 'KCAR_DETAIL_FETCH', message: 'KCAR_DETAIL_FETCH'});
});

test('provider enforces 2MB for declared and streamed bodies', async () => {
  for (const declared of [false, true]) {
    let cancelled = false;
    const provider = createKcarDetailProvider({fetchImpl: async () => new Response(new ReadableStream({
      pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); },
      cancel() { cancelled = true; },
    }, {highWaterMark: 0}), {headers: declared ? {'content-length': String(2 * 1024 * 1024 + 1)} : {}})});
    await assert.rejects(provider({id}), {code: 'KCAR_DETAIL_SIZE'});
    assert.equal(cancelled, true);
  }
});

test('provider cancels a stalled body when the caller leaves detail', async () => {
  let cancelled = false, started;
  const reading = new Promise(resolve => { started = resolve; });
  const provider = createKcarDetailProvider({fetchImpl: async () => new Response(new ReadableStream({
    pull() { started(); }, cancel() { cancelled = true; },
  }))});
  const controller = new AbortController();
  const pending = provider({id, signal: controller.signal});
  await reading; controller.abort();
  await assert.rejects(pending, {name: 'AbortError'});
  assert.equal(cancelled, true);
});
