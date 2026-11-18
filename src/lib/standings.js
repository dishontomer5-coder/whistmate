// Standings and award holders for a list of RoundResult rows — pure, no I/O, node-testable
// (standings.test.mjs). The import is relative so plain node can load this file too.
import { rankSession, awardFigures, awardLeaders, rate } from './whist-stats.js';

// Newest session first: by session_date, then by when it was created.
function newestFirst(a, b) {
  const held = (s) => new Date(s.session_date || s.created_date || 0).getTime() || 0;
  const created = (s) => new Date(s.created_date || 0).getTime() || 0;
  return held(b) - held(a) || created(b) - created(a);
}

// Build leaderboard standings from RoundResult rows.
//
// rows:      [{ player_id, player_name, points, session_id }] — unscored rows (points == null) are ignored.
// nameById:  optional map player_id -> display name (falls back to row.player_name).
// options.sessions:  the Session records the rows belong to, [{ id, name, status, session_date, created_date }].
//            A WIN IS A CLOSED SESSION FINISHED IN FIRST PLACE, so this is how the function
//            knows which sessions can be won: only one listed here with status 'closed'
//            gives a win or a podium. A session that is open — or not listed — gives none.
// options.deltaSessionId:  optional — force which session `session_delta` refers to.
//            Left out, it is the open session when that has scored rounds ("tonight"),
//            otherwise the most recent closed session with scored rounds — and none at all
//            when the rows are from a single session, where it would only repeat the total.
//
// Returns one row per player, best total first:
//   player_id, player_name
//   total_score, avg_score, rounds_played   every scored round, the open session's included
//   rank            place by total_score; tied players share it (1, 2, 2, 4)
//   gap_to_leader   the leader's total minus this one (0 for the leader and anyone level)
//   wins, podiums   closed sessions finished 1st / in the top 3
//   sessions_played closed sessions the player scored in (what win_ratio divides by)
//   win_ratio       wins / sessions_played, or null when no session is closed yet
//   leading         true while the player is first (or level first) in a session that is still open
//   session_delta   the player's points in delta_session; null when they did not score in it
//   delta_session   { id, name, status } of the session session_delta refers to — the same
//                   on every row — or null when there is none
export function buildStandings(rows, nameById = {}, { sessions = [], deltaSessionId = null } = {}) {
  const scored = rows.filter((r) => r.points != null);
  const sessionById = {};
  sessions.forEach((s) => { if (s) sessionById[s.id] = s; });

  const bySession = {};
  scored.forEach((r) => { (bySession[r.session_id] ||= []).push(r); });

  // Which session the small figure beside a total refers to. When every scored row is from
  // one session (a session's own standings, or a group's first night) there is none: the
  // figure would only repeat the total.
  const withScores = sessions.filter((s) => s && bySession[s.id]).sort(newestFirst);
  const severalSessions = Object.keys(bySession).length > 1;
  const deltaId = deltaSessionId
    || (severalSessions && (withScores.find((s) => s.status === 'open') || withScores.find((s) => s.status === 'closed') || {}).id)
    || null;
  const deltaSession = deltaId
    ? { id: deltaId, name: sessionById[deltaId]?.name ?? null, status: sessionById[deltaId]?.status ?? null }
    : null;

  const byPlayer = {};
  for (const r of scored) {
    const p = (byPlayer[r.player_id] ||= {
      player_id: r.player_id,
      player_name: nameById[r.player_id] || r.player_name || 'Player',
      total_score: 0,
      rounds_played: 0,
      wins: 0,
      podiums: 0,
      sessions_played: 0,
      leading: false,
      session_delta: null,
    });
    p.total_score += Number(r.points) || 0;
    p.rounds_played += 1;
    if (deltaId && r.session_id === deltaId) p.session_delta = (p.session_delta || 0) + (Number(r.points) || 0);
  }

  // Wins and podiums come from closed sessions only. In a session that is still open the
  // top player is leading — that is not a win yet, and it can change with the next round.
  for (const [sessionId, sessionRows] of Object.entries(bySession)) {
    const status = sessionById[sessionId]?.status;
    if (status !== 'closed' && status !== 'open') continue;
    rankSession(sessionRows).forEach(({ rank }, playerId) => {
      const p = byPlayer[playerId];
      if (status === 'open') {
        if (rank === 1) p.leading = true;
        return;
      }
      p.sessions_played += 1;
      if (rank === 1) p.wins += 1;
      if (rank <= 3) p.podiums += 1;
    });
  }

  const table = Object.values(byPlayer).sort((a, b) => (
    b.total_score - a.total_score || (a.player_name < b.player_name ? -1 : a.player_name > b.player_name ? 1 : 0)
  ));
  const leaderTotal = table.length ? table[0].total_score : 0;
  let rank = 0;
  let prevTotal = null;
  return table.map((p, i) => {
    if (prevTotal === null || p.total_score < prevTotal) rank = i + 1; // tied players keep the rank above
    prevTotal = p.total_score;
    return {
      ...p,
      avg_score: p.rounds_played ? Math.round((p.total_score / p.rounds_played) * 100) / 100 : 0,
      rank,
      gap_to_leader: leaderTotal - p.total_score,
      win_ratio: rate(p.wins, p.sessions_played),
      delta_session: deltaSession,
    };
  });
}

// Who holds each group award (from RoundResult rows).
// rounds: the Game records of those rows, [{ id, everyone_falls, trump_suit, highest_bidder_player_id }]
//   — The Destroyer needs them to know which rounds were everyone-falls and who bid highest.
// Returns { greedy, coward, destroyer } — each { value, holders: [{ player_id, name }] },
// or null when nobody has earned the award. A tie lists every holder.
//   The Greedy    = most points lost taking too FEW tricks  (renege rounds excluded)
//   The Coward    = most points lost taking too MANY tricks (renege rounds excluded)
//   The Destroyer = most everyone-falls rounds as the top bidder: the recorded trump
//                   winner, or every player level on the highest bid when none is recorded.
export function computeAwardLeaders(rows, rounds = [], nameById = {}) {
  const names = {};
  for (const r of rows) names[r.player_id] ||= nameById[r.player_id] || r.player_name || 'Player';
  return awardLeaders(awardFigures(rows, rounds), names);
}
