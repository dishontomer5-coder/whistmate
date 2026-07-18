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
