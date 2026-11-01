import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalEntryUrl,getCanonicalRedirect,PROTECTED_SEARCH_URL} from '../src/config.js';

test('legacy Pages home forwards immediately to the fixed protected home',()=>{
  assert.equal(getCanonicalRedirect('https://uxidesigner-ux.github.io/secondhand/'),PROTECTED_SEARCH_URL);
});

test('search and internal details preserve valid route state',()=>{
  const incoming=new URL('https://uxidesigner-ux.github.io/secondhand/');
  incoming.search=new URLSearchParams({view:'detail',kind:'car',q:'재규어 XF',source:'kb',item:'kb-28882930',install:'1'});
  const target=new URL(getCanonicalRedirect(incoming.href));
  assert.equal(target.origin,'https://used-search-api.vercel.app');
  assert.equal(target.pathname,'/');
  assert.deepEqual(Object.fromEntries(target.searchParams),{kind:'car',view:'detail',q:'재규어 XF',source:'kb',item:'kb-28882930',install:'1'});
  const goods=new URL(canonicalEntryUrl('https://uxidesigner-ux.github.io/secondhand/?view=detail&item=daangn%3A%EC%95%84%EC%9D%B4%ED%8F%B0-abc&source=daangn&mode=demo'));
  assert.equal(goods.searchParams.get('item'),'daangn:아이폰-abc');
  assert.equal(goods.searchParams.has('mode'),false);
});

test('authentication, location, destination parameters and fragments are never forwarded',()=>{
  const incoming='https://user:secret@uxidesigner-ux.github.io/secondhand/?q=카메라&next=https://evil.test&redirect=https://evil.test&_vercel_share=secret&token=secret&lat=37.5&lng=127#secret';
  const target=new URL(getCanonicalRedirect(incoming));
  assert.equal(target.origin,'https://used-search-api.vercel.app');
  assert.equal(target.username,'');assert.equal(target.password,'');assert.equal(target.hash,'');
  assert.deepEqual([...target.searchParams.keys()],['q']);
});

test('malformed and oversized route values cannot expand the forwarding contract',()=>{
  const target=new URL(canonicalEntryUrl('https://uxidesigner-ux.github.io/secondhand/?kind=wrong&source=kb&view=wrong&item=kb-1&mode=live&install=2&q='+encodeURIComponent('a'.repeat(100)+'\n')));
  assert.deepEqual([...target.searchParams.keys()],['q']);
  assert.equal(target.searchParams.get('q').length,80);
  for(const item of ['x'.repeat(513),'kb-1\n']){
    const url=new URL(canonicalEntryUrl('https://uxidesigner-ux.github.io/secondhand/?view=detail&item='+encodeURIComponent(item)));
    assert.equal(url.searchParams.has('item'),false);
  }
  assert.equal(canonicalEntryUrl('invalid'),PROTECTED_SEARCH_URL);
});

test('Vercel, local development, and lookalike hosts never create a redirect loop',()=>{
  for(const url of ['https://used-search-api.vercel.app/','https://used-search-api.vercel.app/?view=results&q=아이폰',
    'http://127.0.0.1:4173/','http://localhost:4173/','https://uxidesigner-ux.github.io.evil.test/','invalid']){
    assert.equal(getCanonicalRedirect(url),null,url);
  }
});
