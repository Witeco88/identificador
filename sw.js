const CACHE_NAME="ticket-scanner-v5-7-1";
const APP_SHELL=[
 "./","./index.html","./manifest.webmanifest",
 "./src/app.js","./src/styles.css"
];
self.addEventListener("install",event=>{
 event.waitUntil(
  caches.open(CACHE_NAME)
   .then(cache=>cache.addAll(APP_SHELL))
   .then(()=>self.skipWaiting())
 );
});
self.addEventListener("activate",event=>{
 event.waitUntil(
  caches.keys()
   .then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))))
   .then(()=>self.clients.claim())
 );
});
self.addEventListener("fetch",event=>{
 if(event.request.method!=="GET") return;
 event.respondWith(
  fetch(event.request,{cache:"no-store"})
   .then(response=>{
    if(response.ok){
     const copy=response.clone();
     caches.open(CACHE_NAME).then(c=>c.put(event.request,copy));
    }
    return response;
   })
   .catch(()=>caches.match(event.request))
 );
});
