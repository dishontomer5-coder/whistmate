// Checks that the in-app scoring help (scoring-help.js) says what the scoring engine
// (scoring.js) does and what the rulebook (docs/whist-rules.md §4) says.
// Run with:  node src/lib/scoring-help.test.mjs      (dependency-free)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  contractPoints, progressiveRate, scoreRound, tableState, bidSum, illegalLastBids,
  HIERARCHIES, SCORING_METHODS, SUIT_RANK, RENEGE_PENALTY, TOTAL_TRICKS, ILLEGAL_BID_SUM, MAX_BID,
} from './scoring.js';
import {
  SCORING_HELP, SCORING_HELP_SECTION_IDS, SCORING_METHOD_SUMMARY, SCORING_METHOD_LABEL,
  PROGRESSIVE_TIERS, CLASSIC_RATE, MADE_BONUS, CARD_ORDER_LABEL, CARD_ORDER_DETAIL, signed, signedAvg, tierRange,
  STANDINGS_HELP, HELP_SECTIONS, AWARD_HELP,
} from './scoring-help.js';

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed += 1; } catch (err) { failures.push({ name, err }); }
}

// A rich line (string, or strings mixed with { suit } tokens) as plain text.
const flat = (line) => (Array.isArray(line) ? line.map((p) => (typeof p === 'string' ? p : `<${p.suit}>`)).join('') : String(line));
const section = (id) => SCORING_HELP.find((s) => s.id === id);
const allText = (s) => [...s.lines, ...(s.facts || []).flatMap((f) => [f.label, f.value]), s.example.text].map(flat).join('\n');

// ---- shape -------------------------------------------------------------------

test('the seven sections, in order, each with a title, lines and one worked example', () => {
  assert.deepEqual(SCORING_HELP.map((s) => s.id), SCORING_HELP_SECTION_IDS);
  assert.deepEqual(SCORING_HELP_SECTION_IDS, ['contract', 'miss', 'zero', 'updown', 'everyone-falls', 'renege', 'trump']);
  for (const s of SCORING_HELP) {
    assert.ok(s.title && s.lines.length > 0, `${s.id}: title and lines`);
    assert.ok(flat(s.example.text).length > 0, `${s.id}: a worked example`);
  }
});

test('plain words: no symbols or internals in the help', () => {
  for (const s of SCORING_HELP) {
    const text = allText(s);
    for (const banned of ['Σ', 'Sigma', 're-derive', 'everyone_falls', 'table_state', 'game_limit', 'hierarchy']) {
      assert.ok(!text.includes(banned), `${s.id} contains "${banned}"`);
    }
    assert.ok(!/\bgame(s)?\b/i.test(text), `${s.id} says "game" — a hand is a round, a night is a session`);
  }
});

// ---- every stated case is re-scored by the engine ----------------------------

test('each example case scores what the help says, and the help prints that number', () => {
  let cases = 0;
  for (const s of SCORING_HELP) {
    for (const c of s.example.checks) {
      assert.equal(contractPoints(c.bid, c.tricks, c.table, c.method), c.points, `${s.id}: bid ${c.bid} took ${c.tricks} (${c.table}, ${c.method})`);
      assert.ok(allText(s).includes(signed(c.points)), `${s.id}: the text shows ${signed(c.points)}`);
      cases += 1;
    }
  }
  assert.ok(cases >= 14, `expected the examples to state at least 14 cases, got ${cases}`);
});

test('making your bid: bid × bid + bonus, for every bid', () => {
  for (let bid = 1; bid <= MAX_BID; bid++) {
    for (const method of SCORING_METHODS) {
      for (const table of ['up', 'down']) assert.equal(contractPoints(bid, bid, table, method), bid * bid + MADE_BONUS);
    }
  }
  const s = section('contract');
  assert.ok(flat(s.lines[0]).includes(`plus ${MADE_BONUS}`));
  assert.ok(flat(s.example.text).includes(`4 × 4 + ${MADE_BONUS} = ${signed(4 * 4 + MADE_BONUS)}`));
});

