#!/usr/bin/env node
// WhistMate sandbox server — the whole app on one local port, with nothing real behind it.
//
//   node sandbox/server.mjs --port 4600 [--no-build] [--host 127.0.0.1] [--quiet] [--page-cap 500]
//
// It builds the frontend (unless --no-build) into sandbox/.dist with VITE_BASE44_APP_ID=sandbox, serves
// it, and answers the Base44 REST API the frontend calls (/api/...) from memory: sign-in, the entity
// endpoints (honouring each entity's `rls` block) and the 31 backend functions, which are the REAL
// base44/functions/*/entry.ts files run against an in-memory store (see backend.mjs). Data is seeded
// through those same functions (seed.mjs). See README.md for users, tokens and what is simulated.
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, rmdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const STARTED_AT = Date.now();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DIST = path.join(HERE, '.dist');

// ---- command line ----
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name, fallback) => {
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1] !== undefined) return argv[i + 1];
  const inline = argv.find((a) => a.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : fallback;
};
if (flag('--help') || flag('-h')) {
  console.log('Usage: node sandbox/server.mjs [--port 4600] [--no-build] [--host 127.0.0.1] [--quiet] [--page-cap 500]');
  process.exit(0);
}
const PORT = Number(option('--port', process.env.PORT || 4600));
const HOST = option('--host', '127.0.0.1');
const QUIET = flag('--quiet');
const PAGE_CAP = Number(option('--page-cap', 500));
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) { console.error(`Invalid --port: ${option('--port')}`); process.exit(2); }

// The backend functions are TypeScript; Node strips the types itself from 22.18 on, behind a flag before.
if (!process.features?.typescript) {
  const again = spawnSync(process.execPath, ['--experimental-strip-types', fileURLToPath(import.meta.url), ...argv], { stdio: 'inherit' });
  process.exit(again.status ?? 1);
}

const log = (...args) => { if (!QUIET) console.log('[sandbox]', ...args); };

// ---- build the frontend ----
// Built in a temp folder and copied into sandbox/.dist under a lock, so several instances started at
// the same moment do not trample each other's build.
function buildFrontend() {
  const vite = path.join(ROOT, 'node_modules/vite/bin/vite.js');
  if (!existsSync(vite)) throw new Error('node_modules/vite is missing — the sandbox uses the project\'s own vite (it never installs anything).');
  const lock = path.join(os.tmpdir(), `whist-sandbox-build-${createHash('sha1').update(ROOT).digest('hex').slice(0, 12)}.lock`);
  const waitUntil = Date.now() + 10 * 60_000;
  for (;;) {
    try { mkdirSync(lock); break; } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let age = 0;
      try { age = Date.now() - statSync(lock).mtimeMs; } catch { continue; }
      if (age > 10 * 60_000 || Date.now() > waitUntil) { try { rmdirSync(lock); } catch { /* someone else took it */ } continue; }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
    }
  }
  try {
    const index = path.join(DIST, 'index.html');
    if (existsSync(index) && statSync(index).mtimeMs >= STARTED_AT) {
      log('another instance just built the frontend — using that build');
      return;
    }
    log('building the frontend into sandbox/.dist (use --no-build to skip) ...');
    const out = mkdtempSync(path.join(os.tmpdir(), 'whist-sandbox-dist-'));
    try {
      const result = spawnSync(process.execPath, [vite, 'build', '--outDir', out, '--emptyOutDir', '--logLevel', 'warn'], {
        cwd: ROOT,
        stdio: ['ignore', QUIET ? 'ignore' : 'inherit', 'inherit'],
        // Real environment variables win over any .env file, so the bundle can only ever talk to this server:
        // app id "sandbox", no app base URL (sign-in/out redirects stay on this origin), relative /api.
        env: { ...process.env, VITE_BASE44_APP_ID: 'sandbox', VITE_BASE44_APP_BASE_URL: '', VITE_BASE44_FUNCTIONS_VERSION: '', BASE44_LEGACY_SDK_IMPORTS: 'false' },
      });
      if (result.status !== 0 || !existsSync(path.join(out, 'index.html'))) throw new Error(`vite build failed (exit ${result.status})`);
      mkdirSync(DIST, { recursive: true });
      cpSync(out, DIST, { recursive: true, force: true });
      const walk = (dir, base = '') => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name), `${base}${e.name}/`) : [`${base}${e.name}`]));
      const fresh = new Set(walk(out));
      for (const file of walk(DIST)) if (!fresh.has(file)) rmSync(path.join(DIST, file), { force: true });
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  } finally {
    try { rmdirSync(lock); } catch { /* already gone */ }
  }
}

