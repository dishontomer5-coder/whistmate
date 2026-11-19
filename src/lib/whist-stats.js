// Whist statistics — pure and dependency-free (like scoring.js): no imports, no I/O. It
// runs in the frontend and is node-testable offline (whist-stats.test.mjs).
//
// The backend stats functions cannot import from src/ (Deno), so the block between the two
// MIRROR markers below is copied WORD FOR WORD into
//   base44/functions/computePlayerStats/entry.ts  and  base44/functions/computeGlobalStats/entry.ts
// (there without the `export` keywords). scripts/functions-access.test.mjs fails when a
// copy differs from this file: change the code here, then paste the block there.
//
// What the numbers mean:
//   Performance  total_score, avg_score, rounds_played — every scored round, including the
//                rounds of a session that is still open.
//                wins, podiums, sessions_played, win_ratio — CLOSED sessions only. A session
//                is won when it is closed with the player in first place; while it is open
//                the top player is only leading. A session in which no round counted (every
//                scored round was everyone-falls) has no result: no win, no podium, and it
//                is not in sessions_played either.
//   Strategy     contract_accuracy, zero_bid_success_rate, bid_aggressiveness.
//   Rates        null when there is nothing to count (no rounds, no zero bids, no closed
//                session) — never 0, which would read as "always fails".
//   Awards       greedy_loss (points lost taking too FEW tricks), coward_loss (points lost
//                taking too MANY), destroyer_count (everyone-falls rounds as the top bidder).
//                A tie names every holder; an award nobody has earned has no holder.
//   Ranks        tied players share a rank: 1, 2, 2, 4.

// <<< BEGIN MIRROR — copied into computePlayerStats and computeGlobalStats; keep identical >>>
const round2 = (n) => Math.round(n * 100) / 100;

/** Sum a numeric field over rows. */
function sumBy(rows, f) {
  return rows.reduce((s, r) => s + (Number(f(r)) || 0), 0);
}

/** part / whole to two decimals — or null when there is nothing to count (whole is 0). */
export function rate(part, whole) {
  return whole > 0 ? round2(part / whole) : null;
}

/**
 * One player's round metrics.
 * @param {Array<{bid:number, tricks_won:number, points:number, reneged?:boolean}>} rows
 *        the player's RoundResult rows; unscored ones (points == null) are ignored.
 * @returns contract_accuracy and zero_bid_success_rate are null when there is nothing to
 *          count; made_count / rounds_played and zero_bid_success / zero_bids are the counts
 *          behind them.
 */
export function playerMetrics(rows) {
  // Every scored round counts, and that includes an everyone-falls (cancelled) round: the
  // hand was played and scored zero, so it stays in rounds played, in the average and — as
  // a miss — in contract accuracy. Leaving it out would make "rounds" disagree with the
  // rounds the player sat in.
  const scored = rows.filter((r) => r.points != null && r.bid != null && r.tricks_won != null);
  const roundsPlayed = scored.length;
  const totalScore = sumBy(scored, (r) => r.points);
  const made = scored.filter((r) => r.tricks_won === r.bid).length;
  const zeroBids = scored.filter((r) => r.bid === 0);
  const zeroBidSuccess = zeroBids.filter((r) => r.tricks_won === 0).length;

  // Awards ignore renege rounds so the -100 doesn't distort the greedy/coward split.
  const greedyLoss = sumBy(
    scored.filter((r) => !r.reneged && r.tricks_won < r.bid && r.points < 0),
    (r) => -r.points,
  );
  const cowardLoss = sumBy(
    scored.filter((r) => !r.reneged && r.tricks_won > r.bid && r.points < 0),
    (r) => -r.points,
  );

  return {
    rounds_played: roundsPlayed,
    total_score: totalScore,
    avg_score: roundsPlayed ? round2(totalScore / roundsPlayed) : 0,
    contract_accuracy: rate(made, roundsPlayed),
    made_count: made,
    zero_bids: zeroBids.length,
    zero_bid_success: zeroBidSuccess,
    zero_bid_success_rate: rate(zeroBidSuccess, zeroBids.length),
    bid_aggressiveness: roundsPlayed ? round2(sumBy(scored, (r) => r.bid) / roundsPlayed) : 0,
    greedy_loss: round2(greedyLoss),
    coward_loss: round2(cowardLoss),
  };
}

/**
 * Rank players within a single session by their total points.
 * @param {Array<{player_id:string, points:number}>} rows all RoundResult rows of a session.
 * @returns {Map<player_id, {total:number, rank:number}>} standard competition ranking:
 *          tied players share a rank and the next one is skipped (1, 2, 2, 4).
 */
