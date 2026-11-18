// Dependency-free whist-stats tests. Run:  node src/lib/whist-stats.test.mjs
import assert from 'node:assert/strict';
import * as stats from './whist-stats.js';

const {
  playerMetrics, rankSession, winPodiumTally, rate, topBidders, awardFigures, awardLeaders, heldAwards,
  playerSessions, sessionRecord,
} = stats;

let pass = 0, fail = 0;
function t(label, fn) {
  try { fn(); pass++; } catch (e) { fail++; console.error(`FAIL: ${label}\n      ${e.message}`); }
}

t('playerMetrics: performance + strategy', () => {
  const rows = [
    { bid: 4, tricks_won: 4, points: 26 },          // exact
    { bid: 3, tricks_won: 2, points: -10 },          // greedy (took too few)
    { bid: 2, tricks_won: 4, points: -20 },          // coward (took too many)
    { bid: 0, tricks_won: 0, points: 50 },           // 0-bid success
    { bid: 0, tricks_won: 2, points: -40 },          // 0-bid fail -> coward (took too many)
  ];
  const m = playerMetrics(rows);
  assert.equal(m.rounds_played, 5);
  assert.equal(m.total_score, 26 - 10 - 20 + 50 - 40);   // 6
  assert.equal(m.avg_score, 1.2);
  assert.equal(m.made_count, 2);                          // 26 exact + 50 zero-success
  assert.equal(m.contract_accuracy, 0.4);
  assert.equal(m.zero_bids, 2);
  assert.equal(m.zero_bid_success, 1);
  assert.equal(m.zero_bid_success_rate, 0.5);
  assert.equal(m.bid_aggressiveness, 1.8);                // (4+3+2+0+0)/5
  assert.equal(m.greedy_loss, 10);                        // only the bid3/won2 row
  assert.equal(m.coward_loss, 60);                        // bid2/won4 (20) + bid0/won2 (40)
});

t('playerMetrics: renege excluded from the greedy/coward split', () => {
  const rows = [
    { bid: 3, tricks_won: 2, points: -110, reneged: true },       // renege -> excluded from greedy
    { bid: 3, tricks_won: 4, points: 0, everyone_falls: true },    // everyone-falls round
    { bid: 3, tricks_won: 4, points: 0, everyone_falls: true },
  ];
  const m = playerMetrics(rows);
  assert.equal(m.greedy_loss, 0);          // the only too-few round was a renege
  // Sitting in an everyone-falls round is no longer The Destroyer: that needs the whole
  // round (who bid highest), so it is counted by awardFigures, not from one player's rows.
  assert.ok(!('destroyer_count' in m));
});

t('playerMetrics: an everyone-falls round still counts as a round played, in the average and as a miss', () => {
  const rows = [
    { bid: 4, tricks_won: 4, points: 26 },
    { bid: 3, tricks_won: 4, points: 0, everyone_falls: true },    // cancelled: played, scored 0
  ];
  const m = playerMetrics(rows);
  assert.equal(m.rounds_played, 2);
  assert.equal(m.avg_score, 13);           // 26 / 2, not 26 / 1
  assert.equal(m.contract_accuracy, 0.5);  // 1 of 2
});

t('playerMetrics: nothing to count is null, not 0', () => {
  const none = playerMetrics([]);
  assert.equal(none.rounds_played, 0);
  assert.equal(none.total_score, 0);
  assert.equal(none.avg_score, 0);
  assert.equal(none.contract_accuracy, null);       // no rounds
  assert.equal(none.zero_bid_success_rate, null);   // no zero bids
  assert.equal(none.zero_bids, 0);

  // Rounds, but never a zero bid: accuracy is a real 0, the zero-bid rate is still unknown.
  const neverZero = playerMetrics([{ bid: 3, tricks_won: 2, points: -10 }]);
  assert.equal(neverZero.contract_accuracy, 0);
  assert.equal(neverZero.zero_bid_success_rate, null);
  // A failed zero bid is a real 0% — and reads differently from "never bid zero".
  const failedZero = playerMetrics([{ bid: 0, tricks_won: 1, points: -50 }]);
  assert.equal(failedZero.zero_bid_success_rate, 0);
  assert.equal(failedZero.zero_bids, 1);
});

t('rate: null when the denominator is 0', () => {
  assert.equal(rate(0, 0), null);
  assert.equal(rate(3, 0), null);
  assert.equal(rate(0, 4), 0);
  assert.equal(rate(1, 3), 0.33);
  assert.equal(rate(4, 4), 1);
});

