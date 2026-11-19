// Checks for src/components/round/round-logic.js.
// Run with:  node src/components/round/round-logic.test.mjs   (dependency-free)
import assert from 'node:assert/strict';
import process from 'node:process';
import {
  nextEmptyIndex, rotateLeft, sameTableOrder, blockedBid, lockBlocker, saveBlocker, previewRound,
  nextRoundNumber, roundLimit, startBlocker, isRealDate, parseRoundLimit, sessionFormErrors,
  tricksAreWrong, topBidders, defaultTrumpOwnerIndex, trumpOwnerHint, TOP_BID_TIE_LINE, biddingOrder, outcomeParts,
  nextTrickIndex,
} from './round-logic.js';
import { scoreRound, contractPoints } from '../../lib/scoring.js';

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed += 1; } catch (err) { failures.push({ name, err }); }
}

const _ = null;

// ---- the cursor (ruling 18) -------------------------------------------------------

test('bidding that starts at player 3 goes 3 → 4 → 1 → 2', () => {
  let values = [_, _, _, _];
  let at = 2; // the scorer tapped row 3
  const visited = [at + 1];
  for (let i = 0; i < 3; i++) {
    values = values.map((v, idx) => (idx === at ? 5 : v));
    at = nextEmptyIndex(values, at);
    visited.push(at + 1);
  }
  assert.deepEqual(visited, [3, 4, 1, 2]);
  values = values.map((v, idx) => (idx === at ? 5 : v));
  assert.equal(nextEmptyIndex(values, at), -1, 'all four in: nowhere left to go');
});

test('the cursor skips rows that are already filled', () => {
  assert.equal(nextEmptyIndex([4, 3, _, _], 1), 2);
  assert.equal(nextEmptyIndex([_, 3, 2, 5], 3), 0, 'wraps past the last row');
  assert.equal(nextEmptyIndex([4, _, 2, _], 0), 1);
  assert.equal(nextEmptyIndex([4, _, 2, 5], 2), 1, 'skips row 4, wraps, skips row 1');
  assert.equal(nextEmptyIndex([0, 0, 0, _], 0), 3, 'a zero is a value, not an empty row');
});

test('from = -1 means the first empty row', () => {
  assert.equal(nextEmptyIndex([_, _, _, _], -1), 0);
  assert.equal(nextEmptyIndex([4, 3, _, _], -1), 2);
  assert.equal(nextEmptyIndex([4, 3, 2, 5], -1), -1);
});

test('rotateLeft moves the order on by one, and wraps', () => {
  assert.deepEqual(rotateLeft(['a', 'b', 'c', 'd']), ['b', 'c', 'd', 'a']);
  assert.deepEqual(rotateLeft(['a', 'b', 'c', 'd'], 4), ['a', 'b', 'c', 'd']);
  assert.deepEqual(rotateLeft(['a', 'b', 'c', 'd'], 5), ['b', 'c', 'd', 'a']);
  assert.deepEqual(rotateLeft([]), []);
});

test('"same players as last round": the same four, the second bidder now first', () => {
  const last = [
    { player_id: 'dan', bid_order: 3 }, { player_id: 'yossi', bid_order: 1 },
    { player_id: 'noa', bid_order: 4 }, { player_id: 'maya', bid_order: 2 },
  ];
  assert.deepEqual(sameTableOrder(last), ['maya', 'dan', 'noa', 'yossi']);
  // Four rounds on, everyone has bid first once and the order is back where it began.
  let order = ['a', 'b', 'c', 'd'];
  const firsts = [];
  for (let i = 0; i < 4; i++) {
    order = sameTableOrder(order.map((player_id, n) => ({ player_id, bid_order: n + 1 })));
    firsts.push(order[0]);
  }
  assert.deepEqual(firsts, ['b', 'c', 'd', 'a']);
  assert.deepEqual(order, ['a', 'b', 'c', 'd']);
  assert.deepEqual(sameTableOrder(last.slice(0, 3)), [], 'not four players: no shortcut');
  assert.deepEqual(sameTableOrder(), []);
});

// ---- bids ------------------------------------------------------------------------

