// Dependency-free whist-stats tests. Run:  node src/lib/whist-stats.test.mjs
import assert from 'node:assert/strict';
import { playerMetrics, rankSession, winPodiumTally } from './whist-stats.js';

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

t('playerMetrics: renege excluded from awards, destroyer counts everyone-falls', () => {
  const rows = [
    { bid: 3, tricks_won: 2, points: -110, reneged: true },       // renege -> excluded from greedy
    { bid: 3, tricks_won: 4, points: 0, everyone_falls: true },    // everyone-falls round
    { bid: 3, tricks_won: 4, points: 0, everyone_falls: true },
  ];
  const m = playerMetrics(rows);
  assert.equal(m.greedy_loss, 0);          // the only too-few round was a renege
  assert.equal(m.destroyer_count, 2);
});

t('playerMetrics: empty -> zeros', () => {
  const m = playerMetrics([]);
  assert.equal(m.rounds_played, 0);
  assert.equal(m.avg_score, 0);
  assert.equal(m.contract_accuracy, 0);
  assert.equal(m.zero_bid_success_rate, 0);
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

t('winPodiumTally across sessions', () => {
  const s1 = rankSession([{ player_id: 'a', points: 30 }, { player_id: 'b', points: 10 }]);        // a=1,b=2
  const s2 = rankSession([{ player_id: 'a', points: 5 }, { player_id: 'b', points: 40 }]);         // b=1,a=2
  const s3 = rankSession([{ player_id: 'a', points: 1 }, { player_id: 'x', points: 2 }, { player_id: 'y', points: 3 }, { player_id: 'z', points: 4 }]); // a=4
  const a = winPodiumTally([s1, s2, s3], 'a');
  assert.equal(a.sessions_played, 3);
  assert.equal(a.wins, 1);            // s1
  assert.equal(a.podiums, 2);         // s1 (1st), s2 (2nd); s3 4th no
  assert.equal(a.win_ratio, 0.33);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
