// Passive adapters for Encar's public detail page/readside JSON. Never evaluate
// source scripts, send credentials, or retain contact, plate, VIN or free text.
const ORIGIN = 'https://fem.encar.com';
const API = 'https://api.encar.com';
const INCLUDE = 'ADVERTISEMENT,CATEGORY,CONDITION,CONTACT,MANAGE,OPTIONS,PHOTOS,SPEC,PARTNERSHIP,CENTER,VIEW';
const MAX_BYTES = 2 * 1024 * 1024;
export const isEncarCarId = id => typeof id === 'string' && /^[1-9]\d{0,11}$/.test(id);
const failure = (code, upstreamStatus = null) => Object.assign(new Error(code), {code, upstreamStatus});
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const abort = signal => { if (signal?.aborted) throw signal.reason || new DOMException('조회가 취소됐어요.', 'AbortError'); };
const privateText = /(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}\b|\b[A-HJ-NPR-Z0-9]{17}\b|\d{2,3}\s*[가-힣]\s*\d{4})/i;
const clean = (value, max = 160) => {
  if (typeof value !== 'string') return '';
  const text = value.replace(/<[^>]*>/g, '').replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim();
  return privateText.test(text) ? '' : Array.from(text).slice(0, max).join('');
};
const whole = (value, max = 10000000) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;
const numberText = value => new Intl.NumberFormat('ko-KR').format(value);
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value) ? value.slice(0, 10) : '';

// Observed 2026-11-02 at /v1/readside/vehicles/car/options/standard.
// Only leaf codes are stored: group IDs collide with unrelated leaf IDs.
const OPTION_NAMES = {"010":["01","선루프"],"029":["01","헤드램프(HID)"],"075":["01","헤드램프(LED)"],"059":["01","파워 전동 트렁크"],"080":["01","고스트 도어 클로징"],"024":["01","전동접이 사이드 미러"],"017":["01","알루미늄 휠"],"062":["01","루프랙"],"082":["01","열선 스티어링 휠"],"083":["01","전동 조절 스티어링 휠"],"084":["01","패들 시프트"],"031":["01","스티어링 휠 리모컨"],"030":["01","ECM 룸미러"],"074":["01","하이패스"],"006":["01","파워 도어록"],"008":["01","파워 스티어링 휠"],"007":["01","파워 윈도우"],"026":["02","에어백(운전석)"],"027":["02","에어백(동승석)"],"020":["02","에어백(사이드)"],"056":["02","에어백(커튼)"],"001":["02","브레이크 잠김 방지(ABS)"],"019":["02","미끄럼 방지(TCS)"],"055":["02","차체자세 제어장치(ESC)"],"033":["02","타이어 공기압센서(TPMS)"],"088":["02","차선이탈 경보 시스템(LDWS)"],"002":["02","전자제어 서스펜션(ECS)"],"085":["02","주차감지센서(전방)"],"032":["02","주차감지센서(후방)"],"086":["02","후측방 경보 시스템"],"058":["02","후방 카메라"],"087":["02","360도 어라운드 뷰"],"068":["03","크루즈 컨트롤(일반)"],"079":["03","크루즈 컨트롤(어댑티브)"],"095":["03","헤드업 디스플레이(HUD)"],"094":["03","전자식 주차브레이크(EPB)"],"023":["03","자동 에어컨"],"057":["03","스마트키"],"015":["03","무선도어 잠금장치"],"081":["03","레인센서"],"097":["03","오토 라이트"],"092":["03","커튼/블라인드(뒷좌석)"],"093":["03","커튼/블라인드(후방)"],"005":["03","내비게이션"],"004":["03","앞좌석 AV 모니터"],"054":["03","뒷좌석 AV 모니터"],"096":["03","블루투스"],"003":["03","CD 플레이어"],"072":["03","USB 단자"],"071":["03","AUX 단자"],"014":["04","가죽시트"],"021":["04","전동시트(운전석)"],"035":["04","전동시트(동승석)"],"089":["04","전동시트(뒷좌석)"],"022":["04","열선시트(앞좌석)"],"063":["04","열선시트(뒷좌석)"],"051":["04","메모리 시트(운전석)"],"078":["04","메모리 시트(동승석)"],"034":["04","통풍시트(운전석)"],"077":["04","통풍시트(동승석)"],"090":["04","통풍시트(뒷좌석)"],"091":["04","마사지 시트"]};
const GROUPS = {'01': '외관/내장', '02': '안전', '03': '편의/멀티미디어', '04': '시트'};
const PANELS = {FRONT_DOOR_LEFT: '앞 도어(좌)', BACK_DOOR_LEFT: '뒤 도어(좌)', TRUNK_LID: '트렁크', BACK_DOOR_RIGHT: '뒤 도어(우)', FRONT_DOOR_RIGHT: '앞 도어(우)', HOOD: '보닛', FRONT_FENDER_RIGHT: '앞 펜더(우)', FRONT_FENDER_LEFT: '앞 펜더(좌)'};

