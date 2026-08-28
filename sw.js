const C="ticket-scanner-v5-6-2";
self.addEventListener("install",e=>e.waitUntil(
  caches.open(C).then(c=>c.addAll([
    "./","./index.html","./manifest.webmanifest","./src/app.js","./src/styles.css"
  ])).then(()=>self.skipWaiting())
));
self.addEventListener("activate",e=>e.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==C).map(k=>caches.delete(k))))
  .then(()=>self.clients.claim())
));
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET") return;
  e.respondWith(
    fetch(e.request,{cache:"no-store"}).then(r=>{
      const copy=r.clone();
      caches.open(C).then(c=>c.put(e.request,copy));
      return r;
    }).catch(()=>caches.match(e.request))
  );
});
