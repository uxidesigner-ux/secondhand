// Keep the API behind Vercel Authentication. Never embed bypass/share tokens.
export const PROTECTED_SEARCH_URL = 'https://used-search-api.vercel.app/';
// Public metadata only; visitors continue to the protected application.
export const SERVICE_SHARE_URL = 'https://uxidesigner-ux.github.io/secondhand/share/';
export const REQUIRES_LOGIN_REDIRECT = typeof location !== 'undefined' && location.hostname === 'uxidesigner-ux.github.io';
export const SEARCH_API_URL = '/api/search';
export function protectedSearchUrl({query='',kind='goods',source='all'}={}) {
  const url=new URL(PROTECTED_SEARCH_URL);
  if(query)url.searchParams.set('q',query.slice(0,80));
  url.searchParams.set('kind',kind);url.searchParams.set('source',source);
  return url.href;
}

// The legacy Pages URL is an entry point only. Forward known app state, never
// authentication parameters, arbitrary destinations, hashes, or user info.
export function canonicalEntryUrl(input) {
  const target=new URL(PROTECTED_SEARCH_URL);
  let incoming;
  try { incoming=new URL(input); } catch { return target.href; }
  const params=incoming.searchParams;
  const kind=params.get('kind');
  if(['goods','car'].includes(kind))target.searchParams.set('kind',kind);
  const view=params.get('view');
  if(['results','detail','saved','services'].includes(view))target.searchParams.set('view',view);
  const query=(params.get('q')||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,80);
  if(query)target.searchParams.set('q',query);
  const sources=kind==='car'?['all','encar','kb','kcar']:['all','daangn','joongna','bunjang','other'];
  const source=params.get('source');
  if(sources.includes(source))target.searchParams.set('source',source);
  const item=params.get('item');
  if(view==='detail'&&item&&item.length<=512&&!/[\u0000-\u001f\u007f]/.test(item))target.searchParams.set('item',item);
  if(params.get('install')==='1')target.searchParams.set('install','1');
  return target.href;
}

export function getCanonicalRedirect(input) {
  let url;
  try { url=new URL(input); } catch { return null; }
  return url.hostname==='uxidesigner-ux.github.io'?canonicalEntryUrl(url.href):null;
}
