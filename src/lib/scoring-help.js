// "How scoring works" — the words of the in-app scoring help, as data.
//
// Every number in here is COMPUTED from scoring.js (the engine that actually scores a
// round), never typed, so the help cannot drift from the scores it explains. If a rule in
// scoring.js changes, the sentences change with it; scoring-help.test.mjs also checks the
// worked examples against the engine and against docs/whist-rules.md §4.
//
// Pure and dependency-free like scoring.js (a relative import only), so the test runs
// with bare `node`. The component that draws it is src/components/ScoringHelp.jsx.
//
// Shape:  SCORING_HELP = [{ id, title, lines, example, facts? }]
//   lines / example.text / facts[].value are "rich lines": a string, or an array of
//   strings and { suit: 'hearts' } tokens (the component draws a token with <Suit>).
//   example.checks lists the cases the example states, in a form the test can re-score.

import {
  contractPoints,
  progressiveRate,
  scoreRound,
  tableState,
  bidSum,
  HIERARCHIES,
  ILLEGAL_BID_SUM,
  MAX_BID,
  RENEGE_PENALTY,
  SUIT_RANK,
  TOTAL_TRICKS,
} from './scoring.js';

// The sections, in the order they are shown. Open the help at one of them with
// <ScoringHelp section="updown" />.
export const SCORING_HELP_SECTION_IDS = ['contract', 'miss', 'zero', 'updown', 'everyone-falls', 'renege', 'trump'];

