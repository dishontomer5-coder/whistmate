import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const PAGE = 500; // the entity store hands out at most 500 rows per filter()
// Every row matching a query, not just the first page: cursor pagination, as in
// getGroupData. The $lte cursor + seen-set copes with rows sharing a created_date.
async function fetchAll(entity, baseQuery) {
  const all = [];
  const seen = new Set();
  let cursor = null;
  for (let guard = 0; guard < 200; guard++) {
    const query = cursor ? { ...baseQuery, created_date: { $lte: cursor } } : baseQuery;
    const page = await entity.filter(query, '-created_date', PAGE);
    const fresh = page.filter((r) => !seen.has(r.id));
    fresh.forEach((r) => { seen.add(r.id); all.push(r); });
    if (page.length < PAGE || fresh.length === 0) break;
    cursor = page[page.length - 1].created_date;
  }
  return all;
}

// Cross-group whist stats for the current user (their GlobalProfile). Aggregation
// MIRRORS src/lib/whist-stats.js (Deno can't import src/) — keep in sync.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const empty = {
      performance: { total_score: 0, avg_score: 0, rounds_played: 0, sessions_played: 0, wins: 0, podiums: 0, win_ratio: 0 },
      strategy: { contract_accuracy: 0, zero_bids: 0, zero_bid_success: 0, zero_bid_success_rate: 0, bid_aggressiveness: 0 },
      awards: { greedy_loss: 0, coward_loss: 0, destroyer_count: 0 },
      timeline: [], groups_breakdown: [], total_groups: 0,
    };

    // The user's memberships -> their player_ids and non-deleted groups.
    const memberships = await base44.asServiceRole.entities.GroupMember.filter({ user_id: user.id });
    if (memberships.length === 0) return Response.json(empty);
    const groupIds = [...new Set(memberships.map((m) => m.group_id))];
    const groups = await Promise.all(groupIds.map((gid) => base44.asServiceRole.entities.Group.get(gid).catch(() => null)));
    const groupMap = {};
    groups.forEach((g) => { if (g && g.status !== 'deleted') groupMap[g.id] = g; });
    const activeMemberships = memberships.filter((m) => groupMap[m.group_id]);
    if (activeMemberships.length === 0) return Response.json(empty);

    const memberIds = activeMemberships.map((m) => m.id);
    const myMemberIdSet = new Set(memberIds);
    const memberGroup = {};
    activeMemberships.forEach((m) => { memberGroup[m.id] = m.group_id; });

    // All of the user's round results across groups (paginated).
    const rows = await fetchAll(base44.asServiceRole.entities.RoundResult, { player_id: { $in: memberIds } });
    const scoped = rows.filter((r) => r.points != null && r.bid != null && r.tricks_won != null && groupMap[r.group_id]);
    if (scoped.length === 0) {
      return Response.json({ ...empty, groups_breakdown: [], total_groups: Object.keys(groupMap).length });
    }

    // everyone_falls + ordering.
    const gameIds = [...new Set(scoped.map((r) => r.game_id))];
    const games = await Promise.all(gameIds.map((gid) => base44.asServiceRole.entities.Game.get(gid).catch(() => null)));
    const gameMap = {};
    games.forEach((g) => { if (g) gameMap[g.id] = g; });

    const round2 = (n) => Math.round(n * 100) / 100;
    const sumBy = (arr, f) => arr.reduce((s, r) => s + (Number(f(r)) || 0), 0);

    const made = scoped.filter((r) => r.tricks_won === r.bid).length;
    const zeroBids = scoped.filter((r) => r.bid === 0);
    const zeroBidSuccess = zeroBids.filter((r) => r.tricks_won === 0).length;
    const totalScore = sumBy(scoped, (r) => r.points);
    const greedyLoss = sumBy(scoped.filter((r) => !r.reneged && r.tricks_won < r.bid && r.points < 0), (r) => -r.points);
    const cowardLoss = sumBy(scoped.filter((r) => !r.reneged && r.tricks_won > r.bid && r.points < 0), (r) => -r.points);
    const destroyerCount = scoped.filter((r) => gameMap[r.game_id]?.everyone_falls).length;

    // Win/podium: rank each session the user played (needs ALL players' rows).
    const sessionIds = [...new Set(scoped.map((r) => r.session_id).filter(Boolean))];
    // EVERY result of those sessions — one filter() returns a single page (500 rows,
    // about 125 rounds), and a ranking made from part of a night is wrong.
    let sessionRows = [];
    if (sessionIds.length > 0) {
      sessionRows = await fetchAll(base44.asServiceRole.entities.RoundResult, { session_id: { $in: sessionIds } });
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
      const myPid = Object.keys(totals).find((pid) => myMemberIdSet.has(pid));
      if (!myPid) continue;
      sessionsPlayed += 1;
      const sorted = Object.entries(totals).map(([pid, total]) => ({ pid, total })).sort((a, b) => b.total - a.total);
      let rank = 0, prev = null;
      const rankMap = {};
      sorted.forEach((row, i) => { if (prev === null || row.total < prev) rank = i + 1; prev = row.total; rankMap[row.pid] = rank; });
      if (rankMap[myPid] === 1) wins += 1;
      if (rankMap[myPid] <= 3) podiums += 1;
    }

    // Per-group breakdown.
    const gStats = {};
    scoped.forEach((r) => {
      const gid = r.group_id;
      (gStats[gid] ||= { group_id: gid, group_name: groupMap[gid]?.name || 'Unknown', total_score: 0, rounds_played: 0 });
      gStats[gid].total_score += Number(r.points) || 0;
      gStats[gid].rounds_played += 1;
    });
    const groups_breakdown = Object.values(gStats).map((gs) => ({
      ...gs, avg_score: gs.rounds_played ? round2(gs.total_score / gs.rounds_played) : 0,
    })).sort((a, b) => b.total_score - a.total_score);

    // Combined timeline.
    const ordered = [...scoped].sort((a, b) => {
      const da = new Date(gameMap[a.game_id]?.created_date || a.created_date || 0).getTime();
      const db = new Date(gameMap[b.game_id]?.created_date || b.created_date || 0).getTime();
      return da - db;
    });
    let cum = 0;
    const timeline = ordered.map((r) => {
      cum += Number(r.points) || 0;
      return { date: gameMap[r.game_id]?.created_date || r.created_date, group_name: groupMap[r.group_id]?.name || 'Unknown', points: r.points, cumulative: cum };
    });

    return Response.json({
      performance: {
        total_score: totalScore,
        avg_score: round2(totalScore / scoped.length),
        rounds_played: scoped.length,
        sessions_played: sessionsPlayed,
        wins, podiums,
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
      groups_breakdown,
      total_groups: Object.keys(groupMap).length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