test('the last bid cannot be the number that makes 13, whichever row is last', () => {
  assert.equal(blockedBid([4, 3, 4, _], 3), 2);
  assert.equal(blockedBid([_, 3, 4, 4], 0), 2);
  assert.equal(blockedBid([4, _, 4, 3], 1), 2);
  assert.equal(blockedBid([0, 0, 0, _], 3), 13);
  assert.equal(blockedBid([13, 0, 0, _], 3), 0);
});

test('nothing is blocked while another bid is still missing, or when 13 is out of reach', () => {
  assert.equal(blockedBid([4, 3, _, _], 3), null);
  assert.equal(blockedBid([_, _, _, _], 0), null);
  assert.equal(blockedBid([7, 7, 7, _], 3), null, 'the others already total more than 13');
});

test('changing a bid afterwards is blocked the same way', () => {
  assert.equal(blockedBid([4, 3, 4, 5], 3), 2);
  assert.equal(blockedBid([4, 3, 4, 5], 0), 1);
});

test('Lock bids says what is missing — every reason', () => {
  assert.equal(lockBlocker({ bids: [_, _, _, _] }), 'Enter a bid for each player');
  assert.equal(lockBlocker({ bids: [4, _, _, 3] }), 'Enter the bids — 2 players to go');
  assert.equal(lockBlocker({ bids: [4, 3, 4, 2] }), "The bids can't total 13 — change one");
  assert.equal(lockBlocker({ bids: [4, 3, 4, 3] }), null);
  // a trump winner marked without a suit is not locked silently
  assert.equal(lockBlocker({ bids: [4, 3, 4, 3], trumpOwnerId: 'p1' }), 'Pick the trump suit, or remove the trump mark');
  assert.equal(lockBlocker({ bids: [4, 3, 4, 3], trump: 'hearts' }), 'Mark who won the trump');
  assert.equal(lockBlocker({ bids: [4, 3, 4, 3], trump: 'hearts', trumpOwnerId: 'p1' }), null);
});

test('Lock bids in an advanced session: trump winner, suit and card order are all needed', () => {
  const bids = [5, 3, 4, 3];
  assert.equal(lockBlocker({ bids, advanced: true }), 'Mark who won the trump');
  assert.equal(lockBlocker({ bids, advanced: true, trumpOwnerId: 'p1' }), 'Pick the trump suit');
  assert.equal(lockBlocker({ bids, advanced: true, trumpOwnerId: 'p1', trump: 'notrump' }), 'Choose the card order');
  assert.equal(lockBlocker({ bids, advanced: true, trumpOwnerId: 'p1', trump: 'notrump', hierarchy: 'down_up' }), null);
  assert.equal(lockBlocker({ bids: [4, 3, _, 3], advanced: true, trumpOwnerId: 'p1', trump: 'clubs', hierarchy: 'standard' }), 'Enter the bids — 1 player to go');
});

// ---- tricks ----------------------------------------------------------------------

test('Save round says what is missing — every reason', () => {
  assert.equal(saveBlocker({ tricks: [_, _, _, _] }), 'Enter the tricks each player took');
  assert.equal(saveBlocker({ tricks: [4, _, 3, _] }), 'Enter the tricks — 2 players to go');
  assert.equal(saveBlocker({ tricks: [4, 3, 3, 2] }), 'Tricks must total 13 — now 12');
  assert.equal(saveBlocker({ tricks: [5, 4, 3, 2] }), 'Tricks must total 13 — now 14');
  assert.equal(saveBlocker({ tricks: [4, 3, 4, 2] }), null);
  assert.equal(saveBlocker({ tricks: [13, 0, 0, 0] }), null);
});

// ---- the preview is the engine's answer (ruling 19) ------------------------------

// What the server stores: scoreRound's points (saveRoundResults mirrors it line for line).
function serverPoints(bids, tricks, reneges, scoringMethod) {
  return scoreRound({
    players: bids.map((bid, i) => ({ bid, tricks_won: tricks[i], reneged: !!reneges[i] })),
    scoringMethod,
  });
}

