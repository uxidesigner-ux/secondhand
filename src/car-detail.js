import {carDetailIdentity} from './detail-route.js';

/** Shared car detail presentation. All network URLs are fixed or validated. */
const PLACEHOLDER = './assets/product-placeholder.svg';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const text = (value, limit = 500) => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, limit) : '';
const amount = value => Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString('ko-KR') + '원' : '가격 정보 없음';
const dateLabel = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString('ko-KR', {year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '확인 시각 정보 없음';

function photoUrl(value, expected) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.port || url.username || url.password || !/^\/[A-Za-z0-9_./-]+$/.test(url.pathname)) return null;
    const {source, number} = expected;
    if (source === 'kb' && (url.hostname !== 'img.kbchachacha.com' || !url.pathname.startsWith('/IMG/carimg/')
      || !new RegExp(`^${number}_[A-Za-z0-9_.-]+\\.(?:jpe?g|png|webp)$`, 'i').test(url.pathname.split('/').pop()))) return null;
    if (source === 'encar' && (url.hostname !== 'ci.encar.com'
      || !new RegExp(`^/carpicture\\d*/pic\\d+/${number}_\\d+\\.(?:jpe?g|png|webp)$`, 'i').test(url.pathname))) return null;
    if (source === 'kcar' && (url.hostname !== 'img.kcar.com'
      || !new RegExp(`^/carpicture/carpicture\\d+/pic\\d+/kcar(?:M)?_${number.slice(2)}_\\d+\\.(?:jpe?g|png|webp)$`, 'i').test(url.pathname))) return null;
    const result = new URL(url.origin + url.pathname);
    const width = url.searchParams.get('width');
    if (source === 'kb' && width && /^\d{2,4}$/.test(width)) result.searchParams.set('width', String(Math.min(1600, Number(width))));
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
  const expected = carDetailIdentity(expectedItem);
  if (!expected || !raw || Array.isArray(raw) || raw.source !== expected.source || raw.id !== expected.id || raw.sourceUrl !== expected.sourceUrl) return null;
  const title = text(raw.title, 250);
  if (!title || (raw.price != null && (!Number.isSafeInteger(raw.price) || raw.price < 0))) return null;
  const photos = [...new Set((Array.isArray(raw.photos) ? raw.photos.slice(0,80) : []).map(photo => photoUrl(photo, expected)).filter(Boolean))].slice(0,40);
  const optionGroups = (Array.isArray(raw.optionGroups) ? raw.optionGroups : []).slice(0,12).map(group => ({
    label: text(group?.label,80),
    items: [...new Set((Array.isArray(group?.items) ? group.items.slice(0,100) : []).map(option => {
      // String entries are the backend's selected-only list. Explicit objects must be selected.
      if (typeof option === 'string') return text(option,100);
      return option?.selected === true ? text(option.label || option.name,100) : '';
    }).filter(Boolean))].slice(0,80),
  })).filter(group => group.label && group.items.length);
  return {
    source:expected.source, id:expected.id, sourceUrl:expected.sourceUrl, title, price:raw.price ?? null, photos,
    specs:rows(raw.specs), optionGroups,
    highlights:[...new Set((Array.isArray(raw.highlights) ? raw.highlights.slice(0,32) : []).map(value => text(value,160)).filter(Boolean))].slice(0,16),
    inspection:rows(raw.inspection,24),
    seller:{businessName:text(raw.seller?.businessName,160)||null,region:text(raw.seller?.region,200)||null},
    description:text(raw.description,12000)||null,
    fetchedAt:typeof raw.fetchedAt === 'string' && Number.isFinite(Date.parse(raw.fetchedAt)) ? raw.fetchedAt : null,
  };
}

const browserEncarDetail = async options => {
  const {fetchEncarDetailInBrowser} = await import('./providers/encar-detail.js?v=1.4.1');
  return fetchEncarDetailInBrowser(options);
};
const detailError = (code, message) => Object.assign(new Error(message), {code});
const checkAborted = signal => { if (signal?.aborted) throw new DOMException('상세정보 조회가 취소됐어요.', 'AbortError'); };

