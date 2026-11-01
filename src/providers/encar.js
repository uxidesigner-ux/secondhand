/** Encar's anonymous public keyword search. Browser requests use the endpoint's
 * CORS policy with the browser's real Origin; no credentials or proxy are used. */
const ENCAR_API = 'https://api.encar.com/search/car/list/mobile';
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const fuels = { '가솔린': 'gasoline', '디젤': 'diesel', '가솔린+전기': 'hybrid', '디젤+전기': 'hybrid', '전기': 'electric', 'LPG': 'lpg', 'LPG(일반인 구입)': 'lpg', 'LPG+전기': 'hybrid' };
const text = value => typeof value === 'string' ? value.trim() : '';
const boundedLimit = limit => Math.max(1, Math.min(40, Math.floor(Number(limit) || 24)));
const responseError = (message, stage) => Object.assign(new Error(message), {stage});
const throwIfAborted = signal => { if (signal?.aborted) throw signal.reason || new DOMException('검색이 취소됐어요.', 'AbortError'); };

export function buildEncarUrl(query = '', limit = 24) {
  // Prevent user text from becoming a facet expression. Spaces remain keyword text.
  const term = String(query).normalize('NFKC').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (String(query).trim() && !term) throw new Error('검색어에 문자 또는 숫자를 입력해 주세요.');
  const url = new URL(ENCAR_API);
  url.searchParams.set('count', 'true');
  url.searchParams.set('q', term ? `(And.Hidden.N._.CarType.A._.Search.keyword(${term}).)` : '(And.Hidden.N._.CarType.A.)');
  url.searchParams.set('sr', `|MobileModifiedDate|0|${boundedLimit(limit)}`);
  return url;
}

export function normalizeEncarCar(car, collectedAt = new Date().toISOString()) {
  if (!car || !/^\d+$/.test(String(car.Id))) return null;
  // Lease/rental headline prices are not comparable to a cash purchase price.
  if (car.Lease === '1' || (car.SellType && car.SellType !== '일반')) return null;
  const price = Math.round(Number(car.Price) * 10000); // Official cards display Price in 만원.
  if (!Number.isSafeInteger(price) || price <= 0) return null;
  const title = [car.Manufacturer, car.Model, car.Badge, car.BadgeDetail].map(text).filter(Boolean).join(' ');
  if (!title) return null;
  const photo = Array.isArray(car.Photos) ? (car.Photos.find(p => p.type === '001') || car.Photos[0])?.location : null;
  const image = typeof photo === 'string' && /^\/carpicture[\w/.-]+\.(?:jpg|jpeg|png)$/i.test(photo) ? `https://ci.encar.com${photo}` : '';
  const year = /^\d{4}$/.test(String(car.FormYear)) ? Number(car.FormYear) : Number.isFinite(Number(car.Year)) && Number(car.Year) >= 190001 ? Math.floor(Number(car.Year) / 100) : null;
  const mileage = typeof car.Mileage === 'number' && Number.isSafeInteger(car.Mileage) && car.Mileage >= 0 ? car.Mileage : null;
  return {
    id: `encar-${car.Id}`, title, price, kind: 'car', source: 'encar', sourceName: '엔카',
    category: 'car', condition: 'unknown', methods: [], status: 'unknown',
    region: text(car.OfficeCityState), lat: null, lng: null, publishedAt: null,
    collectedAt, image, url: `https://fem.encar.com/cars/detail/${car.Id}`,
    brand: text(car.Manufacturer) || null, year, mileage, fuel: fuels[car.FuelType] || 'unknown',
    fuelLabel: text(car.FuelType), demo: false,
  };
}

export function parseEncarResponse(payload, collectedAt) {
  if (!payload || !Array.isArray(payload.SearchResults) || !Number.isFinite(Number(payload.Count))) throw Object.assign(new Error('엔카 검색 응답 형식이 변경됐어요.'), {stage:'schema'});
  const unique = new Map();
  for (const car of payload.SearchResults) {
    const item = normalizeEncarCar(car, collectedAt);
    if (item) unique.set(item.id, item);
  }
  return { items: [...unique.values()], total: Number(payload.Count) };
}

async function readBrowserPayload(response, signal) {
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw responseError('엔카 검색 응답 크기가 제한을 초과했어요.', 'body');
  }
  const reader = response.body?.getReader();
  if (!reader) throw responseError('엔카 검색 응답을 읽을 수 없어요.', 'body');
  const chunks = [];
  let bytes = 0;
  let completed = false;
  const onAbort = () => { reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', onAbort, {once: true});
  try {
    while (true) {
      throwIfAborted(signal);
      const {done, value} = await reader.read();
      throwIfAborted(signal);
      if (done) { completed = true; break; }
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw responseError('엔카 검색 응답 크기가 제한을 초과했어요.', 'body');
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
    if (!completed) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(buffer)); }
  catch { throw responseError('엔카 검색 응답을 해석할 수 없어요.', 'json'); }
}

/** Returns {items, provider}; rejects on cancellation, HTTP/CORS or invalid data. */
export async function searchEncarInBrowser({query = '', limit = 30, signal} = {}) {
  throwIfAborted(signal);
  const url = buildEncarUrl(query, limit);
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal.reason);
  signal?.addEventListener('abort', onAbort, {once: true});
  const timeout = setTimeout(() => controller.abort(new DOMException('엔카 검색 시간이 초과됐어요.', 'TimeoutError')), 9000);
  try {
    const response = await fetch(url, {
      method: 'GET', headers: {Accept: 'application/json'}, credentials: 'omit',
      mode: 'cors', redirect: 'error', signal: controller.signal,
    });
    throwIfAborted(controller.signal);
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw Object.assign(responseError('엔카 검색에 연결할 수 없어요.', 'http'), {upstreamStatus: response.status});
    }
    const payload = await readBrowserPayload(response, controller.signal);
    throwIfAborted(controller.signal);
    const parsed = parseEncarResponse(payload, new Date().toISOString());
    const items = parsed.items.slice(0, boundedLimit(limit));
    return {items, provider: {source: 'encar', status: 'ok', count: items.length, total: parsed.total,
      message: '이 기기의 브라우저에서 엔카 공개 검색 결과 일부를 직접 조회했어요. 리스·렌트는 제외하며 판매 상태와 최신 가격은 원문에서 확인해 주세요.'}};
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}
