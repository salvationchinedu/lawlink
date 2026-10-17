// LawLink API: Cloudflare Worker + D1.
// Login is Google sign-in. Personal notes stay on the student's phone and are backed up with sync.
// Library notes and cases are written by Gemini only when an admin taps.

// ---------- Library definitions (same as the Apps Script version) ----------
const SEC = {
  topic: [['intro', 'Introduction'], ['principles', 'Key principles and rules'], ['statutory', 'Statutory basis'],
    ['cases', 'Leading cases'], ['application', 'Application and illustrations'], ['exceptions', 'Exceptions and limits'],
    ['criticism', 'Criticism and reform'], ['summary', 'Summary'], ['exam', 'Exam focus']],
  course: [['overview', 'Overview'], ['scope', 'Scope and learning outcomes'], ['topicmap', 'How the topics connect'],
    ['authorities', 'Key authorities'], ['studyguide', 'Study guide'], ['exam', 'Exam focus']],
};
const GUIDE = {
  intro: 'Define the topic, say why it matters and set out its scope.',
  principles: 'Explain the rules and principles in full detail, with reasoning.',
  statutory: 'Set out the relevant Nigerian statutes and provisions, marking each one with the authority marker and its section number. Say if there is no statute.',
  cases: 'Discuss the leading cases, one short paragraph each: the facts in one or two lines and the principle established.',
  application: 'Give worked examples and short hypothetical scenarios showing how the rules apply.',
  exceptions: 'Explain the exceptions, limits and defences.',
  criticism: 'Give academic and judicial criticism, and proposals for reform.',
  summary: 'Give a concise revision summary as bullet points.',
  exam: 'Give "Exam focus" bullets (what examiners usually ask, common mistakes) and then one sample essay or problem question.',
  overview: 'Give an overview of the course: what it covers and why it matters.',
  scope: 'List the scope and the learning outcomes a student should reach.',
  topicmap: 'Explain how the topics connect and in what order to study them.',
  authorities: 'List the key cases and statutes of the whole course, each marked with its marker and with one line on why it matters.',
  studyguide: 'Give a practical study guide: how to approach reading, what to memorise, how to revise.',
};
const RULES = 'Write clear, complete, accurate study material in plain text. Use blank lines between paragraphs and "- " for bullet points. Use **bold** only for key terms. ' +
  'Prefer Nigerian authorities where they exist. Cite a case ONLY if you are certain it exists and you know its correct citation; if you are not sure, leave it out. Never guess a citation. ' +
  'Every case you mention must use exactly this marker: {{c:ID|Full case name|Citation}} where ID is the lowercase case name and year joined with hyphens, for example {{c:carlill-v-carbolic-smoke-ball-co-1893|Carlill v Carbolic Smoke Ball Co|[1893] 1 QB 256}}. ' +
  'Every constitution, statute, court rule, regulation, English statute or treaty you mention must use this marker: {{a:TYPE:ID|Name of the law|Provision}} where TYPE is one of const (the Constitution), act (Act of the National Assembly), state (State law), rule (court rules), sub (regulations and agency rules), eng (received English statute), intl (treaty or international instrument); ID is the lowercase name and year joined with hyphens; Provision is the section or rule, such as s. 36 or Order 15 Rule 1, or empty if you mean the whole law. ' +
  'Examples: {{a:const:constitution-1999|Constitution of the Federal Republic of Nigeria 1999|s. 36}} and {{a:act:evidence-act-2011|Evidence Act 2011|s. 84}}. Use a separate marker for each provision. Cite a provision ONLY if you are sure it exists; never guess section numbers. Do not quote long passages from statutes or law reports.';

const LEVELS = ['100', '200', '300', '400', '500'];
const POST_TYPES = ['Question', 'Tip'];
const SESSION_SECONDS = 30 * 86400;
const SYNC_MAX = 60000; // characters per student, keeps 200,000 students inside D1's 5 GB
const NOTE_ID = /^(c:[\w.-]{1,80}|t:[\w.-]{1,80}:\d{1,2}:\d{1,3})$/;

// ---------- Small helpers ----------
class UserError extends Error {}
const fail = (m) => { throw new UserError(m); };
const enc = new TextEncoder();
const dec = new TextDecoder();
const clean = (s, max) => String(s === undefined || s === null ? '' : s).trim().slice(0, max);
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
const kindOf = (id) => (String(id).charAt(0) === 'c' ? 'course' : 'topic');
const uid = () => crypto.randomUUID();

function b64u(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64uBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const b64uJson = (s) => JSON.parse(dec.decode(b64uBytes(s)));

// ---------- Our own login token (HS256). The Worker checks it with no database read. ----------
let hkCache = null;
let hkSecret = '';
async function hmacKey(secret) {
  if (!secret) fail('Server is missing SESSION_SECRET. Run: npx wrangler secret put SESSION_SECRET');
  if (!hkCache || hkSecret !== secret) {
    hkCache = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    hkSecret = secret;
  }
  return hkCache;
}
async function signToken(payload, secret) {
  const h = b64u(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const p = b64u(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(h + '.' + p));
  return h + '.' + p + '.' + b64u(sig);
}
async function verifyToken(token, secret) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  let ok = false;
  try {
    ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), b64uBytes(parts[2]), enc.encode(parts[0] + '.' + parts[1]));
  } catch (e) {
    if (e instanceof UserError) throw e;
    return null;
  }
  if (!ok) return null;
  let p;
  try { p = b64uJson(parts[1]); } catch (e) { return null; }
  if (!p.exp || p.exp < Date.now() / 1000) return null;
  return p;
}

// ---------- Google sign-in: check Google's signed ID token ----------
let certs = null;
let certsExp = 0;
let certsAt = 0;
async function googleKey(kid) {
  const stale = !certs || Date.now() > certsExp;
  const unknown = certs && !certs.keys.some((k) => k.kid === kid);
  // Refetch when expired, or when a new key id shows up (at most once a minute).
  if (stale || (unknown && Date.now() - certsAt > 60000)) {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/certs');
    if (!r.ok) fail('Could not reach Google. Try again.');
    certs = await r.json();
    certsAt = Date.now();
    const m = /max-age=(\d+)/.exec(r.headers.get('cache-control') || '');
    certsExp = Date.now() + (m ? Number(m[1]) : 3600) * 1000;
  }
  return certs.keys.find((k) => k.kid === kid);
}
async function verifyGoogle(credential, env) {
  if (!env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID.indexOf('PASTE') === 0) fail('Google sign-in is not set up on the server yet.');
  const parts = String(credential || '').split('.');
  if (parts.length !== 3) fail('Google sign-in failed. Try again.');
  let header, payload;
  try { header = b64uJson(parts[0]); payload = b64uJson(parts[1]); } catch (e) { fail('Google sign-in failed. Try again.'); }
  if (header.alg !== 'RS256') fail('Google sign-in failed. Try again.');
  const jwk = await googleKey(header.kid);
  if (!jwk) fail('Google sign-in failed. Try again.');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64uBytes(parts[2]), enc.encode(parts[0] + '.' + parts[1]));
  if (!ok) fail('Google sign-in failed. Try again.');
  const issOk = payload.iss === 'https://accounts.google.com' || payload.iss === 'accounts.google.com';
  if (!issOk || payload.aud !== env.GOOGLE_CLIENT_ID || !payload.exp || payload.exp < Date.now() / 1000) fail('Google sign-in expired. Try again.');
  if (!payload.sub || !payload.email || payload.email_verified !== true) fail('Your Google email is not verified.');
  return payload;
}

async function authGoogle(r, env) {
  const g = await verifyGoogle(r.credential, env);
  const id = String(g.sub);
  const email = String(g.email).toLowerCase();
  const name = clean(g.name || email.split('@')[0], 80);
  const row = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
  if (!row) {
    await env.DB.prepare('INSERT OR IGNORE INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)').bind(id, email, name, Date.now()).run();
  }
  const admins = String(env.ADMIN_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  const adm = admins.indexOf(email) >= 0;
  const now = Math.floor(Date.now() / 1000);
  const token = await signToken({ sub: id, name, email, adm: adm ? 1 : 0, iat: now, exp: now + SESSION_SECONDS }, env.SESSION_SECRET);
  return { token, user: { id, name, email, role: adm ? 'admin' : 'student' } };
}

async function authUser(token, env) {
  if (!token || token === 'guest') fail('Please log in to do this.');
  const p = await verifyToken(token, env.SESSION_SECRET);
  if (!p) fail('Your session expired. Please log in again.');
  return { id: p.sub, name: p.name, email: p.email, admin: p.adm === 1 };
}
const requireAdmin = (u) => { if (!u.admin) fail('Only admins can do this.'); };

// ---------- Sync: one row per student ----------
async function syncGet(env, user) {
  const row = await env.DB.prepare('SELECT data, updated_at FROM sync WHERE user_id = ?').bind(user.id).first();
  return row ? { data: row.data, updatedAt: row.updated_at } : { data: null, updatedAt: 0 };
}
async function syncPut(env, user, r) {
  const data = typeof r.data === 'string' ? r.data : JSON.stringify(r.data || {});
  if (data.length > SYNC_MAX) fail('Your notes are too large to back up (limit about 60 KB). Delete or shorten some notes and try again.');
  try { JSON.parse(data); } catch (e) { fail('Could not read the data to back up.'); }
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO sync (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
  ).bind(user.id, data, now).run();
  return { updatedAt: now };
}

// ---------- Community ----------
function communityOn(env) { if (env.COMMUNITY_ENABLED === 'false') fail('Community is not open yet.'); }
const level = (v) => (LEVELS.indexOf(String(v)) >= 0 ? String(v) : '');
const pubPost = (p, user) => ({ id: p.id, type: p.type, course: p.course, title: p.title, body: p.body, author: p.author, level: p.level, ts: p.created_at, replies: p.replies, mine: p.user_id === user.id });

async function postsList(env, user) {
  communityOn(env);
  const { results } = await env.DB.prepare('SELECT * FROM posts ORDER BY created_at DESC LIMIT 50').all();
  return results.map((p) => pubPost(p, user));
}
async function postGet(env, user, id) {
  communityOn(env);
  const post = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(String(id)).first();
  if (!post) fail('Post not found.');
  const { results } = await env.DB.prepare('SELECT * FROM replies WHERE post_id = ? ORDER BY created_at LIMIT 200').bind(post.id).all();
  return {
    post: pubPost(post, user),
    replies: results.map((x) => ({ id: x.id, body: x.body, author: x.author, level: x.level, ts: x.created_at, mine: x.user_id === user.id })),
  };
}
async function postCreate(env, user, r) {
  communityOn(env);
  const p = r.post || {};
  const title = clean(p.title, 150);
  const body = clean(p.body, 5000);
  if (!title) fail('Add a title.');
  if (!body) fail('Write your question or tip.');
  const type = POST_TYPES.indexOf(p.type) >= 0 ? p.type : 'Question';
  const id = uid();
  await env.DB.prepare('INSERT INTO posts (id, user_id, author, level, type, course, title, body, replies, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)')
    .bind(id, user.id, user.name, level(p.level), type, clean(p.course, 60), title, body, Date.now()).run();
  return { id };
}
async function postDelete(env, user, id) {
  communityOn(env);
  const p = await env.DB.prepare('SELECT user_id FROM posts WHERE id = ?').bind(String(id)).first();
  if (!p) fail('Post not found.');
  if (p.user_id !== user.id && !user.admin) fail('You can only delete your own posts.');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM replies WHERE post_id = ?').bind(String(id)),
    env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(String(id)),
  ]);
  return true;
}
async function replyCreate(env, user, r) {
  communityOn(env);
  const body = clean(r.body, 3000);
  if (!body) fail('Write a reply first.');
  const postId = String(r.postId || '');
  const exists = await env.DB.prepare('SELECT id FROM posts WHERE id = ?').bind(postId).first();
  if (!exists) fail('Post not found.');
  const id = uid();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO replies (id, post_id, user_id, author, level, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, postId, user.id, user.name, level(r.level), body, Date.now()),
    env.DB.prepare('UPDATE posts SET replies = replies + 1 WHERE id = ?').bind(postId),
  ]);
  return { id };
}
async function replyDelete(env, user, id) {
  communityOn(env);
  const x = await env.DB.prepare('SELECT user_id, post_id FROM replies WHERE id = ?').bind(String(id)).first();
  if (!x) fail('Reply not found.');
  if (x.user_id !== user.id && !user.admin) fail('You can only delete your own replies.');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM replies WHERE id = ?').bind(String(id)),
    env.DB.prepare('UPDATE posts SET replies = MAX(replies - 1, 0) WHERE id = ?').bind(x.post_id),
  ]);
  return true;
}