test('missing your bid: Classic is flat, Progressive lists every tier', () => {
  for (let miss = 1; miss <= TOTAL_TRICKS; miss++) {
    assert.equal(contractPoints(MAX_BID, MAX_BID - miss, 'down', 'classic'), -CLASSIC_RATE * miss);
    assert.equal(contractPoints(0 + miss, 0, 'up', 'classic'), -CLASSIC_RATE * miss); // over or under, same cost
  }
  // The tiers cover 1..13 with no gap or overlap and carry the engine's rate.
  let next = 1;
  for (const tier of PROGRESSIVE_TIERS) {
    assert.equal(tier.from, next);
    for (let miss = tier.from; miss <= tier.to; miss++) {
      assert.equal(progressiveRate(miss), tier.rate);
      assert.equal(contractPoints(MAX_BID, MAX_BID - miss, 'down', 'progressive'), -tier.rate * miss);
    }
    next = tier.to + 1;
  }
  assert.equal(next, TOTAL_TRICKS + 1);
  PROGRESSIVE_TIERS.slice(1).forEach((tier, i) => assert.notEqual(tier.rate, PROGRESSIVE_TIERS[i].rate));

  const facts = section('miss').facts;
  assert.ok(flat(facts[0].value).includes(signed(-CLASSIC_RATE)));
  for (const tier of PROGRESSIVE_TIERS) {
    assert.ok(flat(facts[1].value).includes(`${tierRange(tier)} off is ${signed(-tier.rate)} for each trick`), `tier ${tierRange(tier)}`);
  }
});

test('the one-line summaries of the two methods carry the same numbers', () => {
  assert.deepEqual(Object.keys(SCORING_METHOD_SUMMARY).sort(), [...SCORING_METHODS].sort());
  assert.deepEqual(Object.keys(SCORING_METHOD_LABEL).sort(), [...SCORING_METHODS].sort());
  assert.equal(SCORING_METHOD_SUMMARY.classic, `${signed(-CLASSIC_RATE)} for each trick off`);
  for (const tier of PROGRESSIVE_TIERS) {
    assert.ok(SCORING_METHOD_SUMMARY.progressive.includes(`${signed(-tier.rate)} each for ${tierRange(tier)}`));
  }
});

test('bidding zero: made on a down table, made on an up table, failed', () => {
  const [down, up, failed] = section('zero').facts;
  assert.equal(flat(down.value), signed(contractPoints(0, 0, 'down', 'classic')));
  assert.equal(flat(up.value), signed(contractPoints(0, 0, 'up', 'progressive')));
  assert.ok(/down table/.test(down.label) && /up table/.test(up.label));
  const first = contractPoints(0, 1, 'up', 'classic');
  const back = contractPoints(0, 2, 'up', 'classic') - first;
  assert.ok(flat(failed.value).includes(`${signed(first)} for the first trick`));
  assert.ok(flat(failed.value).includes(`then ${back} back for each trick`));
  // "back for each trick after it" holds all the way up.
  for (let tricks = 2; tricks <= TOTAL_TRICKS; tricks++) {
    assert.equal(contractPoints(0, tricks, 'down', 'progressive'), first + back * (tricks - 1));
  }
});

test('up and down tables: the two examples, the limits and the blocked last bid', () => {
  const s = section('updown');
  for (const t of s.example.tables) {
    assert.equal(bidSum(t.bids), t.total);
    assert.equal(tableState(t.bids), t.state);
    assert.ok(flat(s.example.text).includes(`total ${t.total}: ${t.state.toUpperCase()}`));
  }
  assert.deepEqual(s.example.tables.map((t) => t.state).sort(), ['down', 'up']);
  assert.deepEqual(illegalLastBids(s.example.blocked.first), [s.example.blocked.blocked]);
  assert.ok(flat(s.example.text).includes(`can't bid ${s.example.blocked.blocked}`));
  // "14 or more is up, 12 or fewer is down, 13 is not allowed."
  assert.equal(tableState([ILLEGAL_BID_SUM + 1, 0, 0, 0]), 'up');
  assert.equal(tableState([ILLEGAL_BID_SUM - 1, 0, 0, 0]), 'down');
  assert.equal(tableState([ILLEGAL_BID_SUM, 0, 0, 0]), null);
  const text = allText(s);
  assert.ok(text.includes(`${ILLEGAL_BID_SUM + 1} or more`) && text.includes(`${ILLEGAL_BID_SUM - 1} or fewer`));
  assert.ok(text.includes(`can't total ${ILLEGAL_BID_SUM}`));
  assert.ok(text.includes(`A hand has ${TOTAL_TRICKS} tricks`));
});

