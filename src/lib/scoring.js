// Israeli Whist scoring engine — the single source of scoring truth.
//
// PURE + dependency-free by design (design.md): this module has no imports and no
// I/O so it runs identically in the Vite frontend (bid/result preview) and the
// Base44/Deno backend (settle), and is testable with bare `node` (see
// scoring.test.mjs). Do not add imports or side effects here.
//
// Rules (see design.md §"Scoring engine"):
//   Table state from the 4 bids: sum >= 14 -> UP, sum <= 12 -> DOWN. Sum = 13 is
//   illegal and blocked at entry. Actual tricks across the 4 players total 13.
//   - Exact contract (bid > 0, tricks == bid): bid^2 + 10
//   - Missed (bid > 0, tricks != bid), miss m = |tricks - bid|:
//       classic:     -10 * m
//       progressive: -rate(m) * m,  rate: m in 1..4 ->5, 5 ->10, 6 ->15, 7..13 ->20
//   - Zero bid (bid == 0):
//       success (tricks == 0): DOWN -> +50, UP -> +25
//       failure (tricks >= 1): -50 + 10 * (tricks - 1)
//   - Everyone Falls: if NO player made their contract (a 0-bid success counts as
//     "made"), the round is cancelled -> all contract points zeroed.
//   - Renege (failure to follow suit): -100, additive, independent of everyone-falls.

export const SUITS = ['spades', 'hearts', 'diamonds', 'clubs', 'notrump'];
export const HIERARCHIES = ['standard', 'down_up'];
export const SCORING_METHODS = ['classic', 'progressive'];
export const MIN_BID = 0;
export const MAX_BID = 13;
export const TOTAL_TRICKS = 13;
export const ILLEGAL_BID_SUM = 13;
export const RENEGE_PENALTY = 100;

// --- Table state ------------------------------------------------------------

/** Sum of the four bids. Accepts an array of numbers. */
export function bidSum(bids) {
  return bids.reduce((s, b) => s + (Number(b) || 0), 0);
}

/**
 * 'up' when the table is over-booked (sum >= 14), 'down' when under-booked
 * (sum <= 12). Returns null for the illegal sum of 13.
 */
export function tableState(bids) {
  const sum = bidSum(bids);
  if (sum === ILLEGAL_BID_SUM) return null;
  return sum >= 14 ? 'up' : 'down';
}

// --- Validators (shared by UI gates + backend guards) -----------------------

/** A single bid must be an integer in [0, 13]. */
export function isValidBid(bid) {
  return Number.isInteger(bid) && bid >= MIN_BID && bid <= MAX_BID;
}

/** The four bids are legal iff each is in range and their sum != 13. */
export function isBidSumLegal(bids) {
  if (!Array.isArray(bids) || bids.length !== 4) return false;
  if (!bids.every(isValidBid)) return false;
  return bidSum(bids) !== ILLEGAL_BID_SUM;
}

/**
 * Given the first three bids already entered, the set of bids the FINAL (4th)
 * bidder may NOT choose — the value(s) that would make the total exactly 13.
 * Returns an array (0 or 1 elements) of forbidden bids in [0, 13].
 */
export function illegalLastBids(firstThreeBids) {
  const partial = bidSum(firstThreeBids);
  const forbidden = ILLEGAL_BID_SUM - partial;
  return forbidden >= MIN_BID && forbidden <= MAX_BID ? [forbidden] : [];
}

/** The four tricks-won values are legal iff each is in range and they sum to 13. */
export function isTricksTotalLegal(tricks) {
  if (!Array.isArray(tricks) || tricks.length !== 4) return false;
  if (!tricks.every((t) => Number.isInteger(t) && t >= 0 && t <= TOTAL_TRICKS)) return false;
  return tricks.reduce((s, t) => s + t, 0) === TOTAL_TRICKS;
}

// --- Per-player contract scoring --------------------------------------------

/** Progressive per-trick penalty rate as a function of miss size m (>=1). */
export function progressiveRate(m) {
  if (m <= 0) return 0;
  if (m <= 4) return 5;
  if (m === 5) return 10;
  if (m === 6) return 15;
  return 20; // 7..13
}

