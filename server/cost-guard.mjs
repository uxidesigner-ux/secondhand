import {isIP} from 'node:net';
import {publicApiPolicy} from './public-api-policy.mjs';

/** Free, process-local load shedding. These counters reset on cold starts and are
 * NOT a global spending cap. The hosting plan must separately forbid overages. */
export class CostGuardError extends Error {
  constructor(code, message, status = 503, retryAfter = 30) {
    super(message);
    this.name = 'CostGuardError';
    Object.assign(this, {code, status, retryAfter});
  }
}

export function publicApiEnabled(env = process.env, policy = publicApiPolicy) {
  if (env.USED_PUBLIC_API_ENABLED === 'false') return false;
  return env.USED_PUBLIC_API_ENABLED === 'true' || policy?.enabled === true;
}

// Vercel overwrites x-real-ip at its trusted edge. Never accept arbitrary
// x-forwarded-for, client cookies, or a supplied user ID as the limiter identity.
export function clientKey(request, env = process.env) {
  if (env.VERCEL !== '1') return 'local';
  const value = request.headers.get('x-real-ip') || '';
  return isIP(value) ? value : 'unknown';
}

export function createCostGuard({ttlMs = 180_000, maxEntries = 64,
  maxBytes = 4 * 1024 * 1024, maxEntryBytes = 512 * 1024,
  concurrency = 2, requestsPerWindow = 12, windowMs = 60_000,
  maxClients = 2048, now = Date.now, enabled = publicApiEnabled,
  identity = clientKey} = {}) {
  const cache = new Map(), inFlight = new Map(), clients = new Map();
  let cacheBytes = 0;
  const remove = key => {
    const entry = cache.get(key);
    if (entry) { cacheBytes -= entry.bytes; cache.delete(key); }
  };
  const prune = time => {
    for (const [key, entry] of cache) if (entry.expires <= time) remove(key);
    for (const [key, bucket] of clients) if (bucket.reset <= time) clients.delete(key);
  };
  const limit = (request, time) => {
    const key = identity(request);
    let bucket = clients.get(key);
    if (!bucket) {
      // Refuse new identities once full; do not evict an active limiter bucket
      // (an attacker could otherwise reset its quota by cycling identities).
      if (clients.size >= maxClients) throw new CostGuardError('API_BUSY', '요청이 많아요. 잠시 후 다시 시도해 주세요.', 503, Math.ceil(windowMs / 1000));
      bucket = {count: 0, reset: time + windowMs};
      clients.set(key, bucket);
    }
    if (bucket.count >= requestsPerWindow) throw new CostGuardError('API_RATE_LIMIT', '요청이 많아요. 잠시 후 다시 시도해 주세요.', 429, Math.max(1, Math.ceil((bucket.reset - time) / 1000)));
    bucket.count++;
  };
  const store = (key, result) => {
    if (result.status !== 200) return;
    const json = JSON.stringify(result), bytes = Buffer.byteLength(json);
    if (bytes > maxEntryBytes || bytes > maxBytes) return;
    while (cache.size >= maxEntries || cacheBytes + bytes > maxBytes) remove(cache.keys().next().value);
    cache.set(key, {json, bytes, expires: now() + ttlMs});
    cacheBytes += bytes;
  };
  return {
    async run({request, key, load}) {
      if (!enabled()) throw new CostGuardError('API_DISABLED', '지금은 검색을 잠시 쉬고 있어요. 잠시 후 다시 시도해 주세요.', 503, 300);
      const time = now();prune(time);limit(request, time);
      const cached = cache.get(key);
      if (cached) return JSON.parse(cached.json);
      if (inFlight.has(key)) return inFlight.get(key);
      if (inFlight.size >= concurrency) throw new CostGuardError('API_BUSY', '검색 요청이 많아요. 잠시 후 다시 시도해 주세요.', 503, 10);
      // The shared operation owns its timeout. One caller disconnecting must
      // not cancel the same operation for other callers waiting on this key.
      const work = Promise.resolve().then(load).then(result => {store(key, result);return result;});
      inFlight.set(key, work);
      try { return await work; } finally { inFlight.delete(key); }
    },
    // Aggregate counts only, useful for tests; no IPs, query text or payloads.
    stats: () => ({cacheEntries: cache.size, cacheBytes, clients: clients.size, inFlight: inFlight.size}),
  };
}

export function createProviderGuard({now = Date.now, cooldownMs = 300_000, concurrency = 2} = {}) {
  const states = new Map();
  const allowed = new Set(['daangn','joongna','bunjang','other','encar','kb','kcar']);
  return {
    async run(source, load) {
      if (!allowed.has(source)) throw new CostGuardError('PROVIDER_INVALID', '지원하지 않는 서비스예요.', 400);
      if (!states.has(source)) states.set(source, {active: 0, until: 0});
      const state = states.get(source);
      if (state.until > now()) throw new CostGuardError('PROVIDER_COOLDOWN', '원문 서비스의 요청 제한으로 잠시 기다리고 있어요.', 503, Math.ceil((state.until - now()) / 1000));
      if (state.active >= concurrency) throw new CostGuardError('PROVIDER_BUSY', '이 서비스의 조회 요청이 많아요. 잠시 후 다시 시도해 주세요.', 503, 10);
      state.active++;
      try { return await load(); }
      catch (error) {
        const status = error?.upstreamStatus ?? Number(error?.message?.match(/^UPSTREAM_(\d{3})$/)?.[1]);
        if ([403,407,429].includes(status)) state.until = now() + cooldownMs;
        throw error;
      } finally { state.active--; }
    },
  };
}

export const guardFailure = error => ({
  body: {code: error.code, error: error.message}, status: error.status,
  headers: {'Retry-After': String(error.retryAfter)},
});