// "+26", "−10", "0" — with a real minus sign, which is easier to see than a hyphen.
export function signed(points) {
  const v = Number(points) || 0;
  if (v > 0) return `+${v}`;
  if (v < 0) return `−${Math.abs(v)}`;
  return '0';
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const list = (numbers) => numbers.join(', ');

// --- numbers read off the engine ---------------------------------------------

// What a made bid of `bid` scores (the table and the method do not matter for a made bid > 0).
const made = (bid) => contractPoints(bid, bid, 'down', 'classic');
// What missing by `miss` tricks costs under a method (bid 13, so any miss up to 13 fits).
const missed = (miss, method) => contractPoints(MAX_BID, MAX_BID - miss, 'down', method);

// A made bid scores bid × bid plus this bonus (read off a made bid of 1).
export const MADE_BONUS = made(1) - 1;

// Classic: the same penalty for every trick off.
export const CLASSIC_RATE = Math.abs(missed(1, 'classic'));

// Progressive: the per-trick penalty by how far the bid was missed, as ranges —
// [{ from: 1, to: 4, rate: 5 }, { from: 5, to: 5, rate: 10 }, …, { from: 7, to: 13, rate: 20 }].
// Built by walking every possible miss, so a new tier in scoring.js shows up here by itself.
export const PROGRESSIVE_TIERS = (() => {
  const tiers = [];
  for (let miss = 1; miss <= TOTAL_TRICKS; miss++) {
    const rate = progressiveRate(miss);
    const last = tiers[tiers.length - 1];
    if (last && last.rate === rate) last.to = miss;
    else tiers.push({ from: miss, to: miss, rate });
  }
  return tiers;
})();

// "1–4", "5", "7 or more" — how a tier's range is said.
export function tierRange(tier) {
  if (tier.to === TOTAL_TRICKS && tier.from !== tier.to) return `${tier.from} or more`;
  return tier.from === tier.to ? `${tier.from}` : `${tier.from}–${tier.to}`;
}

// One line per scoring method, with its numbers — for the help, and for anywhere the
// method is chosen or shown (the new-session form, the session header).
//   classic:      "−10 for each trick off"
//   progressive:  "−5 each for 1–4 off, −10 each for 5, −15 each for 6, −20 each for 7 or more"
export const SCORING_METHOD_SUMMARY = {
  classic: `${signed(-CLASSIC_RATE)} for each trick off`,
  progressive: PROGRESSIVE_TIERS
    .map((tier, i) => `${signed(-tier.rate)} each for ${tierRange(tier)}${i === 0 ? ' off' : ''}`)
    .join(', '),
};

export const SCORING_METHOD_LABEL = { classic: 'Classic', progressive: 'Progressive' };

// The two card orders of the advanced rules, in plain words (keys = HIERARCHIES in scoring.js).
export const CARD_ORDER_LABEL = {
  standard: 'Ace high',
  down_up: 'Ace high, then 2 up to King',
};
export const CARD_ORDER_DETAIL = {
  standard: 'Ace, King, Queen, Jack, 10 … down to 2. The 2 is the weakest card.',
  down_up: 'Ace, then 2, 3, 4 … up to the King. The King is the weakest card.',
};

// The five calls in auction order, lowest first (clubs … no trump).
const AUCTION_ORDER = Object.keys(SUIT_RANK).sort((a, b) => SUIT_RANK[a] - SUIT_RANK[b]);

// Zero bids.
const ZERO_MADE_DOWN = contractPoints(0, 0, 'down', 'classic');
const ZERO_MADE_UP = contractPoints(0, 0, 'up', 'classic');
const zeroFailed = (tricks) => contractPoints(0, tricks, 'down', 'classic');

// --- the worked examples ------------------------------------------------------

// A whole round, scored by the engine. Returns the engine's result plus what each player
// WOULD have scored on their bid alone (to show what "everyone falls" wipes out).
function playRound(bids, tricks, { method = 'classic', reneged = [] } = {}) {
  const players = bids.map((bid, i) => ({ bid, tricks_won: tricks[i], reneged: reneged.includes(i) }));
  const scored = scoreRound({ players, scoringMethod: method });
  return {
    bids, tricks, method, reneged,
    table: scored.tableState,
    everyoneFalls: scored.everyoneFalls,
    points: scored.results.map((r) => r.points),
    contractPoints: scored.results.map((r) => r.contractPoints),
  };
}

function buildSections() {
  // 1. Made the bid.
  const madeBid = 4;
  const ladder = [1, 3, 5, 7].map((bid) => ({ bid, points: made(bid) }));

  // 2. Missed the bid: the same small miss under both methods, then a big one.
  const smallMiss = { bid: 5, tricks: 3 };
  const bigMiss = { bid: 8, tricks: 2 };
  const off = (c) => Math.abs(c.tricks - c.bid);
  const missCase = (c, method) => ({ ...c, table: 'down', method, points: contractPoints(c.bid, c.tricks, 'down', method) });
  const missChecks = [
    missCase(smallMiss, 'classic'), missCase(smallMiss, 'progressive'),
    missCase(bigMiss, 'classic'), missCase(bigMiss, 'progressive'),
  ];

  // 4. Up and down tables.
  const downBids = [4, 3, 3, 2];
  const upBids = [5, 4, 3, 3];
  const lastBidBlocked = { first: [4, 3, 4], blocked: ILLEGAL_BID_SUM - bidSum([4, 3, 4]) };

  // 5. Everyone falls: an up table where all four miss by one.
  const fallen = playRound(upBids, [4, 5, 2, 2]);

  // 6. Renege: the same hand played twice, once with the reneger making the bid and once
  //    inside an everyone-falls round.
  const renegeMade = playRound([3, 4, 3, 2], [3, 4, 2, 4], { reneged: [0] });
  const renegeFallen = playRound(upBids, [4, 5, 2, 2], { reneged: [0] });

  return [
    {
      id: 'contract',
      title: 'Making your bid',
      lines: [
        `Take exactly the number of tricks you bid and you score your bid times itself, plus ${MADE_BONUS}.`,
        `The bigger the bid you make, the more it is worth: ${ladder.map((l) => `a made ${l.bid} is ${signed(l.points)}`).join(', ')}.`,
      ],
      example: {
        text: `Bid ${madeBid}, took ${madeBid}: ${madeBid} × ${madeBid} + ${MADE_BONUS} = ${signed(made(madeBid))}.`,
        checks: [
          { bid: madeBid, tricks: madeBid, table: 'down', method: 'classic', points: made(madeBid) },
          ...ladder.map((l) => ({ bid: l.bid, tricks: l.bid, table: 'up', method: 'progressive', points: l.points })),
        ],
      },
    },
    {
      id: 'miss',
      title: 'Missing your bid',
      lines: [
        'Take more tricks or fewer tricks than you bid and you lose points for every trick you were off. How many depends on the scoring method, which is chosen when the session starts.',
      ],
      facts: [
        { label: SCORING_METHOD_LABEL.classic, value: `${signed(-CLASSIC_RATE)} for each trick off, however many.` },
        {
          label: SCORING_METHOD_LABEL.progressive,
          value: `A small miss is cheap and a big one is costly: ${PROGRESSIVE_TIERS
            .map((tier) => `${tierRange(tier)} off is ${signed(-tier.rate)} for each trick`)
            .join('; ')}.`,
        },
      ],
      example: {
        text:
          `Bid ${smallMiss.bid}, took ${smallMiss.tricks} (${off(smallMiss)} off): ${signed(missChecks[0].points)} with Classic, ${signed(missChecks[1].points)} with Progressive. ` +
          `Bid ${bigMiss.bid}, took ${bigMiss.tricks} (${off(bigMiss)} off): ${signed(missChecks[2].points)} with Classic, ${signed(missChecks[3].points)} with Progressive.`,
        checks: missChecks,
      },
    },
    {
      id: 'zero',
      title: 'Bidding zero',
      lines: [
        'A bid of 0 is a promise to take no tricks at all.',
        'A zero is worth more on a down table: tricks are going spare there, so staying empty-handed is harder.',
      ],
      facts: [
        { label: 'Made on a down table', value: `${signed(ZERO_MADE_DOWN)}` },
        { label: 'Made on an up table', value: `${signed(ZERO_MADE_UP)}` },
        {
          label: 'Failed',
          value: `${signed(zeroFailed(1))} for the first trick you take, then ${zeroFailed(2) - zeroFailed(1)} back for each trick after it.`,
        },
      ],
      example: {
        text: `Bid 0 and took ${plural(1, 'trick')}: ${signed(zeroFailed(1))}. Took 2: ${signed(zeroFailed(2))}. Took 3: ${signed(zeroFailed(3))}.`,
        checks: [
          { bid: 0, tricks: 0, table: 'down', method: 'classic', points: ZERO_MADE_DOWN },
          { bid: 0, tricks: 0, table: 'up', method: 'classic', points: ZERO_MADE_UP },
          ...[1, 2, 3].map((tricks) => ({ bid: 0, tricks, table: 'up', method: 'progressive', points: zeroFailed(tricks) })),
        ],
      },
    },
    {
      id: 'updown',
      title: 'Up and down tables',
      lines: [
        `A hand has ${TOTAL_TRICKS} tricks. Add up the four bids.`,
        `${ILLEGAL_BID_SUM + 1} or more and the table is UP: more tricks are promised than there are, so somebody has to miss.`,
        `${ILLEGAL_BID_SUM - 1} or fewer and the table is DOWN: some tricks are promised to nobody.`,
        `The bids can't total ${ILLEGAL_BID_SUM}. The last player to bid can't pick the number that would make exactly ${ILLEGAL_BID_SUM}, so a table is always up or down.`,
        `It decides what a made zero bid is worth: ${signed(ZERO_MADE_DOWN)} on a down table, ${signed(ZERO_MADE_UP)} on an up table.`,
      ],
      example: {
        text:
          `Bids ${list(downBids)} total ${bidSum(downBids)}: ${tableState(downBids).toUpperCase()}. ` +
          `Bids ${list(upBids)} total ${bidSum(upBids)}: ${tableState(upBids).toUpperCase()}. ` +
          `After bids of ${list(lastBidBlocked.first)}, the fourth player can't bid ${lastBidBlocked.blocked}.`,
        tables: [
          { bids: downBids, total: bidSum(downBids), state: tableState(downBids) },
          { bids: upBids, total: bidSum(upBids), state: tableState(upBids) },
        ],
        blocked: lastBidBlocked,
        checks: [],
      },
    },
    {
      id: 'everyone-falls',
      title: 'Everyone falls',
      lines: [
        'If nobody at the table makes their bid, the round is cancelled: every player scores 0 for it, however far off they were. A made zero bid counts as making it.',
        "A cancelled round doesn't count toward the session's round limit.",
      ],
      example: {
        text:
          `Bids ${list(fallen.bids)}, tricks taken ${list(fallen.tricks)}. All four missed, so instead of ${list(fallen.contractPoints.map(signed))} everyone scores ${list(fallen.points.map(signed))}.`,
        round: fallen,
        checks: [],
      },
    },
    {
      id: 'renege',
      title: 'Renege',
      lines: [
        'A renege is not following suit when you could have.',
        `The player who reneged loses ${RENEGE_PENALTY} points for that round, on top of whatever their bid scored. It still applies when everyone falls.`,
      ],
      example: {
        text:
          `Bid ${renegeMade.bids[0]}, took ${renegeMade.tricks[0]} and reneged: ${signed(renegeMade.contractPoints[0])} − ${RENEGE_PENALTY} = ${signed(renegeMade.points[0])}. ` +
          `Reneged in a round where everyone fell: ${signed(renegeFallen.points[0])}.`,
        rounds: [renegeMade, renegeFallen],
        checks: [],
      },
    },
    {
      id: 'trump',
      title: 'Trump and card order',
      lines: [
        'The player who wins the bidding names the trump suit. While the hand is played, any trump card beats any card of another suit. With no trump, a trick goes to the highest card of the suit that was led.',
        [
          'When two players bid the same number, the suit decides. From lowest to highest: ',
          ...AUCTION_ORDER.flatMap((suit, i) => (i === 0 ? [{ suit }] : [' ', { suit }])),
          '.',
        ],
        'WhistMate records who won the trump and which suit they named. It does not decide who takes a trick: the table does.',
        'Card order is part of the advanced rules, which a session can turn on. The trump winner then also chooses the order of the cards for that round:',
      ],
      facts: HIERARCHIES.map((h) => ({ label: CARD_ORDER_LABEL[h], value: CARD_ORDER_DETAIL[h] })),
      example: {
        text: ['A bid of 5', { suit: 'spades' }, ' beats a bid of 5', { suit: 'hearts' }, ', and 5 no trump beats both.'],
        auctionOrder: AUCTION_ORDER,
        checks: [],
      },
    },
  ];
}

export const SCORING_HELP = buildSections();
