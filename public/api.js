// Lex-Tabulā front-end API. Every backend call goes through here.
//
// SETUP: paste your Worker address and your Google client ID below (see SETUP.md).
// While API_URL still says PASTE..., the app runs in PREVIEW mode: no backend, community and library are demo/empty.
var API_URL = '/api'; // same address as the website
var GOOGLE_CLIENT_ID = '744868327622-ekqpnaelfic62m4dto9g3u7al0lqvfkf.apps.googleusercontent.com';
// Optional, for later: the public address of your R2 library bucket, so notes load without touching the Worker.
var LIB_BASE = '';

var PREVIEW = API_URL.indexOf('PASTE') === 0;
var TOKEN_KEY = 'lawlink-token';

// ---------- Login state. Students can use Lex-Tabulā without an account ("guest"). ----------
function readToken() { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } }
function tokenInfo(t) {
  try {
    var s = String(t).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    var p = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); })));
    if (p.exp * 1000 > Date.now()) return p;
  } catch (e) {}
  return null;
}
function loggedIn() { var t = readToken(); return !!(t && tokenInfo(t)); }
// Pages call getToken() to check access. Guests get a placeholder, so they can use the library and their own notes.
function getToken() { return loggedIn() ? readToken() : 'guest'; }
function setToken(t) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {} }
function myLevel() { return ''; } // level is no longer collected

var PUBLIC_ACTIONS = { 'lib.get': 1, 'lib.list': 1, 'case.get': 1, 'auth.get': 1, 'auth.list': 1, 'auth.find': 1, 'auth.google': 1, 'app.conf': 1, 'ann.list': 1, 'legal.get': 1, 'about.get': 1, 'push.key': 1 };

// Calls a page makes within a few moments of each other travel in one request, which keeps the app within Cloudflare's daily allowance.
var BATCHABLE = { 'app.conf': 1, 'ann.list': 1, 'legal.get': 1, 'pay.status': 1, 'profile.get': 1, 'courses.list': 1, 'quiz.list': 1, 'irac.list': 1, 'lib.list': 1, 'sync.get': 1 };
var bq = [], bt = null;
function failWith(msg) {
  if (/finish setting up your profile/.test(String(msg)) && typeof location !== 'undefined' && !/setup\.html/.test(location.pathname)) { try { localStorage.removeItem('lawlink-setup'); } catch (e) {} location.replace('setup.html'); }
  return new Error(msg);
}
function net(action, payload) {
  if (BATCHABLE[action] && typeof fetch !== 'undefined') return new Promise(function (res, rej) { bq.push({ a: action, p: payload, res: res, rej: rej }); if (!bt) bt = setTimeout(flushBatch, 30); });
  return netOne(action, payload);
}
async function flushBatch() {
  var q = bq; bq = []; bt = null;
  while (q.length) {
    var grp = q.splice(0, 6);
    if (grp.length === 1) { netOne(grp[0].a, grp[0].p).then(grp[0].res, grp[0].rej); continue; }
    await sendGroup(grp);
  }
}
async function sendGroup(grp) {
  try {
    var tk = loggedIn() ? readToken() : '';
    var res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'batch', token: tk, calls: grp.map(function (x) { return Object.assign({ action: x.a, token: tk }, x.p || {}); }) }) });
    var out = await res.json();
    if (!out.ok) throw failWith(out.error);
    grp.forEach(function (x, i) { var o = out.data.results[i]; if (o && o.ok) x.res(o.data); else x.rej(failWith(o && o.error || 'Something went wrong. Please try again.')); });
  } catch (e) { grp.forEach(function (x) { x.rej(e); }); }
}

async function netOne(action, payload) {
  var body = Object.assign({ action: action, token: loggedIn() ? readToken() : '' }, payload || {});
  var res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids a CORS preflight request
    body: JSON.stringify(body)
  });
  var out = await res.json();
  if (!out.ok) {
    if (/finish setting up your profile/.test(String(out.error)) && typeof location !== 'undefined' && !/setup\.html/.test(location.pathname)) { try { localStorage.removeItem('lawlink-setup'); } catch (e) {} location.replace('setup.html?next=' + encodeURIComponent(/^[a-z]+\.html$/.test(location.pathname.split('/').pop()) ? location.pathname.split('/').pop() : 'home.html')); }
    throw new Error(out.error);
  }
  return out.data;
}

async function call(action, payload) {
  payload = payload || {};
  if (action.indexOf('notes.') === 0) return localNotes(action, payload); // personal notes live on the phone
  if (PREVIEW) return demoCall(action, payload);
  if (!PUBLIC_ACTIONS[action] && !loggedIn()) throw new Error('Please log in to do this.');
  return net(action, payload);
}

