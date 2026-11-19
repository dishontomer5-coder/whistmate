// In-memory stand-in for the Base44 backend, used by the sandbox server, the seed and the smoke test.
//
// It runs the REAL backend functions (base44/functions/*/entry.ts, written for Deno) under plain Node,
// with the same trick as scripts/functions-access.test.mjs: `npm:@base44/sdk*` is swapped for a stub
// client and `Deno.serve` just hands us each request handler. Entities live in memory; nothing here
// can reach the live app, the Base44 platform, an LLM or a mail server.
//
// One backend per process (the swap uses process-wide hooks and globals).
import { registerHooks } from 'node:module';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const APP_ID = 'sandbox';
export const TOKEN_PREFIX = 'sbx-';
const BUILT_IN_FIELDS = ['id', 'created_date', 'updated_date', 'created_by_id', 'created_by'];
// The assistant's refusal line, as in base44/functions/askRules/entry.ts (it is read from the
// prompt; this copy is only the fallback if the prompt ever stops carrying it).
const DEFAULT_IDK = "IDK bro 🤷 — that's not in the WhistMate rulebook. I only know the rules and scoring; for your account or your data, see About & privacy in the menu.";

// --- seeded PRNG (xmur3 hash -> mulberry32) ----------------------------------------------------
export function makeRng(seedText) {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  let a = (h ^ (h >>> 16)) >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- entity schemas (base44/entities/*.jsonc) ---------------------------------------------------
export function stripJsonComments(src) {
  let out = '';
  for (let i = 0, inString = false; i < src.length; i++) {
    const c = src[i];
    if (inString) { out += c; if (c === '\\') out += src[++i]; else if (c === '"') inString = false; continue; }
    if (c === '"') { inString = true; out += c; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; out += '\n'; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 1; continue; }
    out += c;
  }
  return out;
}

function loadSchemas() {
  const dir = path.join(ROOT, 'base44/entities');
  const schemas = {};
  for (const file of readdirSync(dir).filter((f) => /\.jsonc?$/.test(f)).sort()) {
    const schema = JSON.parse(stripJsonComments(readFileSync(path.join(dir, file), 'utf8')));
    schemas[schema.name || file.replace(/\.jsonc?$/, '')] = schema;
  }
  // User is Base44's built-in entity: its file carries no `rls` block, the platform's own rules apply
  // (a user reads and updates their own record; app admins read and update everyone).
  if (schemas.User && !schemas.User.rls) {
    const selfOrAdmin = { $or: [{ id: '{{user.id}}' }, { user_condition: { role: 'admin' } }] };
    schemas.User.rls = { create: false, read: selfOrAdmin, update: selfOrAdmin, delete: { user_condition: { role: 'admin' } } };
    schemas.User.builtInRls = true;
  }
  return schemas;
}

// --- query matching (the subset of Mongo-style filters the app uses, and a little more) ----------
const same = (a, b) => (a ?? null) === (b ?? null);
function matchValue(have, want) {
  if (want !== null && typeof want === 'object' && !Array.isArray(want)) {
    const ops = Object.keys(want);
    if (ops.length > 0 && ops.every((k) => k.startsWith('$'))) {
      return ops.every((op) => {
        const v = want[op];
        switch (op) {
          case '$in': return Array.isArray(v) && v.some((x) => same(have, x));
          case '$nin': return Array.isArray(v) && !v.some((x) => same(have, x));
          case '$eq': return same(have, v);
          case '$ne': return !same(have, v);
          case '$lte': return have != null && have <= v;
          case '$lt': return have != null && have < v;
          case '$gte': return have != null && have >= v;
          case '$gt': return have != null && have > v;
          case '$exists': return (have !== undefined) === !!v;
          case '$regex': return new RegExp(v, want.$options || '').test(String(have ?? ''));
          case '$options': return true;
          default: throw new Error(`Unsupported filter operator: ${op}`);
        }
      });
    }
    return JSON.stringify(have) === JSON.stringify(want);
  }
  return same(have, want);
}
export function matches(row, query) {
  if (!query || typeof query !== 'object') return true;
  return Object.entries(query).every(([key, want]) => {
    if (key === '$or') return Array.isArray(want) && want.some((q) => matches(row, q));
    if (key === '$and') return Array.isArray(want) && want.every((q) => matches(row, q));
    if (key === '$nor') return Array.isArray(want) && !want.some((q) => matches(row, q));
    return matchValue(row[key], want);
  });
}

// --- row-level security (the `rls` block of each entity) -----------------------------------------
// Supported: literal true/false; `user_condition` (fields of the caller); `data.<field>`, `created_by_id`
// or any other row field compared with a literal or with {{user.id}} / {{user.email}} / {{user.<field>}};
// `$or` / `$and`. A rule that needs the caller (a template or user_condition) is false when signed out.
const TEMPLATE = /^\{\{\s*user\.([A-Za-z0-9_]+)\s*\}\}$/;
export function rlsAllows(rule, row, user) {
  if (rule === true) return true;
  if (rule === false || rule == null) return rule == null; // no rule for this operation = not restricted
  if (typeof rule !== 'object') return false;
  return Object.entries(rule).every(([key, want]) => {
    if (key === '$or') return Array.isArray(want) && want.some((r) => rlsAllows(r, row, user));
    if (key === '$and') return Array.isArray(want) && want.every((r) => rlsAllows(r, row, user));
    if (key === 'user_condition') {
      return !!user && Object.entries(want || {}).every(([field, value]) => matchValue(user[field], value));
    }
    const field = key.startsWith('data.') ? key.slice(5) : key;
    let expected = want;
    if (typeof want === 'string') {
      const m = want.match(TEMPLATE);
      if (m) {
        if (!user) return false;
        expected = user[m[1]];
        if (expected == null) return false;
      }
    }
    return matchValue(row ? row[field] : undefined, expected);
  });
}

// --- the simulated LLM (only askRules uses it) ----------------------------------------------------
const STOP = new Set(('a an and are as at be by can do does did for from get got has have how i if in into is it its me my of on or our '
  + 'so than that the their them then there these they this to us was we were what when where which who whom why will with would you your '
  + 'about any app game whist whistmate israeli please tell explain mean means much many').split(' '));
const SYNONYMS = { bet: 'bid', bets: 'bid', betting: 'bid', bids: 'bid', bidding: 'bid', contract: 'bid', contracts: 'bid',
  misses: 'miss', missed: 'miss', missing: 'miss', fails: 'miss', failed: 'miss', fail: 'miss', falls: 'fall', fell: 'fall',
  nobody: 'everyone', noone: 'everyone', everybody: 'everyone', zero: '0', nil: '0', strongest: 'strong', stronger: 'strong', highest: 'high', higher: 'high',
  scoring: 'score', scores: 'score', scored: 'score', points: 'point', penalties: 'penalty', reneging: 'renege', reneged: 'renege', reneges: 'renege',
  tricks: 'trick', suits: 'suit', trumps: 'trump', wins: 'win', winning: 'win', winner: 'win', won: 'win', players: 'player', rounds: 'round', sessions: 'session',
  happens: 'happen', happened: 'happen', cards: 'card', stats: 'stat', statistics: 'stat', awards: 'award' };
function tokens(text) {
  const out = [];
  for (const raw of String(text).toLowerCase().replace(/no[- ]trump/g, 'notrump').match(/[a-z]+|\d+|[♣♦♥♠]/g) || []) {
    if (STOP.has(raw)) continue;
    let t = SYNONYMS[raw] || raw;
    if (t === raw && t.length > 4 && t.endsWith('s') && !t.endsWith('ss')) t = t.slice(0, -1);
    out.push(t);
  }
  return out;
}
const plain = (md) => md.replace(/\*\*/g, '').replace(/^>\s?/gm, '').replace(/^#+\s*/gm, '').replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
function rulebookPassages(rulebook) {
  const passages = [];
  // FAQ entries are the best short answers.
  for (const m of rulebook.matchAll(/\*\*Q: ([^\n]+?)\*\*\n([\s\S]*?)(?=\n\n\*\*Q:|\n\n---|\n\n## |$)/g)) {
    passages.push({ kind: 'faq', title: m[1], body: plain(m[2]) });
  }
  // Then every paragraph / list block under a heading (tables become "term: meaning" lines).
  let heading = '';
  for (const block of rulebook.split(/\n\s*\n/)) {
    const text = block.trim();
    if (!text || text === '---') continue;
    const h = text.match(/^#{1,4}\s+(.*)$/m);
    if (h && text.startsWith('#')) {
      heading = h[1];
      const rest = text.split('\n').slice(1).join('\n').trim();
      if (!rest) continue;
      passages.push({ kind: 'section', title: heading, body: plain(rest) });
      continue;
    }
    if (/^\*\*Q:/.test(text) || /^## 6\./.test(heading)) continue; // FAQ already covered
    if (text.startsWith('|')) {
      for (const line of text.split('\n')) {
        const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
        if (cells.length < 2 || /^-+$/.test(cells[0]) || /^(Term|How far you missed)$/.test(cells[0])) continue;
        passages.push({ kind: 'row', title: cells[0], body: plain(`${cells[0]}: ${cells.slice(1).join(' — ')}`) });
      }
      continue;
    }
    passages.push({ kind: 'section', title: heading, body: plain(text) });
    // Each top-level bullet is also a passage of its own, so a narrow question gets a narrow answer.
    const bullets = text.split(/\n(?=- )/).filter((b) => b.startsWith('- '));
    if (bullets.length > 1) {
      for (const bullet of bullets) {
        const label = bullet.match(/^- \*\*([^*]+?):?\*\*/);
        passages.push({ kind: 'bullet', title: label ? label[1] : '', body: plain(bullet.replace(/^- /, '')) });
      }
    }
  }
  return passages.filter((p) => p.body.length > 0);
}
export function simulateLLM(params) {
  const prompt = String(params?.prompt ?? '');
  if (!prompt.includes('=== RULEBOOK ===')) {
    return '[sandbox] InvokeLLM is simulated: no model is called.';
  }
  const idk = (prompt.match(/reply EXACTLY this and nothing else:\s*\n([^\n]+)/) || [])[1]?.trim() || DEFAULT_IDK;
  const afterRulebook = prompt.split('=== RULEBOOK ===')[1] || '';
  const [rulebook, conversation = ''] = afterRulebook.split('=== Conversation so far ===');
  const at = conversation.lastIndexOf('\nPlayer: ');
  const question = (at >= 0 ? conversation.slice(at + 9) : conversation).replace(/\nWhistMate Rules:\s*$/, '').trim();
  const qTokens = [...new Set(tokens(question))];
  if (qTokens.length === 0) return idk;

  const passages = rulebookPassages(rulebook).map((p) => ({ ...p, titleSet: new Set(tokens(p.title)), bodySet: new Set(tokens(p.body)) }));
  const df = {};
  for (const p of passages) for (const t of new Set([...p.titleSet, ...p.bodySet])) df[t] = (df[t] || 0) + 1;
  const idf = (t) => Math.log(1 + passages.length / (df[t] || passages.length));
  // A word the rulebook never uses ("poker", "account", "France") marks the question as off-topic.
  const unknown = qTokens.filter((t) => !df[t]).length;
  // Each question word found in a passage counts once, weighted by how rare it is; a passage whose own
  // title (an FAQ question, a glossary term, a bullet's label) is mostly made of the question's words gets a bonus.
  const titleBonus = { faq: 1.5, row: 1, bullet: 1, section: 0.3 };
  let best = null;
  for (const p of passages) {
    let score = 0;
    let matched = 0;
    let titleScore = 0;
    let titleHits = 0;
    for (const t of qTokens) {
      const inTitle = p.titleSet.has(t);
      if (!inTitle && !p.bodySet.has(t)) continue;
      matched += 1;
      score += idf(t);
      if (inTitle) { titleScore += idf(t); titleHits += 1; }
    }
    if (matched === 0) continue;
    if (titleHits > 0) score += titleScore * (titleHits / p.titleSet.size) * titleBonus[p.kind];
    score -= Math.min(p.body.length, 1200) / 6000; // prefer the shorter of two equal passages
    if (!best || score > best.score) best = { score, matched, passage: p };
  }
  if (!best) return idk;
  const coverage = best.matched / (qTokens.length + unknown);
  if (coverage < 0.5 || best.score < 2.2) return idk;
  return best.passage.body;
}

// --- the backend ------------------------------------------------------------------------------------
let created = false;
export async function createBackend({ seed = null, pageCap = 500, log = () => {} } = {}) {
  if (created) throw new Error('createBackend() can only be called once per process');
  created = true;
  if (!process.features?.typescript) {
    throw new Error('This Node cannot load the .ts backend functions. Use Node >= 22.18, or run with --experimental-strip-types.');
  }

  const schemas = loadSchemas();
  const entityNames = Object.keys(schemas);
  const anchor = Date.now(); // the fixed "now" every (re)seed is built around

  // ---- state: everything that reset() wipes ----
  const state = {};
  function clearState() {
    state.tables = Object.fromEntries(entityNames.map((n) => [n, []]));
    state.index = Object.fromEntries(entityNames.map((n) => [n, new Map()]));
    state.passwords = new Map();   // user id -> password
    state.pending = new Map();     // email -> { password } (registered, OTP not verified yet)
    state.resetTokens = new Map(); // token -> user id
    state.outbox = [];             // simulated e-mails
    state.idRng = makeRng('whist-sandbox/ids');
    state.usedIds = new Set();
    state.lastTs = 0;
    state.seedSummary = null;
  }
  clearState();

  const clone = (v) => (v === undefined ? v : structuredClone(v));
  function newId() {
    for (;;) {
      let id = '';
      for (let i = 0; i < 24; i++) id += '0123456789abcdef'[Math.floor(state.idRng() * 16)];
      if (!state.usedIds.has(id)) { state.usedIds.add(id); return id; }
    }
  }
  // Timestamps come from the (possibly simulated) clock; rows created one by one never share one.
  function stamp() {
    const ts = Math.max(Date.now(), state.lastTs + 1);
    state.lastTs = ts;
    return new Date(ts).toISOString();
  }
  function table(name) {
    const rows = state.tables[name];
    if (!rows) throw new Error(`Entity ${name} does not exist`);
    return rows;
  }
  function stripBuiltIns(data) {
    const out = { ...(data || {}) };
    for (const f of BUILT_IN_FIELDS) delete out[f];
    return out;
  }
  function validate(name, row, { partial = false } = {}) {
    const schema = schemas[name];
    if (!partial) {
      for (const field of schema.required || []) {
        if (row[field] === undefined || row[field] === null || row[field] === '') {
          throw Object.assign(new Error(`Validation error: ${name}.${field} is required`), { status: 422 });
        }
      }
    }
    for (const [field, def] of Object.entries(schema.properties || {})) {
      const value = row[field];
      if (value == null) continue;
      if (Array.isArray(def.enum) && !def.enum.includes(value)) {
        throw Object.assign(new Error(`Validation error: ${name}.${field} must be one of ${def.enum.join(', ')}`), { status: 422 });
      }
      if (def.unique && state.tables[name].some((r) => r.id !== row.id && r[field] === value)) {
        throw Object.assign(new Error(`duplicate key error: ${name}.${field} "${value}" already exists`), { status: 409, code: 11000 });
      }
    }
  }
  function sortRows(rows, sort) {
    const spec = typeof sort === 'string' && sort ? sort : '-created_date';
    const desc = spec.startsWith('-');
    const key = spec.replace(/^[-+]/, '');
    const dir = desc ? -1 : 1;
    return [...rows].sort((a, b) => {
      const x = a[key];
      const y = b[key];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  }
  const page = (rows, limit, skip) => {
    const n = Number(limit);
    const take = Number.isFinite(n) && n > 0 ? Math.min(n, pageCap) : pageCap; // the platform caps one page
    const from = Number(skip) > 0 ? Number(skip) : 0;
    return rows.slice(from, from + take);
  };

  // ---- raw store operations (no access checks: this is what the service role sees) ----
  const store = {
    filter(name, query = {}, sort, limit, skip) {
      return page(sortRows(table(name).filter((row) => matches(row, query)), sort), limit, skip).map(clone);
    },
    get(name, id) {
      table(name);
      const row = state.index[name].get(id);
      if (!row) throw Object.assign(new Error(`${name} with id ${id} not found`), { status: 404 });
      return clone(row);
    },
    find(name, id) {
      const row = state.index[name]?.get(id);
      return row ? clone(row) : null;
    },
    create(name, data, actor = null, sharedStamp = null) {
      const rows = table(name);
      const defaults = {};
      for (const [field, def] of Object.entries(schemas[name].properties || {})) {
        if (def && Object.prototype.hasOwnProperty.call(def, 'default')) defaults[field] = clone(def.default);
      }
      const ts = sharedStamp || stamp();
      const row = {
        ...defaults,
        ...clone(stripBuiltIns(data)),
        id: newId(),
        created_date: ts,
        updated_date: ts,
        created_by_id: actor?.id ?? null,
        created_by: actor?.email ?? null,
      };
      validate(name, row);
      rows.push(row);
      state.index[name].set(row.id, row);
      return clone(row);
    },
    bulkCreate(name, list, actor = null) {
      if (!Array.isArray(list)) throw new Error('bulkCreate expects an array');
      const ts = stamp(); // one write, one created_date — like the platform
      return list.map((data) => store.create(name, data, actor, ts));
    },
    update(name, id, data) {
      table(name);
      const row = state.index[name].get(id);
      if (!row) throw Object.assign(new Error(`${name} with id ${id} not found`), { status: 404 });
      const next = { ...row, ...clone(stripBuiltIns(data)) };
      validate(name, next, { partial: true });
      // Like the platform: every update moves updated_date on — even two in the same
      // millisecond — so a client holding the old one can tell the row changed since.
      const ts = Math.max(Date.parse(stamp()), Date.parse(row.created_date), Date.parse(row.updated_date || 0) + 1);
      state.lastTs = Math.max(state.lastTs, ts);
      Object.assign(row, next, { updated_date: new Date(ts).toISOString() });
      return clone(row);
    },
    delete(name, id) {
      const rows = table(name);
      const row = state.index[name].get(id);
      if (!row) throw Object.assign(new Error(`${name} with id ${id} not found`), { status: 404 });
      rows.splice(rows.indexOf(row), 1);
      state.index[name].delete(id);
      return { success: true };
    },
    deleteMany(name, query = {}) {
      const doomed = table(name).filter((row) => matches(row, query));
      for (const row of doomed) store.delete(name, row.id);
      return { success: true, deleted: doomed.length };
    },
    count: (name) => table(name).length,
    // Every matching row, unpaged — for the sandbox's own bookkeeping and for applying access rules before paging.
    all: (name, query = {}, sort = 'created_date') => sortRows(table(name).filter((row) => matches(row, query)), sort).map(clone),
    page,
  };

  // ---- users, tokens, passwords ----
  const tokenFor = (userId) => `${TOKEN_PREFIX}${userId}`;
  function userFromToken(token) {
    if (typeof token !== 'string' || !token.startsWith(TOKEN_PREFIX)) return null;
    const key = token.slice(TOKEN_PREFIX.length);
    const byId = state.index.User.get(key);
    if (byId) return clone(byId);
    // Convenience for people typing a token by hand: sbx-<email> or sbx-<part before the @>.
    const lower = key.toLowerCase();
    const row = state.tables.User.find((u) => u.email === lower) || state.tables.User.find((u) => u.email.split('@')[0] === lower);
    return row ? clone(row) : null;
  }
  function userFromAuthHeader(header) {
    const m = /^Bearer\s+(\S+)$/i.exec(header || '');
    return m ? userFromToken(m[1]) : null;
  }
  function createUser({ email, password, full_name = null, role = 'user', extra = {} }) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) throw new Error('email is required');
    if (state.tables.User.some((u) => u.email === normalized)) throw new Error(`User ${normalized} already exists`);
    const row = store.create('User', { email: normalized, full_name, role, ...extra });
    if (password != null) state.passwords.set(row.id, String(password));
    return row;
  }
  const findUserByEmail = (email) => {
    const row = state.tables.User.find((u) => u.email === String(email || '').trim().toLowerCase());
    return row ? clone(row) : null;
  };
  function updateOwnUser(userId, data) {
    const safe = stripBuiltIns(data);
    delete safe.email;
    delete safe.role; // a user cannot promote themselves
    return store.update('User', userId, safe);
  }

  // ---- the stub SDK client handed to each backend function ----
  function serviceEntity(name, actor) {
    return {
      filter: async (query = {}, sort, limit, skip) => store.filter(name, query, sort, limit, skip),
      list: async (sort, limit, skip) => store.filter(name, {}, sort, limit, skip),
      get: async (id) => store.get(name, id),
      create: async (data) => store.create(name, data, actor),
      bulkCreate: async (list) => store.bulkCreate(name, list, actor),
      update: async (id, data) => store.update(name, id, data),
      delete: async (id) => store.delete(name, id),
      deleteMany: async (query = {}) => store.deleteMany(name, query),
    };
  }
  const entityProxy = (make) => new Proxy({}, {
    get: (_t, name) => (typeof name === 'string' && name !== 'then' && !name.startsWith('_') ? make(name) : undefined),
  });
  const integrations = { Core: { InvokeLLM: async (params) => simulateLLM(params) } };
  function clientFor(userId) {
    const current = () => (userId ? store.find('User', userId) : null);
    return {
      auth: {
        me: async () => current(), // null when signed out — every function answers 401 on that
        updateMe: async (data) => {
          if (!current()) throw Object.assign(new Error('Unauthorized'), { status: 401 });
          return updateOwnUser(userId, data);
        },
      },
      asServiceRole: {
        entities: entityProxy((name) => serviceEntity(name, current())),
        integrations,
      },
      integrations,
    };
  }

  // ---- load the real functions ----
  globalThis.__whistSandboxSdk = {
    createClientFromRequest: (req) => clientFor(userFromAuthHeader(req.headers.get('Authorization'))?.id ?? null),
  };
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith('npm:@base44/sdk')) {
        return {
          url: 'data:text/javascript,export const createClientFromRequest = (req) => globalThis.__whistSandboxSdk.createClientFromRequest(req);',
          shortCircuit: true,
        };
      }
      return nextResolve(specifier, context);
    },
  });
  const handlers = {};
  let captured = null;
  globalThis.Deno = { serve: (...args) => { captured = args.find((a) => typeof a === 'function') || null; }, env: { get: () => undefined } };
  const functionsDir = path.join(ROOT, 'base44/functions');
  for (const name of readdirSync(functionsDir).sort()) {
    const entry = path.join(functionsDir, name, 'entry.ts');
    if (!existsSync(entry)) continue;
    captured = null;
    await import(pathToFileURL(entry).href);
    if (!captured) throw new Error(`base44/functions/${name}/entry.ts did not register a handler with Deno.serve`);
    handlers[name] = captured;
  }

  // Run one function the way the platform would: a POST with the caller's bearer token.
  async function invoke(name, token, body, { rawBody = null } = {}) {
    const handler = handlers[name];
    if (!handler) return { status: 404, data: { error: `Function "${name}" not found` }, text: null };
    const headers = { 'Content-Type': 'application/json', 'Base44-App-Id': APP_ID };
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = new Request(`http://sandbox.local/functions/${name}`, {
      method: 'POST',
      headers,
      body: rawBody != null ? rawBody : JSON.stringify(body ?? {}),
    });
    let res;
    try {
      res = await handler(req);
    } catch (error) {
      return { status: 500, data: { error: error?.message || String(error) }, text: null };
    }
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, text, contentType: res.headers.get('content-type') || 'application/json' };
  }

  // ---- seeding: the clock and Math.random are simulated only while the seed runs ----
  let gate = Promise.resolve();
  async function reset() {
    const run = async () => {
      clearState();
      if (!seed) return;
      const RealDate = globalThis.Date;
      const realRandom = Math.random;
      const clock = { ms: anchor };
      function SandboxDate(...args) {
        if (!new.target) return new RealDate(clock.ms).toString();
        const d = args.length === 0 ? new RealDate(clock.ms) : new RealDate(...args);
        Object.setPrototypeOf(d, new.target.prototype);
        return d;
      }
      SandboxDate.prototype = RealDate.prototype;
      SandboxDate.now = () => clock.ms;
      SandboxDate.parse = RealDate.parse;
      SandboxDate.UTC = RealDate.UTC;
      globalThis.Date = SandboxDate;
      Math.random = makeRng('whist-sandbox/functions'); // deterministic invite codes
      try {
        state.seedSummary = await seed(backend, { clock, anchor, RealDate });
      } finally {
        globalThis.Date = RealDate;
        Math.random = realRandom;
      }
    };
    const attempt = gate.then(run, run);
    gate = attempt.catch(() => {});
    await attempt;
    log(`seeded: ${entityNames.map((n) => `${n} ${store.count(n)}`).join(', ')}`);
  }

  const backend = {
    anchor,
    pageCap,
    schemas,
    entityNames,
    functionNames: Object.keys(handlers),
    store,
    state,
    service: entityProxy((name) => serviceEntity(name, null)),
    clientFor,
    invoke,
    invokeAs: (userId, name, body) => invoke(name, userId ? tokenFor(userId) : null, body),
    tokenFor,
    userFromToken,
    userFromAuthHeader,
    createUser,
    findUserByEmail,
    updateOwnUser,
    passwordOf: (userId) => state.passwords.get(userId) ?? null,
    setPassword: (userId, password) => state.passwords.set(userId, String(password)),
    rlsAllows: (entity, op, row, user) => rlsAllows(schemas[entity]?.rls ? schemas[entity].rls[op] : null, row, user),
    simulateLLM,
    reset,
    whenReady: () => gate,
    counts: () => Object.fromEntries(entityNames.map((n) => [n, store.count(n)])),
  };
  await reset();
  return backend;
}
