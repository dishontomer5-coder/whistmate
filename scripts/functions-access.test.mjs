// Who-can-do-what tests for the backend functions: the read path (P12-1), every function
// that writes (P13-7), and the Phase 13 review fixes (read-only groups, paging, 404s...).
// Run with:  node scripts/functions-access.test.mjs      (dependency-free, Node >= 22.15)
//            ACCESS_TEST_VERBOSE=1 also lists the checks that pass, by section.
//
// The functions run on Base44 (Deno) and can't be called locally, so this loads the REAL
// entry.ts files and runs them against an in-memory stand-in for the Base44 backend:
// `npm:@base44/sdk` is swapped for a stub client and `Deno.serve` just hands us the
// request handler. What is under test is the functions' own logic — membership checks,
// scoping, what leaves the server, what gets written — not Base44 itself.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// --- in-memory Base44 stand-in ------------------------------------------------
const db = { User: [], Group: [], GroupMember: [], Session: [], Game: [], RoundResult: [], TableTalkNote: [], JoinAttempt: [] };
const laggingUsers = new Set(); // users whose membership query returns nothing (read-after-write lag)
let currentUser = null;         // who the next request is signed in as (null = signed out)
let seq = 0;
let writeCalls = 0;             // create/update/delete calls (and auth.updateMe) made by the current request
let getCalls = [];              // 'Entity:id' for every get() made by the current request

// One page of rows, the way the platform hands them out: 50 unless a limit is given (the
// SDK's documented default), never more than 500 (the cap measured in P12-5).
const DEFAULT_PAGE = 50;
const MAX_PAGE = 500;
const page = (rows, sort, limit, skip) => {
  const desc = sort.startsWith('-');
  const key = desc ? sort.slice(1) : sort;
  return rows
    .sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (desc ? -1 : 1))
    .slice(skip, skip + Math.min(limit, MAX_PAGE))
    .map((row) => ({ ...row }));
};

const matches = (row, query) => Object.entries(query).every(([key, want]) => {
  const have = row[key];
  if (want && typeof want === 'object' && !Array.isArray(want)) {
    if ('$in' in want && !want.$in.includes(have)) return false;
    if ('$lte' in want && !(have <= want.$lte)) return false;
    if ('$lt' in want && !(have < want.$lt)) return false;
    if ('$gte' in want && !(have >= want.$gte)) return false;
    return true;
  }
  return have === want;
});

const entity = (name) => ({
  async filter(query = {}, sort = '-created_date', limit = DEFAULT_PAGE, skip = 0) {
    if (name === 'GroupMember' && query.user_id && laggingUsers.has(query.user_id)) return [];
    return page(db[name].filter((row) => matches(row, query)), sort, limit, skip);
  },
  async list(sort = '-created_date', limit = DEFAULT_PAGE, skip = 0) {
    return page([...db[name]], sort, limit, skip);
  },
  async get(id) {
    getCalls.push(`${name}:${id}`);
    const row = db[name].find((r) => r.id === id);
    if (!row) throw new Error(`${name} ${id} not found`);
    return { ...row };
  },
  async create(data) {
    writeCalls++;
    const row = { id: `${name}-new-${++seq}`, created_date: new Date(Date.UTC(2026, 10, 1, 0, 0, seq)).toISOString(), ...data };
    db[name].push(row);
    return { ...row };
  },
  async bulkCreate(list) {
    writeCalls++;
    // One created_date for the whole batch, like the real bulkCreate.
    const created = new Date(Date.UTC(2026, 10, 1, 0, 0, seq + 1)).toISOString();
    const rows = list.map((data) => ({ id: `${name}-new-${++seq}`, created_date: created, ...data }));
    db[name].push(...rows);
    return rows.map((row) => ({ ...row }));
  },
  async update(id, data) {
    writeCalls++;
    const row = db[name].find((r) => r.id === id);
    if (!row) throw new Error(`${name} ${id} not found`);
    Object.assign(row, data);
    return { ...row };
  },
  async delete(id) {
    writeCalls++;
    const index = db[name].findIndex((r) => r.id === id);
    if (index < 0) throw new Error(`${name} ${id} not found`);
    db[name].splice(index, 1);
    return { success: true };
  },
  async deleteMany(query = {}) {
    writeCalls++;
    const kept = db[name].filter((row) => !matches(row, query));
    const deleted = db[name].length - kept.length;
    db[name] = kept;
    return { deleted };
  },
});

