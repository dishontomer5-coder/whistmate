// Dependency-free standings tests. Run:  node src/lib/standings.test.mjs
import assert from 'node:assert/strict';
import { buildStandings, computeAwardLeaders } from './standings.js';

let pass = 0, fail = 0;
function t(label, fn) {
  try { fn(); pass++; } catch (e) { fail++; console.error(`FAIL: ${label}\n      ${e.message}`); }
}

// One result row. Names are denormalized on the row, like RoundResult.player_name.
const NAMES = { a: 'Maya', b: 'Dan', c: 'Noa', d: 'Omer', e: 'Rachel' };
const row = (session_id, player_id, points, extra = {}) => ({
  session_id, player_id, player_name: NAMES[player_id], points, bid: 3, tricks_won: 3, ...extra,
});
const pick = (table, field) => Object.fromEntries(table.map((p) => [p.player_id, p[field]]));

// Two closed nights and one still open. Totals: a 30-20+50 = 60, b 10+40+10 = 60,
// c 5+10+10 = 25, d 0+0-5 = -5.
const ROWS = [
  row('s1', 'a', 30), row('s1', 'b', 10), row('s1', 'c', 5), row('s1', 'd', 0),
  row('s2', 'a', -20), row('s2', 'b', 40), row('s2', 'c', 10), row('s2', 'd', 0),
  row('s3', 'a', 50), row('s3', 'b', 10), row('s3', 'c', 10), row('s3', 'd', -5),
  row('s3', 'a', null, { bid: 4, tricks_won: null }), // a round in play: not scored yet
];
const sessions = (s3Status = 'open') => [
  { id: 's1', name: 'Opener', session_date: '2026-05-07', status: 'closed', created_date: '2026-05-07T18:00:00Z' },
  { id: 's2', name: 'Rematch', session_date: '2026-05-14', status: 'closed', created_date: '2026-05-14T18:00:00Z' },
  { id: 's3', name: 'Tonight', session_date: '2026-05-21', status: s3Status, created_date: '2026-05-21T18:00:00Z' },
];

t('totals, averages and round counts include the open session’s scored rounds', () => {
  const table = buildStandings(ROWS, {}, { sessions: sessions('open') });
  assert.deepEqual(pick(table, 'total_score'), { a: 60, b: 60, c: 25, d: -5 });
  assert.deepEqual(pick(table, 'rounds_played'), { a: 3, b: 3, c: 3, d: 3 });
  assert.deepEqual(pick(table, 'avg_score'), { a: 20, b: 20, c: 8.33, d: -1.67 });
  assert.deepEqual(table.map((p) => p.player_name), ['Dan', 'Maya', 'Noa', 'Omer']); // best total first, level ones by name
});

t('an open session never yields a win or a podium — the top player is leading', () => {
  const table = buildStandings(ROWS, {}, { sessions: sessions('open') });
  assert.deepEqual(pick(table, 'wins'), { a: 1, b: 1, c: 0, d: 0 });            // s1 -> a, s2 -> b; tonight -> nobody
  assert.deepEqual(pick(table, 'podiums'), { a: 1, b: 2, c: 2, d: 1 });         // s1: a b c; s2: b c d
  assert.deepEqual(pick(table, 'sessions_played'), { a: 2, b: 2, c: 2, d: 2 }); // closed sessions only
  assert.deepEqual(pick(table, 'win_ratio'), { a: 0.5, b: 0.5, c: 0, d: 0 });
  assert.deepEqual(pick(table, 'leading'), { a: true, b: false, c: false, d: false });
});

t('closing the session turns the lead into a win', () => {
  const table = buildStandings(ROWS, {}, { sessions: sessions('closed') });
  assert.deepEqual(pick(table, 'wins'), { a: 2, b: 1, c: 0, d: 0 });
  assert.deepEqual(pick(table, 'podiums'), { a: 2, b: 3, c: 3, d: 1 });         // tonight: a 1st, b and c level 2nd
  assert.deepEqual(pick(table, 'sessions_played'), { a: 3, b: 3, c: 3, d: 3 });
  assert.deepEqual(pick(table, 'win_ratio'), { a: 0.67, b: 0.33, c: 0, d: 0 });
  assert.deepEqual(pick(table, 'leading'), { a: false, b: false, c: false, d: false });
});

