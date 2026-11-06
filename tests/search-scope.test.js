import test from 'node:test';
import assert from 'node:assert/strict';
import {searchScope,isInSearchScope,searchRequestKey,normalizedSearchQuery} from '../src/search-scope.js';
import {createSearchCache} from '../src/search-cache.js';

test('all means only the services in the home-selected category',()=>{
  assert.deepEqual(searchScope('goods').providers,['daangn','joongna','bunjang','other']);
  assert.deepEqual(searchScope('car').providers,['encar','kb','kcar']);
  assert.equal(isInSearchScope({kind:'car',source:'encar'},searchScope('goods')),false);
  assert.equal(isInSearchScope({kind:'goods',source:'bunjang'},searchScope('car')),false);
  assert.equal(isInSearchScope({kind:'car',source:'kb'},searchScope('car')),true);
});

test('specific service filters never admit another category or provider',()=>{
  const scope=searchScope('car','kb');
  assert.deepEqual(scope,{kind:'car',source:'kb',providers:['kb']});
  assert.equal(isInSearchScope({kind:'car',source:'encar'},scope),false);
  assert.equal(isInSearchScope({kind:'goods',source:'kb'},scope),false);
  assert.deepEqual(searchScope('goods','encar'),searchScope('goods'));
  assert.deepEqual(searchScope('car','bunjang'),searchScope('car'));
  assert.deepEqual(searchScope('invalid','invalid'),searchScope('goods'));
  scope.providers.push('encar');
  assert.deepEqual(searchScope('car','kb').providers,['kb']);
});

test('continuing searches keep category and source; local filters do not split network cache keys',()=>{
  const before={kind:'car',source:'kb',query:'  ＢＭＷ   ５  '};
  const equivalent={...before,query:'BMW 5',sort:'price-asc',region:'서울',minPrice:10000000};
  assert.equal(searchRequestKey(before),searchRequestKey(equivalent));
  assert.notEqual(searchRequestKey(before),searchRequestKey({...before,query:'그랜저'}));
  assert.notEqual(searchRequestKey(before),searchRequestKey({...before,source:'encar'}));
  assert.notEqual(searchRequestKey(before),searchRequestKey({...before,kind:'goods',source:'all'}));
  assert.equal(normalizedSearchQuery('가'.repeat(100)).length,80);
});

const payload=()=>({items:[{id:'kb-123',title:'그랜저'}],providers:[{source:'kb',status:'ok'}],fetchedAt:'2026-11-06T00:00:00Z'});

test('repeated search results expire after three minutes and remain isolated from UI mutations',()=>{
  let time=1_000;
  const cache=createSearchCache({now:()=>time});
  const original=payload();
  cache.put('car:kb',original);
  original.items[0].title='mutated';
  const first=cache.get('car:kb');
  assert.equal(first.items[0].title,'그랜저');
  first.providers[0].status='error';
  assert.equal(cache.get('car:kb').providers[0].status,'ok');
  time+=179_999;
  assert.ok(cache.get('car:kb'));
  time+=1;
  assert.equal(cache.get('car:kb'),null);
});

test('search memory is bounded and least recently used searches are evicted',()=>{
  const cache=createSearchCache({maxEntries:2});
  cache.put('first',payload());cache.put('second',payload());
  cache.get('first');cache.put('third',payload());
  assert.equal(cache.get('second'),null);
  assert.ok(cache.get('first'));assert.ok(cache.get('third'));
});

test('errors and provider outages are not retained as successful searches',()=>{
  const cache=createSearchCache();
  for(const failure of [null,{error:'Too many requests'},{items:[],providers:[]},
    {items:[],providers:[{source:'kb',status:'error'}]},
    {items:[],providers:[{source:'kb',status:'unavailable'}]}]){
    assert.equal(cache.put('failed',failure),false);
    assert.equal(cache.get('failed'),null);
  }
  assert.equal(cache.put('empty',{items:[],providers:[{source:'kb',status:'ok'}]}),true);
  assert.deepEqual(cache.get('empty').items,[]);
});
