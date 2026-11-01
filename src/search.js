const sources = {
  daangn: ['daangn.com', 'www.daangn.com'],
  joongna: ['web.joongna.com'],
  bunjang: ['m.bunjang.co.kr'],
  other: ['www.hellomarket.com'],
  encar: ['encar.com', 'www.encar.com', 'car.encar.com'],
  kb: ['www.kbchachacha.com'],
  kcar: ['www.kcar.com', 'm.kcar.com'],
};
const categories = ['digital', 'fashion', 'home', 'sports', 'hobby', 'car'];
const fuels = ['gasoline', 'diesel', 'hybrid', 'electric'];
const conditions = ['new', 'like-new', 'used'];
const methods = ['direct', 'shipping'];
const statuses = ['selling', 'reserved', 'sold'];
const isNumber = value => typeof value === 'number' && Number.isFinite(value);
const validCoords = coords => coords && isNumber(coords.lat) && isNumber(coords.lng)
  && Math.abs(coords.lat) <= 90 && Math.abs(coords.lng) <= 180;
const normalize = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase('ko-KR');
const active = value => value !== undefined && value !== null && value !== '' && value !== 'all';
const bound = value => active(value) && Number.isFinite(Number(value)) ? Number(value) : null;

/** Validate a normalized feed item before allowing it into the interface. */
export function validateListing(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  if (typeof item.id !== 'string' || !item.id.trim() || typeof item.title !== 'string' || !item.title.trim()) return false;
  if (!isNumber(item.price) || item.price < 0 || !Number.isSafeInteger(item.price)) return false;
  if (!Object.hasOwn(sources, item.source) || !categories.includes(item.category)
    || !conditions.includes(item.condition) || !statuses.includes(item.status)) return false;
  if (item.kind != null && !['goods', 'car'].includes(item.kind)) return false;
  if (item.kind === 'car' && (typeof item.brand !== 'string' || !item.brand.trim()
    || !Number.isInteger(item.year) || item.year < 1900 || item.year > new Date().getFullYear() + 1
    || !Number.isSafeInteger(item.mileage) || item.mileage < 0 || !fuels.includes(item.fuel))) return false;
  if (!Array.isArray(item.methods) || !item.methods.length || !item.methods.every(value => methods.includes(value))) return false;
  if (typeof item.sourceName !== 'string' || !item.sourceName.trim() || typeof item.region !== 'string') return false;
  if (typeof item.publishedAt !== 'string' || !Number.isFinite(Date.parse(item.publishedAt))) return false;
  const hasCoordinates = item.lat != null || item.lng != null;
  if (hasCoordinates && !validCoords(item)) return false;
  try {
    const url = new URL(item.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !sources[item.source].includes(url.hostname)) return false;
    if (item.image) {
      const image = new URL(item.image);
      if (image.protocol !== 'https:' || image.username || image.password || image.port) return false;
    }
  } catch { return false; }
  return true;
}

/** Haversine distance in km. Unknown/invalid positions have infinite distance. */
export function distanceKm(a, b) {
  if (!validCoords(a) || !validCoords(b)) return Infinity;
  const rad = value => value * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

/** Returns a filtered, sorted copy; never modifies feed records or the input array. */
export function filterListings(listings, options = {}) {
  const words = normalize(options.query).trim().split(/\s+/u).filter(Boolean);
  const min = bound(options.minPrice);
  const max = bound(options.maxPrice);
  const radius = bound(options.radius);
  const minYear = bound(options.minYear);
  const maxMileage = bound(options.maxMileage);
  const position = validCoords(options.coords) ? options.coords : null;
  const result = (Array.isArray(listings) ? listings : []).filter(item => {
    if (!validateListing(item)) return false;
    if (active(options.kind) && (item.kind || 'goods') !== options.kind) return false;
    if (active(options.brand) && item.brand !== options.brand) return false;
    if (active(options.fuel) && item.fuel !== options.fuel) return false;
    if (minYear !== null && (!isNumber(item.year) || item.year < minYear)) return false;
    if (maxMileage !== null && (!isNumber(item.mileage) || item.mileage > maxMileage)) return false;
    if (words.some(word => !normalize(item.title).includes(word))) return false;
    for (const key of ['source', 'category', 'condition', 'status']) {
      const selected = options[key];
      if (Array.isArray(selected)) {
        if (selected.length && !selected.includes(item[key])) return false;
      } else if (active(selected) && item[key] !== selected) return false;
    }
    if (active(options.method) && !item.methods.includes(options.method)) return false;
    if (min !== null && item.price < min) return false;
    if (max !== null && item.price > max) return false;
    if (active(options.region) && !normalize(item.region).includes(normalize(options.region))) return false;
    if (position && radius !== null && distanceKm(position, item) > Math.max(0, radius)) return false;
    return true;
  });
  const recent = (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id);
  const comparators = {
    recent,
    'price-asc': (a, b) => a.price - b.price || recent(a, b),
    'price-desc': (a, b) => b.price - a.price || recent(a, b),
    distance: (a, b) => distanceKm(position, a) - distanceKm(position, b) || recent(a, b),
  };
  return result.sort(comparators[options.sort] || recent);
}
