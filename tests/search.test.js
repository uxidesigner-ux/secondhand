import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { filterListings, distanceKm, validateListing } from '../src/search.js';

const fixtures = JSON.parse(await readFile(new URL('../data/demo.json', import.meta.url), 'utf8'));
const first = fixtures[0];
const item = changes => ({ ...first, ...changes });

test('all 27 fictional fixtures conform to the feed contract; live feed stays empty', async () => {
  assert.equal(fixtures.length, 27);
  assert.ok(fixtures.every(validateListing));
  assert.ok(fixtures.every(entry => entry.demo === true && entry.id.startsWith('demo-')));
  assert.deepEqual(JSON.parse(await readFile(new URL('../data/listings.json', import.meta.url), 'utf8')), []);
});

test('keyword words combine with platform, category, price, condition and method', () => {
  const filtered = filterListings(fixtures, {
    query: '  아이폰   15 ', source: 'daangn', category: 'digital', minPrice: 700000,
    maxPrice: 800000, condition: 'like-new', method: 'direct', status: 'selling', region: '성수동',
  });
  assert.deepEqual(filtered.map(entry => entry.id), ['demo-01']);
  assert.equal(filterListings(fixtures, { query: '아이폰', method: 'shipping', source: 'daangn' }).length, 0);
  assert.equal(filterListings(fixtures, { query: '없는제품' }).length, 0);
});

test('keyword normalization supports case, fullwidth characters and multiple tokens', () => {
  const rows = [item({ title: 'SONY WH-1000XM5 헤드폰' }), item({ id: 'other', title: 'SONY 카메라' })];
  assert.equal(filterListings(rows, { query: 'ｓｏｎｙ XM5' }).length, 1);
});

test('inclusive price bounds handle free items, blank values and inverted ranges', () => {
  assert.equal(filterListings(fixtures, { minPrice: 790000, maxPrice: 790000 })[0].id, 'demo-01');
  assert.equal(filterListings(fixtures, { maxPrice: '0' })[0].id, 'demo-17');
  assert.equal(filterListings(fixtures, { minPrice: '', maxPrice: '' }).length, 27);
  assert.equal(filterListings(fixtures, { minPrice: 100, maxPrice: 0 }).length, 0);
});

test('car mode composes manufacturer, model year, mileage, fuel and platform filters', () => {
  assert.equal(filterListings(fixtures, { kind: 'goods' }).length, 18);
  assert.equal(filterListings(fixtures, { kind: 'car' }).length, 9);
  assert.deepEqual(filterListings(fixtures, {
    kind: 'car', brand: '기아', minYear: 2023, maxMileage: 22000, fuel: 'hybrid', source: 'kb',
  }).map(row => row.id), ['demo-car-02']);
  assert.equal(filterListings(fixtures, { kind: 'goods', fuel: 'electric' }).length, 0);
  const car = fixtures.find(row => row.kind === 'car');
  assert.equal(validateListing({ ...car, mileage: -1 }), false);
  assert.equal(validateListing({ ...car, year: 1800 }), false);
  assert.equal(validateListing({ ...car, fuel: 'rocket' }), false);
  assert.equal(validateListing({ ...car, url: 'https://car.encar.com/list' }), true);
});

test('distance filtering excludes unknown coordinates and includes exact zero radius', () => {
  const rows = [first, item({ id: 'far', lat: 35.1796, lng: 129.0756 }), item({ id: 'unknown', lat: null, lng: null })];
  assert.deepEqual(filterListings(rows, { coords: first, radius: 0 }).map(row => row.id), [first.id]);
  assert.deepEqual(filterListings(rows, { coords: first, radius: 10 }).map(row => row.id), [first.id]);
  assert.equal(distanceKm(first, first), 0);
  assert.ok(distanceKm(first, rows[1]) > 300);
  assert.equal(distanceKm(first, rows[2]), Infinity);
});

test('sorts without mutating input, puts unknown distance last, uses newest tie break', () => {
  const rows = [item({ id: 'old', price: 50, publishedAt: '2025-01-01T00:00:00Z' }), item({ id: 'new', price: 50, publishedAt: '2026-01-01T00:00:00Z' }), item({ id: 'low', price: 10, lat: null, lng: null })];
  const snapshot = structuredClone(rows);
  assert.deepEqual(filterListings(rows, { sort: 'price-asc' }).map(row => row.id), ['low', 'new', 'old']);
  assert.deepEqual(filterListings(rows, { sort: 'price-desc' }).map(row => row.id), ['new', 'old', 'low']);
  assert.equal(filterListings(rows, { sort: 'recent' })[0].id, 'low');
  assert.equal(filterListings(rows, { sort: 'distance', coords: first }).at(-1).id, 'low');
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
  const unknown = item({ demo: false, condition: 'unknown', category: 'unknown', methods: [], status: 'unknown', publishedAt: null, lat: null, lng: null });
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
 const rows = [item({id:'z',publishedAt:null}),item({id:'a',publishedAt:null})];
 assert.deepEqual(filterListings(rows,{sort:'recent'}).map(i=>i.id),['z','a']);
 assert.equal(validateListing(item({updatedAt:'nonsense'})),false);
});