/**
 * Did this player "make" their contract? (Used for the everyone-falls test.)
 * A 0-bid succeeds by taking exactly 0 tricks; a positive bid succeeds by taking
 * exactly that many.
 */
export function madeContract(bid, tricksWon) {
  return tricksWon === bid;
}

/**
 * Contract points for one player, BEFORE the everyone-falls zeroing and BEFORE
 * the renege penalty. `tableStateValue` is 'up' | 'down' (needed for 0-bids).
 * `scoringMethod` is 'classic' | 'progressive'.
 */
export function contractPoints(bid, tricksWon, tableStateValue, scoringMethod) {
  if (bid === 0) {
    if (tricksWon === 0) {
      return tableStateValue === 'down' ? 50 : 25; // success bonus by table state
    }
    // failure: -50 for the first trick, +10 returned per subsequent trick
    return -50 + 10 * (tricksWon - 1);
  }
  // positive contract
  if (tricksWon === bid) {
    return bid * bid + 10; // exact
  }
  const miss = Math.abs(tricksWon - bid);
  if (scoringMethod === 'progressive') {
    return -progressiveRate(miss) * miss;
  }
  return -10 * miss; // classic
}

// --- Round orchestration ----------------------------------------------------

/**
 * Score a whole round.
 *
 * @param {Object} round
 * @param {Array<{player_id?, bid:number, tricks_won:number, reneged?:boolean}>} round.players
 *        exactly 4 players.
 * @param {string} round.scoringMethod 'classic' | 'progressive'
 * @param {Object} [opts]
 * @param {boolean} [opts.renegeIndependentOfEveryoneFalls=true] keep the -100
 *        renege penalty even when the round is cancelled by everyone-falls.
 * @returns {{
 *   tableState: 'up'|'down'|null,
 *   everyoneFalls: boolean,
 *   results: Array<{player_id?, bid, tricks_won, reneged, madeContract, contractPoints, points}>,
 * }}
 * @throws if bids or tricks are illegal (callers should pre-validate with the
 *         exported validators, but the engine refuses to score garbage).
 */
export function scoreRound(round, opts = {}) {
  const renegeIndependent = opts.renegeIndependentOfEveryoneFalls !== false;
  const players = round.players || [];
  if (players.length !== 4) {
    throw new Error(`scoreRound expects exactly 4 players, got ${players.length}`);
  }
  const bids = players.map((p) => Number(p.bid));
  const tricks = players.map((p) => Number(p.tricks_won));

  if (!isBidSumLegal(bids)) {
    throw new Error(`Illegal bids ${JSON.stringify(bids)} (each 0-13, sum != 13)`);
  }
  if (!isTricksTotalLegal(tricks)) {
    throw new Error(`Illegal tricks ${JSON.stringify(tricks)} (each 0-13, sum must be 13)`);
  }

  const ts = tableState(bids);
  const scoringMethod = round.scoringMethod === 'progressive' ? 'progressive' : 'classic';

  // First pass: contract points + made-flags.
  const pre = players.map((p) => {
    const bid = Number(p.bid);
    const tricksWon = Number(p.tricks_won);
    return {
      ...p,
      bid,
      tricks_won: tricksWon,
      reneged: !!p.reneged,
      madeContract: madeContract(bid, tricksWon),
      contractPoints: contractPoints(bid, tricksWon, ts, scoringMethod),
    };
  });

  // Everyone falls: nobody made their contract -> cancel (zero contract points).
  const everyoneFalls = pre.every((r) => !r.madeContract);

  const results = pre.map((r) => {
    const base = everyoneFalls ? 0 : r.contractPoints;
    const renege = r.reneged ? -RENEGE_PENALTY : 0;
    // If renege is NOT independent, a cancelled round zeroes the penalty too.
    const points = everyoneFalls && !renegeIndependent ? 0 : base + renege;
    return { ...r, points };
  });

  return { tableState: ts, everyoneFalls, results };
}

/** Convenience: which player index has the highest bid (ties -> earliest bid_order). */
export function highestBidderIndex(players) {
  let best = -1;
  let bestBid = -Infinity;
  players.forEach((p, i) => {
    const b = Number(p.bid) || 0;
    if (b > bestBid) {
      bestBid = b;
      best = i;
    }
  });
  return best;
}
