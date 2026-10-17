// Shared helpers. Load in <head> so the saved theme applies before the page paints.
(function () {
  var r = document.documentElement, K = 'lawlink-theme';
  try { var s = localStorage.getItem(K); if (s) r.setAttribute('data-theme', s); } catch (e) {}
  window.toggleTheme = function () {
    var cur = r.getAttribute('data-theme');
    var dark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    var next = dark ? 'light' : 'dark';
    r.setAttribute('data-theme', next);
    try { localStorage.setItem(K, next); } catch (e) {}
  };
  window.esc = function (s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };
  // Reads a provision such as "s. 84(4)", "Order 15 Rule 1" or "Art. 5" into a section key and subsection. Mirrors the back end.
  var SUBS = '((?:\\(\\s*[A-Za-z0-9]{1,5}\\s*\\))*)';
  window.parseProv = function (p) {
    p = String(p || '').trim();
    var m;
    if (/^preamble\b/i.test(p)) return { key: 'preamble', sub: '' };
    var SN = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
    if ((m = /^(?:the\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d{1,2})(?:st|nd|rd|th)?\s+schedule\b/i.exec(p)) || (m = /^schedule\s+(\d{1,2})\b/i.exec(p))) return { key: 'sch' + (SN[m[1].toLowerCase()] || m[1]), sub: '' };
    if ((m = new RegExp('^(?:ss?\\.?|sec(?:tion)?s?\\.?)\\s*(\\d{1,4}[A-Za-z]?)\\s*' + SUBS, 'i').exec(p))) return { key: m[1].toLowerCase(), sub: m[2].replace(/\s+/g, '') };
    if ((m = new RegExp('^art(?:icles?)?\\.?\\s*(\\d{1,4}[A-Za-z]?)\\s*' + SUBS, 'i').exec(p))) return { key: 'art-' + m[1].toLowerCase(), sub: m[2].replace(/\s+/g, '') };
    if ((m = /^(?:o(?:rd(?:er)?)?\.?)\s*(\d{1,3}[A-Za-z]?)(?:\s*,?\s*r(?:ule)?\.?\s*(\d{1,3}[A-Za-z]?))?/i.exec(p))) return { key: 'o' + m[1].toLowerCase() + (m[2] ? 'r' + m[2].toLowerCase() : ''), sub: '' };
    if ((m = /^r(?:ule)?\.?\s*(\d{1,3}[A-Za-z]?)/i.exec(p))) return { key: 'r' + m[1].toLowerCase(), sub: '' };
    if ((m = /^reg(?:ulations?)?\.?\s*(\d{1,3}[A-Za-z]?)/i.exec(p))) return { key: 'reg-' + m[1].toLowerCase(), sub: '' };
    return null;
  };
  // Turns note text into HTML. {{c:id|Name|Citation}} becomes a tappable case link.
  window.rich = function (text) {
    var s = esc(text || '');
    s = s.replace(/\{\{c:([a-z0-9-]+)\|([^|}]+)\|([^}]*)\}\}/g, function (m, id, name, cit) {
      return '<a class="auth" href="case.html?id=' + id + '">' + name + '</a>' + (cit ? ' <span class="cit">' + cit + '</span>' : '');
    });
    // {{a:type:id|Name|Provision}} becomes a tappable link: to the section when the provision names one, else to the law.
    s = s.replace(/\{\{a:([a-z]+):([a-z0-9-]+)\|([^|}]+)\|([^}]*)\}\}/g, function (m, type, id, name, prov) {
      var p = parseProv(prov.replace(/&amp;/g, '&'));
      var target = 'auth:' + type + ':' + id + (p ? ':' + p.key : '');
      var href = 'authority.html?id=' + encodeURIComponent(target) + (prov ? '&s=' + encodeURIComponent(prov.replace(/&amp;/g, '&')) : '');
      var np = parseProv(name.replace(/&amp;/g, '&'));
      var shown = prov && name.toLowerCase().indexOf(prov.toLowerCase()) < 0 && !(np && p && np.key === p.key);
      return '<a class="auth" href="' + href + '">' + name + '</a>' + (shown ? ' <span class="cit">' + prov + '</span>' : '');
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return s.split(/\n\s*\n/).map(function (b) {
      var lines = b.split('\n').filter(function (l) { return l.trim(); });
      if (lines.length && lines.every(function (l) { return /^\s*[-*] /.test(l); })) {
        return '<ul>' + lines.map(function (l) { return '<li>' + l.replace(/^\s*[-*] /, '') + '</li>'; }).join('') + '</ul>';
      }
      return '<p>' + lines.join('<br>') + '</p>';
    }).join('');
  };
  // Saved courses and topic progress. Kept on this device until the backend sync is built.
  var PK = 'lawlink-prog';
  window.Prog = {
    get: function () { try { var p = JSON.parse(localStorage.getItem(PK)); if (p && p.done && p.saved) return p; } catch (e) {} return { done: {}, saved: {} }; },
    put: function (p) { try { localStorage.setItem(PK, JSON.stringify(p)); } catch (e) {} },
    toggle: function (bucket, id) { var p = this.get(); if (p[bucket][id]) delete p[bucket][id]; else p[bucket][id] = 1; this.put(p); return !!p[bucket][id]; },
    tag: function (cid) { var p = this.get(); return (p.tags && p.tags[cid]) || ''; },
    setTag: function (cid, v) { var p = this.get(); p.tags = p.tags || {}; if (v) p.tags[cid] = v; else p.tags[cid] = 'none'; this.put(p); },
    setLast: function (o) { var p = this.get(); p.last = o; this.put(p); },
    doneIn: function (cid) { var p = this.get(), n = 0; for (var k in p.done) if (k.indexOf('t:' + cid + ':') === 0) n++; return n; }
  };
  // Reading settings, kept on this device. Applied before the page paints.
  var SK = 'lawlink-settings';
  var SIZES = { s: 15, m: 16, l: 18, xl: 20 };
  window.Settings = {
    get: function () { var d = { size: 'm', read: 'normal', theme: 'system', level: '' }; try { var s = JSON.parse(localStorage.getItem(SK)); if (s) for (var k in d) if (s[k]) d[k] = s[k]; } catch (e) {} return d; },
    set: function (k, v) { var s = this.get(); s[k] = v; try { localStorage.setItem(SK, JSON.stringify(s)); } catch (e) {} this.apply(); },
    apply: function () {
      var s = this.get();
      r.style.setProperty('--rs', (SIZES[s.size] || 16) + 'px');
      r.setAttribute('data-read', s.read);
      if (s.theme === 'system') { r.removeAttribute('data-theme'); try { localStorage.removeItem('lawlink-theme'); } catch (e) {} }
      else { r.setAttribute('data-theme', s.theme); try { localStorage.setItem('lawlink-theme', s.theme); } catch (e) {} }
    }
  };
  Settings.apply();
  // Menu: one hamburger button on every page. It opens a short list with words: Settings, dark mode, Install app, About, Sign out.
  var installEvt = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEvt = e; });
  window.addEventListener('appinstalled', function () { installEvt = null; var it = document.getElementById('mn-install'); if (it) it.hidden = true; });
  function isStandalone() { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } }
  function isDark() { var c = r.getAttribute('data-theme'); return c ? c === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; }
  function initMenu() {
    var top = document.querySelector('header.top');
    if (!top || document.getElementById('menu-btn')) return;
    // The old separate icons (theme, settings, sign out) now live in the menu.
    top.querySelectorAll('button[onclick*="toggleTheme"], a.ib[href="settings.html"], #logout').forEach(function (n) { n.parentNode.removeChild(n); });
    var btn = document.createElement('button');
    btn.id = 'menu-btn'; btn.className = 'burger'; btn.type = 'button';
    btn.setAttribute('aria-label', 'Menu'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'menu-panel');
    btn.innerHTML = '<span class="burger-box"><span class="burger-line"></span></span>';
    top.appendChild(btn);
    var ov = document.createElement('div'); ov.className = 'menu-ov'; ov.id = 'menu-ov';
    var pn = document.createElement('nav'); pn.className = 'menu-pn'; pn.id = 'menu-panel'; pn.setAttribute('aria-label', 'Menu');
    pn.innerHTML =
      '<a class="mn-it" href="settings.html">Settings</a>' +
      '<a class="mn-it" href="inbox.html" id="mn-inbox" hidden>Admin inbox</a>' +
      '<button class="mn-it" type="button" id="mn-theme"></button>' +
      '<button class="mn-it" type="button" id="mn-install" hidden>Install app</button>' +
      '<p class="mn-help" id="mn-help" hidden></p>' +
      '<a class="mn-it" href="about.html">About LawLink</a>' +
      '<button class="mn-it" type="button" id="mn-out"></button>';
    document.body.appendChild(ov); document.body.appendChild(pn);
    var openNow = false;
    function place() { var b = top.getBoundingClientRect().bottom; pn.style.top = b + 'px'; ov.style.top = b + 'px'; }
    function label() {
      document.getElementById('mn-theme').textContent = isDark() ? 'Light mode' : 'Dark mode';
      var li = window.LawLink && LawLink.loggedIn && LawLink.loggedIn();
      document.getElementById('mn-out').textContent = li ? 'Sign out' : 'Sign in';
      document.getElementById('mn-install').hidden = isStandalone();
      if (window.LawLink && LawLink.me) LawLink.me().then(function (m) { document.getElementById('mn-inbox').hidden = !(m && m.role === 'admin'); }).catch(function () {});
    }
    function setOpen(on) {
      openNow = on; if (on) { place(); label(); }
      btn.classList.toggle('is-open', on); btn.setAttribute('aria-expanded', String(on));
      pn.classList.toggle('on', on); ov.classList.toggle('on', on);
      document.documentElement.style.overflow = on ? 'hidden' : '';
      if (!on) { var h = document.getElementById('mn-help'); h.hidden = true; }
      if (on) { var f = pn.querySelector('.mn-it'); if (f) f.focus(); } 
    }
    btn.addEventListener('click', function () { setOpen(!openNow); });
    ov.addEventListener('click', function () { setOpen(false); btn.focus(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && openNow) { setOpen(false); btn.focus(); } });
    window.addEventListener('resize', function () { if (openNow) place(); });
    document.getElementById('mn-theme').addEventListener('click', function () { toggleTheme(); label(); });
    document.getElementById('mn-install').addEventListener('click', function () {
      var h = document.getElementById('mn-help');
      if (installEvt) { installEvt.prompt(); installEvt = null; return; }
      var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      h.textContent = ios ? 'On iPhone or iPad: open this page in Safari, tap the Share button, then tap Add to Home Screen.' : 'Open your browser menu and choose Install app or Add to Home screen.';
      h.hidden = false;
    });
    document.getElementById('mn-out').addEventListener('click', async function () {
      if (!(window.LawLink && LawLink.loggedIn && LawLink.loggedIn())) { location.href = 'login.html'; return; }
      try { await LawLink.logout(); } catch (e) {}
      try { localStorage.removeItem('lawlink-user'); localStorage.removeItem('lawlink-notes-cache'); } catch (e) {}
      location.replace('login.html');
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initMenu); else initMenu();
  // Installable, offline-capable app.
  try {
    var h = document.head;
    var l = document.createElement('link'); l.rel = 'manifest'; l.href = 'manifest.json'; h.appendChild(l);
    var a = document.createElement('link'); a.rel = 'apple-touch-icon'; a.href = 'apple-touch-icon.png'; h.appendChild(a);
    var m = document.createElement('meta'); m.name = 'theme-color'; m.content = '#1F3A5F'; h.appendChild(m);
    if ('serviceWorker' in navigator && location.protocol !== 'file:') window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  } catch (e) {}
})();
