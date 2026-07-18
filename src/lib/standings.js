import { rankSession } from '@/lib/whist-stats';

// Build leaderboard standings from RoundResult rows.
// rows: [{ player_id, player_name, points, session_id }]  (points may be null for unscored)
// nameById: optional map player_id -> display name (falls back to row.player_name)
// Returns [{ player_id, player_name, total_score, avg_score, rounds_played, wins }].
export function buildStandings(rows, nameById = {}) {
  const scored = rows.filter((r) => r.points != null);
  const byPlayer = {};
  for (const r of scored) {
    const p = (byPlayer[r.player_id] ||= {
      player_id: r.player_id,
      player_name: nameById[r.player_id] || r.player_name || 'Player',
      total_score: 0,
      rounds_played: 0,
    });
    p.total_score += Number(r.points) || 0;
    p.rounds_played += 1;
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
  }));
}