export function rankSession(rows) {
  const totals = {};
  for (const r of rows) {
    totals[r.player_id] = (totals[r.player_id] || 0) + (Number(r.points) || 0);
  }
  const sorted = Object.entries(totals)
    .map(([player_id, total]) => ({ player_id, total }))
    .sort((a, b) => b.total - a.total);
  const out = new Map();
  let rank = 0;
  let prevTotal = null;
  sorted.forEach((row, i) => {
    if (prevTotal === null || row.total < prevTotal) rank = i + 1; // ties keep prior rank
    prevTotal = row.total;
    out.set(row.player_id, { total: row.total, rank });
  });
  return out;
}

/**
 * Did at least one round of a session count? A round in which nobody made their contract
 * is everyone-falls: cancelled, scored zero. A session whose every scored round fell has
 * no result — nobody wins it, nobody gets a podium, nobody is leading it.
 * "Made" is scoring.js's madeContract: took exactly the bid (a zero bid taking no trick
 * included). A round counts when any of its players made it, so the session counts when
 * any scored row did. A row that does not say its bid and tricks is taken as counted.
 * @param {Array<{bid:number, tricks_won:number, points:number}>} rows RoundResult rows of ONE
 *        session (unscored ones are ignored).
 * @returns {boolean} false when there is no scored round at all, too.
 */
export function sessionHasResult(rows) {
  return rows.some((r) => r.points != null && (r.bid == null || r.tricks_won == null || r.tricks_won === r.bid));
}

/**
 * Who answers for an everyone-falls round (The Destroyer): the player recorded as the
 * trump winner, or — when none is recorded — every player who bid the highest number.
 * A trump winner counts as recorded only when the round has a trump suit: without one,
 * highest_bidder_player_id is just the server's default (the first of the highest bids)
 * and would name one of several level bidders at random.
 * @param {Array<{player_id:string, bid:number}>} roundRows all RoundResult rows of ONE round.
 * @param {{trump_suit?:string|null, highest_bidder_player_id?:string|null}} [round] its Game record.
 * @returns {string[]} player ids — one, or every player level on the highest bid.
 */
export function topBidders(roundRows, round) {
  const seated = roundRows.filter((r) => r.bid != null);
  const recorded = round && round.trump_suit ? round.highest_bidder_player_id : null;
  if (recorded && seated.some((r) => r.player_id === recorded)) return [recorded];
  if (seated.length === 0) return [];
  const top = Math.max(...seated.map((r) => Number(r.bid) || 0));
  return seated.filter((r) => (Number(r.bid) || 0) === top).map((r) => r.player_id);
}

/**
 * The three award figures of every player found in `rows`.
 * @param {Array} rows RoundResult rows of any players and rounds (unscored ones are ignored).
 * @param {Array<{id:string, everyone_falls?:boolean, trump_suit?:string|null, highest_bidder_player_id?:string|null}>} rounds
 *        the Game records of those rounds — The Destroyer needs to know which rounds were
 *        everyone-falls and who the top bidder was.
 * @returns {Object<string, {greedy_loss:number, coward_loss:number, destroyer_count:number}>} by player id.
 */
export function awardFigures(rows, rounds = []) {
  const scored = rows.filter((r) => r.points != null && r.bid != null && r.tricks_won != null);
  const figures = {};
  const of = (playerId) => (figures[playerId] ||= { greedy_loss: 0, coward_loss: 0, destroyer_count: 0 });
  for (const r of scored) {
    const mine = of(r.player_id);
    // Same split as playerMetrics: renege rounds are left out.
    if (r.reneged || !(r.points < 0)) continue;
    if (r.tricks_won < r.bid) mine.greedy_loss = round2(mine.greedy_loss - r.points);
    else if (r.tricks_won > r.bid) mine.coward_loss = round2(mine.coward_loss - r.points);
  }
  // The Destroyer: each everyone-falls round counts once for its top bidder(s).
  const fallen = {};
  rounds.forEach((g) => { if (g && g.everyone_falls) fallen[g.id] = g; });
  const byRound = {};
  for (const r of scored) if (fallen[r.game_id]) (byRound[r.game_id] ||= []).push(r);
  for (const gameId of Object.keys(byRound)) {
    for (const playerId of topBidders(byRound[gameId], fallen[gameId])) of(playerId).destroyer_count += 1;
  }
  return figures;
}

/**
 * Who holds each group award.
 * @param {Object} figures awardFigures() of the whole group.
 * @param {Object<string,string>} [nameById] player id -> display name.
 * @returns {{greedy:object|null, coward:object|null, destroyer:object|null}} each award is
 *          { value, holders: [{ player_id, name }] } — every player level on the top figure,
 *          in name order — or null when nobody has earned it (the top figure is 0).
 */
export function awardLeaders(figures, nameById = {}) {
  const leader = (field) => {
    const value = Math.max(0, ...Object.values(figures).map((f) => f[field] || 0));
    if (!(value > 0)) return null;
    const holders = Object.keys(figures)
      .filter((playerId) => figures[playerId][field] === value)
      .map((playerId) => ({ player_id: playerId, name: nameById[playerId] || 'Player' }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.player_id < b.player_id ? -1 : 1));
    return { value, holders };
  };
  return { greedy: leader('greedy_loss'), coward: leader('coward_loss'), destroyer: leader('destroyer_count') };
}