if (!flag('--no-build')) buildFrontend();
if (!existsSync(path.join(DIST, 'index.html'))) {
  console.error('[sandbox] sandbox/.dist/index.html is missing — start once without --no-build so the frontend gets built.');
  process.exit(1);
}

// ---- the in-memory backend, seeded through the real functions ----
const { createBackend, APP_ID } = await import('./backend.mjs');
const { seed, PASSWORD, GOOGLE_USER_EMAIL, SEED_USERS } = await import('./seed.mjs');
const backend = await createBackend({ seed, pageCap: PAGE_CAP, log });
const { store, state } = backend;
for (const warning of state.seedSummary?.warnings || []) console.warn('[sandbox] seed warning:', warning);

// A reset swaps the whole store (and, while the seed runs, the clock), so it never overlaps a request:
// it waits for the requests in flight and holds new ones back until the data is in place again.
let active = 0;
let whenIdle = null;
let resetting = null;
async function withStore(run) {
  while (resetting) await resetting;
  active += 1;
  try {
    return await run();
  } finally {
    active -= 1;
    if (active === 0 && whenIdle) { whenIdle(); whenIdle = null; }
  }
}
async function resetStore() {
  while (resetting) await resetting;
  let done;
  resetting = new Promise((resolve) => { done = resolve; });
  try {
    if (active > 0) await new Promise((resolve) => { whenIdle = resolve; });
    await backend.reset();
  } finally {
    resetting = null;
    done();
  }
}

// ---- small HTTP helpers ----
const send = (res, status, body, headers = {}) => {
  const data = body == null ? '' : typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': typeof body === 'string' || Buffer.isBuffer(body) ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(data);
};
const fail = (res, status, message, extra = {}) => send(res, status, { message, detail: message, ...extra });
const readBody = (req, limit = 2_000_000) => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > limit) { reject(Object.assign(new Error('Request body too large'), { status: 413 })); req.destroy(); return; }
    chunks.push(chunk);
  });
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});
async function readJson(req) {
  const raw = (await readBody(req)).toString('utf8');
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); } catch { throw Object.assign(new Error('Request body is not valid JSON'), { status: 400 }); }
}
const originOf = (req) => `http://${req.headers.host || `localhost:${PORT}`}`;
// Redirect targets must stay on this server: a sandbox never sends a browser anywhere real.
function localUrl(req, target, fallback = '/') {
  try {
    const url = new URL(target || fallback, originOf(req));
    return url.origin === originOf(req) ? url : new URL(fallback, originOf(req));
  } catch {
    return new URL(fallback, originOf(req));
  }
}
const normEmail = (email) => String(email || '').trim().toLowerCase();
const mail = (to, subject, text, extra = {}) => state.outbox.push({ at: new Date().toISOString(), to, subject, text, ...extra });