const ROUNDS = [
  // name, bids, tricks, reneges, method
  ['up table, two make it', [5, 4, 3, 3], [5, 4, 2, 2], [], 'classic'],
  ['down table, three make it', [4, 3, 3, 2], [4, 3, 3, 3], [], 'classic'],
  ['a zero bid made on a down table', [0, 5, 4, 3], [0, 5, 4, 4], [], 'classic'],
  ['a zero bid made on an up table', [0, 6, 5, 4], [0, 6, 4, 3], [], 'progressive'],
  ['a zero bid that took two tricks', [0, 5, 4, 3], [2, 5, 3, 3], [], 'classic'],
  ['a renege by a player who made the bid', [3, 4, 3, 2], [3, 4, 2, 4], [true, false, false, false], 'classic'],
  ['everyone falls', [5, 4, 3, 3], [4, 5, 2, 2], [], 'classic'],
  ['everyone falls, with a renege inside it', [5, 4, 3, 3], [4, 5, 2, 2], [false, true, false, false], 'progressive'],
  ['a big miss, progressive', [8, 2, 2, 2], [2, 5, 3, 3], [], 'progressive'],
  ['a big miss, classic', [8, 2, 2, 2], [2, 5, 3, 3], [], 'classic'],
];

test('a complete round previews exactly what the engine scores', () => {
  for (const [name, bids, tricks, reneges, method] of ROUNDS) {
    const preview = previewRound({ bids, tricks, reneges, scoringMethod: method });
    const scored = serverPoints(bids, tricks, reneges, method);
    assert.equal(preview.complete, true, name);
    assert.equal(preview.everyoneFalls, scored.everyoneFalls, `${name}: everyone falls`);
    assert.equal(preview.table, scored.tableState, `${name}: table`);
    assert.deepEqual(preview.rows.map((r) => r.points), scored.results.map((r) => r.points), `${name}: points`);
    assert.deepEqual(preview.rows.map((r) => r.made), scored.results.map((r) => r.madeContract), `${name}: made`);
    assert.ok(preview.rows.every((r) => r.final), `${name}: final`);
  }
});

test('the figures themselves, for the cases the scorer reads out', () => {
  const pts = (bids, tricks, reneges = [], method = 'classic') => previewRound({ bids, tricks, reneges, scoringMethod: method }).rows.map((r) => r.points);
  assert.deepEqual(pts([5, 4, 3, 3], [5, 4, 2, 2]), [35, 26, -10, -10]);
  assert.deepEqual(pts([0, 5, 4, 3], [0, 5, 4, 4]), [50, 35, 26, -10], 'zero made on a down table is +50');
  assert.deepEqual(pts([0, 6, 5, 4], [0, 6, 4, 3], [], 'progressive'), [25, 46, -5, -5], 'zero made on an up table is +25');
  assert.deepEqual(pts([3, 4, 3, 2], [3, 4, 2, 4], [true]), [19 - 100, 26, -10, -20], 'renege is −100 on top');
  assert.deepEqual(pts([5, 4, 3, 3], [4, 5, 2, 2]), [0, 0, 0, 0], 'everyone falls: all contract points are 0');
  assert.deepEqual(pts([5, 4, 3, 3], [4, 5, 2, 2], [false, true]), [0, -100, 0, 0], 'a renege still costs 100 when everyone falls');
});

test('everyone falls is announced only when it is certain', () => {
  assert.equal(previewRound({ bids: [5, 4, 3, 3], tricks: [4, 5, 2, 2], scoringMethod: 'classic' }).everyoneFalls, true);
  assert.equal(previewRound({ bids: [5, 4, 3, 3], tricks: [4, 5, 2, _], scoringMethod: 'classic' }).everyoneFalls, false, 'one row still empty');
  assert.equal(previewRound({ bids: [5, 4, 3, 3], tricks: [4, 5, 2, 1], scoringMethod: 'classic' }).everyoneFalls, false, 'tricks total 12: not a legal round yet');
  assert.equal(previewRound({ bids: [5, 4, 3, 3], tricks: [5, 4, 2, 2], scoringMethod: 'classic' }).everyoneFalls, false);
});

test('while tricks are still being entered each filled row shows its own contract so far', () => {
  const preview = previewRound({ bids: [5, 4, 3, 3], tricks: [5, _, 1, _], reneges: [false, false, true, false], scoringMethod: 'progressive' });
  assert.equal(preview.complete, false);
  assert.deepEqual(preview.rows[0], { made: true, off: 0, points: contractPoints(5, 5, 'up', 'progressive'), final: false });
  assert.deepEqual(preview.rows[1], { made: null, off: null, points: null, final: false });
  assert.deepEqual(preview.rows[2], { made: false, off: 2, points: contractPoints(3, 1, 'up', 'progressive') - 100, final: false });
  assert.equal(preview.table, 'up');
});

