// The rules of the round-entry screens that are not scoring: where the cursor goes next,
// which number is blocked, why a button is off, what a round will score before it is
// saved, what the next round is called. Pure and dependency-free apart from scoring.js
// (relative imports only), so `node src/components/round/round-logic.test.mjs` runs it bare.
//
// Scoring itself is never re-implemented here: every point comes out of scoring.js.
import {
  scoreRound,
  contractPoints,
  madeContract,
  tableState,
  isBidSumLegal,
  isTricksTotalLegal,
  ILLEGAL_BID_SUM,
  MAX_BID,
  RENEGE_PENALTY,
  TOTAL_TRICKS,
} from '../../lib/scoring.js';

const isSet = (v) => v !== null && v !== undefined;
const sum = (values) => values.reduce((s, v) => s + (Number(v) || 0), 0);

// --- the cursor -------------------------------------------------------------------

// The next row to fill after the one just entered: the first row after `from` that has no
// value yet, going round the table and wrapping past the end. So bidding can start from any
// player and carries on in table order (3 → 4 → 1 → 2). -1 when every row is filled.
// `values` already holds the value just entered. Pass from = -1 for "the first empty row".
export function nextEmptyIndex(values, from) {
  const n = values.length;
  for (let step = 1; step <= n; step++) {
    const i = (((from + step) % n) + n) % n;
    if (!isSet(values[i])) return i;
  }
  return -1;
}

// The list moved on by `by` places: rotateLeft([a, b, c, d]) → [b, c, d, a].
export function rotateLeft(list, by = 1) {
  const n = list.length;
  if (n === 0) return [];
  const k = ((by % n) + n) % n;
  return [...list.slice(k), ...list.slice(0, k)];
}

// "Same players as last round": the same four, with the bidding order moved on by one —
// whoever bid second last time bids first now. `previousResults` are that round's
// RoundResult rows. [] when it did not have four players.
export function sameTableOrder(previousResults = []) {
  const ids = [...previousResults]
    .sort((a, b) => (a.bid_order ?? 0) - (b.bid_order ?? 0))
    .map((r) => r.player_id);
  return ids.length === 4 ? rotateLeft(ids, 1) : [];
}

// --- bids -------------------------------------------------------------------------

// The one number the player at `index` may not bid: the other three bids are in, and this
// number would make the four total exactly 13. null when nothing is blocked. It applies to
// whichever row is entered last, and also when a bid is changed afterwards.
export function blockedBid(bidValues, index) {
  const others = bidValues.filter((_, i) => i !== index);
  if (others.length !== 3 || !others.every(isSet)) return null;
  const forbidden = ILLEGAL_BID_SUM - sum(others);
  return forbidden >= 0 && forbidden <= MAX_BID ? forbidden : null;
}

// Why "Lock bids" (or saving edited bids) is off — one plain line, or null when it can go
// ahead. `bids` are the four values in table order (null = not entered).
export function lockBlocker({ bids, advanced = false, trump = null, trumpOwnerId = null, hierarchy = null }) {
  const missing = bids.filter((v) => !isSet(v)).length;
  if (missing === bids.length) return 'Enter a bid for each player';
  if (missing > 0) return `Enter the bids — ${missing} to go`;
  if (!isBidSumLegal(bids.map(Number))) return "The bids can't total 13 — change one";
  if (advanced) {
    // Advanced rules: every round records who won the trump, the suit and the card order.
    if (!trumpOwnerId) return 'Mark who won the trump';
    if (!trump) return 'Pick the trump suit';
    if (!hierarchy) return 'Choose the card order';
    return null;
  }
  // Ordinary sessions: trump is optional, but half a record is not saved silently.
  if (trumpOwnerId && !trump) return 'Pick the trump suit, or remove the trump mark';
  if (trump && !trumpOwnerId) return 'Mark who won the trump';
  return null;
}

// --- tricks -----------------------------------------------------------------------

// Why "Save round" is off — one plain line, or null. `tricks` are the four values in table order.
export function saveBlocker({ tricks }) {
  const missing = tricks.filter((v) => !isSet(v)).length;
  if (missing === tricks.length) return 'Enter the tricks each player took';
  if (missing > 0) return `Enter the tricks — ${missing} to go`;
  const total = sum(tricks);
  if (total !== TOTAL_TRICKS) return `Tricks must total ${TOTAL_TRICKS} — now ${total}`;
  return null;
}

