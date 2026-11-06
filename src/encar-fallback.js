import {searchEncarInBrowser} from './providers/encar.js';
import {validateListing, filterListings} from './search.js';
import {createRecoveryGuard} from './recovery-guard.js';
const browserRecoveryGuard = createRecoveryGuard();

const carSources = ['encar', 'kb', 'kcar'];
const providerStatuses = ['ok', 'error', 'unavailable'];
const browserFailureMessage = '이 기기의 브라우저에서도 엔카 검색에 연결하지 못했어요. 원문 서비스에서 확인해 주세요.';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const normalize = value => value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
const throwIfAborted = signal => {
  if (signal?.aborted) throw signal.reason || new DOMException('검색이 취소됐어요.', 'AbortError');
};

function validPayload(payload, query) {
  if (!object(payload) || !Array.isArray(payload.items) || !Array.isArray(payload.providers)) return false;
  if (payload.kind !== undefined && payload.kind !== 'car') return false;
  if (payload.query !== undefined && (typeof payload.query !== 'string' || normalize(payload.query) !== query)) return false;
  if (!payload.items.every(item => item?.demo !== true && item?.kind === 'car' && validateListing(item))) return false;
  const seen = new Set();
  return payload.providers.every(provider => object(provider) && carSources.includes(provider.source)
    && providerStatuses.includes(provider.status) && !seen.has(provider.source) && seen.add(provider.source)
    && (provider.count === undefined || (Number.isSafeInteger(provider.count) && provider.count >= 0)));
}

/** Recover only a failed Encar provider after the same-origin search endpoint has
 * returned its normal JSON contract. Authentication/rate-limit failures never
 * trigger a separate browser request. Other providers remain untouched. */
export async function recoverEncar({payload, status, kind, source, query, signal, searchEncar = searchEncarInBrowser,
  recoveryGuard = searchEncar === searchEncarInBrowser ? browserRecoveryGuard : null}) {
  if (kind !== 'car' || !['all', 'encar'].includes(source) || ![200, 502].includes(status)) return payload;
  if (typeof query !== 'string') return payload;
  const term = normalize(query);
  if (!term || term.length > 80 || /[\u0000-\u001f\u007f]/u.test(term) || !validPayload(payload, term)) return payload;
  const failed = payload.providers.find(provider => provider.source === 'encar');
  if (!failed || !['error', 'unavailable'].includes(failed.status)) return payload;
  if (failed.code === 'PROVIDER_BUSY') return payload;

  throwIfAborted(signal);
  if (recoveryGuard && !recoveryGuard.acquire()) return payload;
  try {
    const result = await searchEncar({query: term, limit: 30, signal});
    throwIfAborted(signal);
    if (!object(result) || !Array.isArray(result.items) || !object(result.provider)
      || result.provider.source !== 'encar' || result.provider.status !== 'ok') throw new Error('Invalid Encar result');
    const otherItems = payload.items.filter(item => item.source !== 'encar');
    const seen = new Set(otherItems.map(item => item.id));
    const valid = result.items.filter(item => item?.source === 'encar' && item?.demo !== true
      && validateListing(item) && !seen.has(item.id) && seen.add(item.id));
    const recovered = filterListings(valid, {kind: 'car', source: 'encar', query: term, sort: 'recent'});
    const providers = payload.providers.map(provider => provider.source === 'encar'
      ? {...result.provider, count: recovered.length} : provider);
    const next = {...payload, items: [...otherItems, ...recovered], providers,
      partial: providers.some(provider => provider.status !== 'ok'), fetchedAt: new Date().toISOString()};
    if (providers.some(provider => provider.status === 'ok')) delete next.error;
    return next;
  } catch (error) {
    throwIfAborted(signal);
    if (error?.name === 'AbortError') throw error;
    recoveryGuard?.failed();
    return {...payload, providers: payload.providers.map(provider => provider.source === 'encar'
      ? {...provider, message: browserFailureMessage} : provider)};
  } finally { recoveryGuard?.release(); }
}
