import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Per-player whist stats for a group. Aggregation MIRRORS src/lib/whist-stats.js
// (Deno can't import src/) — keep in sync.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const playerId = body.player_id;
    let groupId = body.group_id || null;
    if (!playerId) return Response.json({ error: 'player_id is required' }, { status: 400 });

    // GroupMember is the canonical identity; the group comes from it, never from the
    // request (P12-1): a caller-supplied group_id used to be what membership was checked
    // against, which let a member of one group fetch another group's player.
    const memberRow = await base44.asServiceRole.entities.GroupMember.get(playerId).catch(() => null);
    if (!memberRow) return Response.json({ error: 'Player not found' }, { status: 404 });
    if (groupId && groupId !== memberRow.group_id) return Response.json({ error: 'Player not found' }, { status: 404 });
    groupId = memberRow.group_id;
    // claim_token stays on the server.
    const { claim_token: _claimToken, ...publicRow } = memberRow;
    const player = { ...publicRow, name: memberRow.player_name };

    // Members of the group may view; self-view + app admin bypass.
    const isSelfView = !!player.user_id && player.user_id === user.id;
    if (user.role !== 'admin' && !isSelfView) {
      const rows = await base44.asServiceRole.entities.GroupMember.filter({ user_id: user.id });
      let isMember = rows.some((m) => m.group_id === groupId);
      if (!isMember) {
        // The user-record cache is only a hint for read-after-write lag: the hinted row
        // is re-read by id and must really be the caller's.
        const hint = (user.groups || []).find((g) => g && g.group_id === groupId && g.member_id);
        const row = hint ? await base44.asServiceRole.entities.GroupMember.get(hint.member_id).catch(() => null) : null;
        isMember = !!row && row.user_id === user.id && row.group_id === groupId;
      }
      if (!isMember) return Response.json({ error: 'You are not a member of this group' }, { status: 403 });
    }

    const empty = {
      player,
      performance: { total_score: 0, avg_score: 0, rounds_played: 0, sessions_played: 0, wins: 0, podiums: 0, win_ratio: 0 },
      strategy: { contract_accuracy: 0, zero_bids: 0, zero_bid_success: 0, zero_bid_success_rate: 0, bid_aggressiveness: 0 },
      awards: { greedy_loss: 0, coward_loss: 0, destroyer_count: 0 },
      timeline: [],
    };

    // All of this player's round results (paginated past the 500-row page cap).
    const PAGE = 500;
    const myRows = [];
    const seen = new Set();
    let cursor = null;
    for (let guard = 0; guard < 40; guard++) {
      const q = cursor ? { player_id: playerId, created_date: { $lte: cursor } } : { player_id: playerId };
      const page = await base44.asServiceRole.entities.RoundResult.filter(q, '-created_date', PAGE);
      const fresh = page.filter((r) => !seen.has(r.id));
      fresh.forEach((r) => { seen.add(r.id); myRows.push(r); });
      if (page.length < PAGE || fresh.length === 0) break;
      cursor = page[page.length - 1].created_date;
    }
    // Group scope + only scored rows (points set on complete/cancelled rounds).
    const scoped = myRows.filter((r) => (!groupId || r.group_id === groupId) && r.points != null && r.bid != null && r.tricks_won != null);
    if (scoped.length === 0) return Response.json(empty);

    // Round everyone_falls + created_date for the Destroyer award and timeline order.
    const gameIds = [...new Set(scoped.map((r) => r.game_id))];
    const games = await Promise.all(gameIds.map((gid) => base44.asServiceRole.entities.Game.get(gid).catch(() => null)));
    const gameMap = {};
    games.forEach((g) => { if (g) gameMap[g.id] = g; });

    const round2 = (n) => Math.round(n * 100) / 100;
    const sumBy = (rows, f) => rows.reduce((s, r) => s + (Number(f(r)) || 0), 0);

    // --- playerMetrics mirror ---
    const made = scoped.filter((r) => r.tricks_won === r.bid).length;
    const zeroBids = scoped.filter((r) => r.bid === 0);
    const zeroBidSuccess = zeroBids.filter((r) => r.tricks_won === 0).length;
    const totalScore = sumBy(scoped, (r) => r.points);
    const greedyLoss = sumBy(scoped.filter((r) => !r.reneged && r.tricks_won < r.bid && r.points < 0), (r) => -r.points);
    const cowardLoss = sumBy(scoped.filter((r) => !r.reneged && r.tricks_won > r.bid && r.points < 0), (r) => -r.points);
    const destroyerCount = scoped.filter((r) => gameMap[r.game_id]?.everyone_falls).length;

    // --- win/podium via per-session ranking mirror ---
    const sessionIds = [...new Set(scoped.map((r) => r.session_id).filter(Boolean))];
    let sessionRows = [];
    if (sessionIds.length > 0) {
      sessionRows = await base44.asServiceRole.entities.RoundResult.filter(
        { session_id: { $in: sessionIds } }, '-created_date', 5000);
    }
    const bySession = {};
    sessionRows.forEach((r) => {
      if (r.points == null) return;
      (bySession[r.session_id] ||= {});
      bySession[r.session_id][r.player_id] = (bySession[r.session_id][r.player_id] || 0) + (Number(r.points) || 0);
    });
    let wins = 0, podiums = 0, sessionsPlayed = 0;
    for (const sid of Object.keys(bySession)) {
      const totals = bySession[sid];
      if (!(playerId in totals)) continue;
      sessionsPlayed += 1;
      const sorted = Object.entries(totals).map(([pid, total]) => ({ pid, total })).sort((a, b) => b.total - a.total);
      let rank = 0, prev = null;
      const rankMap = {};
      sorted.forEach((row, i) => { if (prev === null || row.total < prev) rank = i + 1; prev = row.total; rankMap[row.pid] = rank; });
      const myRank = rankMap[playerId];
      if (myRank === 1) wins += 1;
      if (myRank <= 3) podiums += 1;
    }

    // --- timeline (cumulative score, oldest -> newest) ---
    const ordered = [...scoped].sort((a, b) => {
      const da = new Date(gameMap[a.game_id]?.created_date || a.created_date || 0).getTime();
      const db = new Date(gameMap[b.game_id]?.created_date || b.created_date || 0).getTime();
      return da - db;
    });
    let cum = 0;
    const timeline = ordered.map((r) => {
      cum += Number(r.points) || 0;
      return { date: gameMap[r.game_id]?.created_date || r.created_date, session_id: r.session_id, round_number: gameMap[r.game_id]?.round_number ?? null, points: r.points, cumulative: cum };
    });

    return Response.json({
      player,
      performance: {
        total_score: totalScore,
        avg_score: round2(totalScore / scoped.length),
        rounds_played: scoped.length,
        sessions_played: sessionsPlayed,
        wins,
        podiums,
        win_ratio: sessionsPlayed ? round2(wins / sessionsPlayed) : 0,
      },
      strategy: {
        contract_accuracy: round2(made / scoped.length),
        zero_bids: zeroBids.length,
        zero_bid_success: zeroBidSuccess,
        zero_bid_success_rate: zeroBids.length ? round2(zeroBidSuccess / zeroBids.length) : 0,
        bid_aggressiveness: round2(sumBy(scoped, (r) => r.bid) / scoped.length),
      },
      awards: { greedy_loss: round2(greedyLoss), coward_loss: round2(cowardLoss), destroyer_count: destroyerCount },
      timeline,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