function identity(value, id) {
  return object(value) && String(value.vehicleId) === id
    && (value.queryCarId === undefined || String(value.queryCarId) === id);
}
function listingUrl(value, id) {
  try {
    const url = new URL(value);
    return url.origin === ORIGIN && !url.username && !url.password && !url.port
      && url.pathname === `/cars/detail/${id}` && !url.search && !url.hash;
  } catch { return false; }
}
function photosFor(photos, id) {
  if (!Array.isArray(photos)) return [];
  const allowed = new RegExp(`^/carpicture\\d+/pic\\d+/${id}_\\d+\\.(?:jpe?g|png|webp)$`, 'i');
  return [...new Set(photos.slice(0, 200).flatMap(photo => {
    if (!object(photo) || typeof photo.path !== 'string' || /[\\\p{Cc}\p{Cf}]/u.test(photo.path)) return [];
    try {
      const url = new URL(photo.path, 'https://ci.encar.com');
      if (url.origin !== 'https://ci.encar.com' || url.username || url.password || url.port
        || url.search || url.hash || !allowed.test(url.pathname)) return [];
      return [url.href];
    } catch { return []; }
  }))].sort((a, b) => Number(a.match(/_(\d+)\./)?.[1]) - Number(b.match(/_(\d+)\./)?.[1])).slice(0, 40);
}
function selectedOptions(codes, dictionary) {
  const known = new Map(Object.entries(OPTION_NAMES));
  // A live dictionary may add new leaf codes, but never replace its labels with
  // group headings or infer that every child of a selected group is present.
  const walk = (nodes, depth = 0) => {
    if (!Array.isArray(nodes) || depth > 4) return;
    for (const node of nodes.slice(0, 200)) {
      if (!object(node)) continue;
      const name = clean(node.optionName, 100);
      if (node.group === false && /^\d{3}$/.test(node.optionCd) && GROUPS[node.optionTypeCd] && name) known.set(node.optionCd, [node.optionTypeCd, name]);
      walk(node.subOptions, depth + 1);
    }
  };
  walk(dictionary?.options);
  const selected = new Set(Array.isArray(codes) ? codes.filter(code => typeof code === 'string' && /^\d{3}$/.test(code)).slice(0, 200) : []);
  return Object.entries(GROUPS).flatMap(([group, label]) => {
    const items = [...known].filter(([code, [type]]) => type === group && selected.has(code)).map(([, [, name]]) => name);
    return items.length ? [{label, items: [...new Set(items)]}] : [];
  });
}
function inspectionFor(base, supplemental, id) {
  const result = [], detailed = [], put = (label, value) => { if (value) result.push({label, value}); };
  const accident = base.condition?.accident;
  if (accident?.recordView === true || accident?.resumeView === true) put('보험이력', '원문에서 조회 제공');
  if (base.condition?.inspection?.formats?.length) put('성능점검기록부', '원문에서 조회 제공');
  for (const [key, label] of [['seizingCount', '압류'], ['pledgeCount', '저당']]) {
    const value = base.condition?.seizing?.[key];
    if (whole(value, 10000)) put(label, `${numberText(value)}건`);
  }
  const report = supplemental?.inspection;
  if (identity(report, id)) {
    const master = report.master;
    if (typeof master?.accdient === 'boolean') put('성능점검 · 사고이력', master.accdient ? '있음' : '없음');
    if (typeof master?.simpleRepair === 'boolean') put('성능점검 · 단순수리', master.simpleRepair ? '있음' : '없음');
    put('성능점검 · 등록일', date(master?.registrationDate));
    // statusItemTypes is the list of all possible answers, NOT selected status.
    const visit = (nodes, parents = [], depth = 0) => {
      if (!Array.isArray(nodes) || depth > 4) return;
      for (const node of nodes.slice(0, 100)) {
        const title = clean(node?.type?.title, 45), status = clean(node?.statusType?.title, 80);
        if (!title) continue;
        const path = [...parents, title];
        if (status && detailed.length < 48) detailed.push({label: `점검 · ${path.join(' / ').slice(0, 90)}`, value: status});
        visit(node.children, path, depth + 1);
      }
    };
    visit(report.inners);
  }
  const diagnosis = supplemental?.diagnosis;
  if (identity(diagnosis, id)) {
    put('엔카진단 · 진단일', date(diagnosis.diagnosisDate));
    for (const item of (Array.isArray(diagnosis.items) ? diagnosis.items : []).slice(0, 100)) {
      if (PANELS[item?.name]) put(`엔카진단 · ${PANELS[item.name]}`, clean(item.result, 80));
    }
  }
  // Keep explicit accident/diagnosis findings ahead of the long mechanical list,
  // so a renderer limiting the number of rows retains the important summary.
  return [...result, ...detailed].slice(0, 80);
}

