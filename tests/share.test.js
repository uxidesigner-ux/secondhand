import test from 'node:test';
import assert from 'node:assert/strict';
import {shareService} from '../src/share.js';

const url='https://uxidesigner-ux.github.io/secondhand/share/';

test('native sharing passes only the fixed service entrance and preserves its receiver',async()=>{
  const browser={
    location:{href:'https://used-search-api.vercel.app/?token=private&lat=37.5#private'},
    async share(data){
      assert.equal(this,browser);
      assert.deepEqual(data,{title:'USED',text:'원하는 제품, 일단 찾아봐',url});
    },
    clipboard:{writeText(){assert.fail('Successful native sharing must not copy');}},
  };
  assert.deepEqual(await shareService(browser),{status:'shared',url});
});

test('cancelling the native sheet is quiet and never copies to clipboard',async()=>{
  const browser={share:async()=>{throw Object.assign(new Error('Dismissed'),{name:'AbortError'});},
    clipboard:{writeText(){assert.fail('Cancellation must not trigger fallback');}}};
  assert.deepEqual(await shareService(browser),{status:'cancelled',url});
});

test('unsupported sharing falls back to copying the service entrance',async()=>{
  let copied;
  const clipboard={async writeText(value){assert.equal(this,clipboard);copied=value;}};
  assert.deepEqual(await shareService({clipboard}),{status:'copied',url});
  assert.equal(copied,url);
});

test('share rejection and canShare rejection still offer clipboard fallback',async()=>{
  for(const native of [
    {share:async()=>{throw new Error('Share unavailable');}},
    {canShare:()=>false,share:()=>assert.fail('Unsupported payload must not open native sheet')},
  ]){
    let copied;
    assert.deepEqual(await shareService({...native,clipboard:{writeText:async value=>{copied=value;}}}),{status:'copied',url});
    assert.equal(copied,url);
  }
});

test('clipboard denial or missing APIs returns a manual copy path without throwing',async()=>{
  for(const browser of [{},{clipboard:{writeText:async()=>{throw new Error('Denied');}}}]){
    assert.deepEqual(await shareService(browser),{status:'manual',url});
  }
});
