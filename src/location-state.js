const RADII = new Set([1, 3, 5, 10, 30, 100]);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const cleanName = value => typeof value === 'string'
  ? value.replace(/[\u0000-\u001f\u007f]/gu, '').trim().slice(0, 50)
  : '';
const coordinate = (value, limit) => typeof value === 'number'
  && Number.isFinite(value) && Math.abs(value) <= limit;

/** GPS uses distance filtering; its resolved name is presentation only. */
export function normalizeLocation(value) {
  const input = object(value) ? value : {};
  const position = input.coords;
  const coords = object(position) && coordinate(position.lat, 90) && coordinate(position.lng, 180)
    ? {lat: position.lat, lng: position.lng}
    : null;
  return {
    region: coords ? '' : cleanName(input.region),
    coords,
    radius: RADII.has(input.radius) ? input.radius : 5,
    locationName: coords ? cleanName(input.locationName) : '',
  };
}

/** Restore one complete selection, never combine old coordinates with a region. */
export function locationFromHistory(entry) {
  if (!object(entry) || entry.usedRoute !== true) return normalizeLocation();
  if (Object.hasOwn(entry, 'location')) return normalizeLocation(entry.location);
  return normalizeLocation({region: entry.region});
}

/** History receives a fresh object so subsequent edits cannot change its coordinates. */
export function locationSnapshot(state) {
  return normalizeLocation(state);
}

export function locationText(state) {
  const location = normalizeLocation(state);
  return location.coords
    ? `${location.locationName || '내 위치'} · ${location.radius}km`
    : location.region;
}
