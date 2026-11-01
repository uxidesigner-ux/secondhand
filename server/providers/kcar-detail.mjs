// Observed in K Car's public detail client (2026-11-02):
// https://www.kcar.com/_nuxt/2fc7136.js, carInfoSearch/searchCondition.
const API_URL = 'https://api.kcar.com/bc/car-info-detail-of-ng';
const MAX_BYTES = 2 * 1024 * 1024;
const OPTION_GROUPS = ['외관', '내장', '안전', '편의'];
export const isKcarCarId = id => typeof id === 'string' && /^EC\d{1,12}$/.test(id);
const failure = (code, upstreamStatus = null) => Object.assign(new Error(code), {code, upstreamStatus});
const clean = (value, limit = 160) => typeof value === 'string' ? value
  .replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit) : '';
const integer = value => (typeof value === 'number' || typeof value === 'string')
  && /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
const won = value => {
  if (!(typeof value === 'number' || typeof value === 'string') || !/^\d+(?:\.\d{1,4})?$/.test(String(value))) return null;
  const price = Math.round(Number(value) * 10000);
  return Number.isSafeInteger(price) && price > 0 ? price : null;
};
const numberText = number => number.toLocaleString('ko-KR');

function photosFor(rows, id) {
  if (!Array.isArray(rows)) return [];
  const file = new RegExp(`^/carpicture/carpicture\\d+/pic\\d+/kcar_${id.slice(2)}_\\d+\\.(?:jpe?g|png|webp)$`, 'i');
  const ordered = rows.slice(0, 200).filter(row => row?.carCd === id)
    .sort((a, b) => (integer(a.sortOrdr) ?? Infinity) - (integer(b.sortOrdr) ?? Infinity));
  const photos = new Set();
  for (const row of ordered) {
    try {
      const url = new URL(row.elanPath);
      if (url.origin !== 'https://img.kcar.com' || url.username || url.password || url.port || !file.test(url.pathname)) continue;
      url.search = ''; url.hash = '';
      photos.add(url.href);
    } catch { /* A banner, another car or a malformed image is not a vehicle photo. */ }
    if (photos.size >= 40) break;
  }
  return [...photos];
}

function installedOptions(rows, id) {
  if (!Array.isArray(rows)) return [];
  const groups = new Map(OPTION_GROUPS.map(label => [label, new Set()]));
  // optList is the selected vehicle's installed-option list in the public UI.
  // gneptYn is OEM status, NOT an installed/selected flag (N means aftermarket).
  for (const row of rows.slice(0, 300)) {
    if (row?.carCd !== id || !/^\d{1,5}$/.test(String(row.optnCd)) || !groups.has(row.optionType)) continue;
    const name = clean(row.optnNm || row.optioncdName);
    const group = groups.get(row.optionType);
    if (name && group.size < 40) group.add(`${name}${row.gneptYn === 'N' ? ' (비순정)' : ''}`);
  }
  return [...groups].filter(([, items]) => items.size).map(([label, items]) => ({label, items: [...items]}));
}

