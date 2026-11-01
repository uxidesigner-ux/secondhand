import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLocation, locationFromHistory, locationSnapshot, locationText} from '../src/location-state.js';

const defaults = {region: '', coords: null, radius: 5, locationName: ''};
const position = {lat: 37.5445, lng: 127.056};

test('complete GPS selection survives a history snapshot and restoration without a region filter', () => {
  const selected = {region: '서울', coords: position, radius: 10, locationName: '성수동'};
  const expected = {region: '', coords: position, radius: 10, locationName: '성수동'};
  const snapshot = locationSnapshot(selected);
  assert.deepEqual(snapshot, expected);
  assert.deepEqual(locationFromHistory({usedRoute: true, location: snapshot, region: '오래된 지역'}), expected);
  assert.equal(locationText(snapshot), '성수동 · 10km');
  assert.equal(selected.region, '서울');
});

test('restoring manual, GPS and nationwide states replaces all location fields', () => {
  const manual = {region: '강남구', coords: null, radius: 3, locationName: ''};
  const gps = {region: '', coords: position, radius: 30, locationName: '성수동'};
  let current = {...gps};
  for (const selection of [manual, gps, defaults]) {
    Object.assign(current, locationFromHistory({usedRoute: true, location: selection}));
    assert.deepEqual(current, selection);
  }
  assert.equal(locationText(manual), '강남구');
  assert.equal(locationText(defaults), '');
});

test('GPS display name never becomes a manual region filter and requires valid coordinates', () => {
  assert.deepEqual(normalizeLocation({region: '서울', coords: position, radius: 1, locationName: '성수동'}),
    {region: '', coords: position, radius: 1, locationName: '성수동'});
  assert.deepEqual(normalizeLocation({region: '강남구', coords: null, radius: 3, locationName: '성수동'}),
    {region: '강남구', coords: null, radius: 3, locationName: ''});
  assert.equal(locationText({coords: position, radius: 100}), '내 위치 · 100km');
  assert.equal(locationText({locationName: '성수동'}), '');
});

test('legacy history restores only its manual region and never retains obsolete GPS fields', () => {
  assert.deepEqual(locationFromHistory({usedRoute: true, region: ' 서울 ', coords: position, radius: 100, locationName: '성수동'}),
    {region: '서울', coords: null, radius: 5, locationName: ''});
  assert.deepEqual(locationFromHistory({usedRoute: true, region: ''}), defaults);
  assert.deepEqual(locationFromHistory({usedRoute: true, region: '서울', location: null}), defaults);
});

test('malformed history and location values restore a fresh default selection', () => {
  for (const entry of [undefined, null, false, '서울', [], {}, {usedRoute: false}, {usedRoute: 'true'}, {usedRoute: true, location: []}, {usedRoute: true, location: 5}]) {
    assert.deepEqual(locationFromHistory(entry), defaults);
  }
  for (const value of [undefined, null, false, '서울', [], 5]) assert.deepEqual(normalizeLocation(value), defaults);
  assert.deepEqual(locationFromHistory({usedRoute: true, location: {region: {}, coords: [], locationName: []}}), defaults);
});

test('coordinates are finite numbers in geographic range, including zero and exact boundaries', () => {
  for (const coords of [{lat: 0, lng: 0}, {lat: -90, lng: -180}, {lat: 90, lng: 180}]) {
    assert.deepEqual(normalizeLocation({coords}).coords, coords);
  }
  for (const coords of [
    null, [], {}, {lat: 37}, {lng: 127}, {lat: '37', lng: 127}, {lat: 37, lng: '127'},
    {lat: NaN, lng: 127}, {lat: 37, lng: Infinity}, {lat: -Infinity, lng: 127},
    {lat: 90.01, lng: 0}, {lat: -90.01, lng: 0}, {lat: 0, lng: 180.01}, {lat: 0, lng: -180.01},
  ]) {
    const result = normalizeLocation({region: '서울', coords, locationName: '성수동'});
    assert.equal(result.coords, null);
    assert.equal(result.region, '서울');
    assert.equal(result.locationName, '');
  }
});

test('radius only accepts supported numeric distances', () => {
  for (const radius of [1, 3, 5, 10, 30, 100]) assert.equal(normalizeLocation({radius}).radius, radius);
  for (const radius of [undefined, null, '', '10', true, 0, -1, 1.5, 11, Infinity, NaN]) {
    assert.equal(normalizeLocation({radius}).radius, 5);
  }
});

test('manual and GPS names remove control characters, trim and bound their length', () => {
  assert.equal(normalizeLocation({region: ' \u0000강남\n구\u007f '}).region, '강남구');
  assert.equal(normalizeLocation({region: '가'.repeat(80)}).region, '가'.repeat(50));
  assert.equal(normalizeLocation({region: 123}).region, '');
  assert.equal(normalizeLocation({coords: position, locationName: ' \t성수동\u0000 '}).locationName, '성수동');
  assert.equal(normalizeLocation({coords: position, locationName: '나'.repeat(80)}).locationName, '나'.repeat(50));
});

test('normalization, snapshots and history restoration copy coordinates and retain no unrelated data', () => {
  const input = Object.freeze({region: '', coords: Object.freeze({...position, accuracy: 10}), radius: 5, locationName: '성수동', query: 'private'});
  const normalized = normalizeLocation(input);
  const snapshot = locationSnapshot(input);
  const restored = locationFromHistory({usedRoute: true, location: snapshot});
  for (const result of [normalized, snapshot, restored]) {
    assert.notEqual(result, input);
    assert.notEqual(result.coords, input.coords);
    assert.deepEqual(Object.keys(result), ['region', 'coords', 'radius', 'locationName']);
    assert.deepEqual(Object.keys(result.coords), ['lat', 'lng']);
  }
  assert.notEqual(restored.coords, snapshot.coords);
  snapshot.coords.lat = 0;
  assert.equal(restored.coords.lat, position.lat);
  assert.equal(input.coords.lat, position.lat);
});
