import test from 'node:test';
import assert from 'node:assert/strict';
import {createSplash} from '../src/splash.js';

function startupEnvironment(t,{reduced=false}={}) {
  const elements=new Map();
  const element=()=>({textContent:'',style:{},dataset:{},inert:true,attributes:{},removed:false,
    classList:{values:new Set(['booting']),add(value){this.values.add(value);},remove(value){this.values.delete(value);}},
    setAttribute(key,value){this.attributes[key]=value;},removeAttribute(key){delete this.attributes[key];},remove(){this.removed=true;}});
  for(const selector of ['#startup-splash','#startup-progress','#startup-percent','#startup-bar','#startup-message','.app'])elements.set(selector,element());
  const document={querySelector:selector=>elements.get(selector),documentElement:element()};
  const window=new EventTarget();window.matchMedia=()=>({matches:reduced});window.__usedBootWatchdog=99;
  const frames=new Map(),timers=new Map();let next=100,time=0;
  const globals={document,window,performance:{now:()=>time},
    requestAnimationFrame:callback=>{const id=++next;frames.set(id,callback);return id;},cancelAnimationFrame:id=>frames.delete(id),
    setTimeout:callback=>{const id=++next;timers.set(id,callback);return id;},clearTimeout:id=>timers.delete(id)};
  for(const [key,value] of Object.entries(globals)){
    const descriptor=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
    t.after(()=>{if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});
  }
  return {elements,window,document,frames,
    tick(count=1){for(let i=0;i<count;i++){time+=16;const active=[...frames.values()];frames.clear();active.forEach(callback=>callback(time));}},
    flushTimers(){const active=[...timers.values()];timers.clear();active.forEach(callback=>callback());}};
}

test('startup reaches 100 only after shell completion and then unlocks the app',async t=>{
  const env=startupEnvironment(t),splash=createSplash();
  splash.advance(40);env.tick(70);
  assert.equal(env.elements.get('#startup-percent').textContent,'40');
  assert.equal(env.elements.get('.app').inert,true);
  splash.advance(90);env.tick(70);
  assert.equal(env.elements.get('#startup-progress').attributes['aria-valuenow'],'90');
  const finished=splash.finish();env.tick(70);
  assert.equal(env.elements.get('#startup-percent').textContent,'100');
  assert.equal(env.elements.get('#startup-bar').style.transform,'scaleX(1)');
  env.flushTimers();await finished;env.flushTimers();
  assert.equal(env.elements.get('.app').inert,false);
  assert.equal(env.document.documentElement.classList.values.has('booting'),false);
  assert.equal(env.elements.get('#startup-splash').removed,true);
});

test('startup failure leaves a retry state and never reports successful completion',async t=>{
  const env=startupEnvironment(t),splash=createSplash();
  splash.advance(40);env.tick(10);splash.fail();
  const before=env.elements.get('#startup-percent').textContent;
  splash.advance(90);await splash.finish();env.tick(70);
  assert.equal(env.elements.get('#startup-percent').textContent,before);
  assert.notEqual(before,'100');
  assert.equal(env.elements.get('#startup-splash').dataset.state,'error');
  assert.equal(env.elements.get('.app').inert,true);
  assert.equal(env.frames.size,0);
});

test('watchdog timeout stops animation and reveals the retry state',t=>{
  const env=startupEnvironment(t);createSplash();
  env.window.dispatchEvent(new Event('used:boot-timeout'));
  assert.equal(env.elements.get('#startup-splash').dataset.state,'error');
  assert.equal(env.frames.size,0);
});

test('reduced motion completes without counting animation',async t=>{
  const env=startupEnvironment(t,{reduced:true}),splash=createSplash();
  const finished=splash.finish();env.tick();
  assert.equal(env.elements.get('#startup-percent').textContent,'100');
  env.flushTimers();await finished;env.flushTimers();
  assert.equal(env.elements.get('#startup-splash').removed,true);
});
