// Whist statistics aggregation — pure + dependency-free (like scoring.js), so it
// runs in the frontend, is mirrored by the backend stats functions, and is
// node-testable offline (whist-stats.test.mjs). No imports, no I/O.
//
// Metrics (design.md §Metrics / plan §5):
//   Performance: total_score, avg_score, rounds_played, win_ratio, podiums.
//   Strategy: contract_accuracy, zero_bid_success_rate, bid_aggressiveness.
//   Awards: greedy_loss (points lost taking too FEW tricks), coward_loss (points
//           lost taking too MANY), destroyer_count (everyone-falls rounds played).

/** Sum a numeric field over rows. */
function sumBy(rows, f) {
  return rows.reduce((s, r) => s + (Number(f(r)) || 0), 0);
}

/**
 * Per-player round metrics.
 * @param {Array<{bid:number, tricks_won:number, points:number, reneged?:boolean, everyone_falls?:boolean}>} rows
 *        a player's scored RoundResult rows (points != null). Rows may carry the
 *        round's everyone_falls flag for the Destroyer award.
 */
export function playerMetrics(rows) {
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
  const destroyerCount = scored.filter((r) => r.everyone_falls).length;

  const round2 = (n) => Math.round(n * 100) / 100;
  return {
    rounds_played: roundsPlayed,
    total_score: totalScore,
    avg_score: roundsPlayed ? round2(totalScore / roundsPlayed) : 0,
    contract_accuracy: roundsPlayed ? round2(made / roundsPlayed) : 0,
    made_count: made,
    zero_bids: zeroBids.length,
    zero_bid_success: zeroBidSuccess,
    zero_bid_success_rate: zeroBids.length ? round2(zeroBidSuccess / zeroBids.length) : 0,
    bid_aggressiveness: roundsPlayed ? round2(sumBy(scored, (r) => r.bid) / roundsPlayed) : 0,
    greedy_loss: round2(greedyLoss),
    coward_loss: round2(cowardLoss),
    destroyer_count: destroyerCount,
  };
}

/**
 * Rank players within a single session by their total points.
 * @param {Array<{player_id:string, points:number}>} rows all RoundResult rows of a session.
 * @returns {Map<player_id, {total:number, rank:number}>} standard competition ranking
 *          (ties share the lower rank: 1,2,2,4).
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
 * Win/podium tally for a player across many sessions.
 * @param {Array<Map>} rankedSessions results of rankSession() per session the player was in.
 * @param {string} playerId
 */
export function winPodiumTally(rankedSessions, playerId) {
  let sessions = 0;
  let wins = 0;
  let podiums = 0;
  for (const ranking of rankedSessions) {
    const mine = ranking.get(playerId);
    if (!mine) continue;
    sessions += 1;
    if (mine.rank === 1) wins += 1;
    if (mine.rank <= 3) podiums += 1;
  }
  const round2 = (n) => Math.round(n * 100) / 100;
  return {
    sessions_played: sessions,
    wins,
    podiums,
    win_ratio: sessions ? round2(wins / sessions) : 0,
  };
}
