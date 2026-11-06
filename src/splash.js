/** Progress reflects application startup milestones, not remote listing requests. */
export function createSplash() {
  const root=document.querySelector('#startup-splash');
  const meter=document.querySelector('#startup-progress');
  const value=document.querySelector('#startup-percent');
  const bar=document.querySelector('#startup-bar');
  const message=document.querySelector('#startup-message');
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let progress=0,target=0,frame=0,last=performance.now(),failed=false,finishing=false,settle;
  const complete=new Promise(resolve=>{settle=resolve;});

  function paint() {
    const number=Math.floor(progress);
    if(value)value.textContent=String(number);
    if(meter){meter.setAttribute('aria-valuenow',String(number));meter.setAttribute('aria-valuetext',`${number}%`);}
    if(bar)bar.style.transform=`scaleX(${progress/100})`;
  }
  function cleanup() {
    clearTimeout(window.__usedBootWatchdog);
    cancelAnimationFrame(frame);
    window.removeEventListener('used:boot-timeout',onTimeout);
  }
  function reveal() {
    cleanup();
    const app=document.querySelector('.app');
    document.documentElement.classList.remove('booting');
    if(app){app.inert=false;app.removeAttribute('aria-busy');}
    if(root){root.classList.add('is-complete');setTimeout(()=>root.remove(),reduced?0:180);}
    settle();
  }
  function tick(now) {
    const elapsed=Math.min(64,Math.max(0,now-last));last=now;
    progress=reduced?target:Math.min(target,progress+elapsed/7);
    paint();
    if(finishing&&progress>=100){setTimeout(reveal,reduced?0:110);return;}
    if(!failed)frame=requestAnimationFrame(tick);
  }
  function fail() {
    if(failed)return;
    failed=true;cleanup();
    if(root)root.dataset.state='error';
    if(message)message.textContent='시작하지 못했어요. 다시 시도해 주세요.';
    settle();
  }
  function onTimeout(){fail();}
  window.addEventListener('used:boot-timeout',onTimeout);
  paint();frame=requestAnimationFrame(tick);
  return {
    advance(next){if(!failed&&!finishing)target=Math.max(target,Math.min(95,Math.max(0,next)));},
    dispose(){cleanup();settle();},
    finish(){
      if(!failed){clearTimeout(window.__usedBootWatchdog);finishing=true;target=100;}
      return complete;
    },
    fail,
  };
}
