const GPS_TIMEOUT = 10000;
const NAME_WARNING = '현재 위치는 확인했지만 지역명을 표시하지 못했어요.';
const messages = {
  permission: '위치 접근을 허용해 주세요.',
  unavailable: '현재 위치를 확인할 수 없어요. 다시 시도해 주세요.',
  timeout: '위치 확인 시간이 초과됐어요. 다시 시도해 주세요.',
  unsupported: '이 브라우저에서는 현재 위치를 확인할 수 없어요.',
};
const positionError = code => Object.assign(new Error(messages[code] || messages.unavailable), {code});
const abortError = () => new DOMException('위치 확인이 취소됐어요.', 'AbortError');
const throwIfAborted = signal => { if (signal?.aborted) throw abortError(); };

function currentCoordinates(geolocation, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    if (typeof geolocation?.getCurrentPosition !== 'function') { reject(positionError('unsupported')); return; }
    let finished = false;
    let timer;
    const finish = (settle, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      settle(value);
    };
    const onAbort = () => finish(reject, abortError());
    signal?.addEventListener('abort', onAbort, {once: true});
    timer = setTimeout(() => finish(reject, positionError('timeout')), GPS_TIMEOUT);
    const onFailure = error => finish(reject, positionError(({1: 'permission', 2: 'unavailable', 3: 'timeout'})[error?.code] || 'unavailable'));
    try {
      geolocation.getCurrentPosition(position => {
        if (finished) return;
        if (signal?.aborted) { onAbort(); return; }
        const lat = position?.coords?.latitude, lng = position?.coords?.longitude;
        if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat)
          || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
          finish(reject, positionError('unavailable'));
          return;
        }
        finish(resolve, {lat, lng});
      }, onFailure, {timeout: GPS_TIMEOUT, maximumAge: 60000, enableHighAccuracy: false});
    } catch (error) { onFailure(error); }
  });
}

// Resolve promptly on cancellation even if a local data loader ignores signal.
// Both handlers stay attached so a late resolver rejection is also consumed.
function currentName(coords, resolveName, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    let finished = false;
    const finish = (settle, value) => {
      if (finished) return;
      finished = true;
      signal?.removeEventListener('abort', onAbort);
      settle(value);
    };
    const onAbort = () => finish(reject, abortError());
    signal?.addEventListener('abort', onAbort, {once: true});
    Promise.resolve().then(() => {
      throwIfAborted(signal);
      return typeof resolveName === 'function' ? resolveName(coords, {signal}) : null;
    }).then(value => finish(resolve, value), error => finish(reject, error));
  });
}

/** Gets device coordinates and resolves a display name through a caller-supplied
 * local lookup. This module performs no network requests and stores no location. */
export async function locateCurrentRegion({geolocation = globalThis.navigator?.geolocation, resolveName, signal} = {}) {
  throwIfAborted(signal);
  const coords = await currentCoordinates(geolocation, signal);
  throwIfAborted(signal);
  let locationName = '';
  try {
    const name = await currentName(coords, resolveName, signal);
    throwIfAborted(signal);
    if (typeof name === 'string') locationName = Array.from(name.replace(/[\p{Cc}\p{Cf}]/gu, '').trim()).slice(0, 50).join('').trimEnd();
  } catch {
    throwIfAborted(signal);
  }
  throwIfAborted(signal);
  return {coords, locationName, warning: locationName ? '' : NAME_WARNING};
}
