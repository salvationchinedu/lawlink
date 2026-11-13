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
  intro: 'Define the topic precisely, beginning with a clear one or two sentence definition. Say why it matters in Nigerian law and legal practice, state its scope, and say how it connects to neighbouring topics in the course.',
  principles: 'Explain every rule and principle in full detail, with the reasoning behind it. Give the source of each rule (the statute provision or the case). Define each key term in bold the first time it appears. Where two tests or approaches compete, set them out side by side as short bullet points and say which one Nigerian courts apply.',
  statutory: 'Set out the relevant Nigerian statutes and provisions, marking each one with the authority marker and its section number. For each provision say in your own words what it requires or changes. Do not copy long passages. Mention any State law or court rule that matters. If an Act applies but you are not certain of its section numbers, name the Act without a section number. Say if there is no statute.',
  cases: 'Discuss the leading cases, Nigerian cases first, and only cases you are certain exist. Give as many as you are sure of, up to eight; fewer is better than one doubtful case. For each case give the facts in one or two lines, the court, the holding (the ratio) in one sentence, and why it matters. Add how later courts treated it only if you are sure.',
  application: 'Give at least two worked examples in IRAC form. Each starts with short facts about named Nigerian parties, then has four labelled lines: Issue, Rule, Application and Conclusion. Make the second example a tricky one where a common wrong answer looks plausible, and explain why that answer is wrong.',
  exceptions: 'Explain the exceptions, limits and defences. For each, give the reason and the authority, and say who carries the burden of proof. Point out where the law is unsettled or where courts disagree.',
  criticism: 'Give academic and judicial criticism, and proposals for reform. Be fair to both sides. Say "some writers argue" or "the courts have said" unless you are certain of the author and the work.',
  summary: 'Give a revision summary of 10 to 15 bullet points a student can read in five minutes. Then add a short list of the key authorities to remember.',
  exam: 'Give 5 to 8 "Exam focus" bullets: what examiners usually ask, the common mistakes, and a quick way to structure an answer. Then give one sample problem question with a model answer in IRAC form.',
  overview: 'Give an overview of the course: what it covers, why it matters to a Nigerian lawyer, and how it is usually examined.',
  scope: 'List the scope and the learning outcomes a student should reach, in clear bullet points.',
  topicmap: 'Explain how the topics connect and in what order to study them, naming the topics.',
  authorities: 'List the key cases and statutes of the whole course, each marked with its marker and with one line on why it matters. Include only authorities you are certain exist.',
  studyguide: 'Give a practical study guide: how to approach the reading, what to memorise, how to revise, and a simple weekly plan.',
};
const SEC_WORDS = { principles: 500, cases: 450, application: 450, exam: 350, intro: 300, statutory: 300, exceptions: 300, criticism: 300, summary: 200 };
const RULES = 'Write clear, complete, accurate study material in plain text. Use blank lines between paragraphs and "- " for bullet points. Use **bold** only for key terms. ' +
  'Prefer Nigerian authorities where they exist. Cite a case ONLY if you are certain it exists and you know its correct citation; if you are not sure, leave it out. Never guess a citation. ' +
  'Every case you mention must use exactly this marker: {{c:ID|Full case name|Citation}} where ID is the lowercase case name and year joined with hyphens, for example {{c:carlill-v-carbolic-smoke-ball-co-1893|Carlill v Carbolic Smoke Ball Co|[1893] 1 QB 256}}. ' +
  'Every constitution, statute, Act, court rule, regulation, English statute or treaty you mention must use this marker: {{a:TYPE:ID|Name of the law|Provision}} where TYPE is one of const (the Constitution), act (Act of the National Assembly), state (State law), rule (court rules), sub (regulations and agency rules), eng (received English statute), intl (treaty or international instrument); ID is the lowercase name and year joined with hyphens, with no spaces; Provision is the section or rule, such as s. 36 or Order 15 Rule 1, or empty if you mean the whole law. ' +
  'Examples: {{a:const:constitution-1999|Constitution of the Federal Republic of Nigeria 1999|s. 36}}, {{a:act:evidence-act-2011|Evidence Act 2011|s. 84}}, {{a:act:land-use-act|Land Use Act|}}, {{a:rule:fundamental-rights-enforcement-procedure-rules-2009|Fundamental Rights (Enforcement Procedure) Rules 2009|}} and {{a:eng:statute-of-frauds-1677|Statute of Frauds 1677|}}. ' +
  'Mark a law every time you name it, even when it is an Act, and never leave the name of a law outside a marker. A marker always has exactly two "|" characters, and the Name inside it is written exactly as it appears in your sentence. Use a separate marker for each provision. Cite a provision ONLY if you are sure it exists; never guess section numbers. Do not quote long passages from statutes or law reports.';

const LEVELS = ['100', '200', '300', '400', '500'];
const POST_TYPES = ['Question', 'Tip'];
const SESSION_SECONDS = 180 * 86400; // students sign in once; the app renews the pass while they keep using it
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
  if (!secret) fail('Sign-in is not available right now. Please try again in a little while.');
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
  let name = clean(g.name || email.split('@')[0], 80);
  const row = await env.DB.prepare('SELECT id, name FROM users WHERE id = ?').bind(id).first();
  if (row && row.name) name = row.name; // a name the student chose here beats the Google one
  if (!row) {
    await env.DB.prepare('INSERT OR IGNORE INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)').bind(id, email, name, Date.now()).run();
  }
  const admins = String(env.ADMIN_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  const adm = admins.indexOf(email) >= 0;
  const now = Math.floor(Date.now() / 1000);
  const pic = /^https:\/\/[^\s"<>]{5,280}$/.test(String(g.picture || '')) ? String(g.picture) : '';
  const wm = await wmCode(env, id);
  const token = await signToken({ sub: id, name, email, pic, wm, adm: adm ? 1 : 0, iat: now, exp: now + SESSION_SECONDS }, env.SESSION_SECRET);
  return { token, user: { id, name, email, picture: pic, role: adm ? 'admin' : 'student' } };
}
// ---------- Watermark code: a short code per student (like LT-4K7Q2X), printed faintly on notes so a leaked screenshot can be traced ----------
let wmReady = false;
const WM_CH = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
async function wmTable(env) {
  if (wmReady) return;
  try { await env.DB.prepare('ALTER TABLE users ADD COLUMN wm TEXT NOT NULL DEFAULT \'\'').run(); } catch (e) { /* already there */ }
  try { await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS users_wm ON users(wm) WHERE wm != \'\'').run(); } catch (e) { /* already there */ }
  wmReady = true;
}
async function wmCode(env, id) {
  try {
    await wmTable(env);
    const row = await env.DB.prepare('SELECT wm FROM users WHERE id = ?').bind(id).first();
    if (!row) return '';
    if (row.wm) return row.wm;
    for (let t = 0; t < 8; t++) {
      const b = crypto.getRandomValues(new Uint8Array(6)); let c = 'LT-';
      for (const x of b) c += WM_CH[x % WM_CH.length];
      try { await env.DB.prepare('UPDATE users SET wm = ? WHERE id = ? AND wm = \'\'').bind(c, id).run(); } catch (e) { continue; } // code already taken: try another
      const again = await env.DB.prepare('SELECT wm FROM users WHERE id = ?').bind(id).first();
      if (again && again.wm) return again.wm;
    }
  } catch (e) { /* the code is a bonus: never block sign-in */ }
  return '';
}
// A signed-in student gets a fresh pass, so they stay signed in as long as they keep using the app.
async function authRenew(env, user) {
  const admins = String(env.ADMIN_EMAILS || '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);
  const adm = admins.indexOf(String(user.email || '').toLowerCase()) >= 0;
  const now = Math.floor(Date.now() / 1000);
  let name = user.name;
  try { const row = await env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(user.id).first(); if (row && row.name) name = row.name; } catch (e) { /* keep the name in the pass */ }
  const wm = await wmCode(env, user.id);
  const token = await signToken({ sub: user.id, name, email: user.email, pic: user.picture || '', wm, adm: adm ? 1 : 0, iat: now, exp: now + SESSION_SECONDS }, env.SESSION_SECRET);
  return { token };
}

async function authUser(token, env) {
  if (!token || token === 'guest') fail('Please log in to do this.');
  const p = await verifyToken(token, env.SESSION_SECRET);
  if (!p) fail('Your session expired. Please log in again.');
  return { id: p.sub, name: p.name, email: p.email, picture: p.pic || '', admin: p.adm === 1 };
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

// ---------- Profile: the optional details a student adds about themselves ----------
let profileTableReady = false;
async function profileTable(env) {
  if (profileTableReady) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS profile ( user_id TEXT PRIMARY KEY, phone TEXT NOT NULL DEFAULT \'\', uni TEXT NOT NULL DEFAULT \'\', yr TEXT NOT NULL DEFAULT \'\', sem TEXT NOT NULL DEFAULT \'[]\', name_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0, done INTEGER NOT NULL DEFAULT 0, terms_at INTEGER NOT NULL DEFAULT 0 )').run();
  for (const col of ['done', 'terms_at', 'tour_at']) { try { await env.DB.prepare('ALTER TABLE profile ADD COLUMN ' + col + ' INTEGER NOT NULL DEFAULT 0').run(); } catch (e) { /* the column is already there */ } }
  profileTableReady = true;
}
const NAME_WAIT = 14 * 86400000; // a student may change their name once every 14 days
function cleanPhone(v) {
  v = clean(v, 30).replace(/[^\d+ ()-]/g, '').trim();
  if (!v) return '';
  const d = v.replace(/\D/g, '');
  if (d.length < 7 || d.length > 15) fail('Enter a valid phone number, or leave it empty.');
  return v.slice(0, 20);
}
function cleanYear(v) {
  v = clean(v, 4);
  if (!v) return '';
  if (!/^\d{4}$/.test(v) || Number(v) < 2000 || Number(v) > 2045) fail('Enter a four-digit year such as 2027, or leave it empty.');
  return v;
}
function cleanSem(list) {
  const out = [];
  (Array.isArray(list) ? list : []).forEach((x) => { x = String(x || ''); if (/^[\w.-]{1,80}$/.test(x) && out.indexOf(x) < 0 && out.length < 40) out.push(x); });
  return out;
}
function cleanName(v) {
  v = String(v === undefined || v === null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (v.length < 2) fail('Enter a name of at least 2 characters.');
  return v;
}
function daysLeft(ms) { return Math.max(1, Math.ceil(ms / 86400000)); }
async function profileRead(env, user) {
  await profileTable(env);
  const u = await env.DB.prepare('SELECT name, email FROM users WHERE id = ?').bind(user.id).first();
  const p = await env.DB.prepare('SELECT phone, uni, yr, sem, name_at, done, tour_at FROM profile WHERE user_id = ?').bind(user.id).first();
  let sem = [];
  try { sem = cleanSem(JSON.parse((p && p.sem) || '[]')); } catch (e) { sem = []; }
  const at = (p && p.name_at) || 0;
  return {
    name: (u && u.name) || user.name, email: (u && u.email) || user.email,
    phone: (p && p.phone) || '', uni: (p && p.uni) || '', yr: (p && p.yr) || '', sem,
    nameNext: at && Date.now() - at < NAME_WAIT ? at + NAME_WAIT : 0,
    done: !!(p && p.done), tour: !!(p && p.tour_at),
  };
}
async function profileGet(env, user) { return { profile: await profileRead(env, user) }; }
// The first-time welcome pop-up has been shown (or skipped): remembered per student, so a second phone does not show it again.
async function profileTour(env, user) {
  await profileTable(env);
  const now = Date.now();
  await env.DB.prepare('INSERT INTO profile (user_id, updated_at, tour_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET tour_at = excluded.tour_at').bind(user.id, now, now).run();
  return { tour: true };
}
async function profileSave(env, user, r) {
  await profileTable(env);
  const now = Date.now();
  const cur = await profileRead(env, user);
  const phone = cleanPhone(r.phone), yr = cleanYear(r.yr), uni = clean(r.uni, 80), sem = cleanSem(r.sem);
  let name = cur.name, changed = false;
  if (r.name !== undefined && cleanName(r.name) !== cur.name) {
    if (cur.nameNext) fail('You can change your name again in ' + daysLeft(cur.nameNext - now) + ' day' + (daysLeft(cur.nameNext - now) === 1 ? '' : 's') + '.');
    name = cleanName(r.name); changed = true;
  }
  const st = [env.DB.prepare('INSERT INTO profile (user_id, phone, uni, yr, sem, name_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET phone = excluded.phone, uni = excluded.uni, yr = excluded.yr, sem = excluded.sem, updated_at = excluded.updated_at' + (changed ? ', name_at = excluded.name_at' : ''))
    .bind(user.id, phone, uni, yr, JSON.stringify(sem), changed ? now : 0, now)];
  if (changed) {
    st.push(env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, user.id));
    st.push(env.DB.prepare('UPDATE posts SET author = ? WHERE user_id = ?').bind(name, user.id));
    st.push(env.DB.prepare('UPDATE replies SET author = ? WHERE user_id = ?').bind(name, user.id));
  }
  await env.DB.batch(st);
  const t = await authRenew(env, { id: user.id, name, email: cur.email, picture: user.picture });
  return { profile: await profileRead(env, user), token: t.token };
}

// ---------- First sign-in: name, university and the terms are compulsory ----------
const SETUP_MSG = 'Please finish setting up your profile first.';
const setupSeen = new Map(); // students known to be finished; one small entry each, emptied when it grows
async function setupDone(env, user) {
  if (user.admin || setupSeen.has(user.id)) return true;
  await profileTable(env);
  const p = await env.DB.prepare('SELECT done FROM profile WHERE user_id = ?').bind(user.id).first();
  if (p && p.done) { if (setupSeen.size > 5000) setupSeen.clear(); setupSeen.set(user.id, 1); return true; }
  return false;
}
async function profileSetup(env, user, r) {
  await profileTable(env);
  if (r.terms !== true) fail('Please agree to the Terms and Privacy policy to continue.');
  const uni = clean(r.uni, 80);
  if (!uni) fail('Choose your university to continue.');
  const name = cleanName(r.name);
  const phone = cleanPhone(r.phone), yr = cleanYear(r.yr), sem = cleanSem(r.sem);
  const cur = await profileRead(env, user);
  const now = Date.now();
  const st = [env.DB.prepare('INSERT INTO profile (user_id, phone, uni, yr, sem, name_at, updated_at, done, terms_at) VALUES (?, ?, ?, ?, ?, 0, ?, 1, ?) ON CONFLICT(user_id) DO UPDATE SET phone = excluded.phone, uni = excluded.uni, yr = excluded.yr, sem = excluded.sem, updated_at = excluded.updated_at, done = 1, terms_at = excluded.terms_at')
    .bind(user.id, phone, uni, yr, JSON.stringify(sem), now, now)];
  if (name !== cur.name) { // the first name on this screen is free: it does not start the 14-day wait
    st.push(env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, user.id));
    st.push(env.DB.prepare('UPDATE posts SET author = ? WHERE user_id = ?').bind(name, user.id));
    st.push(env.DB.prepare('UPDATE replies SET author = ? WHERE user_id = ?').bind(name, user.id));
  }
  await env.DB.batch(st);
  setupSeen.set(user.id, 1);
  const t = await authRenew(env, { id: user.id, name, email: cur.email, picture: user.picture });
  return { profile: await profileRead(env, user), token: t.token };
}
// Admin: page through the students. Newest first, 50 at a time, searchable by name or email.
async function usersList(env, r) {
  await profileTable(env); await wmTable(env);
  const limit = Math.min(2000, Math.max(1, Number(r.limit) || 50));
  const q = clean(r.q, 60).replace(/[\\%_]/g, (m) => '\\' + m);
  const like = q ? '%' + q + '%' : '', wlike = q ? '%' + q.toUpperCase() + '%' : '';
  let ts = Number.MAX_SAFE_INTEGER, id = '￿';
  if (r.before) { const m = /^(\d{1,16}):(.{1,64})$/.exec(String(r.before)); if (m) { ts = Number(m[1]); id = m[2]; } }
  const { results } = await env.DB.prepare(
    'SELECT u.id, u.email, u.name, u.created_at, u.wm, p.phone, p.uni, p.yr, s.updated_at AS seen FROM users u LEFT JOIN profile p ON p.user_id = u.id LEFT JOIN sync s ON s.user_id = u.id ' +
    'WHERE (? = \'\' OR u.email LIKE ? ESCAPE \'\\\' OR u.name LIKE ? ESCAPE \'\\\' OR u.wm LIKE ? ESCAPE \'\\\') AND (u.created_at < ? OR (u.created_at = ? AND u.id < ?)) ORDER BY u.created_at DESC, u.id DESC LIMIT ?'
  ).bind(like, like, like, wlike, ts, ts, id, limit + 1).all();
  const more = results.length > limit;
  const rows = results.slice(0, limit).map((x) => ({ id: x.id, email: x.email, name: x.name, joined: x.created_at, code: x.wm || '', phone: x.phone || '', uni: x.uni || '', yr: x.yr || '', seen: x.seen || 0 }));
  const out = { rows, next: more ? rows[rows.length - 1].joined + ':' + rows[rows.length - 1].id : '' };
  if (!r.before && !q) { const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first(); out.total = c ? c.n : 0; }
  return out;
}
// Admin: replace a name that was reported, so it stops showing in Community.
async function usersResetName(env, r) {
  await profileTable(env);
  const id = clean(r.id, 64);
  const u = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
  if (!u) fail('That student was not found.');
  const name = 'Student ' + String(Math.floor(1000 + Math.random() * 9000));
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, id),
    env.DB.prepare('INSERT INTO profile (user_id, name_at, updated_at) VALUES (?, 0, ?) ON CONFLICT(user_id) DO UPDATE SET name_at = 0, updated_at = excluded.updated_at').bind(id, Date.now()),
    env.DB.prepare('UPDATE posts SET author = ? WHERE user_id = ?').bind(name, id),
    env.DB.prepare('UPDATE replies SET author = ? WHERE user_id = ?').bind(name, id),
  ]);
  return { name };
}