// ---------- Personal notes: stored on this phone, backed up with sync ----------
var LOCAL_KEY = 'lawlink-local';
function ls() { try { var d = JSON.parse(localStorage.getItem(LOCAL_KEY)); if (d && d.notes) return { notes: d.notes, del: d.del || {} }; } catch (e) {} return { notes: [], del: {} }; }
function lsSave(d) { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(d)); } catch (e) { throw new Error('This phone has no space left to save notes.'); } schedule(); }
function lsId() { return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function localNotes(action, p) {
  var d = ls(), now = Date.now(), i;
  if (action === 'notes.list') return d.notes;
  if (action === 'notes.save') {
    var n = p.note || {};
    var rec = { title: String(n.title || '').slice(0, 150), course: String(n.course || '').slice(0, 60), topic: String(n.topic || '').slice(0, 100), body: String(n.body || '').slice(0, 20000) };
    if (!rec.title && !rec.body) throw new Error('Add a title or some text.');
    if (n.id) {
      for (i = 0; i < d.notes.length; i++) if (d.notes[i].id === n.id) { d.notes[i] = Object.assign({ id: n.id }, rec, { ts: now }); lsSave(d); return { id: n.id, ts: now }; }
      throw new Error('Note not found.');
    }
    var id = lsId();
    d.notes.push(Object.assign({ id: id }, rec, { ts: now }));
    lsSave(d);
    return { id: id, ts: now };
  }
  if (action === 'notes.delete') {
    d.notes = d.notes.filter(function (x) { return x.id !== p.id; });
    d.del[p.id] = now;
    lsSave(d);
    return {};
  }
  throw new Error('Unknown action.');
}

// ---------- Sync: merge this phone with the backup, then save one row ----------
var SYNC_MAX = 60000, SYNC_KEY = 'lawlink-lastsync';
function sortedObj(o) { var r = {}; Object.keys(o || {}).sort().forEach(function (k) { r[k] = o[k]; }); return r; }
function mergeState(a, b) {
  b = b || {};
  var m = {}, del = {}, k;
  [a, b].forEach(function (s) {
    (s.notes || []).forEach(function (n) { if (n && n.id && (!m[n.id] || n.ts > m[n.id].ts)) m[n.id] = n; });
    var dl = s.del || {}; for (k in dl) if (!del[k] || dl[k] > del[k]) del[k] = dl[k];
  });
  var cutoff = Date.now() - 90 * 86400000, notes = [];
  Object.keys(m).sort().forEach(function (id) { if (!(del[id] && del[id] >= m[id].ts)) notes.push(m[id]); });
  Object.keys(del).forEach(function (id) { if (del[id] < cutoff) delete del[id]; });
  var ap = a.prog || {}, bp = b.prog || {};
  var done = Object.assign({}, bp.done, ap.done), saved = Object.assign({}, bp.saved, ap.saved);
  var bm = {}; [bp.bm || {}, ap.bm || {}].forEach(function (o) { for (var id in o) if (o[id] && (!bm[id] || (o[id].t || 0) > (bm[id].t || 0))) bm[id] = o[id]; });
  var quiz = {}; [bp.quiz || {}, ap.quiz || {}].forEach(function (o) { for (var id in o) { var x = o[id]; if (!x) continue; var y = quiz[id]; quiz[id] = y ? { b: Math.max(x.b || 0, y.b || 0), n: Math.max(x.n || 0, y.n || 0), p: (x.p || y.p) ? 1 : 0, l: (x.t || 0) >= (y.t || 0) ? x.l : y.l, t: Math.max(x.t || 0, y.t || 0) } : x; } });
  var irac = {}; [bp.irac || {}, ap.irac || {}].forEach(function (o) { for (var id in o) { var x = o[id]; if (!x) continue; var y = irac[id]; irac[id] = y ? { b: Math.max(x.b || 0, y.b || 0), n: Math.max(x.n || 0, y.n || 0), p: (x.p || y.p) ? 1 : 0, l: (x.t || 0) >= (y.t || 0) ? x.l : y.l, t: Math.max(x.t || 0, y.t || 0) } : x; } });
  var hs = {}, hist = []; (bp.hist || []).concat(ap.hist || []).forEach(function (h) { if (!h || h.t == null) return; var k = h.k + '|' + h.c + '|' + h.t; if (!hs[k]) { hs[k] = 1; hist.push({ k: h.k, c: h.c, s: h.s, t: h.t }); } });
  hist.sort(function (x, y) { return x.t - y.t || (x.c < y.c ? -1 : 1); }); if (hist.length > 120) hist = hist.slice(-120);
  var prog = { done: sortedObj(done), saved: sortedObj(saved), tags: sortedObj(Object.assign({}, bp.tags, ap.tags)), bm: sortedObj(bm), quiz: sortedObj(quiz), irac: sortedObj(irac), hist: hist };
  var last = ap.last || bp.last; if (last) prog.last = last;
  return { v: 1, notes: notes, del: sortedObj(del), prog: prog, level: a.level || b.level || '', school: a.school || b.school || '' };
}

// ---------- Library cache on this phone, so notes you have opened work offline ----------
// ---------- The pass: what a student may open ----------
window.LAW_UNIS=['University of Lagos','University of Ibadan','University of Nigeria, Nsukka','Obafemi Awolowo University','Ahmadu Bello University','University of Benin','University of Ilorin','University of Jos','University of Port Harcourt','University of Calabar','University of Uyo','University of Abuja','Nnamdi Azikiwe University','Bayero University Kano','Usmanu Danfodiyo University','Lagos State University','Olabisi Onabanjo University','Ekiti State University','Ladoke Akintola University of Technology','Delta State University','Ambrose Alli University','Imo State University','Abia State University','Ebonyi State University','Enugu State University of Science and Technology','Rivers State University','Niger Delta University','Nasarawa State University','Kogi State University','Benue State University','Kaduna State University','Adekunle Ajasin University','Federal University Oye-Ekiti','Federal University Lafia','Federal University Lokoja','Federal University Dutsin-Ma','Federal University Wukari','Nigerian Law School','Afe Babalola University','Babcock University','Covenant University','Bowen University','Redeemer\'s University','Igbinedion University','Madonna University','Godfrey Okoye University','Caleb University','Landmark University','Veritas University','Baze University','Nile University of Nigeria','American University of Nigeria','Bingham University','Lead City University','Joseph Ayo Babalola University','Crescent University','Ajayi Crowther University','Novena University','Western Delta University','Al-Hikmah University','Kwara State University','Edo State University','Other'];
var PAY_KEY = 'lawlink-pay';
function isFreeId(id) { return /^c:/.test(String(id)) || /^t:[\w.-]+:0:0$/.test(String(id)); }
function payCached() { try { var c = JSON.parse(localStorage.getItem(PAY_KEY)); if (c && c.s) return c; } catch (e) {} return null; }
function paySave(s) { try { localStorage.setItem(PAY_KEY, JSON.stringify({ t: Date.now(), s: s })); } catch (e) {} if (s && s.on) purgePaid(); }
// Paid notes are never kept on the phone: remove any copy saved before payment was switched on.
function purgePaid() {
  try {
    var del = [];
    for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (!k) continue; if (k.indexOf('lawlink-off:') === 0 || k === 'lawlink-offidx' || (k.indexOf('lawlink-lib:t:') === 0 && !isFreeId(k.slice(12)))) del.push(k); }
    del.forEach(function (k) { localStorage.removeItem(k); });
    var ix = JSON.parse(localStorage.getItem('lawlink-libidx') || '[]').filter(function (k) { return del.indexOf(k) < 0; }); localStorage.setItem('lawlink-libidx', JSON.stringify(ix));
  } catch (e) {}
}
var LIBC_IDX = 'lawlink-libidx', LIBC_MAX = 30, LIBC_TTL = 86400000;
function cacheGet(key) { try { var c = JSON.parse(localStorage.getItem(key)); if (c && c.t) return c; } catch (e) {} return null; }
function cachePut(key, v) {
  try {
    localStorage.setItem(key, JSON.stringify({ t: Date.now(), v: v }));
    var idx = []; try { idx = JSON.parse(localStorage.getItem(LIBC_IDX)) || []; } catch (e) {}
    idx = idx.filter(function (k) { return k !== key; }); idx.push(key);
    while (idx.length > LIBC_MAX) { try { localStorage.removeItem(idx.shift()); } catch (e) {} }
    localStorage.setItem(LIBC_IDX, JSON.stringify(idx));
  } catch (e) {}
}
async function staticOrCall(path, action, payload) {
  if (LIB_BASE && !PREVIEW) {
    try { var r = await fetch(LIB_BASE.replace(/\/$/, '') + '/' + path); if (r.ok) return await r.json(); } catch (e) {}
  }
  return call(action, payload);
}