// ---- auth (/api/apps/:appId/auth/*) ----
async function authRoute(req, res, action, caller) {
  const body = await readJson(req);
  const email = normEmail(body.email);
  switch (action) {
    case 'login': {
      const user = backend.findUserByEmail(email);
      if (!user && state.pending.has(email)) return fail(res, 400, 'Email not verified yet — enter the code we sent you.');
      if (!user || backend.passwordOf(user.id) !== String(body.password ?? '')) return fail(res, 400, 'Invalid email or password');
      return send(res, 200, { access_token: backend.tokenFor(user.id), user });
    }
    case 'register': {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(res, 400, 'Enter a valid email address');
      if (String(body.password ?? '').length < 8) return fail(res, 400, 'Password must be at least 8 characters');
      if (backend.findUserByEmail(email)) return fail(res, 400, 'An account with this email already exists');
      state.pending.set(email, { password: String(body.password), full_name: body.full_name || null });
      mail(email, 'Your WhistMate verification code', 'Sandbox: no e-mail is sent. ANY six digits are accepted as the code, e.g. 123456.');
      return send(res, 200, { message: 'Verification code sent', email });
    }
    case 'verify-otp': {
      if (!/^\d{6}$/.test(String(body.otp_code ?? ''))) return fail(res, 400, 'Invalid verification code');
      const pending = state.pending.get(email);
      if (!pending) return fail(res, 400, backend.findUserByEmail(email) ? 'This email is already verified — log in instead.' : 'No sign-up is waiting for this email');
      const user = backend.createUser({ email, password: pending.password, full_name: pending.full_name, role: 'user' });
      state.pending.delete(email);
      return send(res, 200, { access_token: backend.tokenFor(user.id), user, is_new_user: true });
    }
    case 'resend-otp': {
      if (state.pending.has(email)) mail(email, 'Your WhistMate verification code', 'Sandbox: no e-mail is sent. ANY six digits are accepted as the code.');
      return send(res, 200, { message: 'Verification code sent' });
    }
    case 'reset-password-request': {
      const user = backend.findUserByEmail(email);
      if (user) {
        const token = `rst-${randomBytes(12).toString('hex')}`;
        state.resetTokens.set(token, user.id);
        mail(email, 'Reset your WhistMate password', 'Sandbox: no e-mail is sent. Open the link to choose a new password.', { link: `${originOf(req)}/reset-password?token=${token}` });
      }
      return send(res, 200, { message: 'If that email has an account, a reset link was sent' }); // never reveals whether it exists
    }
    case 'reset-password': {
      const userId = state.resetTokens.get(String(body.reset_token ?? ''));
      if (!userId || !store.find('User', userId)) return fail(res, 400, 'Invalid or expired reset link');
      if (String(body.new_password ?? '').length < 8) return fail(res, 400, 'Password must be at least 8 characters');
      backend.setPassword(userId, body.new_password);
      state.resetTokens.delete(String(body.reset_token));
      return send(res, 200, { message: 'Password updated' });
    }
    case 'change-password': {
      if (!caller) return fail(res, 401, 'Authentication required');
      if (backend.passwordOf(caller.id) !== String(body.current_password ?? '')) return fail(res, 400, 'Current password is incorrect');
      if (String(body.new_password ?? '').length < 8) return fail(res, 400, 'Password must be at least 8 characters');
      backend.setPassword(caller.id, body.new_password);
      return send(res, 200, { message: 'Password updated' });
    }
    default:
      return fail(res, 404, `Auth endpoint "${action}" is not part of the sandbox`);
  }
}

// "Continue with Google": no Google, no consent screen — a canned account is signed in and the browser comes
// straight back with ?access_token=, which is how the real redirect ends.
function googleLogin(req, res, url) {
  const user = backend.findUserByEmail(GOOGLE_USER_EMAIL)
    || backend.createUser({ email: GOOGLE_USER_EMAIL, password: PASSWORD, full_name: 'Gal Google', role: 'user' });
  const token = backend.tokenFor(user.id);
  const popupOrigin = url.searchParams.get('popup_origin');
  if (popupOrigin) {
    if (popupOrigin !== originOf(req)) return fail(res, 400, 'popup_origin must be this sandbox');
    const page = `<!doctype html><meta charset="utf-8"><title>Signing in</title><script>
      if (window.opener) window.opener.postMessage(${JSON.stringify({ access_token: token, is_new_user: false })}, ${JSON.stringify(popupOrigin)});
      window.close();</script>`;
    return send(res, 200, page, { 'Content-Type': 'text/html; charset=utf-8' });
  }
  const back = localUrl(req, url.searchParams.get('from_url'), '/home');
  back.searchParams.set('access_token', token);
  back.searchParams.set('is_new_user', 'false');
  res.writeHead(302, { Location: back.toString(), 'Cache-Control': 'no-store' });
  res.end();
}

