import { rankSession } from '@/lib/whist-stats';

// Build leaderboard standings from RoundResult rows.
// rows: [{ player_id, player_name, points, session_id }]  (points may be null for unscored)
// nameById: optional map player_id -> display name (falls back to row.player_name)
// latestSessionId: optional — the most recent session; each player's net points in it
//   are returned as `session_delta` (how much their overall score moved this session).
// Returns [{ player_id, player_name, total_score, avg_score, rounds_played, wins, session_delta }].
export function buildStandings(rows, nameById = {}, latestSessionId = null) {
  const scored = rows.filter((r) => r.points != null);
  const byPlayer = {};
  for (const r of scored) {
    const p = (byPlayer[r.player_id] ||= {
      player_id: r.player_id,
      player_name: nameById[r.player_id] || r.player_name || 'Player',
      total_score: 0,
      rounds_played: 0,
      session_delta: 0,
    });
    p.total_score += Number(r.points) || 0;
    p.rounds_played += 1;
    if (latestSessionId && r.session_id === latestSessionId) {
      p.session_delta += Number(r.points) || 0;
    }
  }

  // Wins = sessions in which the player finished #1.
  const bySession = {};
  scored.forEach((r) => { (bySession[r.session_id] ||= []).push(r); });
  const winsBy = {};
  Object.values(bySession).forEach((sessionRows) => {
    const ranking = rankSession(sessionRows);
    ranking.forEach((v, pid) => { if (v.rank === 1) winsBy[pid] = (winsBy[pid] || 0) + 1; });
  });

  return Object.values(byPlayer).map((p) => ({
    ...p,
    avg_score: p.rounds_played ? Math.round((p.total_score / p.rounds_played) * 100) / 100 : 0,
    wins: winsBy[p.player_id] || 0,
    // Only meaningful when a latest session was supplied and the player was in it.
    session_delta: latestSessionId ? p.session_delta : null,
  }));
}

// Award leaders for a group (from RoundResult rows).
// everyoneFallsGameIds: Set of game_ids whose round was everyone-falls (for The Destroyer).
// Returns { greedy, coward, destroyer } — each { player_id, player_name, value } or null.
// The Greedy = most points lost taking too FEW tricks; The Coward = too MANY;
// The Destroyer = most everyone-falls rounds played. Renege rounds excluded from greedy/coward.
export function computeAwardLeaders(rows, everyoneFallsGameIds = new Set(), nameById = {}) {
  const byPlayer = {};
  for (const r of rows) {
    if (r.points == null || r.bid == null || r.tricks_won == null) continue;
    const p = (byPlayer[r.player_id] ||= {
      player_id: r.player_id,
      player_name: nameById[r.player_id] || r.player_name || 'Player',
      greedy: 0, coward: 0, destroyer: 0,
    });
    if (!r.reneged && r.points < 0) {
      if (r.tricks_won < r.bid) p.greedy += -r.points;
      else if (r.tricks_won > r.bid) p.coward += -r.points;
    }
    if (everyoneFallsGameIds.has(r.game_id)) p.destroyer += 1;
  }
  const players = Object.values(byPlayer);
  const leader = (key) => {
    const top = players.filter((p) => p[key] > 0).sort((a, b) => b[key] - a[key])[0];
    return top ? { player_id: top.player_id, player_name: top.player_name, value: top[key] } : null;
  };
  return { greedy: leader('greedy'), coward: leader('coward'), destroyer: leader('destroyer') };
}
