// Dependency-free scoring tests. Run with:  node src/lib/scoring.test.mjs
// (No npm needed — this is our offline correctness gate while the registry is down.)
import assert from 'node:assert/strict';
import {
  bidSum, tableState, isValidBid, isBidSumLegal, illegalLastBids, isTricksTotalLegal,
  progressiveRate, madeContract, contractPoints, scoreRound, highestBidderIndex,
} from './scoring.js';

let pass = 0;
let fail = 0;
function t(label, fn) {
  try { fn(); pass++; }
  catch (e) { fail++; console.error(`FAIL: ${label}\n      ${e.message}`); }
}
const pts = (r) => r.results.map((x) => x.points);

// --- table state / sums -----------------------------------------------------
t('bidSum', () => assert.equal(bidSum([4, 3, 3, 2]), 12));
t('tableState DOWN (<=12)', () => assert.equal(tableState([4, 3, 3, 2]), 'down'));
t('tableState UP (>=14)', () => assert.equal(tableState([4, 4, 4, 4]), 'up'));
t('tableState null at sum 13', () => assert.equal(tableState([3, 3, 3, 4]), null));

// --- single-bid + sum validators -------------------------------------------
t('isValidBid range', () => {
  assert.equal(isValidBid(0), true);
  assert.equal(isValidBid(13), true);
  assert.equal(isValidBid(14), false);
  assert.equal(isValidBid(-1), false);
  assert.equal(isValidBid(2.5), false);
});
t('isBidSumLegal ok', () => assert.equal(isBidSumLegal([4, 4, 4, 4]), true));
t('isBidSumLegal rejects sum=13', () => assert.equal(isBidSumLegal([3, 3, 3, 4]), false));
t('isBidSumLegal rejects out-of-range', () => assert.equal(isBidSumLegal([14, 0, 0, 0]), false));
t('isBidSumLegal rejects wrong length', () => assert.equal(isBidSumLegal([4, 4, 4]), false));

// --- last-bidder illegal value ----------------------------------------------
t('illegalLastBids blocks the 13-maker', () => assert.deepEqual(illegalLastBids([3, 3, 3]), [4]));
t('illegalLastBids none when >13 impossible', () => assert.deepEqual(illegalLastBids([5, 5, 5]), []));
t('illegalLastBids all-zero -> 13', () => assert.deepEqual(illegalLastBids([0, 0, 0]), [13]));

// --- tricks total -----------------------------------------------------------
t('isTricksTotalLegal ok (=13)', () => assert.equal(isTricksTotalLegal([4, 3, 3, 3]), true));
t('isTricksTotalLegal rejects !=13', () => assert.equal(isTricksTotalLegal([4, 4, 4, 4]), false));

// --- progressive rate table -------------------------------------------------
t('progressiveRate buckets', () => {
  assert.equal(progressiveRate(1), 5);
  assert.equal(progressiveRate(4), 5);
  assert.equal(progressiveRate(5), 10);
  assert.equal(progressiveRate(6), 15);
  assert.equal(progressiveRate(7), 20);
  assert.equal(progressiveRate(13), 20);
  assert.equal(progressiveRate(0), 0);
});

// --- contractPoints unit cases ---------------------------------------------
t('exact contract bid^2+10', () => {
  assert.equal(contractPoints(3, 3, 'down', 'classic'), 19);
  assert.equal(contractPoints(5, 5, 'up', 'classic'), 35);
  assert.equal(contractPoints(1, 1, 'down', 'classic'), 11);
});
t('classic miss -10/trick', () => {
  assert.equal(contractPoints(4, 2, 'down', 'classic'), -20);
  assert.equal(contractPoints(3, 6, 'up', 'classic'), -30);
});
t('progressive miss buckets', () => {
  assert.equal(contractPoints(2, 3, 'up', 'progressive'), -5);   // miss1 -> 5*1
  assert.equal(contractPoints(6, 2, 'up', 'progressive'), -20);  // miss4 -> 5*4
  assert.equal(contractPoints(0 + 6, 1, 'up', 'progressive'), -50); // bid6 tricks1 miss5 ->10*5
  assert.equal(contractPoints(7, 1, 'up', 'progressive'), -90);  // miss6 -> 15*6
  assert.equal(contractPoints(8, 1, 'up', 'progressive'), -140); // miss7 -> 20*7
});
t('0-bid success DOWN=+50 UP=+25', () => {
  assert.equal(contractPoints(0, 0, 'down', 'classic'), 50);
  assert.equal(contractPoints(0, 0, 'up', 'classic'), 25);
});
t('0-bid failure -50 first then +10 each', () => {
  assert.equal(contractPoints(0, 1, 'down', 'classic'), -50);
  assert.equal(contractPoints(0, 2, 'down', 'classic'), -40);
  assert.equal(contractPoints(0, 3, 'up', 'classic'), -30);
});

// --- madeContract -----------------------------------------------------------
t('madeContract exact incl 0-bid', () => {
  assert.equal(madeContract(0, 0), true);
  assert.equal(madeContract(3, 3), true);
  assert.equal(madeContract(3, 2), false);
  assert.equal(madeContract(0, 1), false);
});