t('rankSession: totals + tie handling (1,2,2,4)', () => {
  const rows = [
    { player_id: 'a', points: 26 }, { player_id: 'a', points: 10 }, // 36
    { player_id: 'b', points: 20 }, { player_id: 'b', points: 0 },  // 20
    { player_id: 'c', points: 20 },                                  // 20 (tie w/ b)
    { player_id: 'd', points: 5 },                                   // 5
  ];
  const r = rankSession(rows);
  assert.equal(r.get('a').total, 36);
  assert.equal(r.get('a').rank, 1);
  assert.equal(r.get('b').rank, 2);
  assert.equal(r.get('c').rank, 2);   // tie
  assert.equal(r.get('d').rank, 4);   // skips 3
});

t('rankSession: a three-way tie shares one rank (1,2,2,2,5), and a tie for first makes two winners', () => {
  const three = rankSession([
    { player_id: 'a', points: 40 },
    { player_id: 'b', points: 0 }, { player_id: 'c', points: 0 }, { player_id: 'd', points: 0 },
    { player_id: 'e', points: -10 },
  ]);
  assert.deepEqual(['a', 'b', 'c', 'd', 'e'].map((p) => three.get(p).rank), [1, 2, 2, 2, 5]);
  const top = rankSession([{ player_id: 'a', points: 25 }, { player_id: 'b', points: 25 }, { player_id: 'c', points: 3 }]);
  assert.deepEqual(['a', 'b', 'c'].map((p) => top.get(p).rank), [1, 1, 3]);
});

t('winPodiumTally across sessions', () => {
  const s1 = rankSession([{ player_id: 'a', points: 30 }, { player_id: 'b', points: 10 }]);        // a=1,b=2
  const s2 = rankSession([{ player_id: 'a', points: 5 }, { player_id: 'b', points: 40 }]);         // b=1,a=2
  const s3 = rankSession([{ player_id: 'a', points: 1 }, { player_id: 'x', points: 2 }, { player_id: 'y', points: 3 }, { player_id: 'z', points: 4 }]); // a=4
  const a = winPodiumTally([s1, s2, s3], 'a');
  assert.equal(a.sessions_played, 3);
  assert.equal(a.wins, 1);            // s1
  assert.equal(a.podiums, 2);         // s1 (1st), s2 (2nd); s3 4th no
  assert.equal(a.win_ratio, 0.33);
  // In no session at all: no wins, and no win rate either.
  assert.deepEqual(winPodiumTally([s1, s2, s3], 'nobody'), { sessions_played: 0, wins: 0, podiums: 0, win_ratio: null });
});

// --- a win is a closed session finished in first place -------------------------------------
// Three nights. `a` wins the first (closed), is last in the second (closed) and is in front
// in the third — which is still open.
const row = (session_id, player_id, points, extra = {}) => ({ session_id, player_id, points, bid: 3, tricks_won: 3, ...extra });
const NIGHT_ROWS = [
  row('s1', 'a', 30), row('s1', 'b', 10), row('s1', 'c', 5), row('s1', 'd', 0),
  row('s2', 'a', -20), row('s2', 'b', 40), row('s2', 'c', 10), row('s2', 'd', 0),
  row('s3', 'a', 50), row('s3', 'b', 10), row('s3', 'c', 10), row('s3', 'd', -5),
  row('s3', 'a', null, { bid: null, tricks_won: null }), // a round still in play: not scored
];
const nightsWith = (s3Status) => [
  { id: 's1', name: 'Opener', session_date: '2026-05-07', status: 'closed', created_date: '2026-05-07T18:00:00Z' },
  { id: 's2', name: 'Rematch', session_date: '2026-05-14', status: 'closed', created_date: '2026-05-14T18:00:00Z' },
  { id: 's3', name: 'Tonight', session_date: '2026-05-21', status: s3Status, created_date: '2026-05-21T18:00:00Z' },
];