t('inside one open session nobody has a win; once it is closed the winner has one', () => {
  const tonight = ROWS.filter((r) => r.session_id === 's3');
  const open = buildStandings(tonight, {}, { sessions: [sessions('open')[2]] });
  assert.deepEqual(pick(open, 'wins'), { a: 0, b: 0, c: 0, d: 0 });
  assert.deepEqual(pick(open, 'win_ratio'), { a: null, b: null, c: null, d: null }); // nothing closed to count
  assert.deepEqual(pick(open, 'leading'), { a: true, b: false, c: false, d: false });
  const closed = buildStandings(tonight, {}, { sessions: [sessions('closed')[2]] });
  assert.deepEqual(pick(closed, 'wins'), { a: 1, b: 0, c: 0, d: 0 });
  assert.deepEqual(pick(closed, 'leading'), { a: false, b: false, c: false, d: false });
  // A table made of one session has no small delta: it would only repeat the total.
  for (const table of [open, closed]) {
    assert.equal(table[0].delta_session, null);
    assert.deepEqual(pick(table, 'session_delta'), { a: null, b: null, c: null, d: null });
  }
});

t('a session the function was not told about is not known to be closed: no win from it', () => {
  const table = buildStandings(ROWS);
  assert.deepEqual(pick(table, 'wins'), { a: 0, b: 0, c: 0, d: 0 });
  assert.deepEqual(pick(table, 'win_ratio'), { a: null, b: null, c: null, d: null });
  assert.deepEqual(pick(table, 'total_score'), { a: 60, b: 60, c: 25, d: -5 });
  assert.equal(table[0].delta_session, null);
  assert.deepEqual(pick(table, 'session_delta'), { a: null, b: null, c: null, d: null });
});

t('tied players share a rank: a two-way tie for first is #1, #1, #3', () => {
  const table = buildStandings(ROWS, {}, { sessions: sessions('open') });
  assert.deepEqual(pick(table, 'rank'), { a: 1, b: 1, c: 3, d: 4 });
});

t('tied players share a rank: a three-way tie is #1, #2, #2, #2, #5', () => {
  const rows = [row('s1', 'a', 40), row('s1', 'b', 0), row('s1', 'c', 0), row('s1', 'd', 0), row('s1', 'e', -10)];
  const table = buildStandings(rows, {}, { sessions: sessions() });
  assert.deepEqual(table.map((p) => [p.player_name, p.rank]), [['Maya', 1], ['Dan', 2], ['Noa', 2], ['Omer', 2], ['Rachel', 5]]);
  // ...and a two-way tie lower down skips the next place: #1, #2, #2, #4.
  const two = buildStandings([row('s1', 'a', 40), row('s1', 'b', 25), row('s1', 'c', 25), row('s1', 'd', 3)], {}, { sessions: sessions() });
  assert.deepEqual(pick(two, 'rank'), { a: 1, b: 2, c: 2, d: 4 });
});

t('two players level on top of a closed session: both #1, a win each, the next player #3', () => {
  const rows = [row('s1', 'a', 25), row('s1', 'b', 25), row('s1', 'c', 3), row('s1', 'd', -10)];
  const closed = buildStandings(rows, {}, { sessions: sessions() });
  assert.deepEqual(pick(closed, 'rank'), { a: 1, b: 1, c: 3, d: 4 });   // nobody is #2
  assert.deepEqual(pick(closed, 'wins'), { a: 1, b: 1, c: 0, d: 0 });   // a shared win, by design
  assert.deepEqual(pick(closed, 'podiums'), { a: 1, b: 1, c: 1, d: 0 });
  // While that session is open they are both leading, and neither has a win.
  const open = buildStandings(rows, {}, { sessions: [{ ...sessions()[0], status: 'open' }] });
  assert.deepEqual(pick(open, 'wins'), { a: 0, b: 0, c: 0, d: 0 });
  assert.deepEqual(pick(open, 'leading'), { a: true, b: true, c: false, d: false });
});

t('gap to the leader: 0 for the leader and anyone level, the difference for the rest', () => {
  const table = buildStandings(ROWS, {}, { sessions: sessions('open') });
  assert.deepEqual(pick(table, 'gap_to_leader'), { a: 0, b: 0, c: 35, d: 65 });
  const negative = buildStandings([row('s1', 'a', -10), row('s1', 'b', -30)], {}, { sessions: sessions() });
  assert.deepEqual(pick(negative, 'gap_to_leader'), { a: 0, b: 20 });
});

t('the small delta belongs to the open session while one has scored rounds', () => {
  const table = buildStandings(ROWS, {}, { sessions: sessions('open') });
  assert.deepEqual(table[0].delta_session, { id: 's3', name: 'Tonight', status: 'open' });
  assert.ok(table.every((p) => p.delta_session === table[0].delta_session));
  assert.deepEqual(pick(table, 'session_delta'), { a: 50, b: 10, c: 10, d: -5 });
});