// ---------- Community ----------
// Posts and replies stay for 3 months and then go. Everyone signed in can read; students keep what they have seen on their phone.
function communityOn(env) { if (env.COMMUNITY_ENABLED === 'false') fail('Community is not open yet.'); }
const COMM_KEEP = 90 * 86400000;      // 3 months
const COMM_POSTS_DAY = 5, COMM_REPLIES_DAY = 20, COMM_HIDE_AT = 4; // posts and replies a student may write per day; reports from different students that hide a post
const REPORT_WHY = ['Inappropriate', 'Exam leak', 'Wrong or misleading', 'Spam', 'Other'];
let commReady = false;
async function commTables(env) {
  if (commReady) return;
  const run = async (sql) => { try { await env.DB.prepare(sql).run(); } catch (e) { /* already there */ } };
  for (const c of ['anon INTEGER NOT NULL DEFAULT 0', 'topic TEXT NOT NULL DEFAULT \'\'', 'pinned INTEGER NOT NULL DEFAULT 0', 'hidden INTEGER NOT NULL DEFAULT 0', 'deleted INTEGER NOT NULL DEFAULT 0', 'updated_at INTEGER NOT NULL DEFAULT 0', 'best TEXT NOT NULL DEFAULT \'\'']) await run('ALTER TABLE posts ADD COLUMN ' + c);
  for (const c of ['anon INTEGER NOT NULL DEFAULT 0', 'helpful INTEGER NOT NULL DEFAULT 0', 'verified INTEGER NOT NULL DEFAULT 0', 'hidden INTEGER NOT NULL DEFAULT 0']) await run('ALTER TABLE replies ADD COLUMN ' + c);
  await run('CREATE TABLE IF NOT EXISTS creports ( kind TEXT NOT NULL, target TEXT NOT NULL, post_id TEXT NOT NULL, user_id TEXT NOT NULL, reason TEXT NOT NULL DEFAULT \'\', at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (kind, target, user_id) )');
  await run('CREATE TABLE IF NOT EXISTS chelp ( reply_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (reply_id, user_id) )');
  await run('CREATE TABLE IF NOT EXISTS cmute ( user_id TEXT PRIMARY KEY, until INTEGER NOT NULL DEFAULT 0 )');
  await run('UPDATE posts SET updated_at = created_at WHERE updated_at = 0');
  await run('CREATE INDEX IF NOT EXISTS idx_posts_upd ON posts(updated_at)');
  await run('CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id, created_at)');
  await run('CREATE INDEX IF NOT EXISTS idx_replies_post ON replies(post_id)');
  await run('CREATE INDEX IF NOT EXISTS idx_replies_user ON replies(user_id, created_at)');
  commReady = true;
}
const pubPost = (p, user) => {
  const o = { id: p.id, type: p.type, course: p.course, topic: p.topic || '', title: p.title, body: p.body, author: p.anon ? 'Anonymous' : p.author, anon: !!p.anon, ts: p.created_at, upd: p.updated_at || p.created_at, replies: p.replies, pinned: !!p.pinned, best: p.best || '', mine: p.user_id === user.id };
  if (user.admin) { o.uid = p.user_id; o.real = p.author; o.hidden = !!p.hidden; o.reports = p.reports || 0; }
  return o;
};
const pubReply = (x, user) => {
  const o = { id: x.id, body: x.body, author: x.anon ? 'Anonymous' : x.author, anon: !!x.anon, ts: x.created_at, helpful: x.helpful || 0, verified: !!x.verified, mine: x.user_id === user.id, voted: !!x.voted };
  if (user.admin) { o.uid = x.user_id; o.real = x.author; o.hidden = !!x.hidden; }
  return o;
};
async function commPurge(env) {
  const day = new Date().toISOString().slice(0, 10);
  const have = await env.DB.prepare('SELECT v FROM kv WHERE k = \'comm_purge\'').first();
  if (have && have.v === day) return;
  await env.DB.prepare('INSERT INTO kv (k, v) VALUES (\'comm_purge\', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(day).run();
  const cut = Date.now() - COMM_KEEP;
  const old = '(SELECT id FROM posts WHERE created_at < ' + Math.floor(cut) + ' AND pinned = 0 LIMIT 500)';
  await env.DB.batch([
    env.DB.prepare('DELETE FROM chelp WHERE reply_id IN (SELECT id FROM replies WHERE post_id IN ' + old + ')'),
    env.DB.prepare('DELETE FROM creports WHERE post_id IN ' + old),
    env.DB.prepare('DELETE FROM replies WHERE post_id IN ' + old),
    env.DB.prepare('DELETE FROM posts WHERE id IN ' + old),
  ]);
}
async function commGate(env, user, kind) {
  communityOn(env); await commTables(env);
  if (user.admin) return;
  const m = await env.DB.prepare('SELECT until FROM cmute WHERE user_id = ?').bind(user.id).first();
  if (m && m.until > Date.now()) fail('You cannot post in Community until ' + new Date(m.until).toISOString().slice(0, 10) + '.');
  const since = Date.now() - 86400000;
  const tbl = kind === 'post' ? 'posts' : 'replies', cap = kind === 'post' ? COMM_POSTS_DAY : COMM_REPLIES_DAY;
  const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM ' + tbl + ' WHERE user_id = ? AND created_at > ?').bind(user.id, since).first();
  if (c && c.n >= cap) fail('You have reached today\'s limit of ' + cap + (kind === 'post' ? ' posts' : ' replies') + '. Please come back tomorrow.');
}
// The feed. With "since" it sends only what changed (new posts, new replies, pins, answers, removals). Without it, the newest posts.
async function needComm(env, user) { // once payment is on, the community is for students with access
  if (user && user.admin) return;
  const s = await payState(env, user);
  if (!s.active) fail(COMM_PAY_MSG);
}
async function postsList(env, user, r) {
  communityOn(env); await commTables(env);
  r = r || {};
  const now = Date.now(), cut = now - COMM_KEEP, lim = Math.min(100, Math.max(1, Number(r.limit) || 60));
  let rows;
  if (Number(r.since) > 0) {
    ({ results: rows } = await env.DB.prepare('SELECT p.*, (SELECT COUNT(*) FROM creports c WHERE c.kind = \'post\' AND c.target = p.id) AS reports FROM posts p WHERE p.updated_at > ? AND (p.created_at > ? OR p.pinned = 1) ORDER BY p.updated_at ASC LIMIT ?').bind(Math.floor(Number(r.since)), cut, lim + 1).all());
  } else if (Number(r.before) > 0) {
    ({ results: rows } = await env.DB.prepare('SELECT p.*, (SELECT COUNT(*) FROM creports c WHERE c.kind = \'post\' AND c.target = p.id) AS reports FROM posts p WHERE p.created_at < ? AND p.created_at > ? AND p.deleted = 0 AND p.hidden = 0 ORDER BY p.created_at DESC LIMIT ?').bind(Math.floor(Number(r.before)), cut, lim + 1).all());
  } else {
    ({ results: rows } = await env.DB.prepare('SELECT p.*, (SELECT COUNT(*) FROM creports c WHERE c.kind = \'post\' AND c.target = p.id) AS reports FROM posts p WHERE p.created_at > ? AND p.deleted = 0 AND p.hidden = 0 ORDER BY p.created_at DESC LIMIT ?').bind(cut, lim + 1).all());
  }
  const more = rows.length > lim; rows = rows.slice(0, lim);
  const posts = rows.map((p) => (p.deleted || (p.hidden && !user.admin && p.user_id !== user.id)) ? { id: p.id, gone: 1, upd: p.updated_at } : pubPost(p, user));
  const incremental = Number(r.since) > 0;
  const upTo = incremental && rows.length ? rows[rows.length - 1].updated_at : now;
  return { posts, more, now: incremental ? upTo : now };
}
async function postGet(env, user, id, since) {
  communityOn(env); await commTables(env);
  const post = await env.DB.prepare('SELECT p.*, (SELECT COUNT(*) FROM creports c WHERE c.kind = \'post\' AND c.target = p.id) AS reports FROM posts p WHERE p.id = ?').bind(String(id)).first();
  if (!post || post.deleted || (post.hidden && !user.admin && post.user_id !== user.id)) fail('This post is no longer available.');
  const { results } = await env.DB.prepare('SELECT x.*, (SELECT 1 FROM chelp h WHERE h.reply_id = x.id AND h.user_id = ?) AS voted FROM replies x WHERE x.post_id = ? AND (x.hidden = 0 OR ? = 1 OR x.user_id = ?) ORDER BY x.created_at LIMIT 300').bind(user.id, post.id, user.admin ? 1 : 0, user.id).all();
  return { post: pubPost(post, user), replies: results.map((x) => pubReply(x, user)), now: Date.now() };
}
async function postCreate(env, user, r) {
  await commGate(env, user, 'post');
  const p = r.post || {};
  const title = clean(p.title, 150), body = clean(p.body, 5000);
  if (!title) fail('Add a title.');
  if (!body) fail('Write your question or tip.');
  const type = POST_TYPES.indexOf(p.type) >= 0 ? p.type : 'Question';
  const id = uid(), now = Date.now();
  await env.DB.prepare('INSERT INTO posts (id, user_id, author, level, type, course, topic, title, body, replies, created_at, updated_at, anon) VALUES (?, ?, ?, \'\', ?, ?, ?, ?, ?, 0, ?, ?, ?)')
    .bind(id, user.id, user.name, type, clean(p.course, 90), clean(p.topic, 150), title, body, now, now, p.anon ? 1 : 0).run();
  try { await commPurge(env); } catch (e) { /* tidying can wait for the next post */ }
  return { id, ts: now };
}
async function postDelete(env, user, id) {
  communityOn(env); await commTables(env);
  const p = await env.DB.prepare('SELECT user_id FROM posts WHERE id = ?').bind(String(id)).first();
  if (!p) fail('Post not found.');
  if (p.user_id !== user.id && !user.admin) fail('You can only delete your own posts.');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM chelp WHERE reply_id IN (SELECT id FROM replies WHERE post_id = ?)').bind(String(id)),
    env.DB.prepare('DELETE FROM replies WHERE post_id = ?').bind(String(id)),
    env.DB.prepare('UPDATE posts SET deleted = 1, title = \'\', body = \'\', replies = 0, updated_at = ? WHERE id = ?').bind(Date.now(), String(id)), // a stub stays so every phone drops it
  ]);
  return true;
}
async function replyCreate(env, user, r) {
  await commGate(env, user, 'reply');
  const body = clean(r.body, 3000);
  if (!body) fail('Write a reply first.');
  const postId = String(r.postId || '');
  const exists = await env.DB.prepare('SELECT id, user_id, type, title FROM posts WHERE id = ? AND deleted = 0 AND hidden = 0').bind(postId).first();
  if (!exists) fail('This post is no longer available.');
  const id = uid(), now = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO replies (id, post_id, user_id, author, level, body, created_at, anon) VALUES (?, ?, ?, ?, \'\', ?, ?, ?)').bind(id, postId, user.id, user.name, body, now, r.anon ? 1 : 0),
    env.DB.prepare('UPDATE posts SET replies = replies + 1, updated_at = ? WHERE id = ?').bind(now, postId),
  ]);
  later(r, pushAnswer(env, exists, user.id)); // tell the student who asked, if they have notifications on
  return { id, ts: now };
}
async function replyDelete(env, user, id) {
  communityOn(env); await commTables(env);
  const x = await env.DB.prepare('SELECT user_id, post_id FROM replies WHERE id = ?').bind(String(id)).first();
  if (!x) fail('Reply not found.');
  if (x.user_id !== user.id && !user.admin) fail('You can only delete your own replies.');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM chelp WHERE reply_id = ?').bind(String(id)),
    env.DB.prepare('DELETE FROM replies WHERE id = ?').bind(String(id)),
    env.DB.prepare('UPDATE posts SET replies = MAX(replies - 1, 0), best = CASE WHEN best = ? THEN \'\' ELSE best END, updated_at = ? WHERE id = ?').bind(String(id), Date.now(), x.post_id),
  ]);
  return true;
}
// One tap on "Helpful"; tap again to take it back. Not on your own reply.
async function replyHelpful(env, user, id) {
  communityOn(env); await commTables(env);
  const x = await env.DB.prepare('SELECT user_id, helpful FROM replies WHERE id = ?').bind(String(id)).first();
  if (!x) fail('Reply not found.');
  if (x.user_id === user.id) fail('You cannot mark your own reply as helpful.');
  const had = await env.DB.prepare('SELECT 1 AS y FROM chelp WHERE reply_id = ? AND user_id = ?').bind(String(id), user.id).first();
  if (had) await env.DB.batch([env.DB.prepare('DELETE FROM chelp WHERE reply_id = ? AND user_id = ?').bind(String(id), user.id), env.DB.prepare('UPDATE replies SET helpful = MAX(helpful - 1, 0) WHERE id = ?').bind(String(id))]);
  else await env.DB.batch([env.DB.prepare('INSERT OR IGNORE INTO chelp (reply_id, user_id) VALUES (?, ?)').bind(String(id), user.id), env.DB.prepare('UPDATE replies SET helpful = helpful + 1 WHERE id = ?').bind(String(id))]);
  const now = await env.DB.prepare('SELECT helpful FROM replies WHERE id = ?').bind(String(id)).first();
  return { helpful: now ? now.helpful : 0, voted: !had };
}
// The person who asked (or the admin) marks one reply as the best answer; tap it again to unmark.
async function postBest(env, user, r) {
  communityOn(env); await commTables(env);
  const p = await env.DB.prepare('SELECT user_id, best FROM posts WHERE id = ? AND deleted = 0').bind(String(r.postId || '')).first();
  if (!p) fail('Post not found.');
  if (p.user_id !== user.id && !user.admin) fail('Only the person who asked can choose the best answer.');
  const rep = await env.DB.prepare('SELECT id FROM replies WHERE id = ? AND post_id = ?').bind(String(r.replyId || ''), String(r.postId)).first();
  if (!rep) fail('Reply not found.');
  const best = p.best === rep.id ? '' : rep.id;
  await env.DB.prepare('UPDATE posts SET best = ?, updated_at = ? WHERE id = ?').bind(best, Date.now(), String(r.postId)).run();
  return { best };
}
// Anyone can report a post or reply. When COMM_HIDE_AT different students have reported it, it is hidden until the admin looks.
async function commReport(env, user, r) {
  communityOn(env); await commTables(env);
  const kind = r.kind === 'reply' ? 'reply' : 'post', id = String(r.id || '');
  const why = REPORT_WHY.indexOf(r.reason) >= 0 ? r.reason : 'Other';
  let postId = id, owner = '';
  if (kind === 'reply') { const x = await env.DB.prepare('SELECT post_id, user_id FROM replies WHERE id = ?').bind(id).first(); if (!x) fail('Reply not found.'); postId = x.post_id; owner = x.user_id; }
  else { const p = await env.DB.prepare('SELECT user_id FROM posts WHERE id = ? AND deleted = 0').bind(id).first(); if (!p) fail('Post not found.'); owner = p.user_id; }
  if (owner === user.id) fail('You cannot report your own post.');
  await env.DB.prepare('INSERT OR IGNORE INTO creports (kind, target, post_id, user_id, reason, at) VALUES (?, ?, ?, ?, ?, ?)').bind(kind, id, postId, user.id, why, Date.now()).run();
  const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM creports WHERE kind = ? AND target = ?').bind(kind, id).first();
  let hidden = false;
  if (c && c.n >= COMM_HIDE_AT) {
    hidden = true;
    await env.DB.batch([
      env.DB.prepare('UPDATE ' + (kind === 'post' ? 'posts' : 'replies') + ' SET hidden = 1 WHERE id = ?').bind(id),
      env.DB.prepare('UPDATE posts SET updated_at = ? WHERE id = ?').bind(Date.now(), postId),
    ]);
  }
  return { reported: true, hidden };
}
// "Has anyone answered my questions?" Counted from the time the student last opened Community.
async function commNotify(env, user, r) {
  communityOn(env); await commTables(env);
  const since = Math.max(Number(r.since) || 0, Date.now() - 14 * 86400000);
  const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM replies x JOIN posts p ON p.id = x.post_id WHERE p.user_id = ? AND p.deleted = 0 AND x.user_id != ? AND x.hidden = 0 AND x.created_at > ?').bind(user.id, user.id, Math.floor(since)).first();
  const np = await env.DB.prepare('SELECT COUNT(*) AS n FROM posts WHERE deleted = 0 AND hidden = 0 AND user_id != ? AND created_at > ?').bind(user.id, Math.floor(since)).first();
  return { n: c ? c.n : 0, posts: np ? np.n : 0 };
}
// ----- Admin: reports queue, pin, verified answers, mute -----
async function commReports(env, user) {
  requireAdmin(user); await commTables(env);
  const { results } = await env.DB.prepare(
    'SELECT c.kind, c.target, c.post_id, COUNT(*) AS n, GROUP_CONCAT(c.reason, \'|\') AS why, MAX(c.at) AS at FROM creports c GROUP BY c.kind, c.target ORDER BY MAX(c.at) DESC LIMIT 100').all();
  const items = [];
  for (const x of results) {
    let row;
    if (x.kind === 'post') row = await env.DB.prepare('SELECT id, user_id, author, title, body, hidden, anon, deleted FROM posts WHERE id = ?').bind(x.target).first();
    else row = await env.DB.prepare('SELECT id, user_id, author, body, hidden, anon FROM replies WHERE id = ?').bind(x.target).first();
    if (!row || row.deleted) continue;
    items.push({ kind: x.kind, id: x.target, postId: x.post_id, n: x.n, why: String(x.why || '').split('|'), at: x.at, uid: row.user_id, author: row.author, anon: !!row.anon, title: row.title || '', body: String(row.body || '').slice(0, 400), hidden: !!row.hidden });
  }
  return items;
}
async function commReview(env, user, r) { // restore (clears the reports) or delete
  requireAdmin(user); await commTables(env);
  const kind = r.kind === 'reply' ? 'reply' : 'post', id = String(r.id || '');
  if (r.op === 'delete') { if (kind === 'post') await postDelete(env, user, id); else await replyDelete(env, user, id); }
  else {
    const t = kind === 'post' ? 'posts' : 'replies';
    await env.DB.prepare('UPDATE ' + t + ' SET hidden = 0 WHERE id = ?').bind(id).run();
    const pid = kind === 'post' ? id : (await env.DB.prepare('SELECT post_id FROM replies WHERE id = ?').bind(id).first() || {}).post_id;
    if (pid) await env.DB.prepare('UPDATE posts SET updated_at = ? WHERE id = ?').bind(Date.now(), pid).run();
  }
  await env.DB.prepare('DELETE FROM creports WHERE kind = ? AND target = ?').bind(kind, id).run();
  return true;
}
async function commPin(env, user, r) {
  requireAdmin(user); await commTables(env);
  await env.DB.prepare('UPDATE posts SET pinned = ?, updated_at = ? WHERE id = ?').bind(r.pinned ? 1 : 0, Date.now(), String(r.id || '')).run();
  return true;
}
async function commVerify(env, user, r) {
  requireAdmin(user); await commTables(env);
  const x = await env.DB.prepare('SELECT post_id FROM replies WHERE id = ?').bind(String(r.id || '')).first();
  if (!x) fail('Reply not found.');
  await env.DB.batch([env.DB.prepare('UPDATE replies SET verified = ? WHERE id = ?').bind(r.on ? 1 : 0, String(r.id)), env.DB.prepare('UPDATE posts SET updated_at = ? WHERE id = ?').bind(Date.now(), x.post_id)]);
  return true;
}
async function commMute(env, user, r) {
  requireAdmin(user); await commTables(env);
  const id = String(r.userId || ''), days = Math.max(0, Math.min(365, Math.floor(Number(r.days) || 0)));
  const u = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
  if (!u) fail('That student was not found.');
  if (!days) { await env.DB.prepare('DELETE FROM cmute WHERE user_id = ?').bind(id).run(); return { until: 0 }; }
  const until = Date.now() + days * 86400000;
  await env.DB.prepare('INSERT INTO cmute (user_id, until) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET until = excluded.until').bind(id, until).run();
  return { until };
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
// Full-text index of the written notes, so searching the notes never scans every row and never uses Gemini.
let ftsState = 0; // 0 = not checked, 1 = ready, -1 = this database cannot do it (searching then falls back to a slower scan)
async function ftsReady(env) {
  if (ftsState) return ftsState === 1;
  try {
    const have = await env.DB.prepare("SELECT name FROM sqlite_master WHERE name = 'lib_fts'").first();
    if (!have) {
      await env.DB.prepare("CREATE VIRTUAL TABLE IF NOT EXISTS lib_fts USING fts5(note_id UNINDEXED, skey UNINDEXED, title, body, tokenize = 'unicode61 remove_diacritics 2')").run();
      await env.DB.prepare('INSERT INTO lib_fts (note_id, skey, title, body) SELECT note_id, key, title, body FROM lib_sections').run();
    }
    ftsState = 1;
  } catch (e) { ftsState = -1; console.error('FTS unavailable', e && e.message); }
  return ftsState === 1;
}
// Search should only see the words a student can read, never the codes behind the links
// (otherwise searching "act" or "const" would match the hidden code of every law link).
const MARK_SHOWN = /\{\{[ac]:[^|{}]*\|([^|{}]*?)(?:\|[^{}]*)?\}\}/g;
function ftsText(body) { return String(body || '').replace(MARK_SHOWN, '$1'); }
async function upsertSection(env, id, key, title, body) {
  await env.DB.prepare(
    'INSERT INTO lib_sections (note_id, key, title, body, updated_at) VALUES (?, ?, ?, ?, ?) ' +
    'ON CONFLICT(note_id, key) DO UPDATE SET title = excluded.title, body = excluded.body, updated_at = excluded.updated_at'
  ).bind(id, key, title, body, Date.now()).run();
  if (await ftsReady(env)) {
    try {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM lib_fts WHERE note_id = ? AND skey = ?').bind(id, key),
        env.DB.prepare('INSERT INTO lib_fts (note_id, skey, title, body) VALUES (?, ?, ?, ?)').bind(id, key, title, ftsText(body)),
      ]);
    } catch (e) { console.error('FTS update failed', e && e.message); }
  }
}
// Rows written before this change still hold the codes in the search index, and a snippet can start or stop
// in the middle of one, so every snippet is cleaned again before a student sees it.
function plainSnippet(s) {
  return String(s || '')
    .replace(MARK_SHOWN, '$1')
    .replace(/^[^{]*?\}\}/, '')
    .replace(/\{\{[^}]*$/, '…')
    .replace(/\s+/g, ' ').trim();
}
async function searchLib(env, r) {
  const words = String(r.q || '').toLowerCase().replace(/[^a-z0-9\s'-]/g, ' ').split(/\s+/).map((w) => w.replace(/['-]/g, '')).filter((w) => w.length > 1).slice(0, 6);
  if (!words.length || words.join('').length < 3) return [];
  let hits = [];
  if (await ftsReady(env)) {
    const m = words.map((w) => '"' + w + '"*').join(' AND ');
    hits = (await env.DB.prepare("SELECT note_id, skey, title, snippet(lib_fts, 3, '[[', ']]', '…', 14) AS sn FROM lib_fts WHERE lib_fts MATCH ? ORDER BY rank LIMIT 60").bind(m).all()).results;
  } else {
    const where = words.map(() => "lower(body) LIKE ? ESCAPE '\\'").join(' AND ');
    const rows = (await env.DB.prepare('SELECT note_id, key AS skey, title, body FROM lib_sections WHERE ' + where + ' LIMIT 60').bind(...words.map((w) => '%' + w.replace(/[%_\\]/g, '') + '%')).all()).results;
    hits = rows.map((x) => { const i = x.body.toLowerCase().indexOf(words[0]); return { note_id: x.note_id, skey: x.skey, title: x.title, sn: (i > 40 ? '…' : '') + x.body.slice(Math.max(0, i - 40), i + 100).replace(/\s+/g, ' ') + '…' }; });
  }
  if (!hits.length) return [];
  const ids = Array.from(new Set(hits.map((h) => h.note_id)));
  const ok = new Set((await env.DB.prepare("SELECT note_id FROM lib_notes WHERE status = 'complete' AND note_id IN (" + ids.map(() => '?').join(',') + ')').bind(...ids).all()).results.map((x) => x.note_id));
  const seen = new Set(), out = [];
  hits.forEach((h) => { if (ok.has(h.note_id) && !seen.has(h.note_id) && out.length < 20) { seen.add(h.note_id); out.push({ noteId: h.note_id, section: h.title, snippet: plainSnippet(h.sn).slice(0, 260) }); } });
  return out;
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
  if (!env.GEMINI_KEY) fail('This feature is not available right now. Please try again in a little while.');
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

// Optional own Gemini key for a group of calls (GEMINI_KEY_LAWS, GEMINI_KEY_CASES). Falls back to the main key if it is not set or fails.
async function geminiFor(env, name, prompt) {
  const own = env[name];
  if (own && own !== env.GEMINI_KEY) {
    try { return await gemini({ ...env, GEMINI_KEY: own }, prompt); } catch (e) { /* use the main key */ }
  }
  return gemini(env, prompt);
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
  if (!isFreeNote(id)) return; // paid notes are never copied to a public bucket
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
  STANDARD.forEach((e) => { const c = canonAuth(e[0], slug(e[1]), e[1]); const line = c ? c.type + ':' + c.id + ' = ' + c.name : ''; if (line && list.indexOf(line) < 0) list.push(line); });
  const text = ' Laws already in our library: ' + list.join('; ') + '. When you mean one of these laws, use EXACTLY its type, id and name in the marker. For any other law, write its full official name with the year.';
  libNamesCache = { at: Date.now(), text };
  return text;
}
// Review pass for written notes. It can only make the text safer: it may remove or soften doubtful authorities, never add new ones.
async function reviewBody(env, kind, title, body) {
  try {
    const prompt = 'You are a strict, senior Nigerian law lecturer checking a study note section titled "' + title + '" before it is sold to students. ' +
      'Read the text below. Fix or remove anything you are not certain is correct: a case that may not exist, a wrong or doubtful citation, a section number you are not sure of, a wrong court, a wrong holding, or a statement of law that is out of date. ' +
      'If a case or its citation is doubtful, delete just that detail (and its {{c:...}} marker) or replace the sentence with a general statement of the rule. If only a section number is doubtful, delete the number but keep the marker of the law itself with an empty Provision, such as {{a:act:evidence-act-2011|Evidence Act 2011|}}. Never add a new case, statute or section. ' +
      'Keep every other word, the structure, the bullet points and the {{c:...}} and {{a:...}} markers exactly as they are. Do not shorten the text by more than about one tenth. ' +
      'Return JSON only: {"body": "the full corrected text", "changes": ["one short line for each thing you changed"]}\n\nSECTION TEXT:\n' + body;
    const out = await geminiFor(env, 'GEMINI_KEY_REVIEW', prompt);
    let revised = normAuth(String(out && out.body || '').trim());
    const changes = (Array.isArray(out && out.changes) ? out.changes : []).length;
    // Only accept a review that is a complete section: it must not collapse the text.
    if (revised.length < body.length * 0.75 || revised.length < 200) return { done: false, changes: 0 };
    return { done: true, changes, body: revised };
  } catch (e) { return { done: false, changes: 0 }; }
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
    RULES + (await libNames(env)) + ' Aim for at least ' + (kind === 'course' ? '250' : (SEC_WORDS[def[0]] || 300)) + ' words. Return JSON only: {"body": "..."}';
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
  // Second pass: a different key reads the draft as a strict lecturer and removes or softens anything it doubts.
  let review = { done: false, changes: 0 };
  if (String(env.NOTE_REVIEW || '') !== 'off') review = await reviewBody(env, kind, def[1], body);
  body = review.body || body;
  const mk = await markBody(env, body); // safety net: every law that is named but not marked gets its marker
  body = mk.text;
  const label = clean(r.title || id, 150);
  await upsertSection(env, id, def[0], def[1], body);
  await registerCases(env, id, label, body);
  await registerAuth(env, id, label, body);
  const n = await refreshNote(env, id, { title: label, verified: false });
  await publishNote(env, id);
  return { key: def[0], status: n.status, score: n.score, reviewed: review.done, changes: review.changes, marked: mk.added };
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
  const out = await geminiFor(env, 'GEMINI_KEY_CASES', prompt);
  const ok = out.exists === true;
  await env.DB.prepare('UPDATE cases SET status = ?, data = ?, updated_at = ? WHERE case_id = ?')
    .bind(ok ? 'generated' : 'unverifiable', ok ? JSON.stringify(out) : '', Date.now(), id).run();
  const result = await caseGet(env, id);
  if (ok) await publishCase(env, id, result);
  return result;
}


