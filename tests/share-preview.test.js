import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SERVICE_SHARE_URL,PROTECTED_SEARCH_URL} from '../src/config.js';

const read=path=>readFile(new URL('../'+path,import.meta.url));
const metadata=html=>Object.fromEntries([...html.matchAll(/<meta\s+(?:property|name)="([^"]+)"\s+content="([^"]*)"\s*\/?>/g)].map(match=>[match[1],match[2]]));

test('share crawlers can read a complete public image card without running JavaScript',async()=>{
  for(const file of ['index.html','share/index.html']){
    const html=(await read(file)).toString();
    const tags=metadata(html.split('</head>')[0]);
    assert.equal(tags['og:type'],'website');
    assert.equal(tags['og:url'],SERVICE_SHARE_URL);
    assert.equal(tags['og:locale'],'ko_KR');
    assert.equal(tags['og:description'],'원하는 제품, 일단 찾아봐');
    assert.equal(tags['twitter:card'],'summary_large_image');
    assert.equal(tags['twitter:image'],tags['og:image']);
    assert.equal(tags['og:image:secure_url'],tags['og:image']);
    assert.equal(tags['og:image:type'],'image/png');
    assert.ok(tags['og:image:alt'].includes('USED'));
    const image=new URL(tags['og:image']);
    assert.equal(image.origin,new URL(SERVICE_SHARE_URL).origin);
    assert.ok(image.pathname.startsWith('/secondhand/assets/share/'));
    assert.equal(image.search,'');
    assert.equal(image.hash,'');
  }
});

test('the advertised card dimensions match a real public PNG asset',async()=>{
  const tags=metadata((await read('share/index.html')).toString());
  const image=new URL(tags['og:image']);
  const bytes=await read(image.pathname.replace('/secondhand/',''));
  assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  assert.equal(bytes.readUInt32BE(16),Number(tags['og:image:width']));
  assert.equal(bytes.readUInt32BE(20),Number(tags['og:image:height']));
  assert.equal(bytes.readUInt32BE(16),1200);
  assert.equal(bytes.readUInt32BE(20),630);
});

test('public sharing keeps the protected app destination fixed and avoids legacy app installation',async()=>{
  const html=(await read('share/index.html')).toString();
  assert.ok(html.includes(`<link rel="canonical" href="${SERVICE_SHARE_URL}">`));
  assert.ok(html.includes(`<a href="${PROTECTED_SEARCH_URL}">`));
  assert.ok(html.includes(`location.replace('${PROTECTED_SEARCH_URL}')`));
  assert.equal(/http-equiv=["']refresh|rel=["']manifest|location\.search|URLSearchParams|_vercel_share|bypass/i.test(html),false);
  assert.notEqual(SERVICE_SHARE_URL,PROTECTED_SEARCH_URL);
});