// ---------- Library ----------
function checkNoteId(id) { if (!NOTE_ID.test(id)) fail('Unknown note.'); return id; }

async function sectionsOf(env, id, kind) {
  const { results } = await env.DB.prepare('SELECT key, title, body FROM lib_sections WHERE note_id = ?').bind(id).all();
  return SEC[kind].map((d) => {
    const s = results.find((x) => x.key === d[0]);
    return s ? { key: d[0], title: d[1], body: s.body } : null;
  }).filter(Boolean);
}
function minLen(kind, key) { return (kind === 'course' || key === 'summary' || key === 'exam') ? 150 : 250; }
async function scoreOf(env, id, kind) {
  const { results } = await env.DB.prepare('SELECT key, length(body) AS n FROM lib_sections WHERE note_id = ?').bind(id).all();
  let ok = 0;
  const missing = [];
  SEC[kind].forEach((d) => {
    const s = results.find((x) => x.key === d[0]);
    if (s && s.n >= minLen(kind, d[0])) ok++; else missing.push(d[1]);
  });
  return { score: Math.round((ok / SEC[kind].length) * 100), missing, complete: ok === SEC[kind].length };
}
async function refreshNote(env, id, patch) {
  const kind = kindOf(id);
  const sc = await scoreOf(env, id, kind);
  const old = await env.DB.prepare('SELECT title, verified FROM lib_notes WHERE note_id = ?').bind(id).first();
  const p = patch || {};
  const title = p.title !== undefined ? p.title : (old ? old.title : '');
  const verified = p.verified !== undefined ? (p.verified ? 1 : 0) : (old ? old.verified : 0);
  const status = sc.complete ? 'complete' : 'generating';
  await env.DB.prepare(
    'INSERT INTO lib_notes (note_id, kind, title, status, score, verified, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ' +
    'ON CONFLICT(note_id) DO UPDATE SET kind = excluded.kind, title = excluded.title, status = excluded.status, score = excluded.score, verified = excluded.verified, updated_at = excluded.updated_at'
  ).bind(id, kind, title, status, sc.score, verified, Date.now()).run();
  return { status, score: sc.score, verified: !!verified, sc };
}
async function upsertSection(env, id, key, title, body) {
  await env.DB.prepare(
    'INSERT INTO lib_sections (note_id, key, title, body, updated_at) VALUES (?, ?, ?, ?, ?) ' +
    'ON CONFLICT(note_id, key) DO UPDATE SET title = excluded.title, body = excluded.body, updated_at = excluded.updated_at'
  ).bind(id, key, title, body, Date.now()).run();
}
async function registerCases(env, noteId, label, body) {
  const re = /\{\{c:([a-z0-9-]+)\|([^|}]+)\|([^}]*)\}\}/g;
  const found = new Map();
  let m;
  while ((m = re.exec(body)) !== null) {
    const id = slug(m[1]);
    if (id && !found.has(id)) found.set(id, { name: m[2].trim().slice(0, 200), citation: m[3].trim().slice(0, 100) });
  }
  if (!found.size) return;
  const ids = [...found.keys()].slice(0, 40);
  const marks = ids.map(() => '?').join(',');
  const { results } = await env.DB.prepare('SELECT case_id, cited_in FROM cases WHERE case_id IN (' + marks + ')').bind(...ids).all();
  const stmts = ids.map((id) => {
    const row = results.find((x) => x.case_id === id);
    let cited = [];
    try { cited = row && row.cited_in ? JSON.parse(row.cited_in) : []; } catch (e) { cited = []; }
    if (!cited.some((x) => x.noteId === noteId)) cited.push({ noteId, label });
    const c = found.get(id);
    return env.DB.prepare(
      "INSERT INTO cases (case_id, name, citation, status, data, cited_in, updated_at) VALUES (?, ?, ?, 'cited', '', ?, ?) " +
      'ON CONFLICT(case_id) DO UPDATE SET cited_in = excluded.cited_in, updated_at = excluded.updated_at'
    ).bind(id, c.name, c.citation, JSON.stringify(cited), Date.now());
  });
  await env.DB.batch(stmts);
}

// Gemini is sometimes overloaded (503). We retry quietly, then switch to backup models, so the admin rarely sees an error.
async function gemini(env, prompt) {
  if (!env.GEMINI_KEY) fail('Gemini key missing. Run: npx wrangler secret put GEMINI_KEY');
  const main = env.GEMINI_MODEL || 'gemini-3.6-flash';
  const backups = String(env.GEMINI_FALLBACK_MODELS || 'gemini-flash-latest,gemini-flash-lite-latest').split(',').map((x) => x.trim()).filter((x) => x && x !== main);
  const base = env.GEMINI_BASE || 'https://generativelanguage.googleapis.com';
  const wait = Number(env.GEMINI_RETRY_MS) >= 0 && env.GEMINI_RETRY_MS !== undefined ? Number(env.GEMINI_RETRY_MS) : 2000;
  const busy = new Set([500, 502, 503, 504]);
  const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
  let res = null, last = '', quota = false;
  // 503 and friends: try the same model again. 429 (allowance used up) or 404: go straight to the next model, which has its own allowance.
  for (const model of [main, ...backups]) {
    const tries = model === main ? 3 : 2;
    for (let i = 0; i < tries; i++) {
      if (i) await sleep(wait * (i === 1 ? 1 : 3));
      try {
        res = await fetch(base + '/v1beta/models/' + model + ':generateContent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_KEY },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, responseMimeType: 'application/json' } }),
        });
      } catch (e) { res = null; last = 'network'; continue; }
      if (res.ok) break;
      last = 'Gemini error ' + res.status + ': ' + (await res.text()).slice(0, 200);
      const code = res.status;
      res = null;
      if (code === 429) { quota = true; break; }
      if (code === 404) break;
      if (!busy.has(code)) fail(last);
    }
    if (res) break;
  }
  if (!res) {
    if (quota) fail("Gemini's free allowance is used up for now. Daily limits reset at about 8 to 9 am Lagos time. Try again later, or change GEMINI_MODEL to a lighter model.");
    fail('Gemini is very busy right now. Please tap again in a minute. (' + last.slice(0, 80) + ')');
  }
  const j = await res.json();
  const parts = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
  const t = parts ? parts.map((x) => x.text || '').join('') : '';
  if (!t) fail('Gemini returned nothing. Try again.');
  try { return JSON.parse(t.replace(/```json|```/g, '').trim()); } catch (e) { fail('Gemini returned something unreadable. Tap Generate to try again.'); }
}

async function libGet(env, id) {
  checkNoteId(id);
  const kind = kindOf(id);
  const n = await env.DB.prepare('SELECT status, score, verified, updated_at FROM lib_notes WHERE note_id = ?').bind(id).first();
  return {
    note: n ? { status: n.status, score: n.score, verified: !!n.verified, updatedAt: n.updated_at } : null,
    sections: n ? await sectionsOf(env, id, kind) : [],
  };
}
async function libList(env, prefixes) {
  const list = (Array.isArray(prefixes) ? prefixes : []).slice(0, 5).map((p) => String(p).slice(0, 100));
  const out = {};
  if (!list.length) return out;
  const stmts = list.map((p) => env.DB.prepare('SELECT note_id, status, score, verified FROM lib_notes WHERE note_id >= ? AND note_id < ?').bind(p, p + '￿'));
  const sets = await env.DB.batch(stmts);
  sets.forEach((s) => s.results.forEach((n) => { out[n.note_id] = { status: n.status, score: n.score, verified: !!n.verified }; }));
  return out;
}
async function libReport(env, user, r) {
  const msg = clean(r.message, 1000);
  if (!msg) fail('Describe the problem first.');
  await env.DB.prepare('INSERT INTO reports (id, note_id, user_id, message, created_at) VALUES (?, ?, ?, ?, ?)').bind(uid(), clean(r.noteId, 200), user.id, msg, Date.now()).run();
  return true;
}

// Optional: copy finished notes to a public R2 bucket so students read them with no Worker call.
const fname = (id) => String(id).replace(/:/g, '_');
async function publishNote(env, id) {
  if (!env.LIB) return;
  try {
    const d = await libGet(env, id);
    await env.LIB.put('n/' + fname(id) + '.json', JSON.stringify(d), { httpMetadata: { contentType: 'application/json', cacheControl: 'public, max-age=300' } });
  } catch (e) { console.error('publishNote failed', e && e.message); }
}
async function publishCase(env, id, data) {
  if (!env.LIB) return;
  try {
    await env.LIB.put('c/' + id + '.json', JSON.stringify(data), { httpMetadata: { contentType: 'application/json', cacheControl: 'public, max-age=300' } });
  } catch (e) { console.error('publishCase failed', e && e.message); }
}

