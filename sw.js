// LawLink offline support. Bump VERSION whenever you upload new files so phones pick them up.
var VERSION = 'lawlink-v8';
var FILES = ['home.html','courses.html','course.html','note.html','case.html','authority.html','authorities.html','search.html','settings.html','progress.html','about.html','notes.html','community.html','login.html',
  'style.css','ui.js','api.js','courses-data.js','manifest.json','icon-192.png','icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return Promise.all(FILES.map(function (f) { return c.add(f).catch(function () {}); })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
// Show the saved copy at once, refresh it in the background. Backend calls (POST) are never cached.
self.addEventListener('fetch', function (e) {
  var r = e.request;
  if (r.method !== 'GET') return;
  var u = new URL(r.url);
  var ok = u.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(u.hostname);
  if (!ok) return;
  e.respondWith(caches.open(VERSION).then(function (c) {
    return c.match(r, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(r).then(function (res) { if (res && (res.ok || res.type === 'opaque')) c.put(r, res.clone()); return res; }).catch(function () { return hit; });
      return hit || net;
    });
  }));
});
