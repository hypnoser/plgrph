/* Polygraph Intake — service worker.
   Застосунок — один самодостатній index.html (CSS/JS інлайн, без окремих
   ресурсів), тож офлайн-стратегія тут гранично проста: закешувати сам
   документ при встановленні, віддавати мережу з відкатом на кеш при
   збої (респондент/поліграфолог не повинні лишитись без сторінки через
   тимчасову відсутність інтернету посеред сесії — саме заповнення й
   аналіз відбуваються повністю локально в браузері, мережа потрібна
   лише для завантаження самої сторінки).
   Головна практична причина цього файлу — НЕ офлайн-режим сам по собі,
   а те, що зареєстрований service worker із fetch-обробником є одним із
   формальних критеріїв встановлюваності PWA в Chrome/Edge (поруч із
   manifest.json і HTTPS) — без нього браузер не пропонує "Встановити
   застосунок" узагалі, незалежно від того, наскільки повний manifest. */
var CACHE_NAME = "intake-shell-v1";
var SHELL_URL = "./";

self.addEventListener("install", function(event){
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return cache.add(SHELL_URL).catch(function(){ /* перше встановлення офлайн — нормально пропустити */ });
    })
  );
});

self.addEventListener("activate", function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE_NAME; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function(event){
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request).then(function(response){
      var copy = response.clone();
      caches.open(CACHE_NAME).then(function(cache){ cache.put(event.request, copy).catch(function(){}); });
      return response;
    }).catch(function(){
      return caches.match(event.request).then(function(cached){ return cached || caches.match(SHELL_URL); });
    })
  );
});
