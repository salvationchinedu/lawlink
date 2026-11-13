// Notifications on this phone: ask permission, register the phone with the server, keep it registered, and turn it off.
// Loaded by Settings and Community, and by any page once notifications have been turned on (so the phone stays registered).
(function () {
  var KEY = 'lawlink-push'; // { on: 1, prefs: {...}, t: when the server last heard from this phone }
  var DEF = { answer: true, news: true, pass: true, daily: false, time: 1140 }; // 1140 = 7:00 pm
  function saved() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } }
  function keep(o) { try { if (o) localStorage.setItem(KEY, JSON.stringify(o)); else localStorage.removeItem(KEY); } catch (e) {} }
  function installed() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
  function ios() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }

  // 'ok', or why not: 'ios-install' (add to Home Screen first), 'unsupported', 'blocked' (the student said no earlier)
  function support() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return ios() && !installed() ? 'ios-install' : 'unsupported';
    return Notification.permission === 'denied' ? 'blocked' : 'ok';
  }
  function explain(why) {
    if (why === 'ios-install') return 'On iPhone and iPad, notifications work only after you add Lex-Tabulā to your Home Screen. Tap the Share button, choose Add to Home Screen, then open Lex-Tabulā from its new icon and come back here.';
    if (why === 'blocked') return 'Notifications are blocked for Lex-Tabulā. Allow them in your phone\'s browser settings for this site, then come back here.';
    return 'This browser cannot show notifications. Chrome on Android works, and so does an iPhone on iOS 16.4 or newer once Lex-Tabulā is added to the Home Screen.';
  }

  function ready() {
    return Promise.race([navigator.serviceWorker.ready, new Promise(function (_, no) { setTimeout(function () { no(new Error('The app is still starting. Try again in a moment.')); }, 8000); })]);
  }
  function bytes(b64) { b64 = String(b64).replace(/-/g, '+').replace(/_/g, '/'); while (b64.length % 4) b64 += '='; var s = atob(b64), a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  function same(buf, arr) { var a = new Uint8Array(buf); if (a.length !== arr.length) return false; for (var i = 0; i < a.length; i++) if (a[i] !== arr[i]) return false; return true; }
  var keyCache = null;
  function key() { if (keyCache) return Promise.resolve(keyCache); return LawLink.pushKey().then(function (d) { keyCache = bytes(d.key); return keyCache; }); }
  function mine() { return ready().then(function (reg) { return reg.pushManager.getSubscription(); }); }
  function clean(p) {
    var o = {}; for (var k in DEF) o[k] = p && p[k] !== undefined ? p[k] : DEF[k];
    o.time = Math.min(1439, Math.max(0, Math.round(Number(o.time)) || 0));
    o.answer = !!o.answer; o.news = !!o.news; o.pass = !!o.pass; o.daily = !!o.daily;
    return o;
  }
  // The server also needs this phone's time zone (minutes ahead of UTC) to send the daily reminder at the right hour.
  function wire(p) { return { answer: p.answer, news: p.news, pass: p.pass, daily: p.daily, time: p.time, tz: -new Date().getTimezoneOffset() }; }

  // What the Settings page shows: whether it can work here, whether it is on, and the choices.
  function state() {
    var why = support(), st = saved(), prefs = clean(st && st.prefs);
    if (why !== 'ok') return Promise.resolve({ why: why, on: false, prefs: prefs });
    return mine().then(function (sub) { return { why: why, on: !!(sub && st && st.on), prefs: prefs }; }, function () { return { why: why, on: false, prefs: prefs }; });
  }
  // Call this straight from a tap: the phone only shows its permission question after a tap.
  async function enable(prefs) {
    var why = support();
    if (why !== 'ok') throw new Error(explain(why));
    var perm = Notification.permission;
    if (perm !== 'granted') perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Notifications were not allowed. You can allow them in your phone\'s settings for this site, then try again.');
    var k = await key(), reg = await ready(), sub = await reg.pushManager.getSubscription();
    var cur = sub && sub.options && sub.options.applicationServerKey;
    if (sub && cur && !same(cur, k)) { try { await sub.unsubscribe(); } catch (e) {} sub = null; } // made for an older key: start again
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: k });
    var p = clean(prefs);
    await LawLink.pushSubscribe(sub.toJSON(), wire(p));
    keep({ on: 1, prefs: p, t: Date.now() });
    return p;
  }
  // Sends the student's choices to the server (the phone's address goes with them, so this also re-registers it).
  async function save(prefs) {
    var sub = await mine();
    if (!sub) throw new Error('Notifications are not on for this phone. Turn them on first.');
    var st = saved(), p = clean(Object.assign({}, st && st.prefs, prefs));
    await LawLink.pushSubscribe(sub.toJSON(), wire(p));
    keep({ on: 1, prefs: p, t: Date.now() });
    return p;
  }
  async function disable() {
    var sub = null; try { sub = await mine(); } catch (e) {}
    keep(null);
    var ep = sub && sub.endpoint;
    if (sub) { try { await sub.unsubscribe(); } catch (e) {} }
    if (ep) { try { await LawLink.pushUnsubscribe(ep); } catch (e) {} }
  }
  async function test() {
    var sub = await mine();
    if (!sub) throw new Error('Notifications are not on for this phone. Turn them on first.');
    return LawLink.pushTest(sub.endpoint);
  }
  // Once a day, while the app is in use: make sure the server still knows this phone (browsers sometimes replace its address).
  async function resync() {
    var st = saved();
    if (!st || !st.on || !LawLink.loggedIn() || support() !== 'ok' || Notification.permission !== 'granted') return;
    if (Date.now() - (st.t || 0) < 20 * 3600000) return;
    try { var sub = await mine(); if (sub) await save(); else await enable(st.prefs); } catch (e) { /* try again next time */ }
  }

  window.PushUI = { support: support, explain: explain, state: state, enable: enable, save: save, disable: disable, test: test, resync: resync, key: key, DEF: DEF };
  if (document.readyState === 'complete') setTimeout(resync, 3000); else window.addEventListener('load', function () { setTimeout(resync, 3000); });
})();
