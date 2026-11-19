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

// Cross-group whist stats for the current user (their GlobalProfile).
//
// The aggregation is src/lib/whist-stats.js, word for word: Deno cannot import from src/,
// so the block between the MIRROR markers is a copy of the same block in that file (minus
// the `export` keywords). scripts/functions-access.test.mjs fails when the two differ —
// change the code in src/lib/whist-stats.js, then paste the block here.

// <<< BEGIN MIRROR — copied from src/lib/whist-stats.js; keep identical >>>
const round2 = (n) => Math.round(n * 100) / 100;

/** Sum a numeric field over rows. */
function sumBy(rows, f) {
  return rows.reduce((s, r) => s + (Number(f(r)) || 0), 0);
}

/** part / whole to two decimals — or null when there is nothing to count (whole is 0). */
function rate(part, whole) {
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
function playerMetrics(rows) {
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
function rankSession(rows) {
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
function sessionHasResult(rows) {
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
function topBidders(roundRows, round) {
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
function awardFigures(rows, rounds = []) {
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
function awardLeaders(figures, nameById = {}) {
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
function heldAwards(leaders, playerId) {
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
function playerSessions(rows, sessions, playerId) {
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
function sessionRecord(entries) {
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const db = base44.asServiceRole.entities;

    // Nothing played yet: the counts are 0 and the rates are null (nothing to count).
    const none = playerMetrics([]);
    const empty = {
      performance: { total_score: 0, avg_score: 0, rounds_played: 0, sessions_played: 0, sessions_open: 0, wins: 0, podiums: 0, win_ratio: null },
      strategy: {
        contract_accuracy: none.contract_accuracy, made_count: 0, zero_bids: 0, zero_bid_success: 0,
        zero_bid_success_rate: none.zero_bid_success_rate, bid_aggressiveness: 0,
      },
      awards: { greedy_loss: 0, coward_loss: 0, destroyer_count: 0 },
      sessions: [], best_session: null, worst_session: null,
      timeline: [], groups_breakdown: [], total_groups: 0,
    };

    // The user's memberships -> their player_ids and non-deleted groups.
    const memberships = await db.GroupMember.filter({ user_id: user.id });
    if (memberships.length === 0) return Response.json(empty);
    const groupIds = [...new Set(memberships.map((m) => m.group_id))];
    const groups = await Promise.all(groupIds.map((gid) => db.Group.get(gid).catch(() => null)));
    const groupMap = {};
    groups.forEach((g) => { if (g && g.status !== 'deleted') groupMap[g.id] = g; });
    const activeMemberships = memberships.filter((m) => groupMap[m.group_id]);
    if (activeMemberships.length === 0) return Response.json(empty);

    const memberIds = activeMemberships.map((m) => m.id);

    // All of the user's round results across groups (paginated).
    const rows = await fetchAll(db.RoundResult, { player_id: { $in: memberIds } });
    const scoped = rows.filter((r) => r.points != null && r.bid != null && r.tricks_won != null && groupMap[r.group_id]);
    if (scoped.length === 0) {
      return Response.json({ ...empty, total_groups: Object.keys(groupMap).length });
    }

    // The rounds the user played: everyone_falls and the trump winner (The Destroyer), ordering.
    const gameIds = [...new Set(scoped.map((r) => r.game_id))];
    const games = (await Promise.all(gameIds.map((gid) => db.Game.get(gid).catch(() => null)))).filter(Boolean);
    const gameMap = {};
    games.forEach((g) => { gameMap[g.id] = g; });

    // EVERY result of the sessions the user played, all players — one filter() returns a
    // single page (500 rows, about 125 rounds), and a ranking made from part of a night is
    // wrong. The Session records say which of those nights are closed.
    const sessionIds = [...new Set(scoped.map((r) => r.session_id).filter(Boolean))];
    const [sessionRows, sessions] = await Promise.all([
      fetchAll(db.RoundResult, { session_id: { $in: sessionIds } }),
      fetchAll(db.Session, { group_id: { $in: Object.keys(groupMap) } }),
    ]);
    const sessionScored = sessionRows.filter((r) => r.points != null && r.bid != null && r.tricks_won != null);

    const metrics = playerMetrics(scoped);

    // The user's nights, one membership (= one group) at a time. Wins, podiums and the
    // best/worst night come from the CLOSED ones only (a session still open has no winner).
    const seenSessions = new Set();
    const nights = [];
    for (const m of activeMemberships) {
      const group = groupMap[m.group_id];
      for (const night of playerSessions(sessionScored.filter((r) => r.group_id === m.group_id), sessions, m.id)) {
        if (seenSessions.has(night.session_id)) continue;
        seenSessions.add(night.session_id);
        nights.push({ ...night, group_id: group.id, group_name: group.name });
      }
    }
    // Newest first across groups (the sort is stable, so one group's nights keep their order).
    const heldAt = (night) => new Date(night.session_date || 0).getTime() || 0;
    nights.sort((a, b) => heldAt(b) - heldAt(a));
    const record = sessionRecord(nights);

    // The Destroyer needs all four bids of an everyone-falls round, hence sessionScored.
    const figures = awardFigures(sessionScored, games);
    const destroyerCount = memberIds.reduce((sum, id) => sum + (figures[id]?.destroyer_count || 0), 0);

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
      const ta = new Date(gameMap[a.game_id]?.created_date || a.created_date || 0).getTime();
      const tb = new Date(gameMap[b.game_id]?.created_date || b.created_date || 0).getTime();
      return ta - tb;
    });
    let cum = 0;
    const timeline = ordered.map((r) => {
      cum += Number(r.points) || 0;
      return { date: gameMap[r.game_id]?.created_date || r.created_date, group_name: groupMap[r.group_id]?.name || 'Unknown', points: r.points, cumulative: cum };
    });

    return Response.json({
      performance: {
        total_score: metrics.total_score,
        avg_score: metrics.avg_score,
        rounds_played: metrics.rounds_played,   // every scored round, open sessions included
        sessions_played: record.sessions_played, // CLOSED sessions with a counted round — what win_ratio divides by
        sessions_open: record.sessions_open,     // sessions still open that the user has scored in
        wins: record.wins,
        podiums: record.podiums,
        win_ratio: record.win_ratio,             // null when no session is closed yet
      },
      strategy: {
        contract_accuracy: metrics.contract_accuracy,
        made_count: metrics.made_count,
        zero_bids: metrics.zero_bids,
        zero_bid_success: metrics.zero_bid_success,
        zero_bid_success_rate: metrics.zero_bid_success_rate, // null with no zero bids
        bid_aggressiveness: metrics.bid_aggressiveness,
      },
      // The user's own figures added up across groups. An award belongs to a group, so
      // there are no holders here — computePlayerStats says which ones a player holds.
      awards: { greedy_loss: metrics.greedy_loss, coward_loss: metrics.coward_loss, destroyer_count: destroyerCount },
      // The user's nights across groups, newest first; each entry also names its group.
      sessions: nights, // each with no_winner: true when no round of that session counted
      best_session: record.best_session,
      worst_session: record.worst_session,
      timeline,
      groups_breakdown,
      total_groups: Object.keys(groupMap).length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
