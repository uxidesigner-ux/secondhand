import {isKbCarId} from './providers/kb-detail.mjs';

const headers = {'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'X-Content-Type-Options': 'nosniff'};
const json = (body, status = 200) => Response.json(body, {status, headers: {...headers, 'Cache-Control': status === 200 ? 'public, max-age=0, s-maxage=60' : 'no-store'}});

export function createDetailHandler({getKbDetail, getEncarDetail, getKcarDetail}) {
  const providers = new Map([
    ['kb', {name: 'KB차차차', valid: isKbCarId, get: getKbDetail}],
    ['encar', {name: '엔카', valid: value => typeof value === 'string' && /^[1-9]\d{0,11}$/.test(value), get: getEncarDetail}],
    ['kcar', {name: 'K Car', valid: value => typeof value === 'string' && /^EC\d{1,12}$/.test(value), get: getKcarDetail}],
  ]);
  return async request => {
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers});
    if (request.method !== 'GET') return json({error: 'GET 요청만 지원해요.'}, 405);
    const params = new URL(request.url).searchParams;
    const id = params.get('id');
    const source = params.get('source'), provider = providers.get(source);
    if (!provider || typeof provider.get !== 'function' || !provider.valid(id) || params.getAll('id').length !== 1 || params.getAll('source').length !== 1) return json({error: '올바른 차량을 선택해 주세요.'}, 400);
    try {
      const detail = await provider.get({id, signal: AbortSignal.any([AbortSignal.timeout(10000), request.signal])});
      return json({detail});
    } catch (error) {
      const upstreamStatus = Number.isInteger(error?.upstreamStatus) ? error.upstreamStatus : null;
      console.error(JSON.stringify({event: 'detail_failed', source, name: error?.name === 'TimeoutError' ? 'TimeoutError' : error?.name === 'AbortError' ? 'AbortError' : 'Error', upstreamStatus}));
      if (upstreamStatus === 404 || upstreamStatus === 410) return json({error: '차량 상세정보를 찾을 수 없어요. 원문 서비스에서 확인해 주세요.'}, 404);
      const failure = {source, id, code: 'DETAIL_UPSTREAM_UNAVAILABLE'};
      if ([403, 407, 429].includes(upstreamStatus)) return json({...failure, error: `${provider.name}의 상세 조회가 제한되어 있어요. 원문 서비스에서 확인해 주세요.`}, 503);
      return json({...failure, error: '상세정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'}, 502);
    }
  };
}