function cachedList(key, fetcher) {
  var k = 'lawlink-c:' + key, now = Date.now(), p = tokenInfo(readToken()), adm = !!(p && p.adm);
  if (!adm) { try { var c = JSON.parse(localStorage.getItem(k)); if (c && now - c.t < 15 * 60000) return Promise.resolve(c.m); } catch (e) {} }
  return fetcher().then(function (m) { m = m || {}; if (!adm) { try { localStorage.setItem(k, JSON.stringify({ t: now, m: m })); } catch (e) {} } return m; });
}

// ---------- Automatic backup: sign in once, everything saves in the background ----------
var syncRun = null, syncTimer = null, SYNC_GAP = 20 * 60000;
function schedule(ms) {
  if (PREVIEW || syncRun || !loggedIn()) return;
  try { localStorage.setItem('lawlink-dirty', '1'); } catch (e) {}
  clearTimeout(syncTimer);
  syncTimer = setTimeout(function () { autoSync(); }, ms == null ? 4000 : ms);
}
async function autoSync() {
  if (PREVIEW || syncRun || !loggedIn()) return;
  try {
    var p = tokenInfo(readToken());
    if (p && p.iat && Date.now() / 1000 - p.iat > 7 * 86400) { var d = await net('auth.renew'); if (d && d.token) setToken(d.token); }
    await LawLink.sync();
    try { localStorage.removeItem('lawlink-dirty'); } catch (e) {}
  } catch (e) {}
}
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('load', function () {
    ensureSetup();
    var last = 0; try { last = Number(localStorage.getItem(SYNC_KEY)) || 0; } catch (e) {}
    var dirty = false; try { dirty = !!localStorage.getItem('lawlink-dirty'); } catch (e) {}
    if (loggedIn() && (dirty || Date.now() - last > SYNC_GAP)) schedule(1500);
  });
  document.addEventListener('visibilitychange', function () { var d = false; try { d = !!localStorage.getItem('lawlink-dirty'); } catch (e) {} if (document.visibilityState === 'hidden' && d) schedule(0); });
  window.addEventListener('online', function () { schedule(1000); });
}

