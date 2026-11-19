#!/usr/bin/env node
// Smoke test for the sandbox, over HTTP only — the same requests the browser makes.
//
//   node sandbox/smoke.mjs                 start a private sandbox on a free port, test it, stop it
//   node sandbox/smoke.mjs --port 4600     test the sandbox already running on that port (it gets RESET
//                                          first and last), or start one there if nothing is listening
//   node sandbox/smoke.mjs --build         rebuild the frontend first (default: reuse sandbox/.dist if present)
//
// Prints one line per check and exits non-zero if any failed.
import assert from 'node:assert/strict';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scoreRound } from '../src/lib/scoring.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const portArg = (() => {
  const i = argv.indexOf('--port');
  if (i >= 0) return Number(argv[i + 1]);
  const inline = argv.find((a) => a.startsWith('--port='));
  return inline ? Number(inline.slice(7)) : null;
})();
const APP = 'sandbox';
const PASSWORD = 'whist123';
// The assistant's exact refusal line — the same words as in base44/functions/askRules/entry.ts
const IDK = "IDK bro 🤷 — that's not in the WhistMate rulebook. I only know the rules and scoring; for your account or your data, see About & privacy in the menu.";

// ---- reach (or start) a sandbox ----
const freePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});
const port = portArg || await freePort();
const base = `http://127.0.0.1:${port}`;
const alive = async () => {
  try {
    const res = await fetch(`${base}/__sandbox/info`, { signal: AbortSignal.timeout(1500) });
    return res.ok && (await res.json()).sandbox === true;
  } catch { return false; }
};

let child = null;
let childOutput = '';
if (await alive()) {
  console.log(`# testing the sandbox already running on port ${port} — it is reset before and after`);
} else {
  const args = [path.join(HERE, 'server.mjs'), '--port', String(port), '--quiet'];
  if (!argv.includes('--build') && existsSync(path.join(HERE, '.dist/index.html'))) args.push('--no-build');
  console.log(`# starting a sandbox on port ${port}${args.includes('--no-build') ? ' (reusing sandbox/.dist)' : ' (building the frontend first)'}`);
  child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (d) => { childOutput += d; });
  child.stderr.on('data', (d) => { childOutput += d; });
  let exited = null;
  child.on('exit', (code) => { exited = code ?? 1; });
  const deadline = Date.now() + 240_000;
  while (!(await alive())) {
    if (exited !== null || Date.now() > deadline) {
      console.error(`FAIL - the sandbox server did not come up${exited !== null ? ` (exit ${exited})` : ' in time'}\n${childOutput}`);
      child.kill();
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}
const stop = () => { if (child) child.kill('SIGTERM'); };
process.on('exit', stop);

// ---- helpers ----
async function http(method, pathname, { token, body, raw } = {}) {
  const headers = { Accept: 'application/json', 'X-App-Id': APP };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base}${pathname}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await res.text();
  let data = text;
  if (!raw) { try { data = JSON.parse(text); } catch { /* not JSON */ } }
  return { status: res.status, data, headers: res.headers };
}
const api = (method, rest, opts) => http(method, `/api/apps/${APP}/${rest}`, opts);
const fn = (name, token, body = {}) => api('POST', `functions/${name}`, { token, body });
const entity = (name, token, query = '') => api('GET', `entities/${name}${query}`, { token });
const info = async () => (await http('GET', '/__sandbox/info')).data;
const stable = (i) => ({ users: i.users, groups: i.groups, counts: i.counts, urls: i.urls });

let passed = 0;
let failed = 0;
async function check(label, run) {
  try {
    await run();
    passed += 1;
    console.log(`ok   - ${label}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL - ${label}\n       ${String(error?.message || error).split('\n').join('\n       ')}`);
  }
}
const byOrder = (rows) => [...rows].sort((a, b) => (a.bid_order ?? 0) - (b.bid_order ?? 0));
// What src/lib/scoring.js says a round is worth, in the same seat order as `results`.
function expectedFor(results, scoringMethod, tricksById = null, renegesById = {}, bidsById = null) {
  const seats = byOrder(results);
  return scoreRound({
    players: seats.map((r) => ({
      player_id: r.player_id,
      bid: bidsById ? bidsById[r.player_id] : r.bid,
      tricks_won: tricksById ? tricksById[r.player_id] : r.tricks_won,
      reneged: tricksById ? !!renegesById[r.player_id] : !!r.reneged,
    })),
    scoringMethod,
  });
}
function assertScored(results, expected) {
  for (const want of expected.results) {
    const got = results.find((r) => r.player_id === want.player_id);
    assert.equal(got.points, want.points, `${got.player_name}: bid ${want.bid}, took ${want.tricks_won}${want.reneged ? ', reneged' : ''}`);
    assert.equal(got.tricks_won, want.tricks_won);
  }
}

