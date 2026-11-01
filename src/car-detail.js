/** KB detail presentation. All network URLs are fixed or validated before use. */
const PLACEHOLDER = './assets/product-placeholder.svg';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const text = (value, limit = 500) => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, limit) : '';
const amount = value => Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString('ko-KR') + '원' : '가격 정보 없음';
const dateLabel = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString('ko-KR', {year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '확인 시각 정보 없음';

function identity(item) {
  if (!item || item.source !== 'kb' || item.kind !== 'car' || item.demo === true) return null;
  const match = /^kb-([1-9]\d{0,11})$/.exec(String(item.id));
  if (!match) return null;
  try {
    const url = new URL(item.url);
    if (url.protocol !== 'https:' || url.hostname !== 'www.kbchachacha.com' || url.port || url.username || url.password
      || url.pathname !== '/public/car/detail.kbc' || url.searchParams.getAll('carSeq').length !== 1 || url.searchParams.get('carSeq') !== match[1]) return null;
    return {id: item.id, number: match[1], sourceUrl: `https://www.kbchachacha.com/public/car/detail.kbc?carSeq=${match[1]}`};
  } catch { return null; }
}

function photoUrl(value, number) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'img.kbchachacha.com' || url.port || url.username || url.password
      || !url.pathname.startsWith('/IMG/carimg/') || !/^\/[A-Za-z0-9_./-]+$/.test(url.pathname)
      || !new RegExp(`^${number}_[A-Za-z0-9_.-]+\\.(?:jpe?g|png|webp)$`, 'i').test(url.pathname.split('/').pop())) return null;
    const result = new URL(url.origin + url.pathname);
    const width = url.searchParams.get('width');
    if (width && /^\d{2,4}$/.test(width)) result.searchParams.set('width', String(Math.min(1600, Number(width))));
    return result.href;
  } catch { return null; }
}

function rows(value, max = 40) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, max).map(row => ({label:text(row?.label,80),value:text(row?.value,1000)}))
    .filter(row => row.label && row.value);
}

/** Pure validator/sanitizer. Never infer accident status or unreported options. */
export function normalizeCarDetail(raw, expectedItem) {
  const expected = identity(expectedItem);
  if (!expected || !raw || raw.source !== 'kb' || raw.id !== expected.id || raw.sourceUrl !== expected.sourceUrl) return null;
  const title = text(raw.title, 250);
  if (!title || (raw.price != null && (!Number.isSafeInteger(raw.price) || raw.price < 0))) return null;
  const photos = [...new Set((Array.isArray(raw.photos) ? raw.photos.slice(0,80) : []).map(photo => photoUrl(photo, expected.number)).filter(Boolean))].slice(0,40);
  const optionGroups = (Array.isArray(raw.optionGroups) ? raw.optionGroups : []).slice(0,12).map(group => ({
    label: text(group?.label,80),
    items: [...new Set((Array.isArray(group?.items) ? group.items.slice(0,100) : []).map(option => {
      // String entries are the backend's selected-only list. Explicit objects must be selected.
      if (typeof option === 'string') return text(option,100);
      return option?.selected === true ? text(option.label || option.name,100) : '';
    }).filter(Boolean))].slice(0,80),
  })).filter(group => group.label && group.items.length);
  return {
    source:'kb', id:expected.id, sourceUrl:expected.sourceUrl, title, price:raw.price ?? null, photos,
    specs:rows(raw.specs), optionGroups,
    highlights:[...new Set((Array.isArray(raw.highlights) ? raw.highlights.slice(0,32) : []).map(value => text(value,160)).filter(Boolean))].slice(0,16),
    inspection:rows(raw.inspection,24),
    seller:{businessName:text(raw.seller?.businessName,160)||null,region:text(raw.seller?.region,200)||null},
    description:text(raw.description,12000)||null,
    fetchedAt:typeof raw.fetchedAt === 'string' && Number.isFinite(Date.parse(raw.fetchedAt)) ? raw.fetchedAt : null,
  };
}

function factsMarkup(facts) {
  return `<dl class="car-detail__facts">${facts.map(row => `<div><dt>${esc(row.label)}</dt><dd>${esc(row.value)}</dd></div>`).join('')}</dl>`;
}

function baseFacts(item) {
  const fuelLabels = {gasoline:'가솔린',diesel:'디젤',hybrid:'하이브리드',electric:'전기',lpg:'LPG'};
  return [
    {label:'연식',value:Number.isInteger(item.year)?`${item.year}년`:'정보 없음'},
    {label:'주행거리',value:Number.isFinite(item.mileage)?`${item.mileage.toLocaleString('ko-KR')}km`:'정보 없음'},
    {label:'연료',value:fuelLabels[item.fuel]||'정보 없음'},
    {label:'지역',value:text(item.region,200)||'정보 없음'},
  ];
}