test('the preview never throws on a half-entered or illegal round', () => {
  assert.doesNotThrow(() => previewRound({ bids: [_, _, _, _], tricks: [_, _, _, _], scoringMethod: 'classic' }));
  const illegalBids = previewRound({ bids: [4, 3, 4, 2], tricks: [4, 3, 4, 2], scoringMethod: 'classic' });
  assert.equal(illegalBids.complete, false);
  assert.equal(illegalBids.table, null);
  assert.ok(illegalBids.rows.every((r) => r.points === null));
  const over = previewRound({ bids: [5, 4, 3, 3], tricks: [5, 4, 3, 3], scoringMethod: 'classic' });
  assert.equal(over.complete, false, 'tricks total 15');
  assert.deepEqual(over.rows.map((r) => r.made), [true, true, true, true]);
});

// ---- the session's rounds ---------------------------------------------------------

test('the next round is numbered after the highest, not by counting (a deleted round leaves a gap)', () => {
  assert.equal(nextRoundNumber([]), 1);
  assert.equal(nextRoundNumber(), 1);
  assert.equal(nextRoundNumber([{ round_number: 1 }, { round_number: 2 }, { round_number: 3 }]), 4);
  assert.equal(nextRoundNumber([{ round_number: 4 }, { round_number: 3 }, { round_number: 1 }]), 5, 'round 2 was deleted');
  assert.equal(nextRoundNumber([{ round_number: '7' }, {}]), 8);
});

test('the round limit counts only scored rounds that stood', () => {
  const rounds = [{ status: 'complete' }, { status: 'cancelled' }, { status: 'complete' }, { status: 'playing' }];
  assert.deepEqual(roundLimit({ game_limit: 2 }, rounds), { limit: 2, played: 2, reached: true });
  assert.deepEqual(roundLimit({ game_limit: 3 }, rounds), { limit: 3, played: 2, reached: false });
  assert.deepEqual(roundLimit({ game_limit: null }, rounds), { limit: null, played: 2, reached: false });
  assert.deepEqual(roundLimit({}, rounds), { limit: null, played: 2, reached: false });
  assert.deepEqual(roundLimit(null, []), { limit: null, played: 0, reached: false });
  assert.deepEqual(roundLimit({ game_limit: 1 }, [{ status: 'cancelled' }]), { limit: 1, played: 0, reached: false }, 'everyone falls does not use up the limit');
});

// ---- the table picker --------------------------------------------------------------

test('Start round says what is missing', () => {
  assert.equal(startBlocker({ selected: 0, members: 7 }), 'Pick the 4 players at the table');
  assert.equal(startBlocker({ selected: 2, members: 7 }), 'Pick 4 players — 2 to go');
  assert.equal(startBlocker({ selected: 4, members: 7 }), null);
  assert.equal(startBlocker({ selected: 0, members: 3 }), 'A round needs 4 players — this group has fewer');
});

// ---- the new-session form -----------------------------------------------------------

test('a date must be a real day', () => {
  assert.equal(isRealDate('2026-11-19'), true);
  assert.equal(isRealDate('2024-02-29'), true);
  assert.equal(isRealDate('2026-02-30'), false);
  assert.equal(isRealDate('2026-13-01'), false);
  assert.equal(isRealDate('19/11/2026'), false);
  assert.equal(isRealDate(''), false);
  assert.equal(isRealDate(null), false);
});

test('the round limit is empty or a whole number from 1 to 99', () => {
  assert.equal(parseRoundLimit(''), null);
  assert.equal(parseRoundLimit('  '), null);
  assert.equal(parseRoundLimit(null), null);
  assert.equal(parseRoundLimit('2'), 2);
  assert.equal(parseRoundLimit(' 99 '), 99);
  for (const bad of ['0', '100', '-1', '2.5', 'ten', '1e1']) assert.ok(Number.isNaN(parseRoundLimit(bad)), bad);
});