t('playerSessions: one entry per night the player scored in, newest first, with total, rank and players', () => {
  const nights = playerSessions(NIGHT_ROWS, nightsWith('open'), 'a');
  assert.deepEqual(nights, [
    { session_id: 's3', name: 'Tonight', session_date: '2026-05-21', status: 'open', total: 50, rank: 1, players: 4 },
    { session_id: 's2', name: 'Rematch', session_date: '2026-05-14', status: 'closed', total: -20, rank: 4, players: 4 },
    { session_id: 's1', name: 'Opener', session_date: '2026-05-07', status: 'closed', total: 30, rank: 1, players: 4 },
  ]);
  // Tied players share a place: b and c are both 2nd tonight.
  assert.deepEqual(playerSessions(NIGHT_ROWS, nightsWith('open'), 'c').map((n) => n.rank), [2, 2, 3]);
  // Someone who never scored has no nights.
  assert.deepEqual(playerSessions(NIGHT_ROWS, nightsWith('open'), 'nobody'), []);
});

t('playerSessions: two sessions on the same date are ordered by when they were created', () => {
  const sessions = [
    { id: 'early', name: 'Afternoon', session_date: '2026-06-01', status: 'closed', created_date: '2026-06-01T14:00:00Z' },
    { id: 'late', name: 'Evening', session_date: '2026-06-01', status: 'closed', created_date: '2026-06-01T20:00:00Z' },
  ];
  const rows = [row('early', 'a', 5), row('late', 'a', 7)];
  assert.deepEqual(playerSessions(rows, sessions, 'a').map((n) => n.name), ['Evening', 'Afternoon']);
});

t('sessionRecord: an open session never yields a win or a podium; closing it does', () => {
  const open = sessionRecord(playerSessions(NIGHT_ROWS, nightsWith('open'), 'a'));
  assert.equal(open.sessions_played, 2);      // the two closed nights
  assert.equal(open.sessions_open, 1);
  assert.equal(open.wins, 1);                 // s1 only — in front tonight is not a win
  assert.equal(open.podiums, 1);              // s1 (1st); s2 was 4th; tonight does not count
  assert.equal(open.win_ratio, 0.5);          // 1 of 2, not 2 of 3

  const closed = sessionRecord(playerSessions(NIGHT_ROWS, nightsWith('closed'), 'a'));
  assert.equal(closed.sessions_played, 3);
  assert.equal(closed.sessions_open, 0);
  assert.equal(closed.wins, 2);
  assert.equal(closed.podiums, 2);
  assert.equal(closed.win_ratio, 0.67);

  // The others: b is 2nd tonight — a podium only once the night is closed.
  assert.equal(sessionRecord(playerSessions(NIGHT_ROWS, nightsWith('open'), 'b')).podiums, 2);
  assert.equal(sessionRecord(playerSessions(NIGHT_ROWS, nightsWith('closed'), 'b')).podiums, 3);
});

t('sessionRecord: only an open session -> no wins and no win rate (null, not 0)', () => {
  const sessions = [{ id: 's3', name: 'Tonight', session_date: '2026-05-21', status: 'open' }];
  const record = sessionRecord(playerSessions(NIGHT_ROWS.filter((r) => r.session_id === 's3'), sessions, 'a'));
  assert.deepEqual(record, { sessions_played: 0, sessions_open: 1, wins: 0, podiums: 0, win_ratio: null, best_session: null, worst_session: null });
  // A session whose record is missing is not known to be closed: it gives nothing either.
  const orphan = sessionRecord(playerSessions(NIGHT_ROWS.filter((r) => r.session_id === 's3'), [], 'a'));
  assert.deepEqual([orphan.sessions_played, orphan.wins, orphan.win_ratio], [0, 0, null]);
});

t('sessionRecord: best and worst night come from closed sessions only', () => {
  const open = sessionRecord(playerSessions(NIGHT_ROWS, nightsWith('open'), 'a'));
  assert.deepEqual(open.best_session, { session_id: 's1', name: 'Opener', session_date: '2026-05-07', status: 'closed', total: 30, rank: 1, players: 4 });
  assert.deepEqual(open.worst_session, { session_id: 's2', name: 'Rematch', session_date: '2026-05-14', status: 'closed', total: -20, rank: 4, players: 4 });
  // Tonight's +50 becomes the best night only when the session is closed.
  const closed = sessionRecord(playerSessions(NIGHT_ROWS, nightsWith('closed'), 'a'));
  assert.equal(closed.best_session.session_id, 's3');
  assert.equal(closed.worst_session.session_id, 's2');
  // One closed night is both; equal totals go to the more recent night.
  const one = sessionRecord(playerSessions(NIGHT_ROWS.filter((r) => r.session_id === 's1'), nightsWith('open'), 'a'));
  assert.equal(one.best_session.session_id, 's1');
  assert.equal(one.worst_session.session_id, 's1');
  const level = sessionRecord(playerSessions([row('s1', 'd', 0), row('s2', 'd', 0)], nightsWith('open'), 'd'));
  assert.equal(level.best_session.session_id, 's2');
  assert.equal(level.worst_session.session_id, 's2');
});

