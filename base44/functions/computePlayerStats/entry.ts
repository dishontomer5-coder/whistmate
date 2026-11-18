import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// How many cache-hinted member rows are re-read by id at the most — a user can write
// their own cache, and stuffing it must not buy one request any number of reads.
const MAX_HINTS = 5;

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

// Per-player whist stats for a group.
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
 * @returns {Array<{session_id:string, name:string|null, session_date:string|null, status:string|null, total:number, rank:number, players:number}>}
 *          total = the player's points that night; rank = their place among the `players`
 *          who scored in it (ties share a rank). status is 'open' or 'closed' (null when the
 *          session record is missing). In an open session the rank is where the player
 *          stands for now — not a result.
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
 * @returns {{sessions_played:number, sessions_open:number, wins:number, podiums:number, win_ratio:number|null, best_session:object|null, worst_session:object|null}}
 *          sessions_played = closed sessions (what win_ratio divides by; null when 0).
 *          best_session / worst_session = the closed entry with the highest / lowest total
 *          (the more recent one on a tie; the same entry when only one session is closed).
 */
function sessionRecord(entries) {
  const closed = entries.filter((e) => e.status === 'closed');
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
        // The user-record cache is only a hint for read-after-write lag: a hinted row
        // is re-read by id and must really be the caller's. At most MAX_HINTS are tried.
        const tried = new Set();
        for (const hint of (user.groups || [])) {
          if (!hint || hint.group_id !== groupId || !hint.member_id || tried.has(hint.member_id)) continue;
          if (tried.size >= MAX_HINTS) break;
          tried.add(hint.member_id);
          const row = await base44.asServiceRole.entities.GroupMember.get(hint.member_id).catch(() => null);
          if (row && row.user_id === user.id && row.group_id === groupId) { isMember = true; break; }
        }
      }
      if (!isMember) return Response.json({ error: 'You are not a member of this group' }, { status: 403 });
    }

    const db = base44.asServiceRole.entities;
    // Everything the group has scored, read past the page cap: a player's place in a night
    // and who holds a group award both need every player's rows, not only this player's —
    // and the Session and Game records say which nights are closed and which rounds fell.
    const [groupRows, rounds, sessions] = await Promise.all([
      fetchAll(db.RoundResult, { group_id: groupId }),
      fetchAll(db.Game, { group_id: groupId }),
      fetchAll(db.Session, { group_id: groupId }),
    ]);
    // Only scored rows (points are set when a round is completed or cancelled).
    const scored = groupRows.filter((r) => r.points != null && r.bid != null && r.tricks_won != null);
    const mine = scored.filter((r) => r.player_id === playerId);

    const metrics = playerMetrics(mine);
    // One entry per session the player scored in; wins, podiums and best/worst night come
    // from the CLOSED ones only (a session still open has no winner yet).
    const nights = playerSessions(scored, sessions, playerId);
    const record = sessionRecord(nights);

    // The group's awards, to say which of them this player holds right now.
    const names = {};
    scored.forEach((r) => { names[r.player_id] ||= r.player_name; });
    const figures = awardFigures(scored, rounds);
    const groupAwards = awardLeaders(figures, names);
    const own = figures[playerId] || { greedy_loss: 0, coward_loss: 0, destroyer_count: 0 };

    // --- timeline (cumulative score, oldest -> newest) ---
    const gameMap = {};
    rounds.forEach((g) => { gameMap[g.id] = g; });
    const sessionMap = {};
    sessions.forEach((s) => { sessionMap[s.id] = s; });
    const ordered = [...mine].sort((a, b) => {
      const ta = new Date(gameMap[a.game_id]?.created_date || a.created_date || 0).getTime();
      const tb = new Date(gameMap[b.game_id]?.created_date || b.created_date || 0).getTime();
      return ta - tb;
    });
    let cum = 0;
    const timeline = ordered.map((r) => {
      cum += Number(r.points) || 0;
      return {
        date: gameMap[r.game_id]?.created_date || r.created_date,
        session_id: r.session_id,
        session_name: sessionMap[r.session_id]?.name ?? null,
        round_number: gameMap[r.game_id]?.round_number ?? null,
        points: r.points,
        cumulative: cum,
      };
    });

    return Response.json({
      player,
      performance: {
        total_score: metrics.total_score,
        avg_score: metrics.avg_score,
        rounds_played: metrics.rounds_played,   // every scored round, the open session's included
        sessions_played: record.sessions_played, // CLOSED sessions — what win_ratio divides by
        sessions_open: record.sessions_open,     // sessions still open that the player has scored in
        wins: record.wins,
        podiums: record.podiums,
        win_ratio: record.win_ratio,             // null when no session is closed yet
      },
      strategy: {
        contract_accuracy: metrics.contract_accuracy,         // null with no rounds
        made_count: metrics.made_count,
        zero_bids: metrics.zero_bids,
        zero_bid_success: metrics.zero_bid_success,
        zero_bid_success_rate: metrics.zero_bid_success_rate, // null with no zero bids
        bid_aggressiveness: metrics.bid_aggressiveness,
      },
      // The player's own figures, and which of the group's awards they hold right now
      // (alone or shared): some of 'greedy', 'coward', 'destroyer'.
      awards: {
        greedy_loss: own.greedy_loss,
        coward_loss: own.coward_loss,
        destroyer_count: own.destroyer_count,
        held: heldAwards(groupAwards, playerId),
      },
      // Who holds each award in the group: { value, holders: [{ player_id, name }] } or null.
      group_awards: groupAwards,
      sessions: nights,
      best_session: record.best_session,
      worst_session: record.worst_session,
      timeline,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