// ---- entities over HTTP: the same store, but every row passes the entity's `rls` rule for the caller ----
const pickFields = (row, fields) => (fields ? Object.fromEntries(['id', ...fields].filter((f) => f in row).map((f) => [f, row[f]])) : row);
async function entityRoute(req, res, url, name, rest, caller) {
  if (!backend.schemas[name]) return fail(res, 404, `Entity ${name} not found`);
  const can = (op, row) => backend.rlsAllows(name, op, row, caller);
  const [id, extra] = rest;
  if (extra) return fail(res, 404, 'Not found');

  // ---- the caller's own record ----
  if (name === 'User' && id === 'me') {
    if (!caller) return fail(res, 401, 'Authentication required');
    if (req.method === 'GET') return send(res, 200, caller);
    if (req.method === 'PUT' || req.method === 'PATCH') return send(res, 200, backend.updateOwnUser(caller.id, await readJson(req)));
    return fail(res, 405, 'Method not allowed');
  }

  if (!id) {
    if (req.method === 'GET') { // list / filter
      let query = {};
      if (url.searchParams.has('q')) {
        try { query = JSON.parse(url.searchParams.get('q')); } catch { return fail(res, 400, 'q must be JSON'); }
      }
      const fields = url.searchParams.get('fields')?.split(',').map((f) => f.trim()).filter(Boolean);
      const visible = store.all(name, query, url.searchParams.get('sort') || '-created_date').filter((row) => can('read', row));
      return send(res, 200, store.page(visible, url.searchParams.get('limit'), url.searchParams.get('skip')).map((row) => pickFields(row, fields)));
    }
    if (req.method === 'POST') { // create
      const data = await readJson(req);
      if (!can('create', data)) return fail(res, 403, `Permission denied: you may not create ${name} records`);
      return send(res, 200, store.create(name, data, caller));
    }
    if (req.method === 'DELETE') { // deleteMany
      const query = await readJson(req);
      const doomed = store.all(name, query).filter((row) => can('delete', row));
      doomed.forEach((row) => store.delete(name, row.id));
      return send(res, 200, { success: true, deleted: doomed.length });
    }
    return fail(res, 405, 'Method not allowed');
  }

  if (id === 'bulk' && req.method === 'POST') {
    const list = await readJson(req);
    if (!Array.isArray(list)) return fail(res, 400, 'Expected an array');
    if (!list.every((data) => can('create', data))) return fail(res, 403, `Permission denied: you may not create ${name} records`);
    return send(res, 200, store.bulkCreate(name, list, caller));
  }
  if (id === 'bulk' || id === 'update-many' || id === 'import') return fail(res, 501, `${name}/${id} is not supported by the sandbox`);

  // Each operation answers to its own rule: read for GET, update for PUT, delete for DELETE.
  const row = store.find(name, id);
  if (req.method === 'GET') {
    if (!row || !can('read', row)) return fail(res, 404, `${name} not found`); // same answer whether it is missing or just not yours
    return send(res, 200, row);
  }
  if (!row) return fail(res, 404, `${name} not found`);
  if (req.method === 'PUT' || req.method === 'PATCH') {
    const data = await readJson(req);
    if (!can('update', row)) return fail(res, 403, `Permission denied: you may not update this ${name}`);
    if (name === 'User') {
      if ('email' in data && data.email !== row.email) return fail(res, 400, 'The email address cannot be changed');
      if ('role' in data && data.role !== row.role && caller?.role !== 'admin') return fail(res, 403, 'Only app admins can change a role');
    }
    return send(res, 200, store.update(name, id, data));
  }
  if (req.method === 'DELETE') {
    if (!can('delete', row)) return fail(res, 403, `Permission denied: you may not delete this ${name}`);
    store.delete(name, id);
    if (name === 'User') state.passwords.delete(id);
    return send(res, 200, { success: true });
  }
  return fail(res, 405, 'Method not allowed');
}