// ---- start from the seeded state ----
if (!child) await http('POST', '/__sandbox/reset');
const initial = await info();
const user = (email) => initial.users.find((u) => u.email === email);
const maya = user('maya@example.com');
const dan = user('dan@example.com');
const newbie = user('newbie@example.com');
const root = user('root@example.com');
const google = user('gal.google@example.com');
const thursday = initial.groups.find((g) => g.name === 'Thursday Whist');
const family = initial.groups.find((g) => g.name === 'Family Table');
const member = (name) => thursday.members.find((m) => m.player_name === name);
const ENTITIES = Object.keys(initial.counts);
let groupData = null;
let openSession = null;
let roundInPlay = null;

// ---- 1. the frontend is served ----
await check('static: / serves the built app, with its script and stylesheet', async () => {
  const page = await http('GET', '/', { raw: true });
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.match(page.data, /<div id="root"><\/div>/);
  assert.ok(!page.data.includes('base44.com'), 'index.html still points at base44.com');
  const script = page.data.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
  const css = page.data.match(/href="(\/assets\/[^"]+\.css)"/)?.[1];
  assert.ok(script && css, 'no /assets script or stylesheet in index.html');
  const js = await http('GET', script, { raw: true });
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /javascript/);
  assert.ok(js.data.length > 100_000, 'the bundle looks too small');
  assert.ok(!js.data.includes('whist-mate-pro'), 'the bundle mentions the live app');
  assert.equal((await http('GET', css, { raw: true })).status, 200);
});
await check('static: app routes fall back to index.html, missing files are 404', async () => {
  for (const route of ['/session/abc', '/join?code=XXXXXX', '/login', '/player/x/y']) {
    const page = await http('GET', route, { raw: true });
    assert.equal(page.status, 200, route);
    assert.match(page.data, /<div id="root">/, route);
  }
  assert.equal((await http('GET', '/assets/nope.js', { raw: true })).status, 404);
  assert.equal((await http('GET', '/favicon.png', { raw: true })).status, 404);
  assert.equal((await http('GET', '/manifest.json')).status, 200);
});

// ---- 2. signed out ----
await check('signed out: public settings say the app is public, `me` is 401', async () => {
  const settings = await http('GET', `/api/apps/public/prod/public-settings/by-id/${APP}`);
  assert.deepEqual(settings.data, { id: APP, public_settings: 'public_without_login' });
  assert.equal((await api('GET', 'entities/User/me')).status, 401);
  assert.equal((await api('GET', 'entities/User/me', { token: 'sbx-nobody' })).status, 401);
  assert.equal((await api('GET', 'entities/User/me', { token: 'not-a-sandbox-token' })).status, 401);
});
await check('signed out: every entity list / filter returns no rows, get is 404', async () => {
  for (const name of ENTITIES) {
    const list = await entity(name, null);
    assert.equal(list.status, 200, name);
    assert.deepEqual(list.data, [], `${name} list leaked rows`);
    const filtered = await entity(name, null, `?q=${encodeURIComponent(JSON.stringify({ group_id: thursday.id }))}&sort=-created_date&limit=50`);
    assert.deepEqual(filtered.data, [], `${name} filter leaked rows`);
  }
  assert.equal((await entity(`Group/${thursday.id}`, null)).status, 404);
  assert.equal((await entity(`GroupMember/${member('Dan').id}`, null)).status, 404);
  assert.equal((await entity(`User/${maya.id}`, null)).status, 404);
});
await check('signed out: functions answer 401 and carry no data', async () => {
  for (const [name, body] of [['getMyGroups', {}], ['getGroupData', { scope: 'group', group_id: thursday.id }], ['getGroupMembers', { group_id: thursday.id }], ['askRules', { question: 'hi' }]]) {
    const res = await fn(name, null, body);
    assert.equal(res.status, 401, name);
    assert.ok(!JSON.stringify(res.data).includes('Maya'), name);
  }
});

// ---- 3. signing in ----
let mayaToken = null;
await check('login: the form credentials return a token that works', async () => {
  const wrong = await api('POST', 'auth/login', { body: { email: 'maya@example.com', password: 'nope' } });
  assert.ok(wrong.status >= 400 && wrong.status < 500 && !wrong.data.access_token, 'a wrong password was accepted');
  const res = await api('POST', 'auth/login', { body: { email: 'Maya@Example.com', password: PASSWORD } });
  assert.equal(res.status, 200);
  assert.equal(res.data.access_token, `sbx-${res.data.user.id}`);
  assert.equal(res.data.access_token, maya.token);
  assert.equal(res.data.user.email, 'maya@example.com');
  mayaToken = res.data.access_token;
  const me = await api('GET', 'entities/User/me', { token: mayaToken });
  assert.equal(me.status, 200);
  assert.equal(me.data.email, 'maya@example.com');
  assert.equal(me.data.role, 'user');
  assert.ok(!('password' in me.data));
});
await check('login: every seeded user signs in with whist123; root is the app admin', async () => {
  for (const u of initial.users) {
    const res = await api('POST', 'auth/login', { body: { email: u.email, password: PASSWORD } });
    assert.equal(res.status, 200, u.email);
    assert.equal(res.data.access_token, u.token, u.email);
  }
  assert.equal(root.role, 'admin');
  assert.deepEqual(initial.users.filter((u) => u.role === 'admin').map((u) => u.email), ['root@example.com']);
});
await check('"Continue with Google" comes straight back with ?access_token= for the canned account', async () => {
  const res = await http('GET', `/api/apps/auth/login?app_id=${APP}&from_url=${encodeURIComponent(`${base}/home`)}`);
  assert.equal(res.status, 302);
  const back = new URL(res.headers.get('location'));
  assert.equal(back.origin, base);
  assert.equal(back.pathname, '/home');
  assert.equal(back.searchParams.get('access_token'), google.token);
  const elsewhere = await http('GET', `/api/apps/auth/logout?from_url=${encodeURIComponent('https://example.org/')}`);
  assert.equal(new URL(elsewhere.headers.get('location')).origin, base, 'logout redirected off the sandbox');
});