t('two players level on top of a closed session: both are #1, both have a win, the next player is #3', () => {
  const rows = [row('s1', 'a', 25), row('s1', 'b', 25), row('s1', 'c', 3), row('s1', 'd', -10)];
  const closed = [{ id: 's1', name: 'Level', session_date: '2026-05-07', status: 'closed' }];
  const entry = (p) => playerSessions(rows, closed, p)[0];
  assert.deepEqual(['a', 'b', 'c', 'd'].map((p) => entry(p).rank), [1, 1, 3, 4]);   // nobody is #2
  assert.deepEqual(['a', 'b', 'c', 'd'].map((p) => sessionRecord([entry(p)]).wins), [1, 1, 0, 0]);
  assert.deepEqual(['a', 'b', 'c', 'd'].map((p) => sessionRecord([entry(p)]).podiums), [1, 1, 1, 0]);
  // The same night while it is open: level in front, and nobody has a win.
  const open = [{ ...closed[0], status: 'open' }];
  assert.deepEqual(['a', 'b'].map((p) => sessionRecord(playerSessions(rows, open, p)).wins), [0, 0]);
});

// --- The Destroyer: everyone-falls rounds as the top bidder -----------------------------------
const bids = (game_id, list) => list.map(([player_id, bid]) => ({ game_id, player_id, bid, tricks_won: bid + 1, points: 0 }));

t('topBidders: the recorded trump winner, even when someone else bid the same or more', () => {
  const rows = bids('g1', [['a', 5], ['b', 5], ['c', 2], ['d', 3]]);
  assert.deepEqual(topBidders(rows, { trump_suit: 'spades', highest_bidder_player_id: 'b' }), ['b']);
  assert.deepEqual(topBidders(rows, { trump_suit: 'hearts', highest_bidder_player_id: 'c' }), ['c']); // what the table recorded
});

t('topBidders: no trump winner recorded -> the highest bid; a tie names every one of them', () => {
  assert.deepEqual(topBidders(bids('g1', [['a', 4], ['b', 6], ['c', 2], ['d', 3]]), { trump_suit: null }), ['b']);
  assert.deepEqual(topBidders(bids('g1', [['a', 5], ['b', 5], ['c', 2], ['d', 3]]), { trump_suit: null }), ['a', 'b']);
  // Without a trump suit highest_bidder_player_id is only the server's default (the first of
  // the highest bids) — it must not pick one of two level bidders.
  assert.deepEqual(topBidders(bids('g1', [['a', 5], ['b', 5], ['c', 2], ['d', 3]]), { trump_suit: null, highest_bidder_player_id: 'a' }), ['a', 'b']);
  assert.deepEqual(topBidders(bids('g1', [['a', 5], ['b', 5], ['c', 2], ['d', 3]]), undefined), ['a', 'b']);
  // A recorded winner who is not at the table (bad data) falls back to the highest bid.
  assert.deepEqual(topBidders(bids('g1', [['a', 4], ['b', 6], ['c', 2], ['d', 3]]), { trump_suit: 'clubs', highest_bidder_player_id: 'zz' }), ['b']);
  assert.deepEqual(topBidders([], { trump_suit: null }), []);
});

t('awardFigures: an everyone-falls round counts for its top bidder only, not for everyone at the table', () => {
  const rows = [
    ...bids('ef1', [['a', 5], ['b', 4], ['c', 2], ['d', 3]]),          // trump recorded for b
    ...bids('ef2', [['a', 6], ['b', 2], ['c', 2], ['d', 2]]),          // no trump: a bid highest
    ...bids('ef3', [['a', 4], ['b', 4], ['c', 1], ['d', 3]]),          // no trump: a and b level
    ...bids('ok', [['a', 7], ['b', 1], ['c', 1], ['d', 1]]),           // not an everyone-falls round
    { game_id: 'play', player_id: 'd', bid: 9, tricks_won: null, points: null }, // still in play
  ];
  const rounds = [
    { id: 'ef1', everyone_falls: true, trump_suit: 'spades', highest_bidder_player_id: 'b' },
    { id: 'ef2', everyone_falls: true, trump_suit: null, highest_bidder_player_id: 'a' },
    { id: 'ef3', everyone_falls: true, trump_suit: null, highest_bidder_player_id: 'a' },
    { id: 'ok', everyone_falls: false, trump_suit: null, highest_bidder_player_id: 'a' },
    { id: 'play', everyone_falls: false },
  ];
  const figures = awardFigures(rows, rounds);
  assert.deepEqual(Object.fromEntries(Object.entries(figures).map(([p, f]) => [p, f.destroyer_count])), { a: 2, b: 2, c: 0, d: 0 });
  // Without the round records nothing is known to have fallen.
  assert.deepEqual(Object.values(awardFigures(rows)).map((f) => f.destroyer_count), [0, 0, 0, 0]);
});