export function parseEncarDetail(base, id, fetchedAt = new Date().toISOString(), supplemental = {}) {
  if (!isEncarCarId(id)) throw failure('ENCAR_DETAIL_ID');
  if (!identity(base, id) || base.vehicleType !== 'CAR' || !object(base.category) || !object(base.spec)) throw failure('ENCAR_DETAIL_FORMAT');
  if (base.sourceUrl !== undefined && !listingUrl(base.sourceUrl, id)) throw failure('ENCAR_DETAIL_FORMAT');
  const category = base.category, spec = base.spec, advertisement = base.advertisement;
  const title = [category.manufacturerName, category.modelName, category.gradeName, category.gradeDetailName].map(value => clean(value, 80)).filter(Boolean).join(' ').slice(0, 200);
  if (!title) throw failure('ENCAR_DETAIL_FORMAT');
  const specs = [], put = (label, value) => { if (value) specs.push({label, value}); };
  if (/^(?:19|20)\d{2}$/.test(String(category.formYear))) put('연식', `${category.formYear}년`);
  if (/^(?:19|20)\d{2}(?:0[1-9]|1[0-2])$/.test(String(category.yearMonth))) put('최초등록', `${String(category.yearMonth).slice(0, 4)}년 ${String(category.yearMonth).slice(4)}월`);
  if (whole(spec.mileage)) put('주행거리', `${numberText(spec.mileage)}km`);
  for (const [key, label] of [['fuelName', '연료'], ['transmissionName', '변속기'], ['colorName', '색상'], ['bodyName', '차종']]) put(label, clean(spec[key], 60));
  if (whole(spec.displacement, 50000) && spec.displacement > 0) put('배기량', `${numberText(spec.displacement)}cc`);
  if (whole(spec.seatCount, 100) && spec.seatCount > 0) put('승차정원', `${spec.seatCount}명`);
  if (category.importType === 'REGULAR_IMPORT') put('수입구분', '정식수입');
  const price = advertisement?.advertisementType === 'NORMAL' && whole(advertisement.price, 1000000) && advertisement.price > 0
    ? advertisement.price * 10000 : null;
  const highlights = [];
  if (advertisement?.diagnosisCar === true) highlights.push('엔카진단 제공');
  if (advertisement?.homeService === true) highlights.push('엔카 홈서비스 대상');
  if (advertisement?.encarCheck === true) highlights.push('엔카체크 대상');
  const coarseAddress = typeof base.contact?.address === 'string'
    ? base.contact.address.match(/^([가-힣]+)(?:\s+([가-힣]+(?:시|군|구)))?(?:\s+([가-힣]+(?:시|군|구)))?/)?.[0] : '';
  return {
    source: 'encar', id: `encar-${id}`, sourceUrl: `${ORIGIN}/cars/detail/${id}`, title, price,
    photos: photosFor(base.photos, id), specs,
    optionGroups: selectedOptions(base.options?.standard, supplemental.options),
    highlights, inspection: inspectionFor(base, supplemental, id),
    seller: {businessName: clean(spec.tradeCompanyName, 100) || null, region: clean(coarseAddress, 80) || null},
    description: null, fetchedAt,
  };
}