// ---- 4. what a member sees ----
await check('getMyGroups (Maya): Thursday Whist as admin, Family Table as player', async () => {
  const res = await fn('getMyGroups', mayaToken);
  assert.equal(res.status, 200);
  assert.deepEqual(res.data.groups.map((g) => [g.group_name, g.role, g.player_name]), [['Thursday Whist', 'admin', 'Maya'], ['Family Table', 'player', 'Maya']]);
  assert.equal(res.data.groups[0].group.invite_code, thursday.invite_code);
});
await check('getGroupData group (Maya): about 14 closed sessions, 160 scored rounds, one open session', async () => {
  const res = await fn('getGroupData', mayaToken, { scope: 'group', group_id: thursday.id });
  assert.equal(res.status, 200);
  groupData = res.data;
  const { sessions, rounds, results } = groupData;
  assert.equal(sessions.length, thursday.sessions);
  assert.equal(rounds.length, thursday.rounds);
  assert.equal(results.length, rounds.length * 4);
  assert.ok(results.length > 500, 'expected more rows than one 500-row page');
  for (const row of [...sessions, ...rounds, ...results]) assert.equal(row.group_id, thursday.id);
  assert.equal(sessions.filter((s) => s.status === 'closed').length, 14);
  const open = sessions.filter((s) => s.status === 'open');
  assert.equal(open.length, 1);
  openSession = open[0];
  const seeded = new Date(initial.seeded_at); // "today" for the sandbox = the day it was started
  const seededDay = `${seeded.getFullYear()}-${String(seeded.getMonth() + 1).padStart(2, '0')}-${String(seeded.getDate()).padStart(2, '0')}`;
  assert.equal(openSession.session_date, seededDay);
  const scored = rounds.filter((r) => r.status === 'complete' || r.status === 'cancelled');
  assert.ok(scored.length >= 155 && scored.length <= 170, `${scored.length} scored rounds`);
  const oldest = Math.min(...sessions.map((s) => Date.parse(s.created_date)));
  const months = (Date.now() - oldest) / (30 * 86_400_000);
  assert.ok(months > 4 && months < 6, `history spans ${months.toFixed(1)} months`);
});
await check('seeded rounds obey the rules: bids never total 13, tricks total 13, points match src/lib/scoring.js', async () => {
  const { sessions, rounds, results } = groupData;
  const sessionById = Object.fromEntries(sessions.map((s) => [s.id, s]));
  let scoredRounds = 0;
  for (const round of rounds) {
    const rows = byOrder(results.filter((r) => r.game_id === round.id));
    assert.equal(rows.length, 4, `round ${round.id}`);
    const bidTotal = rows.reduce((s, r) => s + r.bid, 0);
    assert.notEqual(bidTotal, 13, `round ${round.id} bids total 13`);
    assert.equal(round.total_bids, bidTotal);
    assert.equal(round.table_state, bidTotal >= 14 ? 'up' : 'down');
    if (round.status === 'playing') { assert.ok(rows.every((r) => r.tricks_won == null && r.points == null)); continue; }
    assert.equal(rows.reduce((s, r) => s + r.tricks_won, 0), 13, `round ${round.id} tricks`);
    const expected = expectedFor(rows, sessionById[round.session_id].scoring_method);
    assertScored(rows, expected);
    assert.equal(round.everyone_falls, expected.everyoneFalls);
    assert.equal(round.status, expected.everyoneFalls ? 'cancelled' : 'complete');
    scoredRounds += 1;
  }
  assert.ok(scoredRounds >= 160);
});
await check('seeded variety: both scoring methods, advanced rules, trump, zero bids, reneges, everyone-falls, a reached game limit, Hebrew', async () => {
  const { sessions, rounds, results } = groupData;
  const count = (rows, test) => rows.filter(test).length;
  assert.ok(count(sessions, (s) => s.scoring_method === 'classic') >= 5 && count(sessions, (s) => s.scoring_method === 'progressive') >= 4);
  const advanced = sessions.filter((s) => s.advanced_rules_enabled);
  assert.equal(advanced.length, 2);
  for (const s of advanced) assert.ok(rounds.filter((r) => r.session_id === s.id).every((r) => r.trump_suit && r.hierarchy && r.highest_bidder_player_id));
  const ordinaryIds = new Set(sessions.filter((s) => !s.advanced_rules_enabled).map((s) => s.id));
  assert.ok(count(rounds, (r) => ordinaryIds.has(r.session_id) && r.trump_suit && !r.hierarchy) >= 10, 'trump records in ordinary sessions');
  assert.equal(count(rounds, (r) => r.everyone_falls && r.status === 'cancelled'), 4);
  assert.equal(count(results, (r) => r.reneged), 3);
  assert.ok(count(results, (r) => r.bid === 0 && r.tricks_won === 0) >= 3, 'zero bids made');
  assert.ok(count(results, (r) => r.bid === 0 && r.tricks_won > 0) >= 2, 'zero bids failed');
  assert.ok(results.some((r) => r.bid === 0 && r.points === 50) && results.some((r) => r.bid === 0 && r.points === 25), 'zero bids made on both a DOWN and an UP table');
  const limited = sessions.filter((s) => s.game_limit != null);
  assert.equal(limited.length, 1);
  assert.equal(count(rounds, (r) => r.session_id === limited[0].id && r.status === 'complete'), limited[0].game_limit);
  assert.ok(sessions.some((s) => s.location === 'אצל מאיה') && sessions.some((s) => /[֐-׿]/.test(s.name)));
  const foursomes = new Set(rounds.map((r) => results.filter((x) => x.game_id === r.id).map((x) => x.player_name).sort().join('+')));
  assert.ok(foursomes.size >= 10, `only ${foursomes.size} different foursomes`);
  assert.deepEqual(thursday.members.filter((m) => !m.claimed).map((m) => m.player_name).sort(), ['אבי', 'יוסי']);
  assert.equal(thursday.members.length, 7);
});
await check('getGroupData session + round (Maya): the open session has 3 scored rounds and a 4th in play', async () => {
  const session = await fn('getGroupData', mayaToken, { scope: 'session', session_id: openSession.id });
  assert.equal(session.status, 200);
  assert.equal(session.data.session.status, 'open');
  assert.equal(session.data.rounds.length, 4);
  assert.equal(session.data.results.length, 16);
  assert.deepEqual(session.data.rounds.map((r) => r.status).sort(), ['complete', 'complete', 'complete', 'playing']);
  roundInPlay = session.data.rounds.find((r) => r.status === 'playing');
  assert.ok(initial.urls.round_in_play.includes(roundInPlay.id) && initial.urls.open_session.includes(openSession.id));
  const round = await fn('getGroupData', mayaToken, { scope: 'round', round_id: roundInPlay.id });
  assert.equal(round.status, 200);
  assert.equal(round.data.round.id, roundInPlay.id);
  assert.equal(round.data.session.id, openSession.id);
  assert.equal(round.data.results.length, 4);
  assert.ok(round.data.results.every((r) => Number.isInteger(r.bid) && r.tricks_won == null && r.points == null));
});
await check('getGroupData player + stats + roster (Maya)', async () => {
  const player = await fn('getGroupData', mayaToken, { scope: 'player', player_id: member('Dan').id });
  assert.equal(player.status, 200);
  assert.deepEqual(player.data.player, { id: member('Dan').id, name: 'Dan', group_id: thursday.id });
  // The whole round history comes back (it used to stop at 50 rows without saying so): Dan has
  // fewer than the 200-row limit, and the response says how many there are.
  const dansRounds = groupData.results.filter((r) => r.player_id === member('Dan').id && r.points != null).length;
  assert.ok(dansRounds > 50 && dansRounds < 200, `Dan has ${dansRounds} scored rounds`);
  assert.equal(player.data.results.length, dansRounds);
  assert.equal(player.data.total_rows, dansRounds);
  assert.ok(player.data.results.every((r) => r.player_id === member('Dan').id && r.points != null));
  assert.ok(player.data.results.every((r) => player.data.sessions[r.session_id]?.name), 'a round-history row without its session');
  const stats = await fn('computePlayerStats', mayaToken, { player_id: member('Dan').id, group_id: thursday.id });
  assert.equal(stats.status, 200);
  assert.equal(stats.data.performance.rounds_played, dansRounds);
  // A win is a closed session finished first: the open session is in Dan's list, not in his record.
  const dansNights = stats.data.sessions;
  assert.equal(dansNights[0].session_id, openSession.id);
  assert.equal(dansNights[0].status, 'open');
  assert.equal(stats.data.performance.sessions_played, dansNights.filter((n) => n.status === 'closed').length);
  assert.equal(stats.data.performance.wins, dansNights.filter((n) => n.status === 'closed' && n.rank === 1).length);
  const roster = await fn('getGroupMembers', mayaToken, { group_id: thursday.id });
  assert.equal(roster.data.my_role, 'admin');
  assert.equal(roster.data.members.length, 7);
  assert.equal(roster.data.members.find((m) => m.player_name === 'Dan').email, 'dan@example.com'); // admins see emails
  const asDan = await fn('getGroupMembers', dan.token, { group_id: thursday.id });
  assert.equal(asDan.data.my_role, 'player');
  assert.ok(asDan.data.members.every((m) => !('email' in m)), 'a non-admin received emails');
});
await check('table talk: about 8 notes in Thursday Whist, anonymous ones carry no author, some pinned to a session', async () => {
  const feed = await fn('getActivityFeed', mayaToken, {});
  assert.equal(feed.status, 200);
  const notes = feed.data.notes.filter((n) => n.group_id === thursday.id);
  assert.ok(notes.length >= 8 && notes.length <= 10, `${notes.length} notes`);
  assert.ok(notes.filter((n) => n.is_anonymous).length >= 2 && notes.filter((n) => n.is_anonymous).every((n) => n.author_name === null));
  assert.ok(notes.filter((n) => n.game_name).length >= 4);
  assert.ok(feed.data.notes.some((n) => n.group_id === family.id));
});