t('with nothing open the delta belongs to the last closed session, by name', () => {
  const table = buildStandings(ROWS, {}, { sessions: sessions('closed') });
  assert.deepEqual(table[0].delta_session, { id: 's3', name: 'Tonight', status: 'closed' });
  // An open session with no scored round yet says nothing: the last closed night is shown.
  const fresh = [...sessions('closed'), { id: 's4', name: 'Just started', session_date: '2026-05-28', status: 'open', created_date: '2026-05-28T18:00:00Z' }];
  const justStarted = buildStandings([...ROWS, row('s4', 'a', null, { bid: null, tricks_won: null })], {}, { sessions: fresh });
  assert.deepEqual(justStarted[0].delta_session, { id: 's3', name: 'Tonight', status: 'closed' });
  // A player who was not at that session has no delta (null), which is not the same as 0.
  const withGuest = buildStandings([...ROWS, row('s1', 'e', 7)], {}, { sessions: sessions('closed') });
  assert.equal(pick(withGuest, 'session_delta').e, null);
  assert.equal(pick(buildStandings([...ROWS, row('s3', 'e', 0)], {}, { sessions: sessions('closed') }), 'session_delta').e, 0);
  // The caller can still name the session itself.
  const forced = buildStandings(ROWS, {}, { sessions: sessions('open'), deltaSessionId: 's1' });
  assert.deepEqual(forced[0].delta_session, { id: 's1', name: 'Opener', status: 'closed' });
  assert.deepEqual(pick(forced, 'session_delta'), { a: 30, b: 10, c: 5, d: 0 });
});

t('names: the map wins over the name on the row', () => {
  const table = buildStandings([row('s1', 'a', 5)], { a: 'Maya C.' }, { sessions: sessions() });
  assert.equal(table[0].player_name, 'Maya C.');
});

t('no rows -> an empty table', () => {
  assert.deepEqual(buildStandings([], {}, { sessions: sessions() }), []);
});

// --- a session with no counted round has no winner (qa-tester-1) -----------------------------
// Bids 4,4,4,2 and tricks 3,3,3,4: nobody made their contract, so everyone fell and every
// player scored 0 — four players level on top of a session nobody won.
const fell = (session_id, player_id, bid, tricks_won, points = 0) => ({
  session_id, game_id: `${session_id}-g1`, player_id, player_name: NAMES[player_id], bid, tricks_won, points,
});
const FELL = [fell('s4', 'a', 4, 3), fell('s4', 'b', 4, 3), fell('s4', 'c', 4, 3), fell('s4', 'd', 2, 4)];
const s4 = (status) => ({ id: 's4', name: 'Nobody made it', session_date: '2026-05-28', status, created_date: '2026-05-28T18:00:00Z' });

t('a closed session where every round fell gives no win, no podium and no session played', () => {
  const before = buildStandings(ROWS, {}, { sessions: sessions('closed') });
  const after = buildStandings([...ROWS, ...FELL], {}, { sessions: [...sessions('closed'), s4('closed')] });
  for (const field of ['wins', 'podiums', 'sessions_played', 'win_ratio']) {
    assert.deepEqual(pick(after, field), pick(before, field), field);
  }
  // Alone it is the same: nobody won it.
  const alone = buildStandings(FELL, {}, { sessions: [s4('closed')] });
  assert.deepEqual(pick(alone, 'wins'), { a: 0, b: 0, c: 0, d: 0 });
  assert.deepEqual(pick(alone, 'podiums'), { a: 0, b: 0, c: 0, d: 0 });
  assert.deepEqual(pick(alone, 'win_ratio'), { a: null, b: null, c: null, d: null });
  // ...and while it is open nobody is leading it.
  assert.deepEqual(pick(buildStandings(FELL, {}, { sessions: [s4('open')] }), 'leading'), { a: false, b: false, c: false, d: false });
  // One counted round is enough for the night to have a winner.
  const oneCounted = buildStandings([...FELL, fell('s4', 'a', 3, 3, 19)], {}, { sessions: [s4('closed')] });
  assert.deepEqual(pick(oneCounted, 'wins'), { a: 1, b: 0, c: 0, d: 0 });
});

t('last_closed_session names the latest closed night, beside delta_session, on every row', () => {
  const open = buildStandings(ROWS, {}, { sessions: sessions('open') });
  assert.deepEqual(open[0].last_closed_session, { id: 's2', name: 'Rematch' });
  assert.ok(open.every((p) => p.last_closed_session === open[0].last_closed_session));
  assert.deepEqual(open[0].delta_session, { id: 's3', name: 'Tonight', status: 'open' });
  // "Last night" while a session is open: pass its id as deltaSessionId.
  const lastNight = buildStandings(ROWS, {}, { sessions: sessions('open'), deltaSessionId: open[0].last_closed_session.id });
  assert.deepEqual(lastNight[0].delta_session, { id: 's2', name: 'Rematch', status: 'closed' });
  assert.deepEqual(pick(lastNight, 'session_delta'), { a: -20, b: 40, c: 10, d: 0 });
  // Totals do not move with the switch.
  assert.deepEqual(pick(lastNight, 'total_score'), pick(open, 'total_score'));
  // With nothing open it is the same session the delta refers to.
  const closed = buildStandings(ROWS, {}, { sessions: sessions('closed') });
  assert.deepEqual(closed[0].last_closed_session, { id: 's3', name: 'Tonight' });
  // Nothing closed yet: null.
  assert.equal(buildStandings(ROWS.filter((r) => r.session_id === 's3'), {}, { sessions: [sessions('open')[2]] })[0].last_closed_session, null);
});