// A signed-in student who has not done the first-time screen is sent to it. Admins and guests never are.
function ensureSetup() {
  try {
    if (PREVIEW || !loggedIn()) return;
    var here = location.pathname.split('/').pop() || 'home.html';
    if (/^(setup|login|privacy|about)\.html$/.test(here)) return;
    var p = tokenInfo(readToken()); if (!p || p.adm) return;
    if (localStorage.getItem('lawlink-setup') === '1') return;
    net('profile.get').then(function (d) {
      if (d && d.profile && d.profile.done) { try { localStorage.setItem('lawlink-setup', '1'); } catch (e) {} return; }
      location.replace('setup.html?next=' + encodeURIComponent(/^[a-z]+\.html$/.test(here) ? here : 'home.html'));
    }).catch(function () {});
  } catch (e) {}
}
// Signing out (or deleting an account) turns notifications off on this phone, so the next person to sign in here never receives this student's messages.
async function pushForget() {
  try { localStorage.removeItem('lawlink-push'); } catch (e) {}
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  var work = (async function () {
    var reg = await navigator.serviceWorker.getRegistration();
    var sub = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
    if (!sub) return;
    var ep = sub.endpoint;
    try { await sub.unsubscribe(); } catch (e) {}
    try { if (loggedIn()) await net('push.unsubscribe', { endpoint: ep }); } catch (e) {}
  })();
  await Promise.race([work, new Promise(function (r) { setTimeout(r, 2500); })]);
}
// A phone that has notifications on loads push.js on every page, which keeps it registered with the server (once a day).
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('load', function () {
    try {
      if (!localStorage.getItem('lawlink-push') || !loggedIn() || window.PushUI) return;
      var sc = document.createElement('script'); sc.src = 'push.js'; document.head.appendChild(sc);
    } catch (e) {}
  });
}
var LawLink = {
  loggedIn: loggedIn,
  async googleLogin(credential) {
    if (PREVIEW) throw new Error('Sign-in is not set up yet.');
    var d = await net('auth.google', { credential: credential });
    setToken(d.token); try { localStorage.removeItem('lawlink-signedout'); localStorage.removeItem('lawlink-setup'); localStorage.removeItem('lawlink-tour'); } catch (e) {} return d.user;
  },
  async logout() { try { await pushForget(); } catch (e) {} setToken(null); try { localStorage.removeItem('lawlink-setup'); localStorage.removeItem('lawlink-tour'); } catch (e) {} try { localStorage.setItem('lawlink-signedout', '1'); } catch (e) {} },
  async me() {
    var p = loggedIn() ? tokenInfo(readToken()) : null;
    if (p) return { id: p.sub, name: p.name, email: p.email, wm: p.wm || '', picture: p.pic || '', school: (window.Settings && Settings.get().school) || '', level: myLevel(), role: p.adm ? 'admin' : 'student', guest: false };
    return { id: 'guest', name: 'Student', email: '', level: myLevel(), role: 'student', guest: true };
  },
  lastSync: function () { try { return Number(localStorage.getItem(SYNC_KEY)) || 0; } catch (e) { return 0; } },
  sync: function () { if (!syncRun) syncRun = LawLink.syncNow().then(function (r) { syncRun = null; return r; }, function (e) { syncRun = null; throw e; }); return syncRun; },
  schedule: schedule,
  // Asks for a fresh sign-in pass, which carries this student's watermark code.
  renew: async function () { var d = await net('auth.renew'); if (d && d.token) setToken(d.token); return d; },
  async syncNow() {
    if (PREVIEW) throw new Error('Sign-in is not set up yet.');
    if (!loggedIn()) throw new Error('Please log in to do this.');
    var remote = await net('sync.get'), rs = null;
    try { rs = remote.data ? JSON.parse(remote.data) : null; } catch (e) {}
    var local = ls();
    var merged = mergeState({ notes: local.notes, del: local.del, prog: window.Prog ? Prog.get() : {}, level: (window.Settings && Settings.get().level) || '', school: (window.Settings && Settings.get().school) || '' }, rs);
    var out = JSON.stringify(merged);
    if (out.length > SYNC_MAX) throw new Error('Your notes are too large to back up (limit about 60 KB). Delete or shorten some notes and try again.');
    if (remote.data !== out) await net('sync.put', { data: out });
    lsSave({ notes: merged.notes, del: merged.del });
    if (window.Prog) Prog.put(Object.assign({ done: {}, saved: {}, tags: {}, bm: {}, quiz: {}, irac: {} }, merged.prog));
    if (merged.level && window.Settings && !Settings.get().level) Settings.set('level', merged.level);
    if (merged.school && window.Settings && !Settings.get().school) Settings.set('school', merged.school);
    var now = Date.now(); try { localStorage.setItem(SYNC_KEY, String(now)); } catch (e) {}
    return { notes: merged.notes.length, at: now };
  },

  listNotes: function () { return call('notes.list'); },
  saveNote: function (note) { return call('notes.save', { note: note }); },
  deleteNote: function (id) { return call('notes.delete', { id: id }); },

  listPosts: function (o) { return call('posts.list', o || {}); },
  getPost: function (id) { return call('posts.get', { id: id }); },
  createPost: function (post) { return call('posts.create', { post: post }); },
  deletePost: function (id) { return call('posts.delete', { id: id }); },
  reply: function (postId, body, anon) { return call('replies.create', { postId: postId, body: body, anon: !!anon }); },
  helpful: function (id) { return call('replies.helpful', { id: id }); },
  bestAnswer: function (postId, replyId) { return call('posts.best', { postId: postId, replyId: replyId }); },
  reportPost: function (kind, id, reason) { return call('comm.report', { kind: kind, id: id, reason: reason }); },
  commNotify: function (since) { return call('comm.notify', { since: since || 0 }); },
  commReports: function () { return call('gen.commReports', {}); },
  commReview: function (kind, id, op) { return call('gen.commReview', { kind: kind, id: id, op: op }); },
  commPin: function (id, pinned) { return call('gen.commPin', { id: id, pinned: !!pinned }); },
  commVerify: function (id, on) { return call('gen.commVerify', { id: id, on: !!on }); },
  commMute: function (userId, days) { return call('gen.commMute', { userId: userId, days: days }); },
  deleteReply: function (id) { return call('replies.delete', { id: id }); },

  // Library notes. Opened notes are kept for a day on the phone; admins always get the latest.
  async libGet(noteId, fresh) {
    var key = 'lawlink-lib:' + noteId, c = cacheGet(key), pc = payCached(), gated = !!(pc && pc.s && pc.s.on && !isFreeId(noteId));
    if (!fresh && c && !gated && Date.now() - c.t < LIBC_TTL) return c.v;
    try {
      var v = await staticOrCall('n/' + String(noteId).replace(/:/g, '_') + '.json', 'lib.get', { noteId: noteId });
      if (v && v.sections && v.sections.length && !v.locked && !v.paid && !gated) cachePut(key, v);
      return v;
    } catch (e) { if (c && !gated) return c.v; throw e; }
  },
  async libList(prefixes) {
    var key = 'lawlink-libl:' + prefixes.join('|'), c = cacheGet(key);
    if (c && Date.now() - c.t < 600000) return c.v;
    try { var v = await call('lib.list', { prefixes: prefixes }); cachePut(key, v); return v; }
    catch (e) { if (c) return c.v; throw e; }
  },
  // Where this student stands: {on, active, why, until, price, days, help}. Kept for 5 minutes.
  async payState(force) {
    if (PREVIEW || !loggedIn()) return { on: false, active: true, why: 'off', until: 0 };
    var c = payCached();
    if (!force && c && Date.now() - c.t < 300000) return c.s;
    try { var d = await net('pay.status'); paySave(d.state); return d.state; } catch (e) { return c ? c.s : { on: false, active: true, why: 'off', until: 0 }; }
  },
  async payStart() { var d = await net('pay.start', {}); return d; },
  async payVerify(ref) { var d = await net('pay.verify', { ref: ref }); if (d && d.state) paySave(d.state); return d; },
  payList: function (before, limit) { return call('gen.payList', { before: before || '', limit: limit || 50 }); },
  payRecheck: function (ref) { return call('gen.payRecheck', { ref: ref }); },
  async redeem(code) { var d = await net('pay.redeem', { code: code }); paySave(d.state); return d.state; },
  isFree: isFreeId,
  // The card shown in place of paid content.
  lockHtml: function (why) {
    var guest = why === 'guest';
    return '<div class="soonbox"><h3>Part of the Lex-Tabulā pass</h3><p>' + (guest ? 'Sign in to continue. ' : '') + 'The first topic of every course is free, with its quiz and one IRAC test. The Lex-Tabulā pass opens everything else.</p><div class="btns" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;justify-content:center"><a class="btn" href="' + (guest ? 'login.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search) : 'subscribe.html') + '" style="text-decoration:none">' + (guest ? 'Sign in' : 'Get the pass') + '</a></div></div>';
  },
  // Announcements: kept on the phone for 5 minutes so the home page opens fast.
  annList: async function (force) {
    var K = 'lawlink-ann-cache', c = null;
    try { c = JSON.parse(localStorage.getItem(K)); } catch (e) {}
    if (!force && c && Date.now() - c.t < 300000) return c.v;
    try { var v = await call('ann.list', {}); if (!Array.isArray(v)) v = []; try { localStorage.setItem(K, JSON.stringify({ t: Date.now(), v: v })); } catch (e) {} return v; }
    catch (e) { if (c) return c.v; throw e; }
  },
  annAdminList: function () { return call('gen.annAdminList', {}); },
  annAdd: function (o) { return call('gen.annAdd', o); },
  annDelete: function (id) { return call('gen.annDelete', { id: id }); },
  annEdit: function (o) { return call('gen.annEdit', o); },
  pushInfo: function () { return call('gen.pushInfo', {}); },
  pushSend: function () { return call('gen.pushSend', {}); },
  pushKey: function () { return call('push.key', {}); },
  pushSubscribe: function (sub, prefs) { return call('push.subscribe', { sub: sub, prefs: prefs }); },
  pushUnsubscribe: function (endpoint) { return call('push.unsubscribe', { endpoint: endpoint }); },
  pushTest: function (endpoint) { return call('push.test', { endpoint: endpoint }); },
  pushForget: pushForget,
  aboutGet: function () { return call('about.get', {}); },
  aboutSet: function (text) { return call('gen.aboutSet', { text: text }); },
  legalGet: function () { return call('legal.get', {}); },
  legalSet: function (text) { return call('gen.legalSet', { text: text }); },
  appConf: function () { return call('app.conf', {}); },
  splashGet: function () { return call('gen.splashGet', {}); },
  splashSet: function (o) { return call('gen.splashSet', o); },
  quizCapGet: function () { return call('gen.quizCapGet', {}); },
  quizCapSet: function (cap) { return call('gen.quizCapSet', { cap: cap }); },
  payAdminGet: function () { return call('gen.payGet', {}); },
  paySet: function (o) { return call('gen.paySet', o); },
  codesMake: function (count, label) { return call('gen.codesMake', { count: count, label: label || '' }); },
  codesList: function (batch, status, before, limit) { return call('gen.codesList', { batch: batch || '', status: status || '', before: before || '', limit: limit || 100 }); },
  codesBatches: function () { return call('gen.codesBatches', {}); },
  passFind: function (email) { return call('gen.passFind', { email: email }); },
  passGrant: function (email, days) { return call('gen.passGrant', { email: email, days: days }); },
  passRevoke: function (email) { return call('gen.passRevoke', { email: email }); },
  libReport: function (noteId, message) { return call('lib.report', { noteId: noteId, message: message }); },
  async getCase(id) {
    var key = 'lawlink-case:' + id, c = cacheGet(key);
    if (c && Date.now() - c.t < LIBC_TTL) return c.v;
    try {
      var v = await staticOrCall('c/' + id + '.json', 'case.get', { id: id });
      if (v && v.data) cachePut(key, v);
      return v;
    } catch (e) { if (c) return c.v; throw e; }
  },

  // Statutes, rules, the Constitution and treaties (one shared page each)
  async getAuth(id, fresh) {
    var key = 'lawlink-auth:' + id, c = cacheGet(key);
    if (!fresh && c && Date.now() - c.t < LIBC_TTL) return c.v;
    try { var v = await call('auth.get', { id: id }); if (v && v.data) cachePut(key, v); return v; }
    catch (e) { if (c && !fresh) return c.v; throw e; }
  },
  async listAuth(kind, fresh) {
    var key = 'lawlink-authl:' + kind, c = cacheGet(key);
    if (!fresh && c && Date.now() - c.t < 600000) return c.v;
    try { var v = await call('auth.list', { kind: kind }); cachePut(key, v); return v; }
    catch (e) { if (c) return c.v; throw e; }
  },
  findAuth: function (q) { return call('auth.find', { q: q }); },
  authBackfill: function (id) { return call('gen.authBackfill', { id: id }); },
  genAuth: function (id) { return call('gen.auth', { id: id }); },
  authVerify: function (id, on) { return call('gen.authVerify', { id: id, on: on }); },
  // Links the laws in one note. A big note comes back in pieces so that each step is small; this carries on until the note is finished.
  scanNote: async function (noteId, ai) {
    var from = 0, sum = { skipped: false, found: 0, linked: 0, sections: 0, free: 0, ai: 0, aiNote: '' }, i, r;
    for (i = 0; i < 40; i++) {
      r = await call('gen.scan', { noteId: noteId, ai: ai === false ? false : undefined, from: from || undefined });
      if (r.skipped && !from) return r;
      sum.found += r.found || 0; sum.linked += r.linked || 0; sum.sections += r.sections || 0; sum.free += r.free || 0; sum.ai += r.ai || 0;
      if (r.aiNote) sum.aiNote = r.aiNote;
      if (!r.resume || r.resume === from) break;
      from = r.resume;
    }
    return sum;
  },
  markNext: function (after, dry, resume) { return call('gen.markNext', { after: after || '', dry: !!dry, resume: resume || '' }); },
  addStandard: function () { return call('gen.addStandard', {}); },
  addMaxims: function () { return call('gen.addMaxims', {}); },
  addLaw: function (name, type, skipCheck) { return call('gen.addLaw', { name: name, type: type || '', skipCheck: !!skipCheck }); },
  importLaw: function (p) { return call('gen.importLaw', p); },
  courseSave: function (course) { return call('gen.courseSave', { course: course }); },
  courseHide: function (id, name, hidden) { return call('gen.courseHide', { id: id, name: name, hidden: hidden !== false }); },
  courseList: function () { return call('gen.courseList', {}); },
  addCase: function (name, citation) { return call('gen.addCase', { name: name, citation: citation || '' }); },
  genAuthBatch: function (ids) { return call('gen.authBatch', { ids: ids }); },
  mergeLaw: function (from, to) { return call('gen.mergeLaw', { from: from, to: to }); },
  purgeLaws: function (confirm) { return call('gen.purgeLaws', { confirm: confirm }); },
  lawCurrency: function (id, state, note, asAt, year) { return call('gen.lawCurrency', { id: id, state: state, note: note, asAt: asAt, year: year }); },
  requestLaw: function (text) { return call('req.law', { text: text }); },
  inbox: function () { return call('gen.inbox', {}); },
  inboxDelete: function (id) { return call('gen.inboxDelete', { id: id }); },

  getProfile: function () { return call('profile.get', {}); },
  tourSeen: function () { return call('profile.tour', {}); },
  setupProfile: function (p) { return call('profile.setup', p).then(function (d) { if (d && d.token) setToken(d.token); try { localStorage.setItem('lawlink-sem', JSON.stringify((d.profile && d.profile.sem) || [])); localStorage.setItem('lawlink-setup', '1'); } catch (e) {} return d; }); },
  saveProfile: function (p) { return call('profile.save', p).then(function (d) { if (d && d.token) setToken(d.token); try { localStorage.setItem('lawlink-sem', JSON.stringify((d.profile && d.profile.sem) || [])); } catch (e) {} return d; }); },
  usersList: function (q, before, limit) { return call('gen.usersList', { q: q || '', before: before || '', limit: limit || 50 }); },
  usersResetName: function (id) { return call('gen.usersResetName', { id: id }); },
  deleteAccount: function (confirm) { return call('account.delete', { confirm: confirm }); },
  searchLib: function (q) { return call('search.lib', { q: q }); },
  // Which topics have an approved quiz / which course parts have an IRAC test. Students reuse a copy kept for 15 minutes; admins always ask.
  quizReady: function (cid) { return cachedList('qr:' + cid, function () { return call('quiz.list', { prefix: 't:' + cid + ':' }); }); },
  iracReady: function (cid) { return cachedList('ir:' + cid, function () { return call('irac.list', { courseId: cid }); }); },
  quizList: function (prefix) { return call('quiz.list', { prefix: prefix }); },
  quizGet: function (noteId) { return call('quiz.get', { noteId: noteId }); },
  quizSubmit: function (noteId, answers, ticket) { return call('quiz.submit', { noteId: noteId, answers: answers, ticket: ticket }); },
  quizStats: function (courseId) { return call('gen.quizStats', { courseId: courseId }); },
  reviewSummary: function (courseId) { return call('gen.reviewSummary', { courseId: courseId }); },
  iracList: function (courseId) { return call('irac.list', { courseId: courseId }); },
  iracGet: function (courseId, part) { return call('irac.get', { courseId: courseId, part: part }); },
  iracSubmit: function (courseId, part, answers, ticket) { return call('irac.submit', { courseId: courseId, part: part, answers: answers, ticket: ticket }); },
  iracAdminList: function (courseId, part) { return call('gen.iracList', { courseId: courseId, part: part }); },
  iracMake: function (courseId, part, slot, context) { return call('gen.iracMake', { courseId: courseId, part: part, slot: slot, context: context }); },
  iracSave: function (courseId, part, slot, data, status) { return call('gen.iracSave', { courseId: courseId, part: part, slot: slot, data: data, status: status }); },
  quizAdminGet: function (noteId) { return call('gen.quizGet', { noteId: noteId }); },
  quizMake: function (noteId, context, mode) { return call('gen.quizMake', { noteId: noteId, context: context, mode: mode || '' }); },
  quizSave: function (noteId, questions, status) { return call('gen.quizSave', { noteId: noteId, questions: questions, status: status }); },

  genSection: function (o) { return call('gen.section', o); },
  genCheck: function (noteId) { return call('gen.check', { noteId: noteId }); },
  genVerify: function (noteId) { return call('gen.verify', { noteId: noteId }); },
  genSave: function (o) { return call('gen.save', o); },
  genCase: function (id) { return call('gen.case', { id: id }); }
};

// ---------- Preview mode: community is stored in this browser, the library is empty ----------
var DEMO_KEY = 'lawlink-demo';
function demoLoad() {
  try { var d = JSON.parse(localStorage.getItem(DEMO_KEY)); if (d && d.posts && d.replies) return d; } catch (e) {}
  return { posts: [], replies: [] };
}
function demoSave(d) { try { localStorage.setItem(DEMO_KEY, JSON.stringify(d)); } catch (e) {} }
function demoId() { return 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
var DEMO_USER = { name: 'Demo Student' };

async function demoCall(action, p) {
  var d = demoLoad(), now = Date.now();
  switch (action) {
    case 'posts.list':
      return d.posts.slice().sort(function (a, b) { return b.ts - a.ts; }).map(function (x) {
        return Object.assign({}, x, { replies: d.replies.filter(function (r) { return r.postId === x.id; }).length, mine: true });
      });
    case 'posts.get':
      var post = d.posts.filter(function (x) { return x.id === p.id; })[0];
      if (!post) throw new Error('Post not found.');
      var reps = d.replies.filter(function (r) { return r.postId === p.id; }).sort(function (a, b) { return a.ts - b.ts; })
        .map(function (r) { return Object.assign({}, r, { mine: true }); });
      return { post: Object.assign({}, post, { replies: reps.length, mine: true }), replies: reps };
    case 'posts.create':
      var q = p.post || {};
      if (!q.title) throw new Error('Add a title.');
      if (!q.body) throw new Error('Write your question or tip.');
      var pid = demoId();
      d.posts.push({ id: pid, type: q.type === 'Tip' ? 'Tip' : 'Question', course: q.course || '', title: q.title, body: q.body, author: DEMO_USER.name, level: q.level || '', ts: now });
      demoSave(d); return { id: pid };
    case 'posts.delete':
      d.posts = d.posts.filter(function (x) { return x.id !== p.id; }); demoSave(d); return {};
    case 'replies.create':
      if (!p.body) throw new Error('Write a reply.');
      d.replies.push({ id: demoId(), postId: p.postId, body: p.body, author: DEMO_USER.name, level: p.level || '', ts: now });
      demoSave(d); return {};
    case 'replies.delete':
      d.replies = d.replies.filter(function (x) { return x.id !== p.id; }); demoSave(d); return {};
    case 'lib.get': return { note: null, sections: [] };
    case 'lib.list': return {};
    case 'lib.report': return {};
    case 'case.get': throw new Error('Cases are not available in preview mode.');
    case 'auth.get': throw new Error('Not available in preview mode.');
    case 'auth.list': return [];
    case 'auth.find': return { laws: [], sections: [] };
    default: throw new Error('Not available in preview mode.');
  }
}