// ---- 5. who is refused ----
await check('a signed-in non-member (newbie) is refused 403 on every read of the group', async () => {
  assert.deepEqual((await fn('getMyGroups', newbie.token)).data.groups, []);
  const reads = [
    ['getGroupData', { scope: 'group', group_id: thursday.id }],
    ['getGroupData', { scope: 'session', session_id: openSession.id }],
    ['getGroupData', { scope: 'round', round_id: roundInPlay.id }],
    ['getGroupData', { scope: 'player', player_id: member('Dan').id }],
    ['getGroupData', { scope: 'shared_sessions', player_id: member('Dan').id }],
    ['getPlayerNotes', { player_id: member('Dan').id }],
    ['getGroupMembers', { group_id: thursday.id }],
    ['computePlayerStats', { player_id: member('Dan').id }],
  ];
  for (const [name, body] of reads) {
    const res = await fn(name, newbie.token, body);
    assert.equal(res.status, 403, `${name} ${JSON.stringify(body)}`);
    assert.ok(!/Dan|Maya|session_date/.test(JSON.stringify(res.data)), `${name} leaked data`);
  }
  assert.equal((await fn('startRound', newbie.token, { session_id: openSession.id, player_ids: thursday.members.slice(0, 4).map((m) => m.id) })).status, 403);
});
await check('roles: a player cannot do admin things; an archived or deleted group is closed', async () => {
  assert.equal((await fn('addGhostMember', dan.token, { group_id: thursday.id, player_name: 'Intruder' })).status, 403);
  assert.equal((await fn('listAllGroupsWithStats', mayaToken)).status, 403);
  const all = await fn('listAllGroupsWithStats', root.token);
  assert.equal(all.status, 200);
  assert.deepEqual(all.data.groups.map((g) => `${g.name}:${g.status}`).sort(), ['Family Table:active', 'Office League:deleted', 'Old Crew:archived', 'Thursday Whist:active']);
  const oldCrew = initial.groups.find((g) => g.name === 'Old Crew');
  const office = initial.groups.find((g) => g.name === 'Office League');
  assert.equal(oldCrew.sessions, 2);
  assert.equal((await fn('startSession', dan.token, { group_id: oldCrew.id })).status, 403); // archived = read-only
  assert.equal((await fn('getGroupData', dan.token, { scope: 'group', group_id: oldCrew.id })).status, 200);
  assert.equal((await fn('getGroupData', user('rachel@example.com').token, { scope: 'group', group_id: office.id })).status, 404); // soft-deleted
  assert.equal((await fn('previewGroupByCode', newbie.token, { invite_code: oldCrew.invite_code })).status, 403);
  assert.equal(family.sessions, 3);
  assert.equal(family.open_sessions, 0);
  assert.equal(family.scoring_method_default, 'progressive');
  assert.equal(family.members.length, 4);
});
await check('entity endpoints honour the rls blocks for signed-in users', async () => {
  const mine = await entity('GroupMember', mayaToken, `?q=${encodeURIComponent(JSON.stringify({ user_id: maya.id }))}`);
  assert.equal(mine.data.length, 2);
  const everyone = await entity('GroupMember', mayaToken); // rule: data.user_id == me — nobody else, app admins included
  assert.ok(everyone.data.length === 2 && everyone.data.every((m) => m.user_id === maya.id), 'Maya saw other people\'s membership rows');
  for (const name of ['Group', 'Session', 'Game', 'RoundResult', 'TableTalkNote']) {
    // Data entities are closed to every browser caller (rls false) — the app admin too.
    assert.deepEqual((await entity(name, mayaToken)).data, [], `${name} must be closed to a member`);
    assert.deepEqual((await entity(name, root.token)).data, [], `${name} must be closed to the app admin`);
  }
  assert.equal((await entity(`Session/${openSession.id}`, mayaToken)).status, 404);
  assert.equal((await entity(`Session/${openSession.id}`, root.token)).status, 404);
  assert.deepEqual((await entity('User', mayaToken)).data.map((u) => u.email), ['maya@example.com']);
  assert.equal((await entity('User', root.token)).data.length, initial.counts.User);
  assert.equal((await api('POST', 'entities/Session', { token: mayaToken, body: { group_id: thursday.id, status: 'open' } })).status, 403);
  assert.equal((await api('DELETE', `entities/GroupMember/${member('Dan').id}`, { token: mayaToken })).status, 403);
  assert.equal((await api('PUT', `entities/Group/${thursday.id}`, { token: dan.token, body: { name: 'Hacked' } })).status, 403);
  assert.equal((await api('PUT', `entities/Group/${thursday.id}`, { body: { name: 'Hacked' } })).status, 403);
  // Not even the group's creator may write the row directly: updates go through functions.
  assert.equal((await api('PUT', `entities/Group/${thursday.id}`, { token: mayaToken, body: { description: 'Edited directly.' } })).status, 403);
  assert.equal((await api('PUT', `entities/Group/${thursday.id}`, { token: root.token, body: { description: 'Edited directly.' } })).status, 403);
  assert.equal((await api('PUT', `entities/User/${maya.id}`, { token: mayaToken, body: { role: 'admin' } })).status, 403);
  await api('PUT', 'entities/User/me', { token: mayaToken, body: { role: 'admin', nickname: 'M' } });
  const me = (await api('GET', 'entities/User/me', { token: mayaToken })).data;
  assert.equal(me.role, 'user');
  assert.equal(me.nickname, 'M');
});