/** Observed anonymous K Car response; retain only selected vehicle facts. */
export function parseKcarDetail(payload, id, fetchedAt = new Date().toISOString()) {
  if (!isKcarCarId(id)) throw failure('KCAR_DETAIL_ID');
  const data = payload?.data, vehicle = data?.rvo;
  if (payload?.success !== true || !vehicle || vehicle.carCd !== id) throw failure('KCAR_DETAIL_FORMAT');
  const title = clean(vehicle.carWhlNm, 200);
  if (!title) throw failure('KCAR_DETAIL_FORMAT');
  // The detail UI displays wklyDcPrc when present, otherwise salprc, in 만원.
  // No separate discount flag/expiry predicate is used in that displayed price.
  // Never use a monthly
  // financing/rental quote such as mmLeseCharge, leseN*, or installment values.
  const price = vehicle.rentRegYn === 'Y' ? null : won(vehicle.wklyDcPrc) ?? won(vehicle.salprc);
  const specs = [];
  const add = (label, value) => { if (value) specs.push({label, value}); };
  const registration = /^(19\d{2}|20\d{2})(0[1-9]|1[0-2])$/.exec(String(vehicle.mfgDt));
  const modelYear = /^(19\d{2}|20\d{2})$/.test(String(vehicle.regModelyr)) ? String(vehicle.regModelyr) : '';
  add('연식', registration ? `${registration[1]}년 ${registration[2]}월식${modelYear && modelYear !== registration[1] ? ` (${modelYear}년형)` : ''}` : modelYear ? `${modelYear}년형` : '');
  const mileage = integer(vehicle.milg), displacement = integer(vehicle.engdispmnt), seats = integer(vehicle.pasngrCnt);
  add('주행거리', mileage !== null ? `${numberText(mileage)}km` : '');
  for (const [label, key] of [['연료', 'fuelTypecdNm'], ['변속기', 'trnsmsncdNm'], ['차종', 'carctgr'], ['차량색상', 'extrColorNm'], ['구동방식', 'drvgYnNm']]) add(label, clean(vehicle[key]));
  add('배기량', displacement !== null && displacement > 0 ? `${numberText(displacement)}cc` : '');
  add('승차인원', seats !== null && seats > 0 && seats < 100 ? `${seats}명` : '');

  const inspection = [];
  const diagnosis = clean(vehicle.acdtHistComnt);
  if (diagnosis) inspection.push({label: '사고진단', value: diagnosis});
  const history = data.carhistory?.carCd === id ? data.carhistory : null;
  if (history) {
    for (const [label, key, unit] of [
      ['내차 피해 보험이력', 'owncarDmgeAcdtCnt', '건'], ['타차 가해 보험이력', 'othrcarWrdgAcdtCnt', '건'],
      ['전손이력', 'gnrlTtlsAcdtCnt', '건'], ['도난이력', 'rbrTtlsAcdtCnt', '건'],
      ['침수이력', 'fldgAcdtCnt', '건'], ['소유자변경', 'ownrChngCnt', '회'],
    ]) {
      const count = integer(history[key]);
      if (count !== null) inspection.push({label, value: `${numberText(count)}${unit}`});
    }
    for (const [label, key] of [['대여용 사용이력', 'rentHistYn'], ['영업용 사용이력', 'bizuseHistYn'], ['관용 사용이력', 'instnHistYn']]) {
      if (['Y', 'N'].includes(history[key])) inspection.push({label, value: history[key] === 'Y' ? '있음' : '없음'});
    }
    const checked = /^(\d{4})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.exec(String(history.iqyDt));
    if (checked) inspection.push({label: '보험이력 조회일', value: `${checked[1]}.${checked[2]}.${checked[3]}`});
  }
  return {
    source: 'kcar', id: `kcar-${id}`, sourceUrl: `https://www.kcar.com/bc/detail/carInfoDtl?i_sCarCd=${id}`,
    title, price, photos: photosFor(data.photoList, id), specs, inspection,
    optionGroups: installedOptions(data.optList, id), highlights: [],
    seller: {businessName: clean(vehicle.userCenterName || vehicle.cntrNm, 100) || null, region: clean(vehicle.centerRegionnm, 100) || null},
    // Free-form seller/inspection prose can contain contact, plate or VIN data.
    description: null, fetchedAt,
  };
}

async function readBounded(response, signal) {
  if (Number(response.headers.get('content-length')) > MAX_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw failure('KCAR_DETAIL_SIZE');
  }
  const reader = response.body?.getReader();
  if (!reader) throw failure('KCAR_DETAIL_FORMAT');
  const chunks = [];
  let size = 0, completed = false;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, {once: true});
  try {
    while (true) {
      signal.throwIfAborted();
      const {value, done} = await reader.read();
      signal.throwIfAborted();
      if (done) { completed = true; break; }
      size += value.byteLength;
      if (size > MAX_BYTES) throw failure('KCAR_DETAIL_SIZE');
      chunks.push(value);
    }
    return Buffer.concat(chunks, size).toString('utf8');
  } finally {
    signal.removeEventListener('abort', abort);
    if (!completed) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function createKcarDetailProvider({fetchImpl = globalThis.fetch} = {}) {
  return async function getKcarDetail({id, signal} = {}) {
    if (!isKcarCarId(id)) throw failure('KCAR_DETAIL_ID');
    const boundedSignal = AbortSignal.any([AbortSignal.timeout(9000), ...(signal ? [signal] : [])]);
    boundedSignal.throwIfAborted();
    // These exact parameters are published in K Car's carInfoSearch/searchCondition.
    const url = new URL(API_URL);
    for (const [key, value] of Object.entries({i_sCarCd: id, i_sPassYn: '', i_sPosYn: '', bltbdKnd: 'CM050'})) url.searchParams.set(key, value);
    try {
      const response = await fetchImpl(url, {method: 'GET', redirect: 'error', credentials: 'omit', signal: boundedSignal, headers: {Accept: 'application/json'}});
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw failure('KCAR_DETAIL_HTTP', response.status);
      }
      const text = await readBounded(response, boundedSignal);
      let payload;
      try { payload = JSON.parse(text); } catch { throw failure('KCAR_DETAIL_FORMAT'); }
      return parseKcarDetail(payload, id);
    } catch (error) {
      boundedSignal.throwIfAborted();
      if (/^KCAR_DETAIL_(?:ID|SIZE|FORMAT|HTTP)$/.test(error?.code)) throw error;
      throw failure('KCAR_DETAIL_FETCH');
    }
  };
}
export const getKcarDetail = createKcarDetailProvider();