// Re-score a whole example round and compare it with what the help stored and printed.
function rescored(round) {
  const players = round.bids.map((bid, i) => ({ bid, tricks_won: round.tricks[i], reneged: round.reneged.includes(i) }));
  return scoreRound({ players, scoringMethod: round.method });
}

test('everyone falls: all four miss, all four score 0', () => {
  const s = section('everyone-falls');
  const round = s.example.round;
  const again = rescored(round);
  assert.equal(again.everyoneFalls, true);
  assert.deepEqual(again.results.map((r) => r.points), round.points);
  assert.deepEqual(round.points, [0, 0, 0, 0]);
  assert.ok(again.results.every((r) => r.contractPoints < 0), 'each player would have lost points');
  assert.ok(flat(s.example.text).includes(round.contractPoints.map(signed).join(', ')));
  assert.ok(flat(s.example.text).includes(`everyone scores ${round.points.map(signed).join(', ')}`));
});

test('renege: the penalty is added to the bid score, and survives everyone falls', () => {
  const s = section('renege');
  assert.ok(allText(s).includes(`loses ${RENEGE_PENALTY} points`));
  const [made, fallen] = s.example.rounds;
  const madeAgain = rescored(made);
  assert.equal(madeAgain.everyoneFalls, false);
  assert.equal(madeAgain.results[0].points, madeAgain.results[0].contractPoints - RENEGE_PENALTY);
  assert.equal(madeAgain.results[0].points, made.points[0]);
  assert.ok(flat(s.example.text).includes(`${signed(made.contractPoints[0])} − ${RENEGE_PENALTY} = ${signed(made.points[0])}`));
  const fallenAgain = rescored(fallen);
  assert.equal(fallenAgain.everyoneFalls, true);
  assert.equal(fallenAgain.results[0].points, -RENEGE_PENALTY);
  assert.equal(fallen.points[0], -RENEGE_PENALTY);
  assert.ok(flat(s.example.text).includes(`everyone fell: ${signed(-RENEGE_PENALTY)}`));
});

test('trump and card order: the auction order and both card orders', () => {
  const s = section('trump');
  const order = s.example.auctionOrder;
  assert.deepEqual(order, ['clubs', 'diamonds', 'hearts', 'spades', 'notrump']);
  order.forEach((suit, i) => assert.equal(SUIT_RANK[suit], i));
  const orderLine = s.lines.find((l) => Array.isArray(l));
  assert.deepEqual(orderLine.filter((p) => typeof p !== 'string').map((p) => p.suit), order);
  // "5♠ beats 5♥, and no trump beats both."
  assert.ok(SUIT_RANK.spades > SUIT_RANK.hearts && SUIT_RANK.notrump > SUIT_RANK.spades);
  assert.deepEqual(Object.keys(CARD_ORDER_LABEL), HIERARCHIES);
  assert.deepEqual(Object.keys(CARD_ORDER_DETAIL), HIERARCHIES);
  assert.deepEqual(s.facts.map((f) => f.label), HIERARCHIES.map((h) => CARD_ORDER_LABEL[h]));
});

// ---- the rulebook says the same ------------------------------------------------

const rulebook = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/whist-rules.md'), 'utf8',
);
const section4 = rulebook.slice(rulebook.indexOf('## 4. Scoring'), rulebook.indexOf('## 5. '));
const num = (text) => Number(String(text).replace('−', '-').replace('+', ''));

test('rulebook §4.1: the made-bid formula and its examples', () => {
  assert.ok(section4.includes('Score = (bid × bid) + 10'));
  assert.equal(MADE_BONUS, 10);
  const examples = [...section4.matchAll(/bid (\d+) and take \d+ → [^=]*= \*\*(\d+)\*\*/gi)];
  assert.ok(examples.length >= 2);
  for (const [, bid, points] of examples) assert.equal(contractPoints(Number(bid), Number(bid), 'down', 'classic'), Number(points));
});

