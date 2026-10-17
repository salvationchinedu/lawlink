// LawLink front-end API. Every backend call goes through here.
//
// SETUP: paste your Worker address and your Google client ID below (see SETUP.md).
// While API_URL still says PASTE..., the app runs in PREVIEW mode: no backend, community and library are demo/empty.
var API_URL = '/api'; // same address as the website
var GOOGLE_CLIENT_ID = '744868327622-ekqpnaelfic62m4dto9g3u7al0lqvfkf.apps.googleusercontent.com';
// Optional, for later: the public address of your R2 library bucket, so notes load without touching the Worker.
var LIB_BASE = '';

var PREVIEW = API_URL.indexOf('PASTE') === 0;
var TOKEN_KEY = 'lawlink-token';

// ---------- Login state. Students can use LawLink without an account ("guest"). ----------
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
function myLevel() { try { return (window.Settings && Settings.get().level) || '100'; } catch (e) { return '100'; } }

var PUBLIC_ACTIONS = { 'lib.get': 1, 'lib.list': 1, 'case.get': 1, 'auth.get': 1, 'auth.list': 1, 'auth.find': 1, 'auth.google': 1 };

async function net(action, payload) {
  var body = Object.assign({ action: action, token: loggedIn() ? readToken() : '' }, payload || {});
  var res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids a CORS preflight request
    body: JSON.stringify(body)
  });
  var out = await res.json();
  if (!out.ok) throw new Error(out.error);
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
function lsSave(d) { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(d)); } catch (e) { throw new Error('This phone has no space left to save notes.'); } }
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
  var prog = { done: sortedObj(done), saved: sortedObj(saved), tags: sortedObj(Object.assign({}, bp.tags, ap.tags)) };
  var last = ap.last || bp.last; if (last) prog.last = last;
  return { v: 1, notes: notes, del: sortedObj(del), prog: prog, level: a.level || b.level || '' };
}

// ---------- Library cache on this phone, so notes you have opened work offline ----------
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

var LawLink = {
  loggedIn: loggedIn,
  async googleLogin(credential) {
    if (PREVIEW) throw new Error('Sign-in is not set up yet.');
    var d = await net('auth.google', { credential: credential });
    setToken(d.token); return d.user;
  },
  async logout() { setToken(null); },
  async me() {
    var p = loggedIn() ? tokenInfo(readToken()) : null;
    if (p) return { id: p.sub, name: p.name, email: p.email, level: myLevel(), role: p.adm ? 'admin' : 'student', guest: false };
    return { id: 'guest', name: 'Student', email: '', level: myLevel(), role: 'student', guest: true };
  },
  lastSync: function () { try { return Number(localStorage.getItem(SYNC_KEY)) || 0; } catch (e) { return 0; } },
  async sync() {
    if (PREVIEW) throw new Error('Sign-in is not set up yet.');
    if (!loggedIn()) throw new Error('Please log in to do this.');
    var remote = await net('sync.get'), rs = null;
    try { rs = remote.data ? JSON.parse(remote.data) : null; } catch (e) {}
    var local = ls();
    var merged = mergeState({ notes: local.notes, del: local.del, prog: window.Prog ? Prog.get() : {}, level: (window.Settings && Settings.get().level) || '' }, rs);
    var out = JSON.stringify(merged);
    if (out.length > SYNC_MAX) throw new Error('Your notes are too large to back up (limit about 60 KB). Delete or shorten some notes and try again.');
    if (remote.data !== out) await net('sync.put', { data: out });
    lsSave({ notes: merged.notes, del: merged.del });
    if (window.Prog) Prog.put(Object.assign({ done: {}, saved: {}, tags: {} }, merged.prog));
    if (merged.level && window.Settings && !Settings.get().level) Settings.set('level', merged.level);
    var now = Date.now(); try { localStorage.setItem(SYNC_KEY, String(now)); } catch (e) {}
    return { notes: merged.notes.length, at: now };
  },

  listNotes: function () { return call('notes.list'); },
  saveNote: function (note) { return call('notes.save', { note: note }); },
  deleteNote: function (id) { return call('notes.delete', { id: id }); },

  listPosts: function () { return call('posts.list'); },
  getPost: function (id) { return call('posts.get', { id: id }); },
  createPost: function (post) { return call('posts.create', { post: Object.assign({ level: myLevel() }, post) }); },
  deletePost: function (id) { return call('posts.delete', { id: id }); },
  reply: function (postId, body) { return call('replies.create', { postId: postId, body: body, level: myLevel() }); },
  deleteReply: function (id) { return call('replies.delete', { id: id }); },

  // Library notes. Opened notes are kept for a day on the phone; admins always get the latest.
  async libGet(noteId, fresh) {
    var key = 'lawlink-lib:' + noteId, c = cacheGet(key);
    if (!fresh && c && Date.now() - c.t < LIBC_TTL) return c.v;
    try {
      var v = await staticOrCall('n/' + String(noteId).replace(/:/g, '_') + '.json', 'lib.get', { noteId: noteId });
      if (v && v.sections && v.sections.length) cachePut(key, v);
      return v;
    } catch (e) { if (c) return c.v; throw e; }
  },
  async libList(prefixes) {
    var key = 'lawlink-libl:' + prefixes.join('|'), c = cacheGet(key);
    if (c && Date.now() - c.t < 600000) return c.v;
    try { var v = await call('lib.list', { prefixes: prefixes }); cachePut(key, v); return v; }
    catch (e) { if (c) return c.v; throw e; }
  },
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
  scanNote: function (noteId) { return call('gen.scan', { noteId: noteId }); },
  addStandard: function () { return call('gen.addStandard', {}); },
  addLaw: function (name, type, skipCheck) { return call('gen.addLaw', { name: name, type: type || '', skipCheck: !!skipCheck }); },
  importLaw: function (p) { return call('gen.importLaw', p); },
  courseSave: function (course) { return call('gen.courseSave', { course: course }); },
  courseHide: function (id, name, hidden) { return call('gen.courseHide', { id: id, name: name, hidden: hidden !== false }); },
  courseList: function () { return call('gen.courseList', {}); },
  addCase: function (name, citation) { return call('gen.addCase', { name: name, citation: citation || '' }); },
  genAuthBatch: function (ids) { return call('gen.authBatch', { ids: ids }); },
  mergeLaw: function (from, to) { return call('gen.mergeLaw', { from: from, to: to }); },
  requestLaw: function (text) { return call('req.law', { text: text }); },
  inbox: function () { return call('gen.inbox', {}); },
  inboxDelete: function (id) { return call('gen.inboxDelete', { id: id }); },

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
