// Who-can-read-what tests for the backend read path (P12-1).
// Run with:  node scripts/functions-access.test.mjs      (dependency-free, Node >= 22.15)
//
// The functions run on Base44 (Deno) and can't be called locally, so this loads the REAL
// entry.ts files and runs them against an in-memory stand-in for the Base44 backend:
// `npm:@base44/sdk` is swapped for a stub client and `Deno.serve` just hands us the
// request handler. What is under test is the functions' own logic — membership checks,
// scoping, what leaves the server — not Base44 itself.
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
    const row = { id: `${name}-new-${++seq}`, created_date: new Date(Date.UTC(2026, 10, 1, 0, 0, seq)).toISOString(), ...data };
    db[name].push(row);
    return { ...row };
  },
});

globalThis.__b44stub = {
  createClientFromRequest: () => ({
    auth: {
      me: async () => currentUser,
      updateMe: async (data) => { Object.assign(currentUser, data); return currentUser; },
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

const handlers = {};
let captured = null;
globalThis.Deno = { serve: (handler) => { captured = handler; } };
for (const name of ['getGroupData', 'getPlayerNotes', 'getGroupMembers', 'getActivityFeed', 'computePlayerStats', 'createNote']) {
  captured = null;
  await import(path.join(ROOT, 'base44/functions', name, 'entry.ts'));
  assert.ok(captured, `${name} did not register a handler`);
  handlers[name] = captured;
}

async function call(name, user, body = {}) {
  currentUser = user ? structuredClone(user) : null;
  const res = await handlers[name](new Request('http://test.local/', { method: 'POST', body: JSON.stringify(body) }));
  return { status: res.status, data: await res.json() };
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
