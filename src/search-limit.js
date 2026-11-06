const WARNING = '검색 요청이 많아 잠시 제한될 수 있어요. 조금 여유를 두고 검색해 주세요.';
const MAX_WAIT_SECONDS = 120;
const emptyNotice = () => ({kind:null,remainingSeconds:0,message:''});

function readRateLimit(payload) {
  const value = payload?.rateLimit;
  if (!value || Array.isArray(value) || value.scope !== 'ip-instance'
    || !Number.isSafeInteger(value.limit) || value.limit < 1 || value.limit > 1000000
    || !Number.isSafeInteger(value.remaining) || value.remaining < 0 || value.remaining > value.limit
    || !Number.isSafeInteger(value.resetAfter) || value.resetAfter < 1 || value.resetAfter > MAX_WAIT_SECONDS) return null;
  return value;
}

function retrySeconds(response, rateLimit, time) {
  let header;
  try { header = response?.headers?.get('Retry-After')?.trim(); } catch { /* malformed response */ }
  let seconds;
  if (header && /^\d+$/.test(header)) seconds = Number(header);
  else if (header && /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),/i.test(header)) {
    const deadline = Date.parse(header);
    if (Number.isFinite(deadline)) seconds = Math.ceil((deadline - time) / 1000);
  }
  if (!Number.isFinite(seconds)) seconds = rateLimit?.resetAfter ?? 60;
  return Math.max(1,Math.min(MAX_WAIT_SECONDS,seconds));
}

/** Per-tab presentation state, not a quota counter or a spending estimate.
 * Call observe only for the actual same-origin search fetch response. Never
 * observe a cached payload or poll the API to update this notice. */
export function createSearchLimitNotice({now = Date.now} = {}) {
  let warningUntil = 0, blockedUntil = 0, dismissed = false;
  const expire = time => {
    if (warningUntil <= time) { warningUntil = 0;dismissed = false; }
    if (blockedUntil <= time) blockedUntil = 0;
  };
  const current = () => {
    const time = now();expire(time);
    if (blockedUntil) {
      const remainingSeconds = Math.min(MAX_WAIT_SECONDS,Math.ceil((blockedUntil - time) / 1000));
      return {kind:'blocked',remainingSeconds,message:`잠시 쉬어가요. ${remainingSeconds}초 후 다시 검색할 수 있어요.`};
    }
    if (warningUntil && !dismissed) return {kind:'warning',
      remainingSeconds:Math.min(MAX_WAIT_SECONDS,Math.ceil((warningUntil - time) / 1000)),message:WARNING};
    return emptyNotice();
  };
  return {
    observe(response,payload) {
      const time = now();expire(time);
      const status = response?.status, rateLimit = readRateLimit(payload);
      if (response?.redirected || !Number.isInteger(status)) return current();
      if (status === 429) {
        blockedUntil = Math.max(blockedUntil,time + retrySeconds(response,rateLimit,time) * 1000);
        warningUntil = 0;dismissed = false;
      } else if (!blockedUntil && ((status >= 200 && status < 300) || status === 502)
        && rateLimit && rateLimit.limit - rateLimit.remaining >= Math.ceil(rateLimit.limit * .8)) {
        const deadline = time + rateLimit.resetAfter * 1000;
        // Further warnings from this local window must not restart its timer or
        // re-open a dismissed banner. A later window is admitted after expiry.
        warningUntil = warningUntil ? Math.min(warningUntil,deadline) : deadline;
      }
      return current();
    },
    current,
    dismiss() {
      expire(now());
      if (warningUntil && !blockedUntil) dismissed = true;
      return current();
    },
  };
}