export function parseEncarHtml(html, id) {
  if (!isEncarCarId(id)) throw failure('ENCAR_DETAIL_ID');
  if (typeof html !== 'string' || new TextEncoder().encode(html).length > MAX_BYTES) throw failure('ENCAR_DETAIL_SIZE');
  let pageConfirmed = false;
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = Object.fromEntries([...match[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(attr => [attr[1].toLowerCase(), attr[2] ?? attr[3]]));
    if (attrs.property !== 'og:url') continue;
    if (!listingUrl(attrs.content, id)) throw failure('ENCAR_DETAIL_FORMAT');
    pageConfirmed = true;
  }
  if (!pageConfirmed) throw failure('ENCAR_DETAIL_FORMAT');
  let base;
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    const assignment = match[1].match(/^\s*(?:window\.)?__PRELOADED_STATE__\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
    if (!assignment) continue;
    if (base !== undefined) throw failure('ENCAR_DETAIL_FORMAT');
    try { base = JSON.parse(assignment[1])?.cars?.base; } catch { throw failure('ENCAR_DETAIL_FORMAT'); }
  }
  if (!identity(base, id)) throw failure('ENCAR_DETAIL_FORMAT');
  return base;
}

async function readBounded(response, signal, budget) {
  if (Number(response.headers.get('content-length')) > MAX_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw failure('ENCAR_DETAIL_SIZE');
  }
  const reader = response.body?.getReader();
  if (!reader) throw failure('ENCAR_DETAIL_FORMAT');
  const chunks = []; let size = 0, completed = false;
  const onAbort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', onAbort, {once: true});
  try {
    while (true) {
      abort(signal);
      const {value, done} = await reader.read();
      abort(signal);
      if (done) { completed = true; break; }
      size += value.byteLength; budget.bytes += value.byteLength;
      if (size > MAX_BYTES || budget.bytes > MAX_BYTES) throw failure('ENCAR_DETAIL_SIZE');
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
    if (!completed) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}

export function createEncarDetailFetcher({fetchImpl = globalThis.fetch, format = 'json'} = {}) {
  return async function getDetail({id, signal} = {}) {
    if (!isEncarCarId(id)) throw failure('ENCAR_DETAIL_ID');
    abort(signal);
    const controller = new AbortController();
    const onAbort = () => controller.abort(signal.reason);
    signal?.addEventListener('abort', onAbort, {once: true});
    const timer = setTimeout(() => controller.abort(new DOMException('엔카 상세 조회 시간이 초과됐어요.', 'TimeoutError')), 9000);
    const budget = {bytes: 0};
    const get = async (url, html = false) => {
      abort(controller.signal);
      const response = await fetchImpl(url, {method: 'GET', headers: {Accept: html ? 'text/html' : 'application/json'}, credentials: 'omit', mode: 'cors', redirect: 'error', signal: controller.signal});
      abort(controller.signal);
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw failure('ENCAR_DETAIL_HTTP', response.status);
      }
      const body = await readBounded(response, controller.signal, budget);
      abort(controller.signal);
      if (html) return parseEncarHtml(body, id);
      try { return JSON.parse(body); } catch { throw failure('ENCAR_DETAIL_FORMAT'); }
    };
    try {
      const base = await get(format === 'html' ? `${ORIGIN}/cars/detail/${id}` : `${API}/v1/readside/vehicle/${id}?include=${INCLUDE}`, format === 'html');
      // Reject unrelated base payloads before making any optional calls.
      parseEncarDetail(base, id);
      const names = ['options', 'inspection', 'diagnosis'];
      const paths = ['/v1/readside/vehicles/car/options/standard', `/v1/readside/inspection/vehicle/${id}`, `/v1/readside/diagnosis/vehicle/${id}`];
      const results = await Promise.allSettled(paths.map(path => get(`${API}${path}`)));
      abort(signal); // Parent cancellation must never return stale base data.
      const supplemental = {};
      results.forEach((result, index) => { if (result.status === 'fulfilled') supplemental[names[index]] = result.value; });
      return parseEncarDetail(base, id, new Date().toISOString(), supplemental);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  };
}

/** Native CORS only, no cookies or auth headers; callers must guard fallback. */
export const fetchEncarDetailInBrowser = createEncarDetailFetcher();