// ---- /api router ----
async function api(req, res, url) {
  const seg = url.pathname.split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch { return s; } }).slice(1); // after "api"
  const caller = backend.userFromAuthHeader(req.headers.authorization);
  res.sandboxUser = caller?.email || null;

  // Page-view logging and usage analytics: accepted and dropped.
  if (seg[0] === 'app-logs') return send(res, 200, req.method === 'GET' ? [] : {});
  if (seg[0] !== 'apps') return fail(res, 404, 'Not found');

  if (seg[1] === 'public') {
    // The app is public: anyone may load it, signing in is optional until a screen needs it.
    if (seg[2] === 'prod' && seg[3] === 'public-settings' && seg[4] === 'by-id') return send(res, 200, { id: seg[5] || APP_ID, public_settings: 'public_without_login' });
    if (seg[2] === 'login-info' && seg[3] === 'by-id') return send(res, 200, { id: seg[4] || APP_ID, auth_config: { mfa_policy: 'off', providers: ['google', 'email'] } });
    return fail(res, 404, 'Not found');
  }
  if (seg[1] === 'auth') {
    if (seg[2] === 'logout') { // the real endpoint clears cookies; here there is nothing to clear
      res.writeHead(302, { Location: localUrl(req, url.searchParams.get('from_url')).toString(), 'Cache-Control': 'no-store' });
      return res.end();
    }
    if (seg[2] === 'login') return googleLogin(req, res, url);
    return fail(res, 501, `Sign-in with "${seg[2]}" is not simulated — the app only offers Google and email + password`);
  }

  // /api/apps/:appId/...
  const [, , area, a, b, c] = seg;
  if (area === 'entities' && a) return entityRoute(req, res, url, a, seg.slice(4), caller);
  if (area === 'functions' && a) {
    if (req.method !== 'POST') return fail(res, 405, 'Functions are invoked with POST');
    const raw = (await readBody(req)).toString('utf8');
    const token = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '')?.[1] || null;
    const out = await backend.invoke(a, token, null, { rawBody: raw.trim() ? raw : '{}' }); // the real handler, bound to the caller
    return send(res, out.status, out.text ?? out.data, { 'Content-Type': out.contentType || 'application/json; charset=utf-8' });
  }
  if (area === 'auth' && a) {
    if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
    return authRoute(req, res, a, caller);
  }
  if ((area === 'users' && a === 'invite-user') || (area === 'runtime' && a === 'users' && b === 'invite-user')) {
    if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
    if (!caller) return fail(res, 401, 'Authentication required');
    if (caller.role !== 'admin') return fail(res, 403, 'Only app admins can invite users');
    const body = await readJson(req);
    const email = normEmail(body.user_email);
    const role = body.role === 'admin' ? 'admin' : 'user';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(res, 400, 'Enter a valid email address');
    // No invitation e-mail exists here: the account is created on the spot so it can be signed into.
    const existing = backend.findUserByEmail(email);
    const user = existing ? store.update('User', existing.id, { role }) : backend.createUser({ email, password: PASSWORD, full_name: null, role });
    mail(email, 'You are invited to WhistMate', `Sandbox: no e-mail is sent. The account exists now (role ${role}); its password is ${existing ? 'unchanged' : PASSWORD}.`);
    return send(res, 200, { success: true, user });
  }
  if (area === 'analytics') return send(res, 200, {});
  if (area === 'integration-endpoints' && a === 'Core' && b === 'InvokeLLM' && !c) {
    if (!caller) return fail(res, 401, 'Authentication required');
    return send(res, 200, JSON.stringify(backend.simulateLLM(await readJson(req))), { 'Content-Type': 'application/json; charset=utf-8' });
  }
  return fail(res, 404, `${req.method} ${url.pathname} is not part of the sandbox API`);
}