t('awardFigures: greedy and coward are the same split as playerMetrics', () => {
  const rows = [
    { game_id: 'g1', player_id: 'a', bid: 3, tricks_won: 2, points: -10 },
    { game_id: 'g2', player_id: 'a', bid: 2, tricks_won: 4, points: -20 },
    { game_id: 'g3', player_id: 'a', bid: 0, tricks_won: 2, points: -40 },
    { game_id: 'g4', player_id: 'a', bid: 3, tricks_won: 2, points: -110, reneged: true },
    { game_id: 'g5', player_id: 'a', bid: 4, tricks_won: 4, points: 26 },
  ];
  const m = playerMetrics(rows);
  assert.deepEqual(awardFigures(rows, []).a, { greedy_loss: m.greedy_loss, coward_loss: m.coward_loss, destroyer_count: 0 });
  assert.deepEqual([m.greedy_loss, m.coward_loss], [10, 60]);
});

t('awardLeaders: one holder, a tie that names every holder, and an award nobody holds', () => {
  const figures = {
    a: { greedy_loss: 120, coward_loss: 40, destroyer_count: 0 },
    b: { greedy_loss: 80, coward_loss: 40, destroyer_count: 0 },
    c: { greedy_loss: 0, coward_loss: 15, destroyer_count: 0 },
  };
  const names = { a: 'Maya', b: 'Dan', c: 'Noa' };
  const leaders = awardLeaders(figures, names);
  assert.deepEqual(leaders.greedy, { value: 120, holders: [{ player_id: 'a', name: 'Maya' }] });
  // Level on 40: both are named, in name order — not whoever came first.
  assert.deepEqual(leaders.coward, { value: 40, holders: [{ player_id: 'b', name: 'Dan' }, { player_id: 'a', name: 'Maya' }] });
  // Nobody has an everyone-falls round to their name: the award is absent.
  assert.equal(leaders.destroyer, null);
  assert.deepEqual(heldAwards(leaders, 'a'), ['greedy', 'coward']);
  assert.deepEqual(heldAwards(leaders, 'b'), ['coward']);
  assert.deepEqual(heldAwards(leaders, 'c'), []);
  assert.deepEqual(awardLeaders({}), { greedy: null, coward: null, destroyer: null });
});

t('awardLeaders: The Destroyer across players — the most rounds wins, level counts share it', () => {
  const rows = [
    ...bids('ef1', [['a', 5], ['b', 4], ['c', 2], ['d', 3]]),
    ...bids('ef2', [['a', 6], ['b', 2], ['c', 2], ['d', 2]]),
    ...bids('ef3', [['a', 1], ['b', 2], ['c', 7], ['d', 2]]),
  ];
  const fell = (id, extra = {}) => ({ id, everyone_falls: true, trump_suit: null, ...extra });
  const names = { a: 'Maya', b: 'Dan', c: 'Noa', d: 'Omer' };
  // a: ef1 + ef2, c: ef3 -> a alone.
  assert.deepEqual(
    awardLeaders(awardFigures(rows, [fell('ef1'), fell('ef2'), fell('ef3')]), names).destroyer,
    { value: 2, holders: [{ player_id: 'a', name: 'Maya' }] },
  );
  // The table recorded b as the trump winner of ef2: a 1, b 1, c 1 -> three holders.
  assert.deepEqual(
    awardLeaders(awardFigures(rows, [fell('ef1'), fell('ef2', { trump_suit: 'hearts', highest_bidder_player_id: 'b' }), fell('ef3')]), names).destroyer,
    { value: 1, holders: [{ player_id: 'b', name: 'Dan' }, { player_id: 'a', name: 'Maya' }, { player_id: 'c', name: 'Noa' }] },
  );
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
