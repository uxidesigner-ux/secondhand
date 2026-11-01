import test from 'node:test';
import assert from 'node:assert/strict';
import { filterListings, distanceKm, validateListing } from '../src/search.js';

// Synthetic records stay inside unit tests; they are never part of a product feed.
const first = {
  id: 'test-first', kind: 'goods', title: '아이폰 15', price: 790000,
  source: 'daangn', sourceName: '당근', category: 'digital', condition: 'like-new',
  methods: ['direct'], status: 'selling', region: '서울 성동구 성수동',
  lat: 37.5445, lng: 127.056, publishedAt: '2026-01-02T00:00:00Z',
  url: 'https://www.daangn.com/kr/buy-sell/test-record',
};
const item = changes => ({ ...first, ...changes });

test('rejects previous sample records while accepting records without sample markers', () => {
  assert.equal(validateListing(first), true);
  assert.equal(validateListing(item({ demo: false })), true);
  for (const changes of [{ demo: true }, { id: 'demo-01' }, { id: 'DEMO-car-01', demo: false }, { id: 'demo' }]) {
    assert.equal(validateListing(item(changes)), false);
    assert.deepEqual(filterListings([item(changes)]), []);
  }
});

test('keyword words combine with platform, category, price, condition and method', () => {
  const options = {
    query: '  아이폰   15 ', source: 'daangn', category: 'digital', minPrice: 700000,
    maxPrice: 800000, condition: 'like-new', method: 'direct', status: 'selling', region: '성수동',
  };
  const excluded = [
    { title: '아이폰 14' }, { source: 'bunjang', sourceName: '번개장터', url: 'https://m.bunjang.co.kr/products/test-record' },
    { category: 'home' }, { price: 699999 }, { price: 800001 }, { condition: 'used' },
    { methods: ['shipping'] }, { status: 'reserved' }, { region: '서울 마포구' },
  ].map((changes, index) => item({ id: `test-excluded-${index}`, ...changes }));
  assert.ok(excluded.every(validateListing));
  assert.deepEqual(filterListings([first, ...excluded], options).map(entry => entry.id), ['test-first']);
  assert.equal(filterListings([first], { query: '아이폰', method: 'shipping', source: 'daangn' }).length, 0);
  assert.equal(filterListings([first], { query: '없는제품' }).length, 0);
});

test('keyword normalization supports case, fullwidth characters and multiple tokens', () => {
  const rows = [item({ title: 'SONY WH-1000XM5 헤드폰' }), item({ id: 'test-other', title: 'SONY 카메라' })];
  assert.equal(filterListings(rows, { query: 'ｓｏｎｙ XM5' }).length, 1);
});

test('inclusive price bounds handle free items, blank values and inverted ranges', () => {
  const rows = [first, item({ id: 'test-free', price: 0 }), item({ id: 'test-expensive', price: 800000 })];
  assert.deepEqual(filterListings(rows, { minPrice: 790000, maxPrice: 790000 }).map(row => row.id), ['test-first']);
  assert.deepEqual(filterListings(rows, { maxPrice: '0' }).map(row => row.id), ['test-free']);
  assert.equal(filterListings(rows, { minPrice: '', maxPrice: '' }).length, rows.length);
  assert.equal(filterListings(rows, { minPrice: 100, maxPrice: 0 }).length, 0);
});

test('car mode composes manufacturer, model year, mileage, fuel and platform filters', () => {
  const car = item({ id: 'test-car', kind: 'car', category: 'car', source: 'encar', sourceName: '엔카',
    url: 'https://fem.encar.com/cars/detail/1', brand: '현대', year: 2022, mileage: 30000, fuel: 'gasoline' });
  const matching = { ...car, id: 'test-kb', source: 'kb', sourceName: 'KB차차차',
    url: 'https://www.kbchachacha.com/public/car/detail.kbc?carSeq=1', brand: '기아', year: 2023, mileage: 22000, fuel: 'hybrid' };
  const rows = [first, car, matching];
  const options = {
    kind: 'car', brand: '기아', minYear: 2023, maxMileage: 22000, fuel: 'hybrid', source: 'kb',
  };
  assert.equal(filterListings(rows, { kind: 'goods' }).length, 1);
  assert.equal(filterListings(rows, { kind: 'car' }).length, 2);
  assert.deepEqual(filterListings(rows, options).map(row => row.id), ['test-kb']);
  for (const changes of [{ brand: '현대' }, { year: 2022 }, { mileage: 22001 }, { fuel: 'gasoline' },
    { source: 'kcar', url: 'https://www.kcar.com/bc/detail/carInfoDtl?i_sCarCd=1' }]) {
    assert.deepEqual(filterListings([{ ...matching, ...changes }], options), []);
  }
  assert.equal(filterListings(rows, { kind: 'goods', fuel: 'electric' }).length, 0);
  assert.equal(validateListing({ ...car, mileage: -1 }), false);
  assert.equal(validateListing({ ...car, year: 1800 }), false);
  assert.equal(validateListing({ ...car, fuel: 'rocket' }), false);
  assert.equal(validateListing({ ...car, url: 'https://car.encar.com/list' }), true);
});