/** Load one exact car through the protected same-origin API. Browser Encar
 * recovery requires the API's explicit provider-failure contract, never an
 * authentication error, rate-limit response, HTML page or unknown JSON. */
export async function fetchCarDetail({item, signal, origin = globalThis.location?.origin,
  fetchImpl = globalThis.fetch, fetchEncarDetail = browserEncarDetail} = {}) {
  const expected = carDetailIdentity(item);
  if (!expected) throw detailError('DETAIL_ID', '올바른 차량을 선택해 주세요.');
  checkAborted(signal);
  const url = new URL('/api/detail', origin);
  url.searchParams.set('source', expected.source);url.searchParams.set('id', expected.number);
  const response = await fetchImpl(url, {signal, cache:'no-store', credentials:'same-origin', redirect:'error', headers:{Accept:'application/json'}});
  const isJson = /^application\/json(?:\s*;|$)/i.test(response.headers?.get('content-type') || '');
  const payload = isJson ? await response.json().catch(() => null) : null;
  checkAborted(signal);
  let raw = payload?.detail;
  if (!response.ok) {
    const recoverable = expected.source === 'encar' && [502,503].includes(response.status)
      && payload?.code === 'DETAIL_UPSTREAM_UNAVAILABLE' && payload.source === expected.source && payload.id === expected.number;
    if (recoverable) {
      try { raw = await fetchEncarDetail({id:expected.number, signal}); }
      catch {
        checkAborted(signal);
        throw detailError('DETAIL_UNAVAILABLE', '엔카 상세정보에 연결하지 못했어요. 아래 엔카에서 보기 버튼으로 확인해 주세요.');
      }
    } else if ([401,403].includes(response.status)) {
      throw detailError('DETAIL_AUTH', '로그인이 필요해 상세정보를 가져오지 못했어요. 원문을 확인하거나 로그인 후 다시 시도해 주세요.');
    } else if (response.status === 429) {
      throw detailError('DETAIL_RATE_LIMIT', '요청이 많아 상세정보를 가져오지 못했어요. 잠시 후 다시 시도해 주세요.');
    } else if ([404,410].includes(response.status)) {
      throw detailError('DETAIL_NOT_FOUND', `${expected.sourceName}에서 차량 상세정보를 찾을 수 없어요. 아래 원문 버튼으로 판매 여부를 확인해 주세요.`);
    } else {
      throw detailError('DETAIL_UNAVAILABLE', `${expected.sourceName} 상세정보에 연결하지 못했어요. 아래 ${expected.sourceName}에서 보기 버튼으로 확인해 주세요.`);
    }
  }
  checkAborted(signal);
  const detail = normalizeCarDetail(raw, item);
  if (!detail) throw detailError('DETAIL_FORMAT', `${expected.sourceName} 차량 상세정보를 확인하지 못했어요. 원문을 확인하거나 다시 시도해 주세요.`);
  return detail;
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

/** Mount in the detail page. Call cleanup when leaving or replacing the route. */
export function mountCarDetail({item, container, onUpdate} = {}) {
  if (!container || typeof container.replaceChildren !== 'function') return () => {};
  const expected = carDetailIdentity(item);
  const initialPhoto = expected ? photoUrl(item.image, expected) : null;
  const root = document.createElement('div');
  root.className = 'car-detail';
  root.innerHTML = `<div class="car-detail__gallery" aria-label="차량 사진"></div>
    <div class="car-detail__identity"><span class="car-detail__source">${esc(expected?.sourceName || '차량')} · 실제 매물</span><h3 class="car-detail__title"></h3><p class="car-detail__price"></p><p class="car-detail__price-note">차량 표시 가격 · 이전비 등 추가 비용은 원문에서 확인해 주세요.</p></div>
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
    const rail = wrap.querySelector('.car-detail__thumbnails');
    const thumbnails = [...wrap.querySelectorAll('[data-photo-index]')];
    const prev = wrap.querySelector('[data-photo-prev]');
    const next = wrap.querySelector('[data-photo-next]');
    let selected = 0, intended = null, scrollFrame = null, layoutFrame = null, measuredWidth = 0, removed = false;
    const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const nearestPhoto = () => Math.max(0,Math.min(images.length-1,Math.round(track.scrollLeft/(track.clientWidth||1))));

    // Scroll only the horizontal rail; scrollIntoView would also move the page.
    const centerThumbnail = (animate = false) => {
      const button = thumbnails[selected];
      if (!rail || !button || !rail.clientWidth) return;
      const railBox = rail.getBoundingClientRect();
      const buttonBox = button.getBoundingClientRect();
      const railCenter = railBox.left + rail.clientLeft + rail.clientWidth/2;
      const left = rail.scrollLeft + buttonBox.left + buttonBox.width/2 - railCenter;
      rail.scrollTo({left:Math.max(0,left),top:rail.scrollTop,behavior:animate&&!reduceMotion()?'smooth':'auto'});
    };
    const selectPhoto = (index, {animate = true, forceCenter = false} = {}) => {
      const nextIndex = Math.max(0,Math.min(images.length-1,index));
      const changed = nextIndex !== selected;
      selected = nextIndex;
      wrap.querySelector('.car-detail__photo-count').textContent = `${selected+1} / ${images.length}`;
      prev.disabled = selected===0;next.disabled = selected===images.length-1;
      thumbnails.forEach((button,index)=>button.setAttribute('aria-pressed',String(index===selected)));
      if (changed || forceCenter) centerThumbnail(animate && changed);
    };
    const layout = () => {
      if (removed || !track.clientWidth) return;
      if (rail && thumbnails.length) {
        // Include the flex gap beside each spacer so both endpoint thumbnails
        // can be centered at the rail's minimum and maximum scroll positions.
        const gap = parseFloat(getComputedStyle(rail).columnGap) || 0;
        const firstWidth = thumbnails[0].getBoundingClientRect().width;
        const lastWidth = thumbnails.at(-1).getBoundingClientRect().width;
        rail.style.setProperty('--cd-thumb-start',`${Math.max(0,(rail.clientWidth-firstWidth)/2-gap)}px`);
        rail.style.setProperty('--cd-thumb-end',`${Math.max(0,(rail.clientWidth-lastWidth)/2-gap)}px`);
      }
      intended = null;
      measuredWidth = track.clientWidth;
      track.scrollTo({left:selected*track.clientWidth,behavior:'auto'});
      selectPhoto(selected,{animate:false,forceCenter:true});
    };
    const scheduleLayout = () => {
      if (layoutFrame===null) layoutFrame=requestAnimationFrame(()=>{layoutFrame=null;layout();});
    };
    const go = index => {
      const target = Math.max(0,Math.min(images.length-1,index));
      intended = target;
      selectPhoto(target,{forceCenter:true});
      track.scrollTo({left:target*track.clientWidth,behavior:reduceMotion()?'auto':'smooth'});
    };
    const click = event => {
      const button = event.target.closest('button');
      if(!button||!wrap.contains(button))return;
      if(button.hasAttribute('data-photo-prev'))go(selected-1);
      if(button.hasAttribute('data-photo-next'))go(selected+1);
      if(button.hasAttribute('data-photo-index'))go(Number(button.dataset.photoIndex));
    };
    const key = event => {
      const thumb = event.target.closest('[data-photo-index]');
      if(event.target!==track&&!thumb)return;
      let target;
      if(event.key==='ArrowRight')target=selected+1;
      else if(event.key==='ArrowLeft')target=selected-1;
      else if(event.key==='Home')target=0;
      else if(event.key==='End')target=images.length-1;
      else return;
      event.preventDefault();
      target=Math.max(0,Math.min(images.length-1,target));
      if(thumb)thumbnails[target]?.focus({preventScroll:true});
      go(target);
    };
    const syncFromTrack = () => {
      if(removed)return;
      if(track.clientWidth!==measuredWidth){scheduleLayout();return;}
      if(intended!==null){
        // Keep an explicit arrow/thumbnail selection stable during its smooth
        // transition. A user's new swipe immediately cancels this target.
        if(Math.abs(track.scrollLeft-intended*track.clientWidth)>1)return;
        intended=null;
      }
      selectPhoto(nearestPhoto());
    };
    const scroll = () => {
      if(scrollFrame===null)scrollFrame=requestAnimationFrame(()=>{scrollFrame=null;syncFromTrack();});
    };
    const finishScroll = () => {intended=null;syncFromTrack();};
    const beginSwipe = () => {intended=null;};
    const imageError = event => {
      const image=event.target;
      if(image.tagName==='IMG'&&!image.dataset.failed){image.dataset.failed='true';image.src=PLACEHOLDER;}
    };
    wrap.addEventListener('click',click);
    wrap.addEventListener('keydown',key);
    wrap.addEventListener('error',imageError,true);
    track.addEventListener('scroll',scroll,{passive:true});
    track.addEventListener('scrollend',finishScroll,{passive:true});
    track.addEventListener('pointerdown',beginSwipe,{passive:true});
    track.addEventListener('touchstart',beginSwipe,{passive:true});
    track.addEventListener('wheel',beginSwipe,{passive:true});
    window.addEventListener('resize',scheduleLayout,{passive:true});
    const resizeObserver = typeof ResizeObserver==='function'?new ResizeObserver(scheduleLayout):null;
    resizeObserver?.observe(track);
    if(rail){resizeObserver?.observe(rail);resizeObserver?.observe(thumbnails[0]);resizeObserver?.observe(thumbnails.at(-1));}
    layout();scheduleLayout();
    galleryCleanup=()=>{
      removed=true;
      wrap.removeEventListener('click',click);wrap.removeEventListener('keydown',key);wrap.removeEventListener('error',imageError,true);
      track.removeEventListener('scroll',scroll);track.removeEventListener('scrollend',finishScroll);
      track.removeEventListener('pointerdown',beginSwipe);track.removeEventListener('touchstart',beginSwipe);track.removeEventListener('wheel',beginSwipe);
      window.removeEventListener('resize',scheduleLayout);resizeObserver?.disconnect();
      if(scrollFrame!==null)cancelAnimationFrame(scrollFrame);if(layoutFrame!==null)cancelAnimationFrame(layoutFrame);
    };
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
    loadState(`${expected.sourceName} 상세정보를 확인했어요.`);
    if(typeof onUpdate==='function')onUpdate(detail);
  }

  async function load() {
    controller?.abort();clearTimeout(timer);
    const current=++version;
    if(!expected){loadState('이 차량은 상세정보 연동 대상이 아니에요. 원문에서 확인해 주세요.');return;}
    if(location.hostname==='github.io'||location.hostname.endsWith('.github.io')){loadState('상세정보는 로그인된 검색 화면에서 확인할 수 있어요. 아래 원문 버튼으로도 차량 정보를 볼 수 있어요.');return;}
    const active=new AbortController();controller=active;
    timer=setTimeout(()=>active.abort(),20000);
    loadState(`${expected.sourceName}의 차량 사진과 상세정보를 가져오고 있어요.`,{loading:true});
    try{
      const detail=await fetchCarDetail({item,signal:active.signal});
      if(disposed||current!==version||!root.isConnected)return;
      enrich(detail);
    }catch(error){
      if(disposed||current!==version||!root.isConnected)return;
      loadState(error?.name==='AbortError'?`${expected.sourceName} 응답이 늦어지고 있어요. 검색 당시 정보는 그대로 두었어요. 다시 시도해 주세요.`:error?.code?.startsWith('DETAIL_')?text(error.message,400):`${expected.sourceName} 상세정보에 연결하지 못했어요. 검색 당시 정보는 그대로 두었어요. 아래 원문 버튼으로 확인해 주세요.`,{retry:true});
    }finally{if(current===version)clearTimeout(timer);}
  }

  gallery(initialPhoto?[initialPhoto]:[]);
  const retryButton=$('.car-detail__retry');retryButton.addEventListener('click',load);
  load();
  return () => {disposed=true;version++;controller?.abort();clearTimeout(timer);galleryCleanup();retryButton.removeEventListener('click',load);};
}