// ---------- Authorities: constitution, statutes, court rules, treaties ----------
const AUTH_TYPES = { const: 'Constitution', act: 'Federal Acts', state: 'State laws', rule: 'Court rules', sub: 'Agency rules', eng: 'English law', intl: 'International', max: 'Maxims of Equity' };
const AUTH_RE = /\{\{a:([A-Za-z]+):([A-Za-z0-9-]+)\|([^|}]+)\|([^}]*)\}\}/g;
const AUTH_ID = /^auth:[a-z]+:[a-z0-9-]{1,100}(:[a-z0-9-]{1,40})?$/;
// Names that models write in different ways are folded into one shared page.
const CANON = [
  [/constitution.*(1999|federal republic)|1999 constitution/i, 'const', 'constitution-1999', 'Constitution of the Federal Republic of Nigeria'],
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
  [/maputo protocol|rights of women in africa/i, 'intl', 'maputo-protocol-on-the-rights-of-women-in-africa', "Protocol to the African Charter on Human and Peoples' Rights on the Rights of Women in Africa (Maputo Protocol)"],
  [/african charter on human.*ratification/i, 'act', 'african-charter-on-human-and-peoples-rights-ratification-and-enforcement-act', "African Charter on Human and Peoples' Rights (Ratification and Enforcement) Act"],
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
  return repairMarkers(String(body)).replace(AUTH_RE, (m, type, id, name, prov) => {
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
  if (/^\d/.test(key)) return 's. ' + key.replace(/[a-z]+$/, (x) => x.toUpperCase());
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
// ---------- Automatic law marking (no Gemini) ----------
// Gemini sometimes leaves the name of a law outside its marker, writes a marker a little wrong, or the review pass takes a marker away.
// These functions repair the markers and wrap every law that is named but not marked. They only put markers around words that are
// already there, so the wording never changes, and a marker that already exists is never touched.
const LW_CONNECT = new Set(['of', 'and', 'for', 'the', 'to', 'on', 'in', 'against', 'from', 'by', 'with', '&']);
const LW_PROSE = new Set(['of', 'and', 'for', 'to', 'on', 'in', 'against', 'from', 'by', 'with', '&']); // "X of the Evidence Act": the law's name starts after "the"
const LW_LEAD = new Set(('the a an this that these those such said under in by per see also and or but of to for from with at on as if where when while whereas thus hence however therefore because since although pursuant according via within without any every each both all some no its their his her our your my is are was were it he she they we you which who whose what before after during upon into than then so not now here there compare cf note notably namely especially particularly including like unlike despite though even only just still yet nor either neither whether once until unless').split(' '));
// Words that start a reference to a part of a law, never the name of a law: "Part IV of the ...", "Order 15 of the ..."
const LW_BREAK = new Set('section sections article articles order orders rule rules regulation regulations part parts chapter chapters schedule schedules paragraph paragraphs subsection subsections item items clause clauses para paras sub no nos cap s ss art arts reg regs act acts decree ordinance'.split(' '));
// A single word before "Act" that only describes it, as in "the principal Act" or "a wrongful Act".
const LW_GENERIC = new Set('principal enabling parent amending amendment repealed repealing said relevant impugned former new old current applicable federal state national general local statutory legislative executive judicial administrative parliamentary presidential governmental official private public ordinary special original subsequent earlier later amended consolidated enacting empowering specific particular such same other another first second third last next previous preceding following foregoing instant present existing proposed draft model uniform standard basic key main major minor sole only whole entire full partial total complete criminal wrongful unlawful illegal lawful tortious negligent voluntary involuntary overt guilty positive negative intervening speech locutionary illocutionary perlocutionary nigerian english british indian american'.split(' '));

// A law's name with the year, "Cap." number and "(as amended)" taken out, so the same law written two ways is found as one.
function lawNameKey(name) {
  return String(name || '').toLowerCase().replace(/&/g, ' and ')
    .replace(/\(\s*as\s+(?:amended|altered)[^)]*\)/g, ' ')
    .replace(/\bcap(?:ter)?\.?\s*[a-z]?\d+[a-z]?\b/g, ' ')
    .replace(/\b(?:laws? of the federation of nigeria|lfn)\b/g, ' ')
    .replace(/\b(?:1[5-9]|20)\d\d\b/g, ' ')
    .replace(/^\s*the\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
function lwClean(s) {
  return String(s).replace(/\s+/g, ' ').replace(/\s*,\s*((?:1[5-9]|20)\d\d)\b/, ' $1').replace(/\s+of\s+((?:1[5-9]|20)\d\d)\b/, ' $1').replace(/\s*\(\s*((?:1[5-9]|20)\d\d)\s*\)/, ' $1').trim();
}
// Reads the name of a law backwards from the word that ends it (Act, Rules, ...). `end` is where that word starts.
function lwStart(t, end) {
  let start = end;
  for (let i = 0; i < 18; i++) {
    if (start < 2 || t[start - 1] !== ' ') break;
    const p = start - 1; // the space in front of the part we have so far
    if (t[p - 1] === ')') { // a bracket in the name, such as (Prohibition, Prevention, etc.)
      const open = t.lastIndexOf('(', p - 1);
      if (open < 0 || p - open > 90 || !/^\([A-Z][A-Za-z'’\-,.& ]*\)$/.test(t.slice(open, p))) break;
      start = open;
      continue;
    }
    let q = p;
    while (q > 0 && /[A-Za-z'’\-&]/.test(t[q - 1])) q--;
    const w = t.slice(q, p);
    if (!w) break;
    const lw = w.toLowerCase();
    if (w === lw && LW_CONNECT.has(lw)) {
      if (lw === 'the') { // "of the", "and the", "under the" ...: what is in front of that belongs to the sentence, not to the name
        let r = q - 1, r0 = r;
        while (r0 > 0 && /[A-Za-z'’\-&]/.test(t[r0 - 1])) r0--;
        if (t[q - 1] === ' ' && LW_PROSE.has(t.slice(r0, r))) break;
      }
      start = q;
      continue;
    }
    if (!/^[A-Z]/.test(w) || w.length < 2 || LW_BREAK.has(lw) || LW_LEAD.has(lw) || /^[IVXLC]+$/.test(w)) break;
    start = q;
  }
  for (;;) { // a name never begins with "of the", "and" and the like
    const m = /^([A-Za-z'’\-&]+) /.exec(t.slice(start, end));
    if (!m || m[1] !== m[1].toLowerCase() || !LW_CONNECT.has(m[1])) break;
    start += m[0].length;
  }
  return start;
}
const LP_NUM = '\\d{1,4}[A-Za-z]?';
const LP_SUB = '(?:[ \\t]*\\([ \\t]*[A-Za-z0-9]{1,5}[ \\t]*\\))*';
const LP_ONE = '(?:(?:sections?|secs?\\.?|ss?\\.?)[ \\t]*' + LP_NUM + LP_SUB + '|(?:articles?|arts?\\.?)[ \\t]*' + LP_NUM + LP_SUB +
  '|order[ \\t]*\\d{1,3}[A-Za-z]?(?:[ \\t]*,?[ \\t]*rules?\\.?[ \\t]*\\d{1,3}[A-Za-z]?)?|rules?[ \\t]*\\d{1,3}[A-Za-z]?|reg(?:ulations?)?\\.?[ \\t]*\\d{1,3}[A-Za-z]?' +
  '|(?:the[ \\t]+)?(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\\d{1,2}(?:st|nd|rd|th))[ \\t]+schedule|schedule[ \\t]+\\d{1,2})';
const LP_BEFORE = new RegExp('(' + LP_ONE + ')[ \\t]*,?[ \\t]*(?:of|in|under)[ \\t]+(?:the[ \\t]+)?$', 'i');
const LP_AFTER = new RegExp('^(?:,[ \\t]*|[ \\t]+)(' + LP_ONE + ')', 'i');
const LP_AFTER_PAREN = new RegExp('^[ \\t]*\\([ \\t]*(' + LP_ONE + ')[ \\t]*\\)', 'i');
const LP_MORE = /^[ \t]*(?:,|and\b|&|to\b|[–—-])[ \t]*\d/i; // "ss. 84 and 85", "ss. 84-86": a list, so the law is linked and no single section
// "section 84 of the Evidence Act": the words in front of the law's name that say which provision is meant.
function lwProvBefore(t, s) {
  const from = Math.max(0, s - 110), pre = t.slice(from, s);
  const m = LP_BEFORE.exec(pre);
  if (!m) return null;
  const at = from + m.index;
  if (at > 0 && /[A-Za-z0-9]/.test(t[at - 1])) return null;
  const prov = m[1].replace(/\s+/g, ' ').trim();
  return parseProv(prov) ? { at, prov } : null;
}
// "Evidence Act 2011, s. 84" and "Evidence Act (s. 84)": the provision written after the name. A list or range of sections is left alone.
function lwProvAfter(t, e) {
  const rest = t.slice(e, e + 90);
  let m = LP_AFTER.exec(rest), paren = false;
  if (!m) { m = LP_AFTER_PAREN.exec(rest); paren = true; }
  if (!m) return null;
  if (!paren && LP_MORE.test(rest.slice(m[0].length))) return null;
  const prov = m[1].replace(/\s+/g, ' ').trim();
  return parseProv(prov) ? { end: e + m[0].length, prov } : null;
}
// Fixed phrases: a law that is usually named in a short or unusual way. null means the shared list of names (CANON) decides.
const LW_FIXED = [
  [/\bLand Use Decree(?:,?\s+1978)?/g, ['act', 'land-use-act', 'Land Use Act']],
  [/\bCriminal Code(?: Act)?(?!\s+(?:Law|of)\b)(?:,?\s+1916\b)?/g, ['act', 'criminal-code-act', 'Criminal Code Act'], 1],
  [/\bPenal Code Law\b(?:\s*\(Northern (?:States|Region|Nigeria)\))?(?:,?\s+(?:19|20)\d\d\b)?|\bPenal Code\b(?!\s*(?:Law\b|\(Northern))(?:,?\s+(?:19|20)\d\d\b)?/g, ['state', 'penal-code-law', 'Penal Code Law'], 1],
  [/\bRules of Professional Conduct(?: for Legal Practitioners)?(?:,?\s+20\d\d)?/g, ['rule', 'rules-of-professional-conduct-for-legal-practitioners', 'Rules of Professional Conduct for Legal Practitioners']],
  [/\bStatute of Frauds(?:,?\s+1677)?/g, ['eng', 'statute-of-frauds-1677', 'Statute of Frauds 1677']],
  [/\bOffences against the Person Act(?:,?\s+1861)?/g, ['eng', 'offences-against-the-person-act-1861', 'Offences against the Person Act 1861']],
  [/\b(?:United Nations Charter|Charter of the United Nations|UN Charter)\b/g, ['intl', 'charter-of-the-united-nations', 'Charter of the United Nations']],
  [/\bUniversal Declaration of Human Rights\b|\bUDHR\b/g, null],
  [/\bMaputo Protocol\b/g, null],
  [/\bVienna Convention on the Law of Treaties(?:,?\s+1969)?|\bVCLT\b/g, ['intl', 'vienna-convention-on-the-law-of-treaties-1969', 'Vienna Convention on the Law of Treaties 1969']],
  [/\bCAMA(?:,?\s+(?:19|20)\d\d)?\b/g, null],
  [/\bACJA(?:,?\s+2015)?\b/g, null],
  [/\bAfrican Charter(?: on Human and Peoples['’] Rights)?\b|\bACHPR\b|\bBanjul Charter\b/g, ['intl', 'african-charter-on-human-and-peoples-rights', "African Charter on Human and Peoples' Rights"]],
  [/\bInternational Covenant on Civil and Political Rights\b|\bICCPR\b/g, ['intl', 'international-covenant-on-civil-and-political-rights', 'International Covenant on Civil and Political Rights']],
  [/\bInternational Covenant on Economic, Social and Cultural Rights\b|\bICESCR\b/g, ['intl', 'international-covenant-on-economic-social-and-cultural-rights', 'International Covenant on Economic, Social and Cultural Rights']],
  [/\bStatute of the International Court of Justice\b|\bICJ Statute\b/g, ['intl', 'statute-of-the-international-court-of-justice', 'Statute of the International Court of Justice']],
  [/\bRome Statute(?: of the International Criminal Court)?\b/g, ['intl', 'rome-statute-of-the-international-criminal-court', 'Rome Statute of the International Criminal Court']],
  [/\bConvention on the Rights of the Child\b/g, ['intl', 'convention-on-the-rights-of-the-child', 'Convention on the Rights of the Child']],
  [/\bConvention on the Elimination of All Forms of Discrimination against Women\b|\bCEDAW\b/g, ['intl', 'convention-on-the-elimination-of-all-forms-of-discrimination-against-women', 'Convention on the Elimination of All Forms of Discrimination against Women']],
  [/\bUnited Nations Convention on the Law of the Sea\b|\bUNCLOS\b/g, ['intl', 'united-nations-convention-on-the-law-of-the-sea', 'United Nations Convention on the Law of the Sea']],
  [/\bMontevideo Convention(?: on the Rights and Duties of States)?\b/g, ['intl', 'montevideo-convention-on-the-rights-and-duties-of-states', 'Montevideo Convention on the Rights and Duties of States']],
  [/\bVienna Convention on Diplomatic Relations\b/g, ['intl', 'vienna-convention-on-diplomatic-relations', 'Vienna Convention on Diplomatic Relations']],
  [/\bVienna Convention on Consular Relations\b/g, ['intl', 'vienna-convention-on-consular-relations', 'Vienna Convention on Consular Relations']],
  [/\bConstitutive Act of the African Union\b/g, ['intl', 'constitutive-act-of-the-african-union', 'Constitutive Act of the African Union']],
  [/\bCFRN(?:,?\s+1999)?(?:\s*\((?:as\s+)?amended\))?/g, ['const', 'constitution-1999', 'Constitution of the Federal Republic of Nigeria']],
  [/\bConstitution of the Federal Republic of Nigeria(?:,?\s*\(?1999\)?)?(?:\s*\((?:as\s+)?(?:amended|altered)\))?/g, ['const', 'constitution-1999', 'Constitution of the Federal Republic of Nigeria']],
  [/\b1999 Constitution(?: of (?:the )?(?:Federal Republic of )?Nigeria)?(?:\s*\((?:as\s+)?amended\))?/g, ['const', 'constitution-1999', 'Constitution of the Federal Republic of Nigeria']],
  [/\bConstitution of Nigeria(?:,?\s*1999)?(?:\s*\((?:as\s+)?amended\))?/g, ['const', 'constitution-1999', 'Constitution of the Federal Republic of Nigeria']],
];
const LW_FOREIGN_ADJ = new Set('indian american ghanaian kenyan ugandan canadian australian irish scottish french german us u.s. u.s zambian tanzanian'.split(' '));
const LW_FOREIGN = /\b(?:United States|U\.S\.|USA|American|India|Indian|South Africa|Ghana|Kenya|Uganda|Tanzania|Zimbabwe|Zambia|Canada|Canadian|Australia|Australian|Britain|British|England|English|France|French|German|Germany|UK|Irish|Ireland|Brazil|Japan|Kenyan|Ghanaian)\b/;
// The word in front of a position: "" at the start of a line, otherwise the letters just before it.
function lwPrevWord(t, i) {
  let j = i;
  while (j > 0 && t[j - 1] === ' ') j--;
  if (j === i && i > 0 && t[i - 1] !== '\n') return '*';
  let k = j;
  while (k > 0 && /[A-Za-z0-9'’\-]/.test(t[k - 1])) k--;
  return t.slice(k, j);
}
// Every place in a text where a law is named, as { s, e, ... } ranges of the name itself (the provision is added later).
function lawMentions(t) {
  const out = [];
  let m;
  // 1. Names ending in Act, Law, Rules, Regulations, Decree or Ordinance
  const heads = /\b(Act|Law|Rules|Regulations|Decree|Ordinance)\b/g;
  while ((m = heads.exec(t)) !== null) {
    const head = m[1], hs = m.index;
    let start = lwStart(t, hs), eng = false;
    for (;;) { // "the English Sale of Goods Act 1979": the country is not part of the law's name
      const fm = /^([A-Za-z.]+) /.exec(t.slice(start, hs));
      if (!fm) break;
      const w = fm[1].toLowerCase();
      if (w === 'english' || w === 'british' || w === 'uk' || w === 'imperial') { eng = true; start += fm[0].length; continue; }
      if (LW_FOREIGN_ADJ.has(w)) start = hs; // another country's statute is not Nigerian law, so it is left alone
      break;
    }
    if (start >= hs) continue;
    const toks = t.slice(start, hs).trim().split(' ').filter((w) => !(LW_CONNECT.has(w) && w === w.toLowerCase()));
    if (!toks.length) continue;
    let end = hs + head.length, tail = false, year = 0;
    if (head === 'Law') {
      const tm = /^\s+of\s+(?:the\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+State\b/.exec(t.slice(end, end + 60));
      if (tm) { end += tm[0].length; tail = true; }
    }
    const rest = t.slice(end, end + 24);
    const ym = /^(?:,[ \t]*|[ \t]+)(?:of[ \t]+)?((?:1[5-9]|20)\d\d)(?!\d)/.exec(rest) || /^[ \t]*\([ \t]*((?:1[5-9]|20)\d\d)[ \t]*\)/.exec(rest);
    if (ym) { year = +ym[1]; end += ym[0].length; }
    const name = t.slice(start, hs);
    let type = '', ok = false;
    if (head === 'Act') {
      if (!year && /^\s+of\s+(?:the\s+)?[A-Z]/.test(t.slice(end, end + 40))) continue; // "Act of State", "Act of Parliament"
      ok = toks.length > 1 || !LW_GENERIC.has(toks[0].toLowerCase());
      type = eng || (year && year < 1900) ? 'eng' : 'act';
    } else if (head === 'Law') {
      ok = tail || !!year || (/\bState\b/.test(name) && toks.length > 2);
      type = 'state';
    } else if (head === 'Rules') {
      const court = /\b(?:Court|Procedure|Practice|Evidence|Enforcement)\b/.test(name);
      ok = (toks.length > 1 || !!year) && (court || !!year || /\b(?:Conduct|Arbitration)\b/.test(name));
      type = court ? 'rule' : 'sub';
    } else if (head === 'Regulations') {
      ok = toks.length > 1 || !!year;
      type = 'sub';
    } else { ok = !!year; type = 'act'; }
    if (ok) out.push({ s: start, e: end, type, text: t.slice(start, end) });
  }
  // 2. Fixed phrases and abbreviations
  LW_FIXED.forEach((f) => {
    f[0].lastIndex = 0;
    while ((m = f[0].exec(t)) !== null) {
      if (!m[0]) { f[0].lastIndex++; continue; }
      if (f[2]) { const pw = lwPrevWord(t, m.index); if (pw !== '' && pw !== '*' && /^[A-Z]/.test(pw) && !LW_LEAD.has(pw.toLowerCase()) && pw !== 'Nigerian') continue; }
      out.push({ s: m.index, e: m.index + m[0].length, text: m[0], fixed: f[1] || null, type: f[1] ? f[1][0] : 'act' });
    }
  });
  // 3. "the Constitution" on its own
  const cr = /\bConstitution\b/g;
  while ((m = cr.exec(t)) !== null) {
    const pw = lwPrevWord(t, m.index).toLowerCase();
    if (pw !== 'the' && pw !== 'nigerian') continue;
    const after = t.slice(m.index + 12, m.index + 60);
    if (/^\s+(?:Drafting|Review|Conference|Committee|Day|Reform|Amendment|Act\b|Bill\b)/.test(after)) continue;
    if (/^\s+of\s+/.test(after) && !/^\s+of\s+(?:the\s+)?(?:Federal\s+Republic\s+of\s+)?Nigeria/.test(after)) continue;
    const sentence = t.slice(Math.max(0, m.index - 160), m.index).split(/[.!?\n]/).pop();
    if (LW_FOREIGN.test(sentence) || LW_FOREIGN.test(t.slice(m.index, m.index + 60))) continue;
    out.push({ s: m.index, e: m.index + 12, text: 'Constitution', fixed: ['const', 'constitution-1999', 'Constitution of the Federal Republic of Nigeria'], type: 'const' });
  }
  return out;
}
// Works out which law a mention is: the shared list of names first, then the laws already in the library, then a new entry.
// The same law written with and without its year is one law; two different years of the same title are two laws.
const lwYear = (name) => { const y = /\b((?:1[5-9]|20)\d\d)\b/.exec(String(name || '')); return y ? +y[1] : 0; };
function lwResolve(c, idx) {
  if (c.fixed) return canonAuth(c.fixed[0], c.fixed[1], c.fixed[2]);
  const nm = lwClean(c.text);
  const probe = nm + ' ' + slug(nm).replace(/-/g, ' ');
  if (CANON.some((x) => x[0].test(probe))) return canonAuth(c.type, slug(nm), nm);
  const k = lawNameKey(nm), y = lwYear(nm);
  const list = (k && idx.get(k)) || [];
  const known = list.find((x) => x.year === y) || (y ? list.find((x) => !x.year) : (list.find((x) => !x.year) || list[0]));
  if (known) return canonAuth(known.type, known.id, known.name);
  const hit = canonAuth(c.type, slug(nm), nm);
  if (hit && k) { list.push({ type: hit.type, id: hit.id, name: hit.name, key: hit.key, year: y }); idx.set(k, list); }
  return hit;
}
// Wraps every law that is named but not marked. Returns the new text, how many markers were added and what they were.
function markLaws(text, idx) {
  const t = String(text);
  idx = idx || new Map();
  const prot = markerRanges(t);
  const inProt = (s, e) => prot.some((r) => s < r[1] && e > r[0]);
  const raw = lawMentions(t).filter((c) => c.e > c.s && !/[|{}\n]/.test(c.text) && !inProt(c.s, c.e));
  raw.sort((a, b) => (b.e - b.s) - (a.e - a.s) || a.s - b.s); // the longest name wins when two overlap
  const keep = [];
  raw.forEach((c) => { if (!keep.some((k) => c.s < k.e && c.e > k.s)) keep.push(c); });
  keep.sort((a, b) => a.s - b.s);
  const done = [];
  keep.forEach((c, i) => {
    const hit = lwResolve(c, idx);
    if (!hit) return;
    let s = c.s, e = c.e, prov = '';
    const prevEnd = i ? keep[i - 1].e : 0, nextStart = i + 1 < keep.length ? keep[i + 1].s : t.length;
    const pb = lwProvBefore(t, c.s);
    if (pb && pb.at >= prevEnd && !inProt(pb.at, c.e)) { s = pb.at; prov = pb.prov; }
    else {
      const pa = lwProvAfter(t, c.e);
      if (pa && pa.end <= nextStart && !inProt(c.e, pa.end)) { e = pa.end; prov = pa.prov; }
    }
    if (/[|{}\n]/.test(t.slice(s, e)) || /[|{}]/.test(prov)) return;
    done.push({ s, e, hit, prov });
  });
  let out = t;
  for (let i = done.length - 1; i >= 0; i--) {
    const d = done[i];
    out = out.slice(0, d.s) + '{{a:' + d.hit.type + ':' + d.hit.id + '|' + t.slice(d.s, d.e) + '|' + d.prov + '}}' + out.slice(d.e);
  }
  return { text: out, added: done.length, items: done.map((d) => ({ text: t.slice(d.s, d.e), prov: d.prov, key: d.hit.key })) };
}
// The laws already in the library, by name, so a law that is already there is never added a second time under another spelling.
async function lawIndex(env) {
  const idx = new Map();
  try {
    const rows = (await env.DB.prepare("SELECT case_id, name FROM cases WHERE case_id LIKE 'auth:%' AND case_id NOT LIKE 'auth:%:%:%' ORDER BY updated_at DESC LIMIT 3000").all()).results;
    rows.forEach((x) => {
      const p = String(x.case_id).split(':'), k = lawNameKey(x.name);
      if (!k || p.length !== 3) return;
      const list = idx.get(k) || [];
      list.push({ type: p[1], id: p[2], name: x.name, key: x.case_id, year: lwYear(x.name) });
      idx.set(k, list);
    });
  } catch (e) { /* the safety net must never stop a note from being saved */ }
  return idx;
}
async function markBody(env, body, idx) {
  try { return markLaws(body, idx || await lawIndex(env)); }
  catch (e) { console.error('law marking skipped', e && e.message); return { text: String(body), added: 0, items: [] }; }
}
// Puts a marker that Gemini wrote slightly wrong right, and takes the curly brackets off anything that cannot be repaired,
// so a student never sees {{ }} on the screen.
const MK_TYPE = { constitution: 'const', constitutions: 'const', acts: 'act', statute: 'act', statutes: 'act', law: 'act', laws: 'act', states: 'state', rules: 'rule', court: 'rule', regulation: 'sub', regulations: 'sub', agency: 'sub', english: 'eng', treaty: 'intl', treaties: 'intl', international: 'intl', convention: 'intl' };
function repairMarkers(body) {
  let s = String(body);
  if (s.indexOf('{{') < 0) return s;
  s = s.replace(/\{\{[ \t]*a[ \t]*:[ \t]*([^{}|]*?)[ \t]*\|[ \t]*([^{}|]+?)[ \t]*(?:\|([^{}]*?))?\}\}/gi, (m, head, name, prov) => {
    const parts = head.split(':').map((x) => x.trim());
    const t0 = parts[0].toLowerCase();
    const fix = (x) => (AUTH_TYPES[x] ? x : (MK_TYPE[x] || ''));
    let type = 'act', idRaw = '';
    if (parts.length === 1) { if (fix(t0)) type = fix(t0); else idRaw = parts[0]; }
    else { type = fix(t0) || 'act'; idRaw = parts.slice(1).join('-'); }
    const nm = name.trim();
    return '{{a:' + type + ':' + (slug(idRaw) || slug(nm) || 'law') + '|' + nm + '|' + String(prov || '').replace(/\|/g, ' ').trim() + '}}';
  });
  s = s.replace(/\{\{[ \t]*c[ \t]*:[ \t]*([^{}|]*?)[ \t]*\|[ \t]*([^{}|]+?)[ \t]*(?:\|([^{}]*?))?\}\}/gi, (m, idRaw, name, cit) => {
    const nm = name.trim();
    return '{{c:' + (slug(idRaw) || slug(nm) || 'case') + '|' + nm + '|' + String(cit || '').replace(/\|/g, ' ').trim() + '}}';
  });
  return s.replace(/\{\{([^{}]*)\}\}/g, (m, inner) => {
    if (/^[ac]:[a-z0-9-]+(?::[a-z0-9-]+)?\|[^|]+\|/.test(inner)) return m;
    const f = inner.split('|');
    return (f.length > 1 ? f[1] : f[0].replace(/^[ac]\s*:\s*(?:[a-z]+\s*:\s*)?/i, '')).trim();
  });
}

function authId(id) { const s = String(id || ''); if (!AUTH_ID.test(s)) fail('Unknown authority.'); return aliasResolve(s); }
// One shared collator: calling localeCompare with options builds a new one every time, which is slow when a law has hundreds of sections.
const NATURAL_ORDER = new Intl.Collator('en', { numeric: true });
function natural(a, b) { if (a === 'preamble' || b === 'preamble') return a === b ? 0 : a === 'preamble' ? -1 : 1; return NATURAL_ORDER.compare(a, b); }
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
    const law = await env.DB.prepare('SELECT case_id, name, status, data FROM cases WHERE case_id = ?').bind(lawId).first();
    let lawCur = null;
    try { lawCur = law && law.data ? (JSON.parse(law.data).currency || null) : null; } catch (e) { lawCur = null; }
    const subs = [...new Set(cited.map((x) => (parseProv(x.prov) || {}).sub).filter(Boolean))].slice(0, 30);
    return { id: c.case_id, kind: 'section', type: parts[1], key: parts[3], label: keyLabel(parts[3]), name: c.name, status: c.status, data, citedIn: cited.slice(-60), subsCited: subs, law: law ? { id: law.case_id, name: law.name, status: law.status, currency: lawCur } : null };
  }
  // The database picks out the few facts the contents list needs, so the Worker does not have to read every section's full text (the Constitution is about half a megabyte).
  // json_valid guards the rows that are still empty (cited but not written).
  const { results } = await env.DB.prepare(
    "SELECT case_id, status, " +
    "CASE WHEN json_valid(data) THEN json_extract(data, '$.heading') END AS heading, " +
    "CASE WHEN json_valid(data) THEN (COALESCE(json_extract(data, '$.official'), 0) = 1 AND (COALESCE(length(json_extract(data, '$.text')), 0) > 0 OR COALESCE(json_array_length(data, '$.subs'), 0) > 0)) ELSE 0 END AS hastext, " +
    "CASE WHEN json_valid(data) THEN COALESCE(length(json_extract(data, '$.summary')), 0) > 0 ELSE 0 END AS expl, " +
    "CASE WHEN json_valid(data) THEN COALESCE(length(json_extract(data, '$.gap')), 0) > 0 ELSE 0 END AS gap, " +
    "CASE WHEN json_valid(cited_in) THEN json_array_length(cited_in) ELSE 0 END AS n " +
    "FROM cases WHERE case_id > ? AND case_id < ? LIMIT 1500"
  ).bind(id + ':', id + ':￿').all();
  const sections = results.map((x) => {
    const key = x.case_id.split(':')[3];
    return { id: x.case_id, key, label: keyLabel(key), heading: typeof x.heading === 'string' ? x.heading : '', status: x.status, count: Number(x.n) || 0, hasText: !!x.hastext, expl: !!x.expl, gap: !!x.gap };
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
  let kind = '', num = '', rl = '', sub = '';
  const SUBTOK = /^(?:\([a-z0-9]{1,5}\))+$/;
  const name = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i], prev = toks[i - 1] || '';
    const n = /^(\d{1,4}[a-z]?)(\(.*)?$/.exec(t);
    // A bare 4-digit number looks like a year ("evidence act 2011"), but "254A" is a section number: count the digits only.
    if (n && !num && (n[1].replace(/[a-z]$/, '').length <= 3 || SEARCH_WORDS.has(prev))) {
      num = n[1];
      if (n[2] && SUBTOK.test(n[2])) sub = n[2];
      else if (!n[2] && SUBTOK.test(toks[i + 1] || '')) { sub = toks[i + 1]; i += 1; } // "36 (1)(a)" typed with a space
      kind = ({ art: 'art', article: 'art', articles: 'art', order: 'o', o: 'o', rule: 'r', r: 'r', reg: 'reg', regulation: 'reg' })[prev] || '';
      if (kind === 'o' && /^r(ule)?$/.test(toks[i + 1] || '') && /^\d{1,3}[a-z]?$/.test(toks[i + 2] || '')) { rl = toks[i + 2]; i += 2; }
    } else if (!SEARCH_WORDS.has(t) && t.length > 1) name.push(t.replace(/[^a-z0-9]/g, ''));
  }
  const words = name.filter(Boolean).slice(0, 5);
  const keys = !num ? [] : kind === 'art' ? ['art-' + num] : kind === 'o' ? ['o' + num + (rl ? 'r' + rl : '')] : kind === 'r' ? ['r' + num] : kind === 'reg' ? ['reg-' + num] : [num, 'art-' + num];
  const out = { laws: [], sections: [], sub: '' };
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
    if (kind !== 'o' && kind !== 'r' && kind !== 'reg') out.sub = sub; // a rule or order has no subsections in this sense
  }
  return out;
}
// The admin says whether a law is still the current text. Gemini is never trusted for this.
const CURRENCY = ['In force', 'Amended', 'Repealed', 'Superseded'];
async function lawCurrency(env, r) {
  const id = authId(String(r.id || ''));
  if (id.split(':').length !== 3) fail('Choose a law, not a section.');
  const row = await env.DB.prepare('SELECT status, data FROM cases WHERE case_id = ?').bind(id).first();
  if (!row) fail('Law not found.');
  const state = CURRENCY.indexOf(String(r.state)) >= 0 ? String(r.state) : '';
  let d = {};
  try { d = row.data ? JSON.parse(row.data) : {}; } catch (e) { d = {}; }
  if (r.year !== undefined) { const y = clean(r.year, 20); if (y) { d.year = y; d.yearSource = 'admin'; } else { delete d.year; delete d.yearSource; } }
  if (!state) delete d.currency;
  else d.currency = { state, note: clean(r.note, 400), asAt: clean(r.asAt, 40), at: Date.now() };
  await env.DB.prepare("UPDATE cases SET data = ?, status = CASE WHEN status IN ('cited','unverifiable') THEN 'generated' ELSE status END, updated_at = ? WHERE case_id = ?").bind(JSON.stringify(d), Date.now(), id).run();
  return authGet(env, id);
}
// Removes every law except the Constitution (the admin asked for a clean library). Notes and cases are not touched.
async function purgeLaws(env, r) {
  if (String(r.confirm) !== 'DELETE') fail('Type DELETE to confirm.');
  const keep = 'auth:const:constitution-1999';
  const before = await env.DB.prepare("SELECT COUNT(*) AS n FROM cases WHERE case_id LIKE 'auth:%' AND case_id != ? AND case_id NOT LIKE ?").bind(keep, keep + ':%').first();
  await env.DB.prepare("DELETE FROM cases WHERE case_id LIKE 'auth:%' AND case_id != ? AND case_id NOT LIKE ?").bind(keep, keep + ':%').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS law_alias ( from_key TEXT PRIMARY KEY, to_key TEXT NOT NULL, to_name TEXT NOT NULL )').run();
  await env.DB.prepare('DELETE FROM law_alias WHERE to_key != ?').bind(keep).run();
  const NAME = 'Constitution of the Federal Republic of Nigeria';
  await env.DB.prepare('UPDATE cases SET name = ? WHERE case_id = ?').bind(NAME, keep).run();
  const { results } = await env.DB.prepare('SELECT case_id FROM cases WHERE case_id LIKE ?').bind(keep + ':%').all();
  const stmts = results.map((x) => env.DB.prepare('UPDATE cases SET name = ? WHERE case_id = ?').bind(NAME + ', ' + keyLabel(x.case_id.split(':')[3]), x.case_id));
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
  ALIASES.clear(); aliasAt = 0; libNamesCache = { at: 0, text: '' };
  return { removed: before ? before.n : 0, kept: 1 + results.length };
}
async function genAuth(env, id) {
  id = authId(id);
  if (isSecId(id)) return genAuthSec(env, id);
  const row = await env.DB.prepare('SELECT case_id, name FROM cases WHERE case_id = ?').bind(id).first();
  if (!row) fail('Authority not found.');
  const type = id.split(':')[1];
  if (type === 'max') fail('The Maxims of Equity are written for you. Use "Add the Maxims of Equity" on the Statutes page to add or refresh them.');
  const prompt = 'You are an experienced Nigerian law lecturer. Give a SHORT overview of this legal authority for law students: "' + row.name + '" (' + (AUTH_TYPES[type] || 'Law') + '). ' +
    'Set "exists" to true ONLY if you are certain this law or instrument exists with this name. If you are not certain, set "exists" to false and leave the other fields empty. ' +
    'Never invent details. If you are unsure of something, write "Not confirmed" for it. Do not quote the text. ' +
    'Return JSON only: {"exists": boolean, "officialTitle": string, "year": string, "jurisdiction": "Federal" | "State" | "International" | "England" | "Not confirmed", ' +
    '"inForce": "In force" | "Amended" | "Repealed" | "Not confirmed", "overview": string (two or three sentences: what the law is about and what it is used for)}';
  const out = await geminiFor(env, 'GEMINI_KEY_LAWS', prompt);
  const ok = out.exists === true;
  const data = ok ? { officialTitle: clean(out.officialTitle, 200), year: clean(out.year, 20), jurisdiction: clean(out.jurisdiction, 40), inForce: clean(out.inForce, 40), overview: clean(out.overview, 700) } : '';
  if (ok) {
    const cur = await env.DB.prepare('SELECT data FROM cases WHERE case_id = ?').bind(id).first();
    let prev = {};
    try { prev = cur && cur.data ? JSON.parse(cur.data) : {}; } catch (e) { prev = {}; }
    if (prev.complete) data.complete = true;
    if (prev.groups) data.groups = prev.groups;
    if (prev.currency) data.currency = prev.currency;
    if (prev.year && (prev.yearSource === 'listed' || prev.yearSource === 'admin')) { data.year = prev.year; data.yearSource = prev.yearSource; }
  }
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
  if (offText && !offText.text && !(offText.subs || []).length) fail('This provision has no official text yet, so there is nothing to explain. Load its text first.');
  const prompt = offText
    ? 'You are an experienced Nigerian law lecturer. Explain ONE provision for law students: ' + label + ' of "' + law.name + '". Here is its OFFICIAL TEXT:\n"""\n' + (offText.text + '\n' + (offText.subs || []).map((x) => x.ref + ' ' + x.text).join('\n')).slice(0, 7000) + '\n"""\n' +
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
  const out = await geminiFor(env, 'GEMINI_KEY_LAWS', prompt);
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
const STANDARD = [['const', 'Constitution of the Federal Republic of Nigeria']];

// Year each law was first enacted or signed, where it is certain. Laws not listed here get their year from the admin or the overview.
const LAW_YEARS = { 'Constitution of the Federal Republic of Nigeria': 1999 };
async function insertLaw(env, key, name) {
  const r = await env.DB.prepare("INSERT INTO cases (case_id, name, citation, status, data, cited_in, updated_at) VALUES (?, ?, '', 'cited', '', '[]', ?) ON CONFLICT(case_id) DO NOTHING").bind(key, name, Date.now()).run();
  return r;
}
async function addStandard(env) {
  const have = new Map((await env.DB.prepare("SELECT case_id, data FROM cases WHERE case_id LIKE 'auth:%' AND case_id NOT LIKE 'auth:%:%:%'").all()).results.map((x) => [x.case_id, x.data]));
  const stmts = [];
  let added = 0, dated = 0;
  const seen = new Set();
  STANDARD.forEach((e) => {
    const c = canonAuth(e[0], slug(e[1]), e[1]);
    if (!c || seen.has(c.key)) return;
    seen.add(c.key);
    const yr = LAW_YEARS[e[1]] ? String(LAW_YEARS[e[1]]) : '';
    if (have.has(c.key)) {
      if (!yr) return;
      let d = {};
      try { d = have.get(c.key) ? JSON.parse(have.get(c.key)) : {}; } catch (x) { d = {}; }
      if (d.year) return;
      d.year = yr; d.yearSource = 'listed';
      dated++;
      stmts.push(env.DB.prepare('UPDATE cases SET data = ? WHERE case_id = ?').bind(JSON.stringify(d), c.key));
      return;
    }
    added++;
    if (yr) dated++;
    stmts.push(env.DB.prepare("INSERT INTO cases (case_id, name, citation, status, data, cited_in, updated_at) VALUES (?, ?, '', 'cited', ?, '[]', ?) ON CONFLICT(case_id) DO NOTHING").bind(c.key, c.name, yr ? JSON.stringify({ year: yr, yearSource: 'listed' }) : '', Date.now()));
  });
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
  return { added, dated, total: STANDARD.length };
}
// The Maxims of Equity: each one is its own entry. The explanations below are written for students in plain words by the app, not by Gemini.
// They are shown as "Not yet verified" until the admin checks them against a textbook and marks them Verified. No case names are given, so nothing here can be a wrong citation.
const MAXIMS = [
  ['Equity will not suffer a wrong to be without a remedy', 'Where someone has been wronged and the common law gives no proper remedy, equity looks for a way to help.', 'It explains why equity grew up beside the common law: trusts, injunctions and specific performance all came from filling gaps. It is a guiding idea, not a promise that every wrong can be put right, because equity still works within its own rules.', 'Do not say it gives a remedy for every wrong. Say it is the reason equity steps in where the law is silent or too weak.'],
  ['Equity follows the law', 'Equity does not set the law aside. It respects legal rules and legal rights, and only softens their harshness where fairness clearly requires it.', 'Equity often copies legal rules by analogy, for example by applying time limits that exist for similar legal claims, and it treats equitable interests in land in ways that mirror legal ones.', 'Pair it with the next maxim: equity follows the law, but where a legal rule would be used unfairly, equity may step in.'],
  ['Where there is equal equity, the law shall prevail', 'If two people have equally strong claims in fairness, the person who holds the legal title wins.', 'It is the basis of the rule that a buyer who gives value and has no notice of an earlier equitable interest takes the property free of it. The legal owner has the stronger position because nothing tips the balance in favour of the other side.', 'Use it for priority disputes between a legal owner and an earlier equitable owner. Check that the buyer paid value and had no notice.'],
  ['Where the equities are equal, the first in time shall prevail', 'If two equitable claims are equally strong, the one created first ranks first.', 'It orders competing equitable interests over the same property. The rule gives way if the earlier owner behaved badly, for example by fraud or serious carelessness that let the later owner be misled.', 'State the rule and then ask whether anything in the facts, such as fraud or carelessness, takes away the first claimant’s advantage.'],
  ['He who seeks equity must do equity', 'A person who asks for equitable help must be prepared to act fairly towards the other side.', 'The court may make its relief depend on the claimant doing what is fair, for example repaying money received or giving up an unfair advantage, before the claimant gets the order asked for.', 'This is about what the claimant must do in the future, to put things right. Do not confuse it with the clean hands maxim, which is about past conduct.'],
  ['He who comes into equity must come with clean hands', 'A claimant who has behaved badly in the very matter in dispute may be refused equitable relief.', 'The misconduct must be connected closely to the claim itself. Unrelated bad behaviour does not count. It can bar remedies such as injunctions and specific performance, which the court gives at its own discretion.', 'Show the link between the misconduct and the claim. The comparison with “he who seeks equity must do equity” often earns marks.'],
  ['Delay defeats equities', 'A claimant who waits too long before asking for equitable relief may lose the right to it.', 'Called laches. There is no fixed period. The court asks how long the delay was, whether the other side was harmed by it, and whether the claimant seemed to accept the situation. It is different from a statutory limitation period, which is a fixed time limit.', 'Name laches and acquiescence, and explain that prejudice to the defendant matters more than the length of the delay alone.'],
  ['Equality is equity', 'Where several people have equal claims to something and there is no reason to prefer one, equity divides it equally.', 'It is used, for example, when co-owners or beneficiaries have no agreed shares, or when a fund is too small to pay everyone and each must bear the loss fairly. It gives way when the facts show that shares were meant to be unequal.', 'Mention that the maxim yields to evidence of different contributions or a different intention.'],
  ['Equity looks to the intent rather than the form', 'Equity cares about what the parties really meant, not the words or the technical shape they used.', 'The clearest example is the mortgage. A deal that is made to look like an outright sale but was meant only as security is treated as a mortgage, and the borrower keeps the right to redeem.', 'Use it when a document looks one way but the real purpose is different. The mortgage example is the classic one.'],
  ['Equity looks on that as done which ought to be done', 'If a person is bound to do something, equity treats it as already done, as long as equity would enforce it.', 'It explains why a contract for the sale of land that can be specifically enforced gives the buyer an equitable interest straight away, and why an agreement for a lease that can be enforced is treated in equity as if the lease had been granted.', 'It only applies where the obligation is one equity would enforce by specific performance. State that condition.'],
  ['Equity imputes an intention to fulfil an obligation', 'If a person who owes a duty does something that could be read as meeting it, equity presumes the act was meant to meet that duty.', 'It is the root of the doctrines of satisfaction and performance. A debtor who later gives the creditor a gift of the same sort may be taken to have been paying the debt rather than being generous. The presumption can be rebutted by evidence of a different intention.', 'Remember that it is only a presumption. Look for facts that show a different intention.'],
  ['Equity acts in personam', 'Equity operates on the person of the defendant, not directly on the property.', 'An equitable order is addressed to the defendant and is enforced by contempt of court. This is why a court can order a defendant who is within its reach to deal with land or property that lies elsewhere, though it does not change the title itself.', 'Contrast it with the common law, which usually operates on the property or title. Mention contempt as the way orders are enforced.'],
  ['Equity will not assist a volunteer', 'Equity will not enforce a promise for which nothing has been given in return.', 'A volunteer is someone who has given no value. For example, equity will not force a person to carry out a gratuitous promise to create a trust. Marriage is treated as valuable consideration, which gives an exception for a spouse and the children of the marriage.', 'Define “volunteer” first. It simply means someone who has not given value, not someone who works for free.'],
  ['Equity will not perfect an imperfect gift', 'If a gift has not been properly completed in the way the law requires, equity will not step in and finish it.', 'The giver must do everything needed to transfer the property. There are well-known ways around the rule, including where the giver has done everything in his power, a gift made in contemplation of death, the rule in Strong v Bird, and proprietary estoppel.', 'List the exceptions and check each one against the facts. Do not treat an unfinished gift as a trust by itself.'],
  ['Equity will not permit a statute to be used as an instrument of fraud', 'A person cannot hide behind a legal formality in order to cheat someone.', 'Where a statute requires writing or another formality, equity may still enforce an obligation that was clearly agreed if relying on the formality would allow a fraud. Secret trusts and some trusts that were never put in writing are explained in this way.', 'Say that equity does not overrule the statute. It stops the person from relying on it dishonestly.'],
  ['Equity will not allow a trust to fail for want of a trustee', 'A valid trust does not fail just because there is no trustee, or the trustee has died or refuses to act.', 'The court can appoint a new trustee, or the legal owner of the property is treated as holding it on trust. What matters is that the trust itself is valid and the intention to create it is clear.', 'It does not save a trust that is invalid for another reason, such as uncertainty. Check the basics first.'],
];
// Adds the Maxims of Equity (or refreshes the wording of ones the admin has not verified yet). Verified entries are never touched.
async function addMaxims(env) {
  const have = new Map((await env.DB.prepare("SELECT case_id, status, data FROM cases WHERE case_id LIKE 'auth:max:%' AND case_id NOT LIKE 'auth:max:%:%'").all()).results.map((x) => [x.case_id, x]));
  const stmts = [];
  let added = 0, updated = 0;
  const now = Date.now();
  MAXIMS.forEach((m) => {
    const c = canonAuth('max', slug(m[0]), m[0]);
    const data = JSON.stringify({ officialTitle: m[0], overview: m[1], use: m[2], tip: m[3], prepared: true, maxim: true });
    const cur = have.get(c.key);
    if (!cur) { added++; stmts.push(env.DB.prepare("INSERT INTO cases (case_id, name, citation, status, data, cited_in, updated_at) VALUES (?, ?, '', 'generated', ?, '[]', ?) ON CONFLICT(case_id) DO NOTHING").bind(c.key, c.name, data, now)); return; }
    if (cur.status === 'verified' || cur.data === data) return;
    updated++;
    stmts.push(env.DB.prepare("UPDATE cases SET name = ?, status = 'generated', data = ?, updated_at = ? WHERE case_id = ?").bind(c.name, data, now, c.key));
  });
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
  return { added, updated, total: MAXIMS.length };
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
  else await env.DB.prepare('UPDATE cases SET name = ? WHERE case_id = ? AND name != ?').bind(c.name, c.key, c.name).run();
  let hasOv = false;
  try { hasOv = !!(law && law.data && JSON.parse(law.data).overview); } catch (e) { hasOv = false; }
  // A file that says "replace": true is an updated edition of a law already here: its details replace the old ones,
  // but anything else saved on the law (its contents groups, Gemini overview parts, an admin-set year) is kept.
  const replace = !!(m && m.replace === true && law);
  if (replace) {
    let d = {};
    try { d = law.data ? JSON.parse(law.data) || {} : {}; } catch (e) { d = {}; }
    const before = JSON.stringify([d.officialTitle, d.year, d.jurisdiction, d.inForce, d.overview, d.currency && d.currency.state, d.currency && d.currency.note, d.currency && d.currency.asAt]);
    if (clean(m.officialTitle, 200)) d.officialTitle = clean(m.officialTitle, 200);
    if (clean(m.year, 20) && d.yearSource !== 'admin') d.year = clean(m.year, 20);
    if (clean(m.jurisdiction, 40)) d.jurisdiction = clean(m.jurisdiction, 40);
    if (clean(m.inForce, 40)) d.inForce = clean(m.inForce, 40);
    if (clean(m.overview, 700)) d.overview = clean(m.overview, 700);
    if (m.currency && CURRENCY.indexOf(String(m.currency.state)) >= 0) d.currency = { state: String(m.currency.state), note: clean(m.currency.note, 600), asAt: clean(m.currency.asAt, 40), at: Date.now() };
    const after = JSON.stringify([d.officialTitle, d.year, d.jurisdiction, d.inForce, d.overview, d.currency && d.currency.state, d.currency && d.currency.note, d.currency && d.currency.asAt]);
    const st = law.status === 'cited' || law.status === 'unverifiable' || before !== after ? 'generated' : law.status;
    await env.DB.prepare('UPDATE cases SET status = ?, data = ?, updated_at = ? WHERE case_id = ?').bind(st, JSON.stringify(d), now, c.key).run();
  } else if (!law || law.status === 'cited' || law.status === 'unverifiable' || (m && !hasOv)) {
    const d = { officialTitle: clean(m && m.officialTitle, 200) || c.name, year: clean(m && m.year, 20), jurisdiction: clean(m && m.jurisdiction, 40), inForce: clean(m && m.inForce, 40), overview: clean(m && m.overview, 700) };
    if (m && m.currency && CURRENCY.indexOf(String(m.currency.state)) >= 0) d.currency = { state: String(m.currency.state), note: clean(m.currency.note, 600), asAt: clean(m.currency.asAt, 40), at: Date.now() };
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
    // Each item may also carry "removed": words an amendment took out of it (kept for reference, never shown as live text).
    const subs = (Array.isArray(x.subs) ? x.subs : []).slice(0, 300).map((y) => ({ ref: clean(y && y.ref, 200), text: clean(y && y.text, 12000), h: !!(y && y.h), removed: (Array.isArray(y && y.removed) ? y.removed : []).slice(0, 4).map((z) => clean(z, 600)).filter(Boolean) }))
      .filter((y) => y.ref && (y.text || y.h || y.removed.length))
      .map((y) => { const o = y.h ? { ref: y.ref, text: y.text, h: true } : { ref: y.ref, text: y.text }; if (y.removed.length) o.removed = y.removed; return o; });
    // Notes about how the provision was changed, words that were removed from it, and a notice when part of it could not be loaded.
    const amendments = (Array.isArray(x.amendments) ? x.amendments : []).slice(0, 20).map((a) => clean(a, 400)).filter(Boolean);
    const removed = (Array.isArray(x.removed) ? x.removed : []).slice(0, 10).map((z) => ({ sub: clean(z && z.sub, 40), text: clean(z && z.text, 3000) })).filter((z) => z.text);
    const gap = clean(x.gap, 600);
    if (!text && !subs.length && !gap) return;
    rows.push({ id: c.key + ':' + key, key, heading: clean(x.heading, 200), text, subs, amendments, removed, gap });
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
    // Same official text as before: nothing about the explanation or the Verified mark changes.
    const same = !!prev.official && JSON.stringify([prev.text || '', prev.subs || []]) === JSON.stringify([x.text, x.subs]);
    // Changed text in a provision that an amendment touched: the old explanation may no longer be right, so it is dropped (and must be written and verified again).
    const stale = !!prev.official && !same && (x.amendments.length > 0 || x.removed.length > 0 || x.subs.some((y) => y.removed));
    const d = { heading: x.heading || prev.heading || '', text: x.text, subs: x.subs, official: true, summary: stale ? '' : (prev.summary || ''), subsections: [], subsectionsComplete: false, examTip: stale ? '' : (prev.examTip || '') };
    if (x.amendments.length) d.amendments = x.amendments;
    if (x.removed.length) d.removed = x.removed;
    if (x.gap) d.gap = x.gap;
    return env.DB.prepare("INSERT INTO cases (case_id, name, citation, status, data, cited_in, updated_at) VALUES (?, ?, '', 'generated', ?, '[]', ?) ON CONFLICT(case_id) DO UPDATE SET status = CASE WHEN ? = 1 AND status IN ('generated', 'verified') THEN status ELSE 'generated' END, name = excluded.name, data = excluded.data, updated_at = excluded.updated_at")
      .bind(x.id, c.name + ', ' + keyLabel(x.key), JSON.stringify(d), now, same ? 1 : 0);
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
    const out = await geminiFor(env, 'GEMINI_KEY_LAWS', prompt);
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
    const out = await geminiFor(env, 'GEMINI_KEY_LAWS', 'You are a careful Nigerian legal researcher. Is "' + name + '" a real law, constitution, court rules, regulation, treaty or received English statute that Nigerian lawyers cite? ' +
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
// The Gemini part of the scan: it can also work out a bare "Section 14" that sits under a law's heading.
async function genScanAi(env, r) {
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
  const out = await geminiFor(env, 'GEMINI_KEY_LAWS', prompt);
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

// The free part: repairs slightly wrong markers and wraps every law that is named but not marked.
// No Gemini is used. With dry = true nothing is saved, so the admin can see what would be linked first.
// A big note is done in pieces (a few sections per request) so that no single request is too much for the free Cloudflare plan.
// The answer says where to carry on (resume), and the pages keep asking until it is 0.
const MARK_BUDGET = 20000; // characters of note text read in one request
async function markNote(env, id, opts) {
  opts = opts || {};
  const kind = kindOf(id);
  const secs = await sectionsOf(env, id, kind);
  if (!secs.length) return { skipped: true, linked: 0, sections: 0, samples: [], resume: 0 };
  const from = Math.min(Math.max(0, Number(opts.from) | 0), secs.length);
  const budget = Math.max(1000, Number(opts.budget) || Number(env.MARK_BUDGET) || MARK_BUDGET);
  const idx = opts.idx || await lawIndex(env);
  const changed = new Map();
  const samples = [];
  let linked = 0, used = 0, at = from;
  for (; at < secs.length; at++) {
    const sec = secs[at];
    if (at > from && used + sec.body.length > budget) break;
    used += sec.body.length;
    const r = markLaws(normAuth(sec.body), idx);
    linked += r.added;
    if (r.text !== sec.body) changed.set(sec.key, r.text);
    r.items.forEach((i) => { if (samples.length < 6) samples.push(i.text); });
  }
  const resume = at < secs.length ? at : 0;
  if (!opts.dry && changed.size) {
    const title = await env.DB.prepare('SELECT title FROM lib_notes WHERE note_id = ?').bind(id).first();
    const label = clean(title && title.title ? title.title : id, 150);
    for (const [k, body] of changed) {
      const def = SEC[kind].find((d) => d[0] === k);
      await upsertSection(env, id, k, def[1], body);
    }
    const text = [...changed.values()].join('\n\n');
    await registerCases(env, id, label, text);
    await registerAuth(env, id, label, text);
    await refreshNote(env, id); // a verified note stays verified: the wording did not change
    await publishNote(env, id);
  }
  return { skipped: false, linked, sections: changed.size, samples, resume };
}
// "Find authorities" on one note: the free pass first, then (when Gemini is set up and the admin did not switch it off) the Gemini pass.
// A big note comes back in pieces (resume is where to carry on, 0 when finished). The Gemini pass reads the whole note once, with the last piece.
async function genScan(env, r) {
  const id = checkNoteId(String(r.noteId || ''));
  const free = await markNote(env, id, { from: r.from });
  if (free.skipped) return { skipped: true, linked: 0, found: 0, sections: 0, free: 0, ai: 0, resume: 0 };
  let ai = { found: 0, linked: 0, sections: 0 }, aiNote = '';
  if (!free.resume && r.ai !== false && env.GEMINI_KEY) {
    try { ai = await genScanAi(env, r); } catch (e) { aiNote = e instanceof UserError ? e.message : 'Gemini could not be reached.'; }
  }
  return { skipped: false, found: free.linked + (ai.found || 0), linked: free.linked + (ai.linked || 0), sections: free.sections + (ai.sections || 0), free: free.linked, ai: ai.linked || 0, aiNote, resume: free.resume };
}
// One note at a time, in order, so the admin's phone can walk through the whole library and stop or restart safely.
// A big note takes several turns: the answer carries "resume" (note and section) and the phone sends it back.
async function markNext(env, r) {
  const after = clean(r.after, 120);
  const total = after ? 0 : (Number(((await env.DB.prepare('SELECT COUNT(*) AS n FROM lib_notes').first()) || {}).n) || 0);
  let id = '', from = 0;
  const m = /^(.{1,120})#(\d{1,3})$/.exec(String(r.resume || ''));
  if (m) { id = checkNoteId(m[1]); from = Number(m[2]); }
  else {
    const row = await env.DB.prepare('SELECT note_id FROM lib_notes WHERE note_id > ? ORDER BY note_id LIMIT 1').bind(after).first();
    if (!row) return { done: true, total };
    id = row.note_id;
  }
  const res = await markNote(env, id, { dry: r.dry === true, from });
  return { done: false, next: id, total, linked: res.linked, sections: res.sections, samples: res.samples, resume: res.resume ? id + '#' + res.resume : '' };
}

// ---------- Topic quizzes ----------
// 10 multiple-choice questions per topic, written by Gemini from the topic's own note, reviewed and approved by the admin.
// Students never receive the right answers until they score the pass mark.
const QUIZ_N = 10, QUIZ_MAX = 30, QUIZ_PASS = 80, QUIZ_MINS = 10;
let quizTableReady = false;
async function quizTable(env) {
  if (quizTableReady) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS quiz ( note_id TEXT PRIMARY KEY, data TEXT NOT NULL, status TEXT NOT NULL DEFAULT \'draft\', updated_at INTEGER NOT NULL )').run();
  quizTableReady = true;
}
function quizId(id) {
  id = checkNoteId(String(id || ''));
  if (kindOf(id) !== 'topic') fail('Quizzes belong to topics.');
  return id;
}
function cleanQuiz(list) {
  const out = [];
  (Array.isArray(list) ? list : []).forEach((x) => {
    if (!x) return;
    const q = clean(x.q, 500), e = clean(x.e, 600);
    const o = (Array.isArray(x.o) ? x.o : []).map((t) => clean(t, 250));
    const a = Number(x.a);
    if (!q || o.length !== 4 || o.some((t) => !t) || new Set(o.map((t) => t.toLowerCase())).size !== 4) return;
    if (!Number.isInteger(a) || a < 0 || a > 3) return;
    const item = { q, o, a, e };
    // "a" = application question (a made-up fact situation), "s" = taken from the official text of a statute (must say which provision).
    if (x.k === 'a') item.k = 'a';
    if (x.k === 's') { const src = clean(x.src, 160); if (!src) return; item.k = 's'; item.src = src; }
    if (x.x) item.x = 1; // new question the admin has not approved yet
    out.push(item);
  });
  return out.slice(0, QUIZ_MAX);
}
async function quizRow(env, id) {
  await quizTable(env);
  const row = await env.DB.prepare('SELECT data, status, updated_at FROM quiz WHERE note_id = ?').bind(id).first();
  if (!row) return null;
  let qs = [];
  try { qs = JSON.parse(row.data); } catch (e) { qs = []; }
  return { questions: qs, status: row.status, updatedAt: row.updated_at };
}
const shuffled = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
async function quizList(env, prefix) {
  await quizTable(env);
  const p = String(prefix || '').slice(0, 100);
  if (!/^t:[\w.-]{1,80}:/.test(p)) return {};
  const rows = (await env.DB.prepare("SELECT note_id FROM quiz WHERE status = 'approved' AND note_id >= ? AND note_id < ?").bind(p, p + '￿').all()).results;
  const out = {};
  rows.forEach((x) => { out[x.note_id] = 1; });
  return out;
}
async function quizGet(env, r, user) {
  const id = quizId(r.noteId);
  const locked = !isFreeNote(id) && !(await payState(env, user)).active;
  if (!locked) await takeAttempt(env, user, id);
  const row = await quizRow(env, id);
  // Students draw 10 questions at random from the approved part of the bank (questions marked as new are not served until approved).
  const pool = row ? row.questions.map((x, qi) => ({ x, qi })).filter((e) => !e.x.x) : [];
  if (!row || row.status !== 'approved' || pool.length < QUIZ_N) fail('This quiz is not ready yet.');
  const pick = shuffled(pool).slice(0, locked ? PREVIEW_N : QUIZ_N);
  const questions = pick.map((e) => Object.assign({ qi: e.qi, q: e.x.q, o: shuffled(e.x.o.map((t, oi) => ({ oi, t }))) }, e.x.k ? { k: e.x.k } : {}));
  if (locked) return { preview: true, n: questions.length, total: QUIZ_N, questions, msg: PAY_MSG }; // a taste only: no timer, no ticket, nothing can be submitted
  return { n: questions.length, mins: QUIZ_MINS, pass: QUIZ_PASS, ticket: await ticketFor(env, user, id, { q: pick.map((e) => e.qi) }), questions };
}
async function quizSubmit(env, r, user) {
  const id = quizId(r.noteId);
  await needPass(env, user, isFreeNote(id));
  const row = await quizRow(env, id);
  if (!row || row.status !== 'approved') fail('This quiz is not ready yet.');
  const t = await ticketCheck(env, user, id, r.ticket, QUIZ_MINS);
  // Only the questions this student was given are marked. The list is inside the signed ticket.
  const asked = (Array.isArray(t.p.q) ? t.p.q : []).filter((qi) => Number.isInteger(qi) && row.questions[qi]);
  if (!asked.length) fail('Please start the quiz again from the beginning.');
  const ans = r.answers && typeof r.answers === 'object' ? r.answers : {};
  const total = asked.length, has = (qi) => ans[qi] !== null && ans[qi] !== '' && ans[qi] !== undefined;
  let score = 0; const wrong = [];
  asked.forEach((qi) => { if (has(qi) && Number(ans[qi]) === row.questions[qi].a) score++; else wrong.push(qi); });
  let pct = Math.round(score / total * 100), pass = pct >= QUIZ_PASS;
  const out = { score, total, pct, pass, needed: Math.ceil(total * QUIZ_PASS / 100) };
  // The phone submits whatever was answered when time ran out. A sheet that arrives late (phone asleep, weak network) is still marked, and only the questions answered count.
  if (t.late) out.late = true;
  await recordStat(env, id, pct, pass, wrong);
  later(r, pushStudied(env, user.id));
  // The corrections are only shown to a student who reached the pass mark.
  if (pass) out.review = asked.map((qi) => { const x = row.questions[qi]; return Object.assign({ q: x.q, o: x.o, a: x.a, e: x.e, picked: has(qi) ? Number(ans[qi]) : -1 }, x.src ? { src: x.src } : {}); });
  return out;
}
async function quizAdminGet(env, r) {
  const id = quizId(r.noteId);
  const row = await quizRow(env, id);
  return row ? { questions: row.questions, status: row.status } : { questions: [], status: 'none' };
}
async function resetStat(env, id) {
  try { await statTable(env); await env.DB.prepare('UPDATE quiz_stat SET ' + Array.from({ length: 30 }, (_, i) => 'w' + i + ' = 0').join(', ') + ' WHERE note_id = ?').bind(id).run(); } catch (e) { /* no stats yet */ }
}
// The official text of the provisions this topic's note cites (only laws whose text has been imported). Statute questions are made from this and nothing else.
async function statuteSource(env, id) {
  const secs = await sectionsOf(env, id, 'topic');
  const body = secs.map((x) => x.body).join('\n');
  const re = new RegExp(AUTH_RE.source, 'g');
  const want = new Map();
  let m;
  while ((m = re.exec(body)) && want.size < 16) {
    const pv = parseProv(m[4]);
    if (!pv) continue;
    const law = canonAuth(m[1].toLowerCase(), m[2].toLowerCase(), m[3].trim());
    if (!law || !law.key) continue;
    const sid = law.key + ':' + pv.key;
    if (!want.has(sid)) want.set(sid, { law: law.name, label: keyLabel(pv.key) });
  }
  const ids = [...want.keys()];
  const labels = new Set();
  const parts = [];
  if (ids.length) {
    const rows = (await env.DB.prepare('SELECT case_id, data FROM cases WHERE case_id IN (' + ids.map(() => '?').join(',') + ')').bind(...ids).all()).results;
    const byId = new Map(rows.map((x) => [x.case_id, x]));
    let used = 0;
    for (const sid of ids) {
      const row = byId.get(sid);
      let d = null;
      try { d = row && row.data ? JSON.parse(row.data) : null; } catch (e) { d = null; }
      if (!d || d.official !== true && d.official !== 1 || d.gap) continue;
      const bits = [];
      if (d.text) bits.push(String(d.text));
      (Array.isArray(d.subs) ? d.subs : []).forEach((y) => { if (y && y.text) bits.push((y.ref ? y.ref + ' ' : '') + y.text); });
      const text = bits.join('\n').trim().slice(0, 3500);
      if (text.length < 40 || used + text.length > 12000) continue;
      const w = want.get(sid), label = w.law + ', ' + w.label;
      labels.add(label); used += text.length;
      parts.push('[' + label + ']' + (d.heading ? ' ' + d.heading : '') + '\n' + text);
    }
  }
  return { text: parts.join('\n\n'), labels };
}
async function quizMake(env, r) {
  const id = quizId(r.noteId);
  const secs = await sectionsOf(env, id, 'topic');
  const text = secs.map((s) => s.title + ':\n' + s.body).join('\n\n').slice(0, 14000);
  if (text.length < 400 && r.mode !== 'statute') fail('Write this topic\'s note first. The quiz is made from the note.');
  const ctx = r.context || {};
  const add = r.mode === 'add' || r.mode === 'statute';
  const old = add ? await quizRow(env, id) : null;
  const have = old ? old.questions : [];
  const statute = r.mode === 'statute';
  if ((add || statute) && !have.length) fail('There is no quiz to add to. Generate the quiz first.');
  if (have.length >= QUIZ_MAX) fail('The question bank is full (' + QUIZ_MAX + ' questions).');
  let src = null;
  if (statute) {
    src = await statuteSource(env, id);
    if (!src.text) fail('No statute text is available for this topic yet. For these questions the note must name specific provisions (such as s. 36 of the Constitution) of a law whose official text has been imported.');
  }
  const prompt = statute
    ? 'You are an experienced Nigerian law lecturer setting a short test for LL.B students on the topic "' + clean(ctx.topic, 300) + '" of the course "' + clean(ctx.course, 200) + '". ' +
      'Write exactly ' + QUIZ_N + ' multiple-choice questions based ONLY on the OFFICIAL TEXT of the provisions below. Test what a provision says, requires, allows or forbids, and ask the student to apply it to a short made-up fact situation (invented names, a Nigerian setting, no real people or cases). ' +
      'Do not use any rule, case, section number or citation that is not in the text below. Every question must carry "src": the label in square brackets that appears before the provision it comes from, copied exactly, and "k":"s". ' +
      'Each question has exactly 4 different options and exactly one clearly correct option. Wrong options must be plausible but plainly wrong to someone who read the provision. Do not use "all of the above" or "none of the above". Keep each question under 80 words and each option under 25 words. ' +
      'These questions already exist. Do not repeat or rephrase any of them: ' + have.map((x) => x.q.slice(0, 90)).join(' | ') + '. ' +
      'Give "a" as the number (0 to 3) of the correct option and "e" as a one or two sentence explanation that points to the words of the provision. ' +
      'Return JSON only: {"questions":[{"q":"...","o":["...","...","...","..."],"a":0,"e":"...","src":"...","k":"s"}]}\n\nOFFICIAL TEXT:\n' + src.text
    : 'You are an experienced Nigerian law lecturer setting a short test for LL.B students. ' +
    'Write exactly ' + QUIZ_N + ' multiple-choice questions that test whether a student has understood the topic "' + clean(ctx.topic, 300) + '" of the course "' + clean(ctx.course, 200) + '". ' +
    'Base every question ONLY on the study note below. Do not test anything the note does not say. Do not invent cases, sections or citations: use only authorities named in the note. ' +
    'Each question has exactly 4 different options and exactly one clearly correct option. Wrong options must be plausible but plainly wrong to someone who studied the note. ' +
    'Make at least 4 of the ' + QUIZ_N + ' questions application questions: a short made-up fact situation of 2 to 4 sentences (invented names, a Nigerian setting, no real people or cases) in which the student must apply a rule that the note states to reach the answer. Do not copy an example from the note, and do not use a rule the note does not state. Give each of these "k":"a". The remaining questions test recall and understanding and have no "k". ' +
    'Do not use "all of the above" or "none of the above". Keep each question under 60 words and each option under 25 words. ' +
    (have.length ? 'These questions already exist. Do not repeat or rephrase any of them, and cover other points of the note: ' + have.map((x) => x.q.slice(0, 90)).join(' | ') + '. ' : '') +
    'Give "a" as the number (0 to 3) of the correct option and "e" as a one or two sentence explanation of why it is correct. ' +
    'Return JSON only: {"questions":[{"q":"...","o":["...","...","...","..."],"a":0,"e":"...","k":"a"}]}\n\nSTUDY NOTE:\n' + text;
  const out = await geminiFor(env, 'GEMINI_KEY_QUIZ', prompt);
  let qs = cleanQuiz(out && out.questions).slice(0, QUIZ_N);
  if (statute) qs = qs.filter((x) => x.k === 's' && src.labels.has(x.src)); // a question that does not point to one of the given provisions is dropped
  else qs = qs.map((x) => { const y = Object.assign({}, x); if (y.k === 's') { delete y.k; delete y.src; } return y; }); // note-based modes cannot claim a statute source
  if (add) {
    const seen = new Set(have.map((x) => x.q.toLowerCase()));
    qs = qs.filter((x) => !seen.has(x.q.toLowerCase())).map((x) => Object.assign({}, x, { x: 1 }));
    if (qs.length < 3) fail(statute ? 'Gemini wrote too few usable questions from the statute text. Tap Add statute questions again.' : 'Gemini wrote too few new questions. Tap Add 10 more questions again.');
    const bank = have.concat(qs).slice(0, QUIZ_MAX);
    await env.DB.prepare('UPDATE quiz SET data = ?, updated_at = ? WHERE note_id = ?').bind(JSON.stringify(bank), Date.now(), id).run();
    return { questions: bank, status: old.status };
  }
  if (qs.length < QUIZ_N) fail('Gemini wrote only ' + qs.length + ' usable questions. Tap Generate quiz again.');
  await quizTable(env);
  await env.DB.prepare("INSERT INTO quiz (note_id, data, status, updated_at) VALUES (?, ?, 'draft', ?) ON CONFLICT(note_id) DO UPDATE SET data = excluded.data, status = 'draft', updated_at = excluded.updated_at").bind(id, JSON.stringify(qs), Date.now()).run();
  await resetStat(env, id);
  return { questions: qs, status: 'draft' };
}
async function quizSave(env, r) {
  const id = quizId(r.noteId);
  await quizTable(env);
  if (r.status === 'delete') { await env.DB.prepare('DELETE FROM quiz WHERE note_id = ?').bind(id).run(); await resetStat(env, id); return { status: 'none' }; }
  const sent = Array.isArray(r.questions) ? r.questions.slice(0, QUIZ_MAX) : [];
  let qs = cleanQuiz(sent);
  if (qs.length !== sent.length) fail('Some questions are incomplete. Each needs a question, 4 different options and one option marked correct.');
  const status = r.status === 'approved' ? 'approved' : 'draft';
  if (status === 'approved') {
    qs = qs.map((x) => { const y = Object.assign({}, x); delete y.x; return y; }); // approving clears the "new" flags
    if (qs.length < QUIZ_N) fail('A quiz needs at least ' + QUIZ_N + ' complete questions (each with 4 different options and one correct answer) before it can be approved.');
  }
  if (!qs.length) fail('There are no complete questions to save.');
  const prev = await quizRow(env, id);
  await env.DB.prepare("INSERT INTO quiz (note_id, data, status, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(note_id) DO UPDATE SET data = excluded.data, status = excluded.status, updated_at = excluded.updated_at").bind(id, JSON.stringify(qs), status, Date.now()).run();
  if (prev && prev.questions.length !== qs.length) await resetStat(env, id); // question numbers moved, so old counts no longer line up
  return { questions: qs, status };
}

// ---------- Server-kept time and anonymous quiz statistics ----------
const GRACE_MS = 45000;
async function ticketFor(env, user, id, extra) {
  return signToken(Object.assign({ sub: user.id, n: id, s: Date.now(), exp: Math.floor(Date.now() / 1000) + 7200 }, extra || {}), env.SESSION_SECRET);
}
async function ticketCheck(env, user, id, ticket, mins) {
  const p = await verifyToken(ticket, env.SESSION_SECRET);
  if (!p || p.sub !== user.id || p.n !== id) fail('Please start the quiz again from the beginning.');
  return { p, late: Date.now() - p.s > mins * 60000 + GRACE_MS };
}

// ---------- Daily attempt limit (set by the admin; 0 means no limit) ----------
let quizCapCache = { at: 0, v: 0 };
async function quizCap(env) {
  if (Date.now() - quizCapCache.at < 30000) return quizCapCache.v;
  await payTables(env);
  const row = await env.DB.prepare('SELECT v FROM kv WHERE k = \'quiz_cap\'').first();
  quizCapCache = { at: Date.now(), v: row ? Math.max(0, Number(row.v) || 0) : 0 };
  return quizCapCache.v;
}
let tryTableReady = false;
async function takeAttempt(env, user, id) {
  if (user.admin) return;
  const cap = await quizCap(env);
  if (!cap) return; // no limit: nothing is written
  if (!tryTableReady) { await env.DB.prepare('CREATE TABLE IF NOT EXISTS quiz_try ( user_id TEXT NOT NULL, note_id TEXT NOT NULL, day INTEGER NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, note_id, day) )').run(); tryTableReady = true; }
  const day = Math.floor((Date.now() + 3600000) / 86400000); // days start at midnight Nigerian time
  const r = await env.DB.prepare('INSERT INTO quiz_try (user_id, note_id, day, n) VALUES (?, ?, ?, 1) ON CONFLICT(user_id, note_id, day) DO UPDATE SET n = n + 1 WHERE n < ?').bind(user.id, id, day, cap).run();
  if (!r.meta || r.meta.changes !== 1) fail('You have used your ' + cap + ' attempt' + (cap === 1 ? '' : 's') + ' at this today. Try again tomorrow.');
  if (Math.random() < 0.02) await env.DB.prepare('DELETE FROM quiz_try WHERE day < ?').bind(day - 2).run();
}
async function quizCapGet(env) { return { cap: await quizCap(env) }; }
async function quizCapSet(env, r) {
  const n = Math.round(Number(r.cap));
  if (!(n >= 0 && n <= 50)) fail('Choose a number from 0 to 50. Use 0 for no limit.');
  await payTables(env);
  await env.DB.prepare('INSERT INTO kv (k, v) VALUES (\'quiz_cap\', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(String(n)).run();
  quizCapCache = { at: Date.now(), v: n };
  return { cap: n };
}
let statTableReady = false;
async function statTable(env) {
  if (statTableReady) return;
  const cols = Array.from({ length: 30 }, (_, i) => 'w' + i + ' INTEGER NOT NULL DEFAULT 0').join(', ');
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS quiz_stat ( note_id TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, passes INTEGER NOT NULL DEFAULT 0, sumpct INTEGER NOT NULL DEFAULT 0, ' + cols + ' )').run();
  // An older table made with 20 columns gets the extra 10 (question banks hold up to 30 questions).
  try { await env.DB.prepare('SELECT w29 FROM quiz_stat LIMIT 0').all(); }
  catch (e) { for (let i = 20; i < 30; i++) { try { await env.DB.prepare('ALTER TABLE quiz_stat ADD COLUMN w' + i + ' INTEGER NOT NULL DEFAULT 0').run(); } catch (x) { /* already there */ } } }
  statTableReady = true;
}
// One small write per submitted quiz. Set QUIZ_STATS=off in Cloudflare to switch this off.
async function recordStat(env, id, pct, pass, wrong) {
  if (String(env.QUIZ_STATS || '') === 'off') return;
  try {
    await statTable(env);
    const sets = ['attempts = attempts + 1', 'passes = passes + ' + (pass ? 1 : 0), 'sumpct = sumpct + ' + (Number(pct) | 0)];
    wrong.forEach((i) => { if (Number.isInteger(i) && i >= 0 && i < 30) sets.push('w' + i + ' = w' + i + ' + 1'); });
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO quiz_stat (note_id) VALUES (?)').bind(id),
      env.DB.prepare('UPDATE quiz_stat SET ' + sets.join(', ') + ' WHERE note_id = ?').bind(id),
    ]);
  } catch (e) { console.error('recordStat failed', e && e.message); }
}
async function quizStats(env, r) {
  await statTable(env); await quizTable(env); await iracTable(env);
  const cid = String(r.courseId || '').slice(0, 80);
  if (!/^[\w.-]+$/.test(cid)) fail('Pick a course.');
  const rows = (await env.DB.prepare("SELECT * FROM quiz_stat WHERE (note_id >= ? AND note_id < ?) OR (note_id >= ? AND note_id < ?) ORDER BY attempts DESC LIMIT 80").bind('t:' + cid + ':', 't:' + cid + ':￿', 'i:' + cid + ':', 'i:' + cid + ':￿').all()).results;
  const out = [];
  for (const x of rows) {
    let labels = [];
    if (x.note_id[0] === 't') {
      const q = await quizRow(env, x.note_id);
      labels = q ? q.questions.map((y) => y.q) : [];
    } else {
      const parts = x.note_id.split(':'), part = Number(parts[2]);
      const rs = (await env.DB.prepare('SELECT id, data FROM irac WHERE id >= ? AND id < ? ORDER BY id').bind('i:' + cid + ':' + part + ':', 'i:' + cid + ':' + part + ':￿').all()).results;
      const STEPN = ['Issue', 'Rule', 'Application', 'Conclusion'];
      rs.forEach((z) => { let d = null; try { d = JSON.parse(z.data); } catch (e) { d = null; } const slot = Number(z.id.split(':')[3]); STEPN.forEach((n, k) => { labels[slot * 4 + k] = d ? 'Scenario ' + (slot + 1) + ' ' + n + ': ' + ((d.steps[k] && d.steps[k].q) || '') : ''; }); });
    }
    const hard = [];
    for (let i = 0; i < 30; i++) if (x['w' + i] && labels[i]) hard.push({ q: String(labels[i]).slice(0, 160), wrong: x['w' + i], pct: x.attempts ? Math.round(x['w' + i] / x.attempts * 100) : 0 });
    hard.sort((a, b) => b.pct - a.pct);
    out.push({ id: x.note_id, attempts: x.attempts, passes: x.passes, avg: x.attempts ? Math.round(x.sumpct / x.attempts) : 0, hard: hard.slice(0, 3) });
  }
  return out;
}

// ---------- IRAC tests: per part of a course, 5 scenarios, each with 4 multiple-choice steps ----------
const IRAC_N = 5, IRAC_MIN_EACH = 4, IRAC_STEPS = ['Issue', 'Rule', 'Application', 'Conclusion'];
let iracTableReady = false;
async function iracTable(env) {
  if (iracTableReady) return;
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS irac ( id TEXT PRIMARY KEY, data TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', chk TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL )").run();
  iracTableReady = true;
}
function iracKey(cid, part, slot) {
  cid = String(cid || '');
  if (!/^[\w.-]{1,80}$/.test(cid)) fail('Unknown course.');
  part = Number(part); if (!Number.isInteger(part) || part < 0 || part > 9) fail('Unknown part.');
  if (slot === undefined) return { cid, part };
  slot = Number(slot); if (!Number.isInteger(slot) || slot < 0 || slot >= IRAC_N) fail('Unknown scenario number.');
  return { cid, part, slot, id: 'i:' + cid + ':' + part + ':' + slot };
}
function cleanScenario(d) {
  d = d || {};
  const facts = clean(d.facts, 2000);
  const steps = (Array.isArray(d.steps) ? d.steps : []).slice(0, 4);
  const ok = cleanQuiz(steps);
  if (facts.length < 60 || steps.length !== 4 || ok.length !== 4) return null;
  return { facts, topics: (Array.isArray(d.topics) ? d.topics : []).slice(0, 5).map((t) => clean(t, 200)), steps: ok };
}
async function iracRows(env, cid, part) {
  await iracTable(env);
  const rs = (await env.DB.prepare('SELECT id, data, status, chk FROM irac WHERE id >= ? AND id < ? ORDER BY id').bind('i:' + cid + ':' + part + ':', 'i:' + cid + ':' + part + ':￿').all()).results;
  return rs.map((x) => { let d = null, c = null; try { d = JSON.parse(x.data); } catch (e) { d = null; } try { c = x.chk ? JSON.parse(x.chk) : null; } catch (e) { c = null; } return { slot: Number(x.id.split(':')[3]), status: x.status, data: d, check: c }; });
}
async function iracList(env, r) {
  const cid = iracKey(r.courseId, 0).cid;
  await iracTable(env);
  const rs = (await env.DB.prepare("SELECT id FROM irac WHERE status = 'approved' AND id >= ? AND id < ?").bind('i:' + cid + ':', 'i:' + cid + ':￿').all()).results;
  const out = {};
  rs.forEach((x) => { const pt = x.id.split(':')[2]; out[pt] = (out[pt] || 0) + 1; });
  return out;
}
async function iracAdminList(env, r) {
  const k = iracKey(r.courseId, r.part);
  const have = await iracRows(env, k.cid, k.part), out = [];
  for (let i = 0; i < IRAC_N; i++) { const h = have.find((x) => x.slot === i); out.push(h || { slot: i, status: 'none', data: null, check: null }); }
  return out;
}
async function iracMake(env, r) {
  const k = iracKey(r.courseId, r.part, r.slot);
  const ctx = r.context || {};
  const names = (Array.isArray(ctx.topics) ? ctx.topics : []).slice(0, 60).map((t) => clean(t, 200));
  if (!names.length) fail('This part has no topics.');
  await iracTable(env);
  // Use the written notes of topics in this part, rotating through them so each scenario draws on different topics.
  const pre = 't:' + k.cid + ':' + k.part + ':';
  const have = (await env.DB.prepare("SELECT note_id FROM lib_notes WHERE note_id >= ? AND note_id < ? AND status = 'complete'").bind(pre, pre + '￿').all()).results.map((x) => x.note_id);
  const idx = have.map((x) => Number(x.split(':')[3])).filter((i) => i >= 0 && i < names.length).sort((a, b) => a - b);
  if (idx.length < 2) fail('Write at least two complete topic notes in this part first. The scenarios are made from the notes.');
  const take = Math.min(3, idx.length), chosen = [];
  for (let i = 0; i < take; i++) chosen.push(idx[(k.slot * 2 + i) % idx.length]);
  const uniq = Array.from(new Set(chosen));
  let notes = '';
  for (const i of uniq) {
    const secs = await sectionsOf(env, pre + i, 'topic');
    notes += '\n\n=== TOPIC: ' + names[i] + ' ===\n' + secs.map((x) => x.title + ':\n' + x.body).join('\n').slice(0, 4500);
  }
  const prompt = 'You are an experienced Nigerian law lecturer setting a hard IRAC problem question for LL.B students on the course "' + clean(ctx.course, 200) + '" (' + clean(ctx.part, 100) + '). ' +
    'Write ONE fact scenario of 90 to 160 words about named Nigerian parties, then four multiple-choice questions on it, in this order: (1) the ISSUE, (2) the RULE, (3) the APPLICATION of the rule to these facts, (4) the CONCLUSION. ' +
    'Each question has exactly 4 different options and exactly one correct option. The question must be TRICKY: wrong options must be near misses a half-prepared student would choose, for example a rule that is almost right, an exception that does not fit the facts, a similar but different authority, an issue the facts only seem to raise, or a conclusion that follows from the wrong rule. ' +
    'The correct Application option must use the facts of the scenario, and the correct Conclusion must follow from the correct Rule and Application. Do not use "all of the above" or "none of the above". Keep every option under 40 words. ' +
    'Base the law ONLY on the study notes below. Use only cases, statutes and sections that the notes themselves name. If the notes do not support a good problem, still write the best one they do support, and do not invent any authority. ' +
    'Give "a" as the number 0 to 3 of the correct option and "e" as a one or two sentence explanation. ' +
    'Return JSON only: {"facts":"...","steps":[{"q":"...","o":["...","...","...","..."],"a":0,"e":"..."},{...},{...},{...}]}\nTOPIC NOTES:' + notes;
  const out = await geminiFor(env, 'GEMINI_KEY_IRAC_WRITE', prompt);
  const sc = cleanScenario({ facts: out && out.facts, steps: out && out.steps, topics: uniq.map((i) => names[i]) });
  if (!sc) fail('Gemini did not return a complete scenario. Tap Generate again.');
  // Second, independent call: another key solves the question without seeing the answer key.
  let chk = { error: true };
  try {
    const maps = sc.steps.map((st) => shuffled(st.o.map((t, oi) => ({ oi, t }))));
    const cp = 'You are a Nigerian law lecturer answering an IRAC test. Read the facts and answer each of the four multiple-choice questions with the single best option, using only the study notes. Return JSON only: {"answers":[n1,n2,n3,n4]} where each n is the option number 0 to 3 as listed.\nFACTS: ' + sc.facts + '\n' +
      sc.steps.map((st, si) => 'Q' + (si + 1) + ' (' + IRAC_STEPS[si] + '): ' + st.q + '\n' + maps[si].map((m, k) => k + ': ' + m.t).join('\n')).join('\n') + '\nTOPIC NOTES:' + notes;
    const co = await geminiFor(env, 'GEMINI_KEY_IRAC_CHECK', cp);
    const ans = (co && Array.isArray(co.answers) ? co.answers : []).map(Number);
    const diffs = [];
    sc.steps.forEach((st, si) => { const picked = maps[si][ans[si]]; if (!picked || picked.oi !== st.a) diffs.push(si); });
    chk = { agree: diffs.length === 0, diffs, at: Date.now() };
  } catch (e) { chk = { error: true }; }
  await env.DB.prepare("INSERT INTO irac (id, data, status, chk, updated_at) VALUES (?, ?, 'draft', ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, status = 'draft', chk = excluded.chk, updated_at = excluded.updated_at").bind(k.id, JSON.stringify(sc), JSON.stringify(chk), Date.now()).run();
  return { slot: k.slot, status: 'draft', data: sc, check: chk };
}
async function iracSave(env, r) {
  const k = iracKey(r.courseId, r.part, r.slot);
  await iracTable(env);
  if (r.status === 'delete') { await env.DB.prepare('DELETE FROM irac WHERE id = ?').bind(k.id).run(); return { slot: k.slot, status: 'none', data: null, check: null }; }
  const sc = cleanScenario(r.data);
  if (!sc) fail('Each scenario needs facts and 4 complete questions (Issue, Rule, Application, Conclusion), each with 4 different options and one correct answer.');
  const status = r.status === 'approved' ? 'approved' : 'draft';
  const old = await env.DB.prepare('SELECT chk FROM irac WHERE id = ?').bind(k.id).first();
  await env.DB.prepare("INSERT INTO irac (id, data, status, chk, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, status = excluded.status, updated_at = excluded.updated_at").bind(k.id, JSON.stringify(sc), status, old ? old.chk : '', Date.now()).run();
  return { slot: k.slot, status, data: sc, check: old && old.chk ? JSON.parse(old.chk) : null };
}
async function iracApproved(env, cid, part) {
  const rows = (await iracRows(env, cid, part)).filter((x) => x.status === 'approved' && x.data);
  if (rows.length < IRAC_N) fail('This test is not ready yet.');
  return rows;
}
async function iracGet(env, r, user) {
  const k = iracKey(r.courseId, r.part);
  const locked = k.part !== 0 && !(await payState(env, user)).active;
  if (!locked) await takeAttempt(env, user, 'i:' + k.cid + ':' + k.part);
  const rows = await iracApproved(env, k.cid, k.part);
  if (locked) { // a taste only: the first scenario, three questions, nothing to submit
    const x = rows[0];
    if (!x) fail('This test is not ready yet.');
    return { preview: true, n: PREVIEW_N, total: rows.length * 4, msg: PAY_MSG, scenarios: [{ si: x.slot, facts: x.data.facts, steps: x.data.steps.slice(0, PREVIEW_N).map((st, sti) => ({ st: sti, q: st.q, o: shuffled(st.o.map((t, oi) => ({ oi, t }))) })) }] };
  }
  const scenarios = shuffled(rows.map((x) => ({ si: x.slot, facts: x.data.facts, steps: x.data.steps.map((st, sti) => ({ st: sti, q: st.q, o: shuffled(st.o.map((t, oi) => ({ oi, t }))) })) })));
  return { n: rows.length * 4, mins: rows.length * IRAC_MIN_EACH, pass: QUIZ_PASS, ticket: await ticketFor(env, user, 'i:' + k.cid + ':' + k.part), scenarios };
}
async function iracSubmit(env, r, user) {
  const k = iracKey(r.courseId, r.part);
  await needPass(env, user, k.part === 0);
  const rows = await iracApproved(env, k.cid, k.part);
  const ans = r.answers && typeof r.answers === 'object' ? r.answers : {};
  const total = rows.length * 4, per = {}, wrong = [];
  let score = 0;
  rows.forEach((x) => x.data.steps.forEach((st, sti) => {
    const v = ans[x.slot + ':' + sti];
    const right = v !== undefined && v !== null && v !== '' && Number(v) === st.a;
    if (right) { score++; per[x.slot] = (per[x.slot] || 0) + 1; } else wrong.push(x.slot * 4 + sti);
  }));
  let pct = Math.round(score / total * 100), pass = pct >= QUIZ_PASS;
  const out = { score, total, pct, pass, needed: Math.ceil(total * QUIZ_PASS / 100), per };
  const late = (await ticketCheck(env, user, 'i:' + k.cid + ':' + k.part, r.ticket, rows.length * IRAC_MIN_EACH)).late;
  if (late) out.late = true;
  await recordStat(env, 'i:' + k.cid + ':' + k.part, pct, pass, wrong);
  later(r, pushStudied(env, user.id));
  if (pass) out.review = rows.map((x) => ({ si: x.slot, facts: x.data.facts, steps: x.data.steps.map((st, sti) => { const v = ans[x.slot + ':' + sti]; return { name: IRAC_STEPS[sti], q: st.q, o: st.o, a: st.a, e: st.e, picked: v === undefined || v === null || v === '' ? -1 : Number(v) }; }) }));
  return out;
}

async function reviewSummary(env, r) {
  const cid = iracKey(r.courseId, 0).cid;
  await quizTable(env); await iracTable(env);
  const qs = (await env.DB.prepare('SELECT note_id, status FROM quiz WHERE note_id >= ? AND note_id < ?').bind('t:' + cid + ':', 't:' + cid + ':\uffff').all()).results;
  const is = (await env.DB.prepare('SELECT id, status, chk FROM irac WHERE id >= ? AND id < ?').bind('i:' + cid + ':', 'i:' + cid + ':\uffff').all()).results;
  const quiz = {}, irac = {};
  qs.forEach((x) => { quiz[x.note_id] = x.status; });
  is.forEach((x) => { let c = null; try { c = x.chk ? JSON.parse(x.chk) : null; } catch (e) { c = null; } irac[x.id] = { status: x.status, flag: !!(c && c.agree === false), unchecked: !c || !!c.error }; });
  return { quiz, irac };
}

async function accountDelete(env, user, r) {
  if (String(r.confirm) !== 'DELETE') fail('Type DELETE to confirm.');
  if (user.admin) fail('Admin accounts cannot be deleted here. Ask the site owner to remove the admin email first.');
  const u = user.id;
  setupSeen.delete(u);
  await profileTable(env);
  await payTables(env);
  await commTables(env);
  await pushTables(env);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM push_subs WHERE user_id = ?').bind(u),
    env.DB.prepare('DELETE FROM push_pass WHERE user_id = ?').bind(u),
    env.DB.prepare('DELETE FROM creports WHERE user_id = ?').bind(u),
    env.DB.prepare('DELETE FROM chelp WHERE user_id = ?').bind(u),
    env.DB.prepare('DELETE FROM cmute WHERE user_id = ?').bind(u),
    env.DB.prepare('DELETE FROM profile WHERE user_id = ?').bind(u),
    env.DB.prepare('DELETE FROM pass WHERE user_id = ?').bind(u),
    env.DB.prepare('UPDATE posts SET replies = MAX(0, replies - (SELECT COUNT(*) FROM replies r WHERE r.post_id = posts.id AND r.user_id = ?)) WHERE id IN (SELECT post_id FROM replies WHERE user_id = ?)').bind(u, u),
    env.DB.prepare('DELETE FROM replies WHERE post_id IN (SELECT id FROM posts WHERE user_id = ?)').bind(u),
    env.DB.prepare('DELETE FROM replies WHERE user_id = ?').bind(u),
    env.DB.prepare('DELETE FROM posts WHERE user_id = ?').bind(u),
    env.DB.prepare('DELETE FROM reports WHERE user_id = ?').bind(u),
    env.DB.prepare('DELETE FROM sync WHERE user_id = ?').bind(u),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(u),
  ]);
  return true;
}

// ---------- The LawLink pass: free preview, 30-day codes, and an admin on/off switch ----------
const CODE_DAYS = 30;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PREVIEW_N = 3; // questions an unpaid student sees per quiz or IRAC test once payment is switched on
const COMM_PAY_MSG = 'The community is for students with the Lex-Tabulā pass.';
const PAY_MSG = 'This part of Lex-Tabulā needs the Lex-Tabulā pass.';
let payReady = false;
let payCfg = { at: 0, v: null }; // one small object, refreshed every 30 seconds
async function payTables(env) {
  if (payReady) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS kv ( k TEXT PRIMARY KEY, v TEXT NOT NULL DEFAULT \'\' )'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS pass ( user_id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0 )'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS payments ( ref TEXT PRIMARY KEY, user_id TEXT NOT NULL, amount INTEGER NOT NULL, days INTEGER NOT NULL DEFAULT 30, status TEXT NOT NULL DEFAULT \'pending\', created_at INTEGER NOT NULL DEFAULT 0, paid_at INTEGER )'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS codes ( code TEXT PRIMARY KEY, days INTEGER NOT NULL DEFAULT 30, batch TEXT NOT NULL DEFAULT \'\', created_at INTEGER NOT NULL DEFAULT 0, used_by TEXT, used_at INTEGER )'),
  ]);
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS payments_user ON payments (user_id, created_at)').run();
  payReady = true;
}
async function payConf(env) {
  if (payCfg.v && Date.now() - payCfg.at < 30000) return payCfg.v;
  await payTables(env);
  const { results } = await env.DB.prepare('SELECT k, v FROM kv WHERE k LIKE \'pay_%\'').all();
  const m = {}; results.forEach((x) => { m[x.k] = x.v; });
  const v = { on: m.pay_on === '1', price: Number(m.pay_price) || 0, trial: m.pay_trial === undefined ? 14 : Math.max(0, Number(m.pay_trial) || 0), enabledAt: Number(m.pay_enabled_at) || 0, help: m.pay_help || '' };
  payCfg = { at: Date.now(), v };
  return v;
}
// Free for everyone: course overviews and the first topic of each course (note, and its quiz).
const isFreeNote = (id) => /^c:/.test(String(id)) || /^t:[\w.-]+:0:0$/.test(String(id));
const softUser = async (r, env) => { try { return await authUser(r.token, env); } catch (e) { return null; } };
// Where does this student stand? user may be null (not signed in).
async function payState(env, user) {
  const c = await payConf(env);
  const base = { on: c.on, price: c.price, days: CODE_DAYS, help: c.help, card: !!(env.PAYSTACK_SECRET_KEY && c.price > 0) };
  if (!c.on) return { ...base, active: true, why: 'off', until: 0 };
  if (!user) return { ...base, active: false, why: 'guest', until: 0 };
  if (user.admin) return { ...base, active: true, why: 'admin', until: 0 };
  const row = await env.DB.prepare('SELECT u.created_at AS cr, p.expires_at AS ex FROM users u LEFT JOIN pass p ON p.user_id = u.id WHERE u.id = ?').bind(user.id).first();
  const now = Date.now();
  if (row && row.ex > now) return { ...base, active: true, why: 'pass', until: row.ex };
  const tEnd = c.enabledAt + c.trial * 86400000;
  if (row && c.enabledAt && row.cr < c.enabledAt && now < tEnd) return { ...base, active: true, why: 'trial', until: tEnd };
  return { ...base, active: false, why: 'locked', until: (row && row.ex) || 0 };
}
async function needPass(env, user, free) {
  if (free) return;
  const s = await payState(env, user);
  if (!s.active) fail(PAY_MSG);
}
async function libGetFor(env, id, user) {
  checkNoteId(id);
  let paid = false;
  if (kindOf(id) === 'topic' && !isFreeNote(id)) {
    const s = await payState(env, user);
    if (!s.active) { const n = await env.DB.prepare('SELECT status, score, verified, updated_at FROM lib_notes WHERE note_id = ?').bind(id).first(); return { note: n ? { status: n.status, score: n.score, verified: !!n.verified, updatedAt: n.updated_at } : null, sections: [], locked: true, why: s.why }; }
    paid = s.on; // paid content: the phone must not keep a copy
  }
  const d = await libGet(env, id);
  if (paid) d.paid = true;
  return d;
}
async function searchLibFor(env, r, user) {
  const out = await searchLib(env, r);
  if (!out.length) return out;
  const s = await payState(env, user);
  if (s.active) return out;
  return out.map((x) => (isFreeNote(x.noteId) ? x : { noteId: x.noteId, section: x.section, snippet: '', locked: true }));
}
async function extendPass(env, userId, days) {
  const now = Date.now();
  await env.DB.prepare('INSERT INTO pass (user_id, expires_at, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET expires_at = MAX(expires_at, ?) + ?, updated_at = ?')
    .bind(userId, now + days * 86400000, now, now, days * 86400000, now).run();
}
async function payStatus(env, user) { await payTables(env); return { state: await payState(env, user) }; }
const codeNorm = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
async function payRedeem(env, user, r) {
  await payTables(env);
  const code = codeNorm(r.code);
  if (code.length !== 10) fail('That code is not valid. Check it and try again.');
  const claim = await env.DB.prepare('UPDATE codes SET used_by = ?, used_at = ? WHERE code = ? AND used_by IS NULL').bind(user.id, Date.now(), code).run();
  if (!claim.meta || claim.meta.changes !== 1) fail('That code is not valid, or it has already been used.');
  const row = await env.DB.prepare('SELECT days FROM codes WHERE code = ?').bind(code).first();
  try { await extendPass(env, user.id, (row && row.days) || CODE_DAYS); }
  catch (e) { await env.DB.prepare('UPDATE codes SET used_by = NULL, used_at = NULL WHERE code = ?').bind(code).run(); throw e; }
  return { state: await payState(env, user) };
}

// ---------- Paystack: pay by card, bank transfer or USSD ----------
// The pass is only ever switched on after Paystack itself confirms the payment (we ask Paystack, we never trust the browser or the webhook text alone).
const PS_BASE = 'https://api.paystack.co';
async function paystack(env, method, path, body) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(PS_BASE + path, { method, headers: { Authorization: 'Bearer ' + env.PAYSTACK_SECRET_KEY, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal });
    const j = await res.json().catch(() => ({}));
    return { ok: res.ok && j.status === true, j };
  } finally { clearTimeout(timer); }
}
async function hmacHex(secret, text) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(text)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
}
function sameText(a, b) { a = String(a); b = String(b); if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
function newRef() {
  const b = new Uint8Array(8); crypto.getRandomValues(b);
  return 'LL' + Date.now().toString(36) + Array.from(b, (x) => CODE_CHARS[x % 32]).join('');
}
async function payStart(env, user, r) {
  await payTables(env);
  if (!env.PAYSTACK_SECRET_KEY) fail('Card payment is not set up yet. Use a code instead.');
  const c = await payConf(env);
  if (!c.on) fail('Payment is not open yet.');
  if (!(c.price >= 1)) fail('The price has not been set yet.');
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM payments WHERE user_id = ? AND status = \'pending\' AND created_at > ?').bind(user.id, Date.now() - 600000).first();
  if (recent && recent.n >= 5) fail('You have started several payments in a row. Wait a few minutes, then try again.');
  const ref = newRef(), amount = c.price * 100, now = Date.now();
  await env.DB.prepare('INSERT INTO payments (ref, user_id, amount, days, status, created_at) VALUES (?, ?, ?, ?, \'pending\', ?)').bind(ref, user.id, amount, CODE_DAYS, now).run();
  let res;
  try {
    res = await paystack(env, 'POST', '/transaction/initialize', { email: user.email, amount: String(amount), currency: 'NGN', reference: ref, callback_url: String(r.__origin || '') + '/subscribe.html', metadata: { user: user.id, days: CODE_DAYS } });
  } catch (e) { res = { ok: false, j: {} }; }
  if (!res.ok || !res.j.data || !res.j.data.authorization_url) {
    await env.DB.prepare('UPDATE payments SET status = \'failed\' WHERE ref = ? AND status = \'pending\'').bind(ref).run();
    console.error('paystack initialize failed', res.j && res.j.message);
    fail('Could not start the payment. Please try again in a moment.');
  }
  return { url: res.j.data.authorization_url, ref };
}
// Ask Paystack whether this payment really succeeded, then switch the pass on exactly once.
async function payFinalise(env, ref) {
  await payTables(env);
  const row = await env.DB.prepare('SELECT ref, user_id, amount, days, status FROM payments WHERE ref = ?').bind(ref).first();
  if (!row) return 'unknown';
  if (row.status === 'paid') return 'paid';
  const v = await paystack(env, 'GET', '/transaction/verify/' + encodeURIComponent(ref));
  if (!v.ok || !v.j.data) return 'pending';
  const d = v.j.data;
  if (d.status === 'failed') { await env.DB.prepare('UPDATE payments SET status = \'failed\' WHERE ref = ? AND status = \'pending\'').bind(ref).run(); return 'failed'; }
  if (d.status !== 'success') return 'pending';
  if (String(d.reference) !== ref || d.currency !== 'NGN' || Number(d.amount) < row.amount) { console.error('paystack mismatch', ref, d.amount, d.currency); return 'pending'; }
  // Only one caller can flip pending to paid, so a repeated webhook or a refresh cannot add days twice.
  const claim = await env.DB.prepare('UPDATE payments SET status = \'paid\', paid_at = ? WHERE ref = ? AND status = \'pending\'').bind(Date.now(), ref).run();
  if (claim.meta && claim.meta.changes === 1) {
    try { await extendPass(env, row.user_id, row.days); }
    catch (e) { await env.DB.prepare('UPDATE payments SET status = \'pending\', paid_at = NULL WHERE ref = ?').bind(ref).run(); throw e; }
  }
  return 'paid';
}
async function payVerify(env, user, r) {
  await payTables(env);
  const ref = clean(r.ref, 60);
  const row = await env.DB.prepare('SELECT ref FROM payments WHERE ref = ? AND user_id = ?').bind(ref, user.id).first();
  if (!row) fail('That payment was not found on your account.');
  const status = await payFinalise(env, ref);
  return { status, state: await payState(env, user) };
}
async function paystackWebhook(req, env) {
  if (!env.PAYSTACK_SECRET_KEY) return new Response('not set up', { status: 503 });
  const raw = await req.text();
  if (raw.length > 100000) return new Response('too large', { status: 413 });
  const sig = req.headers.get('x-paystack-signature') || '';
  if (!sig || !sameText(sig.toLowerCase(), await hmacHex(env.PAYSTACK_SECRET_KEY, raw))) return new Response('bad signature', { status: 401 });
  let ev; try { ev = JSON.parse(raw); } catch (e) { return new Response('ok', { status: 200 }); }
  if (ev && ev.event === 'charge.success' && ev.data && typeof ev.data.reference === 'string') {
    try { await payFinalise(env, ev.data.reference.slice(0, 60)); }
    catch (e) { console.error('webhook finalise failed', e && e.message); return new Response('try again', { status: 500 }); } // Paystack will retry
  }
  return new Response('ok', { status: 200 });
}
async function payList(env, r) {
  await payTables(env);
  const limit = Math.min(200, Math.max(1, Number(r.limit) || 50));
  const before = /^\d{1,12}$/.test(String(r.before || '')) ? Number(r.before) : Number.MAX_SAFE_INTEGER;
  const { results } = await env.DB.prepare('SELECT p.rowid AS rid, p.ref, p.amount, p.status, p.created_at, p.paid_at, u.email FROM payments p LEFT JOIN users u ON u.id = p.user_id WHERE p.rowid < ? ORDER BY p.rowid DESC LIMIT ?').bind(before, limit + 1).all();
  const more = results.length > limit, rows = results.slice(0, limit);
  return { rows: rows.map((x) => ({ ref: x.ref, email: x.email || '', amount: x.amount / 100, status: x.status, at: x.created_at, paidAt: x.paid_at || 0 })), next: more ? String(rows[rows.length - 1].rid) : '' };
}
async function payRecheck(env, r) {
  const ref = clean(r.ref, 60);
  return { status: await payFinalise(env, ref) };
}
// ----- Admin -----
async function payAdminGet(env) {
  await payTables(env);
  payCfg = { at: 0, v: null };
  const c = await payConf(env), now = Date.now();
  const a = await env.DB.prepare('SELECT COUNT(*) AS n FROM pass WHERE expires_at > ?').bind(now).first();
  const u = await env.DB.prepare('SELECT SUM(CASE WHEN used_by IS NULL THEN 0 ELSE 1 END) AS used, SUM(CASE WHEN used_by IS NULL THEN 1 ELSE 0 END) AS unused FROM codes').first();
  const k = String(env.PAYSTACK_SECRET_KEY || '');
  const p = await env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = \'paid\'').first();
  return { conf: c, active: a ? a.n : 0, codesUsed: (u && u.used) || 0, codesUnused: (u && u.unused) || 0, card: { set: !!k, mode: k.indexOf('sk_live') === 0 ? 'live' : k.indexOf('sk_test') === 0 ? 'test' : k ? 'unknown' : '' }, paid: p ? p.n : 0, revenue: p ? p.total / 100 : 0 };
}
async function paySet(env, r) {
  await payTables(env);
  const cur = await payConf(env);
  const set = [];
  const put = (k, v) => set.push(env.DB.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, String(v)));
  if (r.on !== undefined) { put('pay_on', r.on ? '1' : '0'); if (r.on && !cur.enabledAt) put('pay_enabled_at', Date.now()); }
  if (r.price !== undefined) { const p = Math.round(Number(r.price)); if (!(p >= 0 && p <= 1000000)) fail('Enter a price between 0 and 1,000,000 naira.'); put('pay_price', p); }
  if (r.trial !== undefined) { const t = Math.round(Number(r.trial)); if (!(t >= 0 && t <= 90)) fail('Free days for existing students must be between 0 and 90.'); put('pay_trial', t); }
  if (r.help !== undefined) put('pay_help', clean(r.help, 300));
  if (set.length) await env.DB.batch(set);
  return payAdminGet(env);
}
function newCode() {
  const b = new Uint8Array(10); crypto.getRandomValues(b);
  return Array.from(b, (x) => CODE_CHARS[x % 32]).join('');
}
const showCode = (c) => c.slice(0, 5) + '-' + c.slice(5);
async function codesMake(env, r) {
  await payTables(env);
  const n = Math.round(Number(r.count));
  if (!(n >= 1 && n <= 500)) fail('Choose between 1 and 500 codes.');
  const batch = clean(r.label, 40) || new Date().toISOString().slice(0, 10);
  const set = new Set();
  while (set.size < n) set.add(newCode());
  const now = Date.now(), all = [...set];
  for (let i = 0; i < all.length; i += 50) {
    await env.DB.batch(all.slice(i, i + 50).map((c) => env.DB.prepare('INSERT OR IGNORE INTO codes (code, days, batch, created_at) VALUES (?, ?, ?, ?)').bind(c, CODE_DAYS, batch, now)));
  }
  return { batch, codes: all.map(showCode) };
}
async function codesBatches(env) {
  await payTables(env);
  const { results } = await env.DB.prepare('SELECT batch, COUNT(*) AS n, SUM(CASE WHEN used_by IS NULL THEN 0 ELSE 1 END) AS used, MIN(created_at) AS at FROM codes GROUP BY batch ORDER BY MIN(created_at) DESC LIMIT 100').all();
  return { batches: results.map((x) => ({ batch: x.batch, n: x.n, used: x.used || 0, at: x.at })) };
}
async function codesList(env, r) {
  await payTables(env);
  const limit = Math.min(2000, Math.max(1, Number(r.limit) || 100));
  const before = /^\d{1,12}$/.test(String(r.before || '')) ? Number(r.before) : Number.MAX_SAFE_INTEGER;
  const batch = clean(r.batch, 40), st = String(r.status || '');
  const { results } = await env.DB.prepare(
    'SELECT c.rowid AS rid, c.code, c.batch, c.days, c.created_at, c.used_at, u.email FROM codes c LEFT JOIN users u ON u.id = c.used_by WHERE c.rowid < ? AND (? = \'\' OR c.batch = ?) AND (? = \'\' OR (? = \'used\' AND c.used_by IS NOT NULL) OR (? = \'unused\' AND c.used_by IS NULL)) ORDER BY c.rowid DESC LIMIT ?'
  ).bind(before, batch, batch, st, st, st, limit + 1).all();
  const more = results.length > limit, rows = results.slice(0, limit);
  return { rows: rows.map((x) => ({ code: showCode(x.code), batch: x.batch, days: x.days, at: x.created_at, usedAt: x.used_at || 0, usedBy: x.email || '' })), next: more ? String(rows[rows.length - 1].rid) : '' };
}
async function passFindUser(env, email) {
  email = clean(email, 120).toLowerCase();
  const u = await env.DB.prepare('SELECT id, name, email FROM users WHERE email = ?').bind(email).first();
  if (!u) fail('No student with that email has signed in yet.');
  return u;
}
async function passOut(env, u) { return { name: u.name, email: u.email, state: await payState(env, { id: u.id, admin: false }) }; }
async function passFind(env, r) { await payTables(env); return passOut(env, await passFindUser(env, r.email)); }
async function passGrant(env, r) {
  await payTables(env);
  const days = Math.round(Number(r.days));
  if (!(days >= 1 && days <= 365)) fail('Choose between 1 and 365 days.');
  const u = await passFindUser(env, r.email);
  await extendPass(env, u.id, days);
  return passOut(env, u);
}
async function passRevoke(env, r) {
  await payTables(env);
  const u = await passFindUser(env, r.email);
  await env.DB.prepare('UPDATE pass SET expires_at = 0, updated_at = ? WHERE user_id = ?').bind(Date.now(), u.id).run();
  return passOut(env, u);
}

// ---------- Opening animation: the admin can switch it off and set its length and tagline ----------
let splashCache = { at: 0, v: null };
const SPLASH_TAG = 'Law, learned properly';
async function splashConf(env) {
  if (splashCache.v && Date.now() - splashCache.at < 30000) return splashCache.v;
  await payTables(env);
  const { results } = await env.DB.prepare('SELECT k, v FROM kv WHERE k LIKE \'splash_%\'').all();
  const m = {}; results.forEach((x) => { m[x.k] = x.v; });
  const secs = Number(m.splash_secs);
  const v = { on: m.splash_on !== '0', secs: secs >= 0.8 && secs <= 2.5 ? secs : 1.6, tag: m.splash_tag === undefined ? SPLASH_TAG : m.splash_tag };
  splashCache = { at: Date.now(), v };
  return v;
}
async function splashSet(env, r) {
  const secs = Math.round(Number(r.secs) * 10) / 10;
  if (!(secs >= 0.8 && secs <= 2.5)) fail('Choose a length from 0.8 to 2.5 seconds.');
  const on = r.on === false || r.on === 0 || r.on === '0' ? '0' : '1';
  const tag = clean(r.tag, 60);
  await payTables(env);
  const up = (k, v) => env.DB.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, v);
  await env.DB.batch([up('splash_on', on), up('splash_secs', String(secs)), up('splash_tag', tag)]);
  splashCache = { at: 0, v: null };
  return splashConf(env);
}


// ---------- Terms and privacy: the admin can edit the text; until then the built-in text is shown ----------
let legalCache = { at: 0, v: null };
async function legalGet(env) {
  if (legalCache.v && Date.now() - legalCache.at < 30000) return legalCache.v;
  await payTables(env);
  const { results } = await env.DB.prepare('SELECT k, v FROM kv WHERE k IN (\'legal_text\', \'legal_at\')').all();
  const m = {}; results.forEach((x) => { m[x.k] = x.v; });
  const v = { text: m.legal_text || '', at: Number(m.legal_at) || 0 };
  legalCache = { at: Date.now(), v };
  return v;
}
async function legalSet(env, r) {
  const text = String(r.text === undefined || r.text === null ? '' : r.text).replace(/\r\n/g, '\n').trim().slice(0, 40000);
  if (text && text.length < 50) fail('The text is too short. To go back to the built-in text, clear the box and save.');
  await payTables(env);
  const up = (k, v) => env.DB.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, v);
  await env.DB.batch([up('legal_text', text), up('legal_at', String(text ? Date.now() : 0))]);
  legalCache = { at: 0, v: null };
  return legalGet(env);
}

// ---------- The About page: the admin can edit the text; until then the built-in text is shown ----------
let aboutCache = { at: 0, v: null };
async function aboutGet(env) {
  if (aboutCache.v && Date.now() - aboutCache.at < 30000) return aboutCache.v;
  await payTables(env);
  const { results } = await env.DB.prepare('SELECT k, v FROM kv WHERE k IN (\'about_text\', \'about_at\')').all();
  const m = {}; results.forEach((x) => { m[x.k] = x.v; });
  const v = { text: m.about_text || '', at: Number(m.about_at) || 0 };
  aboutCache = { at: Date.now(), v };
  return v;
}
async function aboutSet(env, r) {
  const text = String(r.text === undefined || r.text === null ? '' : r.text).replace(/\r\n/g, '\n').trim().slice(0, 20000);
  if (text && text.length < 30) fail('The text is too short. To go back to the built-in text, clear the box and save.');
  await payTables(env);
  const up = (k, v) => env.DB.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, v);
  await env.DB.batch([up('about_text', text), up('about_at', String(text ? Date.now() : 0))]);
  aboutCache = { at: 0, v: null };
  return aboutGet(env);
}

// ---------- Announcements: the admin posts, every student sees them ----------
let annReady = false;
async function annTable(env) {
  if (annReady) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS announcements ( id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT \'\', link TEXT NOT NULL DEFAULT \'\', link_label TEXT NOT NULL DEFAULT \'\', created_at INTEGER NOT NULL DEFAULT 0, ends_at INTEGER NOT NULL DEFAULT 0 )').run();
  annReady = true;
}
function annLink(v) {
  v = clean(v, 300);
  if (!v) return '';
  if (/^https:\/\/[^\s<>"']+$/i.test(v)) return v;
  if (/^[a-z0-9-]+\.html(\?[\w=&.%-]{0,100})?$/i.test(v)) return v;
  fail('The link must start with https:// or be a page of the app, such as subscribe.html.');
}
const annRow = (x) => ({ id: x.id, title: x.title, body: x.body, link: x.link, linkLabel: x.link_label, at: x.created_at, ends: x.ends_at });
let annCache = { at: 0, v: null };
async function annList(env) {
  if (annCache.v && Date.now() - annCache.at < 30000) return annCache.v;
  await annTable(env);
  const { results } = await env.DB.prepare('SELECT id, title, body, link, link_label, created_at, ends_at FROM announcements WHERE ends_at = 0 OR ends_at > ? ORDER BY id DESC LIMIT 30').bind(Date.now()).all();
  annCache = { at: Date.now(), v: results.map(annRow) };
  return annCache.v;
}
async function annAdminList(env) {
  await annTable(env);
  const { results } = await env.DB.prepare('SELECT id, title, body, link, link_label, created_at, ends_at FROM announcements ORDER BY id DESC LIMIT 100').all();
  return results.map(annRow);
}
function annFields(r) {
  const title = clean(r.title, 80), body = clean(r.body, 1000);
  if (title.length < 3) fail('Write a title of at least 3 characters.');
  if (body.length < 3) fail('Write the message.');
  const link = annLink(r.link), label = link ? (clean(r.linkLabel, 30) || 'Open') : '';
  const days = Math.round(Number(r.days));
  if (!(days >= 0 && days <= 365)) fail('Days visible must be from 0 to 365. Use 0 to keep it until you delete it.');
  return { title, body, link, label, days };
}
async function annAdd(env, r) {
  const f = annFields(r);
  await annTable(env);
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM announcements').first();
  if (n && n.n >= 300) fail('There are too many announcements. Delete some old ones first.');
  const now = Date.now();
  const ins = await env.DB.prepare('INSERT INTO announcements (title, body, link, link_label, created_at, ends_at) VALUES (?, ?, ?, ?, ?, ?)').bind(f.title, f.body, f.link, f.label, now, f.days ? now + f.days * 86400000 : 0).run();
  annCache = { at: 0, v: null };
  if (r.push === true) { // "Also send as a notification": set up the sending; the admin page and the timer carry it out
    const id = ins && ins.meta && ins.meta.last_row_id;
    return { posted: true, push: await pushBcStart(env, { id: id || 0, title: f.title, body: f.body, link: f.link }) };
  }
  return { posted: true };
}
async function annEdit(env, r) {
  const id = Math.floor(Number(r.id));
  if (!(id > 0)) fail('Choose an announcement.');
  const f = annFields(r);
  await annTable(env);
  const res = await env.DB.prepare('UPDATE announcements SET title = ?, body = ?, link = ?, link_label = ?, ends_at = ? WHERE id = ?').bind(f.title, f.body, f.link, f.label, f.days ? Date.now() + f.days * 86400000 : 0, id).run();
  if (!res.meta || res.meta.changes !== 1) fail('That announcement no longer exists.');
  annCache = { at: 0, v: null };
  return { saved: true };
}
async function annDelete(env, r) {
  const id = Math.floor(Number(r.id));
  if (!(id > 0)) fail('Choose an announcement.');
  await annTable(env);
  await env.DB.prepare('DELETE FROM announcements WHERE id = ?').bind(id).run();
  annCache = { at: 0, v: null };
  return { deleted: true };
}

// ---------- Notifications: messages that reach the phone even when the app is closed ----------
// Standard Web Push: the phone's browser gives us an address, we send an encrypted message to it (RFC 8291) signed with our own key (VAPID, RFC 8292).
// Everything uses the Web Crypto built into Workers. Our signing key is made the first time it is needed and kept in the kv table.
let pushReady = false;
async function pushTables(env) {
  if (pushReady) return;
  await payTables(env); // makes the kv table too
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS push_subs ( id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, p_answer INTEGER NOT NULL DEFAULT 1, p_news INTEGER NOT NULL DEFAULT 1, p_pass INTEGER NOT NULL DEFAULT 1, p_daily INTEGER NOT NULL DEFAULT 0, p_time INTEGER NOT NULL DEFAULT 1140, tz INTEGER NOT NULL DEFAULT 60, next_at INTEGER NOT NULL DEFAULT 0, last_study INTEGER NOT NULL DEFAULT 0, fails INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT 0 )'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS push_subs_user ON push_subs (user_id)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS push_subs_due ON push_subs (next_at) WHERE p_daily = 1'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS push_pass ( user_id TEXT PRIMARY KEY, exp INTEGER NOT NULL DEFAULT 0, stage INTEGER NOT NULL DEFAULT 0 )'),
  ]);
  pushReady = true;
}
// Runs a job after the answer has gone back to the phone, so a slow notification never slows the student down.
const later = (r, p) => {
  const q = Promise.resolve(p).catch((e) => console.error('LawLink background', e && e.stack || e));
  if (r && typeof r.__wait === 'function') r.__wait(q);
  return q;
};
const concat = (...parts) => { const out = new Uint8Array(parts.reduce((n, x) => n + x.length, 0)); let at = 0; for (const x of parts) { out.set(x, at); at += x.length; } return out; };

let vapidCache = null;
async function vapidKeys(env, origin) {
  if (vapidCache) return vapidCache;
  await pushTables(env);
  const get = () => env.DB.prepare('SELECT v FROM kv WHERE k = \'push_vapid\'').first();
  let row = await get();
  if (!row || !row.v) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const pub = b64u(await crypto.subtle.exportKey('raw', kp.publicKey));
    const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
    const sub = /^https:\/\/[\w.-]+$/.test(String(origin || '')) ? origin : 'https://lextabula.lexapp.workers.dev';
    await env.DB.prepare('INSERT OR IGNORE INTO kv (k, v) VALUES (\'push_vapid\', ?)').bind(JSON.stringify({ pub, jwk, sub })).run(); // two phones asking at once: the first key saved is the one used
    row = await get();
  }
  const o = JSON.parse(row.v);
  const priv = await crypto.subtle.importKey('jwk', o.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  vapidCache = { pub: o.pub, priv, sub: o.sub || 'https://lextabula.lexapp.workers.dev' };
  return vapidCache;
}
const pushKey = async (env, origin) => ({ key: (await vapidKeys(env, origin)).pub });

const vapidJwt = new Map(); // one signed pass per notification service, good for 12 hours
async function vapidHeader(env, endpoint) {
  const v = await vapidKeys(env);
  const aud = new URL(endpoint).origin, hit = vapidJwt.get(aud);
  if (hit && hit.exp > Date.now() + 3600000) return hit.h;
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify({ aud, exp, sub: v.sub })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, v.priv, enc.encode(head + '.' + body));
  const h = 'vapid t=' + head + '.' + body + '.' + b64u(sig) + ', k=' + v.pub;
  if (vapidJwt.size > 20) vapidJwt.clear();
  vapidJwt.set(aud, { exp: exp * 1000, h });
  return h;
}

async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}
// RFC 8291 "aes128gcm" encryption of one message for one phone. fix is only for the published test vector.
async function pushEncrypt(s, plain, fix) {
  const ua = b64uBytes(s.p256dh), auth = b64uBytes(s.auth);
  const eph = (fix && fix.pair) || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, eph.privateKey, 256));
  const ikm = await hkdf(auth, secret, concat(enc.encode('WebPush: info\0'), ua, asPub), 32);
  const salt = (fix && fix.salt) || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(plain, new Uint8Array([2]))));
  return concat(salt, new Uint8Array([0, 0, 0x10, 0, asPub.length]), asPub, ct); // salt, record size 4096, key length, our key, the sealed message
}

// Only the real browser notification services are accepted, so a phone cannot make this Worker post to an address of its choosing.
const PUSH_HOST = /^(fcm\.googleapis\.com|([\w-]+\.)+push\.services\.mozilla\.com|([\w-]+\.)*push\.apple\.com|([\w-]+\.)+notify\.windows\.com)$/i;
function pushEndpoint(v) {
  v = clean(v, 700);
  let u = null;
  try { u = new URL(v); } catch (e) { u = null; }
  if (!u || u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443') || !PUSH_HOST.test(u.hostname)) fail('This browser\'s notification service is not supported.');
  return v;
}
// A message as the phone shows it. u is the page to open when the student taps it.
const pushMsg = (t, b, u, g) => ({ t: clean(t, 80), b: clean(b, 160), u: /^[a-z0-9-]+\.html(\?[\w=&.%-]{0,100})?$/i.test(String(u || '')) ? String(u) : 'home.html', g: clean(g, 40) || 'lt' });

// Sends to each phone in subs (rows of push_subs). msg may be a function of the row. Returns counts and tidies phones that are gone.
async function pushDeliver(env, subs, msg, o) {
  const out = { sent: 0, gone: 0, failed: 0 };
  if (!subs.length) return out;
  o = o || {};
  const gone = [], bad = [], healed = [];
  await Promise.all(subs.map(async (s) => {
    try {
      const m = typeof msg === 'function' ? msg(s) : msg;
      const res = await fetch(s.endpoint, {
        method: 'POST',
        headers: { 'Authorization': await vapidHeader(env, s.endpoint), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', 'TTL': String(o.ttl || 86400), 'Urgency': o.urgency || 'normal' },
        body: await pushEncrypt(s, enc.encode(JSON.stringify(m))),
      });
      try { await res.arrayBuffer(); } catch (e) { /* the answer is not needed */ }
      if (res.status >= 200 && res.status < 300) { out.sent++; if (s.fails) healed.push(s.id); }
      else if (res.status === 404 || res.status === 410) { out.gone++; gone.push(s.id); }
      else { out.failed++; bad.push(s.id); console.error('LawLink push refused', res.status); }
    } catch (e) { out.failed++; bad.push(s.id); console.error('LawLink push error', e && e.message || e); }
  }));
  const st = [];
  gone.forEach((id) => st.push(env.DB.prepare('DELETE FROM push_subs WHERE id = ?').bind(id)));
  healed.forEach((id) => st.push(env.DB.prepare('UPDATE push_subs SET fails = 0 WHERE id = ?').bind(id)));
  bad.forEach((id) => st.push(env.DB.prepare('UPDATE push_subs SET fails = fails + 1 WHERE id = ?').bind(id)));
  if (bad.length) st.push(env.DB.prepare('DELETE FROM push_subs WHERE fails >= 8')); // a phone that has refused many times in a row is not coming back
  if (st.length) await env.DB.batch(st);
  return out;
}
async function pushToUser(env, userId, field, msg, o) {
  await pushTables(env);
  const { results } = await env.DB.prepare('SELECT id, endpoint, p256dh, auth, fails FROM push_subs WHERE user_id = ? AND ' + field + ' = 1 LIMIT 5').bind(userId).all();
  return pushDeliver(env, results, msg, o);
}

// ---- What a phone asks for ----
function pushPrefs(p) {
  p = p && typeof p === 'object' ? p : {};
  const flag = (v, d) => (v === undefined || v === null ? d : (v === true || v === 1 || v === '1' ? 1 : 0));
  let time = Math.round(Number(p.time)); if (!(time >= 0 && time <= 1439)) time = 1140; // 7:00 pm
  let tz = Math.round(Number(p.tz)); if (!(tz >= -720 && tz <= 840)) tz = 60; // minutes ahead of UTC; 60 is Nigeria
  return { answer: flag(p.answer, 1), news: flag(p.news, 1), pass: flag(p.pass, 1), daily: flag(p.daily, 0), time, tz };
}
// The next moment after "after" when the phone's own clock shows "time" (minutes after midnight).
function nextDaily(after, time, tz) {
  const local = after + tz * 60000;
  let t = Math.floor(local / 86400000) * 86400000 + time * 60000;
  if (t <= local) t += 86400000;
  return t - tz * 60000;
}
async function pushSubscribe(env, user, r) {
  await pushTables(env);
  const s = r.sub && typeof r.sub === 'object' ? r.sub : {}, k = s.keys && typeof s.keys === 'object' ? s.keys : {};
  const endpoint = pushEndpoint(s.endpoint), p256 = clean(k.p256dh, 120), auth = clean(k.auth, 60);
  let good = false;
  try { good = b64uBytes(p256).length === 65 && b64uBytes(auth).length === 16; } catch (e) { good = false; }
  if (!good) fail('This phone gave an unreadable notification key. Turn notifications off and on again.');
  const pr = pushPrefs(r.prefs), now = Date.now(), next = pr.daily ? nextDaily(now, pr.time, pr.tz) : 0;
  await env.DB.prepare('INSERT INTO push_subs (endpoint, user_id, p256dh, auth, p_answer, p_news, p_pass, p_daily, p_time, tz, next_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
    'ON CONFLICT(endpoint) DO UPDATE SET last_study = CASE WHEN push_subs.user_id = excluded.user_id THEN push_subs.last_study ELSE 0 END, ' +
    'next_at = CASE WHEN excluded.p_daily = 0 THEN 0 WHEN push_subs.p_daily = 1 AND push_subs.p_time = excluded.p_time AND push_subs.tz = excluded.tz AND push_subs.next_at > 0 AND push_subs.user_id = excluded.user_id THEN push_subs.next_at ELSE excluded.next_at END, ' +
    'user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, p_answer = excluded.p_answer, p_news = excluded.p_news, p_pass = excluded.p_pass, p_daily = excluded.p_daily, p_time = excluded.p_time, tz = excluded.tz, fails = 0')
    .bind(endpoint, user.id, p256, auth, pr.answer, pr.news, pr.pass, pr.daily, pr.time, pr.tz, next, now).run();
  await env.DB.prepare('DELETE FROM push_subs WHERE user_id = ? AND id NOT IN (SELECT id FROM push_subs WHERE user_id = ? ORDER BY id DESC LIMIT 5)').bind(user.id, user.id).run(); // five phones per student is plenty
  return { on: true };
}
async function pushUnsubscribe(env, user, r) {
  await pushTables(env);
  await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?').bind(clean(r.endpoint, 700), user.id).run();
  return { on: false };
}
const pushTestAt = new Map();
async function pushTest(env, user, r) {
  await pushTables(env);
  const now = Date.now();
  if (now - (pushTestAt.get(user.id) || 0) < 15000) fail('Wait a few seconds, then try again.');
  if (pushTestAt.size > 2000) pushTestAt.clear();
  pushTestAt.set(user.id, now);
  const s = await env.DB.prepare('SELECT id, endpoint, p256dh, auth, fails FROM push_subs WHERE endpoint = ? AND user_id = ?').bind(clean(r.endpoint, 700), user.id).first();
  if (!s) fail('This phone is not registered for notifications. Turn them off and on again.');
  const out = await pushDeliver(env, [s], pushMsg('Notifications are on', 'You will see Lex-Tabulā messages on this phone.', 'settings.html', 'test'), { ttl: 300 });
  if (!out.sent) fail(out.gone ? 'This phone\'s notification address has expired. Turn notifications off and on again.' : 'The notification service did not accept the message. Try again in a minute.');
  return { sent: true };
}

// ---- 1. Someone answered my question ----
async function pushAnswer(env, post, replierId) {
  if (!post || post.type !== 'Question' || post.user_id === replierId) return;
  await pushToUser(env, post.user_id, 'p_answer', pushMsg('New answer to your question', '“' + clean(post.title, 100) + '”', 'community.html?t=' + post.id, 'ans-' + String(post.id).slice(0, 20)), { urgency: 'high', ttl: 86400 });
}
// The daily reminder is skipped on a day the student has already taken a quiz or an IRAC test.
async function pushStudied(env, userId) {
  try { await pushTables(env); await env.DB.prepare('UPDATE push_subs SET last_study = ? WHERE user_id = ? AND p_daily = 1').bind(Date.now(), userId).run(); }
  catch (e) { /* the worst case is one reminder too many */ }
}

// ---- 2. An announcement from the admin, sent in small groups so it fits Cloudflare's limits; the admin page keeps it going and the timer finishes anything left ----
const pushChunk = (env) => Math.min(500, Math.max(1, Math.floor(Number(env.PUSH_CHUNK)) || 6));
const bcUp = (env, k, v) => env.DB.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, v);
async function pushBcStart(env, ann) {
  await pushTables(env);
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subs WHERE p_news = 1').first();
  const total = (n && n.n) || 0;
  if (!total) return { total: 0 };
  const bc = { ann: ann.id, t: ann.title, b: ann.body, u: ann.link && !/^https:/i.test(ann.link) ? ann.link : 'notices.html', after: 0, sent: 0, total, at: Date.now(), done: false };
  await env.DB.batch([bcUp(env, 'push_bc', JSON.stringify(bc)), bcUp(env, 'push_bc_last', String(bc.at))]);
  return { total };
}
async function pushBcStep(env, max) {
  await pushTables(env);
  const row = await env.DB.prepare('SELECT v FROM kv WHERE k = \'push_bc\'').first();
  let bc = null;
  try { bc = row && row.v ? JSON.parse(row.v) : null; } catch (e) { bc = null; }
  if (!bc || bc.done) return { used: 0, sent: bc ? bc.sent : 0, total: bc ? bc.total : 0, left: 0, done: true };
  const found = (await env.DB.prepare('SELECT id, endpoint, p256dh, auth, fails FROM push_subs WHERE p_news = 1 AND id > ? ORDER BY id LIMIT ?').bind(bc.after, max + 1).all()).results;
  const results = found.slice(0, max); // one extra row is read only to know whether this is the last group
  const next = Object.assign({}, bc, { sent: bc.sent + results.length });
  if (results.length) next.after = results[results.length - 1].id;
  if (found.length <= max) next.done = true;
  // Move the place-marker first. If the timer and the admin page ask at the same moment, only one of them gets this group.
  const claim = await env.DB.prepare('UPDATE kv SET v = ? WHERE k = \'push_bc\' AND v = ?').bind(JSON.stringify(next), row.v).run();
  if (!claim.meta || claim.meta.changes !== 1) return { used: 0, sent: bc.sent, total: bc.total, left: Math.max(bc.total - bc.sent, 0), done: false, busy: true };
  await pushDeliver(env, results, pushMsg(bc.t, bc.b, bc.u, 'ann-' + bc.ann), { ttl: 86400 });
  return { used: results.length, sent: next.sent, total: next.total, left: next.done ? 0 : Math.max(next.total - next.sent, 0), done: next.done };
}
async function pushInfo(env) {
  await pushTables(env);
  const n = await env.DB.prepare('SELECT COUNT(*) AS phones, COUNT(DISTINCT user_id) AS students, COALESCE(SUM(p_news), 0) AS news FROM push_subs').first();
  const row = await env.DB.prepare('SELECT v FROM kv WHERE k = \'push_bc\'').first();
  const last = await env.DB.prepare('SELECT v FROM kv WHERE k = \'push_bc_last\'').first();
  let bc = null;
  try { bc = row && row.v ? JSON.parse(row.v) : null; } catch (e) { bc = null; }
  return { phones: n.phones, students: n.students, news: n.news, last: Number(last && last.v) || 0, bc: bc ? { sent: bc.sent, total: bc.total, done: !!bc.done, title: bc.t } : null, chunk: pushChunk(env) };
}

// ---- 3. The pass (or the free trial) is about to end ----
async function pushPassRun(env, now, max) {
  const c = await payConf(env);
  if (!c.on) return 0;
  const win = now + 3 * 86400000, day = now + 86400000, users = Math.max(1, Math.ceil(max / 2));
  const due = [];
  const a = await env.DB.prepare('SELECT p.user_id AS u, p.expires_at AS e FROM pass p LEFT JOIN push_pass n ON n.user_id = p.user_id WHERE p.expires_at > ? AND p.expires_at <= ? AND EXISTS (SELECT 1 FROM push_subs s WHERE s.user_id = p.user_id AND s.p_pass = 1) AND (COALESCE(n.exp, 0) != p.expires_at OR (n.stage = 3 AND p.expires_at <= ?)) ORDER BY p.expires_at LIMIT ?').bind(now, win, day, users).all();
  a.results.forEach((x) => due.push({ u: x.u, e: x.e, kind: 'pass' }));
  const tEnd = c.enabledAt + c.trial * 86400000;
  if (c.enabledAt && c.trial > 0 && tEnd > now && tEnd <= win && due.length < users) {
    const admins = String(env.ADMIN_EMAILS || '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean); // the admin never needs a pass
    const t = await env.DB.prepare('SELECT s.user_id AS u FROM (SELECT DISTINCT user_id FROM push_subs WHERE p_pass = 1) s JOIN users x ON x.id = s.user_id LEFT JOIN pass p ON p.user_id = s.user_id LEFT JOIN push_pass n ON n.user_id = s.user_id WHERE x.created_at < ? AND COALESCE(p.expires_at, 0) <= ? AND (COALESCE(n.exp, 0) != ? OR (n.stage = 3 AND ? <= ?))' + (admins.length ? ' AND x.email NOT IN (' + admins.map(() => '?').join(',') + ')' : '') + ' LIMIT ?').bind(c.enabledAt, now, tEnd, tEnd, day, ...admins, users - due.length).all();
    t.results.forEach((x) => due.push({ u: x.u, e: tEnd, kind: 'trial' }));
  }
  if (!due.length) return 0;
  // Claim each one first (the same stage is never sent twice), then send.
  const claims = due.map((d) => { d.stage = d.e - now <= 86400000 ? 1 : 3; return env.DB.prepare('INSERT INTO push_pass (user_id, exp, stage) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET exp = excluded.exp, stage = excluded.stage WHERE push_pass.exp != excluded.exp OR push_pass.stage != excluded.stage').bind(d.u, d.e, d.stage); });
  const res = await env.DB.batch(claims);
  const mine = due.filter((d, i) => res[i] && res[i].meta && res[i].meta.changes === 1);
  if (!mine.length) return 0;
  const by = {}; mine.forEach((d) => { by[d.u] = d; });
  const ids = Object.keys(by);
  const { results } = await env.DB.prepare('SELECT id, endpoint, p256dh, auth, fails, user_id FROM push_subs WHERE p_pass = 1 AND user_id IN (' + ids.map(() => '?').join(',') + ') LIMIT ?').bind(...ids, max).all();
  const text = (s) => {
    const d = by[s.user_id], n = Math.max(1, Math.ceil((d.e - now) / 86400000));
    if (d.kind === 'trial') return d.stage === 1 ? pushMsg('Your free access ends within a day', 'Get the Lex-Tabulā pass to keep every topic, quiz and test open.', 'subscribe.html', 'pass') : pushMsg('Your free access ends in ' + n + ' days', 'Get the Lex-Tabulā pass to keep every topic, quiz and test open.', 'subscribe.html', 'pass');
    return d.stage === 1 ? pushMsg('Your pass ends within a day', 'Renew now to keep studying without a break.', 'subscribe.html', 'pass') : pushMsg('Your pass ends in ' + n + ' days', 'Renew now to keep every topic, quiz and test open.', 'subscribe.html', 'pass');
  };
  await pushDeliver(env, results, text, { ttl: 86400 });
  return results.length;
}

// ---- 4. The daily study reminder, at the time the student chose ----
const DAILY = [
  ['Time to study', 'Take one quiz today. A few minutes is enough.'],
  ['Your daily study time', 'Pick a topic and take its quiz.'],
  ['Ready to study?', 'One quiz today keeps your streak going.'],
  ['Study time', 'Open a topic you have not finished and take its quiz.'],
  ['Keep going', 'Short, regular study beats one long night before the exam.'],
];
async function pushDailyRun(env, now, max) {
  const { results } = await env.DB.prepare('SELECT id, endpoint, p256dh, auth, fails, p_time, tz, next_at, last_study FROM push_subs WHERE p_daily = 1 AND next_at > 0 AND next_at <= ? ORDER BY next_at LIMIT ?').bind(now, max).all();
  if (!results.length) return 0;
  const claims = [], plan = [];
  results.forEach((s) => {
    const dayStart = Math.floor((s.next_at + s.tz * 60000) / 86400000) * 86400000 - s.tz * 60000; // the start of that day on the phone's clock
    plan.push(now - s.next_at > 3 * 3600000 || s.last_study >= dayStart); // too late to be useful, or already studied today: just move on
    claims.push(env.DB.prepare('UPDATE push_subs SET next_at = ? WHERE id = ? AND next_at = ?').bind(nextDaily(now, s.p_time, s.tz), s.id, s.next_at));
  });
  const res = await env.DB.batch(claims);
  const mine = results.filter((s, i) => !plan[i] && res[i] && res[i].meta && res[i].meta.changes === 1);
  const d = DAILY[Math.floor((now + 3600000) / 86400000) % DAILY.length];
  await pushDeliver(env, mine, pushMsg(d[0], d[1], 'home.html', 'daily'), { ttl: 3600 });
  return mine.length;
}

// The timer (every minute) does the reminders and the pass warnings, then spends what is left of its allowance finishing an announcement.
async function pushCron(env, now) {
  await pushTables(env);
  let left = pushChunk(env);
  for (const job of [pushPassRun, pushDailyRun, (e, n, m) => pushBcStep(e, m).then((x) => x.used)]) {
    if (left <= 0) break;
    try { left -= await job(env, now, left); } catch (e) { console.error('LawLink timer', e && e.stack || e); }
  }
}

// ---------- Routing ----------
const SETUP_OPEN = new Set(['auth.renew', 'sync.get', 'sync.put', 'profile.get', 'profile.setup', 'account.delete', 'pay.status']);
// ---------- The main tables ----------
// The app creates these itself the first time it runs, so setting up the database by hand is optional. (The rest are created when first used.)
// Keep in step with database-tables.sql: schema-test.mjs checks that they match.
const CORE_TABLES = ['users', 'sync', 'posts', 'replies', 'lib_notes', 'lib_sections', 'cases', 'reports'];
const CORE_SQL = [
  "CREATE TABLE IF NOT EXISTS users ( id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, created_at INTEGER NOT NULL );",
  "CREATE TABLE IF NOT EXISTS sync ( user_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL );",
  "CREATE TABLE IF NOT EXISTS posts ( id TEXT PRIMARY KEY, user_id TEXT NOT NULL, author TEXT NOT NULL, level TEXT NOT NULL DEFAULT '', type TEXT NOT NULL, course TEXT NOT NULL DEFAULT '', title TEXT NOT NULL, body TEXT NOT NULL, replies INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL );",
  "CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at);",
  "CREATE TABLE IF NOT EXISTS replies ( id TEXT PRIMARY KEY, post_id TEXT NOT NULL, user_id TEXT NOT NULL, author TEXT NOT NULL, level TEXT NOT NULL DEFAULT '', body TEXT NOT NULL, created_at INTEGER NOT NULL );",
  "CREATE INDEX IF NOT EXISTS idx_replies_post ON replies(post_id, created_at);",
  "CREATE TABLE IF NOT EXISTS lib_notes ( note_id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'generating', score INTEGER NOT NULL DEFAULT 0, verified INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL );",
  "CREATE TABLE IF NOT EXISTS lib_sections ( note_id TEXT NOT NULL, key TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (note_id, key) );",
  "CREATE TABLE IF NOT EXISTS cases ( case_id TEXT PRIMARY KEY, name TEXT NOT NULL, citation TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'cited', data TEXT NOT NULL DEFAULT '', cited_in TEXT NOT NULL DEFAULT '[]', updated_at INTEGER NOT NULL );",
  "CREATE TABLE IF NOT EXISTS reports ( id TEXT PRIMARY KEY, note_id TEXT NOT NULL, user_id TEXT NOT NULL, message TEXT NOT NULL, created_at INTEGER NOT NULL );",
  "CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at);"
];
let coreReady = false;
async function coreTables(env) {
  if (coreReady) return;
  if (!env.DB) fail('The database is not connected yet. Check the database ID in wrangler.jsonc.');
  let have = null;
  try { have = await env.DB.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN (" + CORE_TABLES.map((t) => "'" + t + "'").join(', ') + ')').first(); } catch (e) { have = null; } // if the look-up fails, just run the commands below
  if (!have || Number(have.n) < CORE_TABLES.length) {
    for (const s of CORE_SQL) await env.DB.prepare(s).run(); // one at a time: each one is harmless if the table is already there
  }
  coreReady = true;
}

async function route(r, env) {
  await coreTables(env);
  const a = String(r.action || '');
  if (a === 'auth.google') return authGoogle(r, env);
  if (a === 'lib.get') return libGetFor(env, String(r.noteId || ''), await softUser(r, env));
  if (a === 'lib.list') return libList(env, r.prefixes);
  if (a === 'case.get') return caseGet(env, slug(r.id));
  if (a === 'auth.get') { await loadAliases(env); return authGet(env, String(r.id || '')); }
  if (a === 'auth.list') return authList(env, r.kind);
  if (a === 'auth.find') return authFind(env, r.q);
  if (a === 'courses.list') return coursesList(env);
  if (a === 'quiz.list') return quizList(env, r.prefix);
  if (a === 'irac.list') return iracList(env, r);
  if (a === 'search.lib') return searchLibFor(env, r, await softUser(r, env));
  if (a === 'app.conf') return { splash: await splashConf(env) };
  if (a === 'ann.list') return annList(env);
  if (a === 'legal.get') return legalGet(env);
  if (a === 'about.get') return aboutGet(env);
  if (a === 'push.key') return pushKey(env, r.__origin);

  const user = await authUser(r.token, env);
  // A student who has not finished the first-time screen can only reach the few actions needed to finish it.
  if (!user.admin && a.indexOf('gen.') !== 0 && !SETUP_OPEN.has(a) && !(await setupDone(env, user))) fail(SETUP_MSG);
  switch (a) {
    case 'auth.renew': return authRenew(env, user);
    case 'sync.get': return syncGet(env, user);
    case 'sync.put': return syncPut(env, user, r);
    case 'posts.list': await needComm(env, user); return postsList(env, user, r);
    case 'posts.get': await needComm(env, user); return postGet(env, user, r.id);
    case 'replies.helpful': await needComm(env, user); return replyHelpful(env, user, r.id);
    case 'posts.best': await needComm(env, user); return postBest(env, user, r);
    case 'comm.report': await needComm(env, user); return commReport(env, user, r);
    case 'comm.notify': if (!(await payState(env, user)).active) return { n: 0, posts: 0 }; return commNotify(env, user, r);
    case 'posts.create': await needComm(env, user); return postCreate(env, user, r);
    case 'posts.delete': return postDelete(env, user, r.id);
    case 'replies.create': await needComm(env, user); return replyCreate(env, user, r);
    case 'replies.delete': return replyDelete(env, user, r.id);
    case 'lib.report': return libReport(env, user, r);
    case 'req.law': return requestLaw(env, user, r);
    case 'quiz.get': return quizGet(env, r, user);
    case 'quiz.submit': return quizSubmit(env, r, user);
    case 'account.delete': return accountDelete(env, user, r);
    case 'pay.status': return payStatus(env, user);
    case 'pay.redeem': return payRedeem(env, user, r);
    case 'pay.start': return payStart(env, user, r);
    case 'pay.verify': return payVerify(env, user, r);
    case 'profile.get': return profileGet(env, user);
    case 'profile.setup': return profileSetup(env, user, r);
    case 'profile.save': return profileSave(env, user, r);
    case 'profile.tour': return profileTour(env, user);
    case 'irac.get': return iracGet(env, r, user);
    case 'irac.submit': return iracSubmit(env, r, user);
    case 'push.subscribe': return pushSubscribe(env, user, r);
    case 'push.unsubscribe': return pushUnsubscribe(env, user, r);
    case 'push.test': return pushTest(env, user, r);
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
      case 'gen.markNext': return markNext(env, r);
      case 'gen.addStandard': return addStandard(env);
      case 'gen.addMaxims': return addMaxims(env);
      case 'gen.addLaw': return addLaw(env, r);
      case 'gen.importLaw': return importLaw(env, r);
      case 'gen.mergeLaw': return mergeLaw(env, r);
      case 'gen.lawCurrency': return lawCurrency(env, r);
      case 'gen.purgeLaws': return purgeLaws(env, r);
      case 'gen.authBatch': return genAuthBatch(env, r.ids);
      case 'gen.quizGet': return quizAdminGet(env, r);
      case 'gen.quizStats': return quizStats(env, r);
      case 'gen.iracList': return iracAdminList(env, r);
      case 'gen.reviewSummary': return reviewSummary(env, r);
      case 'gen.annAdminList': return annAdminList(env);
      case 'gen.annAdd': return annAdd(env, r);
      case 'gen.annDelete': return annDelete(env, r);
      case 'gen.annEdit': return annEdit(env, r);
      case 'gen.pushInfo': return pushInfo(env);
      case 'gen.pushSend': return pushBcStep(env, pushChunk(env));
      case 'gen.aboutSet': return aboutSet(env, r);
      case 'gen.splashGet': return splashConf(env);
      case 'gen.splashSet': return splashSet(env, r);
      case 'gen.legalSet': return legalSet(env, r);
      case 'gen.quizCapGet': return quizCapGet(env);
      case 'gen.quizCapSet': return quizCapSet(env, r);
      case 'gen.payGet': return payAdminGet(env);
      case 'gen.payList': return payList(env, r);
      case 'gen.payRecheck': return payRecheck(env, r);
      case 'gen.paySet': return paySet(env, r);
      case 'gen.codesMake': return codesMake(env, r);
      case 'gen.codesList': return codesList(env, r);
      case 'gen.codesBatches': return codesBatches(env);
      case 'gen.passFind': return passFind(env, r);
      case 'gen.passGrant': return passGrant(env, r);
      case 'gen.passRevoke': return passRevoke(env, r);
      case 'gen.usersList': return usersList(env, r);
      case 'gen.usersResetName': return usersResetName(env, r);
      case 'gen.iracMake': return iracMake(env, r);
      case 'gen.iracSave': return iracSave(env, r);
      case 'gen.quizMake': return quizMake(env, r);
      case 'gen.quizSave': return quizSave(env, r);
      case 'gen.courseSave': return courseSave(env, r);
      case 'gen.courseHide': return courseHide(env, r);
      case 'gen.courseList': return coursesList(env, true);
      case 'gen.addCase': return addCase(env, r);
      case 'gen.commReports': return commReports(env, user);
      case 'gen.commReview': return commReview(env, user, r);
      case 'gen.commPin': return commPin(env, user, r);
      case 'gen.commVerify': return commVerify(env, user, r);
      case 'gen.commMute': return commMute(env, user, r);
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

// ---------- Several questions in one request (the app groups what a page asks for in its first moments) ----------
const BATCH_OK = new Set(['app.conf', 'ann.list', 'legal.get', 'pay.status', 'profile.get', 'courses.list', 'quiz.list', 'irac.list', 'lib.list', 'sync.get', 'comm.notify']);
const BATCH_MAX = 6;
async function routeBatch(r, env) {
  const calls = Array.isArray(r.calls) ? r.calls : [];
  if (!calls.length || calls.length > BATCH_MAX) fail('Bad request.');
  const results = [];
  for (const c of calls) {
    const sub = (c && typeof c === 'object') ? c : {};
    if (!BATCH_OK.has(String(sub.action || ''))) { results.push({ ok: false, error: 'Bad request.' }); continue; }
    sub.__origin = r.__origin;
    sub.__wait = r.__wait;
    try { results.push({ ok: true, data: await route(sub, env) }); }
    catch (e) {
      if (e instanceof UserError) results.push({ ok: false, error: e.message });
      else { console.error('LawLink error', e && e.stack || e); results.push({ ok: false, error: 'Something went wrong. Please try again.' }); }
    }
  }
  return { results };
}

// ---------- Daily fair-use guard: one phone cannot use up the whole day's allowance ----------
// Kept in memory, so it costs nothing, and it is a best-effort guard (Cloudflare runs several copies of this code).
const DAY_CAP = 2500;
let capDay = '', capMap = new Map();
function capCheck(who, n) { // true when this phone is over today's allowance
  const day = new Date().toISOString().slice(0, 10);
  if (day !== capDay || capMap.size > 50000) { capDay = day; capMap = new Map(); }
  const used = (capMap.get(who) || 0) + n;
  capMap.set(who, used);
  return used > DAY_CAP;
}

export default {
  // The timer set in wrangler.jsonc (every minute): daily study reminders, pass warnings, and finishing an announcement.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(coreTables(env).then(() => pushCron(env, (event && event.scheduledTime) || Date.now())).catch((e) => console.error('LawLink timer', e && e.stack || e)));
  },
  async fetch(req, env, ctx) {
    // Website files are served by Cloudflare itself. Only /api (and the front door) reach this code.
    const u = new URL(req.url);
    if (u.pathname === '/api/paystack' && req.method === 'POST') return paystackWebhook(req, env);
    if (env.ASSETS) {
      if (u.pathname === '/') return env.ASSETS.fetch(new Request(new URL('/home.html', u), req));
      if (u.pathname !== '/api') return env.ASSETS.fetch(req);
    }
    const cors = corsFor(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: cors.ok ? 204 : 403, headers: cors.headers });
    if (!cors.ok) return respond({ ok: false, error: 'This website is not allowed to use the API.' }, cors, 403);
    if (req.method === 'GET') return respond({ ok: true, data: 'Lex-Tabulā API is running' }, cors);
    if (req.method !== 'POST') return respond({ ok: false, error: 'Method not allowed.' }, cors, 405);
    try {
      const text = await req.text();
      if (text.length > 200000) fail('That request is too large.');
      let r;
      try { r = JSON.parse(text); } catch (e) { fail('Bad request.'); }
      r = (r && typeof r === 'object') ? r : {};
      r.__origin = u.origin; // set here, never taken from the browser
      r.__wait = (p) => { try { if (ctx) ctx.waitUntil(p); } catch (e) { /* no background slot: the job still runs */ } }; // lets a notification go out after the answer is sent
      const who = String(r.token || '').slice(-48) || req.headers.get('CF-Connecting-IP') || 'anon';
      const isBatch = r.action === 'batch';
      const admin = isBatch ? false : String(r.action || '').indexOf('gen.') === 0;
      if (!admin && capCheck(who, isBatch && Array.isArray(r.calls) ? r.calls.length : 1)) {
        // Students who have paid (and the admin) are never held to the daily allowance. The check only costs a read once the allowance is passed.
        const pu = await softUser(r, env), ps = pu ? await payState(env, pu) : null;
        if (!(ps && (ps.why === 'pass' || ps.why === 'admin'))) fail('This phone has used a lot of Lex-Tabulā today. Please try again tomorrow.');
      }
      return respond({ ok: true, data: isBatch ? await routeBatch(r, env) : await route(r, env) }, cors);
    } catch (e) {
      if (e instanceof UserError) return respond({ ok: false, error: e.message }, cors);
      console.error('LawLink error', e && e.stack || e);
      return respond({ ok: false, error: 'Something went wrong. Please try again.' }, cors, 500);
    }
  },
};
