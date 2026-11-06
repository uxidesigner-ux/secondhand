/** Bounded, in-memory only: no persisted search history or background requests. */
export function createSearchCache({ttl = 180_000, maxEntries = 16, now = Date.now} = {}) {
  const entries = new Map();
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return null;
      if (now() >= entry.expiresAt) { entries.delete(key); return null; }
      entries.delete(key); entries.set(key, entry);
      return structuredClone(entry.payload);
    },
    put(key, payload) {
      if (!Array.isArray(payload?.items) || !Array.isArray(payload?.providers)
        || !payload.providers.some(provider => provider.status === 'ok')) return false;
      const timestamp = now();
      for (const [oldKey, entry] of entries) if (timestamp >= entry.expiresAt) entries.delete(oldKey);
      entries.delete(key);
      entries.set(key, {expiresAt: timestamp + ttl, payload: structuredClone(payload)});
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
      return true;
    },
  };
}
