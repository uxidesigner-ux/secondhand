const DATA_URL = new URL('../assets/regions/korea-admin-dong-20261001.geojson.gz', import.meta.url);
const MAX_COMPRESSED_BYTES = 4 * 1024 * 1024;
const MAX_DECODED_BYTES = 16 * 1024 * 1024;
let cachedFeatures = null;

const validNumber = (value, max) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= max;
const validCoords = value => value && !Array.isArray(value) && validNumber(value.lat, 90) && validNumber(value.lng, 180);
const abortError = () => new DOMException('지역명 조회가 취소됐어요.', 'AbortError');
const lookupError = () => new Error('지역 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
const throwIfAborted = signal => { if (signal?.aborted) throw signal.reason?.name === 'TimeoutError' ? signal.reason : abortError(); };

async function readBounded(stream, maxBytes, signal) {
  const reader = stream?.getReader();
  if (!reader) throw lookupError();
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
      if (bytes > maxBytes) throw lookupError();
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
  return buffer;
}

function prepareFeatures(payload) {
  if (payload?.type !== 'FeatureCollection' || !Array.isArray(payload.features)
    || !payload.features.length || payload.features.length > 10000) throw lookupError();
  return payload.features.map(feature => {
    const name = feature?.properties?.name;
    const geometry = feature?.geometry;
    if (feature?.type !== 'Feature' || typeof name !== 'string' || !name.trim()
      || name.length > 200 || /[\u0000-\u001f\u007f]/u.test(name)
      || !['Polygon', 'MultiPolygon'].includes(geometry?.type)) throw lookupError();
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    if (!Array.isArray(polygons) || !polygons.length) throw lookupError();
    const bounded = polygons.map(rings => {
      if (!Array.isArray(rings) || !rings.length) throw lookupError();
      const bbox = [Infinity, Infinity, -Infinity, -Infinity];
      for (const ring of rings) {
        if (!Array.isArray(ring) || ring.length < 4) throw lookupError();
        for (const point of ring) {
          if (!Array.isArray(point) || point.length < 2 || !validNumber(point[0], 180) || !validNumber(point[1], 90)) throw lookupError();
          bbox[0] = Math.min(bbox[0], point[0]); bbox[1] = Math.min(bbox[1], point[1]);
          bbox[2] = Math.max(bbox[2], point[0]); bbox[3] = Math.max(bbox[3], point[1]);
        }
        const first = ring[0], last = ring[ring.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) throw lookupError();
      }
      return {rings, bbox};
    });
    return {name, polygons: bounded};
  });
}

// Returns 0 outside, 1 inside and 2 on a boundary. Holes are checked separately.
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j], [bx, by] = ring[i];
    const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
    if (Math.abs(cross) < 1e-12 && x >= Math.min(ax, bx) && x <= Math.max(ax, bx)
      && y >= Math.min(ay, by) && y <= Math.max(ay, by)) return 2;
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside ? 1 : 0;
}

function inPolygon(x, y, {rings, bbox}) {
  if (x < bbox[0] || y < bbox[1] || x > bbox[2] || y > bbox[3] || !inRing(x, y, rings[0])) return false;
  return !rings.slice(1).some(ring => inRing(x, y, ring));
}

function findName(coords, features) {
  let found = null;
  for (const feature of features) {
    if (!feature.polygons.some(polygon => inPolygon(coords.lng, coords.lat, polygon))) continue;
    if (found !== null && found !== feature.name) return null;
    found = feature.name;
  }
  return found;
}

async function loadFeatures(signal) {
  if (typeof DecompressionStream !== 'function') throw lookupError();
  // Only this fixed same-origin file is requested. Coordinates stay in memory.
  const response = await fetch(DATA_URL, {
    method: 'GET', credentials: 'same-origin', mode: 'same-origin', redirect: 'error',
    cache: 'force-cache', signal,
  });
  throwIfAborted(signal);
  if (!response.ok || Number(response.headers.get('content-length')) > MAX_COMPRESSED_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw lookupError();
  }
  const compressed = await readBounded(response.body, MAX_COMPRESSED_BYTES, signal);
  const decodedStream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
  const decoded = await readBounded(decodedStream, MAX_DECODED_BYTES, signal);
  throwIfAborted(signal);
  return prepareFeatures(JSON.parse(new TextDecoder().decode(decoded)));
}

/** Resolve an administrative-dong name locally; an unmatched coordinate returns null. */
export async function lookupRegionName(coords, {signal} = {}) {
  if (!validCoords(coords)) throw new TypeError('위치 좌표를 확인할 수 없어요.');
  throwIfAborted(signal);
  const point = {lat: coords.lat, lng: coords.lng};
  if (cachedFeatures) return findName(point, cachedFeatures);
  const controller = new AbortController();
  const onAbort = () => controller.abort(abortError());
  signal?.addEventListener('abort', onAbort, {once: true});
  const timeout = setTimeout(() => controller.abort(new DOMException('지역명 조회 시간이 초과됐어요.', 'TimeoutError')), 12000);
  try {
    // In-flight loads are deliberately separate: cancelling one caller cannot
    // cancel another. Only a fully decoded, validated success is cached.
    const features = await loadFeatures(controller.signal);
    throwIfAborted(controller.signal);
    cachedFeatures = features;
    return findName(point, features);
  } catch {
    throwIfAborted(controller.signal);
    throw lookupError();
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}
