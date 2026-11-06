const scrollPosition = value => Number.isFinite(value) ? Math.max(0, value) : 0;
const routeKey = entry => JSON.stringify([entry?.depth, entry?.page, entry?.kind, entry?.source, entry?.query, entry?.detailId]);

/** Keep scroll bookkeeping out of the browser's rate-limited History API.
 * A failed snapshot write must never prevent the user's Back action. */
export function createRouteHistory({history, snapshot, url}) {
  const positions = new Map();
  let pending = false, written = '';
  function write(push = false) {
    if (pending) return false;
    const entry = snapshot(), destination = String(url());
    const signature = JSON.stringify([entry, destination]);
    if (!push && signature === written) return true;
    try {
      history[push ? 'pushState' : 'replaceState'](entry, '', destination);
      written = signature;
      return true;
    } catch {
      // Safari can reject History writes while throttling or leaving a page.
      return false;
    }
  }
  return {
    sync: () => write(),
    push: () => write(true),
    rememberScroll(value) {
      if (!pending) positions.set(routeKey(snapshot()), scrollPosition(value));
    },
    scrollFor(entry) { return positions.get(routeKey(entry)) ?? scrollPosition(entry?.scrollY); },
    back() {
      if (pending) return false;
      pending = true;
      try { history.back(); return true; }
      catch { pending = false; return false; }
    },
    restored() { pending = false; written = ''; },
    isPending: () => pending,
  };
}
