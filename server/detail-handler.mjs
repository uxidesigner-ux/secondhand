import {isKbCarId} from './providers/kb-detail.mjs';

const headers = {'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'X-Content-Type-Options': 'nosniff'};
const json = (body, status = 200) => Response.json(body, {status, headers: {...headers, 'Cache-Control': status === 200 ? 'public, max-age=0, s-maxage=60' : 'no-store'}});

export function createDetailHandler({getKbDetail}) {
  return async request => {
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers});
    if (request.method !== 'GET') return json({error: 'GET 요청만 지원해요.'}, 405);
    const params = new URL(request.url).searchParams;
    const id = params.get('id');
    if (params.get('source') !== 'kb' || !isKbCarId(id) || params.getAll('id').length !== 1 || params.getAll('source').length !== 1) return json({error: '올바른 KB차차차 차량을 선택해 주세요.'}, 400);
    try {
      const detail = await getKbDetail({id, signal: AbortSignal.any([AbortSignal.timeout(10000), request.signal])});
      return json({detail});
    } catch (error) {
      const upstreamStatus = Number.isInteger(error?.upstreamStatus) ? error.upstreamStatus : null;
      console.error(JSON.stringify({event: 'detail_failed', source: 'kb', name: error?.name === 'TimeoutError' ? 'TimeoutError' : error?.name === 'AbortError' ? 'AbortError' : 'Error', upstreamStatus}));
      if (upstreamStatus === 404 || upstreamStatus === 410) return json({error: '차량 상세정보를 찾을 수 없어요. 원문 서비스에서 확인해 주세요.'}, 404);
      if ([403, 407, 429].includes(upstreamStatus)) return json({error: 'KB차차차의 상세 조회가 제한되어 있어요. 원문 서비스에서 확인해 주세요.'}, 503);
      return json({error: '상세정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'}, 502);
    }
  };
}
