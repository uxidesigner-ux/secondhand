import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function target(extra={}) {
 const listeners=new Map();
 return {...extra,addEventListener(type,callback){listeners.set(type,callback);},
  emit(type,event={}){listeners.get(type)?.(event);}};
}
async function setup({reduced=false,hidden=false,documentHidden=false,webglFails=false}={}) {
 const home={hidden},motion=target({matches:reduced}),document=target({hidden:documentHidden});
 const slots=['goods','car'].map(kind=>{
  const classes=new Set();
  return {dataset:{homeModel:kind},clientWidth:140,clientHeight:104,
   classList:{add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name)},
   parentElement:{parentElement:{}},append(canvas){this.canvas=canvas;}};
 });
 document.getElementById=()=>home;document.querySelectorAll=()=>slots;
 const renderers=[],items=[],imports=[],frames=new Map();let nextFrame=0,mutation,intersection,resize;
 class WebGLRenderer {
  constructor(){if(webglFails)throw Error('WebGL unavailable');this.domElement=target({setAttribute(){},remove(){this.removed=true;}});this.renders=0;renderers.push(this);}
  setPixelRatio(value){this.pixelRatio=value;}
  setClearColor(){} setSize(){} render(){this.renders++;} dispose(){this.disposed=true;}
 }
 class MutationObserver {constructor(callback){mutation=callback;}observe(){}}
 class IntersectionObserver {constructor(callback){intersection=callback;}observe(){}}
 class ResizeObserver {constructor(callback){resize=callback;}observe(){}}
 const window=target({matchMedia:()=>motion,devicePixelRatio:3,IntersectionObserver,ResizeObserver});
 const modules={WebGLRenderer,SRGBColorSpace:'srgb',ACESFilmicToneMapping:'aces'};
 const factories={createPhone:()=>({}),createRay:()=>({})};
 const scenes={batchModel:(_T,model)=>model,createIconScene:(_T,_model,kind)=>{
  const item={scene:{},camera:{},turntable:{rotation:{y:0}},initialAngle:kind==='goods'?3.35:-.12,resizeCamera(){}};
  items.push(item);return item;
 }};
 const context=vm.createContext({document,window,MutationObserver,IntersectionObserver,ResizeObserver,console,
  cancelAnimationFrame:id=>frames.delete(id),requestAnimationFrame:callback=>{const id=++nextFrame;frames.set(id,callback);return id;},
  _import:async name=>{imports.push(name);return name.includes('vendor')?modules:name.includes('home-models')?factories:scenes;},
 });
 const source=readFileSync(new URL('../src/home-icons.js',import.meta.url),'utf8').replace('export function initHomeIcons','function initHomeIcons').replace(/\bimport\(/g,'_import(');
 vm.runInContext(source+'\ninitHomeIcons();',context);
 const settle=async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));};
 const tick=time=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(callback=>callback(time));};
 await settle();
 return {home,motion,document,window,slots,renderers,items,imports,frames,tick,settle,
  mutation:()=>mutation(),intersection:value=>intersection([{isIntersecting:value}]),resize:()=>resize()};
}

test('reduced motion keeps posters and avoids downloading or constructing WebGL',async()=>{
 const app=await setup({reduced:true});
 assert.equal(app.imports.length,0);assert.equal(app.renderers.length,0);assert.equal(app.frames.size,0);
 app.motion.matches=false;app.motion.emit('change');await app.settle();
 assert.equal(app.imports.length,3);assert.equal(app.renderers.length,2);assert.equal(app.frames.size,1);
 assert.ok(app.renderers.every(renderer=>renderer.pixelRatio===2));
 assert.ok(app.slots.every(slot=>slot.classList.contains('model-ready')));
});

