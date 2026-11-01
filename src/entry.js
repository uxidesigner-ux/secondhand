import {getCanonicalRedirect} from './config.js?v=1.2.0';

const destination=getCanonicalRedirect(location.href);
if(destination){
  document.title='USED로 이동 중';
  const main=document.createElement('main');
  main.style.cssText='max-width:460px;margin:18vh auto 0;padding:28px;line-height:1.7';
  const logo=document.createElement('div');
  logo.className='wordmark';logo.append('USED',document.createElement('span'));
  const title=document.createElement('h1');
  title.style.cssText='font-size:24px;letter-spacing:-.6px;margin:24px 0 12px';
  title.textContent='USED로 이동하고 있어요';
  const description=document.createElement('p');
  description.textContent='이제 홈부터 검색과 매물 상세까지 한곳에서 이용해요. 로그인이 필요할 수 있어요.';
  const link=document.createElement('a');
  link.className='primary-button';link.href=destination;link.textContent='USED 열기';
  const installNote=document.createElement('p');
  installNote.style.cssText='font-size:13px;color:#6b7684';
  installNote.textContent='기존 홈 화면 아이콘을 쓰고 있다면, 이동한 USED 화면에서 새 아이콘을 추가해 주세요.';
  main.append(logo,title,description,link,installNote);
  document.body.replaceChildren(main);
  location.replace(destination);
}else{
  await import('./app.js?v=1.2.0');
}