/** The awards a player holds right now (alone or shared): some of 'greedy', 'coward', 'destroyer'. */
export function heldAwards(leaders, playerId) {
  return ['greedy', 'coward', 'destroyer'].filter(
    (key) => leaders[key] && leaders[key].holders.some((h) => h.player_id === playerId),
  );
}

/** When a session was held, for sorting: its session_date, then when it was created. */
function sessionTime(session) {
  if (!session) return [0, 0];
  const held = new Date(session.session_date || session.created_date || 0).getTime() || 0;
  return [held, new Date(session.created_date || 0).getTime() || 0];
}

/**
 * A player's nights: one entry per session they have a scored round in, newest first.
 * @param {Array} rows RoundResult rows of those sessions — EVERY player's, or the ranks are
 *        wrong (unscored rows are ignored).
 * @param {Array<{id:string, name?:string, session_date?:string, status?:string, created_date?:string}>} sessions
 * @param {string} playerId
 * @returns {Array<{session_id:string, name:string|null, session_date:string|null, status:string|null, total:number, rank:number, players:number, no_winner:boolean}>}
 *          total = the player's points that night; rank = their place among the `players`
 *          who scored in it (ties share a rank). status is 'open' or 'closed' (null when the
 *          session record is missing). In an open session the rank is where the player
 *          stands for now — not a result. no_winner = no round of the session counted
 *          (sessionHasResult): the rank is then no result either, open or closed.
 */
export function playerSessions(rows, sessions, playerId) {
  const sessionById = {};
  sessions.forEach((s) => { if (s) sessionById[s.id] = s; });
  const bySession = {};
  for (const r of rows) {
    if (r.points == null || !r.session_id) continue;
    (bySession[r.session_id] ||= []).push(r);
  }
  const entries = [];
  for (const sessionId of Object.keys(bySession)) {
    const ranking = rankSession(bySession[sessionId]);
    const mine = ranking.get(playerId);
    if (!mine) continue;
    const session = sessionById[sessionId] || {};
    entries.push({
      session_id: sessionId,
      name: session.name ?? null,
      session_date: session.session_date ?? null,
      status: session.status ?? null,
      total: mine.total,
      rank: mine.rank,
      players: ranking.size,
      no_winner: !sessionHasResult(bySession[sessionId]),
    });
  }
  return entries.sort((a, b) => {
    const [heldA, createdA] = sessionTime(sessionById[a.session_id]);
    const [heldB, createdB] = sessionTime(sessionById[b.session_id]);
    return heldB - heldA || createdB - createdA || (a.session_id < b.session_id ? -1 : 1);
  });
}

/**
 * Wins, podiums and the best and worst night, from playerSessions() entries.
 * Only CLOSED sessions count: a session is won when it is closed with the player in first
 * place. While it is open the top player is only leading, so an open session gives no
 * win, no podium and no best or worst night — and is not in the win-rate denominator.
 * A closed session with no_winner (no round counted) gives none of these either.
 * @returns {{sessions_played:number, sessions_open:number, wins:number, podiums:number, win_ratio:number|null, best_session:object|null, worst_session:object|null}}
 *          sessions_played = closed sessions with a result (what win_ratio divides by; null when 0).
 *          best_session / worst_session = the closed entry with the highest / lowest total
 *          (the more recent one on a tie; the same entry when only one session is closed).
 */
export function sessionRecord(entries) {
  const closed = entries.filter((e) => e.status === 'closed' && !e.no_winner);
  const wins = closed.filter((e) => e.rank === 1).length;
  let best = null;
  let worst = null;
  for (const e of closed) {
    if (!best || e.total > best.total) best = e;
    if (!worst || e.total < worst.total) worst = e;
  }
  return {
    sessions_played: closed.length,
    sessions_open: entries.filter((e) => e.status === 'open').length,
    wins,
    podiums: closed.filter((e) => e.rank <= 3).length,
    win_ratio: rate(wins, closed.length),
    best_session: best,
    worst_session: worst,
  };
}
// <<< END MIRROR >>>

/**
 * Win/podium tally for a player from ready-made session rankings.
 * @param {Array<Map>} rankedSessions rankSession() of each CLOSED session the player was
 *        in that has a result (sessionHasResult) — an open session has no winner yet, and
 *        one where no round counted has none at all, so leave them out (sessionRecord() does
 *        that by itself when given playerSessions() entries).
 * @param {string} playerId
 * @returns win_ratio is null when the player is in none of the sessions.
 */
export function winPodiumTally(rankedSessions, playerId) {
  const entries = [];
  for (const ranking of rankedSessions) {
    const mine = ranking.get(playerId);
    if (mine) entries.push({ status: 'closed', total: mine.total, rank: mine.rank });
  }
  const { sessions_played, wins, podiums, win_ratio } = sessionRecord(entries);
  return { sessions_played, wins, podiums, win_ratio };
}
