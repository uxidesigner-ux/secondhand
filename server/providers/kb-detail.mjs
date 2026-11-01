const ORIGIN = 'https://www.kbchachacha.com';
const MAX_BYTES = 2 * 1024 * 1024;
const SPEC_LABELS = new Set(['연식', '주행거리', '연료', '변속기', '연비', '차종', '배기량', '차량색상', '시트색상', '압류', '저당', '세금미납']);
const HISTORY_LABELS = new Set(['전손이력', '침수이력', '용도이력', '소유자변경']);

export const isKbCarId = id => typeof id === 'string' && /^[1-9]\d{0,11}$/.test(id);
const failure = (code, upstreamStatus = null) => Object.assign(new Error(code), {code, upstreamStatus});

function decode(value) {
  const names = {amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', middot: '·'};
  return String(value).replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (all, entity) => {
    if (!entity.startsWith('#')) return names[entity.toLowerCase()] ?? all;
    const number = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : '';
  });
}
const clean = value => decode(value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
const hasClass = (node, name) => (node?.attrs?.class || '').split(/\s+/).includes(name);

// A passive, bounded tree for the few observed HTML sections. No scripts, styles,
// event handlers, embedded documents or remote resources are evaluated.
function tree(html) {
  const root = {tag: 'root', attrs: {}, children: []};
  const stack = [root];
  const inert = html.replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  let count = 0;
  for (const match of inert.matchAll(/<[^>]*>|[^<]+/g)) {
    if (++count > 80000) throw failure('KB_DETAIL_FORMAT');
    const token = match[0];
    if (!token.startsWith('<')) { stack.at(-1).children.push(token); continue; }
    const closing = token.match(/^<\/\s*([\w-]+)/);
    if (closing) {
      const index = stack.findLastIndex(node => node.tag === closing[1].toLowerCase());
      if (index > 0) stack.length = index;
      continue;
    }
    const opening = token.match(/^<\s*([\w-]+)/);
    if (!opening) continue;
    const node = {tag: opening[1].toLowerCase(), attrs: {}, children: []};
    for (const attr of token.slice(opening[0].length).matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      // Only class/id are required; URLs/contact data are never retained here.
      if (attr[1] === 'class' || attr[1] === 'id') node.attrs[attr[1]] = decode(attr[2] ?? attr[3] ?? attr[4]);
    }
    stack.at(-1).children.push(node);
    if (!voidTags.has(node.tag) && !/\/\s*>$/.test(token)) {
      if (stack.length > 128) throw failure('KB_DETAIL_FORMAT');
      stack.push(node);
    }
  }
  return root;
}
function all(root, predicate) {
  const found = [], stack = root ? [root] : [];
  while (stack.length) {
    const node = stack.pop();
    if (typeof node === 'string') continue;
    if (predicate(node)) found.push(node);
    for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
  }
  return found;
}
const first = (root, predicate) => all(root, predicate)[0];
const byClass = (root, name) => first(root, node => hasClass(node, name));
const byId = (root, id) => first(root, node => node.attrs.id === id);
function content(node, omitDisabled = false) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (omitDisabled && hasClass(node, 'disable')) return '';
  return node.children.map(child => content(child, omitDisabled)).join(' ');
}
const textOf = (node, omitDisabled = false) => clean(content(node, omitDisabled)).replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s+,/g, ',');
function pairs(root, labelTag, valueTag, allowed) {
  const nodes = all(root, node => node.tag === labelTag || node.tag === valueTag);
  const result = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    if (nodes[i].tag !== labelTag || nodes[i + 1].tag !== valueTag) continue;
    const label = textOf(nodes[i]), value = textOf(nodes[i + 1]);
    if (allowed.has(label) && value) result.push({label, value: value.slice(0, 160)});
  }
  return result;
}
function selectedProduct(html, id) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = Object.fromEntries([...match[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(attr => [attr[1].toLowerCase(), decode(attr[2] ?? attr[3])]));
    if (attrs.property !== 'og:url') continue;
    try {
      const pageUrl = new URL(attrs.content);
      if (!['www.kbchachacha.com', 'm.kbchachacha.com'].includes(pageUrl.hostname) || pageUrl.searchParams.get('carSeq') !== id) throw failure('KB_DETAIL_FORMAT');
    } catch { throw failure('KB_DETAIL_FORMAT'); }
  }
  for (const match of html.matchAll(/<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    let data;
    try { data = JSON.parse(match[1]); } catch { continue; }
    const candidates = [data].flat();
    for (let index = 0; index < candidates.length && index < 100; index++) {
      const candidate = candidates[index];
      if (!candidate || typeof candidate !== 'object') continue;
      if (Array.isArray(candidate['@graph'])) candidates.push(...candidate['@graph']);
      if (![candidate['@type']].flat().includes('Product')) continue;
      for (const offer of [candidate.offers].flat()) {
        try {
          const url = new URL(offer?.url);
          if (url.origin === ORIGIN && url.pathname === '/public/car/detail.kbc' && url.searchParams.get('carSeq') === id) return {product: candidate, offer};
        } catch { /* unrelated or invalid structured data */ }
      }
    }
  }
  throw failure('KB_DETAIL_FORMAT');
}
function photosFor(product, id) {
  return [...new Set([product.image].flat().flatMap(value => {
    try {
      const url = new URL(typeof value === 'string' ? value : value?.url);
      if (url.protocol !== 'https:' || url.hostname !== 'img.kbchachacha.com' || url.port || url.username || url.password) return [];
      if (!url.pathname.startsWith('/IMG/carimg/') || !url.pathname.split('/').at(-1).startsWith(`${id}_`) || !/\.(?:jpe?g|png|webp)$/i.test(url.pathname)) return [];
      url.hash = '';
      return [url.href];
    } catch { return []; }
  }))].slice(0, 40);
}

export function parseKbDetail(html, id, fetchedAt = new Date().toISOString()) {
  if (!isKbCarId(id)) throw failure('KB_DETAIL_ID');
  if (typeof html !== 'string' || Buffer.byteLength(html) > MAX_BYTES) throw failure('KB_DETAIL_SIZE');
  const {product, offer} = selectedProduct(html, id);
  const title = clean(typeof product.name === 'string' ? product.name : '').slice(0, 200);
  if (!title) throw failure('KB_DETAIL_FORMAT');
  const numericPrice = /^\d+$/.test(String(offer.price)) ? Number(offer.price) : NaN;
  const price = offer.priceCurrency === 'KRW' && Number.isSafeInteger(numericPrice) && numericPrice > 0 ? numericPrice : null;
  const root = tree(html);
  const vehicle = byClass(root, 'car-detail-info');
  const specs = pairs(byClass(vehicle, 'detail-info-table'), 'th', 'td', SPEC_LABELS);
  const history = byClass(vehicle, 'detail-info02');
  const inspection = [];
  const historyCount = textOf(byClass(byId(root, 'btnCarHistoryView1'), 'vs-pill__value'));
  if (/^\d+건$/.test(historyCount)) inspection.push({label: '보험이력', value: historyCount});
  const accident = textOf(byId(history, 'btnCarHistoryView2'));
  if (accident) inspection.push({label: '보험사고정보', value: accident.slice(0, 80)});
  inspection.push(...pairs(history, 'dt', 'dd', HISTORY_LABELS));
  const checked = textOf(history).match(/보험사고정보 조회일자\s*:\s*(\d{4}\.\d{2}\.\d{2})/);
  if (checked) inspection.push({label: '보험사고정보 조회일자', value: checked[1]});
  if (textOf(byId(history, 'btnCarCheckView2')) === '내역보기') inspection.push({label: '성능점검기록부', value: '원문에서 내역보기 제공'});
  const warranty = byClass(root, 'etc-sec01');
  for (const box of all(warranty, node => hasClass(node, 'box-txt'))) {
    const parent = first(warranty, node => node.children.includes(box));
    const label = textOf(first(parent, node => node.tag === 'span'));
    const value = textOf(box);
    if (/^(차체\/일반|엔진\/주요)\s*\(/.test(label) && value) inspection.push({label: `제조사 보증 · ${label}`, value});
  }
  const optionList = byClass(byClass(root, 'car-option'), 'car-option-list');
  const options = all(optionList, node => node.tag === 'li' && /(?:^|\s)option(?:[1-9]|1[0-2])(?:\s|$)/.test(node.attrs.class || '') && !hasClass(node, 'disable'))
    .map(node => textOf(node, true)).filter(Boolean).map(value => value.slice(0, 160));
  const sellerRoot = byId(root, 'divSellerInfo');
  const location = byClass(byClass(sellerRoot, 'dealer-location'), 'map-txt');
  const locationLines = all(location, node => node.tag === 'p').map(node => textOf(node));
  const businessName = locationLines.find(value => /^상사명\s*:/.test(value))?.replace(/^상사명\s*:\s*/, '').slice(0, 100) || null;
  const address = locationLines.find(value => /^주소\s*:/.test(value))?.replace(/^주소\s*:\s*/, '') || '';
  const region = address.match(/^([가-힣]+)(?:\s+([가-힣]+(?:시|군|구)))?(?:\s+([가-힣]+(?:시|군|구)))?/)?.[0] || null;
  return {
    source: 'kb', id: `kb-${id}`, sourceUrl: `${ORIGIN}/public/car/detail.kbc?carSeq=${id}`,
    title, price, photos: photosFor(product, id), specs,
    optionGroups: options.length ? [{label: '주요옵션', items: [...new Set(options)]}] : [],
    highlights: [], inspection, seller: {businessName, region}, description: null, fetchedAt
  };
}

async function readBounded(response, signal) {
  if (Number(response.headers.get('content-length')) > MAX_BYTES) {
    await response.body?.cancel();
    throw failure('KB_DETAIL_SIZE');
  }
  if (!response.body) throw failure('KB_DETAIL_FORMAT');
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, {once: true});
  try {
    while (true) {
      signal.throwIfAborted();
      const {value, done} = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw failure('KB_DETAIL_SIZE'); }
      chunks.push(value);
    }
    return Buffer.concat(chunks, size).toString('utf8');
  } finally {
    signal.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}

export function createKbDetailProvider({fetchImpl = globalThis.fetch} = {}) {
  return async function getKbDetail({id, signal} = {}) {
    if (!isKbCarId(id)) throw failure('KB_DETAIL_ID');
    const boundedSignal = AbortSignal.any([AbortSignal.timeout(9000), ...(signal ? [signal] : [])]);
    boundedSignal.throwIfAborted();
    const response = await fetchImpl(`${ORIGIN}/public/car/detail.kbc?carSeq=${id}`, {method: 'GET', redirect: 'error', signal: boundedSignal, headers: {Accept: 'text/html'}});
    if (!response.ok) {
      await response.body?.cancel();
      throw failure('KB_DETAIL_HTTP', response.status);
    }
    const html = await readBounded(response, boundedSignal);
    return parseKbDetail(html, id);
  };
}
export const getKbDetail = createKbDetailProvider();
