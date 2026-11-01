import {validateListing} from './search.js';

/** Parse only observed, bounded vehicle IDs; never turn a route into an arbitrary URL. */
export function parseCarDetailId(id) {
  if (typeof id !== 'string' || /[\u0000-\u001f\u007f]/u.test(id)) return null;
  const match = /^(kb|encar)-([1-9]\d{0,11})$/.exec(id) || /^(kcar)-(EC\d{1,12})$/.exec(id);
  if (!match) return null;
  const [, source, number] = match;
  const sourceName = {kb:'KB차차차',encar:'엔카',kcar:'K Car'}[source];
  const sourceUrl = source === 'kb' ? `https://www.kbchachacha.com/public/car/detail.kbc?carSeq=${number}`
    : source === 'encar' ? `https://fem.encar.com/cars/detail/${number}`
    : `https://www.kcar.com/bc/detail/carInfoDtl?i_sCarCd=${number}`;
  return {id, source, number, sourceName, sourceUrl};
}

/** Validate the selected vehicle independently of unknown direct-link price/specs. */
export function carDetailIdentity(item) {
  const expected = parseCarDetailId(item?.id);
  if (!expected || item.source !== expected.source || item.kind !== 'car' || item.demo === true) return null;
  try {
    const url = new URL(item.url), canonical = new URL(expected.sourceUrl);
    if (url.protocol !== 'https:' || url.hostname !== canonical.hostname || url.port || url.username || url.password
      || url.pathname !== canonical.pathname) return null;
    const parameter = expected.source === 'kb' ? 'carSeq' : expected.source === 'kcar' ? 'i_sCarCd' : null;
    if (parameter && (url.searchParams.getAll(parameter).length !== 1 || url.searchParams.get(parameter) !== expected.number)) return null;
    return expected;
  } catch { return null; }
}

/** History snapshots are untrusted; direct car links contain only known identity. */
export function resolveDetailItem({id, candidates=[]}={}) {
  if(typeof id!=='string'||!id||id.length>512||/[\u0000-\u001f\u007f]/u.test(id))return null;
  const expected=parseCarDetailId(id);
  if(!expected&&/^(?:kb|encar|kcar)-/.test(id))return null;
  const item=(Array.isArray(candidates)?candidates:[]).find(value=>value?.id===id&&validateListing(value)
    &&(expected?carDetailIdentity(value):!['kb','encar','kcar'].includes(value.source)));
  if(item)return {...item};
  if(!expected)return null;
  return {id,kind:'car',source:expected.source,sourceName:expected.sourceName,title:'차량 상세정보',price:null,
    image:'',url:expected.sourceUrl,
    category:'car',condition:'unknown',status:'unknown',methods:[],region:'',
    year:null,mileage:null,fuel:'unknown',brand:null,lat:null,lng:null,publishedAt:null,collectedAt:null,demo:false};
}