test('the form stops a name of 61 characters, a blank date and a bad limit — each with its own line', () => {
  const ok = { name: 'x'.repeat(60), location: 'y'.repeat(60), date: '2026-11-19', roundLimit: '' };
  assert.deepEqual(sessionFormErrors(ok), {});
  assert.deepEqual(sessionFormErrors({ ...ok, name: '' }), {}, 'a blank name is fine: the default is used');
  assert.deepEqual(sessionFormErrors({ ...ok, name: `  ${'x'.repeat(60)}  ` }), {}, 'spaces around the name are trimmed first');
  assert.equal(sessionFormErrors({ ...ok, name: 'x'.repeat(61) }).name, 'The name can be at most 60 characters — 1 too many');
  assert.equal(sessionFormErrors({ ...ok, location: 'y'.repeat(75) }).location, 'The place can be at most 60 characters — 15 too many');
  assert.equal(sessionFormErrors({ ...ok, date: '' }).date, 'Pick the date of the session');
  assert.equal(sessionFormErrors({ ...ok, date: '2026-02-30' }).date, "That date doesn't exist — pick a real day");
  assert.equal(sessionFormErrors({ ...ok, date: '1900-01-01' }).date, 'The date must be between 2000 and 2100');
  assert.equal(sessionFormErrors({ ...ok, date: '2101-01-01' }).date, 'The date must be between 2000 and 2100');
  assert.equal(sessionFormErrors({ ...ok, date: '2000-01-01' }).date, undefined);
  assert.equal(sessionFormErrors({ ...ok, date: '2100-12-31' }).date, undefined);
  assert.equal(sessionFormErrors({ ...ok, roundLimit: '0' }).roundLimit, 'A round limit is a whole number from 1 to 99 — or leave it empty');
  assert.equal(sessionFormErrors({ ...ok, roundLimit: '2' }).roundLimit, undefined);
  assert.deepEqual(Object.keys(sessionFormErrors({ name: 'x'.repeat(61), location: '', date: '', roundLimit: 'abc' })).sort(), ['date', 'name', 'roundLimit']);
});

// ---- review round 2 -----------------------------------------------------------------

test('"to go" counts players and never stands beside a complete total (whist-player-6)', () => {
  assert.equal(saveBlocker({ tricks: [13, _, _, _] }), 'All 13 tricks are given out — enter 0 for the other 3 players');
  assert.equal(saveBlocker({ tricks: [6, 7, _, 0] }), 'All 13 tricks are given out — enter 0 for the last player');
  assert.equal(saveBlocker({ tricks: [6, _, _, _] }), 'Enter the tricks — 3 players to go');
  assert.equal(saveBlocker({ tricks: [6, 4, 2, _] }), 'Enter the tricks — 1 player to go');
  assert.equal(saveBlocker({ tricks: [10, 5, _, _] }), 'Tricks must total 13 — already 15');
});

test('a wrong trick total is an error, a missing row is not (visual-designer-5)', () => {
  assert.equal(tricksAreWrong([4, 3, 3, 2]), true);
  assert.equal(tricksAreWrong([10, 5, _, _]), true);
  assert.equal(tricksAreWrong([4, 3, _, _]), false);
  assert.equal(tricksAreWrong([4, 3, 4, 2]), false);
});

test('a tie on the top bid marks nobody and asks (whist-player-1)', () => {
  assert.deepEqual(topBidders([5, 5, 2, 2]), [0, 1]);
  assert.deepEqual(topBidders([5, _, 2, 2]), []);
  assert.equal(defaultTrumpOwnerIndex([5, 5, 2, 2], true), -1);
  assert.equal(defaultTrumpOwnerIndex([2, 6, 5, 2], true), 1);
  assert.equal(defaultTrumpOwnerIndex([2, 6, 5, 2], false), -1, 'ordinary sessions never pre-mark');
  assert.equal(lockBlocker({ bids: [5, 5, 2, 2], advanced: true }), TOP_BID_TIE_LINE);
  assert.equal(TOP_BID_TIE_LINE, 'Tie on the top bid — tap who won the auction');
  assert.equal(lockBlocker({ bids: [2, 6, 5, 2], advanced: true }), 'Mark who won the trump');
});