// ---- 6. a full round through the function endpoints ----
await check('finish the round in play: saveRoundResults scores it like src/lib/scoring.js', async () => {
  const before = (await fn('getGroupData', mayaToken, { scope: 'round', round_id: roundInPlay.id })).data.results;
  const seats = byOrder(before);
  const tricks = Object.fromEntries(seats.map((r, i) => [r.player_id, [4, 2, 2, 5][i]]));
  const saved = await fn('saveRoundResults', mayaToken, { game_id: roundInPlay.id, tricks, reneges: {} });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  const after = (await fn('getGroupData', mayaToken, { scope: 'round', round_id: roundInPlay.id })).data;
  const expected = expectedFor(before, openSession.scoring_method, tricks);
  assertScored(after.results, expected);
  assert.equal(after.round.status, 'complete');
  assert.equal(saved.data.everyone_falls, expected.everyoneFalls);
});
let played = null;
await check('play a full round: startRound -> submitBids -> saveRoundResults, with a zero bid and a renege', async () => {
  const seatIds = ['Maya', 'Dan', 'נועה', 'אבי'].map((name) => member(name).id);
  const started = await fn('startRound', mayaToken, { session_id: openSession.id, player_ids: seatIds });
  assert.equal(started.status, 200, JSON.stringify(started.data));
  const round = started.data.round;
  assert.equal(round.status, 'bidding');
  assert.equal(round.round_number, 5);
  assert.deepEqual(byOrder(started.data.results).map((r) => r.player_id), seatIds);
  assert.equal((await fn('startRound', mayaToken, { session_id: openSession.id, player_ids: seatIds })).status, 409); // one round at a time
  assert.equal((await fn('saveRoundResults', mayaToken, { game_id: round.id, tricks: {} })).status, 409); // bids first

  const bidsOf = (values) => Object.fromEntries(seatIds.map((id, i) => [id, values[i]]));
  const thirteen = await fn('submitBids', mayaToken, { game_id: round.id, bids: bidsOf([4, 4, 3, 2]) });
  assert.equal(thirteen.status, 400, 'bids totalling 13 must be refused');
  const bids = bidsOf([0, 5, 4, 3]);
  const locked = await fn('submitBids', mayaToken, { game_id: round.id, bids, trump_suit: 'diamonds', trump_owner_player_id: seatIds[1] });
  assert.equal(locked.status, 200, JSON.stringify(locked.data));
  assert.equal(locked.data.round.status, 'playing');
  assert.equal(locked.data.round.total_bids, 12);
  assert.equal(locked.data.round.table_state, 'down');
  assert.equal(locked.data.round.trump_suit, 'diamonds');
  assert.equal(locked.data.round.highest_bidder_player_id, seatIds[1]);

  const tricksOf = bidsOf;
  assert.equal((await fn('saveRoundResults', mayaToken, { game_id: round.id, tricks: tricksOf([0, 6, 4, 4]) })).status, 400, 'tricks totalling 14 must be refused');
  const tricks = tricksOf([0, 6, 4, 3]);
  const reneges = { [seatIds[3]]: true };
  const saved = await fn('saveRoundResults', mayaToken, { game_id: round.id, tricks, reneges });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));

  const after = (await fn('getGroupData', mayaToken, { scope: 'round', round_id: round.id })).data;
  const expected = expectedFor(after.results, openSession.scoring_method, tricks, reneges, bids);
  assertScored(after.results, expected);
  assert.deepEqual(byOrder(after.results).map((r) => r.points), [50, -10, 26, 19 - 100]); // spelled out: 0 made on a DOWN table, miss by 1, made 4, made 3 + renege
  assert.equal(after.round.status, 'complete');
  assert.equal(after.round.everyone_falls, false);
  assert.equal((await fn('saveRoundResults', mayaToken, { game_id: round.id, tricks })).status, 409); // already scored
  played = { seatIds, bidsOf };
});
await check('play an "everyone falls" round: cancelled, all contract points zeroed', async () => {
  const { seatIds, bidsOf } = played;
  const round = (await fn('startRound', mayaToken, { session_id: openSession.id, player_ids: seatIds })).data.round;
  const bids = bidsOf([3, 4, 2, 5]);
  const tricks = bidsOf([4, 3, 3, 3]);
  assert.equal((await fn('submitBids', mayaToken, { game_id: round.id, bids })).data.round.table_state, 'up');
  const saved = await fn('saveRoundResults', mayaToken, { game_id: round.id, tricks });
  assert.equal(saved.data.everyone_falls, true);
  const after = (await fn('getGroupData', mayaToken, { scope: 'round', round_id: round.id })).data;
  assertScored(after.results, expectedFor(after.results, openSession.scoring_method, tricks, {}, bids));
  assert.ok(after.results.every((r) => r.points === 0));
  assert.equal(after.round.status, 'cancelled');
  const session = (await fn('getGroupData', mayaToken, { scope: 'session', session_id: openSession.id })).data;
  assert.equal(session.rounds.length, 6);
  assert.equal((await fn('closeSession', mayaToken, { session_id: openSession.id })).data.session.status, 'closed');
  assert.equal((await fn('startRound', mayaToken, { session_id: openSession.id, player_ids: seatIds })).status, 403); // closed
});

