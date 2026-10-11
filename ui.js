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
  // Turns note text into HTML. {{c:id|Name|Citation}} becomes a tappable case link.
  window.rich = function (text) {
    var s = esc(text || '');
    s = s.replace(/\{\{c:([a-z0-9-]+)\|([^|}]+)\|([^}]*)\}\}/g, function (m, id, name, cit) {
      return '<a class="auth" href="case.html?id=' + id + '">' + name + '</a>' + (cit ? ' <span class="cit">' + cit + '</span>' : '');
    });
    // {{a:type:id|Name|Provision}} becomes a tappable link to the shared page for that law.
    s = s.replace(/\{\{a:([a-z]+):([a-z0-9-]+)\|([^|}]+)\|([^}]*)\}\}/g, function (m, type, id, name, prov) {
      prov = prov.trim();
      var href = 'authority.html?id=' + encodeURIComponent('auth:' + type + ':' + id) + (prov ? '&s=' + encodeURIComponent(prov) : '');
      var extra = prov && name.toLowerCase().indexOf(prov.toLowerCase()) < 0 ? ' <span class="cit">' + prov + '</span>' : '';
      return '<a class="auth" href="' + href + '">' + name + '</a>' + extra;
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
  // Installable, offline-capable app.
  try {
    var h = document.head;
    var l = document.createElement('link'); l.rel = 'manifest'; l.href = 'manifest.json'; h.appendChild(l);
    var a = document.createElement('link'); a.rel = 'apple-touch-icon'; a.href = 'apple-touch-icon.png'; h.appendChild(a);
    var m = document.createElement('meta'); m.name = 'theme-color'; m.content = '#1F3A5F'; h.appendChild(m);
    if ('serviceWorker' in navigator && location.protocol !== 'file:') window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  } catch (e) {}
})();