test('rulebook §4.2: Classic rate and every Progressive tier', () => {
  assert.ok(section4.includes(`**−${CLASSIC_RATE} points for every trick you were off.**`));
  const rows = [...section4.matchAll(/\| ([^|]+?) \| −(\d+) each \| miss (\d+) → −(\d+) \|/g)];
  assert.equal(rows.length, PROGRESSIVE_TIERS.length, 'one rulebook row per tier');
  rows.forEach(([, , rate, miss, total], i) => {
    const tier = PROGRESSIVE_TIERS[i];
    assert.equal(Number(rate), tier.rate);
    assert.ok(Number(miss) >= tier.from && Number(miss) <= tier.to);
    assert.equal(contractPoints(MAX_BID, MAX_BID - Number(miss), 'down', 'progressive'), -Number(total));
  });
});

test('rulebook §4.3: zero bids', () => {
  const down = /Table \*\*DOWN\*\* → \*\*([+−]\d+)\*\*/.exec(section4);
  const up = /Table \*\*UP\*\* → \*\*([+−]\d+)\*\*/.exec(section4);
  assert.equal(num(down[1]), contractPoints(0, 0, 'down', 'classic'));
  assert.equal(num(up[1]), contractPoints(0, 0, 'up', 'classic'));
  const failed = [...section4.matchAll(/[Tt]ook (\d) → \*\*(−\d+)\*\*/g)];
  assert.ok(failed.length >= 3, 'the rulebook lists what a failed zero costs');
  for (const [, tricks, points] of failed) {
    assert.equal(contractPoints(0, Number(tricks), 'up', 'classic'), num(points));
  }
});

test('rulebook §4.5 and §4.6: the renege penalty and the worked round', () => {
  assert.ok(section4.includes(`flat **−${RENEGE_PENALTY}**`));
  const bids = /Bids ([\d /]+) \(total/.exec(section4)[1].split('/').map((n) => Number(n.trim()));
  const tricks = /Tricks taken ([\d /]+) \(total/.exec(section4)[1].split('/').map((n) => Number(n.trim()));
  const stated = [...section4.matchAll(/- P\d bid \d+, took \d+ → .*\*\*([+−]\d+)\*\*/g)].map((m) => num(m[1]));
  const scored = scoreRound({ players: bids.map((bid, i) => ({ bid, tricks_won: tricks[i] })), scoringMethod: 'classic' });
  assert.equal(stated.length, 4);
  assert.deepEqual(scored.results.map((r) => r.points), stated);
});

// ---- the standings section ---------------------------------------------------

test('standings: explains total, average, wins, behind, the small figure and every award', () => {
  const s = STANDINGS_HELP;
  assert.equal(s.id, 'standings');
  assert.deepEqual(HELP_SECTIONS.map((x) => x.id), [...SCORING_HELP_SECTION_IDS, 'standings']);
  const labels = s.facts.map((f) => f.label);
  for (const label of ['Total', 'Average per round', 'Wins', 'Behind', 'The small figure']) assert.ok(labels.includes(label), label);
  assert.deepEqual(AWARD_HELP.map((a) => a.key), ['greedy', 'coward', 'destroyer']);
  for (const a of AWARD_HELP) assert.ok(labels.includes(a.title), a.title);
  const text = allText(s);
  assert.ok(text.includes('everyone fell counts as a round played'));
  assert.ok(text.includes('tie for first is a shared win'));
  assert.ok(!/\bgame(s)?\b/i.test(text), 'a night is a session');
  // The worked row: the average is the total over the rounds, the everyone-falls round included.
  const { roundPoints, total, avg } = s.example;
  assert.equal(roundPoints.reduce((a, b) => a + b, 0), total);
  assert.equal(avg, Math.round((total / roundPoints.length) * 10) / 10);
  assert.ok(flat(s.example.text).includes(`total ${signed(total)}, average ${signedAvg(avg)}`));
  assert.equal(signedAvg(2), '+2.0'); // a whole average keeps its decimal
  assert.equal(signedAvg(-0.54), '−0.5');
});

// ---- report --------------------------------------------------------------------

if (failures.length) {
  for (const { name, err } of failures) console.error(`FAIL  ${name}\n      ${err.message}`);
  console.error(`\n${failures.length} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`scoring-help: ${passed} passed`);
