import {validateListing} from './search.js';

/** History snapshots are untrusted; a URL can only reconstruct a fixed KB identity. */
export function resolveDetailItem({id, candidates=[]}={}) {
  if(typeof id!=='string'||!id||id.length>512||/[\u0000-\u001f\u007f]/u.test(id))return null;
  const kb=/^kb-([1-9]\d{0,11})$/.exec(id);
  const item=candidates.find(value=>value?.id===id&&validateListing(value)
    &&(!kb||(value.source==='kb'&&value.kind==='car'&&value.url===`https://www.kbchachacha.com/public/car/detail.kbc?carSeq=${kb[1]}`)));
  if(item)return {...item};
  if(!kb)return null;
  return {id,kind:'car',source:'kb',sourceName:'KB차차차',title:'차량 상세정보',price:null,
    image:'',url:`https://www.kbchachacha.com/public/car/detail.kbc?carSeq=${kb[1]}`,
    category:'car',condition:'unknown',status:'unknown',methods:[],region:'',
    year:null,mileage:null,fuel:'unknown',brand:null,lat:null,lng:null,publishedAt:null,collectedAt:null,demo:false};
}