// ---- 7. joining with an invite code ----
await check('join by invite code, claiming an unclaimed player (history comes along)', async () => {
  const preview = await fn('previewGroupByCode', newbie.token, { invite_code: thursday.invite_code.toLowerCase() });
  assert.equal(preview.status, 200, JSON.stringify(preview.data));
  assert.equal(preview.data.group.name, 'Thursday Whist');
  assert.equal(preview.data.already_member, false);
  assert.deepEqual(preview.data.unclaimed_players.map((p) => p.player_name).sort(), ['אבי', 'יוסי']);
  const target = preview.data.unclaimed_players.find((p) => p.player_name === 'יוסי');
  assert.equal(target.id, member('יוסי').id);
  const historyBefore = groupData.results.filter((r) => r.player_id === target.id && r.points != null).length;
  assert.ok(historyBefore > 20);

  const joined = await fn('joinGroupByCode', newbie.token, { invite_code: thursday.invite_code, claim_member_id: target.id });
  assert.equal(joined.status, 200, JSON.stringify(joined.data));
  assert.equal(joined.data.member.id, target.id);
  assert.equal(joined.data.member.user_id, newbie.id);
  assert.equal(joined.data.member.claimed, true);
  const groups = (await fn('getMyGroups', newbie.token)).data.groups;
  assert.deepEqual(groups.map((g) => [g.group_name, g.role, g.player_name, g.member_id]), [['Thursday Whist', 'player', 'יוסי', target.id]]);
  const stats = await fn('computePlayerStats', newbie.token, { player_id: target.id });
  assert.equal(stats.status, 200);
  assert.ok(stats.data.performance.rounds_played >= historyBefore);
  assert.equal((await fn('getGroupData', newbie.token, { scope: 'group', group_id: thursday.id })).status, 200);
  assert.equal((await fn('joinGroupByCode', google.token, { invite_code: thursday.invite_code, claim_member_id: target.id })).status, 409); // already taken
  assert.equal((await fn('joinGroupByCode', newbie.token, { invite_code: 'ZZZZZZ' })).status, 404);
});