globalThis.__b44stub = {
  createClientFromRequest: () => ({
    auth: {
      me: async () => currentUser,
      updateMe: async (data) => { writeCalls++; Object.assign(currentUser, data); return currentUser; },
    },
    asServiceRole: { entities: new Proxy({}, { get: (_target, name) => entity(name) }) },
  }),
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('npm:@base44/sdk')) {
      return {
        url: 'data:text/javascript,export const createClientFromRequest = (req) => globalThis.__b44stub.createClientFromRequest(req);',
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

// --- which functions write ------------------------------------------------------
// Every folder in base44/functions is on exactly one of these two lists; a guard at the
// end of this file fails if one is on neither, so a new function cannot be added without
// deciding. WRITE = its code creates, updates or deletes something. That includes three
// functions that exist to read but also write the caller's own user record or the join
// rate-limit log (getMyGroups, getActivityFeed, previewGroupByCode).
// Each write function lists the kinds of caller it must be checked against (see check()).
// The last two kinds are the group it acts on being archived, and being deleted: a group
// that is not active is read-only, with a few named exceptions.
const READ_FUNCTIONS = [
  'askRules', 'computeGlobalStats', 'computePlayerStats', 'getGroupData', 'getGroupMembers',
  'getPlayerNotes', 'listAllGroupsWithStats',
];
const NOT_ACTIVE = ['archived group', 'deleted group'];
const MEMBERS_ONLY = ['signed out', 'outsider', 'forged cache', 'honest lag', 'allowed', ...NOT_ACTIVE];
const ADMINS_ONLY = [...MEMBERS_ONLY, 'plain member', 'forged admin'];
const WRITE_FUNCTIONS = {
  // any member of the group (deleteRound: a scored round needs a group admin)
  startRound: MEMBERS_ONLY, submitBids: MEMBERS_ONLY, saveRoundResults: MEMBERS_ONLY,
  deleteRound: [...MEMBERS_ONLY, 'plain member', 'forged admin'],
  startSession: MEMBERS_ONLY, closeSession: MEMBERS_ONLY, createNote: MEMBERS_ONLY,
  // group admins only
  updateRound: ADMINS_ONLY, deleteNote: ADMINS_ONLY, addGhostMember: ADMINS_ONLY, removeMember: ADMINS_ONLY,
  renameMember: ADMINS_ONLY, unclaimMember: ADMINS_ONLY, updateMemberRole: ADMINS_ONLY,
  updateGroupSettings: ADMINS_ONLY, setGroupStatus: ADMINS_ONLY, regenerateInviteCode: ADMINS_ONLY,
  // the invite code is the key
  joinGroupByCode: ['signed out', 'outsider', 'forged cache', 'forged admin', 'honest lag', 'allowed', ...NOT_ACTIVE],
  previewGroupByCode: ['signed out', 'outsider', 'forged cache', 'allowed', ...NOT_ACTIVE],
  // any signed-in user, about themselves — no group is written to, so no group status applies
  createGroup: ['signed out', 'forged cache', 'allowed'],
  getMyGroups: ['signed out', 'forged cache', 'forged admin', 'honest lag', 'allowed'],
  getActivityFeed: ['signed out', 'forged cache', 'honest lag', 'allowed'],
  // app admins only
  purgeGroup: ['signed out', 'outsider', 'forged cache', 'forged admin', 'allowed', ...NOT_ACTIVE],
  cleanupOrphans: ['signed out', 'outsider', 'forged cache', 'forged admin', 'allowed', ...NOT_ACTIVE],
};

const FUNCTIONS_DIR = path.join(ROOT, 'base44/functions');
const FUNCTION_FOLDERS = readdirSync(FUNCTIONS_DIR).filter((name) => statSync(path.join(FUNCTIONS_DIR, name)).isDirectory()).sort();
const source = (name) => readFileSync(path.join(FUNCTIONS_DIR, name, 'entry.ts'), 'utf8');

const handlers = {};
let captured = null;
globalThis.Deno = { serve: (handler) => { captured = handler; } };
for (const name of FUNCTION_FOLDERS) {
  captured = null;
  await import(path.join(FUNCTIONS_DIR, name, 'entry.ts'));
  assert.ok(captured, `${name} did not register a handler`);
  handlers[name] = captured;
}

// Runs one request. `me` is the caller's user record afterwards (functions can write it
// through auth.updateMe); `writes` counts the write calls the request made, and `gets`
// lists its reads by id ('Entity:id').
async function call(name, user, body = {}) {
  currentUser = user ? structuredClone(user) : null;
  writeCalls = 0;
  getCalls = [];
  const res = await handlers[name](new Request('http://test.local/', { method: 'POST', body: JSON.stringify(body) }));
  return { status: res.status, data: await res.json(), me: currentUser, writes: writeCalls, gets: getCalls };
}

// --- fixtures -----------------------------------------------------------------
const at = (n) => new Date(Date.UTC(2026, 6, 1, 0, 0, n)).toISOString();

db.Group.push(
  { id: 'gA', name: 'Group A', invite_code: 'AAAAAA', status: 'active' },
  { id: 'gB', name: 'Group B', invite_code: 'BBBBBB', status: 'active' },
  { id: 'gD', name: 'Deleted', invite_code: 'DDDDDD', status: 'deleted' },
);
db.GroupMember.push(
  { id: 'mAlice', group_id: 'gA', user_id: 'uAlice', role: 'admin', player_name: 'Alice', claimed: true, claim_token: null, created_date: at(1) },
  { id: 'mBob', group_id: 'gA', user_id: 'uBob', role: 'player', player_name: 'Bob', claimed: true, claim_token: null, created_date: at(2) },
  { id: 'mGhost', group_id: 'gA', user_id: null, role: 'player', player_name: 'Ghost', claimed: false, claim_token: 'SECRET-CLAIM', created_date: at(3) },
  { id: 'mDan', group_id: 'gA', user_id: null, role: 'player', player_name: 'Dan', claimed: false, claim_token: null, created_date: at(4) },
  { id: 'mFrank', group_id: 'gA', user_id: 'uFrank', role: 'player', player_name: 'Frank', claimed: true, claim_token: null, created_date: at(5) },
  { id: 'mCarol', group_id: 'gB', user_id: 'uCarol', role: 'admin', player_name: 'Carol', claimed: true, claim_token: null, created_date: at(6) },
  { id: 'mGina', group_id: 'gD', user_id: 'uGina', role: 'admin', player_name: 'Gina', claimed: true, claim_token: null, created_date: at(7) },
);
db.Session.push(
  { id: 'sA1', group_id: 'gA', name: 'Big Night', status: 'closed', session_date: '2026-07-01', location: 'Alice’s place', created_date: at(10) },
  { id: 'sA2', group_id: 'gA', name: 'Short Night', status: 'open', session_date: '2026-07-08', created_date: at(11) },
  { id: 'sB1', group_id: 'gB', name: 'B Night', status: 'open', session_date: '2026-07-02', created_date: at(12) },
  { id: 'sD1', group_id: 'gD', name: 'Gone', status: 'closed', session_date: '2026-07-03', created_date: at(13) },
);

// Group A, session sA1: 130 scored rounds x 4 players = 520 results — past the 500-row page.
// Each round's four results share one created_date, like a real bulkCreate.
const SEATS = [['mAlice', 'Alice'], ['mBob', 'Bob'], ['mGhost', 'Ghost'], ['mDan', 'Dan']];
const addRound = ({ id, group, session, number, seats, scored = true }) => {
  const created = at(100 + db.Game.length);
  db.Game.push({ id, group_id: group, session_id: session, round_number: number, status: scored ? 'complete' : 'bidding', everyone_falls: false, created_date: created });
  seats.forEach(([playerId, playerName], i) => db.RoundResult.push({
    id: `${id}-r${i}`, game_id: id, session_id: session, group_id: group, player_id: playerId, player_name: playerName,
    bid_order: i, bid: scored ? 3 : null, tricks_won: scored ? 3 : null, reneged: false, points: scored ? 19 : null, created_date: created,
  }));
};
for (let n = 1; n <= 130; n++) addRound({ id: `rA1-${n}`, group: 'gA', session: 'sA1', number: n, seats: SEATS });
// sA2: Alice plays, Bob does not — so only sA1 is a night Alice and Bob shared.
addRound({ id: 'rA2-1', group: 'gA', session: 'sA2', number: 1, seats: [['mAlice', 'Alice'], ['mFrank', 'Frank'], ['mGhost', 'Ghost'], ['mDan', 'Dan']] });
addRound({ id: 'rA2-2', group: 'gA', session: 'sA2', number: 2, seats: [['mAlice', 'Alice'], ['mFrank', 'Frank'], ['mGhost', 'Ghost'], ['mDan', 'Dan']], scored: false });
addRound({ id: 'rB1-1', group: 'gB', session: 'sB1', number: 1, seats: [['mCarol', 'Carol'], ['mCarol', 'Carol'], ['mCarol', 'Carol'], ['mCarol', 'Carol']] });
addRound({ id: 'rD1-1', group: 'gD', session: 'sD1', number: 1, seats: [['mGina', 'Gina'], ['mGina', 'Gina'], ['mGina', 'Gina'], ['mGina', 'Gina']] });

db.TableTalkNote.push(
  { id: 'n1', group_id: 'gA', target_player_id: 'mBob', note: 'Bids too high', is_anonymous: false, author_user_id: 'uAlice', author_name: 'Alice', created_date: at(900) },
  // Anonymous notes are stored without an author; this row carries one on purpose to prove it is stripped anyway.
  { id: 'n2', group_id: 'gA', target_player_id: 'mBob', note: 'Never follows suit', is_anonymous: true, author_user_id: 'uFrank', author_name: 'Frank', created_date: at(901) },
  { id: 'n3', group_id: 'gB', target_player_id: 'mCarol', note: 'B-only gossip', is_anonymous: false, author_user_id: 'uCarol', author_name: 'Carol', created_date: at(902) },
);

const alice = { id: 'uAlice', email: 'alice@example.com', role: 'user', groups: [] };
const bob = { id: 'uBob', email: 'bob@example.com', role: 'user', groups: [] };
const carol = { id: 'uCarol', email: 'carol@example.com', role: 'user', groups: [] };
const dave = { id: 'uDave', email: 'dave@example.com', role: 'user', groups: [] };   // signed up, in no group
const gina = { id: 'uGina', email: 'gina@example.com', role: 'user', groups: [] };   // member of the deleted group
const root = { id: 'uRoot', email: 'root@example.com', role: 'admin', groups: [] };  // app admin, in no group
// Honest lag: Frank really is a member, but his membership query comes back empty for now.
const frank = { id: 'uFrank', email: 'frank@example.com', role: 'user', groups: [{ group_id: 'gA', member_id: 'mFrank', role: 'player', player_name: 'Frank' }] };
laggingUsers.add('uFrank');
// Forgeries: a user can write their own record, so each of these claims to be a Group A admin.
const forgers = {
  'points at someone else’s member row': { id: 'uEve', role: 'user', groups: [{ group_id: 'gA', member_id: 'mAlice', role: 'admin', player_name: 'Eve' }] },
  'points at an unclaimed player': { id: 'uEve', role: 'user', groups: [{ group_id: 'gA', member_id: 'mGhost', role: 'admin', player_name: 'Eve' }] },
  'points at a row that does not exist': { id: 'uEve', role: 'user', groups: [{ group_id: 'gA', member_id: 'mNope', role: 'admin', player_name: 'Eve' }] },
  'has no member id at all': { id: 'uEve', role: 'user', groups: [{ group_id: 'gA', role: 'admin', player_name: 'Eve' }] },
  'points at her own row in another group': { id: 'uCarol', role: 'user', groups: [{ group_id: 'gA', member_id: 'mCarol', role: 'admin', player_name: 'Carol' }] },
};

// --- test runner ----------------------------------------------------------------
let pass = 0;
let fail = 0;
// ACCESS_TEST_VERBOSE=1 also lists the checks that pass, each with the section it belongs
// to — used to show which checks a given version of the functions fails.
const VERBOSE = !!process.env.ACCESS_TEST_VERBOSE;
let section = 'P12 read path';
async function t(label, fn) {
  try { await fn(); pass++; if (VERBOSE) console.log(`PASS [${section}]: ${label}`); }
  catch (e) { fail++; console.error(`FAIL${VERBOSE ? ` [${section}]` : ''}: ${label}\n      ${e.message}`); }
}
// A check on a write function, filed under the kind of caller it covers (WRITE_FUNCTIONS).
const coverage = {};
async function check(name, kind, label, fn) {
  (coverage[name] ||= new Set()).add(kind);
  await t(`${name}: ${label}`, fn);
}

const GROUP_A_SCOPES = [
  ['group', { scope: 'group', group_id: 'gA' }],
  ['session', { scope: 'session', session_id: 'sA1' }],
  ['round', { scope: 'round', round_id: 'rA1-1' }],
  ['player', { scope: 'player', player_id: 'mBob' }],
  ['shared_sessions', { scope: 'shared_sessions', player_id: 'mBob' }],
];
const carriesGroupAData = (data) => JSON.stringify(data).includes('gA') || JSON.stringify(data).includes('Bob');

// --- getGroupData: who gets in ---------------------------------------------------
for (const [scope, body] of GROUP_A_SCOPES) {
  await t(`getGroupData ${scope}: signed out -> 401, no data`, async () => {
    const res = await call('getGroupData', null, body);
    assert.equal(res.status, 401);
    assert.ok(!carriesGroupAData(res.data));
  });
  await t(`getGroupData ${scope}: signed in but in no group -> 403, no data`, async () => {
    const res = await call('getGroupData', dave, body);
    assert.equal(res.status, 403);
    assert.ok(!carriesGroupAData(res.data));
  });
  await t(`getGroupData ${scope}: member of a different group -> 403, no data`, async () => {
    const res = await call('getGroupData', carol, body);
    assert.equal(res.status, 403);
    assert.ok(!carriesGroupAData(res.data));
  });
  for (const [how, forger] of Object.entries(forgers)) {
    await t(`getGroupData ${scope}: forged membership cache (${how}) -> 403`, async () => {
      const res = await call('getGroupData', forger, body);
      assert.equal(res.status, 403);
      assert.ok(!carriesGroupAData(res.data));
    });
  }
  await t(`getGroupData ${scope}: member -> 200`, async () => {
    assert.equal((await call('getGroupData', alice, body)).status, 200);
  });
  await t(`getGroupData ${scope}: member whose membership query lags (honest cache) -> 200`, async () => {
    assert.equal((await call('getGroupData', frank, body)).status, 200);
  });
  await t(`getGroupData ${scope}: app admin -> 200`, async () => {
    assert.equal((await call('getGroupData', root, body)).status, 200);
  });
}

// --- getGroupData: what comes back --------------------------------------------------
await t('group scope returns every row past the 500-row page, and only this group', async () => {
  const { data } = await call('getGroupData', alice, { scope: 'group', group_id: 'gA' });
  assert.equal(data.sessions.length, 2);
  assert.equal(data.rounds.length, 132);
  assert.equal(data.results.length, 528);
  assert.equal(new Set(data.results.map((r) => r.id)).size, 528);
  for (const row of [...data.sessions, ...data.rounds, ...data.results]) assert.equal(row.group_id, 'gA');
});
await t('group scope with include_results:false skips results', async () => {
  const { data } = await call('getGroupData', alice, { scope: 'group', group_id: 'gA', include_results: false });
  assert.equal(data.sessions.length, 2);
  assert.equal(data.rounds.length, 132);
  assert.deepEqual(data.results, []);
});
await t('session scope returns that session only', async () => {
  const { data } = await call('getGroupData', alice, { scope: 'session', session_id: 'sA2' });
  assert.equal(data.session.id, 'sA2');
  assert.deepEqual(data.rounds.map((r) => r.id).sort(), ['rA2-1', 'rA2-2']);
  assert.equal(data.results.length, 8);
  assert.ok(data.results.every((r) => r.session_id === 'sA2'));
});
await t('round scope returns the round, its session and its four results', async () => {
  const { data } = await call('getGroupData', bob, { scope: 'round', round_id: 'rA1-7' });
  assert.equal(data.round.id, 'rA1-7');
  assert.equal(data.session.id, 'sA1');
  assert.equal(data.results.length, 4);
  assert.ok(data.results.every((r) => r.game_id === 'rA1-7'));
});
await t('player scope returns every scored round of a short history, newest first, with their rounds and sessions', async () => {
  const { data } = await call('getGroupData', bob, { scope: 'player', player_id: 'mAlice' });
  assert.deepEqual(data.player, { id: 'mAlice', name: 'Alice', group_id: 'gA' });
  // Alice scored in 130 rounds of Big Night and one of Short Night: all 131 come back,
  // and the response says that this is all of them (it used to stop at 50 without a word).
  assert.equal(data.results.length, 131);
  assert.equal(data.total_rows, 131);
  assert.equal(data.limit, 200);
  assert.ok(data.results.every((r) => r.player_id === 'mAlice' && r.points != null));
  assert.equal(data.results[0].game_id, 'rA2-1'); // newest scored round; rA2-2 is unscored
  const times = data.results.map((r) => new Date(r.created_date).getTime());
  assert.deepEqual(times, [...times].sort((a, b) => b - a));
  const roundIds = new Set(data.rounds.map((g) => g.id));
  assert.equal(roundIds.size, 131);
  assert.ok(data.results.every((r) => roundIds.has(r.game_id)));
  // Every row can name its night: the session's name, date and status, by session id.
  assert.deepEqual(data.sessions, {
    sA1: { id: 'sA1', name: 'Big Night', session_date: '2026-07-01', status: 'closed', counted_rounds: 130, no_winner: false },
    sA2: { id: 'sA2', name: 'Short Night', session_date: '2026-07-08', status: 'open', counted_rounds: 1, no_winner: false },
  });
});
await t('player scope never returns the claim token', async () => {
  const { data } = await call('getGroupData', alice, { scope: 'player', player_id: 'mGhost' });
  assert.ok(!JSON.stringify(data).includes('SECRET-CLAIM'));
});
await t('shared_sessions lists only the nights both players sat at', async () => {
  const { data } = await call('getGroupData', alice, { scope: 'shared_sessions', player_id: 'mBob' });
  assert.deepEqual(data.sessions, [{ id: 'sA1', name: 'Big Night', session_date: '2026-07-01', created_date: at(10) }]);
});
await t('shared_sessions is empty for an app admin who is not a player', async () => {
  const { data } = await call('getGroupData', root, { scope: 'shared_sessions', player_id: 'mBob' });
  assert.deepEqual(data.sessions, []);
});
await t('a member reaches their own group', async () => {
  const { status, data } = await call('getGroupData', carol, { scope: 'group', group_id: 'gB' });
  assert.equal(status, 200);
  assert.equal(data.results.length, 4);
});
await t('a soft-deleted group is gone for its members, visible to the app admin', async () => {
  assert.equal((await call('getGroupData', gina, { scope: 'group', group_id: 'gD' })).status, 404);
  assert.equal((await call('getGroupData', gina, { scope: 'session', session_id: 'sD1' })).status, 404);
  assert.equal((await call('getGroupData', root, { scope: 'group', group_id: 'gD' })).status, 200);
});
await t('unknown ids -> 404; missing ids and unknown scopes -> 400', async () => {
  assert.equal((await call('getGroupData', alice, { scope: 'session', session_id: 'nope' })).status, 404);
  assert.equal((await call('getGroupData', alice, { scope: 'round', round_id: 'nope' })).status, 404);
  assert.equal((await call('getGroupData', alice, { scope: 'player', player_id: 'nope' })).status, 404);
  assert.equal((await call('getGroupData', alice, { scope: 'group' })).status, 400);
  assert.equal((await call('getGroupData', alice, { scope: 'everything' })).status, 400);
  assert.equal((await call('getGroupData', alice, {})).status, 400);
});
await t('an unknown group id does not reveal whether the group exists', async () => {
  assert.equal((await call('getGroupData', dave, { scope: 'group', group_id: 'nope' })).status, 403);
  assert.equal((await call('getGroupData', dave, { scope: 'group', group_id: 'gA' })).status, 403);
});

// --- getPlayerNotes ---------------------------------------------------------------
await t('getPlayerNotes: signed out 401; outsiders and forgers 403', async () => {
  assert.equal((await call('getPlayerNotes', null, { player_id: 'mBob' })).status, 401);
  assert.equal((await call('getPlayerNotes', dave, { player_id: 'mBob' })).status, 403);
  assert.equal((await call('getPlayerNotes', carol, { player_id: 'mBob' })).status, 403);
  for (const forger of Object.values(forgers)) {
    const res = await call('getPlayerNotes', forger, { player_id: 'mBob' });
    assert.equal(res.status, 403);
    assert.ok(!JSON.stringify(res.data).includes('Bids too high'));
  }
});
await t('getPlayerNotes: a member sees the notes; author ids never leave the server', async () => {
  const { status, data } = await call('getPlayerNotes', alice, { player_id: 'mBob' });
  assert.equal(status, 200);
  assert.deepEqual(data.notes.map((n) => n.id), ['n2', 'n1']);
  assert.ok(data.notes.every((n) => !('author_user_id' in n)));
  const [anon, signed] = data.notes;
  assert.equal(anon.author_name, null);
  assert.equal(anon.is_mine, false);
  assert.equal(signed.author_name, 'Alice');
  assert.equal(signed.is_mine, true);
  assert.ok(!JSON.stringify(data).includes('Frank')); // the anonymous note's real author
});
await t('getPlayerNotes: is_mine is false for someone else’s note, even the anonymous author’s own', async () => {
  const asBob = await call('getPlayerNotes', bob, { player_id: 'mBob' });
  assert.ok(asBob.data.notes.every((n) => n.is_mine === false));
  const asFrank = await call('getPlayerNotes', frank, { player_id: 'mBob' });
  assert.ok(asFrank.data.notes.every((n) => n.is_mine === false));
});
await t('getPlayerNotes: missing or unknown player', async () => {
  assert.equal((await call('getPlayerNotes', alice, {})).status, 400);
  assert.equal((await call('getPlayerNotes', alice, { player_id: 'nope' })).status, 404);
});

// --- getGroupMembers (roster, plus emails for admins) ---------------------------------
await t('getGroupMembers: a forged admin cache gets nothing', async () => {
  for (const forger of Object.values(forgers)) {
    const res = await call('getGroupMembers', forger, { group_id: 'gA' });
    assert.equal(res.status, 403);
    assert.equal(res.data.members, undefined);
  }
});
await t('getGroupMembers: honest lag still works, and the role comes from the row', async () => {
  const promoted = structuredClone(frank);
  promoted.groups[0].role = 'admin'; // the cache lies about the role; the row says player
  const { status, data } = await call('getGroupMembers', promoted, { group_id: 'gA' });
  assert.equal(status, 200);
  assert.equal(data.my_role, 'player');
  assert.ok(data.members.every((m) => !('email' in m)));
});
await t('getGroupMembers: members and outsiders', async () => {
  assert.equal((await call('getGroupMembers', alice, { group_id: 'gA' })).status, 200);
  assert.equal((await call('getGroupMembers', carol, { group_id: 'gA' })).status, 403);
});

// --- getActivityFeed (notes across the caller's groups) -------------------------------
await t('getActivityFeed: a forged cache does not pull in another group’s notes', async () => {
  for (const forger of Object.values(forgers)) {
    const { data } = await call('getActivityFeed', forger, {});
    assert.ok(!JSON.stringify(data).includes('Bids too high'));
    assert.ok(!(data.notes || []).some((n) => n.group_id === 'gA'));
  }
});
await t('getActivityFeed: a member sees their own groups only', async () => {
  const asAlice = await call('getActivityFeed', alice, {});
  assert.deepEqual(asAlice.data.notes.map((n) => n.id).sort(), ['n1', 'n2']);
  const asFrank = await call('getActivityFeed', frank, {});
  assert.deepEqual(asFrank.data.notes.map((n) => n.id).sort(), ['n1', 'n2']);
  const asCarol = await call('getActivityFeed', carol, {});
  assert.deepEqual(asCarol.data.notes.map((n) => n.id), ['n3']);
});
await t('getActivityFeed: is_mine marks the caller\'s own signed notes, never an anonymous one, and no author id leaves the server', async () => {
  const mine = (data) => Object.fromEntries(data.notes.map((n) => [n.id, n.is_mine]));
  const asAlice = await call('getActivityFeed', alice, {});
  assert.deepEqual(mine(asAlice.data), { n1: true, n2: false });
  // n2 is anonymous; the fixture stores Frank as its author on purpose — he still must not be told it is his
  const asFrank = await call('getActivityFeed', frank, {});
  assert.deepEqual(mine(asFrank.data), { n1: false, n2: false });
  assert.ok(asAlice.data.notes.every((n) => !('author_user_id' in n)));
});

// --- computePlayerStats -----------------------------------------------------------------
await t('computePlayerStats: naming your own group does not unlock another group’s player', async () => {
  const res = await call('computePlayerStats', carol, { player_id: 'mBob', group_id: 'gB' });
  assert.equal(res.status, 404);
  assert.ok(!JSON.stringify(res.data).includes('Bob'));
});
await t('computePlayerStats: outsiders and forgers 403', async () => {
  assert.equal((await call('computePlayerStats', carol, { player_id: 'mBob' })).status, 403);
  for (const forger of Object.values(forgers)) {
    assert.equal((await call('computePlayerStats', forger, { player_id: 'mBob', group_id: 'gA' })).status, 403);
  }
});
await t('computePlayerStats: a member gets stats, without the claim token', async () => {
  const { status, data } = await call('computePlayerStats', alice, { player_id: 'mGhost', group_id: 'gA' });
  assert.equal(status, 200);
  assert.equal(data.player.name, 'Ghost');
  assert.equal(data.performance.rounds_played, 131);
  assert.ok(!('claim_token' in data.player));
  assert.ok(!JSON.stringify(data).includes('SECRET-CLAIM'));
});
await t('computePlayerStats: honest lag still works', async () => {
  assert.equal((await call('computePlayerStats', frank, { player_id: 'mBob', group_id: 'gA' })).status, 200);
});

// --- createNote: pinning a note to a whist night ----------------------------------------
await t('createNote pins a note to a session of the same group', async () => {
  const { status, data } = await call('createNote', alice, { group_id: 'gA', target_player_id: 'mBob', note: 'Nice zero bid', session_id: 'sA1' });
  assert.equal(status, 200);
  assert.equal(data.note.game_id, 'sA1');
  assert.equal(data.note.game_name, 'Big Night');
  assert.equal(data.note.game_date, '2026-07-01');
});
await t('createNote ignores a session from another group', async () => {
  const { status, data } = await call('createNote', alice, { group_id: 'gA', target_player_id: 'mBob', note: 'Hmm', session_id: 'sB1' });
  assert.equal(status, 200);
  assert.equal(data.note.game_id, null);
  assert.equal(data.note.game_name, null);
});

// =========================================================================================
// The write path (P13-7). A write function must not take the caller's word for who they
// are: user.groups is written with the caller's own token, so it may only point at a
// GroupMember row to re-read by id — and that row must be the caller's, in that group.
// Role and player name come from the row, never from the cache.
// =========================================================================================
section = 'P13-7 write path';

// More of Group A, used by the write checks only.
db.GroupMember.push(
  { id: 'mHana', group_id: 'gA', user_id: 'uHana', role: 'admin', player_name: 'Hana', claimed: true, claim_token: null, created_date: at(20) },
  { id: 'mYael', group_id: 'gA', user_id: 'uYael', role: 'player', player_name: 'Yael', claimed: true, claim_token: null, created_date: at(21) },
  { id: 'mZed', group_id: 'gA', user_id: null, role: 'player', player_name: 'Zed', claimed: false, claim_token: null, created_date: at(22) }, // no history
);
db.TableTalkNote.push(
  { id: 'nW', group_id: 'gA', target_player_id: 'mBob', note: 'Slow to lead', is_anonymous: false, author_user_id: 'uYael', author_name: 'Yael', created_date: at(903) },
);

const yael = { id: 'uYael', email: 'yael@example.com', role: 'user', groups: [] };
// Honest lag, admin edition: Hana really is a Group A admin, but her membership query comes back empty.
const hana = { id: 'uHana', email: 'hana@example.com', role: 'user', groups: [{ group_id: 'gA', member_id: 'mHana', role: 'admin', player_name: 'Hana' }] };
laggingUsers.add('uHana');
// Real plain members of Group A whose cache claims the admin role (and Alice's name).
const claimingAdmin = (user, memberId) => ({ ...user, groups: [{ group_id: 'gA', member_id: memberId, role: 'admin', player_name: 'Alice' }] });
const bobForged = claimingAdmin(bob, 'mBob');          // his membership query works
const frankForged = claimingAdmin(frank, 'mFrank');    // his membership query lags, so the cache is consulted
const frankAsAlice = claimingAdmin(frank, 'mAlice');   // ...and here it points at the real admin's row

// The store can be put back, and compared with how it was.
const freeze = () => ({ rows: structuredClone(db), seq });
const thaw = (snap) => {
  for (const name of Object.keys(db)) db[name] = structuredClone(snap.rows[name]);
  seq = snap.seq;
};
// What changed since a snapshot, e.g. ['Game +1', 'RoundResult ~4']  (+ created, ~ changed, - deleted).
const changes = (snap) => {
  const out = [];
  for (const name of Object.keys(db)) {
    const before = new Map(snap.rows[name].map((r) => [r.id, JSON.stringify(r)]));
    const after = new Map(db[name].map((r) => [r.id, JSON.stringify(r)]));
    const created = [...after.keys()].filter((id) => !before.has(id)).length;
    const changed = [...after.keys()].filter((id) => before.has(id) && before.get(id) !== after.get(id)).length;
    const deleted = [...before.keys()].filter((id) => !after.has(id)).length;
    if (created) out.push(`${name} +${created}`);
    if (changed) out.push(`${name} ~${changed}`);
    if (deleted) out.push(`${name} -${deleted}`);
  }
  return out;
};
const row = (name, id) => db[name].find((r) => r.id === id);
const base = freeze();
// Every write check starts from the same store: `base`, plus whatever state its request needs.
const fresh = (setup) => { thaw(base); if (setup) setup(); return freeze(); };

// One write function and one request an entitled caller can make.
function writer(name, body, setup) {
  const start = () => fresh(setup);
  return {
    start,
    refuses: (kind, who, user, error, status = 403) => check(name, kind, `${who} -> ${status}, nothing written`, async () => {
      const snap = start();
      const res = await call(name, user, body);
      assert.equal(res.status, status);
      assert.ok([].concat(error).includes(res.data.error), `unexpected message: ${res.data.error}`);
      assert.deepEqual(changes(snap), []);
      assert.equal(res.writes, 0, 'a write was attempted');
    }),
    allows: (kind, who, user, done, verify) => check(name, kind, `${who} -> 200, and it is done`, async () => {
      const snap = start();
      const res = await call(name, user, body);
      assert.equal(res.status, 200, `got ${res.status}: ${res.data.error}`);
      assert.deepEqual(changes(snap), done);
      if (verify) verify(res, snap);
    }),
  };
}

// --- the 17 functions that write inside one group ---------------------------------------
const NOT_A_MEMBER = 'You are not a member of this group';
const finishOpenRound = () => { row('Game', 'rA2-2').status = 'complete'; };
const lockBids = () => {
  Object.assign(row('Game', 'rA2-2'), { status: 'playing', total_bids: 14, table_state: 'up' });
  for (const r of db.RoundResult) if (r.game_id === 'rA2-2') r.bid = r.bid_order < 2 ? 4 : 3;
};

// body: a request that works for an entitled caller.  done: what it changes.
// outsider: the message a non-member gets.  plain: the message a member who is not a group
// admin gets — its presence marks the function as group-admin only.
// appAdmin: whether an app admin who is not in the group gets through (as today).
const GROUP_WRITES = {
  startRound: {
    setup: finishOpenRound,
    body: { session_id: 'sA2', player_ids: ['mAlice', 'mBob', 'mGhost', 'mDan'] },
    done: ['Game +1', 'RoundResult +4'], outsider: NOT_A_MEMBER, appAdmin: true,
    verify: (res) => assert.deepEqual([res.data.round.group_id, res.data.round.status], ['gA', 'bidding']),
  },
  submitBids: {
    body: { game_id: 'rA2-2', bids: { mAlice: 4, mFrank: 4, mGhost: 3, mDan: 3 } },
    done: ['Game ~1', 'RoundResult ~4'], outsider: NOT_A_MEMBER, appAdmin: true,
    verify: () => assert.equal(row('Game', 'rA2-2').status, 'playing'),
  },
  saveRoundResults: {
    setup: lockBids,
    body: { game_id: 'rA2-2', tricks: { mAlice: 4, mFrank: 4, mGhost: 3, mDan: 2 } },
    done: ['Game ~1', 'RoundResult ~4'], outsider: NOT_A_MEMBER, appAdmin: true,
    verify: () => assert.equal(row('Game', 'rA2-2').status, 'complete'),
  },
  deleteRound: {
    body: { game_id: 'rA2-2' }, // a round still in play: any member may undo it (a scored one: see further down)
    done: ['Game -1', 'RoundResult -4'], outsider: NOT_A_MEMBER, appAdmin: true,
    verify: () => assert.equal(row('Game', 'rA2-2'), undefined),
  },
  startSession: {
    setup: () => { row('Session', 'sA2').status = 'closed'; },
    body: { group_id: 'gA', name: 'Next Night' },
    done: ['Session +1'], outsider: NOT_A_MEMBER, appAdmin: true,
    verify: (res) => assert.deepEqual([res.data.session.group_id, res.data.session.status], ['gA', 'open']),
  },
  closeSession: {
    setup: finishOpenRound,
    body: { session_id: 'sA2' },
    done: ['Session ~1'], outsider: NOT_A_MEMBER, appAdmin: true,
    verify: () => assert.equal(row('Session', 'sA2').status, 'closed'),
  },
  createNote: {
    body: { group_id: 'gA', target_player_id: 'mBob', note: 'Counts trumps out loud' },
    done: ['TableTalkNote +1'], outsider: NOT_A_MEMBER, appAdmin: true,
    verify: (res) => assert.equal(res.data.note.group_id, 'gA'),
  },
  updateRound: {
    body: { game_id: 'rA1-1', bids: { mAlice: 5, mBob: 4, mGhost: 3, mDan: 3 }, tricks: { mAlice: 5, mBob: 4, mGhost: 2, mDan: 2 } },
    done: ['Game ~1', 'RoundResult ~4'], appAdmin: true,
    outsider: 'Only a group admin can edit a past round', plain: 'Only a group admin can edit a past round',
    verify: () => assert.deepEqual([row('RoundResult', 'rA1-1-r0').bid, row('RoundResult', 'rA1-1-r0').points], [5, 35]),
  },
  deleteNote: {
    body: { note_id: 'nW' }, // written by Yael, so none of the callers below is its author
    done: ['TableTalkNote -1'], appAdmin: true,
    outsider: 'You can only delete your own notes, or notes in a group you admin',
    plain: 'You can only delete your own notes, or notes in a group you admin',
    verify: () => assert.equal(row('TableTalkNote', 'nW'), undefined),
  },
  addGhostMember: {
    body: { group_id: 'gA', player_name: 'Newbie' },
    done: ['GroupMember +1'], appAdmin: false,
    outsider: NOT_A_MEMBER, plain: 'Only group admins can add ghost members',
    verify: (res) => assert.deepEqual([res.data.member.user_id, res.data.member.role, res.data.member.claimed], [null, 'player', false]),
  },
  removeMember: {
    body: { group_id: 'gA', member_id: 'mZed' },
    done: ['GroupMember -1'], appAdmin: false,
    outsider: NOT_A_MEMBER, plain: 'Only group admins can remove other members',
    verify: () => assert.equal(row('GroupMember', 'mZed'), undefined),
  },
  renameMember: {
    body: { group_id: 'gA', member_id: 'mZed', player_name: 'Zeddy' },
    done: ['GroupMember ~1'], appAdmin: true,
    outsider: 'Only a group admin can rename another player', plain: 'Only a group admin can rename another player',
    verify: () => assert.equal(row('GroupMember', 'mZed').player_name, 'Zeddy'),
  },
  unclaimMember: {
    body: { group_id: 'gA', member_id: 'mYael' },
    done: ['GroupMember ~1'], appAdmin: true,
    outsider: 'Only group admins can unclaim players', plain: 'Only group admins can unclaim players',
    verify: () => assert.deepEqual([row('GroupMember', 'mYael').user_id, row('GroupMember', 'mYael').claimed], [null, false]),
  },
  updateMemberRole: {
    body: { group_id: 'gA', member_id: 'mYael', role: 'admin' },
    done: ['GroupMember ~1'], appAdmin: false,
    outsider: NOT_A_MEMBER, plain: 'Only group admins can change member roles',
    verify: () => assert.equal(row('GroupMember', 'mYael').role, 'admin'),
  },
  updateGroupSettings: {
    body: { group_id: 'gA', updates: { name: 'Table Seven' } },
    done: ['Group ~1'], appAdmin: true,
    outsider: NOT_A_MEMBER, plain: 'Only group admins can update group settings',
    verify: () => assert.equal(row('Group', 'gA').name, 'Table Seven'),
  },
  setGroupStatus: {
    setup: () => { row('Session', 'sA2').status = 'closed'; }, // a group is archived only once nothing is open
    body: { group_id: 'gA', status: 'archived' },
    done: ['Group ~1'], appAdmin: true,
    outsider: 'Only group admins can perform this action', plain: 'Only group admins can perform this action',
    verify: () => assert.equal(row('Group', 'gA').status, 'archived'),
  },
  regenerateInviteCode: {
    body: { group_id: 'gA' },
    done: ['Group ~1'], appAdmin: false,
    outsider: NOT_A_MEMBER, plain: 'Only group admins can regenerate invite codes',
    verify: () => assert.match(row('Group', 'gA').invite_code, /^(?!AAAAAA)[A-Z0-9]{6}$/),
  },
};

for (const [name, c] of Object.entries(GROUP_WRITES)) {
  const fn = writer(name, c.body, c.setup);
  await fn.refuses('signed out', 'signed out', null, 'Unauthorized', 401);
  await fn.refuses('outsider', 'signed in but in no group', dave, c.outsider);
  await fn.refuses('outsider', 'member of a different group', carol, c.outsider);
  for (const [how, forger] of Object.entries(forgers)) {
    await fn.refuses('forged cache', `forged membership cache (${how})`, forger, c.outsider);
  }
  if (c.plain) {
    await fn.refuses('plain member', 'plain member', bob, c.plain);
    await fn.refuses('plain member', 'plain member whose membership query lags (honest cache)', frank, c.plain);
    await fn.refuses('forged admin', 'plain member, cache forged to say admin', bobForged, c.plain);
    await fn.refuses('forged admin', 'plain member whose membership query lags, cache forged to say admin', frankForged, c.plain);
    await fn.refuses('forged admin', 'plain member whose membership query lags, cache pointed at the admin’s row', frankAsAlice, [c.plain, c.outsider]);
    await fn.allows('allowed', 'group admin', alice, c.done, c.verify);
    await fn.allows('honest lag', 'group admin whose membership query lags (honest cache)', hana, c.done, c.verify);
  } else {
    await fn.allows('allowed', 'member', bob, c.done, c.verify);
    await fn.allows('honest lag', 'member whose membership query lags (honest cache)', frank, c.done, c.verify);
  }
  if (c.appAdmin) await fn.allows('allowed', 'app admin who is not in the group', root, c.done, c.verify);
  else await fn.refuses('outsider', 'app admin who is not in the group', root, c.outsider);
}

// --- group writes: what the row decides, beyond getting in ---------------------------------
await check('createNote', 'forged cache', 'the author name comes from the member row, not the cache', async () => {
  fresh();
  const res = await call('createNote', frankForged, GROUP_WRITES.createNote.body); // his cache says he is "Alice"
  assert.equal(res.status, 200);
  assert.equal(res.data.note.author_name, 'Frank');
});
await check('updateMemberRole', 'forged admin', 'a plain member cannot promote themselves', async () => {
  for (const user of [bobForged, frankForged, frankAsAlice]) {
    const snap = fresh();
    const memberId = user.id === 'uBob' ? 'mBob' : 'mFrank';
    const res = await call('updateMemberRole', user, { group_id: 'gA', member_id: memberId, role: 'admin' });
    assert.equal(res.status, 403);
    assert.deepEqual(changes(snap), []);
  }
});
await check('deleteNote', 'allowed', 'the author deletes their own note without being an admin', async () => {
  const snap = fresh();
  assert.equal((await call('deleteNote', yael, { note_id: 'nW' })).status, 200);
  assert.deepEqual(changes(snap), ['TableTalkNote -1']);
});
await check('removeMember', 'allowed', 'a member can leave on their own, without being an admin', async () => {
  const snap = fresh();
  assert.equal((await call('removeMember', yael, { group_id: 'gA', member_id: 'mYael' })).status, 200);
  assert.deepEqual(changes(snap), ['GroupMember -1']);
});
await check('renameMember', 'allowed', 'a member renames themselves without being an admin', async () => {
  const snap = fresh();
  assert.equal((await call('renameMember', bob, { group_id: 'gA', member_id: 'mBob', player_name: 'Bobby' })).status, 200);
  assert.equal(row('GroupMember', 'mBob').player_name, 'Bobby');
  assert.ok(changes(snap).includes('GroupMember ~1'));
});

// --- joinGroupByCode: the invite code is the key; the cache only says "already in" -------------
{
  const JOIN = { invite_code: 'AAAAAA', player_name: 'Newcomer' };
  const WRONG_CODE = { invite_code: 'ZZZZZZ', player_name: 'Newcomer' };
  const join = writer('joinGroupByCode', JOIN);
  const added = (snap) => db.GroupMember.filter((m) => !snap.rows.GroupMember.some((old) => old.id === m.id));
  const cachedGroupA = (res) => res.me.groups.filter((g) => g.group_id === 'gA').map((g) => [g.member_id, g.role]);

  await join.refuses('signed out', 'signed out', null, 'Unauthorized', 401);
  await check('joinGroupByCode', 'outsider', 'without the code -> 404, only the attempt is logged', async () => {
    const snap = join.start();
    assert.equal((await call('joinGroupByCode', dave, WRONG_CODE)).status, 404);
    assert.deepEqual(changes(snap), ['JoinAttempt +1']);
  });
  for (const [how, forger] of Object.entries(forgers)) {
    await check('joinGroupByCode', 'forged cache', `forged membership cache (${how}) counts for nothing: no code, no entry; with the code, a plain player like anyone else`, async () => {
      let snap = join.start();
      assert.equal((await call('joinGroupByCode', forger, WRONG_CODE)).status, 404);
      assert.deepEqual(changes(snap), ['JoinAttempt +1']);

      snap = join.start();
      const res = await call('joinGroupByCode', forger, JOIN);
      assert.equal(res.status, 200, `got ${res.status}: ${res.data.error}`);
      assert.deepEqual(changes(snap), ['GroupMember +1', 'JoinAttempt +1']);
      const [mine] = added(snap);
      assert.deepEqual(
        [mine.group_id, mine.user_id, mine.role, mine.player_name, mine.claimed],
        ['gA', forger.id, 'player', 'Newcomer', true],
      );
      assert.deepEqual(cachedGroupA(res), [[mine.id, 'player']]); // the cache is rewritten from rows
    });
  }
  await check('joinGroupByCode', 'forged admin', 'a member re-joining with a cache forged to say admin -> 409, their row is untouched', async () => {
    for (const user of [bobForged, frankForged]) {
      const snap = join.start();
      const res = await call('joinGroupByCode', user, JOIN);
      assert.equal(res.status, 409);
      assert.equal(res.data.error, 'You are already a member of this group');
      assert.deepEqual(changes(snap), ['JoinAttempt +1']);
    }
  });
  await check('joinGroupByCode', 'honest lag', 'member whose membership query lags (honest cache) -> 409, no second row', async () => {
    const snap = join.start();
    const res = await call('joinGroupByCode', frank, JOIN);
    assert.equal(res.status, 409);
    assert.equal(res.data.error, 'You are already a member of this group');
    assert.deepEqual(changes(snap), ['JoinAttempt +1']);
  });
  await check('joinGroupByCode', 'allowed', 'a newcomer with the code joins as a plain player', async () => {
    const snap = join.start();
    const res = await call('joinGroupByCode', dave, JOIN);
    assert.equal(res.status, 200);
    assert.deepEqual(changes(snap), ['GroupMember +1', 'JoinAttempt +1']);
    const [mine] = added(snap);
    assert.deepEqual([mine.user_id, mine.role], ['uDave', 'player']);
    assert.deepEqual(cachedGroupA(res), [[mine.id, 'player']]);
  });
  await check('joinGroupByCode', 'allowed', 'a newcomer claims an unclaimed player, who stays a plain player', async () => {
    const snap = join.start();
    const res = await call('joinGroupByCode', dave, { invite_code: 'AAAAAA', claim_member_id: 'mDan' });
    assert.equal(res.status, 200);
    assert.deepEqual(changes(snap), ['GroupMember ~1', 'JoinAttempt +1']);
    assert.deepEqual([row('GroupMember', 'mDan').user_id, row('GroupMember', 'mDan').claimed, row('GroupMember', 'mDan').role], ['uDave', true, 'player']);
    assert.deepEqual(cachedGroupA(res), [['mDan', 'player']]);
  });
  await check('joinGroupByCode', 'outsider', 'cannot claim a player who is taken, or one from another group', async () => {
    for (const [memberId, status] of [['mBob', 409], ['mAlice', 409], ['mCarol', 404]]) {
      const snap = join.start();
      assert.equal((await call('joinGroupByCode', dave, { invite_code: 'AAAAAA', claim_member_id: memberId })).status, status);
      assert.deepEqual(changes(snap), ['JoinAttempt +1']);
    }
  });
}

// --- previewGroupByCode: reads, but logs the attempt -----------------------------------------
{
  const preview = writer('previewGroupByCode', { invite_code: 'AAAAAA' });
  await preview.refuses('signed out', 'signed out', null, 'Unauthorized', 401);
  await check('previewGroupByCode', 'outsider', 'without the code -> 404, only the attempt is logged', async () => {
    const snap = preview.start();
    const res = await call('previewGroupByCode', dave, { invite_code: 'ZZZZZZ' });
    assert.equal(res.status, 404);
    assert.ok(!carriesGroupAData(res.data));
    assert.deepEqual(changes(snap), ['JoinAttempt +1']);
  });
  await check('previewGroupByCode', 'forged cache', 'a forged membership cache does not make the caller a member', async () => {
    for (const forger of Object.values(forgers)) {
      const snap = preview.start();
      const res = await call('previewGroupByCode', forger, { invite_code: 'AAAAAA' });
      assert.equal(res.status, 200);
      assert.equal(res.data.already_member, false);
      assert.deepEqual(changes(snap), ['JoinAttempt +1']);
    }
  });
  await check('previewGroupByCode', 'allowed', 'with the code: the group, its unclaimed players, no secrets', async () => {
    const snap = preview.start();
    const res = await call('previewGroupByCode', dave, { invite_code: 'AAAAAA' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.data.group, { id: 'gA', name: 'Group A', description: '' });
    assert.deepEqual(res.data.unclaimed_players.map((p) => p.player_name), ['Dan', 'Ghost', 'Zed']);
    assert.equal(res.data.already_member, false);
    assert.ok(!JSON.stringify(res.data).includes('SECRET-CLAIM'));
    assert.ok(!JSON.stringify(res.data).includes('AAAAAA'));
    assert.deepEqual(changes(snap), ['JoinAttempt +1']);
    assert.equal((await call('previewGroupByCode', frank, { invite_code: 'AAAAAA' })).data.already_member, true);
  });
}

// --- createGroup: anyone signed in, and only ever a new group ------------------------------------
{
  const create = writer('createGroup', { name: 'Fresh Table', player_name: 'Founder' });
  const newMember = (snap) => db.GroupMember.find((m) => !snap.rows.GroupMember.some((old) => old.id === m.id));
  await create.refuses('signed out', 'signed out', null, 'Unauthorized', 401);
  await check('createGroup', 'allowed', 'a signed-in user becomes the admin of the group they create, and of nothing else', async () => {
    const snap = create.start();
    const res = await call('createGroup', dave, { name: 'Fresh Table', player_name: 'Founder' });
    assert.equal(res.status, 200);
    assert.deepEqual(changes(snap), ['Group +1', 'GroupMember +1']);
    const mine = newMember(snap);
    assert.deepEqual([mine.group_id, mine.user_id, mine.role], [res.data.group.id, 'uDave', 'admin']);
    assert.deepEqual(res.me.groups.map((g) => [g.group_id, g.role]), [[res.data.group.id, 'admin']]);
  });
  await check('createGroup', 'forged cache', 'a forged membership cache is thrown away: the cache is rewritten from rows', async () => {
    for (const forger of Object.values(forgers)) {
      const snap = create.start();
      const res = await call('createGroup', forger, { name: 'Fresh Table', player_name: 'Founder' });
      assert.equal(res.status, 200);
      assert.deepEqual(changes(snap), ['Group +1', 'GroupMember +1']);
      assert.notEqual(newMember(snap).group_id, 'gA');
      assert.ok(!res.me.groups.some((g) => g.group_id === 'gA'));
    }
  });
}

// --- getMyGroups: writes the cache, so it must write it from rows ---------------------------------
{
  const mine = writer('getMyGroups', {});
  const groupA = (list) => list.filter((g) => g.group_id === 'gA').map((g) => [g.member_id, g.role, g.player_name]);
  await mine.refuses('signed out', 'signed out', null, 'Unauthorized', 401);
  await check('getMyGroups', 'forged cache', 'a forged membership cache is not echoed back, and is not kept', async () => {
    for (const forger of Object.values(forgers)) {
      const snap = mine.start();
      const res = await call('getMyGroups', forger, {});
      assert.equal(res.status, 200);
      assert.deepEqual(groupA(res.data.groups), []);
      assert.deepEqual(groupA(res.me.groups), []);
      assert.deepEqual(changes(snap), []);
    }
  });
  await check('getMyGroups', 'forged admin', 'a cache forged to say admin comes back with the role from the row', async () => {
    mine.start();
    const res = await call('getMyGroups', frankForged, {});
    assert.deepEqual(groupA(res.data.groups), [['mFrank', 'player', 'Frank']]);
    assert.deepEqual(groupA(res.me.groups), [['mFrank', 'player', 'Frank']]);
    assert.deepEqual(groupA((await call('getMyGroups', frankAsAlice, {})).data.groups), []);
    assert.deepEqual(groupA((await call('getMyGroups', bobForged, {})).data.groups), [['mBob', 'player', 'Bob']]);
  });
  await check('getMyGroups', 'honest lag', 'member whose membership query lags (honest cache) keeps their group', async () => {
    mine.start();
    assert.deepEqual(groupA((await call('getMyGroups', frank, {})).data.groups), [['mFrank', 'player', 'Frank']]);
    assert.deepEqual(groupA((await call('getMyGroups', hana, {})).data.groups), [['mHana', 'admin', 'Hana']]);
  });
  await check('getMyGroups', 'allowed', 'a member gets their own groups, and only the caller’s record is written', async () => {
    const snap = mine.start();
    const res = await call('getMyGroups', alice, {});
    assert.deepEqual(res.data.groups.map((g) => [g.group_id, g.role]), [['gA', 'admin']]);
    assert.deepEqual((await call('getMyGroups', gina, {})).data.groups, []); // her only group is deleted
    assert.deepEqual((await call('getMyGroups', dave, {})).data.groups, []);
    assert.deepEqual(changes(snap), []);
  });
}

// --- getActivityFeed: reads, but can stamp the caller's own "seen" time -------------------------
{
  const feed = writer('getActivityFeed', { mark_seen: true });
  await feed.refuses('signed out', 'signed out', null, 'Unauthorized', 401);
  await check('getActivityFeed', 'forged cache', 'a forged membership cache pulls in nothing, even when marking as seen', async () => {
    for (const forger of Object.values(forgers)) {
      const snap = feed.start();
      const res = await call('getActivityFeed', forger, { mark_seen: true });
      assert.ok(!(res.data.notes || []).some((n) => n.group_id === 'gA'));
      assert.ok(!JSON.stringify(res.data).includes('Bids too high'));
      assert.deepEqual(changes(snap), []);
    }
  });
  await check('getActivityFeed', 'honest lag', 'member whose membership query lags (honest cache) sees their group’s notes', async () => {
    feed.start();
    const res = await call('getActivityFeed', frank, {});
    assert.ok(res.data.notes.length > 0 && res.data.notes.every((n) => n.group_id === 'gA'));
  });
  await check('getActivityFeed', 'allowed', 'marking as seen stamps the caller’s own record and nothing else', async () => {
    const snap = feed.start();
    const res = await call('getActivityFeed', alice, { mark_seen: true });
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.me).sort(), [...Object.keys(alice), 'activity_seen_ts'].sort());
    assert.deepEqual(res.me.groups, alice.groups);
    assert.deepEqual(changes(snap), []);
  });
}

// --- purgeGroup, cleanupOrphans: app admins only ---------------------------------------------------
const APP_ADMIN_ONLY = 'App admin only';
// One of each kind of orphan: a session and a round with no group, and a note about nobody.
const orphans = () => {
  db.Session.push({ id: 'sLost', group_id: null, name: 'Lost', status: 'closed', created_date: at(950) });
  db.Game.push({ id: 'rLost', group_id: null, session_id: 'sLost', round_number: 1, status: 'complete', created_date: at(951) });
  db.RoundResult.push({ id: 'rLost-r0', game_id: 'rLost', group_id: null, player_id: 'mGone', points: 10, created_date: at(951) });
  db.TableTalkNote.push({ id: 'nLost', group_id: 'gA', target_player_id: 'mGone', note: 'About nobody', created_date: at(952) });
};
const inGroupA = (name) => base.rows[name].filter((r) => r.group_id === 'gA').length;
{
  const appAdminOnly = {
    purgeGroup: {
      fn: writer('purgeGroup', { group_id: 'gA' }),
      done: [
        'Group -1', `GroupMember -${inGroupA('GroupMember')}`, `Session -${inGroupA('Session')}`, `Game -${inGroupA('Game')}`,
        `RoundResult -${inGroupA('RoundResult')}`, `TableTalkNote -${inGroupA('TableTalkNote')}`,
      ],
      verify: () => {
        assert.equal(row('Group', 'gA'), undefined);
        for (const name of Object.keys(db)) assert.ok(!db[name].some((r) => r.group_id === 'gA'), `${name} still has Group A rows`);
      },
    },
    cleanupOrphans: {
      fn: writer('cleanupOrphans', {}, orphans),
      done: ['Session -1', 'Game -1', 'RoundResult -1', 'TableTalkNote -1'],
      verify: (res) => assert.deepEqual(res.data, { sessions_deleted: 1, rounds_deleted: 1, results_deleted: 1, notes_deleted: 1 }),
    },
  };
  for (const { fn, done, verify } of Object.values(appAdminOnly)) {
    await fn.refuses('signed out', 'signed out', null, 'Unauthorized', 401);
    await fn.refuses('outsider', 'signed in but in no group', dave, APP_ADMIN_ONLY);
    for (const [how, forger] of Object.entries(forgers)) {
      await fn.refuses('forged cache', `forged membership cache (${how})`, forger, APP_ADMIN_ONLY);
    }
    await fn.refuses('forged admin', 'group admin (a group admin is not an app admin)', alice, APP_ADMIN_ONLY);
    await fn.refuses('forged admin', 'plain member whose membership query lags, cache forged to say admin', frankForged, APP_ADMIN_ONLY);
    await fn.allows('allowed', 'app admin', root, done, verify);
  }
}
// =========================================================================================
// The Phase 13 review fixes. Every check from here to the static guards fails against
// the functions as they were at commit 360803f — the behaviour each one pins is new.
// =========================================================================================
section = 'P13 review fixes';

const READ_ONLY = 'This group is archived — it is read-only';
const GROUP_GONE = 'Group not found';
const MEMBER_GONE = 'Member not found in this group';
const LAST_ADMIN = 'Promote another member first.';
const outcome = (res) => [res.status, res.data.error];
const groupStatus = (status) => () => { row('Group', 'gA').status = status; };
// The two ways a group is not active, as [status, kind of check, what a write gets back].
const GROUP_STATES = [['archived', 'archived group', [403, READ_ONLY]], ['deleted', 'deleted group', [404, GROUP_GONE]]];
// 520 more players in Group A, all newer than its real members — who are then no longer
// on the first page of the roster (50 rows by default, 500 at the most).
const bigGroupA = () => {
  for (let i = 0; i < 520; i++) {
    db.GroupMember.push({ id: `mExtra${i}`, group_id: 'gA', user_id: null, role: 'player', player_name: `Extra ${i}`, claimed: false, claim_token: null, created_date: at(2000 + i) });
  }
};
// Group B grows past a page of members, sessions and rounds, all newer than Group A's.
const bigGroupB = () => {
  for (let i = 0; i < 520; i++) {
    db.GroupMember.push({ id: `mB${i}`, group_id: 'gB', user_id: null, role: 'player', player_name: `B ${i}`, claimed: false, claim_token: null, created_date: at(3000 + i) });
    db.Session.push({ id: `sB-x${i}`, group_id: 'gB', name: `B night ${i}`, status: 'closed', session_date: '2026-08-01', created_date: at(3000 + i) });
    db.Game.push({ id: `rB-x${i}`, group_id: 'gB', session_id: `sB-x${i}`, round_number: 1, status: 'complete', everyone_falls: false, created_date: at(3000 + i) });
  }
};

// --- updateMemberRole: only this group's members, and never the last admin with an account ----
await check('updateMemberRole', 'outsider', 'the member must be in the caller’s own group, whatever the new role (404, no foreign row)', async () => {
  const snap = fresh();
  for (const [memberId, role] of [['mAlice', 'player'], ['mBob', 'player'], ['mBob', 'admin']]) {
    const res = await call('updateMemberRole', carol, { group_id: 'gB', member_id: memberId, role }); // Carol admins Group B
    assert.deepEqual(outcome(res), [404, MEMBER_GONE]);
    assert.equal(res.data.member, undefined);
  }
  assert.deepEqual(changes(snap), []);
  // A plain member of Group A makes a throwaway group to be an admin of.
  const own = (await call('createGroup', bob, { name: 'Throwaway', player_name: 'Bob' })).data.group.id;
  const afterCreating = freeze();
  for (const memberId of ['mAlice', 'mHana', 'mCarol']) {
    assert.deepEqual(outcome(await call('updateMemberRole', bob, { group_id: own, member_id: memberId, role: 'player' })), [404, MEMBER_GONE]);
  }
  assert.deepEqual(changes(afterCreating), []);
});
await check('updateMemberRole', 'allowed', 'a group always keeps an admin who has an account', async () => {
  // Two admins with accounts: one may demote the other, but then not step down too.
  fresh();
  assert.equal((await call('updateMemberRole', alice, { group_id: 'gA', member_id: 'mHana', role: 'player' })).status, 200);
  assert.deepEqual(outcome(await call('updateMemberRole', alice, { group_id: 'gA', member_id: 'mAlice', role: 'player' })), [400, `Cannot demote the last admin. ${LAST_ADMIN}`]);
  // The only other admin is a player nobody has claimed (old data): that one does not count.
  const snap = fresh(() => { Object.assign(row('GroupMember', 'mHana'), { user_id: null, claimed: false }); });
  assert.deepEqual(outcome(await call('updateMemberRole', alice, { group_id: 'gA', member_id: 'mAlice', role: 'player' })), [400, `Cannot demote the last admin. ${LAST_ADMIN}`]);
  assert.deepEqual(changes(snap), []);
});

// --- deleteRound: a round in play can be undone by any member; a scored one is history --------
{
  const SCORED = 'Only a group admin can delete a scored round';
  const scored = { game_id: 'rA1-1' };
  await check('deleteRound', 'plain member', 'scored round: plain member -> 403, nothing written; group admin and app admin -> 200', async () => {
    const snap = fresh();
    for (const user of [bob, yael]) {
      const res = await call('deleteRound', user, scored);
      assert.deepEqual(outcome(res), [403, SCORED]);
      assert.equal(res.writes, 0, 'a write was attempted');
    }
    assert.deepEqual(changes(snap), []);
    for (const user of [alice, root]) {
      const before = fresh();
      assert.equal((await call('deleteRound', user, scored)).status, 200);
      assert.deepEqual(changes(before), ['Game -1', 'RoundResult -4']);
    }
  });
  await check('deleteRound', 'honest lag', 'scored round: when the membership query lags, the role still comes from the row', async () => {
    const snap = fresh();
    assert.deepEqual(outcome(await call('deleteRound', frank, scored)), [403, SCORED]);
    assert.deepEqual(changes(snap), []);
    assert.equal((await call('deleteRound', hana, scored)).status, 200);
  });
  await check('deleteRound', 'forged admin', 'scored round: a cache forged to say admin -> 403, nothing written', async () => {
    for (const user of [bobForged, frankForged]) {
      const snap = fresh();
      assert.deepEqual(outcome(await call('deleteRound', user, scored)), [403, SCORED]);
      assert.deepEqual(changes(snap), []);
    }
  });
  await check('deleteRound', 'plain member', 'a round being played is not scored yet; an everyone-falls (cancelled) round is', async () => {
    const snap = fresh(() => { lockBids(); row('Game', 'rA1-2').status = 'cancelled'; });
    assert.deepEqual(outcome(await call('deleteRound', bob, { game_id: 'rA1-2' })), [403, SCORED]);
    assert.deepEqual(changes(snap), []);
    assert.equal((await call('deleteRound', bob, { game_id: 'rA2-2' })).status, 200); // status 'playing'
  });
}

// --- a group that is not active is read-only ----------------------------------------------------
for (const [name, c] of Object.entries(GROUP_WRITES)) {
  if (name === 'setGroupStatus') continue; // the way back to active: its own check below
  // Everyone who could otherwise do it: one whose membership query works, one whose query
  // lags, and the app admin where they get through today (except to moderate a note).
  const entitled = c.plain ? [alice, hana] : [bob, frank];
  if (c.appAdmin && name !== 'deleteNote') entitled.push(root);
  for (const [status, kind, refusal] of GROUP_STATES) {
    await check(name, kind, `${status} group -> ${refusal[0]} for everyone who could otherwise do it, nothing written; the rest keep their usual 403`, async () => {
      const snap = fresh(() => { if (c.setup) c.setup(); row('Group', 'gA').status = status; });
      for (const user of entitled) {
        const res = await call(name, user, c.body);
        assert.deepEqual(outcome(res), refusal);
        assert.equal(res.writes, 0, 'a write was attempted');
      }
      assert.deepEqual(outcome(await call(name, dave, c.body)), [403, c.outsider]);
      if (c.plain) assert.deepEqual(outcome(await call(name, bob, c.body)), [403, c.plain]);
      assert.deepEqual(changes(snap), []);

      if (name === 'removeMember') {
        // The one thing a member can still do in an archived group is leave it.
        const leaving = await call('removeMember', yael, { group_id: 'gA', member_id: 'mYael' });
        if (status === 'archived') assert.equal(leaving.status, 200);
        else assert.deepEqual(outcome(leaving), refusal);
        assert.deepEqual(changes(snap), status === 'archived' ? ['GroupMember -1'] : []);
      }
      if (name === 'deleteNote') {
        // The author is refused like anyone else; an app admin can still moderate.
        assert.deepEqual(outcome(await call('deleteNote', yael, c.body)), refusal);
        assert.deepEqual(changes(snap), []);
        assert.equal((await call('deleteNote', root, c.body)).status, 200);
        assert.deepEqual(changes(snap), ['TableTalkNote -1']);
      }
    });
  }
}
for (const [status, kind, refusal] of GROUP_STATES) {
  await check('joinGroupByCode', kind, `${status} group -> ${refusal[0]}: nobody joins it or claims a player in it`, async () => {
    for (const body of [{ invite_code: 'AAAAAA', player_name: 'Newcomer' }, { invite_code: 'AAAAAA', claim_member_id: 'mDan' }]) {
      const snap = fresh(groupStatus(status));
      assert.deepEqual(outcome(await call('joinGroupByCode', dave, body)), refusal);
      assert.deepEqual(changes(snap), ['JoinAttempt +1']);
    }
  });
  await check('previewGroupByCode', kind, `${status} group -> ${refusal[0]}: nothing about it is shown`, async () => {
    fresh(groupStatus(status));
    const res = await call('previewGroupByCode', dave, { invite_code: 'AAAAAA' });
    assert.deepEqual(outcome(res), refusal);
    assert.ok(!carriesGroupAData(res.data));
  });
  // The exceptions. Each is shown next to a write that IS refused, by the same caller.
  await check('setGroupStatus', kind, `${status} group: read-only until a group admin sets it active again, here`, async () => {
    fresh(groupStatus(status));
    const settings = GROUP_WRITES.updateGroupSettings.body;
    assert.deepEqual(outcome(await call('updateGroupSettings', alice, settings)), refusal);
    assert.deepEqual(outcome(await call('setGroupStatus', bob, { group_id: 'gA', status: 'active' })), [403, GROUP_WRITES.setGroupStatus.plain]);
    assert.equal((await call('setGroupStatus', alice, { group_id: 'gA', status: 'active' })).status, 200);
    assert.equal(row('Group', 'gA').status, 'active');
    assert.equal((await call('updateGroupSettings', alice, settings)).status, 200);
  });
  await check('purgeGroup', kind, `${status} group: read-only for the app admin too, who can still purge it`, async () => {
    fresh(groupStatus(status));
    assert.deepEqual(outcome(await call('renameMember', root, GROUP_WRITES.renameMember.body)), refusal);
    assert.equal((await call('purgeGroup', root, { group_id: 'gA' })).status, 200);
    assert.equal(row('Group', 'gA'), undefined);
    assert.ok(!db.GroupMember.some((m) => m.group_id === 'gA'));
  });
  await check('cleanupOrphans', kind, `${status} group: read-only for the app admin too, who can still clean up orphans`, async () => {
    const snap = fresh(() => { orphans(); row('Group', 'gA').status = status; });
    assert.deepEqual(outcome(await call('renameMember', root, GROUP_WRITES.renameMember.body)), refusal);
    assert.equal((await call('cleanupOrphans', root, {})).status, 200);
    assert.deepEqual(changes(snap), ['Session -1', 'Game -1', 'RoundResult -1', 'TableTalkNote -1']);
  });
}

// --- more rows than one page: nothing is decided, counted or swept from the first page alone ---
await check('cleanupOrphans', 'allowed', 'past one page of rows, every orphan is found and no valid note is deleted', async () => {
  const snap = fresh(() => { orphans(); bigGroupB(); });
  const res = await call('cleanupOrphans', root, {});
  assert.equal(res.status, 200, `got ${res.status}: ${res.data.error}`);
  assert.deepEqual(res.data, { sessions_deleted: 1, rounds_deleted: 1, results_deleted: 1, notes_deleted: 1 });
  assert.deepEqual(changes(snap), ['Session -1', 'Game -1', 'RoundResult -1', 'TableTalkNote -1']);
  assert.equal(row('TableTalkNote', 'nLost'), undefined);
});
await t('listAllGroupsWithStats: app admin only, and every member, session and round is counted, past one page', async () => {
  fresh(bigGroupB);
  assert.equal((await call('listAllGroupsWithStats', null, {})).status, 401);
  assert.deepEqual(outcome(await call('listAllGroupsWithStats', alice, {})), [403, APP_ADMIN_ONLY]);
  const res = await call('listAllGroupsWithStats', root, {});
  assert.equal(res.status, 200, `got ${res.status}: ${res.data.error}`);
  assert.equal(res.writes, 0);
  const stats = Object.fromEntries(res.data.groups.map((g) => [g.id, g]));
  const count = (name, group) => db[name].filter((r) => r.group_id === group).length;
  for (const group of ['gA', 'gB', 'gD']) {
    assert.deepEqual(
      [stats[group].player_count, stats[group].total_sessions, stats[group].total_rounds],
      [count('GroupMember', group), count('Session', group), count('Game', group)],
      `counts for ${group}`,
    );
  }
  assert.equal(stats.gA.scored_rounds, db.Game.filter((g) => g.group_id === 'gA' && g.status === 'complete').length);
});
await check('renameMember', 'allowed', 'the new name reaches every round result of the player, past one page', async () => {
  fresh(() => { for (let n = 131; n <= 530; n++) addRound({ id: `rA1-${n}`, group: 'gA', session: 'sA1', number: n, seats: SEATS }); });
  const results = () => db.RoundResult.filter((r) => r.player_id === 'mDan');
  assert.ok(results().length > 500);
  assert.equal((await call('renameMember', alice, { group_id: 'gA', member_id: 'mDan', player_name: 'Danny' })).status, 200);
  assert.equal(results().filter((r) => r.player_name !== 'Danny').length, 0, 'results left with the old name');
});
await check('renameMember', 'allowed', 'a new name is checked against the whole roster, past one page', async () => {
  const snap = fresh(bigGroupA);
  assert.deepEqual(outcome(await call('renameMember', alice, { group_id: 'gA', member_id: 'mZed', player_name: 'bob' })),
    [409, 'A member named "bob" already exists in this group']);
  assert.deepEqual(changes(snap), []);
});
await check('updateMemberRole', 'allowed', 'the last-admin guard counts every admin, past one page of the roster', async () => {
  fresh(bigGroupA);
  assert.equal((await call('updateMemberRole', alice, { group_id: 'gA', member_id: 'mAlice', role: 'player' })).status, 200); // Hana is still an admin
  fresh(() => { bigGroupA(); row('GroupMember', 'mHana').role = 'player'; });
  assert.deepEqual(outcome(await call('updateMemberRole', alice, { group_id: 'gA', member_id: 'mAlice', role: 'player' })), [400, `Cannot demote the last admin. ${LAST_ADMIN}`]);
});
await check('unclaimMember', 'allowed', 'the last-admin guard counts every admin with an account, past one page of the roster', async () => {
  fresh(bigGroupA);
  assert.equal((await call('unclaimMember', alice, { group_id: 'gA', member_id: 'mHana' })).status, 200); // Alice is still an admin
  // An admin nobody has claimed does not count: the app admin cannot unclaim the last real one.
  const snap = fresh(() => { bigGroupA(); Object.assign(row('GroupMember', 'mHana'), { user_id: null, claimed: false }); });
  assert.deepEqual(outcome(await call('unclaimMember', root, { group_id: 'gA', member_id: 'mAlice' })), [400, `Cannot unclaim the last admin. ${LAST_ADMIN}`]);
  assert.deepEqual(changes(snap), []);
});
await check('removeMember', 'allowed', 'the last-admin guard counts every admin with an account, past one page of the roster', async () => {
  fresh(bigGroupA);
  assert.equal((await call('removeMember', alice, { group_id: 'gA', member_id: 'mHana' })).status, 200); // Alice is still an admin
  const snap = fresh(() => { bigGroupA(); Object.assign(row('GroupMember', 'mHana'), { user_id: null, claimed: false }); });
  assert.deepEqual(outcome(await call('removeMember', alice, { group_id: 'gA', member_id: 'mAlice' })), [400, `Cannot remove the last admin. ${LAST_ADMIN}`]);
  assert.deepEqual(changes(snap), []);
});
await check('startRound', 'allowed', 'each seat is read by id, so a roster past one page still seats its older members', async () => {
  const snap = fresh(() => { finishOpenRound(); bigGroupA(); });
  const res = await call('startRound', bob, GROUP_WRITES.startRound.body);
  assert.equal(res.status, 200, `got ${res.status}: ${res.data.error}`);
  assert.deepEqual(changes(snap), ['Game +1', 'RoundResult +4']);
  assert.deepEqual(res.data.results.map((r) => r.player_name), ['Alice', 'Bob', 'Ghost', 'Dan']);
  const foreign = await call('startRound', bob, { session_id: 'sA2', player_ids: ['mAlice', 'mBob', 'mGhost', 'mCarol'] });
  assert.deepEqual(outcome(foreign), [400, 'Some players are not members of this group']);
});
await check('previewGroupByCode', 'allowed', 'the whole roster is read, past one page', async () => {
  fresh(bigGroupA);
  const res = await call('previewGroupByCode', dave, { invite_code: 'AAAAAA' });
  assert.equal(res.data.unclaimed_players.length, 3 + 520);
  assert.equal(res.data.existing_names.length, db.GroupMember.filter((m) => m.group_id === 'gA').length);
  assert.equal((await call('previewGroupByCode', bob, { invite_code: 'AAAAAA' })).data.already_member, true);
});
await t('getGroupMembers: the whole roster comes back, past one page', async () => {
  fresh(bigGroupA);
  const res = await call('getGroupMembers', bob, { group_id: 'gA' });
  assert.equal(res.data.members.length, db.GroupMember.filter((m) => m.group_id === 'gA').length);
});
await t('getGroupMembers: a group admin gets every claimed member’s email, past one page of users', async () => {
  fresh(() => {
    ['Alice', 'Bob', 'Frank', 'Hana', 'Yael'].forEach((name, i) => db.User.push({ id: `u${name}`, email: `${name.toLowerCase()}@example.com`, role: 'user', created_date: at(i) }));
    for (let i = 0; i < 520; i++) db.User.push({ id: `uCrowd${i}`, email: `crowd${i}@example.com`, role: 'user', created_date: at(4000 + i) });
  });
  const res = await call('getGroupMembers', alice, { group_id: 'gA' });
  assert.deepEqual(
    res.data.members.filter((m) => m.user_id).map((m) => m.email).sort(),
    ['alice@example.com', 'bob@example.com', 'frank@example.com', 'hana@example.com', 'yael@example.com'],
  );
  assert.ok((await call('getGroupMembers', bob, { group_id: 'gA' })).data.members.every((m) => !('email' in m)));
});
await check('getActivityFeed', 'allowed', 'the players written about are named, past one page of members', async () => {
  fresh(bigGroupA);
  const res = await call('getActivityFeed', alice, {});
  assert.ok(res.data.notes.length > 0);
  assert.deepEqual([...new Set(res.data.notes.map((n) => n.target_player_name))], ['Bob']);
});
{
  // A long night in Group A that Bob won in its first five rounds — rounds that fall off the
  // newest page of results (500 rows = 125 rounds).
  const longNight = () => {
    db.Session.push({ id: 'sLong', group_id: 'gA', name: 'Long Night', status: 'closed', session_date: '2026-07-20', created_date: at(5000) });
    for (let n = 1; n <= 140; n++) {
      const created = at(5000 + n);
      db.Game.push({ id: `rLong-${n}`, group_id: 'gA', session_id: 'sLong', round_number: n, status: 'complete', everyone_falls: false, created_date: created });
      SEATS.forEach(([playerId, playerName], i) => db.RoundResult.push({
        id: `rLong-${n}-r${i}`, game_id: `rLong-${n}`, session_id: 'sLong', group_id: 'gA', player_id: playerId, player_name: playerName,
        bid_order: i, bid: 3, tricks_won: 3, reneged: false, created_date: created,
        points: n <= 5 ? (playerId === 'mBob' ? 200 : 0) : (playerId === 'mAlice' ? 1 : 0),
      }));
    }
  };
  // Bob played two nights: Big Night (everyone level, so everyone is first) and the long one.
  const bobsRecord = (res) => [res.data.performance.sessions_played, res.data.performance.wins, res.data.performance.podiums];
  await t('computePlayerStats: nights, wins and podiums are counted over every result, past one page', async () => {
    fresh(longNight);
    const res = await call('computePlayerStats', alice, { player_id: 'mBob', group_id: 'gA' });
    assert.equal(res.status, 200);
    assert.deepEqual(bobsRecord(res), [2, 2, 2]);
  });
  await t('computeGlobalStats: nights, wins and podiums are counted over every result, past one page', async () => {
    fresh(longNight);
    const res = await call('computeGlobalStats', bob, {});
    assert.equal(res.status, 200);
    assert.deepEqual(bobsRecord(res), [2, 2, 2]);
  });
}

// --- an id that does not exist is a 404 with a name, never a 500 ---------------------------------
{
  const seats = GROUP_WRITES.startRound.body.player_ids;
  const UNKNOWN = [
    ['startRound', 'session', alice, { session_id: 'nope', player_ids: seats }, 'Session not found'],
    ['closeSession', 'session', alice, { session_id: 'nope' }, 'Session not found'],
    ['submitBids', 'round', alice, { game_id: 'nope', bids: {} }, 'Round not found'],
    ['saveRoundResults', 'round', alice, { game_id: 'nope', tricks: {} }, 'Round not found'],
    ['updateRound', 'round', alice, { game_id: 'nope', bids: {}, tricks: {} }, 'Round not found'],
    ['deleteRound', 'round', alice, { game_id: 'nope' }, 'Round not found'],
    ['startSession', 'group (app admin)', root, { group_id: 'nope' }, GROUP_GONE],
    ['updateGroupSettings', 'group (app admin)', root, { group_id: 'nope', updates: { name: 'x' } }, GROUP_GONE],
    ['setGroupStatus', 'group (app admin)', root, { group_id: 'nope', status: 'archived' }, GROUP_GONE],
    ['purgeGroup', 'group (app admin)', root, { group_id: 'nope' }, GROUP_GONE],
    ['removeMember', 'member', alice, { group_id: 'gA', member_id: 'nope' }, MEMBER_GONE],
    ['unclaimMember', 'member', alice, { group_id: 'gA', member_id: 'nope' }, MEMBER_GONE],
    ['updateMemberRole', 'member to promote', alice, { group_id: 'gA', member_id: 'nope', role: 'admin' }, MEMBER_GONE],
    ['updateMemberRole', 'member to demote', alice, { group_id: 'gA', member_id: 'nope', role: 'player' }, MEMBER_GONE],
    ['joinGroupByCode', 'player to claim', dave, { invite_code: 'AAAAAA', claim_member_id: 'nope' }, 'Player not found in this group'],
  ];
  for (const [name, what, user, body, message] of UNKNOWN) {
    await t(`${name}: unknown ${what} -> 404 "${message}", not a 500`, async () => {
      const snap = fresh();
      assert.deepEqual(outcome(await call(name, user, body)), [404, message]);
      assert.deepEqual(changes(snap).filter((change) => !change.startsWith('JoinAttempt')), []);
    });
  }
  await t('startSession, createNote: a non-member gets the same 403 whether the group exists or not', async () => {
    fresh();
    for (const group of ['gA', 'nope']) {
      assert.deepEqual(outcome(await call('startSession', dave, { group_id: group })), [403, NOT_A_MEMBER]);
      assert.deepEqual(outcome(await call('createNote', dave, { group_id: group, target_player_id: 'mBob', note: 'Hello' })), [403, NOT_A_MEMBER]);
    }
  });
}

// --- startRound: round numbers never repeat -------------------------------------------------------
await check('startRound', 'allowed', 'a new round is numbered after the highest one, even when a middle round was deleted', async () => {
  fresh(() => { finishOpenRound(); addRound({ id: 'rA2-3', group: 'gA', session: 'sA2', number: 3, seats: SEATS }); });
  assert.equal((await call('deleteRound', alice, { game_id: 'rA2-2' })).status, 200);
  const res = await call('startRound', bob, GROUP_WRITES.startRound.body);
  assert.equal(res.status, 200);
  assert.equal(res.data.round.round_number, 4);
  assert.deepEqual(db.Game.filter((g) => g.session_id === 'sA2').map((g) => g.round_number).sort(), [1, 3, 4]);
});

// --- startSession: a night can be given a game limit ----------------------------------------------
{
  const GAME_LIMIT = 'game_limit must be a whole number between 1 and 99';
  const closeOpenNight = () => { row('Session', 'sA2').status = 'closed'; };
  const start = (limit) => call('startSession', alice, limit === undefined ? { group_id: 'gA' } : { group_id: 'gA', game_limit: limit });
  await check('startSession', 'allowed', 'game_limit: a whole number from 1 to 99 is stored as a number; absent, null or empty means no limit', async () => {
    for (const [given, stored] of [[5, 5], ['7', 7], [1, 1], [99, 99], [undefined, null], [null, null], ['', null]]) {
      fresh(closeOpenNight);
      const res = await start(given);
      assert.equal(res.status, 200, `game_limit ${JSON.stringify(given)} got ${res.status}: ${res.data.error}`);
      assert.strictEqual(res.data.session.game_limit, stored, `game_limit ${JSON.stringify(given)}`);
      assert.strictEqual(row('Session', res.data.session.id).game_limit, stored);
    }
  });
  for (const bad of [0, 100, 2.5, 'abc', -3, '2.5', true, [3]]) {
    await t(`startSession: game_limit ${JSON.stringify(bad)} -> 400, no session is started`, async () => {
      const snap = fresh(closeOpenNight);
      assert.deepEqual(outcome(await start(bad)), [400, GAME_LIMIT]);
      assert.deepEqual(changes(snap), []);
    });
  }
  await t('startSession + startRound: with game_limit 2 a third scored round is refused; an everyone-falls round does not count', async () => {
    fresh(closeOpenNight);
    const session = (await start(2)).data.session;
    const seats = GROUP_WRITES.startRound.body.player_ids; // Alice, Bob, Ghost, Dan — bidding 4, 4, 3, 3
    const play = async (tricks) => {
      const started = await call('startRound', bob, { session_id: session.id, player_ids: seats });
      if (started.status !== 200) return started;
      const game_id = started.data.round.id;
      await call('submitBids', bob, { game_id, bids: { mAlice: 4, mBob: 4, mGhost: 3, mDan: 3 } });
      return call('saveRoundResults', bob, { game_id, tricks: Object.fromEntries(seats.map((id, i) => [id, tricks[i]])) });
    };
    const scored = [4, 4, 3, 2];        // three of the four make their bid
    const everyoneFalls = [5, 5, 2, 1]; // nobody does: the round is cancelled
    assert.equal((await play(scored)).data.round.status, 'complete');
    assert.equal((await play(everyoneFalls)).data.round.status, 'cancelled');
    assert.equal((await play(scored)).data.round.status, 'complete'); // the second scored round
    assert.deepEqual(outcome(await play(scored)), [409, 'This session has reached its round limit (2)']);
    assert.equal(db.Game.filter((g) => g.session_id === session.id).length, 3);
  });
}

// --- a stuffed cache buys no extra reads ------------------------------------------------------------
await t('a cache stuffed with 500 entries causes at most 5 hinted re-reads, in every function that reads the cache', async () => {
  const stuffed = {
    id: 'uEve', role: 'user',
    groups: Array.from({ length: 500 }, (_, i) => ({ group_id: 'gA', member_id: `mStuffed${i}`, role: 'admin', player_name: 'Eve' })),
  };
  // A request per function that gets as far as looking at the cache.
  const cases = {
    ...GROUP_WRITES,
    joinGroupByCode: { body: { invite_code: 'AAAAAA', player_name: 'Newcomer' } },
    getGroupData: { body: { scope: 'group', group_id: 'gA' } },
    getPlayerNotes: { body: { player_id: 'mBob' } },
    getGroupMembers: { body: { group_id: 'gA' } },
    computePlayerStats: { body: { player_id: 'mBob' } },
    getActivityFeed: { body: {} },
    getMyGroups: { body: {} },
  };
  const readsTheCache = FUNCTION_FOLDERS.filter((name) => source(name).split('\n').some((line) => /user\??\.groups/.test(line) && !/^\s*\/\//.test(line)));
  const offenders = [];
  for (const name of readsTheCache) {
    if (!cases[name]) { offenders.push(`${name}: reads the cache but has no case here`); continue; }
    fresh(cases[name].setup);
    const res = await call(name, stuffed, cases[name].body);
    const rereads = res.gets.filter((get) => get.startsWith('GroupMember:mStuffed')).length;
    if (rereads < 1 || rereads > 5) offenders.push(`${name}: ${rereads} hinted re-reads`);
  }
  assert.deepEqual(offenders, []);
});

// =========================================================================================
// Review round 1 (rulings 9-13, 50, 53, 54, 58). Every check from here to the static guards
// fails against the functions as they were at commit 5a660c7 — what each one pins is new.
// =========================================================================================
section = 'R1 stats';

// A small group whose numbers can be counted by hand: "Stats Table" (gS), two closed nights
// and one still open. Each line is one round: [member, bid, tricks, points], classic scoring.
//
//   First Friday (closed)      Sam   Tal   Uri   Vered
//     1                        +26   +19   -10   +35     Uri bid 2, took 1 (too few)
//     2  everyone fell           0     0     0     0     Sam and Tal both bid 5; spades, trump winner TAL
//     3                        +50   +26   -10   +35     Sam's zero bid made on a DOWN table; Uri bid 3, took 4
//     night                    +76   +45   -20   +70     1st Sam, 2nd Vered, 3rd Tal, 4th Uri
//   Second Friday (closed)
//     1  everyone fell           0     0     0     0     no trump recorded; Sam and Tal both bid 4 (the highest)
//     2                        +19   -10   -40   +26     Tal bid 5, took 4; Uri's zero bid took 2
//     3                        +14   +46  -110   +19     Uri bid 3, took 2 and reneged
//     night                    +33   +36  -150   +45     1st Vered, 2nd Tal, 3rd Sam, 4th Uri
//   Tonight (OPEN)             Sam   Tal   Uri   Wolf
//     1                        +46   -10   +14   +26     Tal bid 2, took 1
//     2  everyone fell           0     0     0     0     no trump recorded; Sam bid 6 (the highest)
//     3  bids locked, hand in play — not scored
//     so far                   +46   -10   +14   +26     Sam leads, then Wolf, Uri, Tal
//
// Sam is also a player of Group B (as "Sammy"), where he lost a zero bid on a closed night.
const STATS_ROUNDS = [
  { id: 'rS1-1', session: 'sS1', number: 1, seats: [['mSam', 4, 4, 26], ['mTal', 3, 3, 19], ['mUri', 2, 1, -10], ['mVered', 5, 5, 35]] },
  { id: 'rS1-2', session: 'sS1', number: 2, fell: true, trump: 'spades', winner: 'mTal', seats: [['mSam', 5, 4, 0], ['mTal', 5, 6, 0], ['mUri', 2, 1, 0], ['mVered', 3, 2, 0]] },
  { id: 'rS1-3', session: 'sS1', number: 3, seats: [['mSam', 0, 0, 50], ['mTal', 4, 4, 26], ['mUri', 3, 4, -10], ['mVered', 5, 5, 35]] },
  { id: 'rS2-1', session: 'sS2', number: 1, fell: true, winner: 'mSam', seats: [['mSam', 4, 5, 0], ['mTal', 4, 3, 0], ['mUri', 3, 2, 0], ['mVered', 1, 3, 0]] },
  { id: 'rS2-2', session: 'sS2', number: 2, seats: [['mSam', 3, 3, 19], ['mTal', 5, 4, -10], ['mUri', 0, 2, -40], ['mVered', 4, 4, 26]] },
  { id: 'rS2-3', session: 'sS2', number: 3, seats: [['mSam', 2, 2, 14], ['mTal', 6, 6, 46], ['mUri', 3, 2, -110, true], ['mVered', 3, 3, 19]] },
  { id: 'rS3-1', session: 'sS3', number: 1, seats: [['mSam', 6, 6, 46], ['mTal', 2, 1, -10], ['mUri', 2, 2, 14], ['mWolf', 4, 4, 26]] },
  { id: 'rS3-2', session: 'sS3', number: 2, fell: true, winner: 'mSam', seats: [['mSam', 6, 5, 0], ['mTal', 3, 4, 0], ['mUri', 2, 3, 0], ['mWolf', 3, 1, 0]] },
  { id: 'rS3-3', session: 'sS3', number: 3, playing: true, winner: 'mUri', seats: [['mSam', 3, null, null], ['mTal', 3, null, null], ['mUri', 4, null, null], ['mWolf', 4, null, null]] },
  { id: 'rBs-1', session: 'sBs', group: 'gB', number: 1, seats: [['mSamB', 0, 1, -50], ['mCarol', 5, 5, 35], ['mBea', 4, 4, 26], ['mBen', 3, 3, 19]] },
];
const { scoreRound } = await import(path.join(ROOT, 'src/lib/scoring.js'));
const statsTable = () => {
  const NAMES = { mSam: 'Sam', mTal: 'Tal', mUri: 'Uri', mVered: 'Vered', mWolf: 'Wolf', mXen: 'Xen', mSamB: 'Sammy', mCarol: 'Carol', mBea: 'Bea', mBen: 'Ben' };
  db.Group.push({ id: 'gS', name: 'Stats Table', invite_code: 'SSSSSS', status: 'active' });
  db.GroupMember.push(
    { id: 'mSam', group_id: 'gS', user_id: 'uSam', role: 'admin', player_name: 'Sam', claimed: true, claim_token: null, created_date: at(6000) },
    { id: 'mTal', group_id: 'gS', user_id: 'uTal', role: 'player', player_name: 'Tal', claimed: true, claim_token: null, created_date: at(6001) },
    { id: 'mWolf', group_id: 'gS', user_id: 'uWolf', role: 'player', player_name: 'Wolf', claimed: true, claim_token: null, created_date: at(6002) },
    ...['mUri', 'mVered', 'mXen'].map((id, i) => ({ id, group_id: 'gS', user_id: null, role: 'player', player_name: NAMES[id], claimed: false, claim_token: null, created_date: at(6003 + i) })),
    { id: 'mSamB', group_id: 'gB', user_id: 'uSam', role: 'player', player_name: 'Sammy', claimed: true, claim_token: null, created_date: at(6010) },
    ...['mBea', 'mBen'].map((id, i) => ({ id, group_id: 'gB', user_id: null, role: 'player', player_name: NAMES[id], claimed: false, claim_token: null, created_date: at(6011 + i) })),
  );
  db.Session.push(
    { id: 'sS1', group_id: 'gS', name: 'First Friday', status: 'closed', session_date: '2026-08-07', created_date: at(6100) },
    { id: 'sS2', group_id: 'gS', name: 'Second Friday', status: 'closed', session_date: '2026-08-14', created_date: at(6200) },
    { id: 'sS3', group_id: 'gS', name: 'Tonight', status: 'open', session_date: '2026-08-21', created_date: at(6300) },
    { id: 'sBs', group_id: 'gB', name: 'B Stats Night', status: 'closed', session_date: '2026-08-10', created_date: at(6150) },
  );
  STATS_ROUNDS.forEach((round, n) => {
    const group = round.group || 'gS';
    const created = at(6400 + n);
    db.Game.push({
      id: round.id, group_id: group, session_id: round.session, round_number: round.number,
      status: round.playing ? 'playing' : round.fell ? 'cancelled' : 'complete', everyone_falls: !!round.fell,
      // Like submitBids: always a "highest bidder" — the trump winner the table marked, or
      // else just the first of the highest bids. Only a trump suit says it was marked.
      trump_suit: round.trump || null, highest_bidder_player_id: round.winner || null, created_date: created,
    });
    round.seats.forEach(([playerId, bid, tricks, points, reneged], i) => db.RoundResult.push({
      id: `${round.id}-r${i}`, game_id: round.id, session_id: round.session, group_id: group, player_id: playerId, player_name: NAMES[playerId],
      bid_order: i, bid, tricks_won: tricks, reneged: !!reneged, points, created_date: created,
    }));
    if (round.playing) return;
    // The table above is hand-written; it has to be what the scoring engine gives.
    const scoredByEngine = scoreRound({ players: round.seats.map(([player_id, bid, tricks_won, , reneged]) => ({ player_id, bid, tricks_won, reneged: !!reneged })), scoringMethod: 'classic' });
    assert.deepEqual(scoredByEngine.results.map((r) => r.points), round.seats.map((seat) => seat[3]), `fixture round ${round.id} is not scored like src/lib/scoring.js`);
    assert.equal(scoredByEngine.everyoneFalls, !!round.fell, `fixture round ${round.id}: everyone-falls flag`);
  });
};
const sam = { id: 'uSam', email: 'sam@example.com', role: 'user', groups: [] };
const tal = { id: 'uTal', email: 'tal@example.com', role: 'user', groups: [] };
const wolf = { id: 'uWolf', email: 'wolf@example.com', role: 'user', groups: [] };
const playerStats = async (playerId, as = sam) => {
  const res = await call('computePlayerStats', as, { player_id: playerId });
  assert.equal(res.status, 200, `got ${res.status}: ${res.data.error}`);
  return res.data;
};
const NEW_STATS_FIELDS = ['sessions', 'best_session', 'worst_session', 'group_awards', 'performance', 'awards', 'results', 'total_rows'];
const refusedWithNothing = (res, status) => {
  assert.equal(res.status, status);
  assert.deepEqual(Object.keys(res.data), ['error']);
  for (const field of NEW_STATS_FIELDS) assert.ok(!(field in res.data));
  assert.ok(!/Stats Table|First Friday|Sam|Tal/.test(JSON.stringify(res.data)));
};

// --- ruling 9: a win is a closed session finished in first place -------------------------------
await t('computePlayerStats: wins, podiums, win rate and sessions count closed sessions only; totals still include the open one', async () => {
  fresh(statsTable);
  // Sam: won First Friday, 3rd on Second Friday, and is in front tonight — which is not a win.
  const samStats = (await playerStats('mSam')).performance;
  assert.deepEqual(samStats, { total_score: 155, avg_score: 19.38, rounds_played: 8, sessions_played: 2, sessions_open: 1, wins: 1, podiums: 2, win_ratio: 0.5 });
  // Vered won Second Friday and was 2nd on First Friday; she is not playing tonight.
  assert.deepEqual((await playerStats('mVered')).performance, { total_score: 115, avg_score: 19.17, rounds_played: 6, sessions_played: 2, sessions_open: 0, wins: 1, podiums: 2, win_ratio: 0.5 });
  // Tal: 3rd and 2nd on the closed nights; last tonight. Uri: last twice.
  assert.deepEqual((await playerStats('mTal')).performance, { total_score: 71, avg_score: 8.88, rounds_played: 8, sessions_played: 2, sessions_open: 1, wins: 0, podiums: 2, win_ratio: 0 });
  assert.deepEqual((await playerStats('mUri')).performance, { total_score: -156, avg_score: -19.5, rounds_played: 8, sessions_played: 2, sessions_open: 1, wins: 0, podiums: 0, win_ratio: 0 });
});
await t('computePlayerStats: a player who has only played in the open session has no win, no podium and no win rate', async () => {
  fresh(statsTable);
  // Wolf is 2nd tonight, with the night still open: two rounds on the books and nothing else.
  const wolf = await playerStats('mWolf');
  assert.deepEqual(wolf.performance, { total_score: 26, avg_score: 13, rounds_played: 2, sessions_played: 0, sessions_open: 1, wins: 0, podiums: 0, win_ratio: null });
  assert.deepEqual([wolf.best_session, wolf.worst_session], [null, null]);
  // Group A: Frank has only played Short Night, which is open and where all four are level.
  const frankStats = (await call('computePlayerStats', alice, { player_id: 'mFrank' })).data.performance;
  assert.deepEqual([frankStats.rounds_played, frankStats.sessions_played, frankStats.wins, frankStats.podiums, frankStats.win_ratio], [1, 0, 0, 0, null]);
  // Alice played both nights of Group A; only Big Night is closed (everyone level, so all first).
  const aliceStats = (await call('computePlayerStats', bob, { player_id: 'mAlice' })).data.performance;
  assert.deepEqual([aliceStats.rounds_played, aliceStats.sessions_played, aliceStats.sessions_open, aliceStats.wins, aliceStats.podiums, aliceStats.win_ratio], [131, 1, 1, 1, 1, 1]);
});
await t('computePlayerStats: closing the open session turns the lead into a win', async () => {
  fresh(() => { statsTable(); row('Session', 'sS3').status = 'closed'; });
  assert.deepEqual((await playerStats('mSam')).performance, { total_score: 155, avg_score: 19.38, rounds_played: 8, sessions_played: 3, sessions_open: 0, wins: 2, podiums: 3, win_ratio: 0.67 });
  assert.deepEqual((await playerStats('mWolf')).performance, { total_score: 26, avg_score: 13, rounds_played: 2, sessions_played: 1, sessions_open: 0, wins: 0, podiums: 1, win_ratio: 0 });
});
await t('computeGlobalStats: across groups, closed sessions only — and signed out it answers 401 with nothing', async () => {
  fresh(statsTable);
  refusedWithNothing(await call('computeGlobalStats', null, {}), 401);
  const res = await call('computeGlobalStats', sam, {});
  assert.equal(res.status, 200, `got ${res.status}: ${res.data.error}`);
  // Stats Table: 8 rounds, +155, one win in two closed nights. Group B: one round, -50, last of four.
  assert.deepEqual(res.data.performance, { total_score: 105, avg_score: 11.67, rounds_played: 9, sessions_played: 3, sessions_open: 1, wins: 1, podiums: 2, win_ratio: 0.33 });
  assert.equal(res.data.total_groups, 2);
  assert.deepEqual(res.data.groups_breakdown, [
    { group_id: 'gS', group_name: 'Stats Table', total_score: 155, rounds_played: 8, avg_score: 19.38 },
    { group_id: 'gB', group_name: 'Group B', total_score: -50, rounds_played: 1, avg_score: -50 },
  ]);
  // Someone with no group gets zeros and "nothing to count", not 0%.
  const nobody = (await call('computeGlobalStats', dave, {})).data;
  assert.deepEqual(nobody.performance, { total_score: 0, avg_score: 0, rounds_played: 0, sessions_played: 0, sessions_open: 0, wins: 0, podiums: 0, win_ratio: null });
  assert.deepEqual([nobody.strategy.contract_accuracy, nobody.strategy.zero_bid_success_rate, nobody.best_session, nobody.sessions], [null, null, null, []]);
});
await t('computeGlobalStats: the nights across groups, with the best and the worst closed one', async () => {
  fresh(statsTable);
  const { data } = await call('computeGlobalStats', sam, {});
  assert.deepEqual(data.sessions, [
    { session_id: 'sS3', name: 'Tonight', session_date: '2026-08-21', status: 'open', total: 46, rank: 1, players: 4, no_winner: false, group_id: 'gS', group_name: 'Stats Table' },
    { session_id: 'sS2', name: 'Second Friday', session_date: '2026-08-14', status: 'closed', total: 33, rank: 3, players: 4, no_winner: false, group_id: 'gS', group_name: 'Stats Table' },
    { session_id: 'sBs', name: 'B Stats Night', session_date: '2026-08-10', status: 'closed', total: -50, rank: 4, players: 4, no_winner: false, group_id: 'gB', group_name: 'Group B' },
    { session_id: 'sS1', name: 'First Friday', session_date: '2026-08-07', status: 'closed', total: 76, rank: 1, players: 4, no_winner: false, group_id: 'gS', group_name: 'Stats Table' },
  ]);
  assert.equal(data.best_session.session_id, 'sS1');   // +76 on First Friday
  assert.equal(data.worst_session.session_id, 'sBs');  // -50 in Group B
  // Carol shares Group B with Sam; nothing of his other group reaches her.
  assert.ok(!JSON.stringify((await call('computeGlobalStats', carol, {})).data).includes('Stats Table'));
});

// --- ruling 13: a player's nights, best and worst --------------------------------------------
await t('computePlayerStats: one entry per session the player scored in, newest first, with their total and place', async () => {
  fresh(statsTable);
  const stats = await playerStats('mSam', tal); // any member of the group may look
  assert.deepEqual(stats.sessions, [
    { session_id: 'sS3', name: 'Tonight', session_date: '2026-08-21', status: 'open', total: 46, rank: 1, players: 4, no_winner: false },
    { session_id: 'sS2', name: 'Second Friday', session_date: '2026-08-14', status: 'closed', total: 33, rank: 3, players: 4, no_winner: false },
    { session_id: 'sS1', name: 'First Friday', session_date: '2026-08-07', status: 'closed', total: 76, rank: 1, players: 4, no_winner: false },
  ]);
  // Wolf never sat at the closed nights; Xen never played at all.
  assert.deepEqual((await playerStats('mWolf')).sessions, [{ session_id: 'sS3', name: 'Tonight', session_date: '2026-08-21', status: 'open', total: 26, rank: 2, players: 4, no_winner: false }]);
  assert.deepEqual((await playerStats('mXen')).sessions, []);
  // The chart's points can name their night too.
  assert.deepEqual(stats.timeline.map((p) => p.session_name), ['First Friday', 'First Friday', 'First Friday', 'Second Friday', 'Second Friday', 'Second Friday', 'Tonight', 'Tonight']);
  assert.equal(stats.timeline.at(-1).cumulative, 155);
});
await t('computePlayerStats: best and worst night are closed sessions; outsiders and the signed-out still get nothing', async () => {
  fresh(statsTable);
  const samStats = await playerStats('mSam');
  // Tonight's +46 would be Sam's second best night — it does not count while it is open.
  assert.deepEqual(samStats.best_session, { session_id: 'sS1', name: 'First Friday', session_date: '2026-08-07', status: 'closed', total: 76, rank: 1, players: 4, no_winner: false });
  assert.deepEqual(samStats.worst_session, { session_id: 'sS2', name: 'Second Friday', session_date: '2026-08-14', status: 'closed', total: 33, rank: 3, players: 4, no_winner: false });
  const uri = await playerStats('mUri');
  assert.deepEqual([uri.best_session.name, uri.best_session.total, uri.worst_session.name, uri.worst_session.total], ['First Friday', -20, 'Second Friday', -150]);
  assert.deepEqual([(await playerStats('mXen')).best_session, (await playerStats('mXen')).worst_session], [null, null]);

  refusedWithNothing(await call('computePlayerStats', null, { player_id: 'mSam' }), 401);
  refusedWithNothing(await call('computePlayerStats', dave, { player_id: 'mSam' }), 403);   // in no group
  refusedWithNothing(await call('computePlayerStats', alice, { player_id: 'mSam' }), 403);  // admin of another group
  refusedWithNothing(await call('computePlayerStats', carol, { player_id: 'mSam' }), 403);  // shares Group B with Sam, not this group
  refusedWithNothing(await call('computePlayerStats', carol, { player_id: 'mSam', group_id: 'gB' }), 404);
  for (const forger of Object.values(forgers)) {
    const forged = { ...forger, groups: [{ ...forger.groups[0], group_id: 'gS' }] };
    refusedWithNothing(await call('computePlayerStats', forged, { player_id: 'mSam' }), 403);
  }
});

// --- ruling 58: tied players share a place ---------------------------------------------------------
await t('computePlayerStats: players level on points share a place in a night — #1 #2 #2 #4; two level on top are both #1 with a win each and the next is #3', async () => {
  fresh(() => {
    statsTable();
    db.Session.push(
      { id: 'sT2', group_id: 'gS', name: 'Two level', status: 'closed', session_date: '2026-07-24', created_date: at(6050) },
      { id: 'sT3', group_id: 'gS', name: 'Three level', status: 'closed', session_date: '2026-07-31', created_date: at(6060) },
      { id: 'sT1', group_id: 'gS', name: 'Two on top', status: 'closed', session_date: '2026-07-17', created_date: at(6040) },
    );
    // Two level: Sam +26, Tal +19, Uri +19, Vered -10.  Three level: Sam, Tal, Uri +14 each, Vered -20.
    // Two on top: Sam +26, Tal +26, Uri +14, Vered -10.
    const night = (id, session, seats) => {
      db.Game.push({ id, group_id: 'gS', session_id: session, round_number: 1, status: 'complete', everyone_falls: false, trump_suit: null, highest_bidder_player_id: 'mSam', created_date: at(6070) });
      seats.forEach(([playerId, name, bid, tricks, points], i) => db.RoundResult.push({
        id: `${id}-r${i}`, game_id: id, session_id: session, group_id: 'gS', player_id: playerId, player_name: name, bid_order: i, bid, tricks_won: tricks, reneged: false, points, created_date: at(6070),
      }));
    };
    night('rT2-1', 'sT2', [['mSam', 'Sam', 4, 4, 26], ['mTal', 'Tal', 3, 3, 19], ['mUri', 'Uri', 3, 3, 19], ['mVered', 'Vered', 2, 3, -10]]);
    night('rT3-1', 'sT3', [['mSam', 'Sam', 2, 2, 14], ['mTal', 'Tal', 2, 2, 14], ['mUri', 'Uri', 2, 2, 14], ['mVered', 'Vered', 5, 7, -20]]);
    night('rT1-1', 'sT1', [['mSam', 'Sam', 4, 4, 26], ['mTal', 'Tal', 4, 4, 26], ['mUri', 'Uri', 2, 2, 14], ['mVered', 'Vered', 2, 3, -10]]);
  });
  const place = async (id) => Object.fromEntries((await playerStats(id)).sessions.map((n) => [n.name, n.rank]));
  const [samPlaces, talPlaces, uriPlaces, veredPlaces] = [await place('mSam'), await place('mTal'), await place('mUri'), await place('mVered')];
  assert.deepEqual([samPlaces['Two level'], talPlaces['Two level'], uriPlaces['Two level'], veredPlaces['Two level']], [1, 2, 2, 4]);
  assert.deepEqual([samPlaces['Three level'], talPlaces['Three level'], uriPlaces['Three level'], veredPlaces['Three level']], [1, 1, 1, 4]);
  // Two level on top: both are #1 and the next player is #3 — nobody is #2.
  assert.deepEqual([samPlaces['Two on top'], talPlaces['Two on top'], uriPlaces['Two on top'], veredPlaces['Two on top']], [1, 1, 3, 4]);
  // Level in front on a closed night is a win for each of them (a shared win, by design).
  // Sam: First Friday, Two level, Three level, Two on top. Tal: Three level, Two on top. Uri: Three level.
  const wins = async (id) => (await playerStats(id)).performance.wins;
  assert.deepEqual([await wins('mSam'), await wins('mTal'), await wins('mUri'), await wins('mVered')], [4, 2, 1, 1]);
  // Group A's Big Night ended with all four level: everyone is #1 of 4.
  const big = (await call('computePlayerStats', alice, { player_id: 'mBob' })).data.sessions;
  assert.deepEqual(big, [{ session_id: 'sA1', name: 'Big Night', session_date: '2026-07-01', status: 'closed', total: 2470, rank: 1, players: 4, no_winner: false }]);
});

// --- ruling 12: nothing to count is not 0% -------------------------------------------------------
await t('computePlayerStats: a rate with nothing to count is null — zero-bid success without a zero bid, accuracy without a round', async () => {
  fresh(statsTable);
  // Tal never bid zero: null. Uri bid zero once and took two tricks: a real 0. Sam made his: 1.
  assert.deepEqual((await playerStats('mTal')).strategy, { contract_accuracy: 0.38, made_count: 3, zero_bids: 0, zero_bid_success: 0, zero_bid_success_rate: null, bid_aggressiveness: 4 });
  assert.deepEqual((await playerStats('mUri')).strategy, { contract_accuracy: 0.13, made_count: 1, zero_bids: 1, zero_bid_success: 0, zero_bid_success_rate: 0, bid_aggressiveness: 2.13 });
  assert.deepEqual((await playerStats('mSam')).strategy, { contract_accuracy: 0.63, made_count: 5, zero_bids: 1, zero_bid_success: 1, zero_bid_success_rate: 1, bid_aggressiveness: 3.75 });
  // Xen has not played: every rate is null, every count 0.
  const xen = await playerStats('mXen');
  assert.deepEqual(xen.performance, { total_score: 0, avg_score: 0, rounds_played: 0, sessions_played: 0, sessions_open: 0, wins: 0, podiums: 0, win_ratio: null });
  assert.deepEqual(xen.strategy, { contract_accuracy: null, made_count: 0, zero_bids: 0, zero_bid_success: 0, zero_bid_success_rate: null, bid_aggressiveness: 0 });
  assert.deepEqual(xen.awards, { greedy_loss: 0, coward_loss: 0, destroyer_count: 0, held: [] });
  // Group A never saw a zero bid.
  assert.equal((await call('computePlayerStats', alice, { player_id: 'mBob' })).data.strategy.zero_bid_success_rate, null);
});
await t('computeGlobalStats: the same rates across groups', async () => {
  fresh(statsTable);
  // Sam: 5 of 9 contracts made; two zero bids, one made (Stats Table) and one lost (Group B).
  assert.deepEqual((await call('computeGlobalStats', sam, {})).data.strategy, { contract_accuracy: 0.56, made_count: 5, zero_bids: 2, zero_bid_success: 1, zero_bid_success_rate: 0.5, bid_aggressiveness: 3.33 });
  // Bob (Group A only) made every contract and never bid zero.
  const bobStats = (await call('computeGlobalStats', bob, {})).data;
  assert.deepEqual([bobStats.strategy.contract_accuracy, bobStats.strategy.zero_bid_success_rate, bobStats.performance.win_ratio], [1, null, 1]);
  // Wolf's only night is still open: two rounds played, and no win rate yet.
  const wolfStats = (await call('computeGlobalStats', wolf, {})).data;
  assert.deepEqual(wolfStats.performance, { total_score: 26, avg_score: 13, rounds_played: 2, sessions_played: 0, sessions_open: 1, wins: 0, podiums: 0, win_ratio: null });
  assert.deepEqual([wolfStats.best_session, wolfStats.worst_session], [null, null]);
});

// --- ruling 10: The Destroyer names a person; ties name every holder ----------------------------
await t('computePlayerStats: The Destroyer counts everyone-falls rounds for the top bidder — the recorded trump winner, else the highest bid', async () => {
  fresh(statsTable);
  // Three rounds fell. First Friday 2: trump recorded for Tal (Sam bid the same 5).
  // Second Friday 1: no trump, Sam and Tal level on 4 -> both. Tonight 2: no trump, Sam's 6.
  const count = async (id) => (await playerStats(id)).awards.destroyer_count;
  assert.deepEqual([await count('mSam'), await count('mTal'), await count('mUri'), await count('mVered'), await count('mWolf')], [2, 2, 0, 0, 0]);
  // Marking the trump winner of Second Friday 1 settles that tie.
  fresh(() => { statsTable(); Object.assign(row('Game', 'rS2-1'), { trump_suit: 'hearts', highest_bidder_player_id: 'mTal' }); });
  assert.deepEqual([await count('mSam'), await count('mTal')], [1, 2]);
});
await t('computePlayerStats: group awards name every tied holder, leave out an award nobody holds, and say which ones the player holds', async () => {
  fresh(statsTable);
  const stats = await playerStats('mSam');
  assert.deepEqual(stats.group_awards, {
    greedy: { value: 20, holders: [{ player_id: 'mTal', name: 'Tal' }] },                                         // Tal: -10 and -10 taking too few
    coward: { value: 50, holders: [{ player_id: 'mUri', name: 'Uri' }] },                                         // Uri: -10 and the lost zero bid, -40
    destroyer: { value: 2, holders: [{ player_id: 'mSam', name: 'Sam' }, { player_id: 'mTal', name: 'Tal' }] },   // level on two rounds
  });
  assert.deepEqual(stats.awards, { greedy_loss: 0, coward_loss: 0, destroyer_count: 2, held: ['destroyer'] });
  assert.deepEqual((await playerStats('mTal')).awards, { greedy_loss: 20, coward_loss: 0, destroyer_count: 2, held: ['greedy', 'destroyer'] });
  // Uri's -110 was a renege round: it is not counted as "too few".
  assert.deepEqual((await playerStats('mUri')).awards, { greedy_loss: 10, coward_loss: 50, destroyer_count: 0, held: ['coward'] });
  assert.deepEqual((await playerStats('mVered')).awards, { greedy_loss: 0, coward_loss: 0, destroyer_count: 0, held: [] });
  // Group A: nobody ever lost a point and no round fell — there is no award to hold.
  const groupA = (await call('computePlayerStats', alice, { player_id: 'mBob' })).data;
  assert.deepEqual(groupA.group_awards, { greedy: null, coward: null, destroyer: null });
  assert.deepEqual(groupA.awards, { greedy_loss: 0, coward_loss: 0, destroyer_count: 0, held: [] });
});
await t('computeGlobalStats: a player’s own award figures across groups, with The Destroyer counted the same way', async () => {
  fresh(statsTable);
  assert.deepEqual((await call('computeGlobalStats', sam, {})).data.awards, { greedy_loss: 0, coward_loss: 50, destroyer_count: 2 }); // -50: the zero bid lost in Group B
  assert.deepEqual((await call('computeGlobalStats', tal, {})).data.awards, { greedy_loss: 20, coward_loss: 0, destroyer_count: 2 });
});

// --- the browser's standings and the server's stats agree ----------------------------------------
await t('the group home (src/lib/standings.js) and computePlayerStats count the same wins and name the same award holders', async () => {
  fresh(statsTable);
  const { buildStandings, computeAwardLeaders } = await import(path.join(ROOT, 'src/lib/standings.js'));
  const group = (await call('getGroupData', sam, { scope: 'group', group_id: 'gS' })).data;
  const table = buildStandings(group.results, {}, { sessions: group.sessions });
  // By hand: Sam won First Friday, Vered won Second Friday; tonight is open, where Sam leads.
  assert.deepEqual(table.map((p) => [p.player_name, p.total_score, p.rank, p.gap_to_leader, p.wins, p.leading]), [
    ['Sam', 155, 1, 0, 1, true], ['Vered', 115, 2, 40, 1, false], ['Tal', 71, 3, 84, 0, false], ['Wolf', 26, 4, 129, 0, false], ['Uri', -156, 5, 311, 0, false],
  ]);
  assert.deepEqual(table[0].delta_session, { id: 'sS3', name: 'Tonight', status: 'open' });
  for (const p of table) {
    const { performance } = await playerStats(p.player_id);
    assert.deepEqual(
      [performance.total_score, performance.rounds_played, performance.wins, performance.podiums, performance.sessions_played, performance.win_ratio],
      [p.total_score, p.rounds_played, p.wins, p.podiums, p.sessions_played, p.win_ratio],
      `${p.player_name}: the profile and the standings disagree`,
    );
  }
  assert.deepEqual(computeAwardLeaders(group.results, group.rounds), (await playerStats('mSam')).group_awards);
});

// --- ruling 13: round history says which night, and is never cut silently -------------------------
await t('getGroupData player scope: every row names its session; a long history is cut at 200 rows and says how many there are', async () => {
  fresh(statsTable);
  const short = (await call('getGroupData', tal, { scope: 'player', player_id: 'mUri' })).data;
  assert.deepEqual([short.results.length, short.total_rows, short.limit], [8, 8, 200]); // the round in play is not history yet
  assert.deepEqual(short.sessions, {
    sS1: { id: 'sS1', name: 'First Friday', session_date: '2026-08-07', status: 'closed', counted_rounds: 2, no_winner: false },
    sS2: { id: 'sS2', name: 'Second Friday', session_date: '2026-08-14', status: 'closed', counted_rounds: 2, no_winner: false },
    sS3: { id: 'sS3', name: 'Tonight', session_date: '2026-08-21', status: 'open', counted_rounds: 1, no_winner: false },
  });
  assert.deepEqual(short.results.map((r) => short.sessions[r.session_id].name), ['Tonight', 'Tonight', 'Second Friday', 'Second Friday', 'Second Friday', 'First Friday', 'First Friday', 'First Friday']);
  // Sam's history in Stats Table does not carry his Group B night, nor Group B's session.
  const samHistory = (await call('getGroupData', tal, { scope: 'player', player_id: 'mSam' })).data;
  assert.deepEqual(Object.keys(samHistory.sessions).sort(), ['sS1', 'sS2', 'sS3']);
  assert.ok(samHistory.results.every((r) => r.group_id === 'gS'));

  // Group A with 140 more rounds: Alice has 271 scored rows.
  fresh(() => {
    db.Session.push({ id: 'sLong', group_id: 'gA', name: 'Long Night', status: 'closed', session_date: '2026-07-20', created_date: at(5000) });
    for (let n = 1; n <= 140; n++) addRound({ id: `rLong-${n}`, group: 'gA', session: 'sLong', number: n, seats: SEATS });
  });
  const long = (await call('getGroupData', bob, { scope: 'player', player_id: 'mAlice' })).data;
  assert.deepEqual([long.results.length, long.total_rows, long.limit], [200, 271, 200]);
  assert.equal(new Set(long.results.map((r) => r.id)).size, 200);
  const times = long.results.map((r) => new Date(r.created_date).getTime());
  assert.deepEqual(times, [...times].sort((a, b) => b - a));
  assert.equal(long.results[0].game_id, 'rLong-140');
  assert.equal(long.rounds.length, 200);
  assert.deepEqual(Object.keys(long.sessions).sort(), ['sA1', 'sA2', 'sLong']);
  assert.ok(long.results.every((r) => long.sessions[r.session_id]));

  // Who is refused has not changed, and a refusal carries none of it.
  for (const outsider of [null, dave, carol, ...Object.values(forgers)]) {
    const res = await call('getGroupData', outsider, { scope: 'player', player_id: 'mAlice' });
    assert.equal(res.status, outsider ? 403 : 401);
    assert.deepEqual(Object.keys(res.data), ['error']);
  }
});

// --- ruling 66: a player's own note is not news to them --------------------------------------------
section = 'R1 names, archive, session input, activity';
await check('getActivityFeed', 'allowed', 'a note the caller wrote is never unseen and does not raise their own badge; other people’s notes and anonymous ones still do', async () => {
  // Group A with just its three fixture notes about Bob: n1 signed by Alice, n2 anonymous,
  // nW signed by Yael (the notes the read-path checks above created are taken out again).
  fresh(() => { db.TableTalkNote = db.TableTalkNote.filter((n) => ['n1', 'n2', 'n3', 'nW'].includes(n.id)); });
  const unseen = (res) => Object.fromEntries(res.data.notes.map((n) => [n.id, n.is_unseen]));
  const asAlice = await call('getActivityFeed', alice, {});
  assert.equal(asAlice.data.unseen_count, 2);
  assert.deepEqual(unseen(asAlice), { nW: true, n2: true, n1: false });
  assert.equal((await call('getActivityFeed', alice, { count_only: true })).data.unseen_count, 2); // the badge
  assert.equal((await call('getActivityFeed', yael, {})).data.unseen_count, 2);                    // nW is hers
  // Bob wrote none of them: all three are news to him.
  const asBob = await call('getActivityFeed', bob, {});
  assert.equal(asBob.data.unseen_count, 3);
  assert.deepEqual(unseen(asBob), { nW: true, n2: true, n1: true });
  // Carol's only note is her own.
  assert.deepEqual([(await call('getActivityFeed', carol, {})).data.unseen_count, unseen(await call('getActivityFeed', carol, {}))], [0, { n3: false }]);

  // Alice leaves a signed note: her badge does not move, Bob's does.
  assert.equal((await call('createNote', alice, { group_id: 'gA', target_player_id: 'mDan', note: 'Dealt himself four aces' })).status, 200);
  assert.equal((await call('getActivityFeed', alice, { count_only: true })).data.unseen_count, 2);
  assert.equal((await call('getActivityFeed', bob, { count_only: true })).data.unseen_count, 4);
  // An anonymous note is stored without its author, so it cannot be told apart: it counts for her too.
  assert.equal((await call('createNote', alice, { group_id: 'gA', target_player_id: 'mDan', note: 'Someone peeked', is_anonymous: true })).status, 200);
  assert.equal(db.TableTalkNote.at(-1).author_user_id, null);
  assert.equal((await call('getActivityFeed', alice, { count_only: true })).data.unseen_count, 3);
});

// --- ruling 50: one player name per group, whatever the letter case or surrounding spaces ---------
{
  const taken = (typed, tail = '') => [409, `A member named "${typed}" already exists in this group${tail}`];
  await check('addGhostMember', 'allowed', 'a name that differs from a member’s only by letter case or surrounding spaces -> 409, nothing written', async () => {
    for (const typed of ['dan', 'DAN', ' Dan ', 'aLiCe', 'bob  ']) {
      const snap = fresh();
      const res = await call('addGhostMember', alice, { group_id: 'gA', player_name: typed });
      assert.deepEqual(outcome(res), taken(typed.trim()));
      assert.deepEqual(changes(snap), []);
      assert.equal(res.writes, 0, 'a write was attempted');
    }
    // Checked against the whole roster, past one page; a name nobody has is still fine.
    const snap = fresh(bigGroupA);
    assert.deepEqual(outcome(await call('addGhostMember', alice, { group_id: 'gA', player_name: 'ALICE' })), taken('ALICE'));
    assert.deepEqual(outcome(await call('addGhostMember', alice, { group_id: 'gA', player_name: 'extra 7' })), taken('extra 7'));
    assert.equal((await call('addGhostMember', alice, { group_id: 'gA', player_name: ' Danny ' })).status, 200);
    assert.deepEqual(changes(snap), ['GroupMember +1']);
    assert.equal(db.GroupMember.at(-1).player_name, 'Danny');
  });
  await check('joinGroupByCode', 'allowed', 'joining as a new player under a taken name, in any letter case -> 409, only the attempt is logged', async () => {
    const tail = '. Try a different display name.';
    for (const typed of ['bob', ' BOB ', 'ghost', 'Zed ']) {
      const snap = fresh();
      const res = await call('joinGroupByCode', dave, { invite_code: 'AAAAAA', player_name: typed });
      assert.deepEqual(outcome(res), taken(typed.trim(), tail));
      assert.deepEqual(changes(snap), ['JoinAttempt +1']);
    }
    // Checked against the whole roster, past one page; a name nobody has is still fine.
    let snap = fresh(bigGroupA);
    assert.deepEqual(outcome(await call('joinGroupByCode', dave, { invite_code: 'AAAAAA', player_name: 'alice' })), taken('alice', tail));
    assert.deepEqual(changes(snap), ['JoinAttempt +1']);
    snap = fresh(bigGroupA);
    assert.equal((await call('joinGroupByCode', dave, { invite_code: 'AAAAAA', player_name: ' Dave ' })).status, 200);
    assert.deepEqual(changes(snap), ['GroupMember +1', 'JoinAttempt +1']);
    assert.equal(db.GroupMember.at(-1).player_name, 'Dave');
  });
  await check('renameMember', 'allowed', 'a rename is compared the same way — spaces around a stored name do not hide it; changing the case of your own name is fine', async () => {
    // Old data: a name stored with a space after it.
    const snap = fresh(() => { row('GroupMember', 'mBob').player_name = 'Bob '; });
    for (const typed of ['bob', 'BOB', ' Bob']) {
      assert.deepEqual(outcome(await call('renameMember', alice, { group_id: 'gA', member_id: 'mZed', player_name: typed })), taken(typed.trim()));
    }
    assert.deepEqual(changes(snap), []);
    assert.equal((await call('renameMember', bob, { group_id: 'gA', member_id: 'mBob', player_name: 'BOB' })).status, 200);
    assert.equal(row('GroupMember', 'mBob').player_name, 'BOB');
  });
}

// --- ruling 53: a group with a session still open cannot be archived ------------------------------
{
  const OPEN_SESSION = 'Close the open session first';
  const archive = { group_id: 'gA', status: 'archived' };
  await check('setGroupStatus', 'allowed', 'archiving while a session is open -> 409 for the group admin and the app admin alike, nothing written', async () => {
    const snap = fresh(); // Short Night is open
    for (const user of [alice, hana, root]) {
      const res = await call('setGroupStatus', user, archive);
      assert.deepEqual(outcome(res), [409, OPEN_SESSION]);
      assert.equal(res.writes, 0, 'a write was attempted');
    }
    assert.deepEqual(changes(snap), []);
    assert.equal(row('Group', 'gA').status, 'active');
    // Who may not do it at all is told that, not about the session.
    assert.deepEqual(outcome(await call('setGroupStatus', bob, archive)), [403, GROUP_WRITES.setGroupStatus.plain]);
    assert.deepEqual(outcome(await call('setGroupStatus', carol, archive)), [403, GROUP_WRITES.setGroupStatus.outsider]);
  });
  await check('setGroupStatus', 'allowed', 'the way out is to close the session: then the group is archived; un-archiving and deleting never wait for a session', async () => {
    fresh(finishOpenRound);
    assert.deepEqual(outcome(await call('setGroupStatus', alice, archive)), [409, OPEN_SESSION]);
    assert.equal((await call('closeSession', alice, { session_id: 'sA2' })).status, 200);
    assert.equal((await call('setGroupStatus', alice, archive)).status, 200);
    assert.equal(row('Group', 'gA').status, 'archived');
    // A group archived before this rule may still hold an open session: it can be made active again...
    fresh(() => { row('Group', 'gA').status = 'archived'; });
    assert.deepEqual(outcome(await call('setGroupStatus', alice, archive)), [409, OPEN_SESSION]);
    assert.equal((await call('setGroupStatus', alice, { group_id: 'gA', status: 'active' })).status, 200);
    assert.equal(row('Group', 'gA').status, 'active');
    // ...and deleting a group does not need its session closed.
    fresh();
    assert.equal((await call('setGroupStatus', alice, { group_id: 'gA', status: 'deleted' })).status, 200);
    assert.equal(row('Group', 'gA').status, 'deleted');
  });
  await check('setGroupStatus', 'allowed', 'the open session is found past one page of newer sessions', async () => {
    const snap = fresh(() => {
      for (let i = 0; i < 520; i++) db.Session.push({ id: `sA-x${i}`, group_id: 'gA', name: `Night ${i}`, status: 'closed', session_date: '2026-09-01', created_date: at(7000 + i) });
    });
    assert.deepEqual(outcome(await call('setGroupStatus', alice, archive)), [409, OPEN_SESSION]);
    assert.deepEqual(changes(snap), []);
  });
}

// --- ruling 54: a session's name, place and date have limits ---------------------------------------
{
  const sessionClosed = GROUP_WRITES.startSession.setup; // nothing open, so a session can start
  const start = (body) => call('startSession', bob, { group_id: 'gA', ...body });
  const NAME_TOO_LONG = 'The session name can be at most 60 characters';
  const PLACE_TOO_LONG = 'The place can be at most 60 characters';
  const BAD_DATE = 'The date must be a real date between 2000-01-01 and 2100-12-31, as YYYY-MM-DD';
  await check('startSession', 'allowed', 'a name or a place longer than 60 characters -> 400, nothing written; 60 is fine and is stored without surrounding spaces', async () => {
    const snap = fresh(sessionClosed);
    for (const [body, error] of [
      [{ name: 'x'.repeat(61) }, NAME_TOO_LONG], [{ name: 'ש'.repeat(360) }, NAME_TOO_LONG], [{ name: 12345 }, NAME_TOO_LONG],
      [{ location: 'y'.repeat(61) }, PLACE_TOO_LONG], [{ name: 'Fine', location: 'z'.repeat(500) }, PLACE_TOO_LONG],
    ]) {
      const res = await start(body);
      assert.deepEqual(outcome(res), [400, error], JSON.stringify(body).slice(0, 40));
      assert.equal(res.writes, 0, 'a write was attempted');
    }
    assert.deepEqual(changes(snap), []);
    // Exactly 60 after trimming: accepted.
    const res = await start({ name: `  ${'n'.repeat(60)}  `, location: ` ${'p'.repeat(60)} ` });
    assert.equal(res.status, 200, `got ${res.status}: ${res.data.error}`);
    assert.deepEqual([res.data.session.name, res.data.session.location], ['n'.repeat(60), 'p'.repeat(60)]);
  });
  await check('startSession', 'allowed', 'a date that is not a real day between 2000-01-01 and 2100-12-31 -> 400, nothing written', async () => {
    const snap = fresh(sessionClosed);
    for (const session_date of ['1900-01-01', '1999-12-31', '2101-01-01', '9999-12-31', '2026-02-30', '2026-13-01', '2026-00-10', '2026-7-1', '01/07/2026', 'yesterday', '2026-07-01T20:30:00Z', 20260701, true]) {
      const res = await start({ name: 'Dated', session_date });
      assert.deepEqual(outcome(res), [400, BAD_DATE], `session_date ${JSON.stringify(session_date)}`);
      assert.equal(res.writes, 0, 'a write was attempted');
    }
    assert.deepEqual(changes(snap), []);
  });
  await check('startSession', 'allowed', 'a real date in range is stored as sent; no date at all still means today', async () => {
    for (const session_date of ['2000-01-01', '2100-12-31', '2028-02-29', ' 2026-07-15 ']) {
      fresh(sessionClosed);
      const res = await start({ name: 'Dated', session_date });
      assert.equal(res.status, 200, `${session_date} -> ${res.status}: ${res.data.error}`);
      assert.equal(res.data.session.session_date, session_date.trim());
    }
    for (const session_date of [undefined, null, '', '   ']) {
      fresh(sessionClosed);
      const res = await start({ session_date });
      assert.equal(res.status, 200, `${JSON.stringify(session_date)} -> ${res.status}: ${res.data.error}`);
      assert.equal(res.data.session.session_date, new Date().toISOString().slice(0, 10)); // the server's (UTC) day
      assert.equal(res.data.session.name, ''); // shown as the weekday and date
    }
  });
}
thaw(base);

// --- static guards: the browser must not read game data directly -------------------------
section = 'static guards';
const stripJsonComments = (src) => {
  let out = '';
  for (let i = 0, inString = false; i < src.length; i++) {
    const c = src[i];
    if (inString) { out += c; if (c === '\\') out += src[++i]; else if (c === '"') inString = false; continue; }
    if (c === '"') { inString = true; out += c; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 1; continue; }
    out += c;
  }
  return out;
};
// Data entities are closed to EVERY browser caller — `false`, not "app admin only" — so the
// lock does not rest on the user record's `role` field (P13-B9). Only service-role
// functions read or write them.
const CLOSED_ENTITIES = ['Group', 'Session', 'Game', 'RoundResult', 'TableTalkNote', 'JoinAttempt'];
for (const name of CLOSED_ENTITIES) {
  await t(`entity ${name}: read is closed to every browser caller`, async () => {
    const schema = JSON.parse(stripJsonComments(readFileSync(path.join(ROOT, 'base44/entities', `${name}.jsonc`), 'utf8')));
    assert.equal(schema.rls.read, false);
  });
}
await t('no entity lets everyone read or write', async () => {
  for (const file of readdirSync(path.join(ROOT, 'base44/entities'))) {
    const schema = JSON.parse(stripJsonComments(readFileSync(path.join(ROOT, 'base44/entities', file), 'utf8')));
    for (const [op, rule] of Object.entries(schema.rls || {})) assert.notEqual(rule, true, `${file} rls.${op} is open to everyone`);
  }
});
// Group and game data are only ever touched through service-role functions, so the
// browser gets nothing: every rule on them is the literal `false`.
section = 'P13 review fixes';
await t('data entities: every rule, on every operation, is closed (false)', async () => {
  const offenders = [];
  for (const name of CLOSED_ENTITIES) {
    const schema = JSON.parse(stripJsonComments(readFileSync(path.join(ROOT, 'base44/entities', `${name}.jsonc`), 'utf8')));
    const rules = schema.rls || {};
    for (const op of new Set(['create', 'read', 'update', 'delete', ...Object.keys(rules)])) {
      if (rules[op] !== false) offenders.push(`${name} rls.${op}: ${JSON.stringify(rules[op])}`);
    }
  }
  assert.deepEqual(offenders, []);
});
await t('GroupMember: a browser caller reads only their own rows and writes nothing', async () => {
  const schema = JSON.parse(stripJsonComments(readFileSync(path.join(ROOT, 'base44/entities', 'GroupMember.jsonc'), 'utf8')));
  assert.deepEqual(schema.rls, { create: false, read: { 'data.user_id': '{{user.id}}' }, update: false, delete: false });
});
// Without this field rule a signed-in user can make themselves app admin with
// auth.updateMe({ role: 'admin' }) — proven on a throwaway Base44 app, then closed on the
// live one (P13-B9). Every `user.role === 'admin'` check in the functions rests on it.
await t('User.role can be written only by an app admin (field rule)', async () => {
  const schema = JSON.parse(stripJsonComments(readFileSync(path.join(ROOT, 'base44/entities', 'User.jsonc'), 'utf8')));
  assert.deepEqual(schema.properties.role.rls, { write: { user_condition: { role: 'admin' } } });
});
await t('no entity rule depends on the user record\'s role field', async () => {
  for (const file of readdirSync(path.join(ROOT, 'base44/entities'))) {
    const schema = JSON.parse(stripJsonComments(readFileSync(path.join(ROOT, 'base44/entities', file), 'utf8')));
    assert.ok(!JSON.stringify(schema.rls || {}).includes('user_condition'), `${file} has a rule that trusts user.role`);
  }
});
// The stats functions cannot import src/lib/whist-stats.js (Deno), so they carry a copy of
// its MIRROR block. A copy that drifts would make the profile disagree with the standings.
section = 'R1 stats';
await t('the stats code inlined in computePlayerStats and computeGlobalStats is src/lib/whist-stats.js, word for word', async () => {
  const mirror = (text) => (text.match(/\/\/ <<< BEGIN MIRROR[^\n]*>>>\n([\s\S]*?)\/\/ <<< END MIRROR >>>/) || [])[1];
  const lib = mirror(readFileSync(path.join(ROOT, 'src/lib/whist-stats.js'), 'utf8'));
  assert.ok(lib && lib.includes('function sessionRecord'), 'src/lib/whist-stats.js has no MIRROR block');
  const expected = lib.replace(/^export /gm, '').split('\n');
  for (const name of ['computePlayerStats', 'computeGlobalStats']) {
    const copy = mirror(source(name));
    assert.ok(copy, `${name} has no MIRROR block`);
    const lines = copy.split('\n');
    const drift = expected.findIndex((line, i) => line !== lines[i]);
    assert.equal(drift, -1, `${name} differs from src/lib/whist-stats.js at line ${drift + 1} of the block: ${JSON.stringify(lines[drift])} instead of ${JSON.stringify(expected[drift])}`);
    assert.equal(lines.length, expected.length, `${name}: the block has extra lines`);
  }
});
section = 'static guards';
await t('the frontend never reads game data entities directly', async () => {
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.(jsx?|ts)$/.test(entry)) continue;
      const hits = readFileSync(full, 'utf8').match(/base44\.entities\.(Group|Session|Game|RoundResult|TableTalkNote|GamePlayer)\b/g);
      if (hits) offenders.push(`${path.relative(ROOT, full)}: ${hits.join(', ')}`);
    }
  };
  walk(path.join(ROOT, 'src'));
  assert.deepEqual(offenders, []);
});

