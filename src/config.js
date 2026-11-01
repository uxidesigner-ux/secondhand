// Keep the API behind Vercel Authentication. Never embed bypass/share tokens.
export const PROTECTED_SEARCH_URL = 'https://used-search-api.vercel.app/';
export const REQUIRES_LOGIN_REDIRECT = typeof location !== 'undefined' && location.hostname === 'uxidesigner-ux.github.io';
export const SEARCH_API_URL = '/api/search';
export function protectedSearchUrl({query='',kind='goods',source='all'}={}) {
  const url=new URL(PROTECTED_SEARCH_URL);
  if(query)url.searchParams.set('q',query.slice(0,80));
  url.searchParams.set('kind',kind);url.searchParams.set('source',source);
  return url.href;
}