// --- full rounds ------------------------------------------------------------
t('Round A: normal classic mix (DOWN)', () => {
  const r = scoreRound({
    scoringMethod: 'classic',
    players: [
      { bid: 4, tricks_won: 4 }, { bid: 3, tricks_won: 3 },
      { bid: 3, tricks_won: 2 }, { bid: 2, tricks_won: 4 },
    ],
  });
  assert.equal(r.tableState, 'down');
  assert.equal(r.everyoneFalls, false);
  assert.deepEqual(pts(r), [26, 19, -10, -20]);
});
t('Round B: 0-bid success in DOWN', () => {
  const r = scoreRound({
    scoringMethod: 'classic',
    players: [
      { bid: 0, tricks_won: 0 }, { bid: 4, tricks_won: 5 },
      { bid: 4, tricks_won: 4 }, { bid: 4, tricks_won: 4 },
    ],
  });
  assert.equal(r.tableState, 'down');
  assert.deepEqual(pts(r), [50, -10, 26, 26]);
});
t('Round C: 0-bid success in UP', () => {
  const r = scoreRound({
    scoringMethod: 'classic',
    players: [
      { bid: 0, tricks_won: 0 }, { bid: 5, tricks_won: 5 },
      { bid: 5, tricks_won: 4 }, { bid: 5, tricks_won: 4 },
    ],
  });
  assert.equal(r.tableState, 'up');
  assert.deepEqual(pts(r), [25, 35, -10, -10]);
});
t('Round D: 0-bid failure', () => {
  const r = scoreRound({
    scoringMethod: 'classic',
    players: [
      { bid: 0, tricks_won: 2 }, { bid: 5, tricks_won: 5 },
      { bid: 5, tricks_won: 4 }, { bid: 4, tricks_won: 2 },
    ],
  });
  assert.equal(r.tableState, 'up');
  assert.deepEqual(pts(r), [-40, 35, -10, -20]);
});
t('Round E: everyone falls -> all zero', () => {
  const r = scoreRound({
    scoringMethod: 'classic',
    players: [
      { bid: 3, tricks_won: 4 }, { bid: 3, tricks_won: 4 },
      { bid: 3, tricks_won: 4 }, { bid: 2, tricks_won: 1 },
    ],
  });
  assert.equal(r.everyoneFalls, true);
  assert.deepEqual(pts(r), [0, 0, 0, 0]);
});
t('Round F: everyone falls + renege independent (default) keeps -100', () => {
  const r = scoreRound({
    scoringMethod: 'classic',
    players: [
      { bid: 3, tricks_won: 4, reneged: true }, { bid: 3, tricks_won: 4 },
      { bid: 3, tricks_won: 4 }, { bid: 2, tricks_won: 1 },
    ],
  });
  assert.equal(r.everyoneFalls, true);
  assert.deepEqual(pts(r), [-100, 0, 0, 0]);
});
t('Round F2: everyone falls + renege NOT independent zeroes penalty', () => {
  const r = scoreRound({
    scoringMethod: 'classic',
    players: [
      { bid: 3, tricks_won: 4, reneged: true }, { bid: 3, tricks_won: 4 },
      { bid: 3, tricks_won: 4 }, { bid: 2, tricks_won: 1 },
    ],
  }, { renegeIndependentOfEveryoneFalls: false });
  assert.deepEqual(pts(r), [0, 0, 0, 0]);
});
t('Round G: renege stacks on a normal round', () => {
  const r = scoreRound({
    scoringMethod: 'classic',
    players: [
      { bid: 4, tricks_won: 4 }, { bid: 3, tricks_won: 3 },
      { bid: 3, tricks_won: 2, reneged: true }, { bid: 2, tricks_won: 4 },
    ],
  });
  assert.deepEqual(pts(r), [26, 19, -110, -20]);
});
t('Round H: progressive big miss', () => {
  const r = scoreRound({
    scoringMethod: 'progressive',
    players: [
      { bid: 1, tricks_won: 8 }, { bid: 1, tricks_won: 1 },
      { bid: 1, tricks_won: 2 }, { bid: 1, tricks_won: 2 },
    ],
  });
  assert.equal(r.tableState, 'down');
  assert.equal(r.everyoneFalls, false);
  assert.deepEqual(pts(r), [-140, 11, -5, -5]);
});
t('Round I: 0-bid success counts as made (not everyone-falls)', () => {
  const r = scoreRound({
    scoringMethod: 'classic',
    players: [
      { bid: 0, tricks_won: 0 }, { bid: 5, tricks_won: 6 },
      { bid: 5, tricks_won: 3 }, { bid: 5, tricks_won: 4 },
    ],
  });
  assert.equal(r.everyoneFalls, false);
  assert.deepEqual(pts(r), [25, -10, -20, -10]);
});

// --- guards -----------------------------------------------------------------
t('scoreRound throws on illegal bid sum (=13)', () => {
  assert.throws(() => scoreRound({
    scoringMethod: 'classic',
    players: [
      { bid: 3, tricks_won: 4 }, { bid: 3, tricks_won: 3 },
      { bid: 3, tricks_won: 3 }, { bid: 4, tricks_won: 3 },
    ],
  }), /Illegal bids/);
});
t('scoreRound throws on illegal tricks total (!=13)', () => {
  assert.throws(() => scoreRound({
    scoringMethod: 'classic',
    players: [
      { bid: 4, tricks_won: 4 }, { bid: 4, tricks_won: 4 },
      { bid: 4, tricks_won: 4 }, { bid: 2, tricks_won: 4 },
    ],
  }), /Illegal tricks/);
});
t('scoreRound throws on wrong player count', () => {
  assert.throws(() => scoreRound({ scoringMethod: 'classic', players: [{ bid: 1, tricks_won: 1 }] }));
});

// --- highest bidder ---------------------------------------------------------
t('highestBidderIndex picks max', () => {
  assert.equal(highestBidderIndex([{ bid: 4 }, { bid: 3 }, { bid: 5 }, { bid: 2 }]), 2);
});
t('highestBidderIndex ties -> earliest', () => {
  assert.equal(highestBidderIndex([{ bid: 5 }, { bid: 5 }, { bid: 3 }, { bid: 2 }]), 0);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
