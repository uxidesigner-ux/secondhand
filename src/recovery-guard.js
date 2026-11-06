/** Per-tab protection for the existing public Encar CORS recovery path.
 * This never substitutes for API authentication or rate limits. */
export function createRecoveryGuard({now = Date.now, cooldownMs = 300_000} = {}) {
  let active = false, retryAt = 0;
  return {
    acquire() {
      if (active || now() < retryAt) return false;
      active = true;return true;
    },
    failed() { retryAt = now() + cooldownMs; },
    release() { active = false; },
  };
}