// ---- /__sandbox: what is in here, and reset ----
function buildInfo(origin) {
  const users = store.all('User');
  const groups = store.all('Group');
  const members = store.all('GroupMember');
  const sessions = store.all('Session');
  const rounds = store.all('Game');
  const userById = Object.fromEntries(users.map((u) => [u.id, u]));
  const groupById = Object.fromEntries(groups.map((g) => [g.id, g]));
  const seeded = Object.fromEntries(SEED_USERS.map((u) => [u.email, u]));
  const signedIn = (pathname, user) => `${origin}${pathname}${pathname.includes('?') ? '&' : '?'}access_token=${backend.tokenFor(user.id)}`;

  const thursday = groups.find((g) => g.name === 'Thursday Whist');
  const maya = users.find((u) => u.email === 'maya@example.com');
  const root = users.find((u) => u.email === 'root@example.com');
  const urls = { login: `${origin}/login`, register: `${origin}/register`, signed_out_home: `${origin}/home` };
  if (thursday && maya) {
    const inGroup = (rows) => rows.filter((r) => r.group_id === thursday.id);
    const newest = (rows) => rows[rows.length - 1] || null;
    const openSession = newest(inGroup(sessions).filter((s) => s.status === 'open'));
    const inPlay = newest(inGroup(rounds).filter((r) => r.status === 'playing' || r.status === 'bidding'));
    const closedSession = newest(inGroup(sessions).filter((s) => s.status === 'closed'));
    const scored = newest(inGroup(rounds).filter((r) => r.status === 'complete' && (!openSession || r.session_id !== openSession.id)));
    const fell = newest(inGroup(rounds).filter((r) => r.everyone_falls));
    const roster = inGroup(members);
    const dan = roster.find((m) => m.player_name === 'Dan');
    const unclaimed = roster.find((m) => !m.user_id);
    Object.assign(urls, {
      home_as_maya: signedIn('/', maya),
      groups_as_maya: signedIn('/home', maya),
      open_session: openSession && signedIn(`/session/${openSession.id}`, maya),
      round_in_play: inPlay && signedIn(`/round/${inPlay.id}`, maya),
      closed_session: closedSession && signedIn(`/session/${closedSession.id}`, maya),
      scored_round: scored && signedIn(`/round/${scored.id}`, maya),
      everyone_falls_round: fell && signedIn(`/round/${fell.id}`, maya),
      player_profile: dan && signedIn(`/player/${dan.id}`, maya),
      unclaimed_player_profile: unclaimed && signedIn(`/player/${unclaimed.id}`, maya),
      history: signedIn('/history', maya),
      group_admin: signedIn('/admin', maya),
      activity: signedIn('/activity', maya),
      rules_assistant: signedIn('/rules', maya),
      invite_link: `${origin}/join?code=${thursday.invite_code}`,
      invite_link_as_newbie: users.find((u) => u.email === 'newbie@example.com') && signedIn(`/join?code=${thursday.invite_code}`, users.find((u) => u.email === 'newbie@example.com')),
    });
  }
  if (root) urls.app_admin_as_root = signedIn('/app-admin', root);

  return {
    sandbox: true,
    app_id: APP_ID,
    origin,
    seeded_at: new Date(backend.anchor).toISOString(),
    password_for_every_seeded_user: PASSWORD,
    otp: 'any six digits',
    users: users.map((u) => ({
      name: u.full_name || u.email,
      email: u.email,
      password: backend.passwordOf(u.id),
      token: backend.tokenFor(u.id),
      role: u.role,
      id: u.id,
      about: seeded[u.email]?.about || 'created after the seed',
      sign_in_url: signedIn('/', u),
      groups: members.filter((m) => m.user_id === u.id).map((m) => ({
        group: groupById[m.group_id]?.name ?? null,
        group_id: m.group_id,
        group_status: groupById[m.group_id]?.status ?? null,
        role: m.role,
        player_name: m.player_name,
        member_id: m.id,
      })),
    })),
    groups: groups.map((g) => ({
      name: g.name,
      id: g.id,
      invite_code: g.invite_code,
      invite_link: `${origin}/join?code=${g.invite_code}`,
      status: g.status,
      scoring_method_default: g.scoring_method_default,
      advanced_rules_default: g.advanced_rules_default,
      sessions: sessions.filter((s) => s.group_id === g.id).length,
      open_sessions: sessions.filter((s) => s.group_id === g.id && s.status === 'open').length,
      rounds: rounds.filter((r) => r.group_id === g.id).length,
      members: members.filter((m) => m.group_id === g.id).map((m) => ({
        id: m.id,
        player_name: m.player_name,
        role: m.role,
        claimed: !!m.user_id,
        email: m.user_id ? userById[m.user_id]?.email ?? null : null,
      })),
    })),
    urls,
    counts: backend.counts(),
    seed: state.seedSummary ? { tally: state.seedSummary.tally, scoring_mismatches: state.seedSummary.warnings } : null,
    simulated: {
      realtime: 'the socket connects and stays silent — no live updates are pushed',
      rules_assistant: 'no AI model: the answer is the rulebook passage that best matches the question\'s keywords, or the "IDK" line',
      email: 'nothing is sent; see GET /__sandbox/outbox for what would have been (reset links, invitations)',
      google: `"Continue with Google" signs in ${GOOGLE_USER_EMAIL} without asking`,
      otp: 'any six digits verify a new sign-up',
    },
    endpoints: { info: `${origin}/__sandbox/info`, outbox: `${origin}/__sandbox/outbox`, reset: `POST ${origin}/__sandbox/reset` },
  };
}