// ---- 8. signing up ----
await check('register + verify-otp creates a usable account (any six digits)', async () => {
  const email = 'smoke.tester@example.com';
  const password = 'smoke-test-1';
  assert.equal((await api('POST', 'auth/register', { body: { email: 'maya@example.com', password } })).status, 400); // taken
  const reg = await api('POST', 'auth/register', { body: { email, password } });
  assert.equal(reg.status, 200, JSON.stringify(reg.data));
  assert.ok((await api('POST', 'auth/login', { body: { email, password } })).status >= 400, 'signed in before verifying');
  assert.equal((await api('POST', 'auth/resend-otp', { body: { email } })).status, 200);
  assert.equal((await api('POST', 'auth/verify-otp', { body: { email, otp_code: '12345' } })).status, 400);
  const verified = await api('POST', 'auth/verify-otp', { body: { email, otp_code: '424242' } });
  assert.equal(verified.status, 200, JSON.stringify(verified.data));
  const token = verified.data.access_token;
  assert.match(token, /^sbx-[0-9a-f]{24}$/);
  const me = await api('GET', 'entities/User/me', { token });
  assert.equal(me.data.email, email);
  assert.equal(me.data.role, 'user');
  assert.deepEqual((await fn('getMyGroups', token)).data.groups, []);
  assert.equal((await api('POST', 'auth/login', { body: { email, password } })).data.access_token, token);
  const created = await fn('createGroup', token, { name: 'Smoke Table', player_name: 'Smoke' });
  assert.equal(created.status, 200);
  assert.match(created.data.group.invite_code, /^[A-Z0-9]{6}$/);
  assert.equal((await info()).counts.User, initial.counts.User + 1);
});
await check('password reset: the link lands in the simulated outbox and works', async () => {
  assert.equal((await api('POST', 'auth/reset-password-request', { body: { email: 'dan@example.com' } })).status, 200);
  assert.equal((await api('POST', 'auth/reset-password-request', { body: { email: 'nobody@example.com' } })).status, 200);
  const outbox = (await http('GET', '/__sandbox/outbox')).data;
  const link = outbox.filter((m) => m.to === 'dan@example.com' && m.link).pop().link;
  const token = new URL(link).searchParams.get('token');
  assert.equal(new URL(link).pathname, '/reset-password');
  assert.equal((await api('POST', 'auth/reset-password', { body: { reset_token: 'rst-wrong', new_password: 'new-password-1' } })).status, 400);
  assert.equal((await api('POST', 'auth/reset-password', { body: { reset_token: token, new_password: 'new-password-1' } })).status, 200);
  assert.ok((await api('POST', 'auth/login', { body: { email: 'dan@example.com', password: PASSWORD } })).status >= 400);
  assert.equal((await api('POST', 'auth/login', { body: { email: 'dan@example.com', password: 'new-password-1' } })).status, 200);
});

