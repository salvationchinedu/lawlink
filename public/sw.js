// Lex-Tabulā offline support. Bump VERSION whenever you upload new files so phones pick them up.
var VERSION = 'lawlink-v63';
var FILES = ['push.js','about-edit.html','about-default.js','badge-72.png','legal-edit.html','legal-default.js','fonts/inter-bold.woff','fonts/serif-roman.woff','fonts/serif-italic.woff','home.html','courses.html','course.html','note.html','case.html','authority.html','authorities.html','inbox.html','search.html','settings.html','progress.html','quiz.html','irac.html','plan.html','performance.html','profile.html','setup.html','subscribe.html','payments.html','notices.html','welcome.html','announce.html','students.html','privacy.html','review.html','stats.html','about.html','notes.html','community.html','goals.html','moderate.html','login.html',
  'style.css','ui.js','tour.js','api.js','courses-data.js','manifest.json','icon-192.png','icon-512.png'];

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
  if (u.pathname === '/api') return;
  var ok = u.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(u.hostname);
  if (!ok) return;
  e.respondWith(caches.open(VERSION).then(function (c) {
    return c.match(r, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(r).then(function (res) { if (res && (res.ok || res.type === 'opaque')) c.put(r, res.clone()); return res; }).catch(function () { return hit; });
      return hit || net;
    });
  }));
});

// Notifications. The server sends a short message: t is the title, b the text, u the page to open when it is tapped, g a tag so a newer message replaces an older one.
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { b: e.data ? e.data.text() : '' }; }
  var page = /^[a-z0-9-]+\.html(\?[\w=&.%-]{0,100})?$/i.test(String(d.u || '')) ? d.u : 'home.html';
  e.waitUntil(self.registration.showNotification(String(d.t || 'Lex-Tabulā').slice(0, 80), {
    body: String(d.b || '').slice(0, 160), icon: 'icon-192.png', badge: 'badge-72.png', tag: String(d.g || 'lt'), renotify: true, data: { u: page }
  }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = new URL((e.notification.data && e.notification.data.u) || 'home.html', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.url.indexOf(self.registration.scope) === 0 && 'focus' in c) {
        return c.focus().then(function (w) { return w && 'navigate' in w ? w.navigate(url) : w; }).catch(function () { return self.clients.openWindow(url); });
      }
    }
    return self.clients.openWindow(url);
  }));
});