let libNamesCache = { at: 0, text: '' };
async function libNames(env) {
  if (Date.now() - libNamesCache.at < 300000) return libNamesCache.text;
  let rows = [];
  try { rows = (await env.DB.prepare("SELECT case_id, name FROM cases WHERE case_id LIKE 'auth:%' AND case_id NOT LIKE 'auth:%:%:%' ORDER BY name LIMIT 200").all()).results; } catch (e) { rows = []; }
  let list = rows.map((x) => x.case_id.split(':').slice(1).join(':') + ' = ' + x.name);
  if (list.length < 10) list = STANDARD.map((e) => { const c = canonAuth(e[0], slug(e[1]), e[1]); return c ? c.type + ':' + c.id + ' = ' + c.name : ''; }).filter(Boolean);
  const text = ' Laws already in our library: ' + list.join('; ') + '. When you mean one of these laws, use EXACTLY its type, id and name in the marker. For any other law, write its full official name with the year.';
  libNamesCache = { at: Date.now(), text };
  return text;
}
async function genSection(env, r) {
  const id = checkNoteId(String(r.noteId || ''));
  const kind = kindOf(id);
  const ctx = r.context || {};
  const def = SEC[kind].find((d) => d[0] === r.key);
  if (!def) fail('Unknown section.');
  const prior = (await sectionsOf(env, id, kind)).filter((s) => s.key !== def[0]).map((s) => s.title);
  const prompt = 'You are an experienced Nigerian law lecturer writing a study note for LL.B students. ' +
    'Write the section "' + def[1] + '" of the ' + kind + ' note. ' + GUIDE[def[0]] + ' ' +
    'Course: ' + clean(ctx.course, 200) + '. ' +
    (kind === 'topic'
      ? 'Part: ' + clean(ctx.part, 100) + '. Topic: ' + clean(ctx.topic, 300) + '. Other topics in this part: ' + (Array.isArray(ctx.siblings) ? ctx.siblings : []).slice(0, 40).map((x) => clean(x, 200)).join('; ') + '. '
      : 'Topics in the course: ' + (Array.isArray(ctx.topics) ? ctx.topics : []).slice(0, 80).map((x) => clean(x, 200)).join('; ') + '. ') +
    (prior.length ? 'Sections already written, do not repeat them: ' + prior.join(', ') + '. ' : '') +
    RULES + (await libNames(env)) + ' Aim for at least ' + ((kind === 'course' || def[0] === 'summary' || def[0] === 'exam') ? '200' : '350') + ' words. Return JSON only: {"body": "..."}';
  // Optional own key per section, e.g. GEMINI_KEY_COURSE_OVERVIEW or GEMINI_KEY_TOPIC_INTRO. If it is not set, or it fails, the main GEMINI_KEY is used.
  const own = env['GEMINI_KEY_' + kind.toUpperCase() + '_' + def[0].toUpperCase()];
  let out;
  if (own && own !== env.GEMINI_KEY) {
    try { out = await gemini({ ...env, GEMINI_KEY: own }, prompt); } catch (e) { out = null; }
  }
  if (!out) out = await gemini(env, prompt);
  let body = String(out.body || '').trim();
  if (body.length < 100) fail('Gemini returned too little text. Tap Generate to try again.');
  body = normAuth(body);
  const label = clean(r.title || id, 150);
  await upsertSection(env, id, def[0], def[1], body);
  await registerCases(env, id, label, body);
  await registerAuth(env, id, label, body);
  const n = await refreshNote(env, id, { title: label, verified: false });
  await publishNote(env, id);
  return { key: def[0], status: n.status, score: n.score };
}

async function genSave(env, r) {
  const id = checkNoteId(String(r.noteId || ''));
  const kind = kindOf(id);
  const def = SEC[kind].find((d) => d[0] === r.key);
  if (!def) fail('Unknown section.');
  const body = normAuth(clean(r.body, 20000));
  if (!body) fail('The section cannot be empty.');
  await upsertSection(env, id, def[0], def[1], body);
  await registerCases(env, id, clean(r.title || id, 150), body);
  await registerAuth(env, id, clean(r.title || id, 150), body);
  const n = await refreshNote(env, id, { verified: false });
  await publishNote(env, id);
  return { status: n.status, score: n.score };
}

async function genCheck(env, id) {
  checkNoteId(id);
  const n = await refreshNote(env, id);
  await publishNote(env, id);
  return { score: n.sc.score, missing: n.sc.missing, complete: n.sc.complete };
}

async function genVerify(env, id) {
  checkNoteId(id);
  const sc = await scoreOf(env, id, kindOf(id));
  if (sc.score < 95) fail('Score is ' + sc.score + '%. It must reach 95% before it can be verified. Missing: ' + sc.missing.join(', ') + '.');
  await refreshNote(env, id, { verified: true });
  await publishNote(env, id);
  return { verified: true, score: sc.score };
}

// ---------- Cases ----------
async function caseGet(env, id) {
  const c = await env.DB.prepare('SELECT * FROM cases WHERE case_id = ?').bind(id).first();
  if (!c) fail('Case not found.');
  let data = null;
  let cited = [];
  try { data = c.data ? JSON.parse(c.data) : null; } catch (e) { data = null; }
  try { cited = c.cited_in ? JSON.parse(c.cited_in) : []; } catch (e) { cited = []; }
  return { id: c.case_id, name: c.name, citation: c.citation, status: c.status, data, citedIn: cited };
}

async function genCase(env, id) {
  const c = await env.DB.prepare('SELECT case_id, name, citation FROM cases WHERE case_id = ?').bind(id).first();
  if (!c) fail('Case not found.');
  const prompt = 'You are an experienced Nigerian law lecturer. Write a study page for this case: "' + c.name + '", citation "' + c.citation + '". ' +
    'Set "exists" to true ONLY if you are certain this case exists with this name and citation. If you are not certain, set "exists" to false and leave the other fields empty. ' +
    'Never invent facts, holdings or quotations. If you are unsure of a single detail, write "Not confirmed" for that field. Do not reproduce long passages from law reports. ' +
    'Return JSON only with these keys: {"exists": boolean, "court": string, "year": string, "goodLaw": "Still good law" | "Overruled" | "Distinguished" | "Not confirmed", ' +
    '"facts": string, "issues": [string], "decision": string, "ratio": string, "obiter": string, "principle": string, ' +
    '"related": [{"name": string, "relation": "followed" | "applied" | "distinguished" | "overruled" | "cited"}], "criticism": string, "examFocus": string, "sampleQuestion": string}';
  const out = await gemini(env, prompt);
  const ok = out.exists === true;
  await env.DB.prepare('UPDATE cases SET status = ?, data = ?, updated_at = ? WHERE case_id = ?')
    .bind(ok ? 'generated' : 'unverifiable', ok ? JSON.stringify(out) : '', Date.now(), id).run();
  const result = await caseGet(env, id);
  if (ok) await publishCase(env, id, result);
  return result;
}