test('a trump winner below the top bid gets a hint, never a block (whist-player-2)', () => {
  assert.equal(trumpOwnerHint([7, 0, 6, 2], 1), 'bid 0, below the top bid of 7 — is that the right trump winner?');
  assert.equal(trumpOwnerHint([7, 0, 6, 2], 0, 'Maya'), null);
  assert.equal(trumpOwnerHint([5, 5, 2, 2], 1, 'Omer'), null, 'one of the tied top bidders is fine');
  assert.equal(trumpOwnerHint([7, _, 6, 2], 1, 'Dan'), null);
  assert.equal(lockBlocker({ bids: [7, 0, 6, 2], trump: 'clubs', trumpOwnerId: 'dan' }), null, 'not a blocker');
});

test('the results sheet follows the bidding order (scorekeeper-2)', () => {
  assert.deepEqual(biddingOrder(4, 0), [0, 1, 2, 3]);
  assert.deepEqual(biddingOrder(4, 1), [1, 2, 3, 0]);
  assert.deepEqual(biddingOrder(4, 3), [3, 0, 1, 2]);
  assert.deepEqual(biddingOrder(4, -1), [0, 1, 2, 3], 'no known first bidder: seat order');
});

test('a result line shows the renege and the failed zero as parts (whist-player-3, -4)', () => {
  // Maya bid 3, took 3, reneged; the table is UP 14.
  const bids = [4, 3, 2, 5];
  const tricks = [4, 3, 1, 5];
  const reneges = [false, true, false, false];
  const p = previewRound({ bids, tricks, reneges, scoringMethod: 'classic' });
  assert.deepEqual(outcomeParts({ bid: 3, tricks: 3, row: p.rows[1], renege: true }), { text: 'made', points: 19, renege: true, net: -81, zeroFailed: false });
  // Dan bid 0, took 3 (classic): −50 + 20.
  const z = previewRound({ bids: [7, 0, 6, 2], tricks: [7, 3, 2, 1], scoringMethod: 'classic' });
  assert.deepEqual(outcomeParts({ bid: 0, tricks: 3, row: z.rows[1] }), { text: 'zero bid failed (3 tricks)', points: -30, renege: false, net: -30, zeroFailed: true });
  assert.equal(outcomeParts({ bid: 0, tricks: 1, row: { made: false, off: 1, points: -50 } }).text, 'zero bid failed (1 trick)');
  // Everyone fell, with a renege: the contract is 0, the renege still costs 100.
  const ef = previewRound({ bids: [5, 4, 3, 3], tricks: [4, 5, 2, 2], reneges: [false, false, true, false], scoringMethod: 'classic' });
  assert.equal(ef.everyoneFalls, true);
  assert.deepEqual(outcomeParts({ bid: 3, tricks: 2, row: ef.rows[2], renege: true, everyoneFalls: true }), { text: 'everyone fell', points: 0, renege: true, net: -100, zeroFailed: false });
  assert.equal(outcomeParts({ bid: 3, tricks: null, row: { points: null } }), null);
});


// ---- the tricks pad after a correction (whist-player-1) ------------------------------

test('tricks: the pad moves to the next player with no tricks, in bidding order', () => {
  const order = [2, 3, 0, 1];
  assert.equal(nextTrickIndex([_, _, _, _], order, 2, 5), 3);
  assert.equal(nextTrickIndex([_, _, 5, 4], order, 3, 4), 0);
  assert.equal(nextTrickIndex([_, _, 5, 4], order, 0, 3), 1);
  assert.equal(nextTrickIndex([3, _, 5, 4], order, 1, 1), 1, 'the last one in: the pad stays');
});
test('tricks: a correction on a full sheet moves on, unless it pushes the total over 13', () => {
  const order = [0, 1, 2, 3];
  // 5, 0, 1, 7 = 13. The last player is changed to 8 by mistake: 14, so the pad stays there...
  assert.equal(nextTrickIndex([5, 0, 1, 7], order, 3, 8), 3);
  // ...and the next tap (7) fixes that row: 13 again, so the pad moves on round the table.
  assert.equal(nextTrickIndex([5, 0, 1, 8], order, 3, 7), 0);
  // A correction that leaves the total at or under 13 moves on, as before.
  assert.equal(nextTrickIndex([5, 0, 1, 7], order, 1, 0), 2);
  assert.equal(nextTrickIndex([5, 0, 1, 7], order, 0, 4), 1);
});

if (failures.length) {
  for (const { name, err } of failures) console.error(`FAIL ${name}\n  ${err.message}`);
  console.error(`\n${failures.length} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`round-logic: ${passed} tests passed`);
