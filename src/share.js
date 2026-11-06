import {SERVICE_SHARE_URL} from './config.js?v=1.5.0';

/** Call directly from a click so the native share sheet keeps user activation. */
export async function shareService(browser=typeof navigator==='undefined'?{}:navigator) {
  // Share the service entrance only, never the current route or auth parameters.
  const url=SERVICE_SHARE_URL;
  const data={title:'USED',text:'원하는 제품, 일단 찾아봐',url};
  if(typeof browser.share==='function'){
    try{
      if(typeof browser.canShare!=='function'||browser.canShare(data)){
        await browser.share(data);
        return {status:'shared',url};
      }
    }catch(error){
      if(error?.name==='AbortError')return {status:'cancelled',url};
    }
  }
  try{
    if(typeof browser.clipboard?.writeText==='function'){
      await browser.clipboard.writeText(url);
      return {status:'copied',url};
    }
  }catch{}
  return {status:'manual',url};
}