async function sandboxRoute(req, res, url) {
  const origin = originOf(req);
  const pretty = (value) => send(res, 200, JSON.stringify(value, null, 2), { 'Content-Type': 'application/json; charset=utf-8' });
  if (url.pathname === '/__sandbox/info' && req.method === 'GET') return withStore(() => pretty(buildInfo(origin)));
  if (url.pathname === '/__sandbox/outbox' && req.method === 'GET') return withStore(() => pretty(state.outbox));
  if (url.pathname === '/__sandbox/reset') {
    if (req.method !== 'POST') return fail(res, 405, 'Reset with POST /__sandbox/reset');
    await resetStore();
    return send(res, 200, { ok: true, counts: backend.counts() });
  }
  if (url.pathname === '/__sandbox/icon.svg') {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#14532d"/><text x="16" y="23" font-size="20" text-anchor="middle" fill="#fff">♠</text></svg>';
    return send(res, 200, svg, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'max-age=3600' });
  }
  return fail(res, 404, 'Not found');
}

// ---- static files + SPA fallback ----
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};
// index.html asks base44.com for its icon; keep even that request on this machine.
const indexHtml = () => readFileSync(path.join(DIST, 'index.html'), 'utf8').replace(/https:\/\/base44\.com\/logo_v2\.svg/g, '/__sandbox/icon.svg');
function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'Method not allowed');
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { return fail(res, 400, 'Bad path'); }
  const file = path.join(DIST, path.normalize(pathname));
  const inside = file === DIST || file.startsWith(DIST + path.sep);
  if (inside && pathname !== '/' && existsSync(file) && statSync(file).isFile()) {
    const body = readFileSync(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Content-Length': body.length });
    return res.end(req.method === 'HEAD' ? undefined : body);
  }
  if (pathname === '/manifest.json') { // the real one is served by Base44 hosting, not by the repo
    return send(res, 200, { name: 'WhistMate (sandbox)', short_name: 'WhistMate', display: 'standalone', start_url: '/', icons: [{ src: '/__sandbox/icon.svg', sizes: 'any', type: 'image/svg+xml' }] });
  }
  if (path.extname(pathname)) return send(res, 404, 'Not found'); // a missing file, not an app route
  const html = indexHtml(); // any other path is a client-side route
  res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(html) });
  return res.end(req.method === 'HEAD' ? undefined : html);
}

// ---- realtime: Base44 pushes entity changes over socket.io. The sandbox completes the handshake so the
// client is content and quiet, and then never sends an event. ----
const sockets = new Set();
const wsFrame = (opcode, payload) => {
  const len = payload.length;
  let head;
  if (len < 126) head = Buffer.from([0x80 | opcode, len]);
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | opcode; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | opcode; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([head, payload]);
};
function upgrade(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!req.url.startsWith('/ws-user-apps/socket.io') || !key || String(req.headers.upgrade).toLowerCase() !== 'websocket') {
    socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    return;
  }
  const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  sockets.add(socket);
  const text = (message) => { if (!socket.destroyed) socket.write(wsFrame(0x1, Buffer.from(message))); };
  // Engine.IO v4 "open", then a ping every 25s so the client never times out.
  text(`0${JSON.stringify({ sid: randomBytes(10).toString('hex'), upgrades: [], pingInterval: 25000, pingTimeout: 20000, maxPayload: 1000000 })}`);
  const ping = setInterval(() => text('2'), 25000);
  ping.unref();
  const done = () => { clearInterval(ping); sockets.delete(socket); };
  let buffer = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 2) {
      const opcode = buffer[0] & 0x0f;
      const masked = (buffer[1] & 0x80) !== 0;
      let len = buffer[1] & 0x7f;
      let offset = 2;
      if (len === 126) { if (buffer.length < 4) return; len = buffer.readUInt16BE(2); offset = 4; }
      else if (len === 127) { if (buffer.length < 10) return; len = Number(buffer.readBigUInt64BE(2)); offset = 10; }
      if (len > 1_000_000) { socket.destroy(); return; }
      const maskLength = masked ? 4 : 0;
      if (buffer.length < offset + maskLength + len) return;
      let payload = buffer.subarray(offset + maskLength, offset + maskLength + len);
      if (masked) { const mask = buffer.subarray(offset, offset + 4); payload = Buffer.from(payload.map((byte, i) => byte ^ mask[i & 3])); }
      buffer = buffer.subarray(offset + maskLength + len);
      if (opcode === 0x8) { socket.end(wsFrame(0x8, Buffer.alloc(0))); return; }
      if (opcode === 0x9) { socket.write(wsFrame(0xa, payload)); continue; }
      if (opcode !== 0x1) continue;
      const message = payload.toString('utf8');
      if (message === '2') text('3');
      else if (message.startsWith('40')) text(`40${JSON.stringify({ sid: randomBytes(10).toString('hex') })}`); // socket.io namespace connect
      // "42[...]" (join / leave a room) and "3" (pong) need no answer.
    }
  });
  socket.on('close', done);
  socket.on('error', done);
}