// --- static guards: every function is classified, and every write function is covered --------
// Anything that looks like a write call. Deliberately broad (it would also match a
// Map#delete): a false alarm costs a line here, a missed write costs an unchecked function.
const WRITE_CALL = /\.(create|bulkCreate|update|bulkUpdate|updateMe|delete|deleteMany)\(/;
const writeNames = Object.keys(WRITE_FUNCTIONS);

await t('every function folder is on the read list or the write list, and only one of them', async () => {
  const listed = [...READ_FUNCTIONS, ...writeNames];
  assert.deepEqual(FUNCTION_FOLDERS.filter((name) => !listed.includes(name)), [], 'function folders on neither list');
  assert.deepEqual(listed.filter((name) => !FUNCTION_FOLDERS.includes(name)), [], 'listed functions with no folder');
  assert.deepEqual(READ_FUNCTIONS.filter((name) => writeNames.includes(name)), [], 'functions on both lists');
});
await t('a function on the read list makes no write call; one on the write list does', async () => {
  const present = (name) => FUNCTION_FOLDERS.includes(name);
  assert.deepEqual(READ_FUNCTIONS.filter((name) => present(name) && WRITE_CALL.test(source(name))), [], 'read functions that write');
  assert.deepEqual(writeNames.filter((name) => present(name) && !WRITE_CALL.test(source(name))), [], 'write functions that do not write');
});
await t('no function trusts the membership cache: user.groups appears only where a hinted row is re-read by id and its owner checked', async () => {
  const offenders = [];
  for (const name of FUNCTION_FOLDERS) {
    const lines = source(name).split('\n');
    lines.forEach((line, i) => {
      if (!/user\??\.groups|\[['"]groups['"]\]/.test(line) || /^\s*\/\//.test(line)) return;
      const next = lines.slice(i, i + 8).join('\n');
      const rereads = /GroupMember\.get\((hint|cached)\.member_id\)/.test(next) && /row\.user_id === user\.id/.test(next);
      if (!rereads) offenders.push(`${name}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, []);
});

// =========================================================================================
// Review round 2 (C): a session in which no round counted has no winner (qa-tester-1), and a
// note is posted once (qa-tester-2).
// =========================================================================================
section = 'R2 stats and notes';

// The stats table plus a closed night whose only round fell: bids 4,4,4,2 and tricks 3,3,3,4,
// so nobody made their contract and everybody scored 0 — four players "level on top".
const withFallenNight = () => {
  statsTable();
  db.Session.push({ id: 'sS4', group_id: 'gS', name: 'Nobody made it', status: 'closed', session_date: '2026-08-18', created_date: at(6250) });
  const seats = [['mSam', 'Sam', 4, 3], ['mTal', 'Tal', 4, 3], ['mUri', 'Uri', 4, 3], ['mVered', 'Vered', 2, 4]];
  const scored = scoreRound({ players: seats.map(([player_id, , bid, tricks_won]) => ({ player_id, bid, tricks_won, reneged: false })), scoringMethod: 'classic' });
  assert.equal(scored.everyoneFalls, true, 'fixture: the round must be everyone-falls');
  db.Game.push({ id: 'rS4-1', group_id: 'gS', session_id: 'sS4', round_number: 1, status: 'cancelled', everyone_falls: true, trump_suit: null, highest_bidder_player_id: 'mSam', created_date: at(6450) });
  seats.forEach(([playerId, name, bid, tricks], i) => db.RoundResult.push({
    id: `rS4-1-r${i}`, game_id: 'rS4-1', session_id: 'sS4', group_id: 'gS', player_id: playerId, player_name: name,
    bid_order: i, bid, tricks_won: tricks, reneged: false, points: scored.results[i].points, created_date: at(6450),
  }));
};
const RESULT_FIELDS = ['sessions_played', 'wins', 'podiums', 'win_ratio'];
const resultOf = (performance) => Object.fromEntries(RESULT_FIELDS.map((f) => [f, performance[f]]));

await t('computePlayerStats: a closed session where no round counted adds no win, no podium and no session played — for anyone', async () => {
  fresh(statsTable);
  const before = {};
  for (const id of ['mSam', 'mTal', 'mUri', 'mVered']) before[id] = resultOf((await playerStats(id)).performance);
  fresh(withFallenNight);
  for (const id of ['mSam', 'mTal', 'mUri', 'mVered']) {
    const stats = await playerStats(id);
    assert.deepEqual(resultOf(stats.performance), before[id], id);
    const night = stats.sessions.find((n) => n.session_id === 'sS4');
    assert.equal(night.no_winner, true, `${id}: the night says it has no winner`);
    assert.notEqual(stats.best_session?.session_id, 'sS4');
    assert.notEqual(stats.worst_session?.session_id, 'sS4');
    assert.ok(stats.sessions.filter((n) => n.session_id !== 'sS4').every((n) => n.no_winner === false));
  }
});
await t('computeGlobalStats: a session where no round counted adds no win and says no_winner', async () => {
  fresh(statsTable);
  const before = resultOf((await call('computeGlobalStats', sam, {})).data.performance);
  fresh(withFallenNight);
  const { data } = await call('computeGlobalStats', sam, {});
  assert.deepEqual(resultOf(data.performance), before);
  assert.equal(data.sessions.find((n) => n.session_id === 'sS4').no_winner, true);
});
await t('getGroupData: every session says how many rounds counted and whether it has no winner', async () => {
  fresh(withFallenNight);
  const one = (await call('getGroupData', sam, { scope: 'session', session_id: 'sS4' })).data.session;
  assert.deepEqual([one.id, one.counted_rounds, one.no_winner], ['sS4', 0, true]);
  const other = (await call('getGroupData', sam, { scope: 'session', session_id: 'sS2' })).data.session;
  assert.deepEqual([other.counted_rounds, other.no_winner], [2, false]); // one of its three rounds fell
  const group = (await call('getGroupData', sam, { scope: 'group', group_id: 'gS' })).data.sessions;
  assert.deepEqual(Object.fromEntries(group.map((x) => [x.id, [x.counted_rounds, x.no_winner]])), {
    sS1: [2, false], sS2: [2, false], sS3: [1, false], sS4: [0, true],
  });
  const lean = (await call('getGroupData', sam, { scope: 'group', group_id: 'gS', include_results: false })).data.sessions;
  assert.equal(lean.find((x) => x.id === 'sS4').no_winner, true);
  const player = (await call('getGroupData', sam, { scope: 'player', player_id: 'mVered' })).data.sessions;
  assert.deepEqual([player.sS4.counted_rounds, player.sS4.no_winner, player.sS1.no_winner], [0, true, false]);
});

const notesAbout = (target, text) => db.TableTalkNote.filter((n) => n.target_player_id === target && n.note === text);
await check('createNote', 'allowed', 'the same signed note sent twice within 10 seconds is stored once, and both answers are the first note', async () => {
  fresh();
  const body = { group_id: 'gA', target_player_id: 'mBob', note: 'Double tap', session_id: 'sA1' };
  const first = await call('createNote', alice, body);
  const second = await call('createNote', alice, body);
  assert.deepEqual([first.status, second.status], [200, 200]);
  assert.equal(second.data.note.id, first.data.note.id);
  assert.deepEqual(Object.keys(second.data.note).sort(), Object.keys(first.data.note).sort());
  assert.equal(notesAbout('mBob', 'Double tap').length, 1);
});
await check('createNote', 'allowed', 'the same anonymous note sent twice is stored once, still without an author', async () => {
  fresh();
  const body = { group_id: 'gA', target_player_id: 'mBob', note: 'Anonymous double tap', is_anonymous: true };
  const first = await call('createNote', bob, body);
  const second = await call('createNote', bob, body);
  assert.equal(second.status, 200);
  assert.equal(second.data.note.id, first.data.note.id);
  const stored = notesAbout('mBob', 'Anonymous double tap');
  assert.equal(stored.length, 1);
  assert.deepEqual([stored[0].author_user_id, stored[0].author_name], [null, null]);
});
await check('createNote', 'allowed', 'two copies arriving together: one is kept, both answers name it', async () => {
  fresh();
  const body = { group_id: 'gA', target_player_id: 'mBob', note: 'Arrived together' };
  const [a, b] = await Promise.all([call('createNote', alice, body), call('createNote', alice, body)]);
  assert.deepEqual([a.status, b.status], [200, 200]);
  assert.equal(a.data.note.id, b.data.note.id);
  assert.equal(notesAbout('mBob', 'Arrived together').length, 1);
});
await check('createNote', 'allowed', 'not a duplicate: other text, another player, another author, signed vs anonymous, or more than 10 seconds later', async () => {
  fresh();
  const body = { group_id: 'gA', target_player_id: 'mBob', note: 'Same words' };
  await call('createNote', alice, body);
  await call('createNote', alice, { ...body, note: 'Other words' });
  await call('createNote', alice, { ...body, target_player_id: 'mDan' });
  await call('createNote', bob, body);                         // another author
  await call('createNote', alice, { ...body, is_anonymous: true });
  assert.equal(notesAbout('mBob', 'Same words').length, 3);    // Alice signed, Bob signed, anonymous
  assert.equal(notesAbout('mDan', 'Same words').length, 1);
  // An identical note from long ago does not stop a new one.
  fresh(() => db.TableTalkNote.push({ id: 'nOld', group_id: 'gA', target_player_id: 'mBob', note: 'Said it before', is_anonymous: false, author_user_id: 'uAlice', author_name: 'Alice', created_date: at(50) }));
  const again = await call('createNote', alice, { group_id: 'gA', target_player_id: 'mBob', note: 'Said it before' });
  assert.notEqual(again.data.note.id, 'nOld');
  assert.equal(notesAbout('mBob', 'Said it before').length, 2);
  fresh();
});

// A write function counts as covered when a check ran for every kind of caller it lists.
// Anything not on the read list counts as a write function, so an unclassified folder
// shows up here as uncovered.
const writeFolders = FUNCTION_FOLDERS.filter((name) => !READ_FUNCTIONS.includes(name));
const covered = writeFolders.filter((name) => (WRITE_FUNCTIONS[name] || [null]).every((kind) => coverage[name]?.has(kind)));
await t('every write function is covered by the access checks', async () => {
  assert.deepEqual(writeFolders.filter((name) => !covered.includes(name)), []);
});

console.log(`\n${pass} passed, ${fail} failed`);
console.log(`write functions covered: ${covered.length} of ${writeFolders.length}`);
process.exit(fail === 0 ? 0 : 1);
