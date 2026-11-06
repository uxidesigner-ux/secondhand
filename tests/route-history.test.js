import test from 'node:test';
import assert from 'node:assert/strict';
import {createRouteHistory} from '../src/route-history.js';

function setup() {
  let entry = {usedRoute:true,depth:0,page:'search',kind:'car',source:'all',query:'그랜저',scrollY:0};
  const calls = [], history = {
    replaceState(value, unused, url) { this.state = structuredClone(value); calls.push(['replace',url]); },
    pushState(value, unused, url) { this.state = structuredClone(value); calls.push(['push',url]); },
    back() { calls.push(['back']); },
  };
  const router = createRouteHistory({history,snapshot:()=>entry,url:()=>`https://used.test/?view=${entry.page}`});
  return {router,history,calls,get entry(){return entry;},setEntry(value){entry={...value};}};
}

test('a rejected History snapshot cannot swallow a single Back action',()=>{
  const fixture=setup();
  fixture.history.replaceState=()=>{throw new DOMException('Rate limit exceeded','SecurityError');};
  assert.equal(fixture.router.sync(),false);
  assert.equal(fixture.router.back(),true);
  assert.deepEqual(fixture.calls,[['back']]);
});

test('rapid Back taps and late detail updates cannot overwrite the returning entry',()=>{
  const fixture=setup();
  fixture.setEntry({...fixture.entry,page:'detail',detailId:'encar-41942591',depth:1});
  assert.equal(fixture.router.push(),true);
  assert.equal(fixture.router.back(),true);
  fixture.setEntry({...fixture.entry,scrollY:800,detailItem:{title:'Late detail response'}});
  assert.equal(fixture.router.sync(),false);
  assert.equal(fixture.router.push(),false);
  assert.equal(fixture.router.back(),false);
  assert.deepEqual(fixture.calls.map(call=>call[0]),['push','back']);
  fixture.router.restored();
  fixture.setEntry({usedRoute:true,depth:0,page:'search',kind:'car',source:'all',query:'그랜저',scrollY:540});
  assert.equal(fixture.router.sync(),true);
  assert.equal(fixture.history.state.page,'search');
});

test('long page scrolling writes no History entries but restores each originating list position',()=>{
  const fixture=setup();
  fixture.router.sync();
  const search={...fixture.entry};
  for(let i=1;i<=2000;i++)fixture.router.rememberScroll(i);
  assert.equal(fixture.calls.length,1);
  assert.equal(fixture.router.scrollFor(search),2000);
  fixture.setEntry({...search,page:'saved',depth:1});
  const saved={...fixture.entry};
  fixture.router.rememberScroll(320);
  fixture.setEntry({...saved,page:'detail',detailId:'kb-28882930',depth:2});
  fixture.router.rememberScroll(900);
  assert.equal(fixture.router.scrollFor(saved),320);
  assert.equal(fixture.router.scrollFor(search),2000);
  assert.equal(fixture.router.scrollFor({...saved,depth:20,scrollY:174}),174,'reload uses the stored browser snapshot');
});

test('rendering an unchanged route does not consume additional History writes',()=>{
  const fixture=setup();
  for(let i=0;i<100;i++)assert.equal(fixture.router.sync(),true);
  assert.equal(fixture.calls.length,1);
  fixture.setEntry({...fixture.entry,page:'detail',depth:1,detailId:'kcar-EC61424432'});
  assert.equal(fixture.router.push(),true);
  assert.equal(fixture.router.sync(),true);
  assert.deepEqual(fixture.calls.map(call=>call[0]),['replace','push']);
});

test('failed traversal releases the lock so the app can use its direct-detail fallback',()=>{
  const fixture=setup();
  fixture.history.back=()=>{throw new DOMException('Document is not active','SecurityError');};
  assert.equal(fixture.router.back(),false);
  assert.equal(fixture.router.isPending(),false);
  fixture.setEntry({...fixture.entry,page:'home',depth:0});
  assert.equal(fixture.router.sync(),true);
  assert.equal(fixture.history.state.page,'home');
});