// ---- the server ----
function onRequest(req, res) {
  const started = Date.now();
  const url = new URL(req.url, originOf(req));
  const isApi = url.pathname === '/api' || url.pathname.startsWith('/api/');
  if (isApi && !QUIET) {
    res.on('finish', () => {
      if (/\/(analytics|app-logs)\//.test(url.pathname)) return;
      const what = url.pathname.replace(/^\/api\//, '').replace(`apps/${APP_ID}/`, '');
      console.log(`[sandbox] ${req.method} ${what} -> ${res.statusCode}${res.sandboxUser ? ` (${res.sandboxUser})` : ' (signed out)'} ${Date.now() - started}ms`);
    });
  }
  Promise.resolve()
    .then(() => {
      if (url.pathname.startsWith('/__sandbox/')) return sandboxRoute(req, res, url);
      if (isApi) return withStore(() => api(req, res, url));
      return serveStatic(req, res, url);
    })
    .catch((error) => {
      if (!res.headersSent) fail(res, error.status || 500, error.message || 'Sandbox error');
      else res.end();
      if (!error.status) console.error('[sandbox] error:', error);
    });
}
const servers = [];
function listen(host, required) {
  return new Promise((resolve) => {
    const server = http.createServer(onRequest);
    server.on('upgrade', upgrade);
    server.once('error', (error) => {
      if (required) {
        console.error(error.code === 'EADDRINUSE' ? `[sandbox] port ${PORT} is already in use — pick another with --port` : `[sandbox] ${error.message}`);
        process.exit(1);
      }
      if (error.code === 'EADDRINUSE') console.warn(`[sandbox] [${host}]:${PORT} is taken by something else — use http://127.0.0.1:${PORT} rather than "localhost"`);
      resolve(false);
    });
    server.listen(PORT, host, () => { servers.push(server); resolve(true); });
  });
}
await listen(HOST, true);
// "localhost" may resolve to IPv6 first: unless a host was asked for, answer on both loopback addresses.
if (HOST === '127.0.0.1' && !argv.some((a) => a === '--host' || a.startsWith('--host='))) await listen('::1', false);

if (!QUIET) {
  const origin = `http://localhost:${PORT}`;
  const info = buildInfo(origin);
  console.log(`\nWhistMate sandbox on ${origin}  (in memory only — nothing real is touched)\n`);
  console.log(`  password for every seeded user: ${PASSWORD}     sign-up code: any six digits\n`);
  for (const u of info.users) console.log(`  ${u.email.padEnd(24)} ${u.role.padEnd(6)} ${origin}/?access_token=${u.token}`);
  console.log('');
  for (const g of info.groups) console.log(`  ${g.name.padEnd(16)} ${g.status.padEnd(9)} invite code ${g.invite_code}   ${g.sessions} sessions, ${g.rounds} rounds`);
  console.log(`\n  everything else: ${origin}/__sandbox/info      reset: curl -X POST ${origin}/__sandbox/reset\n`);
}
const shutdown = () => {
  for (const socket of sockets) socket.destroy();
  let open = servers.length;
  for (const server of servers) {
    server.close(() => { open -= 1; if (open === 0) process.exit(0); });
    server.closeAllConnections();
  }
  setTimeout(() => process.exit(0), 500).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
