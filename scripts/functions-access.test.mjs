// Who-can-do-what tests for the backend functions: the read path (P12-1) and every
// function that writes (P13-7).
// Run with:  node scripts/functions-access.test.mjs      (dependency-free, Node >= 22.15)
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
  async filter(query = {}, sort = '-created_date', limit = 500) {
    if (name === 'GroupMember' && query.user_id && laggingUsers.has(query.user_id)) return [];
    const desc = sort.startsWith('-');
    const key = desc ? sort.slice(1) : sort;
    return db[name]
      .filter((row) => matches(row, query))
      .sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (desc ? -1 : 1))
      .slice(0, Math.min(limit, 500)) // the platform caps one page at 500 rows
      .map((row) => ({ ...row }));
  },
  async list() { return db[name].map((row) => ({ ...row })); },
  async get(id) {
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
const READ_FUNCTIONS = [
  'askRules', 'computeGlobalStats', 'computePlayerStats', 'getGroupData', 'getGroupMembers',
  'getPlayerNotes', 'listAllGroupsWithStats',
];
const MEMBERS_ONLY = ['signed out', 'outsider', 'forged cache', 'honest lag', 'allowed'];
const ADMINS_ONLY = [...MEMBERS_ONLY, 'plain member', 'forged admin'];
const WRITE_FUNCTIONS = {
  // any member of the group
  startRound: MEMBERS_ONLY, submitBids: MEMBERS_ONLY, saveRoundResults: MEMBERS_ONLY, deleteRound: MEMBERS_ONLY,
  startSession: MEMBERS_ONLY, closeSession: MEMBERS_ONLY, createNote: MEMBERS_ONLY,
  // group admins only
  updateRound: ADMINS_ONLY, deleteNote: ADMINS_ONLY, addGhostMember: ADMINS_ONLY, removeMember: ADMINS_ONLY,
  renameMember: ADMINS_ONLY, unclaimMember: ADMINS_ONLY, updateMemberRole: ADMINS_ONLY,
  updateGroupSettings: ADMINS_ONLY, setGroupStatus: ADMINS_ONLY, regenerateInviteCode: ADMINS_ONLY,
  // the invite code is the key
  joinGroupByCode: ['signed out', 'outsider', 'forged cache', 'forged admin', 'honest lag', 'allowed'],
  previewGroupByCode: ['signed out', 'outsider', 'forged cache', 'allowed'],
  // any signed-in user, about themselves
  createGroup: ['signed out', 'forged cache', 'allowed'],
  getMyGroups: ['signed out', 'forged cache', 'forged admin', 'honest lag', 'allowed'],
  getActivityFeed: ['signed out', 'forged cache', 'honest lag', 'allowed'],
  // app admins only
  purgeGroup: ['signed out', 'outsider', 'forged cache', 'forged admin', 'allowed'],
  cleanupOrphans: ['signed out', 'outsider', 'forged cache', 'forged admin', 'allowed'],
};

const FUNCTIONS_DIR = path.join(ROOT, 'base44/functions');
const FUNCTION_FOLDERS = readdirSync(FUNCTIONS_DIR).filter((name) => statSync(path.join(FUNCTIONS_DIR, name)).isDirectory()).sort();

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
// through auth.updateMe); `writes` counts the write calls the request made.
async function call(name, user, body = {}) {
  currentUser = user ? structuredClone(user) : null;
  writeCalls = 0;
  const res = await handlers[name](new Request('http://test.local/', { method: 'POST', body: JSON.stringify(body) }));
  return { status: res.status, data: await res.json(), me: currentUser, writes: writeCalls };
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
async function t(label, fn) {
  try { await fn(); pass++; }
  catch (e) { fail++; console.error(`FAIL: ${label}\n      ${e.message}`); }
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
await t('player scope returns the latest 50 scored rounds, newest first, with their rounds', async () => {
  const { data } = await call('getGroupData', bob, { scope: 'player', player_id: 'mAlice' });
  assert.deepEqual(data.player, { id: 'mAlice', name: 'Alice', group_id: 'gA' });
  assert.equal(data.results.length, 50);
  assert.ok(data.results.every((r) => r.player_id === 'mAlice' && r.points != null));
  assert.equal(data.results[0].game_id, 'rA2-1'); // newest scored round; rA2-2 is unscored
  const times = data.results.map((r) => new Date(r.created_date).getTime());
  assert.deepEqual(times, [...times].sort((a, b) => b - a));
  const roundIds = new Set(data.rounds.map((g) => g.id));
  assert.ok(data.results.every((r) => roundIds.has(r.game_id)));
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
    body: { game_id: 'rA1-1' },
    done: ['Game -1', 'RoundResult -4'], outsider: NOT_A_MEMBER, appAdmin: true,
    verify: () => assert.equal(row('Game', 'rA1-1'), undefined),
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
{
  const APP_ADMIN_ONLY = 'App admin only';
  const orphans = () => {
    db.Session.push({ id: 'sLost', group_id: null, name: 'Lost', status: 'closed', created_date: at(950) });
    db.Game.push({ id: 'rLost', group_id: null, session_id: 'sLost', round_number: 1, status: 'complete', created_date: at(951) });
    db.RoundResult.push({ id: 'rLost-r0', game_id: 'rLost', group_id: null, player_id: 'mGone', points: 10, created_date: at(951) });
    db.TableTalkNote.push({ id: 'nLost', group_id: 'gA', target_player_id: 'mGone', note: 'About nobody', created_date: at(952) });
  };
  const inGroupA = (name) => base.rows[name].filter((r) => r.group_id === 'gA').length;
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
thaw(base);

// --- static guards: the browser must not read game data directly -------------------------
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
const ADMIN_ONLY = { user_condition: { role: 'admin' } };
for (const name of ['Group', 'Session', 'Game', 'RoundResult', 'TableTalkNote']) {
  await t(`entity ${name}: read is app-admin only (never open)`, async () => {
    const schema = JSON.parse(stripJsonComments(readFileSync(path.join(ROOT, 'base44/entities', `${name}.jsonc`), 'utf8')));
    assert.deepEqual(schema.rls.read, ADMIN_ONLY);
  });
}
await t('no entity lets everyone read or write', async () => {
  for (const file of readdirSync(path.join(ROOT, 'base44/entities'))) {
    const schema = JSON.parse(stripJsonComments(readFileSync(path.join(ROOT, 'base44/entities', file), 'utf8')));
    for (const [op, rule] of Object.entries(schema.rls || {})) assert.notEqual(rule, true, `${file} rls.${op} is open to everyone`);
  }
});
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
const source = (name) => readFileSync(path.join(FUNCTIONS_DIR, name, 'entry.ts'), 'utf8');
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
