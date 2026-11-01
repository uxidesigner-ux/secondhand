// Public API deployment is activated separately from the GitHub Pages frontend.
const local = typeof location !== 'undefined' && ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
export const SEARCH_API_URL = local ? '/api/search' : 'https://used-search-api.vercel.app/api/search';