// ---------- Authorities: constitution, statutes, court rules, treaties ----------
const AUTH_TYPES = { const: 'Constitution', act: 'Federal Acts', state: 'State laws', rule: 'Court rules', sub: 'Agency rules', eng: 'English law', intl: 'International' };
const AUTH_RE = /\{\{a:([A-Za-z]+):([A-Za-z0-9-]+)\|([^|}]+)\|([^}]*)\}\}/g;
const AUTH_ID = /^auth:[a-z]+:[a-z0-9-]{1,100}(:[a-z0-9-]{1,40})?$/;
// Names that models write in different ways are folded into one shared page.
const CANON = [
  [/constitution.*(1999|federal republic)|1999 constitution/i, 'const', 'constitution-1999', 'Constitution of the Federal Republic of Nigeria 1999 (as amended)'],
  [/evidence act/i, 'act', 'evidence-act-2011', 'Evidence Act 2011'],
  [/administration of criminal justice act|\bacja\b/i, 'act', 'administration-of-criminal-justice-act-2015', 'Administration of Criminal Justice Act 2015'],
  [/^\s*criminal code( act)?\s*$/i, 'act', 'criminal-code-act', 'Criminal Code Act'],
  [/penal code.*federal provisions/i, 'act', 'penal-code-northern-states-federal-provisions-act', 'Penal Code (Northern States) Federal Provisions Act'],
  [/companies and allied matters act|\bcama\b/i, 'act', 'companies-and-allied-matters-act-2020', 'Companies and Allied Matters Act 2020'],
  [/land use act/i, 'act', 'land-use-act', 'Land Use Act'],
  [/interpretation act/i, 'act', 'interpretation-act', 'Interpretation Act'],
  [/sheriffs and civil process act/i, 'act', 'sheriffs-and-civil-process-act', 'Sheriffs and Civil Process Act'],
  [/matrimonial causes act/i, 'act', 'matrimonial-causes-act', 'Matrimonial Causes Act'],
  [/legal practitioners act/i, 'act', 'legal-practitioners-act', 'Legal Practitioners Act'],
  [/child'?s rights act/i, 'act', 'childs-rights-act-2003', "Child's Rights Act 2003"],
  [/arbitration and mediation act/i, 'act', 'arbitration-and-mediation-act-2023', 'Arbitration and Mediation Act 2023'],
  [/fundamental rights \(?enforcement procedure\)? rules/i, 'rule', 'fundamental-rights-enforcement-procedure-rules-2009', 'Fundamental Rights (Enforcement Procedure) Rules 2009'],
  [/rules of professional conduct/i, 'rule', 'rules-of-professional-conduct-for-legal-practitioners', 'Rules of Professional Conduct for Legal Practitioners'],
  [/supreme court rules/i, 'rule', 'supreme-court-rules', 'Supreme Court Rules'],
  [/court of appeal rules/i, 'rule', 'court-of-appeal-rules', 'Court of Appeal Rules'],
  [/african charter on human/i, 'intl', 'african-charter-on-human-and-peoples-rights', "African Charter on Human and Peoples' Rights"],
  [/universal declaration of human rights|\budhr\b/i, 'intl', 'universal-declaration-of-human-rights', 'Universal Declaration of Human Rights'],
  [/vienna convention on the law of treaties/i, 'intl', 'vienna-convention-on-the-law-of-treaties-1969', 'Vienna Convention on the Law of Treaties 1969'],
  [/statute of frauds/i, 'eng', 'statute-of-frauds-1677', 'Statute of Frauds 1677'],
  [/wills act,? ?1837/i, 'eng', 'wills-act-1837', 'Wills Act 1837'],
];
function canonAuth0(type, id, name) {
  const nm = clean(name, 200);
  const probe = nm + ' ' + String(id || '').replace(/-/g, ' ');
  for (const c of CANON) if (c[0].test(probe)) return { type: c[1], id: c[2], name: c[3], key: 'auth:' + c[1] + ':' + c[2] };
  type = String(type || '').toLowerCase();
  const t = AUTH_TYPES[type] ? type : 'act';
  const i = slug(id) || slug(nm);
  if (!i) return null;
  return { type: t, id: i.slice(0, 100), name: nm, key: 'auth:' + t + ':' + i.slice(0, 100) };
}
// Merged laws: an old name points to the law it was merged into.
const ALIASES = new Map();
let aliasAt = 0;
let aliasTableReady = false;
async function loadAliases(env) {
  if (Date.now() - aliasAt < 20000) return;
  if (!aliasTableReady) { await env.DB.prepare('CREATE TABLE IF NOT EXISTS law_alias ( from_key TEXT PRIMARY KEY, to_key TEXT NOT NULL, to_name TEXT NOT NULL )').run(); aliasTableReady = true; }
  const { results } = await env.DB.prepare('SELECT from_key, to_key, to_name FROM law_alias LIMIT 2000').all();
  ALIASES.clear();
  results.forEach((x) => { const p = x.to_key.split(':'); ALIASES.set(x.from_key, { type: p[1], id: p[2], name: x.to_name, key: x.to_key }); });
  aliasAt = Date.now();
}
function canonAuth(type, id, name) {
  const c = canonAuth0(type, id, name);
  if (!c) return c;
  const a = ALIASES.get(c.key);
  return a ? Object.assign({}, a) : c;
}
function aliasResolve(id) {
  const p = String(id).split(':');
  if (p.length < 3) return id;
  const a = ALIASES.get(p.slice(0, 3).join(':'));
  return a ? [a.key].concat(p.slice(3)).join(':') : id;
}
// Rewrites every authority marker in a text so its type and id are the shared, canonical ones.
function normAuth(body) {
  return String(body).replace(AUTH_RE, (m, type, id, name, prov) => {
    const c = canonAuth(type, id, name);
    if (!c) return name;
    return '{{a:' + c.type + ':' + c.id + '|' + name.trim() + '|' + prov.trim() + '}}';
  });
}

// ---- Sections: one small shared entry per provision (e.g. Evidence Act 2011, s. 84). Subsections live inside it. ----
const SUBS = '((?:\\(\\s*[A-Za-z0-9]{1,5}\\s*\\))*)';
const SCHED_N = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
const SCHED_W = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];
function parseProv(p) {
  p = String(p || '').trim();
  let m;
  if (/^preamble\b/i.test(p)) return { key: 'preamble', sub: '' };
  if ((m = /^(?:the\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d{1,2})(?:st|nd|rd|th)?\s+schedule\b/i.exec(p)) || (m = /^schedule\s+(\d{1,2})\b/i.exec(p))) return { key: 'sch' + (SCHED_N[m[1].toLowerCase()] || m[1]), sub: '' };
  if ((m = new RegExp('^(?:ss?\\.?|sec(?:tion)?s?\\.?)\\s*(\\d{1,4}[A-Za-z]?)\\s*' + SUBS, 'i').exec(p))) return { key: m[1].toLowerCase(), sub: m[2].replace(/\s+/g, '') };
  if ((m = new RegExp('^art(?:icles?)?\\.?\\s*(\\d{1,4}[A-Za-z]?)\\s*' + SUBS, 'i').exec(p))) return { key: 'art-' + m[1].toLowerCase(), sub: m[2].replace(/\s+/g, '') };
  if ((m = /^(?:o(?:rd(?:er)?)?\.?)\s*(\d{1,3}[A-Za-z]?)(?:\s*,?\s*r(?:ule)?\.?\s*(\d{1,3}[A-Za-z]?))?/i.exec(p))) return { key: 'o' + m[1].toLowerCase() + (m[2] ? 'r' + m[2].toLowerCase() : ''), sub: '' };
  if ((m = /^r(?:ule)?\.?\s*(\d{1,3}[A-Za-z]?)/i.exec(p))) return { key: 'r' + m[1].toLowerCase(), sub: '' };
  if ((m = /^reg(?:ulations?)?\.?\s*(\d{1,3}[A-Za-z]?)/i.exec(p))) return { key: 'reg-' + m[1].toLowerCase(), sub: '' };
  return null;
}
function keyLabel(key) {
  let m;
  if (key === 'preamble') return 'Preamble';
  if ((m = /^sch(\d{1,2})$/.exec(key))) return (SCHED_W[+m[1]] || m[1] + 'th') + ' Schedule';
  if (/^\d/.test(key)) return 's. ' + key;
  if ((m = /^art-(.+)$/.exec(key))) return 'Art. ' + m[1];
  if ((m = /^o(\d+[a-z]?)(?:r(\d+[a-z]?))?$/.exec(key))) return 'Order ' + m[1] + (m[2] ? ' r. ' + m[2] : '');
  if ((m = /^r(\d+[a-z]?)$/.exec(key))) return 'Rule ' + m[1];
  if ((m = /^reg-(.+)$/.exec(key))) return 'Reg. ' + m[1];
  return key;
}
function isSecId(id) { return String(id).split(':').length === 4; }
// Adds citations to many authority rows at once, creating the rows when they do not exist yet.
async function upsertCited(env, map) {
  const ids = [...map.keys()];
  if (!ids.length) return;
  const existing = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const part = ids.slice(i, i + 50);
    const { results } = await env.DB.prepare('SELECT case_id, cited_in FROM cases WHERE case_id IN (' + part.map(() => '?').join(',') + ')').bind(...part).all();
    results.forEach((x) => existing.set(x.case_id, x.cited_in));
  }
  const stmts = ids.map((k) => {
    let cited = [];
    try { cited = existing.get(k) ? JSON.parse(existing.get(k)) : []; } catch (e) { cited = []; }
    const f = map.get(k);
    f.entries.forEach((e) => { if (!cited.some((x) => x.noteId === e.noteId && (x.prov || '') === e.prov)) cited.push(e); });
    if (cited.length > 400) cited = cited.slice(cited.length - 400);
    return env.DB.prepare(
      "INSERT INTO cases (case_id, name, citation, status, data, cited_in, updated_at) VALUES (?, ?, '', 'cited', '', ?, ?) " +
      'ON CONFLICT(case_id) DO UPDATE SET cited_in = excluded.cited_in, updated_at = excluded.updated_at'
    ).bind(k, f.name, JSON.stringify(cited), Date.now());
  });
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
}
function addCites(map, lawKey, lawName, entries) {
  if (!map.has(lawKey)) map.set(lawKey, { name: lawName, entries: [] });
  entries.forEach((e) => map.get(lawKey).entries.push(e));
  entries.forEach((e) => {
    const p = parseProv(e.prov);
    if (!p) return;
    const sk = lawKey + ':' + p.key;
    if (!map.has(sk)) { if (map.size > 220) return; map.set(sk, { name: lawName + ', ' + keyLabel(p.key), entries: [] }); }
    map.get(sk).entries.push(e);
  });
}
async function registerAuth(env, noteId, label, body) {
  const found = new Map();
  AUTH_RE.lastIndex = 0;
  let m;
  while ((m = AUTH_RE.exec(body)) !== null) {
    const c = canonAuth(m[1], m[2], m[3]);
    if (!c) continue;
    if (!found.has(c.key)) found.set(c.key, { name: c.name, provs: new Set() });
    found.get(c.key).provs.add(clean(m[4], 80));
  }
  if (!found.size) return;
  const map = new Map();
  [...found.keys()].slice(0, 60).forEach((k) => {
    const f = found.get(k);
    addCites(map, k, f.name, [...f.provs].map((prov) => ({ noteId, label, prov })));
  });
  await upsertCited(env, map);
  await flagMissing(env, noteId, label, [...map.keys()]);
}
function authId(id) { const s = String(id || ''); if (!AUTH_ID.test(s)) fail('Unknown authority.'); return aliasResolve(s); }
function natural(a, b) { if (a === 'preamble' || b === 'preamble') return a === b ? 0 : a === 'preamble' ? -1 : 1; return a.localeCompare(b, 'en', { numeric: true }); }
async function authGet(env, id) {
  id = authId(id);
  const c = await env.DB.prepare('SELECT * FROM cases WHERE case_id = ?').bind(id).first();
  if (!c) fail('Authority not found.');
  let data = null;
  let cited = [];
  try { data = c.data ? JSON.parse(c.data) : null; } catch (e) { data = null; }
  try { cited = c.cited_in ? JSON.parse(c.cited_in) : []; } catch (e) { cited = []; }
  const parts = id.split(':');
  if (parts.length === 4) {
    const lawId = parts.slice(0, 3).join(':');
    const law = await env.DB.prepare('SELECT case_id, name, status FROM cases WHERE case_id = ?').bind(lawId).first();
    const subs = [...new Set(cited.map((x) => (parseProv(x.prov) || {}).sub).filter(Boolean))].slice(0, 30);
    return { id: c.case_id, kind: 'section', type: parts[1], key: parts[3], label: keyLabel(parts[3]), name: c.name, status: c.status, data, citedIn: cited.slice(-60), subsCited: subs, law: law ? { id: law.case_id, name: law.name, status: law.status } : null };
  }
  const { results } = await env.DB.prepare('SELECT case_id, status, data, cited_in FROM cases WHERE case_id > ? AND case_id < ? LIMIT 1500').bind(id + ':', id + ':￿').all();
  const sections = results.map((x) => {
    let d = null, n = 0;
    try { d = x.data ? JSON.parse(x.data) : null; } catch (e) { d = null; }
    try { n = x.cited_in ? JSON.parse(x.cited_in).length : 0; } catch (e) { n = 0; }
    const key = x.case_id.split(':')[3];
    return { id: x.case_id, key, label: keyLabel(key), heading: d && d.heading ? d.heading : '', status: x.status, count: n, hasText: !!(d && d.official), expl: !!(d && d.summary) };
  }).sort((p, q) => natural(p.key, q.key));
  return { id: c.case_id, kind: 'law', type: parts[1], name: c.name, status: c.status, data, citedIn: cited.slice(-60), sections };
}
async function authList(env, kind) {
  const isCase = String(kind) === 'case';
  const sql = isCase
    ? "SELECT case_id, name, status FROM cases WHERE case_id NOT LIKE 'auth:%' ORDER BY name LIMIT 800"
    : "SELECT case_id, name, status FROM cases WHERE case_id LIKE 'auth:%' AND case_id NOT LIKE 'auth:%:%:%' ORDER BY name LIMIT 1000";
  const { results } = await env.DB.prepare(sql).all();
  return results.map((x) => ({ id: x.case_id, name: x.name, status: x.status, type: isCase ? 'case' : x.case_id.split(':')[1] }));
}
// Search without Gemini: "evidence act 84", "constitution 36(6)", "order 15 rule 1", "s 84".
const SEARCH_WORDS = new Set(['s', 'ss', 'sec', 'secs', 'section', 'sections', 'art', 'article', 'articles', 'order', 'o', 'rule', 'r', 'reg', 'regulation', 'of', 'the']);
async function authFind(env, q) {
  const toks = String(q || '').toLowerCase().replace(/[^a-z0-9()\s.]/g, ' ').split(/[\s.]+/).filter(Boolean).slice(0, 10);
  let kind = '', num = '', rl = '';
  const name = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i], prev = toks[i - 1] || '';
    const n = /^(\d{1,4}[a-z]?)(\(.*)?$/.exec(t);
    if (n && !num && (n[1].length <= 3 || SEARCH_WORDS.has(prev))) {
      num = n[1];
      kind = ({ art: 'art', article: 'art', articles: 'art', order: 'o', o: 'o', rule: 'r', r: 'r', reg: 'reg', regulation: 'reg' })[prev] || '';
      if (kind === 'o' && /^r(ule)?$/.test(toks[i + 1] || '') && /^\d{1,3}[a-z]?$/.test(toks[i + 2] || '')) { rl = toks[i + 2]; i += 2; }
    } else if (!SEARCH_WORDS.has(t) && t.length > 1) name.push(t.replace(/[^a-z0-9]/g, ''));
  }
  const words = name.filter(Boolean).slice(0, 5);
  const keys = !num ? [] : kind === 'art' ? ['art-' + num] : kind === 'o' ? ['o' + num + (rl ? 'r' + rl : '')] : kind === 'r' ? ['r' + num] : kind === 'reg' ? ['reg-' + num] : [num, 'art-' + num];
  const out = { laws: [], sections: [] };
  if (!words.length && !keys.length) return out;
  if (words.length) {
    const where = words.map(() => 'lower(name) LIKE ?').join(' AND ');
    const { results } = await env.DB.prepare("SELECT case_id, name, status FROM cases WHERE case_id LIKE 'auth:%' AND case_id NOT LIKE 'auth:%:%:%' AND " + where + ' ORDER BY name LIMIT 30').bind(...words.map((w) => '%' + w + '%')).all();
    out.laws = results.map((x) => ({ id: x.case_id, name: x.name, status: x.status, type: x.case_id.split(':')[1] }));
  }
  if (keys.length) {
    let rows = [];
    if (words.length) {
      const ids = [];
      out.laws.forEach((l) => keys.forEach((k) => ids.push(l.id + ':' + k)));
      if (ids.length) rows = (await env.DB.prepare('SELECT case_id, name, status, data FROM cases WHERE case_id IN (' + ids.slice(0, 60).map(() => '?').join(',') + ')').bind(...ids.slice(0, 60)).all()).results;
    } else {
      const like = keys.map(() => 'case_id LIKE ?').join(' OR ');
      rows = (await env.DB.prepare("SELECT case_id, name, status, data FROM cases WHERE case_id LIKE 'auth:%:%:%' AND (" + like + ') ORDER BY name LIMIT 30').bind(...keys.map((k) => 'auth:%:%:' + k)).all()).results;
    }
    out.sections = rows.map((x) => {
      let d = null;
      try { d = x.data ? JSON.parse(x.data) : null; } catch (e) { d = null; }
      const key = x.case_id.split(':')[3];
      return { id: x.case_id, name: x.name, status: x.status, key, label: keyLabel(key), heading: d && d.heading ? d.heading : '', type: x.case_id.split(':')[1] };
    });
    if (words.length && out.sections.length) out.laws = [];
  }
  return out;
}
async function genAuth(env, id) {
  id = authId(id);
  if (isSecId(id)) return genAuthSec(env, id);
  const row = await env.DB.prepare('SELECT case_id, name FROM cases WHERE case_id = ?').bind(id).first();
  if (!row) fail('Authority not found.');
  const type = id.split(':')[1];
  const prompt = 'You are an experienced Nigerian law lecturer. Give a SHORT overview of this legal authority for law students: "' + row.name + '" (' + (AUTH_TYPES[type] || 'Law') + '). ' +
    'Set "exists" to true ONLY if you are certain this law or instrument exists with this name. If you are not certain, set "exists" to false and leave the other fields empty. ' +
    'Never invent details. If you are unsure of something, write "Not confirmed" for it. Do not quote the text. ' +
    'Return JSON only: {"exists": boolean, "officialTitle": string, "year": string, "jurisdiction": "Federal" | "State" | "International" | "England" | "Not confirmed", ' +
    '"inForce": "In force" | "Amended" | "Repealed" | "Not confirmed", "overview": string (two or three sentences: what the law is about and what it is used for)}';
  const out = await gemini(env, prompt);
  const ok = out.exists === true;
  const data = ok ? { officialTitle: clean(out.officialTitle, 200), year: clean(out.year, 20), jurisdiction: clean(out.jurisdiction, 40), inForce: clean(out.inForce, 40), overview: clean(out.overview, 700) } : '';
  await env.DB.prepare('UPDATE cases SET status = ?, data = ?, updated_at = ? WHERE case_id = ?')
    .bind(ok ? 'generated' : 'unverifiable', ok ? JSON.stringify(data) : '', Date.now(), id).run();
  return authGet(env, id);
}
// One provision: a short explanation and one line per subsection. Gemini must say so when it is not sure.
async function genAuthSec(env, id) {
  const parts = id.split(':');
  const lawId = parts.slice(0, 3).join(':');
  const law = await env.DB.prepare('SELECT name FROM cases WHERE case_id = ?').bind(lawId).first();
  const row = await env.DB.prepare('SELECT cited_in FROM cases WHERE case_id = ?').bind(id).first();
  if (!law || !row) fail('Authority not found.');
  let cited = [];
  try { cited = row.cited_in ? JSON.parse(row.cited_in) : []; } catch (e) { cited = []; }
  const subs = [...new Set(cited.map((x) => (parseProv(x.prov) || {}).sub).filter(Boolean))].slice(0, 12);
  const label = keyLabel(parts[3]);
  let old = null;
  try { const o = await env.DB.prepare('SELECT data FROM cases WHERE case_id = ?').bind(id).first(); old = o && o.data ? JSON.parse(o.data) : null; } catch (e) { old = null; }
  const offText = old && old.official ? old : null;
  const prompt = offText
    ? 'You are an experienced Nigerian law lecturer. Explain ONE provision for law students: ' + label + ' of "' + law.name + '". Here is its OFFICIAL TEXT:  + (offText.text +  + (offText.subs || []).map((x) => x.ref +  + x.text).join()).slice(0, 7000) +  ' +
      'Explain it using ONLY this text. Never add subsections, wording, numbers or case names that are not in it. Do not copy it; explain it in your own words. ' +
      'Return JSON only: {"exists": true, "heading": string (at most 8 words), "summary": string (two to four sentences: what it provides and how it works in practice), "subsections": [], "subsectionsComplete": false, "examTip": string (one line, or empty)}'
    : 'You are an experienced Nigerian law lecturer. Explain ONE provision for law students: ' + label + ' of "' + law.name + '" (' + (AUTH_TYPES[parts[1]] || 'Law') + '). ' +
    (subs.length ? 'Students\' notes refer to these parts of it: ' + subs.join(', ') + '. ' : '') +
    'Set "exists" to true ONLY if you are certain this law has this provision and you know what it says. If you are not certain, set "exists" to false and leave the other fields empty. ' +
    'Never invent subsections, wording, numbers or case names. Do not quote the provision; explain it in your own words. If you are unsure of a detail, write "Not confirmed" for it. ' +
    'Return JSON only: {"exists": boolean, "heading": string (the short title of the provision, at most 8 words), ' +
    '"summary": string (two to four sentences: what it provides and how it works in practice), ' +
    '"subsections": [{"ref": string such as "(1)" or "(2)(a)", "point": string (one short line)}] (only subsections you are certain of, at most 8; an empty list if it has none or you are not sure), ' +
    '"subsectionsComplete": boolean (true only if the list covers every subsection of the provision), "examTip": string (one line, or empty)}';
  const out = await gemini(env, prompt);
  let ok = out.exists === true || !!offText;
  let data = '';
  if (ok) {
    const summary = clean(out.summary, 1200);
    if (!summary) fail('Gemini returned an empty explanation. Tap again.');
    const subsections = (Array.isArray(out.subsections) ? out.subsections : []).slice(0, 8).map((x) => {
      let ref = clean(x && x.ref, 20).replace(/\s+/g, '');
      if (ref && ref[0] !== '(') ref = '(' + ref.replace(/^\(|\)$/g, '') + ')';
      return { ref, point: clean(x && x.point, 300) };
    }).filter((x) => /^(\([A-Za-z0-9]{1,5}\))+$/.test(x.ref) && x.point);
    data = { heading: clean(out.heading, 100), summary, subsections, subsectionsComplete: out.subsectionsComplete === true && subsections.length > 0, examTip: clean(out.examTip, 300) };
    if (offText) data = { heading: offText.heading || data.heading, text: offText.text, subs: offText.subs || [], official: true, summary, subsections: [], subsectionsComplete: false, examTip: data.examTip };
  }
  await env.DB.prepare('UPDATE cases SET status = ?, data = ?, updated_at = ? WHERE case_id = ?')
    .bind(ok ? 'generated' : 'unverifiable', ok ? JSON.stringify(data) : '', Date.now(), id).run();
  return authGet(env, id);
}
// Creates the section entries for citations that were recorded before sections existed. No Gemini.
async function authBackfill(env, id) {
  id = authId(id);
  if (isSecId(id)) fail('Open the law, not a section.');
  const row = await env.DB.prepare('SELECT name, cited_in FROM cases WHERE case_id = ?').bind(id).first();
  if (!row) fail('Authority not found.');
  let cited = [];
  try { cited = row.cited_in ? JSON.parse(row.cited_in) : []; } catch (e) { cited = []; }
  const map = new Map();
  addCites(map, id, row.name, cited.filter((x) => x && x.noteId));
  map.delete(id);
  await upsertCited(env, map);
  return authGet(env, id);
}
// A starting library: standard Nigerian laws added as empty entries. Nothing is written by Gemini; students see an entry only after it is written.
const STANDARD = [
  ['const', 'Constitution of the Federal Republic of Nigeria 1999 (as amended)'],
  ['act', 'Criminal Code Act'], ['act', 'Penal Code (Northern States) Federal Provisions Act'], ['act', 'Administration of Criminal Justice Act 2015'],
  ['act', 'Evidence Act 2011'], ['act', 'Police Act 2020'], ['act', 'Cybercrimes Act'], ['act', 'Terrorism (Prevention and Prohibition) Act'],
  ['act', 'Money Laundering (Prevention and Prohibition) Act'], ['act', 'Economic and Financial Crimes Commission (Establishment) Act'],
  ['act', 'Corrupt Practices and Other Related Offences Act'], ['act', 'Land Use Act'], ['act', 'Sheriffs and Civil Process Act'],
  ['act', 'Limitation Act'], ['act', 'Interpretation Act'], ['act', 'Arbitration and Mediation Act 2023'],
  ['act', 'Companies and Allied Matters Act 2020'], ['act', 'Investments and Securities Act'], ['act', 'Banks and Other Financial Institutions Act'],
  ['act', 'Insurance Act'], ['act', 'Trade Marks Act'], ['act', 'Patents and Designs Act'], ['act', 'Copyright Act'], ['act', 'Petroleum Industry Act'],
  ['act', 'Companies Income Tax Act'], ['act', 'Value Added Tax Act'], ['act', 'Personal Income Tax Act'],
  ['act', 'Matrimonial Causes Act'], ['act', 'Marriage Act'], ["act", "Child's Rights Act 2003"],
  ['act', 'Labour Act'], ['act', "Employees' Compensation Act"], ['act', 'Pension Reform Act'], ['act', 'National Industrial Court Act'],
  ['act', 'Supreme Court Act'], ['act', 'Court of Appeal Act'], ['act', 'Federal High Court Act'], ['act', 'Legal Practitioners Act'],
  ['act', 'Electoral Act'], ['act', 'Freedom of Information Act 2011'],
  ['state', 'Criminal Law of Lagos State'], ['state', 'Administration of Criminal Justice Law of Lagos State'], ['state', 'Tenancy Law of Lagos State'],
  ['state', 'Wills Law of Lagos State'], ['state', 'Penal Code Law (Northern States)'], ['state', 'Sharia Penal Code Law'],
  ['rule', 'Supreme Court Rules'], ['rule', 'Court of Appeal Rules'], ['rule', 'Federal High Court (Civil Procedure) Rules'],
  ['rule', 'High Court of Lagos State (Civil Procedure) Rules'], ['rule', 'Fundamental Rights (Enforcement Procedure) Rules 2009'],
  ['rule', 'National Industrial Court Rules'], ['rule', 'Rules of Professional Conduct for Legal Practitioners'],
  ['eng', 'Statute of Frauds 1677'], ['eng', 'Wills Act 1837'], ['eng', 'Sale of Goods Act 1893'], ['eng', 'Partnership Act 1890'],
  ['intl', "African Charter on Human and Peoples' Rights"], ['intl', 'Universal Declaration of Human Rights'],
  ['intl', 'International Covenant on Civil and Political Rights'], ['intl', 'International Covenant on Economic, Social and Cultural Rights'],
  ['intl', 'Convention on the Elimination of All Forms of Discrimination against Women'], ['intl', 'Convention on the Rights of the Child'],
  ['intl', 'Charter of the United Nations'], ['intl', 'Vienna Convention on the Law of Treaties 1969'], ['intl', 'Geneva Conventions'],
  ['intl', 'ECOWAS Treaty'], ['intl', 'Rome Statute of the International Criminal Court'],
  ['intl', 'New York Convention on the Recognition and Enforcement of Foreign Arbitral Awards'],
];
async function insertLaw(env, key, name) {
  const r = await env.DB.prepare("INSERT INTO cases (case_id, name, citation, status, data, cited_in, updated_at) VALUES (?, ?, '', 'cited', '', '[]', ?) ON CONFLICT(case_id) DO NOTHING").bind(key, name, Date.now()).run();
  return r;
}
async function addStandard(env) {
  const have = new Set((await env.DB.prepare("SELECT case_id FROM cases WHERE case_id LIKE 'auth:%' AND case_id NOT LIKE 'auth:%:%:%'").all()).results.map((x) => x.case_id));
  const stmts = [];
  let added = 0;
  STANDARD.forEach((e) => {
    const c = canonAuth(e[0], slug(e[1]), e[1]);
    if (!c || have.has(c.key)) return;
    have.add(c.key);
    added++;
    stmts.push(env.DB.prepare("INSERT INTO cases (case_id, name, citation, status, data, cited_in, updated_at) VALUES (?, ?, '', 'cited', '', '[]', ?) ON CONFLICT(case_id) DO NOTHING").bind(c.key, c.name, Date.now()));
  });
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
  return { added, total: STANDARD.length };
}
// Add one law by name. Gemini confirms it exists unless the admin chooses to skip that check.
// Imports a prepared law file (official text split into sections) in small chunks. No Gemini.
async function importLaw(env, r) {
  const name = clean(r.name, 200);
  if (name.length < 4) fail('The file has no law name.');
  const type = AUTH_TYPES[String(r.type || '').toLowerCase()] ? String(r.type).toLowerCase() : 'act';
  const c = canonAuth(type, slug(name), name);
  if (!c) fail('That law name could not be used.');
  const list = Array.isArray(r.sections) ? r.sections.slice(0, 60) : [];
  const now = Date.now();
  const law = await env.DB.prepare('SELECT status, data FROM cases WHERE case_id = ?').bind(c.key).first();
  const m = r.meta && typeof r.meta === 'object' ? r.meta : null;
  if (!law) await insertLaw(env, c.key, c.name);
  if (!law || law.status === 'cited' || law.status === 'unverifiable' || (m && !law.data)) {
    const d = { officialTitle: clean(m && m.officialTitle, 200) || c.name, year: clean(m && m.year, 20), jurisdiction: clean(m && m.jurisdiction, 40), inForce: clean(m && m.inForce, 40), overview: clean(m && m.overview, 700) };
    await env.DB.prepare("UPDATE cases SET status = 'generated', data = ?, updated_at = ? WHERE case_id = ?").bind(JSON.stringify(d), now, c.key).run();
  }
  if (m && Array.isArray(m.groups) && m.groups.length) {
    const groups = m.groups.slice(0, 40).map((g) => ({ chapter: clean(g && g.chapter, 140), part: clean(g && g.part, 140), n: clean(g && g.n, 10), from: clean(g && g.from, 12).toLowerCase(), to: clean(g && g.to, 12).toLowerCase() })).filter((g) => g.chapter && g.from && g.to);
    if (groups.length) {
      const cur0 = await env.DB.prepare('SELECT data FROM cases WHERE case_id = ?').bind(c.key).first();
      let d0 = {};
      try { d0 = cur0 && cur0.data ? JSON.parse(cur0.data) : {}; } catch (e) { d0 = {}; }
      d0.groups = groups;
      await env.DB.prepare('UPDATE cases SET data = ?, updated_at = ? WHERE case_id = ?').bind(JSON.stringify(d0), now, c.key).run();
    }
  }
  if (r.complete === true) {
    const cur = await env.DB.prepare('SELECT data FROM cases WHERE case_id = ?').bind(c.key).first();
    let d = {};
    try { d = cur && cur.data ? JSON.parse(cur.data) : {}; } catch (e) { d = {}; }
    d.complete = true;
    await env.DB.prepare("UPDATE cases SET data = ?, status = CASE WHEN status IN ('cited','unverifiable') THEN 'generated' ELSE status END, updated_at = ? WHERE case_id = ?").bind(JSON.stringify(d), now, c.key).run();
  }
  const rows = [];
  list.forEach((x) => {
    const key = String(x && x.key || '').toLowerCase().trim();
    if (!/^[a-z0-9-]{1,40}$/.test(key)) return;
    const text = clean(x.text, 12000);
    const subs = (Array.isArray(x.subs) ? x.subs : []).slice(0, 300).map((y) => ({ ref: clean(y && y.ref, 120), text: clean(y && y.text, 12000), h: !!(y && y.h) })).filter((y) => y.ref && (y.text || y.h)).map((y) => (y.h ? y : { ref: y.ref, text: y.text }));
    if (!text && !subs.length) return;
    rows.push({ id: c.key + ':' + key, key, heading: clean(x.heading, 120), text, subs });
  });
  const old = new Map();
  for (let i = 0; i < rows.length; i += 50) {
    const part = rows.slice(i, i + 50);
    const { results } = await env.DB.prepare('SELECT case_id, data FROM cases WHERE case_id IN (' + part.map(() => '?').join(',') + ')').bind(...part.map((x) => x.id)).all();
    results.forEach((x) => old.set(x.case_id, x.data));
  }
  const stmts = rows.map((x) => {
    let prev = {};
    try { prev = old.get(x.id) ? JSON.parse(old.get(x.id)) : {}; } catch (e) { prev = {}; }
    const d = { heading: x.heading || prev.heading || '', text: x.text, subs: x.subs, official: true, summary: prev.summary || '', subsections: [], subsectionsComplete: false, examTip: prev.examTip || '' };
    return env.DB.prepare("INSERT INTO cases (case_id, name, citation, status, data, cited_in, updated_at) VALUES (?, ?, '', 'generated', ?, '[]', ?) ON CONFLICT(case_id) DO UPDATE SET status = 'generated', data = excluded.data, updated_at = excluded.updated_at")
      .bind(x.id, c.name + ', ' + keyLabel(x.key), JSON.stringify(d), now);
  });
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
  let flagged = 0;
  if (r.complete === true) {
    const { results: bad } = await env.DB.prepare("SELECT case_id, cited_in FROM cases WHERE case_id > ? AND case_id < ? AND status = 'cited' LIMIT 100").bind(c.key + ':', c.key + ':\uffff').all();
    for (const x of bad) {
      let cited = [];
      try { cited = x.cited_in ? JSON.parse(x.cited_in) : []; } catch (e) { cited = []; }
      await env.DB.prepare("UPDATE cases SET status = 'unverifiable', updated_at = ? WHERE case_id = ?").bind(now, x.case_id).run();
      await env.DB.prepare("INSERT OR IGNORE INTO reports (id, note_id, user_id, message, created_at) VALUES (?, ?, 'system', ?, ?)")
        .bind('miss:imp:' + x.case_id, x.case_id, 'Possible wrong citation: notes cite ' + keyLabel(x.case_id.split(':')[3]) + ' of ' + c.name + ' (' + cited.length + ' time' + (cited.length === 1 ? '' : 's') + '), but the law has no such section.', now).run();
      flagged++;
    }
  }
  return { id: c.key, name: c.name, flagged, imported: rows.length, skipped: list.length - rows.length };
}
// ---------- Courses added or edited by the admin (merged into the built-in list on the phone) ----------
let courseTableReady = false;
async function ensureCourseTable(env) {
  if (courseTableReady) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS course_edits ( id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL )').run();
  courseTableReady = true;
}
async function coursesList(env) {
  await ensureCourseTable(env);
  const { results } = await env.DB.prepare('SELECT data, updated_at FROM course_edits ORDER BY updated_at LIMIT 600').all();
  let v = 0;
  const items = [];
  results.forEach((x) => {
    try { const d = JSON.parse(x.data); if (x.updated_at > v) v = x.updated_at; items.push(d); } catch (e) { /* skip */ }
  });
  return { v, items };
}
function cleanCourse(c) {
  const name = clean(c && c.name, 120);
  if (name.length < 2) fail('Type the course name.');
  let id = slug(c && c.id);
  if (!id) id = 'x-' + slug(name).slice(0, 60);
  if (!id || id === 'x-') fail('That course name could not be used.');
  const aliases = (Array.isArray(c.aliases) ? c.aliases : []).slice(0, 8).map((a) => clean(a, 120)).filter(Boolean);
  const parts = (Array.isArray(c.parts) ? c.parts : []).slice(0, 12).map((p, i) => ({
    label: clean(p && p.label, 60) || 'Topics',
    topics: (Array.isArray(p && p.topics) ? p.topics : []).slice(0, 120).map((t) => clean(t, 300)),
  }));
  parts.forEach((p) => { if (p.topics.some((t) => !t)) fail('A topic is empty. Fill it in or remove it.'); });
  return { id, name, group: clean(c.group, 20) || 'General', cle: c.cle === 2 || c.cle === 1 ? c.cle : 0, aliases, parts, hidden: c.hidden === true };
}
async function courseSave(env, r) {
  await ensureCourseTable(env);
  const c = cleanCourse(r.course || {});
  await env.DB.prepare('INSERT INTO course_edits (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
    .bind(c.id, JSON.stringify(c), Date.now()).run();
  return c;
}
// Built-in courses are hidden (the row stays so it can be restored). Added courses are hidden the same way.
async function courseHide(env, r) {
  await ensureCourseTable(env);
  const id = slug(r.id);
  if (!id) fail('Unknown course.');
  const row = await env.DB.prepare('SELECT data FROM course_edits WHERE id = ?').bind(id).first();
  let d = null;
  try { d = row ? JSON.parse(row.data) : null; } catch (e) { d = null; }
  if (!d) d = { id, name: clean(r.name, 120) || id, group: 'General', cle: 0, aliases: [], parts: [] };
  d.hidden = r.hidden !== false;
  if (d.hidden && !row && !r.name) fail('Course name is missing.');
  await env.DB.prepare('INSERT INTO course_edits (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
    .bind(id, JSON.stringify(d), Date.now()).run();
  return { id, hidden: d.hidden };
}
// A case added by name. It starts as an empty entry; the admin opens it and writes it.
async function addCase(env, r) {
  const name = clean(r.name, 200);
  if (name.length < 5) fail('Type the full case name, like Donoghue v Stevenson.');
  const citation = clean(r.citation, 100);
  const yr = /(1[6-9]\d\d|20\d\d)/.exec(citation);
  const id = slug(name + (yr ? ' ' + yr[1] : '')).slice(0, 100);
  if (!id || id.indexOf('auth-') === 0) fail('That case name could not be used.');
  const before = await env.DB.prepare('SELECT case_id FROM cases WHERE case_id = ?').bind(id).first();
  if (!before) await env.DB.prepare("INSERT INTO cases (case_id, name, citation, status, data, cited_in, updated_at) VALUES (?, ?, ?, 'cited', '', '[]', ?)").bind(id, name, citation, Date.now()).run();
  return { id, name, existed: !!before };
}
// ---- Merge a duplicate law into another one. The old name keeps working (it points to the target). ----
async function mergeLaw(env, r) {
  await loadAliases(env);
  const from = String(r.from || ''), to = String(r.to || '');
  if (!AUTH_ID.test(from) || !AUTH_ID.test(to) || isSecId(from) || isSecId(to)) fail('Choose two laws.');
  if (from === to) fail('Choose a different law to merge into.');
  const a = await env.DB.prepare('SELECT case_id, name, status, data, cited_in FROM cases WHERE case_id = ?').bind(from).first();
  const b = await env.DB.prepare('SELECT case_id, name, status, data, cited_in FROM cases WHERE case_id = ?').bind(to).first();
  if (!a || !b) fail('Law not found.');
  const now = Date.now();
  const mergeCited = (x, y) => {
    let p = [], q = [];
    try { p = x ? JSON.parse(x) : []; } catch (e) { p = []; }
    try { q = y ? JSON.parse(y) : []; } catch (e) { q = []; }
    q.forEach((e) => { if (!p.some((z) => z.noteId === e.noteId && (z.prov || '') === (e.prov || ''))) p.push(e); });
    return JSON.stringify(p.length > 400 ? p.slice(p.length - 400) : p);
  };
  // the law itself
  const take = b.status !== 'generated' && b.status !== 'verified' && (a.status === 'generated' || a.status === 'verified') && a.data;
  await env.DB.prepare('UPDATE cases SET cited_in = ?, status = ?, data = ?, updated_at = ? WHERE case_id = ?')
    .bind(mergeCited(b.cited_in, a.cited_in), take ? a.status : b.status, take ? a.data : b.data, now, to).run();
  // its sections
  const { results } = await env.DB.prepare('SELECT case_id, status, data, cited_in FROM cases WHERE case_id > ? AND case_id < ? LIMIT 2000').bind(from + ':', from + ':￿').all();
  let moved = 0;
  for (let i = 0; i < results.length; i += 40) {
    const part = results.slice(i, i + 40);
    const tids = part.map((x) => to + ':' + x.case_id.split(':')[3]);
    const have = new Map((await env.DB.prepare('SELECT case_id, status, data, cited_in FROM cases WHERE case_id IN (' + tids.map(() => '?').join(',') + ')').bind(...tids).all()).results.map((x) => [x.case_id, x]));
    const stmts = [];
    part.forEach((x, j) => {
      const key = x.case_id.split(':')[3], tid = tids[j], ex = have.get(tid);
      const nm = b.name + ', ' + keyLabel(key);
      if (!ex) stmts.push(env.DB.prepare('INSERT INTO cases (case_id, name, citation, status, data, cited_in, updated_at) VALUES (?, ?, \'\', ?, ?, ?, ?)').bind(tid, nm, x.status, x.data, x.cited_in, now));
      else {
        const better = (ex.status !== 'generated' && ex.status !== 'verified') && (x.status === 'generated' || x.status === 'verified');
        stmts.push(env.DB.prepare('UPDATE cases SET cited_in = ?, status = ?, data = ?, updated_at = ? WHERE case_id = ?').bind(mergeCited(ex.cited_in, x.cited_in), better ? x.status : ex.status, better ? x.data : ex.data, now, tid));
      }
      stmts.push(env.DB.prepare('DELETE FROM cases WHERE case_id = ?').bind(x.case_id));
      moved++;
    });
    await env.DB.batch(stmts);
  }
  await env.DB.prepare('DELETE FROM cases WHERE case_id = ?').bind(from).run();
  await env.DB.prepare('INSERT INTO law_alias (from_key, to_key, to_name) VALUES (?, ?, ?) ON CONFLICT(from_key) DO UPDATE SET to_key = excluded.to_key, to_name = excluded.to_name').bind(from, to, b.name).run();
  // anything that already pointed at the old law now points at the target
  await env.DB.prepare('UPDATE law_alias SET to_key = ?, to_name = ? WHERE to_key = ?').bind(to, b.name, from).run();
  aliasAt = 0;
  await loadAliases(env);
  return { id: to, name: b.name, movedSections: moved };
}
// After a note is saved: in a fully imported law, a cited section that is not in the law is marked and reported.
async function flagMissing(env, noteId, label, keys) {
  const secs = keys.filter(isSecId).slice(0, 60);
  if (!secs.length) return;
  const complete = new Map();
  for (const k of secs) {
    const lk = k.split(':').slice(0, 3).join(':');
    if (complete.has(lk)) continue;
    const row = await env.DB.prepare('SELECT data, name FROM cases WHERE case_id = ?').bind(lk).first();
    let d = null;
    try { d = row && row.data ? JSON.parse(row.data) : null; } catch (e) { d = null; }
    complete.set(lk, d && d.complete ? row.name : '');
  }
  for (const k of secs) {
    const lawName = complete.get(k.split(':').slice(0, 3).join(':'));
    if (!lawName) continue;
    const row = await env.DB.prepare('SELECT status FROM cases WHERE case_id = ?').bind(k).first();
    if (!row || row.status !== 'cited') continue;
    await env.DB.prepare("UPDATE cases SET status = 'unverifiable', updated_at = ? WHERE case_id = ?").bind(Date.now(), k).run();
    await env.DB.prepare("INSERT OR IGNORE INTO reports (id, note_id, user_id, message, created_at) VALUES (?, ?, 'system', ?, ?)")
      .bind('miss:' + noteId + ':' + k, k, 'Possible wrong citation: "' + label + '" cites ' + keyLabel(k.split(':')[3]) + ' of ' + lawName + ', but the law has no such section.', Date.now()).run();
  }
}
// Several official-text sections explained in ONE Gemini request (saves the free allowance).
async function genAuthBatch(env, ids) {
  ids = (Array.isArray(ids) ? ids : []).map((x) => authId(x)).filter(isSecId).slice(0, 5);
  if (!ids.length) fail('Nothing to write.');
  const lawId = ids[0].split(':').slice(0, 3).join(':');
  if (ids.some((x) => x.split(':').slice(0, 3).join(':') !== lawId)) fail('Sections must be from one law.');
  const law = await env.DB.prepare('SELECT name FROM cases WHERE case_id = ?').bind(lawId).first();
  if (!law) fail('Law not found.');
  const rows = (await env.DB.prepare('SELECT case_id, data FROM cases WHERE case_id IN (' + ids.map(() => '?').join(',') + ')').bind(...ids).all()).results;
  const use = [], skipped = [];
  rows.forEach((x) => {
    let d = null;
    try { d = JSON.parse(x.data); } catch (e) { d = null; }
    const body = d && d.official ? ((d.text || '') + '\n' + (d.subs || []).map((u) => u.ref + ' ' + u.text).join('\n')) : '';
    if (!body || body.length > 2500 || d.summary) skipped.push(x.case_id); else use.push({ id: x.case_id, key: x.case_id.split(':')[3], d, body });
  });
  ids.forEach((x) => { if (!rows.some((y) => y.case_id === x) && !skipped.includes(x)) skipped.push(x); });
  const done = [], failed = [];
  if (use.length) {
    const prompt = 'You are an experienced Nigerian law lecturer. Explain each of these provisions of "' + law.name + '" for law students, using ONLY the official text given for it. Never add subsections, wording, numbers or case names that are not in the text. Do not copy the text; explain it in your own words.\n' +
      use.map((u) => '### ' + u.key + ' (' + keyLabel(u.key) + ')\n' + u.body).join('\n\n') +
      '\n\nReturn JSON only: {"items": [{"key": string (exactly the key after ###), "summary": string (two to four sentences: what it provides and how it works in practice), "examTip": string (one line, or empty)}]} with one item for every provision.';
    const out = await gemini(env, prompt);
    const items = Array.isArray(out.items) ? out.items : [];
    for (const u of use) {
      const it = items.find((x) => String(x && x.key) === u.key);
      const summary = it ? clean(it.summary, 1200) : '';
      if (!summary) { failed.push(u.id); continue; }
      const data = Object.assign({}, u.d, { summary, examTip: clean(it.examTip, 300) });
      await env.DB.prepare("UPDATE cases SET status = 'generated', data = ?, updated_at = ? WHERE case_id = ?").bind(JSON.stringify(data), Date.now(), u.id).run();
      done.push(u.id);
    }
  }
  return { done, failed, skipped };
}
async function addLaw(env, r) {
  const name = clean(r.name, 200);
  if (name.length < 4) fail('Type the name of the law first.');
  let type = AUTH_TYPES[String(r.type || '').toLowerCase()] ? String(r.type).toLowerCase() : '';
  let official = name;
  if (r.skipCheck !== true) {
    const out = await gemini(env, 'You are a careful Nigerian legal researcher. Is "' + name + '" a real law, constitution, court rules, regulation, treaty or received English statute that Nigerian lawyers cite? ' +
      'Set "exists" to true ONLY if you are certain. Never guess. Return JSON only: {"exists": boolean, "officialName": string (the proper full name, as lawyers cite it, with the year if it has one), ' +
      '"type": "const" | "act" | "state" | "rule" | "sub" | "eng" | "intl"}');
    if (out.exists !== true) fail('Gemini could not confirm that law exists. Check the spelling, or tick "Skip the check" if you are sure.');
    official = clean(out.officialName, 200) || name;
    if (!type && AUTH_TYPES[String(out.type || '').toLowerCase()]) type = String(out.type).toLowerCase();
  }
  const c = canonAuth(type || 'act', slug(official), official);
  if (!c) fail('That name could not be used.');
  const before = await env.DB.prepare('SELECT case_id FROM cases WHERE case_id = ?').bind(c.key).first();
  if (!before) await insertLaw(env, c.key, c.name);
  return { id: c.key, name: c.name, existed: !!before };
}
// Students ask for a law that is missing. The request lands in the admin inbox. A few per day each.
async function requestLaw(env, user, r) {
  const msg = clean(r.text, 300);
  if (msg.length < 3) fail('Type the name of the law you need.');
  const since = Date.now() - 86400000;
  const n = await env.DB.prepare("SELECT COUNT(*) c FROM reports WHERE user_id = ? AND note_id = 'request:law' AND created_at > ?").bind(user.id, since).first();
  if (n && n.c >= 5) fail('You have sent enough requests for today. Please try again tomorrow.');
  const dup = await env.DB.prepare("SELECT id FROM reports WHERE user_id = ? AND note_id = 'request:law' AND message = ?").bind(user.id, msg).first();
  if (!dup) await env.DB.prepare("INSERT INTO reports (id, note_id, user_id, message, created_at) VALUES (?, 'request:law', ?, ?, ?)").bind(uid(), user.id, msg, Date.now()).run();
  return true;
}
// Admin inbox: error reports and law requests.
async function inboxList(env) {
  const { results } = await env.DB.prepare('SELECT r.id, r.note_id, r.message, r.created_at, u.name, u.email FROM reports r LEFT JOIN users u ON u.id = r.user_id ORDER BY r.created_at DESC LIMIT 200').all();
  return results.map((x) => ({ id: x.id, noteId: x.note_id, message: x.message, at: x.created_at, name: x.name || '', email: x.email || '' }));
}
async function inboxDelete(env, id) {
  await env.DB.prepare('DELETE FROM reports WHERE id = ?').bind(clean(id, 100)).run();
  return true;
}
async function authVerify(env, id, on) {
  id = authId(id);
  const row = await env.DB.prepare('SELECT status FROM cases WHERE case_id = ?').bind(id).first();
  if (!row) fail('Authority not found.');
  if (row.status !== 'generated' && row.status !== 'verified') fail('Generate the page first.');
  await env.DB.prepare('UPDATE cases SET status = ?, updated_at = ? WHERE case_id = ?').bind(on ? 'verified' : 'generated', Date.now(), id).run();
  return authGet(env, id);
}

// Finds authorities in a note that was written before markers existed, and wraps them in markers.
// The wording of the note does not change, and a verified note stays verified.
function markerRanges(text) {
  const out = [];
  const re = /\{\{[^}]*\}\}/g;
  let m;
  while ((m = re.exec(text)) !== null) out.push([m.index, m.index + m[0].length]);
  return out;
}
async function genScan(env, r) {
  const id = checkNoteId(String(r.noteId || ''));
  const kind = kindOf(id);
  const secs = await sectionsOf(env, id, kind);
  if (!secs.length) return { skipped: true, linked: 0, found: 0 };
  const bodies = new Map(secs.map((s) => [s.key, s.body]));
  let text = secs.map((s) => '### ' + s.key + '\n' + s.body).join('\n\n');
  if (text.length > 60000) text = text.slice(0, 60000);
  const known = (await env.DB.prepare("SELECT case_id, name FROM cases WHERE case_id LIKE 'auth:%' ORDER BY updated_at DESC LIMIT 120").all()).results;
  const prompt = 'Below is a Nigerian law study note in sections. Each section starts with a line "### key". ' +
    'Find every place where the note cites a constitution, statute, court rule, regulation, received English statute, or treaty. Do NOT include court cases. ' +
    'For each place return an object with: "section" (the key of the section), "snippet" (text copied EXACTLY, character for character, from the note: 20 to 80 characters and containing the mention), ' +
    '"mention" (an EXACT part of the snippet that should become the link: the name of the law, or the name together with its provision when they are written together, such as "Evidence Act 2011, s. 84" or "Section 14"), ' +
    '"type" (one of const, act, state, rule, sub, eng, intl), "id" (lowercase name and year joined with hyphens, such as evidence-act-2011), "name" (the full proper name of the law, such as Evidence Act 2011), and "provision" (such as s. 84 or Order 15 Rule 1, or an empty string). ' +
    'When a line such as "Section 14: ..." belongs to a law named just above it, use that law for name, type and id. Skip vague references such as "the statute". At most 60 objects. ' +
    (known.length ? 'Reuse these ids exactly when they are the same law: ' + known.map((k) => k.case_id.split(':').slice(1).join(':') + ' = ' + k.name).join('; ') + '. ' : '') +
    'Return JSON only: {"items": [ ... ]}.\n\nNOTE:\n' + text;
  const out = await gemini(env, prompt);
  const items = Array.isArray(out.items) ? out.items.slice(0, 60) : [];
  let linked = 0;
  const changed = new Set();
  for (const it of items) {
    const snippet = String(it.snippet || '');
    const mention = String(it.mention || '');
    if (!snippet || !mention || /[|{}]/.test(mention) || snippet.indexOf(mention) < 0) continue;
    const c = canonAuth(it.type, it.id, it.name);
    if (!c) continue;
    const keys = bodies.has(it.section) ? [it.section, ...bodies.keys()] : [...bodies.keys()];
    for (const k of [...new Set(keys)]) {
      const body = bodies.get(k);
      const at = body.indexOf(snippet);
      if (at < 0) continue;
      const pos = at + snippet.indexOf(mention);
      const end = pos + mention.length;
      if (markerRanges(body).some((rg) => pos < rg[1] && end > rg[0])) continue;
      const marker = '{{a:' + c.type + ':' + c.id + '|' + mention + '|' + clean(it.provision, 80).replace(/[|{}]/g, '') + '}}';
      bodies.set(k, body.slice(0, pos) + marker + body.slice(end));
      changed.add(k);
      linked++;
      break;
    }
  }
  const title = (await env.DB.prepare('SELECT title FROM lib_notes WHERE note_id = ?').bind(id).first());
  const label = clean(title && title.title ? title.title : id, 150);
  for (const k of changed) {
    const def = SEC[kind].find((d) => d[0] === k);
    await upsertSection(env, id, k, def[1], bodies.get(k));
  }
  if (changed.size) {
    await registerAuth(env, id, label, [...bodies.values()].join('\n\n'));
    await refreshNote(env, id);
    await publishNote(env, id);
  }
  return { skipped: false, found: items.length, linked, sections: changed.size };
}

// ---------- Routing ----------
async function route(r, env) {
  const a = String(r.action || '');
  if (a === 'auth.google') return authGoogle(r, env);
  if (a === 'lib.get') return libGet(env, String(r.noteId || ''));
  if (a === 'lib.list') return libList(env, r.prefixes);
  if (a === 'case.get') return caseGet(env, slug(r.id));
  if (a === 'auth.get') { await loadAliases(env); return authGet(env, String(r.id || '')); }
  if (a === 'auth.list') return authList(env, r.kind);
  if (a === 'auth.find') return authFind(env, r.q);
  if (a === 'courses.list') return coursesList(env);

  const user = await authUser(r.token, env);
  switch (a) {
    case 'sync.get': return syncGet(env, user);
    case 'sync.put': return syncPut(env, user, r);
    case 'posts.list': return postsList(env, user);
    case 'posts.get': return postGet(env, user, r.id);
    case 'posts.create': return postCreate(env, user, r);
    case 'posts.delete': return postDelete(env, user, r.id);
    case 'replies.create': return replyCreate(env, user, r);
    case 'replies.delete': return replyDelete(env, user, r.id);
    case 'lib.report': return libReport(env, user, r);
    case 'req.law': return requestLaw(env, user, r);
  }
  if (a.indexOf('gen.') === 0) {
    requireAdmin(user);
    await loadAliases(env);
    switch (a) {
      case 'gen.section': return genSection(env, r);
      case 'gen.check': return genCheck(env, String(r.noteId || ''));
      case 'gen.verify': return genVerify(env, String(r.noteId || ''));
      case 'gen.save': return genSave(env, r);
      case 'gen.case': return genCase(env, slug(r.id));
      case 'gen.auth': return genAuth(env, String(r.id || ''));
      case 'gen.authBackfill': return authBackfill(env, String(r.id || ''));
      case 'gen.authVerify': return authVerify(env, String(r.id || ''), r.on !== false);
      case 'gen.scan': return genScan(env, r);
      case 'gen.addStandard': return addStandard(env);
      case 'gen.addLaw': return addLaw(env, r);
      case 'gen.importLaw': return importLaw(env, r);
      case 'gen.mergeLaw': return mergeLaw(env, r);
      case 'gen.authBatch': return genAuthBatch(env, r.ids);
      case 'gen.courseSave': return courseSave(env, r);
      case 'gen.courseHide': return courseHide(env, r);
      case 'gen.courseList': return coursesList(env, true);
      case 'gen.addCase': return addCase(env, r);
      case 'gen.inbox': return inboxList(env);
      case 'gen.inboxDelete': return inboxDelete(env, r.id);
    }
  }
  fail('Unknown action.');
}

function corsFor(req, env) {
  const origin = req.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const same = origin === new URL(req.url).origin; // the website and the API share one address
  const ok = !origin || same || allowed.indexOf('*') >= 0 || allowed.indexOf(origin) >= 0;
  const h = { 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' };
  if (origin && ok) h['Access-Control-Allow-Origin'] = origin;
  return { ok, headers: h };
}
function respond(obj, cors, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, cors.headers) });
}