// What the round will score, before it is saved.
//
// Once all four tricks are in and total 13 the answer is scoreRound()'s — the very code
// the server mirrors — so the numbers on screen are the numbers that will be stored,
// "everyone falls" included. Until then each row that has its tricks shows what its own
// contract is worth so far (`final: false`): that can still drop to 0 if it turns out
// nobody made their bid.
//
// Returns { complete, everyoneFalls, table, rows: [{ made, off, points, final }] } with
// made / off / points null on a row whose tricks are not entered.
export function previewRound({ bids, tricks, reneges = [], scoringMethod }) {
  const bidsLegal = bids.every(isSet) && isBidSumLegal(bids.map(Number));
  const table = bidsLegal ? tableState(bids.map(Number)) : null;
  const complete = bidsLegal && tricks.every(isSet) && isTricksTotalLegal(tricks.map(Number));

  if (complete) {
    const scored = scoreRound({
      players: bids.map((bid, i) => ({ bid: Number(bid), tricks_won: Number(tricks[i]), reneged: !!reneges[i] })),
      scoringMethod,
    });
    return {
      complete: true,
      everyoneFalls: scored.everyoneFalls,
      table,
      rows: scored.results.map((r) => ({
        made: r.madeContract,
        off: Math.abs(r.tricks_won - r.bid),
        points: r.points,
        final: true,
      })),
    };
  }

  const method = scoringMethod === 'progressive' ? 'progressive' : 'classic';
  return {
    complete: false,
    everyoneFalls: false,
    table,
    rows: bids.map((bid, i) => {
      if (!bidsLegal || !isSet(tricks[i])) return { made: null, off: null, points: null, final: false };
      const b = Number(bid);
      const t = Number(tricks[i]);
      return {
        made: madeContract(b, t),
        off: Math.abs(t - b),
        points: contractPoints(b, t, table, method) - (reneges[i] ? RENEGE_PENALTY : 0),
        final: false,
      };
    }),
  };
}

// --- the session's rounds ---------------------------------------------------------

// The number the next round will get: one more than the highest so far, which is how the
// server numbers it (a deleted round leaves a gap; numbers never repeat).
export function nextRoundNumber(rounds = []) {
  return rounds.reduce((max, r) => Math.max(max, Number(r.round_number) || 0), 0) + 1;
}

// The session's round limit, if it has one. Only scored rounds that stood count toward
// it — an "everyone falls" round is cancelled and does not (the server's rule in startRound).
// → { limit: number|null, played, reached }
export function roundLimit(session, rounds = []) {
  const raw = session?.game_limit;
  const limit = raw === null || raw === undefined || raw === '' || !Number.isFinite(Number(raw)) ? null : Number(raw);
  const played = rounds.filter((r) => r.status === 'complete').length;
  return { limit, played, reached: limit !== null && played >= limit };
}

// --- the table picker --------------------------------------------------------------

// Why "Start round" is off, or null.
export function startBlocker({ selected, members }) {
  if (members < 4) return 'A round needs 4 players — this group has fewer';
  if (selected < 4) return selected === 0 ? 'Pick the 4 players at the table' : `Pick 4 players — ${4 - selected} to go`;
  return null;
}

// --- the new-session form -----------------------------------------------------------

// The limits startSession enforces, checked in the form first so the scorer is told at
// the field instead of after the request.
export const SESSION_TEXT_MAX = 60;
export const SESSION_DATE_MIN = '2000-01-01';
export const SESSION_DATE_MAX = '2100-12-31';
export const ROUND_LIMIT_MIN = 1;
export const ROUND_LIMIT_MAX = 99;

// A real calendar day written YYYY-MM-DD (2026-02-30 is not one).
export function isRealDate(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text ?? ''));
  if (!m) return false;
  const day = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === m[0];
}

// The round limit as typed: '' → no limit (null); a whole number 1–99 → that number;
// anything else → NaN.
export function parseRoundLimit(text) {
  const raw = String(text ?? '').trim();
  if (raw === '') return null;
  if (!/^\d+$/.test(raw)) return NaN;
  const n = Number(raw);
  return n >= ROUND_LIMIT_MIN && n <= ROUND_LIMIT_MAX ? n : NaN;
}

// One message per field that cannot be sent as it is; a field that is fine is absent.
// → { name?, location?, date?, roundLimit? }
export function sessionFormErrors({ name = '', location = '', date = '', roundLimit: limitText = '' }) {
  const errors = {};
  const tooLong = (text) => text.trim().length - SESSION_TEXT_MAX;
  if (tooLong(name) > 0) errors.name = `The name can be at most ${SESSION_TEXT_MAX} characters — ${tooLong(name)} too many`;
  if (tooLong(location) > 0) errors.location = `The place can be at most ${SESSION_TEXT_MAX} characters — ${tooLong(location)} too many`;
  if (!String(date).trim()) errors.date = 'Pick the date of the session';
  else if (!isRealDate(date)) errors.date = "That date doesn't exist — pick a real day";
  else if (date < SESSION_DATE_MIN || date > SESSION_DATE_MAX) errors.date = 'The date must be between 2000 and 2100';
  if (Number.isNaN(parseRoundLimit(limitText))) {
    errors.roundLimit = `A round limit is a whole number from ${ROUND_LIMIT_MIN} to ${ROUND_LIMIT_MAX} — or leave it empty`;
  }
  return errors;
}