test('distance filtering excludes unknown coordinates and includes exact zero radius', () => {
  const rows = [first, item({ id: 'test-far', lat: 35.1796, lng: 129.0756 }), item({ id: 'test-unknown', lat: null, lng: null })];
  assert.deepEqual(filterListings(rows, { coords: first, radius: 0 }).map(row => row.id), [first.id]);
  assert.deepEqual(filterListings(rows, { coords: first, radius: 10 }).map(row => row.id), [first.id]);
  assert.equal(distanceKm(first, first), 0);
  assert.ok(distanceKm(first, rows[1]) > 300);
  assert.equal(distanceKm(first, rows[2]), Infinity);
});

test('sorts without mutating input, puts unknown distance last, uses newest tie break', () => {
  const rows = [item({ id: 'test-old', price: 50, publishedAt: '2025-01-01T00:00:00Z' }), item({ id: 'test-new', price: 50, publishedAt: '2026-01-01T00:00:00Z' }), item({ id: 'test-low', price: 10, lat: null, lng: null })];
  const snapshot = structuredClone(rows);
  assert.deepEqual(filterListings(rows, { sort: 'price-asc' }).map(row => row.id), ['test-low', 'test-new', 'test-old']);
  assert.deepEqual(filterListings(rows, { sort: 'price-desc' }).map(row => row.id), ['test-new', 'test-old', 'test-low']);
  assert.equal(filterListings(rows, { sort: 'recent' })[0].id, 'test-low');
  assert.equal(filterListings(rows, { sort: 'distance', coords: first }).at(-1).id, 'test-low');
  assert.deepEqual(rows, snapshot);
});

test('rejects dangerous, spoofed, cross-provider and non-HTTPS listing URLs', () => {
  for (const url of ['javascript:alert(1)', 'http://www.daangn.com/item', 'https://daangn.com.evil.test/', 'https://evil.test/?url=https://daangn.com', 'https://x:secret@www.daangn.com/', 'https://web.joongna.com/item', 'https://www.daangn.com:8443/item']) {
    assert.equal(validateListing(item({ url })), false, url);
  }
  assert.equal(validateListing(item({ image: 'javascript:alert(1)' })), false);
  assert.equal(validateListing(item({ url: 'https://daangn.com/kr/buy-sell/' })), true);
});

test('rejects malformed prices, coordinates, dates and enum fields', () => {
  for (const changes of [{ price: -1 }, { price: Infinity }, { price: '100' }, { price: 0.5 }, { lat: 91 }, { lng: -181 }, { lat: null }, { lat: '37.5' }, { publishedAt: 'invalid' }, { status: 'bogus' }, { methods: ['bogus'] }, { category: 'bad' }, { title: '' }]) {
    assert.equal(validateListing(item(changes)), false, JSON.stringify(changes));
  }
  assert.equal(filterListings([null, {}, first]).length, 1);
  assert.equal(filterListings(null).length, 0);
});


test('real listings retain unknown metadata without inventing condition, time or location', () => {
  const unknown = item({ condition: 'unknown', category: 'unknown', methods: [], status: 'unknown', publishedAt: null, lat: null, lng: null });
  assert.equal(validateListing(unknown), true);
  assert.equal(filterListings([unknown], { status: 'selling' }).length, 0);
  assert.equal(filterListings([unknown], { method: 'direct' }).length, 0);
  assert.equal(filterListings([unknown], { sort: 'recent' }).length, 1);
  assert.equal(filterListings([unknown, first], { sort: 'recent' })[0], first);
  const car = { ...unknown, kind: 'car', category: 'car', source: 'encar', sourceName: '엔카', url: 'https://car.encar.com/detail/car/1', brand: null, year: null, mileage: null, fuel: null };
  assert.equal(validateListing(car), true);
  assert.equal(filterListings([car], { minYear: 2020 }).length, 0);
});


test('unknown dates preserve upstream result order instead of sorting older IDs first', () => {
 const rows = [item({id:'test-z',publishedAt:null}),item({id:'test-a',publishedAt:null})];
 assert.deepEqual(filterListings(rows,{sort:'recent'}).map(i=>i.id),['test-z','test-a']);
 assert.equal(validateListing(item({updatedAt:'nonsense'})),false);
});