test('loading is deferred off home and animation stops while hidden or outside viewport',async()=>{
 const app=await setup({hidden:true,documentHidden:true});
 assert.equal(app.imports.length,0);
 app.home.hidden=false;app.mutation();await app.settle();assert.equal(app.imports.length,0);
 app.document.hidden=false;app.document.emit('visibilitychange');await app.settle();
 assert.equal(app.renderers.length,2);
 for(const [hide,show] of [
  [()=>{app.home.hidden=true;app.mutation();},()=>{app.home.hidden=false;app.mutation();}],
  [()=>{app.document.hidden=true;app.document.emit('visibilitychange');},()=>{app.document.hidden=false;app.document.emit('visibilitychange');}],
  [()=>app.intersection(false),()=>app.intersection(true)],
  [()=>app.window.emit('pagehide'),()=>app.window.emit('pageshow')],
 ]){
  hide();const rendered=app.renderers[0].renders;
  assert.equal(app.frames.size,0);app.tick(90000);assert.equal(app.renderers[0].renders,rendered);
  show();assert.equal(app.frames.size,1);
 }
 assert.equal(app.imports.length,3,'navigation must reuse the same loaded scenes');
});

test('turntable advances a full revolution in twelve active seconds and limits draw frequency',async()=>{
 const app=await setup();app.tick(1000);
 const start=app.items[0].turntable.rotation.y,draws=app.renderers[0].renders;
 // A stable 20 Hz schedule verifies elapsed-time rotation independently of RAF.
 for(let i=1;i<=120;i++)app.tick(1000+i*50);
 assert.ok(Math.abs(app.items[0].turntable.rotation.y-start-Math.PI)<1e-8);
 for(let i=121;i<=240;i++)app.tick(1000+i*50);
 const difference=app.items[0].turntable.rotation.y-start;
 assert.ok(Math.min(Math.abs(difference),Math.abs(difference-Math.PI*2))<1e-8);
 assert.equal(app.renderers[0].renders-draws,240);
 const count=app.renderers[0].renders;
 for(let i=1;i<=100;i++)app.tick(13000+i);
 assert.ok(app.renderers[0].renders-count<=3,'fast RAF callbacks must not trigger unbounded draws');
});

test('changing reduced motion on an existing scene returns to its static angle and stops RAF',async()=>{
 const app=await setup();app.tick(1000);app.tick(1050);
 assert.notEqual(app.items[0].turntable.rotation.y,app.items[0].initialAngle);
 app.motion.matches=true;app.motion.emit('change');
 assert.equal(app.frames.size,0);
 assert.equal(app.items[0].turntable.rotation.y,app.items[0].initialAngle);
 app.motion.matches=false;app.motion.emit('change');assert.equal(app.frames.size,1);
});

test('WebGL creation failure leaves static posters visible and schedules no retry loop',async()=>{
 const app=await setup({webglFails:true});
 assert.equal(app.frames.size,0);assert.ok(app.slots.every(slot=>!slot.classList.contains('model-ready')));
 app.mutation();app.document.emit('visibilitychange');await app.settle();
 assert.equal(app.imports.length,3);assert.equal(app.frames.size,0);
});

test('context loss reveals fallback posters and restoration resumes one animation loop',async()=>{
 const app=await setup();let prevented=false;
 app.slots[0].canvas.emit('webglcontextlost',{preventDefault(){prevented=true;}});
 assert.equal(prevented,true);assert.equal(app.frames.size,0);
 assert.ok(app.slots.every(slot=>!slot.classList.contains('model-ready')));
 app.mutation();assert.equal(app.frames.size,0);
 app.slots[0].canvas.emit('webglcontextrestored');
 assert.ok(app.slots.every(slot=>slot.classList.contains('model-ready')));assert.equal(app.frames.size,1);
 assert.equal(app.imports.length,3);
});

test('both WebGL contexts must recover before any drawing or animation resumes',async()=>{
 const app=await setup();
 for(const slot of app.slots)slot.canvas.emit('webglcontextlost',{preventDefault(){}});
 const draws=app.renderers.map(renderer=>renderer.renders);
 app.slots[0].canvas.emit('webglcontextrestored');app.resize();app.mutation();
 assert.equal(app.frames.size,0);
 assert.ok(app.slots.every(slot=>!slot.classList.contains('model-ready')));
 assert.deepEqual(app.renderers.map(renderer=>renderer.renders),draws);
 app.slots[1].canvas.emit('webglcontextrestored');
 assert.equal(app.frames.size,1);
 assert.ok(app.slots.every(slot=>slot.classList.contains('model-ready')));
});