// --- awards ---------------------------------------------------------------------------------
const ef = (game_id, list) => list.map(([player_id, bid]) => ({
  game_id, session_id: 's1', player_id, player_name: NAMES[player_id], bid, tricks_won: bid + 1, points: 0,
}));

t('The Destroyer names the recorded trump winner of an everyone-falls round', () => {
  const rows = ef('g1', [['a', 5], ['b', 5], ['c', 2], ['d', 3]]);
  const rounds = [{ id: 'g1', everyone_falls: true, trump_suit: 'spades', highest_bidder_player_id: 'b' }];
  assert.deepEqual(computeAwardLeaders(rows, rounds).destroyer, { value: 1, holders: [{ player_id: 'b', name: 'Dan' }] });
});

t('The Destroyer without a recorded trump winner: the highest bid — and a tie names both', () => {
  const single = ef('g1', [['a', 4], ['b', 6], ['c', 2], ['d', 3]]);
  const rounds = [{ id: 'g1', everyone_falls: true, trump_suit: null, highest_bidder_player_id: 'b' }];
  assert.deepEqual(computeAwardLeaders(single, rounds).destroyer, { value: 1, holders: [{ player_id: 'b', name: 'Dan' }] });
  const level = ef('g1', [['a', 5], ['b', 5], ['c', 2], ['d', 3]]);
  assert.deepEqual(
    computeAwardLeaders(level, [{ id: 'g1', everyone_falls: true, trump_suit: null, highest_bidder_player_id: 'a' }]).destroyer,
    { value: 1, holders: [{ player_id: 'b', name: 'Dan' }, { player_id: 'a', name: 'Maya' }] },
  );
});

t('The Destroyer across rounds: ties between players name every holder; no everyone-falls round -> no award', () => {
  const rows = [...ef('g1', [['a', 5], ['b', 4], ['c', 2], ['d', 3]]), ...ef('g2', [['a', 1], ['b', 2], ['c', 7], ['d', 2]])];
  const fell = (id) => ({ id, everyone_falls: true, trump_suit: null });
  assert.deepEqual(
    computeAwardLeaders(rows, [fell('g1'), fell('g2')]).destroyer,
    { value: 1, holders: [{ player_id: 'a', name: 'Maya' }, { player_id: 'c', name: 'Noa' }] },
  );
  // The same rows when the rounds were ordinary ones: everybody sat in them, nobody holds it.
  assert.equal(computeAwardLeaders(rows, [{ id: 'g1', everyone_falls: false }, { id: 'g2', everyone_falls: false }]).destroyer, null);
  assert.equal(computeAwardLeaders(rows).destroyer, null);
});

t('The Greedy and The Coward keep their definitions, return every tied holder, and are absent at 0', () => {
  const rows = [
    { game_id: 'g1', player_id: 'a', player_name: 'Maya', bid: 5, tricks_won: 3, points: -20 },  // too few
    { game_id: 'g2', player_id: 'b', player_name: 'Dan', bid: 4, tricks_won: 2, points: -20 },   // too few, level with Maya
    { game_id: 'g3', player_id: 'c', player_name: 'Noa', bid: 2, tricks_won: 5, points: -30 },   // too many
    { game_id: 'g4', player_id: 'c', player_name: 'Noa', bid: 3, tricks_won: 1, points: -120, reneged: true }, // renege: left out
    { game_id: 'g5', player_id: 'd', player_name: 'Omer', bid: 3, tricks_won: 3, points: 19 },
  ];
  const awards = computeAwardLeaders(rows, []);
  assert.deepEqual(awards.greedy, { value: 20, holders: [{ player_id: 'b', name: 'Dan' }, { player_id: 'a', name: 'Maya' }] });
  assert.deepEqual(awards.coward, { value: 30, holders: [{ player_id: 'c', name: 'Noa' }] });
  assert.equal(awards.destroyer, null);
  // Nobody has lost a point: no award at all.
  assert.deepEqual(computeAwardLeaders([rows[4]], []), { greedy: null, coward: null, destroyer: null });
  // A name map overrides the name on the rows.
  assert.equal(computeAwardLeaders(rows, [], { c: 'נועה' }).coward.holders[0].name, 'נועה');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
