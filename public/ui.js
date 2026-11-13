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
    try { if (window.Settings) Settings.set('theme', next); } catch (e) {} // keep the choice after the page reloads
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
    s = s.replace(/\{\{c:([A-Za-z0-9-]+)\|([^|}]+)\|([^}]*)\}\}/g, function (m, id, name, cit) {
      id = id.toLowerCase();
      return '<a class="auth case" href="case.html?id=' + id + '">' + name + '</a>' + (cit ? ' <span class="cit">' + cit + '</span>' : '');
    });
    // {{a:type:id|Name|Provision}} becomes a tappable link: to the section when the provision names one, else to the law.
    s = s.replace(/\{\{a:([A-Za-z]+):([A-Za-z0-9-]+)\|([^|}]+)\|([^}]*)\}\}/g, function (m, type, id, name, prov) {
      type = type.toLowerCase(); id = id.toLowerCase();
      var p = parseProv(prov.replace(/&amp;/g, '&'));
      var target = 'auth:' + type + ':' + id + (p ? ':' + p.key : '');
      var href = 'authority.html?id=' + encodeURIComponent(target) + (prov ? '&s=' + encodeURIComponent(prov.replace(/&amp;/g, '&')) : '');
      var np = parseProv(name.replace(/&amp;/g, '&'));
      var shown = prov && name.toLowerCase().indexOf(prov.toLowerCase()) < 0 && !(np && p && np.key === p.key);
      return '<a class="auth" href="' + href + '">' + name + '</a>' + (shown ? ' <span class="cit">' + prov + '</span>' : '');
    });
    // A marker that still cannot be read is shown as plain words, never as curly brackets.
    s = s.replace(/\{\{([^{}]*)\}\}/g, function (m, inner) { var f = inner.split('|'); return f.length > 1 ? f[1] : inner.replace(/^[acAC]:(?:[A-Za-z]+:)?/, ''); });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return s.split(/\n\s*\n/).map(function (b) {
      var lines = b.split('\n').filter(function (l) { return l.trim(); });
      if (lines.length && lines.every(function (l) { return /^\s*[-*] /.test(l); })) {
        return '<ul>' + lines.map(function (l) { return '<li>' + l.replace(/^\s*[-*] /, '') + '</li>'; }).join('') + '</ul>';
      }
      return '<p>' + lines.join('<br>') + '</p>';
    }).join('');
  };
  window.inviteFriend = function () {
    var url = location.origin + '/', t = 'I am studying law on Lex-Tabulā: notes, quizzes and IRAC practice for Nigerian law students. Try it: ' + url;
    if (navigator.share) navigator.share({ title: 'Lex-Tabulā', text: t }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { alert('Copied. Paste it into WhatsApp or any chat.'); }, function () { alert(t); });
    else alert(t);
  };
  // Saved courses and topic progress. Kept on this device until the backend sync is built.
  var PK = 'lawlink-prog';
  window.Prog = {
    get: function () { try { var p = JSON.parse(localStorage.getItem(PK)); if (p && p.done && p.saved) return window.Prog.clean(p); } catch (e) {} return { done: {}, saved: {} }; },
    put: function (p) { try { localStorage.setItem(PK, JSON.stringify(p)); } catch (e) {} try { window.LawLink && LawLink.schedule && LawLink.schedule(); } catch (e) {} },
    // A topic counts as learnt only when its quiz was passed. Any other tick is ignored, so nobody can tick topics by hand.
    clean: function (p) { for (var k in p.done) if (k.charAt(0) === 't' && !(p.quiz && p.quiz[k] && p.quiz[k].p)) delete p.done[k]; return p; },
    toggle: function (bucket, id) { var p = this.get(); if (p[bucket][id]) delete p[bucket][id]; else p[bucket][id] = 1; this.put(p); return !!p[bucket][id]; },
    tag: function (cid) { var p = this.get(); return (p.tags && p.tags[cid]) || ''; },
    setTag: function (cid, v) { var p = this.get(); p.tags = p.tags || {}; if (v) p.tags[cid] = v; else p.tags[cid] = 'none'; this.put(p); },
    isBm: function (id) { var p = this.get(); return !!(p.bm && p.bm[id] && !p.bm[id].x); },
    toggleBm: function (id, name, kind) { var p = this.get(); p.bm = p.bm || {}; var on = !!(p.bm[id] && !p.bm[id].x); p.bm[id] = { n: String(name || id).slice(0, 160), k: kind, t: Date.now(), x: on ? 1 : 0 }; this.put(p); return !on; },
    bms: function () { var p = this.get(), o = []; for (var id in (p.bm || {})) if (!p.bm[id].x) o.push({ id: id, n: p.bm[id].n, k: p.bm[id].k, t: p.bm[id].t }); return o.sort(function (a, b) { return b.t - a.t; }); },
    // Attempt history for the Performance page: newest 120 scores, tiny entries so the backup stays small.
    hist: function (p, k, c, pct) { p.hist = p.hist || []; p.hist.push({ k: k, c: c, s: pct, t: Date.now() }); if (p.hist.length > 120) p.hist = p.hist.slice(-120); },
    // Study days: one count per calendar day of quizzes and IRAC tests taken. Keeps the last 70 days.
    dkey: function (t) { var d = new Date(t || Date.now()); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); },
    day: function (p) { p.days = p.days || {}; var k = this.dkey(); p.days[k] = (p.days[k] || 0) + 1; var ks = Object.keys(p.days).sort(); while (ks.length > 70) delete p.days[ks.shift()]; },
    goal: function () { var g = Number(this.get().goal); return g >= 1 && g <= 10 ? g : 1; },
    setGoal: function (n) { var p = this.get(); p.goal = n; this.put(p); },
    today: function () { return (this.get().days || {})[this.dkey()] || 0; },
    // A streak is the number of days in a row with at least one quiz. If today has none yet, yesterday still keeps it alive.
    streak: function () { var d = this.get().days || {}, t = new Date(), n = 0; if (!d[this.dkey(t)]) t.setDate(t.getDate() - 1); while (d[this.dkey(t)]) { n++; t.setDate(t.getDate() - 1); } return n; },
    exams: function () { var l = (this.get().exams || []).slice(); var t0 = new Date(); t0.setHours(0, 0, 0, 0); return l.map(function (x) { var p = String(x.d).split('-'); var dt = new Date(+p[0], +p[1] - 1, +p[2]); return { n: x.n, d: x.d, days: Math.round((dt - t0) / 86400000) }; }).filter(function (x) { return x.days >= -1; }).sort(function (a, b) { return a.days - b.days; }); },
    addExam: function (n, d) { var p = this.get(); p.exams = (p.exams || []).filter(function (x) { return !(x.n === n && x.d === d); }); p.exams.push({ n: String(n).slice(0, 60), d: d }); p.exams = p.exams.slice(-8); this.put(p); },
    delExam: function (n, d) { var p = this.get(); p.exams = (p.exams || []).filter(function (x) { return !(x.n === n && x.d === d); }); this.put(p); },
    quizOf: function (id) { var p = this.get(); return (p.quiz && p.quiz[id]) || null; },
    // Record a quiz attempt. Passing also marks the topic as done, so every counter in the app treats it as learnt.
    quizRec: function (id, pct, pass) { var p = this.get(); p.quiz = p.quiz || {}; var o = p.quiz[id] || { b: 0, n: 0, p: 0 }; p.quiz[id] = { b: Math.max(o.b || 0, pct), n: (o.n || 0) + 1, p: (o.p || pass) ? 1 : 0, l: pct, t: Date.now() }; this.hist(p, 'q', id.split(':')[1] || '', pct); this.day(p); if (pass) p.done[id] = 1; this.put(p); return p.quiz[id]; },
    iracOf: function (cid, part) { var p = this.get(); return (p.irac && p.irac[cid + ':' + part]) || null; },
    iracRec: function (cid, part, pct, pass) { var p = this.get(), k = cid + ':' + part; p.irac = p.irac || {}; var o = p.irac[k] || { b: 0, n: 0, p: 0 }; p.irac[k] = { b: Math.max(o.b || 0, pct), n: (o.n || 0) + 1, p: (o.p || pass) ? 1 : 0, l: pct, t: Date.now() }; this.hist(p, 'i', cid, pct); this.day(p); this.put(p); return p.irac[k]; },
    // How far a course has got: topics learnt, and the IRAC test of each part that has one.
    courseState: function (c, iracReady, qr) {
      var n = 0, d = 0, parts = [];
      c.parts.forEach(function (pt, pi) {
        var pn = 0, pd = 0, dn = Prog.get().done; for (var i = 0; i < pt.topics.length; i++) { var nid = 't:' + c.id + ':' + pi + ':' + i; if (qr && !qr[nid]) continue; pn++; if (dn[nid]) pd++; }
        n += pn; d += pd;
        var has = !!(iracReady && iracReady[pi] >= 5), r = Prog.iracOf(c.id, pi);
        parts.push({ pi: pi, label: pt.label, n: pn, d: pd, unlocked: pn > 0 && pd >= pn, has: has, passed: !!(r && r.p), best: r ? r.b : null });
      });
      var all = parts.length > 0 && parts.every(function (x) { return x.n > 0 && x.d >= x.n && (!x.has || x.passed); });
      var units = n + parts.filter(function (x) { return x.has; }).length, got = d + parts.filter(function (x) { return x.has && x.passed; }).length;
      return { n: n, d: d, parts: parts, complete: all, pct: units ? Math.round(got / units * 100) : 0 };
    },
    // The "continue where you stopped" spot is saved on the phone only; it is backed up with the next real change, not on every page.
    setLast: function (o) { var p = this.get(); p.last = o; try { localStorage.setItem(PK, JSON.stringify(p)); } catch (e) {} },
    doneIn: function (cid) { var p = this.get(), n = 0; for (var k in p.done) if (k.indexOf('t:' + cid + ':') === 0) n++; return n; }
  };
  // Reading settings, kept on this device. Applied before the page paints.
  var SK = 'lawlink-settings';
  var SIZES = { s: 15, m: 17, l: 19, xl: 21 };
  window.Settings = {
    get: function () { var d = { size: 'm', read: 'normal', theme: 'system', level: '', school: '' }; try { var s = JSON.parse(localStorage.getItem(SK)); if (s) for (var k in d) if (s[k]) d[k] = s[k]; } catch (e) {} return d; },
    set: function (k, v) { var s = this.get(); s[k] = v; try { localStorage.setItem(SK, JSON.stringify(s)); } catch (e) {} this.apply(); if (k === 'level' || k === 'school') { try { window.LawLink && LawLink.schedule && LawLink.schedule(); } catch (e) {} } },
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
    // The menu button sits at the left of the bar on main pages. On pages that already have a back arrow it stays at the right, and the menu opens from that side.
    var hasBack = !!top.querySelector('.ib');
    var btn = document.createElement('button');
    btn.id = 'menu-btn'; btn.className = 'burger'; btn.type = 'button';
    btn.setAttribute('aria-label', 'Menu'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'menu-panel');
    btn.innerHTML = '<span class="burger-box"><span class="burger-line"></span></span>';
    if (hasBack) top.appendChild(btn); else top.insertBefore(btn, top.firstChild);
    var ov = document.createElement('div'); ov.className = 'menu-ov'; ov.id = 'menu-ov';
    var pn = document.createElement('nav'); pn.className = 'menu-pn' + (hasBack ? ' right' : ''); pn.id = 'menu-panel'; pn.setAttribute('aria-label', 'Menu');
    function ic(d) { return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' + d + '</svg>'; }
    function row(href, d, text, extra) { return '<a class="mn-it" href="' + href + '"' + (extra || '') + '>' + ic(d) + text + '</a>'; }
    pn.innerHTML =
      '<div class="mn-head"><div class="mn-av" id="mn-av" aria-hidden="true">L</div><div class="mn-name" id="mn-name">Lex-Tabulā</div><a class="mn-chip" id="mn-chip" href="subscribe.html" hidden></a></div>' +
      '<button class="mn-lb mn-tg" type="button" id="mn-study" aria-expanded="false" aria-controls="mn-studybox">Study' + ic('<path d="M6 9l6 6 6-6"/>') + '</button><div id="mn-studybox" hidden>' +
      row('courses.html', '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/>', 'Courses') +
      row('notes.html', '<path d="M5 20l4-1 10-10-3-3L6 16z"/>', 'My notes') +
      row('goals.html', '<path d="M12 3c1 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 2 2 1 .5-1 0-3 0-5z"/><path d="M6 20h12"/>', 'Goals, streak and exams') +
      row('progress.html', '<path d="M7 4h10v16l-5-4-5 4z"/>', 'My progress') +
      row('performance.html', '<path d="M5 20V11M12 20V5M19 20v-7"/>', 'Performance') +
      row('plan.html', '<path d="M5 4h14v16H5z"/><path d="M9 9l2 2 4-4M9 15h6"/>', 'Study plan') +
      row('authorities.html', '<path d="M7 3h8l4 4v14H7z"/><path d="M10 12h6M10 16h6"/>', 'Statutes') +
      row('authorities.html?k=cases', '<path d="M12 3v18M5 7h14M5 7l-2 7a3 3 0 0 0 4 0zM19 7l-2 7a3 3 0 0 0 4 0z"/>', 'Cases') + '</div>' +
      '<div class="mn-sep"></div><div class="mn-lb">Account</div>' +
      row('profile.html', '<circle cx="12" cy="8" r="4"/><path d="M4 20c1-4 4-6 8-6s7 2 8 6"/>', 'My profile') +
      row('subscribe.html', '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>', 'Lex-Tabulā pass', ' id="mn-pass" hidden') +
      row('settings.html', '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>', 'Settings') +
      '<button class="mn-it" type="button" id="mn-invite">' + ic('<circle cx="9" cy="8" r="3"/><path d="M3 19c0-3 3-5 6-5s6 2 6 5M18 8v6M15 11h6"/>') + '<span>Invite a friend</span></button>' +
      '<button class="mn-it" type="button" id="mn-install" hidden>' + ic('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>') + '<span>Install app</span></button>' +
      '<p class="mn-help" id="mn-help" hidden></p>' +
      '<div class="mn-sep"></div><div class="mn-lb">Help</div>' +
      '<button class="mn-it" type="button" id="mn-tour">' + ic('<circle cx="12" cy="12" r="9"/><path d="M10 9a2 2 0 1 1 3 1.7c-.7.4-1 .9-1 1.8M12 16.5h.01"/>') + '<span>How Lex-Tabulā works</span></button>' +
      row('about.html', '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>', 'About Lex-Tabulā') +
      row('notices.html', '<path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15zM10 21h4"/>', 'Announcements') +
      row('privacy.html', '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>', 'Terms and privacy') +
      '<div class="mn-sep" id="mn-asep" hidden></div><div class="mn-lb" id="mn-albl" hidden><span>Admin</span><span>only you see this</span></div>' +
      row('inbox.html', '<path d="M4 6h16v12H4zM4 7l8 6 8-6"/>', 'Admin inbox', ' id="mn-inbox" hidden') +
      row('announce.html', '<path d="M4 10v4h3l6 4V6L7 10zM17 9a4 4 0 0 1 0 6"/>', 'Post announcement', ' id="mn-ann" hidden') +
      row('moderate.html', '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>', 'Community reports', ' id="mn-mod" hidden') +
      row('students.html', '<circle cx="9" cy="8" r="3"/><path d="M3 19c0-3 3-5 6-5s6 2 6 5M16 6a3 3 0 0 1 0 6M18 14c2 .5 3 2 3 5"/>', 'Students', ' id="mn-students" hidden') +
      row('payments.html', '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/>', 'Payments and codes', ' id="mn-pays" hidden') +
      '<button class="mn-it mn-out" type="button" id="mn-out">' + ic('<path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9"/>') + '<span></span></button>';
    document.body.appendChild(ov); document.body.appendChild(pn);
    var openNow = false;
    function setText(id, t) { var e = document.getElementById(id); if (e) e.textContent = t; }
    function who() {
      var li = window.LawLink && LawLink.loggedIn && LawLink.loggedIn();
      if (!li) { setText('mn-name', 'Guest'); setText('mn-av', 'G'); return; }
      try { var c = JSON.parse(localStorage.getItem('lawlink-user')); if (c && c.name) { setText('mn-name', c.name); setText('mn-av', String(c.name).trim().charAt(0).toUpperCase() || 'L'); } } catch (e) {}
      LawLink.me().then(function (m) {
        if (!m) return;
        if (m.name) { setText('mn-name', m.name); setText('mn-av', String(m.name).trim().charAt(0).toUpperCase() || 'L'); }
        var adm = m.role === 'admin';
        ['mn-inbox', 'mn-ann', 'mn-mod', 'mn-students', 'mn-pays', 'mn-asep', 'mn-albl'].forEach(function (id) { var e = document.getElementById(id); if (e) e.hidden = !adm; });
      }).catch(function () {});
      if (LawLink.payState) LawLink.payState().then(function (s) {
        var chip = document.getElementById('mn-chip'), row = document.getElementById('mn-pass');
        if (!s || !s.on) { chip.hidden = true; row.hidden = true; return; }
        row.hidden = false;
        var d = s.until ? Math.max(0, Math.ceil((s.until - Date.now()) / 86400000)) : 0;
        if (s.why === 'pass') { chip.textContent = 'Pass active · ' + d + ' day' + (d === 1 ? '' : 's') + ' left'; chip.hidden = false; }
        else if (s.why === 'trial') { chip.textContent = 'Free access · ' + d + ' day' + (d === 1 ? '' : 's') + ' left'; chip.hidden = false; }
        else if (s.why === 'locked' || s.why === 'guest') { chip.textContent = 'No pass yet · tap to get one'; chip.hidden = false; }
        else chip.hidden = true;
      }).catch(function () {});
    }
    function label() {
      var li = window.LawLink && LawLink.loggedIn && LawLink.loggedIn();
      document.getElementById('mn-out').lastChild.textContent = li ? 'Sign out' : 'Sign in';
      document.getElementById('mn-install').hidden = isStandalone();
      who();
    }
    function setOpen(on) {
      openNow = on; if (on) label();
      btn.classList.toggle('is-open', on); btn.setAttribute('aria-expanded', String(on));
      pn.classList.toggle('on', on); ov.classList.toggle('on', on);
      document.documentElement.style.overflow = on ? 'hidden' : '';
      if (!on) { var h = document.getElementById('mn-help'); h.hidden = true; }
      if (on) { var f = pn.querySelector('.mn-tg, .mn-it'); if (f) f.focus(); }
    }
    btn.addEventListener('click', function () { setOpen(!openNow); });
    ov.addEventListener('click', function () { setOpen(false); btn.focus(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && openNow) { setOpen(false); btn.focus(); } });
    // Study is folded away until the student opens it, and the menu remembers their choice.
    (function () {
      var tg = document.getElementById('mn-study'), box = document.getElementById('mn-studybox');
      function show(on) { box.hidden = !on; tg.setAttribute('aria-expanded', String(on)); }
      var open = false; try { open = localStorage.getItem('lawlink-menu-study') === '1'; } catch (e) {}
      show(open);
      tg.addEventListener('click', function () { var on = box.hidden; show(on); try { localStorage.setItem('lawlink-menu-study', on ? '1' : '0'); } catch (e) {} });
    })();
    document.getElementById('mn-tour').addEventListener('click', function () {
      var from = document.getElementById('mn-tour'); setOpen(false);
      function go() { if (window.LTTour) window.LTTour.open(btn); }
      if (window.LTTour) { go(); return; }
      var sc = document.createElement('script'); sc.src = 'tour.js'; sc.onload = go; document.head.appendChild(sc);
    });
    document.getElementById('mn-invite').addEventListener('click', function () { window.inviteFriend && window.inviteFriend(); });
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
  // ---- Opening animation: a tablet carved XII with the scales of justice opens like a book onto numbered clauses (s 1, s 2, s 3). ----
  var SP_TAG = 'Law, learned properly';
  var SP_KEY = 'lawlink-splash';
  function spBuild(cfg) {
    if (document.getElementById('sp')) return;
    var secs = Math.min(2.5, Math.max(0.8, Number(cfg && cfg.secs) || 1.6));
    var tag = cfg && typeof cfg.tag === 'string' ? cfg.tag : SP_TAG;
    var st = document.createElement('style'); st.id = 'sp-css';
    st.textContent =
      '#sp{position:fixed;left:0;top:0;right:0;bottom:0;z-index:99999;background:#1C5848;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;color:#fff;opacity:1;transition:opacity .25s ease;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
      '#sp.out{opacity:0}' +
      '#sp .stg{width:200px;height:252px;position:relative;perspective:900px;filter:drop-shadow(0 12px 26px rgba(0,0,0,.35));animation:spin calc(.35s*var(--u)) ease both}' +
      '#sp .pg{position:absolute;left:0;top:0;width:200px;height:252px;background:#EDF0EA;border-radius:10px;box-sizing:border-box;padding:0 22px;display:flex;flex-direction:column;gap:24px;justify-content:center}' +
      '#sp .cl{display:flex;align-items:center;gap:12px;opacity:0;animation:spcl calc(.3s*var(--u)) ease both}' +
      '#sp .cl b{font:700 19px Inter,system-ui,sans-serif;color:#1C5848;min-width:36px}' +
      '#sp .cl i{flex:1;height:8px;border-radius:4px;background:#D6DCD3}' +
      '#sp .cl:nth-child(1){animation-delay:calc(.95s*var(--u))}#sp .cl:nth-child(2){animation-delay:calc(1.1s*var(--u))}#sp .cl:nth-child(3){animation-delay:calc(1.25s*var(--u))}' +
      '#sp .cv{position:absolute;top:0;width:100px;height:252px;overflow:hidden;-webkit-backface-visibility:hidden;backface-visibility:hidden}' +
      '#sp .cv svg{position:absolute;top:0;width:200px;height:252px;display:block}' +
      '#sp .cv.l{left:0;transform-origin:left center;animation:spL calc(.7s*var(--u)) calc(.3s*var(--u)) cubic-bezier(.5,0,.2,1) both}' +
      '#sp .cv.r{right:0;transform-origin:right center;animation:spR calc(.7s*var(--u)) calc(.3s*var(--u)) cubic-bezier(.5,0,.2,1) both}' +
      '#sp .cv.r svg{left:-100px}' +
      '#sp .txt{text-align:center;padding:0 24px}' +
      '#sp .nm{font:700 34px Inter,system-ui,sans-serif;letter-spacing:.3px;opacity:0;animation:spcl calc(.35s*var(--u)) calc(.9s*var(--u)) ease both}' +
      '#sp .tg{font:17px "Source Serif 4","Times New Roman",Times,serif;color:#C6DDD3;margin-top:6px;opacity:0;animation:spcl calc(.35s*var(--u)) calc(1.05s*var(--u)) ease both}' +
      '@keyframes spL{from{transform:rotateY(0)}to{transform:rotateY(-158deg)}}' +
      '@keyframes spR{from{transform:rotateY(0)}to{transform:rotateY(158deg)}}' +
      '@keyframes spin{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}}' +
      '@keyframes spcl{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}';
    var face =
      '<svg viewBox="0 0 200 252" aria-hidden="true"><rect width="200" height="252" rx="10" fill="#CFA851" stroke="none"/><rect x="9" y="9" width="182" height="234" rx="6" fill="none" stroke="#8A6420" stroke-width="1.6"/>' +
      '<g fill="none" stroke="#1C5848" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="100" cy="52" r="5"/><path d="M100 57V118M80 121H120M58 74H142M58 74L45 104M58 74L71 104M142 74L129 104M142 74L155 104M41 104Q58 122 75 104ZM125 104Q142 122 159 104Z"/></g>' +
      '<text x="100" y="204" text-anchor="middle" font-family="Times New Roman,Times,serif" font-size="52" font-weight="700" letter-spacing="4" fill="#1C5848" stroke="none">XII</text></svg>';
    var ov = document.createElement('div'); ov.id = 'sp'; ov.setAttribute('aria-hidden', 'true'); ov.style.setProperty('--u', String(secs / 1.6));
    ov.innerHTML =
      '<div class="stg"><div class="pg"><div class="cl"><b>s 1</b><i></i></div><div class="cl"><b>s 2</b><i></i></div><div class="cl"><b>s 3</b><i></i></div></div>' +
      '<div class="cv l">' + face + '</div><div class="cv r">' + face + '</div></div>' +
      '<div class="txt"><div class="nm">Lex-Tabulā</div>' + (tag ? '<div class="tg"></div>' : '') + '</div>';
    var tg = ov.querySelector('.tg'); if (tg) tg.textContent = tag;
    var gone = false;
    function finish(now) {
      if (gone) return; gone = true;
      document.removeEventListener('keydown', onKey);
      if (now) { ov.parentNode && ov.parentNode.removeChild(ov); st.parentNode && st.parentNode.removeChild(st); return; }
      ov.classList.add('out');
      setTimeout(function () { ov.parentNode && ov.parentNode.removeChild(ov); st.parentNode && st.parentNode.removeChild(st); }, 280);
    }
    function onKey(e) { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') finish(false); }
    ov.addEventListener('click', function () { finish(false); });
    document.addEventListener('keydown', onKey);
    r.appendChild(st); r.appendChild(ov);
    setTimeout(function () { finish(false); }, Math.round(secs * 1000));
  }
  // First visit on this phone: show the three welcome slides once, before anything else.
  (function () {
    try {
      if (!/\/home\.html$/.test(location.pathname)) return;
      if (localStorage.getItem('lawlink-welcome')) return;
      if (localStorage.getItem('lawlink-token')) { localStorage.setItem('lawlink-welcome', '1'); return; } // already a signed-in student
      if (/[?&]nowelcome\b/.test(location.search) || (navigator.webdriver && !/[?&]welcome=1\b/.test(location.search))) return;
      window.__goWelcome = true;
      location.replace('welcome.html');
    } catch (e) {}
  })();
  window.playSplash = spBuild;
  (function splash() {
    try {
      if (window.top !== window || window.__goWelcome) return;
      var q = location.search, force = /[?&]splash=1\b/.test(q);
      // The newest settings are fetched once per visit and used the next time.
      var fresh = false; try { fresh = !sessionStorage.getItem('lawlink-splash-conf'); if (fresh) sessionStorage.setItem('lawlink-splash-conf', '1'); } catch (e) {}
      if (fresh) window.addEventListener('load', function () { try { if (window.LawLink && LawLink.appConf) LawLink.appConf().then(function (c) { if (c && c.splash) localStorage.setItem(SP_KEY, JSON.stringify(c.splash)); }).catch(function () {}); } catch (e) {} });
      if (!force) {
        if (/[?&]nosplash\b/.test(q) || navigator.webdriver) return;
        if (sessionStorage.getItem('lawlink-splash-seen')) return;
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      }
      var cfg = { on: true, secs: 1.6, tag: SP_TAG };
      try { var c = JSON.parse(localStorage.getItem(SP_KEY)); if (c) { if (c.on === false) cfg.on = false; if (c.secs >= 0.8 && c.secs <= 2.5) cfg.secs = c.secs; if (typeof c.tag === 'string') cfg.tag = c.tag; } } catch (e) {}
      if (!cfg.on && !force) return;
      try { sessionStorage.setItem('lawlink-splash-seen', '1'); } catch (e) {}
      spBuild(cfg);
    } catch (e) {}
  })();
  // Installable, offline-capable app.
  try {
    var h = document.head;
    var l = document.createElement('link'); l.rel = 'manifest'; l.href = 'manifest.json'; h.appendChild(l);
    var a = document.createElement('link'); a.rel = 'apple-touch-icon'; a.href = 'apple-touch-icon.png'; h.appendChild(a);
    var m = document.createElement('meta'); m.name = 'theme-color'; h.appendChild(m);
    var tcol = function () { var rt = document.documentElement, c = rt.getAttribute('data-theme'), d = c ? c === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; m.content = d ? '#0C1713' : '#EDF0EA'; };
    tcol();
    try { new MutationObserver(tcol).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); matchMedia('(prefers-color-scheme: dark)').addEventListener('change', tcol); } catch (e) {}
    if ('serviceWorker' in navigator && location.protocol !== 'file:') window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  } catch (e) {}
})();