export default {
  async fetch(req, env) {
    // Website files are served by Cloudflare itself. Only /api (and the front door) reach this code.
    if (env.ASSETS) {
      const u = new URL(req.url);
      if (u.pathname === '/') return env.ASSETS.fetch(new Request(new URL('/home.html', u), req));
      if (u.pathname !== '/api') return env.ASSETS.fetch(req);
    }
    const cors = corsFor(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: cors.ok ? 204 : 403, headers: cors.headers });
    if (!cors.ok) return respond({ ok: false, error: 'This website is not allowed to use the API.' }, cors, 403);
    if (req.method === 'GET') return respond({ ok: true, data: 'LawLink API is running' }, cors);
    if (req.method !== 'POST') return respond({ ok: false, error: 'Method not allowed.' }, cors, 405);
    try {
      const text = await req.text();
      if (text.length > 200000) fail('That request is too large.');
      let r;
      try { r = JSON.parse(text); } catch (e) { fail('Bad request.'); }
      return respond({ ok: true, data: await route(r || {}, env) }, cors);
    } catch (e) {
      if (e instanceof UserError) return respond({ ok: false, error: e.message }, cors);
      console.error('LawLink error', e && e.stack || e);
      return respond({ ok: false, error: 'Something went wrong. Please try again.' }, cors, 500);
    }
  },
};