/** Mount inside an already-open sheet. Call cleanup when closing/replacing the sheet. */
export function mountCarDetail({item, container, onUpdate} = {}) {
  if (!container || typeof container.replaceChildren !== 'function') return () => {};
  const expected = identity(item);
  const initialPhoto = expected ? photoUrl(item.image, expected.number) : null;
  const root = document.createElement('div');
  root.className = 'car-detail';
  root.innerHTML = `<div class="car-detail__gallery" aria-label="차량 사진"></div>
    <div class="car-detail__identity"><span class="car-detail__source">KB차차차 · 실제 매물</span><h3 class="car-detail__title"></h3><p class="car-detail__price"></p><p class="car-detail__price-note">차량 표시 가격 · 이전비 등 추가 비용은 원문에서 확인해 주세요.</p></div>
    <div class="car-detail__highlights"></div>
    <div class="car-detail__load" role="status" aria-live="polite"><span class="car-detail__spinner" aria-hidden="true"></span><p></p><button type="button" class="car-detail__retry" hidden>상세정보 다시 불러오기</button></div>
    <section class="car-detail__section car-detail__basic"><h4>차량 정보</h4><div class="car-detail__specs"></div></section>
    <section class="car-detail__section car-detail__inspection" hidden></section>
    <section class="car-detail__section car-detail__options" hidden></section>
    <section class="car-detail__section car-detail__seller" hidden></section>
    <section class="car-detail__section car-detail__description" hidden></section>
    <p class="car-detail__updated"></p>`;
  container.replaceChildren(root);
  const $ = selector => root.querySelector(selector);
  $('.car-detail__title').textContent = text(item?.title,250) || '차량 상세정보';
  $('.car-detail__price').textContent = amount(item?.price);
  $('.car-detail__specs').innerHTML = factsMarkup(baseFacts(item || {}));
  $('.car-detail__updated').textContent = `검색 정보 확인: ${dateLabel(item?.collectedAt)}. 판매 여부와 최종 조건은 원문에서 확인해 주세요.`;
  let disposed = false, controller = null, timer = null, galleryCleanup = () => {}, version = 0;

  function gallery(photos) {
    galleryCleanup();
    const images = photos.length ? photos : [initialPhoto || PLACEHOLDER];
    const wrap = $('.car-detail__gallery');
    wrap.innerHTML = `<div class="car-detail__gallery-frame"><div class="car-detail__photo-track" role="region" aria-roledescription="사진 슬라이드" aria-label="차량 사진, 좌우로 넘겨보기" tabindex="0">${images.map((url,index)=>`<figure class="car-detail__photo"><img src="${esc(url)}" alt="${esc(text(item?.title,250)||'차량')} 사진 ${index+1}" ${index?'loading="lazy"':''} referrerpolicy="no-referrer"></figure>`).join('')}</div><div class="car-detail__gallery-controls"><button type="button" data-photo-prev aria-label="이전 차량 사진"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg></button><span class="car-detail__photo-count" role="status" aria-live="polite">1 / ${images.length}</span><button type="button" data-photo-next aria-label="다음 차량 사진"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6"/></svg></button></div></div>${images.length>1?`<div class="car-detail__thumbnails" role="group" aria-label="사진 선택">${images.map((url,index)=>`<button type="button" data-photo-index="${index}" aria-label="차량 사진 ${index+1} 보기" aria-pressed="${index===0}"><img src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer"></button>`).join('')}</div>`:''}`;
    const track = wrap.querySelector('.car-detail__photo-track');
    const prev = wrap.querySelector('[data-photo-prev]');
    const next = wrap.querySelector('[data-photo-next]');
    let selected = 0, frame = null;
    const update = () => {
      selected = Math.max(0,Math.min(images.length-1,Math.round(track.scrollLeft/(track.clientWidth||1))));
      wrap.querySelector('.car-detail__photo-count').textContent = `${selected+1} / ${images.length}`;
      prev.disabled = selected===0;next.disabled = selected===images.length-1;
      wrap.querySelectorAll('[data-photo-index]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.photoIndex)===selected)));
    };
    const go = index => {
      const target = Math.max(0,Math.min(images.length-1,index));
      const reduceMotion = typeof matchMedia==='function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      track.scrollTo({left:target*track.clientWidth,behavior:reduceMotion?'auto':'smooth'});
    };
    const click = event => {
      const button = event.target.closest('button');
      if(!button||!wrap.contains(button))return;
      if(button.hasAttribute('data-photo-prev'))go(selected-1);
      if(button.hasAttribute('data-photo-next'))go(selected+1);
      if(button.hasAttribute('data-photo-index'))go(Number(button.dataset.photoIndex));
    };
    const key = event => {
      if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();go(selected+(event.key==='ArrowRight'?1:-1));}
    };
    const scroll = () => {if(frame===null)frame=requestAnimationFrame(()=>{frame=null;update();});};
    wrap.addEventListener('click',click);track.addEventListener('keydown',key);track.addEventListener('scroll',scroll,{passive:true});
    wrap.querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{img.src=PLACEHOLDER;},{once:true}));
    update();
    galleryCleanup=()=>{wrap.removeEventListener('click',click);track.removeEventListener('keydown',key);track.removeEventListener('scroll',scroll);if(frame!==null)cancelAnimationFrame(frame);};
  }

  function loadState(message, {loading=false,retry=false}={}) {
    const status = $('.car-detail__load');
    status.hidden = !message;
    status.classList.toggle('is-loading',loading);
    status.classList.toggle('has-error',retry);
    status.querySelector('p').textContent = message;
    status.querySelector('.car-detail__spinner').hidden = !loading;
    const button = status.querySelector('button');button.hidden=!retry;button.disabled=loading;
  }

  function enrich(detail) {
    $('.car-detail__title').textContent=detail.title;
    $('.car-detail__price').textContent=amount(detail.price);
    gallery(detail.photos);
    const highlights=$('.car-detail__highlights');
    highlights.innerHTML=detail.highlights.map(value=>`<span>${esc(value)}</span>`).join('');
    if(detail.specs.length)$('.car-detail__specs').innerHTML=factsMarkup(detail.specs);
    const inspection=$('.car-detail__inspection');inspection.hidden=!detail.inspection.length;
    if(detail.inspection.length)inspection.innerHTML=`<h4>보험·점검 기록</h4><p class="car-detail__section-note">원문에 표시된 기록이에요. 보험이력 건수와 사고 판정은 구분해서 확인해 주세요.</p>${factsMarkup(detail.inspection)}`;
    const options=$('.car-detail__options');options.hidden=!detail.optionGroups.length;
    if(detail.optionGroups.length)options.innerHTML=`<h4>확인된 차량 옵션</h4>${detail.optionGroups.map(group=>`<div class="car-detail__option-group"><h5>${esc(group.label)}</h5><ul>${group.items.map(value=>`<li><span aria-hidden="true">✓</span>${esc(value)}</li>`).join('')}</ul></div>`).join('')}<p class="car-detail__section-note">원문에서 선택된 옵션만 표시해요. 실제 장착 여부는 판매자에게 확인해 주세요.</p>`;
    const seller=$('.car-detail__seller');const sellerFacts=[{label:'판매 상사',value:detail.seller.businessName},{label:'판매 지역',value:detail.seller.region}].filter(row=>row.value);seller.hidden=!sellerFacts.length;
    if(sellerFacts.length)seller.innerHTML=`<h4>판매 정보</h4>${factsMarkup(sellerFacts)}`;
    const description=$('.car-detail__description');description.hidden=!detail.description;
    if(detail.description)description.innerHTML=`<h4>차량 설명</h4><p class="car-detail__description-text">${esc(detail.description)}</p>`;
    $('.car-detail__updated').textContent=`상세정보 확인: ${dateLabel(detail.fetchedAt)}. 정보는 확인 이후 변경될 수 있어요. 판매 여부와 최종 조건은 원문에서 확인해 주세요.`;
    loadState('상세정보를 확인했어요.');
    if(typeof onUpdate==='function')onUpdate(detail);
  }

  async function load() {
    controller?.abort();clearTimeout(timer);
    const current=++version;
    if(!expected){loadState('이 차량은 상세정보 연동 대상이 아니에요. 원문에서 확인해 주세요.');return;}
    if(location.hostname==='github.io'||location.hostname.endsWith('.github.io')){loadState('상세정보는 로그인된 검색 화면에서 확인할 수 있어요. 아래 원문 버튼으로도 차량 정보를 볼 수 있어요.');return;}
    const active=new AbortController();controller=active;
    timer=setTimeout(()=>active.abort(),12000);
    loadState('차량 사진과 상세정보를 가져오고 있어요.',{loading:true});
    try{
      const url=new URL('/api/detail',location.origin);url.searchParams.set('source','kb');url.searchParams.set('id',expected.number);
      const response=await fetch(url,{signal:active.signal,cache:'no-store',credentials:'same-origin',headers:{Accept:'application/json'}});
      const payload=await response.json().catch(()=>null);
      if(disposed||current!==version||!root.isConnected)return;
      if(!response.ok)throw new Error(response.status===401||response.status===403?'로그인이 필요해 상세정보를 가져오지 못했어요. 원문을 확인하거나 로그인 후 다시 시도해 주세요.':typeof payload?.error==='string'?text(payload.error,300):'상세정보를 가져오지 못했어요. 잠시 후 다시 시도해 주세요.');
      const detail=normalizeCarDetail(payload?.detail,item);
      if(!detail)throw new Error('차량 상세정보를 확인하지 못했어요. 원문을 확인하거나 다시 시도해 주세요.');
      enrich(detail);
    }catch(error){
      if(disposed||current!==version||!root.isConnected)return;
      loadState(error?.name==='AbortError'?'상세정보 응답이 늦어지고 있어요. 검색 당시 정보는 그대로 두었어요. 다시 시도해 주세요.':error instanceof TypeError?'상세정보 서버에 연결하지 못했어요. 검색 당시 정보는 그대로 두었어요.':text(error?.message,400)||'상세정보를 불러오지 못했어요.',{retry:true});
    }finally{if(current===version)clearTimeout(timer);}
  }

  gallery(initialPhoto?[initialPhoto]:[]);
  const retryButton=$('.car-detail__retry');retryButton.addEventListener('click',load);
  load();
  return () => {disposed=true;version++;controller?.abort();clearTimeout(timer);galleryCleanup();retryButton.removeEventListener('click',load);};
}