// ---- 9. the simulated parts ----
await check('rules assistant is simulated: rulebook passages for rule questions, the exact IDK line otherwise', async () => {
  const progressive = await fn('askRules', mayaToken, { question: 'What is progressive scoring?', history: [] });
  assert.equal(progressive.status, 200);
  assert.match(progressive.data.answer, /per trick missed grows/i);
  const zero = await fn('askRules', mayaToken, { question: 'How does scoring work if I bid 0?', history: [{ role: 'user', text: 'hi' }] });
  assert.match(zero.data.answer, /\+50/);
  const offTopic = await fn('askRules', mayaToken, { question: 'What is the capital of France?' });
  assert.equal(offTopic.data.answer, IDK);
});
await check('realtime: the socket.io endpoint completes its handshake and then stays quiet', async () => {
  if (typeof WebSocket !== 'function') return; // Node < 22 has no built-in client; the server side is unchanged
  const messages = await new Promise((resolve, reject) => {
    const seen = [];
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws-user-apps/socket.io/?app_id=${APP}&EIO=4&transport=websocket`);
    const timer = setTimeout(() => { ws.close(); resolve(seen); }, 700);
    ws.onmessage = (event) => { seen.push(String(event.data)); if (seen.length === 1) ws.send('40'); };
    ws.onerror = () => { clearTimeout(timer); reject(new Error('the websocket handshake failed')); };
  });
  assert.equal(messages.length, 2, `got ${JSON.stringify(messages)}`);
  assert.match(messages[0], /^0\{.*"pingInterval"/);
  assert.match(messages[1], /^40\{"sid"/);
});
await check('analytics and page-view logging are accepted and dropped', async () => {
  assert.equal((await api('POST', 'analytics/track/batch', { body: { events: [] } })).status, 200);
  assert.equal((await http('POST', `/api/app-logs/${APP}/log-user-in-app/home`)).status, 200);
  assert.equal((await http('GET', '/api/apps/sandbox/nonsense')).status, 404);
});

// ---- 10. reset ----
await check('POST /__sandbox/reset restores the identical initial state', async () => {
  const dirty = await info();
  assert.notDeepEqual(dirty.counts, initial.counts);
  const reset = await http('POST', '/__sandbox/reset');
  assert.equal(reset.status, 200);
  assert.deepEqual(reset.data.counts, initial.counts);
  const again = await info();
  assert.deepEqual(stable(again), stable(initial)); // same users, tokens, ids, invite codes, members, URLs
  assert.equal(again.seeded_at, initial.seeded_at);
  assert.ok((await api('POST', 'auth/login', { body: { email: 'smoke.tester@example.com', password: 'smoke-test-1' } })).status >= 400);
  assert.equal((await api('POST', 'auth/login', { body: { email: 'dan@example.com', password: PASSWORD } })).status, 200);
  assert.deepEqual((await fn('getMyGroups', newbie.token)).data.groups, []);
  const fresh = (await fn('getGroupData', maya.token, { scope: 'group', group_id: thursday.id })).data;
  const sorted = (rows) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(sorted(fresh.results), sorted(groupData.results)); // every bid, trick, score and date, row for row
  assert.deepEqual(sorted(fresh.rounds), sorted(groupData.rounds));
  assert.deepEqual(sorted(fresh.sessions), sorted(groupData.sessions));
  assert.equal((await http('GET', '/__sandbox/outbox')).data.length, 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
stop();
process.exit(failed === 0 ? 0 : 1);
