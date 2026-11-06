const CACHE='used-shell-v1.6.1';
const SHELL=['./src/search-limit.js','./src/search-scope.js','./src/search-cache.js','./src/recovery-guard.js','./assets/service-logos/bunjang.svg','./assets/service-logos/daangn.svg','./assets/service-logos/encar.png','./assets/service-logos/hellomarket.svg','./assets/service-logos/joongna.svg','./assets/service-logos/kb.png','./assets/service-logos/kcar.svg','./src/splash.css?v=1.6.1','./src/splash.js?v=1.6.1','./src/share.js?v=1.6.1','./src/route-history.js','./','./index.html','./src/styles.css?v=1.6.1','./src/car-detail.css?v=1.6.1','./src/app.js?v=1.6.1','./src/car-detail.js?v=1.6.1','./src/detail-route.js','./src/location-state.js?v=1.6.1','./src/location-lookup.js?v=1.6.1','./src/region-geocoder.js?v=1.6.1','./src/encar-fallback.js?v=1.6.1','./src/providers/encar.js','./src/providers/encar-detail.js?v=1.6.1','./src/search.js','./src/config.js?v=1.6.1','./src/entry.js?v=1.6.1','./src/version.js?v=1.6.1','./src/refresh.js?v=1.6.1','./assets/apple-touch-icon-1.2.0.png','./assets/icon-192-1.2.0.png','./assets/icon-512-1.2.0.png','./assets/favicon-1.2.0.svg','./assets/product-placeholder.svg','./manifest.webmanifest'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)));self.skipWaiting();});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('used-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
const staticPaths=new Set(SHELL.map(path=>new URL(path,self.location.href).pathname).filter(path=>!path.endsWith('/')&&!path.endsWith('/index.html')));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.includes('/api/'))return;
 const staticAsset=staticPaths.has(url.pathname)||(url.pathname.includes('/assets/regions/')&&!url.search);
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  if(staticAsset){const cached=await cache.match(event.request);if(cached)return cached;}
  try{
   const response=await fetch(event.request);
   if(response.ok&&!response.redirected){
    if(staticAsset)await cache.put(event.request,response.clone());
    else if(event.request.mode==='navigate')await cache.put('./index.html',response.clone());
   }
   return response;
  }catch{
   return await cache.match(event.request)||(event.request.mode==='navigate'?await cache.match('./index.html'):null)||Response.error();
  }
 })());
});
