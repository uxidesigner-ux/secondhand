import {createEncarDetailFetcher} from '../../src/providers/encar-detail.js';

export {isEncarCarId, parseEncarDetail, parseEncarHtml} from '../../src/providers/encar-detail.js';

// The public HTML contains the exact displayed vehicle in __PRELOADED_STATE__.
// Optional readside enrichment can fail without discarding its photos/specs.
export function createEncarDetailProvider({fetchImpl = globalThis.fetch} = {}) {
  return createEncarDetailFetcher({fetchImpl, format: 'html'});
}
export const getEncarDetail = createEncarDetailProvider();
