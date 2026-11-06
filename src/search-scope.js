const PROVIDERS = Object.freeze({
  goods: Object.freeze(['daangn', 'joongna', 'bunjang', 'other']),
  car: Object.freeze(['encar', 'kb', 'kcar']),
});

export function searchScope(kind, source = 'all') {
  const selectedKind = kind === 'car' ? 'car' : 'goods';
  const available = PROVIDERS[selectedKind];
  const selectedSource = available.includes(source) ? source : 'all';
  return {kind: selectedKind, source: selectedSource,
    providers: selectedSource === 'all' ? [...available] : [selectedSource]};
}

export function isInSearchScope(item, scope) {
  return item?.kind === scope.kind && scope.providers.includes(item.source);
}

export function normalizedSearchQuery(query) {
  return String(query ?? '').normalize('NFKC').trim().replace(/\s+/gu, ' ').slice(0, 80);
}

export function searchRequestKey({kind, source, query}) {
  const scope = searchScope(kind, source);
  return JSON.stringify([scope.kind, scope.source, normalizedSearchQuery(query)]);
}
