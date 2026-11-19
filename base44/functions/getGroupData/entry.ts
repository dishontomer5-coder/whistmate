import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// The read path for game data (P12-1). Session, Game and RoundResult are not readable
// from the browser any more (entity read RLS = app admin only) — every screen reads
// through here, and this function decides who may see what: members of the group that
// owns the data, and app admins. Nobody else, signed in or not.
//
// Scopes (body.scope):
//   group            { group_id, include_results? } -> { sessions, rounds, results }
//   session          { session_id }                 -> { session, rounds, results }
//                    every session here also carries counted_rounds and no_winner (below)
//   round            { round_id }                   -> { round, session, results }
//   player           { player_id }                  -> { player, results, rounds, sessions, total_rows, limit }
//                    results = the player's latest `limit` scored rows, newest first, out of total_rows;
//                    rounds = their Game records; sessions = { [session_id]: { id, name, session_date, status, counted_rounds, no_winner } }
//   shared_sessions  { player_id }                  -> { sessions }  (nights the caller and that player both played)

const PAGE = 500; // the entity store caps one filter() at 500 rows
const PLAYER_HISTORY_LIMIT = 200; // rows of round history sent for one player (the response says how many exist)

// Cursor pagination past the page cap — mirrors src/lib/fetch-all.js / computeGlobalStats.
// The $lte cursor + seen-set handles rows sharing a created_date (bulkCreate).
async function fetchAll(entity, baseQuery) {
  const all = [];
  const seen = new Set();
  let cursor = null;
  for (let guard = 0; guard < 40; guard++) {
    const query = cursor ? { ...baseQuery, created_date: { $lte: cursor } } : baseQuery;
    const page = await entity.filter(query, '-created_date', PAGE);
    const fresh = page.filter((r) => !seen.has(r.id));
    fresh.forEach((r) => { seen.add(r.id); all.push(r); });
    if (page.length < PAGE || fresh.length === 0) break;
    cursor = page[page.length - 1].created_date;
  }
  return all;
}

// The caller's membership row in a group, or null. Only a real GroupMember row owned by
// the caller counts. The cache on the user record (user.groups) covers read-after-write
// lag (P7-9) but is only a HINT: a user can write their own record, so a hinted row is
// re-read by id and must really be theirs. At most MAX_HINTS different rows are re-read,
// so a stuffed cache buys no extra reads.
const MAX_HINTS = 5;
async function membershipIn(base44, user, groupId) {
  const rows = await base44.asServiceRole.entities.GroupMember.filter({ user_id: user.id });
  const direct = rows.find((m) => m.group_id === groupId);
  if (direct) return direct;
  const tried = new Set();
  for (const hint of (user.groups || [])) {
    if (!hint || hint.group_id !== groupId || !hint.member_id || tried.has(hint.member_id)) continue;
    if (tried.size >= MAX_HINTS) break;
    tried.add(hint.member_id);
    const row = await base44.asServiceRole.entities.GroupMember.get(hint.member_id).catch(() => null);
    if (row && row.user_id === user.id && row.group_id === groupId) return row;
  }
  return null;
}

// How a session stands: counted_rounds = its rounds scored and not cancelled by everyone
// falling; no_winner = none counted. A session in which no round counted has no result —
// nobody wins it, nobody gets a podium (src/lib/whist-stats.js sessionHasResult says the
// same from the result rows: a round counts when someone made their contract).
function countedRounds(rounds, sessionId) {
  return rounds.filter((g) => g.session_id === sessionId && g.status === 'complete' && !g.everyone_falls).length;
}
function withResult(session, rounds) {
  const counted = countedRounds(rounds, session.id);
  return { ...session, counted_rounds: counted, no_winner: counted === 0 };
}

const deny = (status, error) => Response.json({ error }, { status });

// Gate for every scope. Returns { membership } (null for an app admin who isn't a member)
// or { response } to send back. A soft-deleted group is gone for everyone but app admins.
async function authorize(base44, user, groupId) {
  if (!groupId) return { response: deny(404, 'Not found') };
  const isAppAdmin = user.role === 'admin';
  const membership = await membershipIn(base44, user, groupId);
  if (!membership && !isAppAdmin) {
    return { response: deny(403, 'You are not a member of this group') };
  }
  const group = await base44.asServiceRole.entities.Group.get(groupId).catch(() => null);
  if (!group || (group.status === 'deleted' && !isAppAdmin)) {
    return { response: deny(404, 'Group not found') };
  }
  return { membership };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return deny(401, 'Unauthorized');

    const body = await req.json().catch(() => ({}));
    const db = base44.asServiceRole.entities;

    switch (body.scope) {
      case 'group': {
        if (!body.group_id) return deny(400, 'group_id is required');
        const gate = await authorize(base44, user, body.group_id);
        if (gate.response) return gate.response;
        const [sessions, rounds, results] = await Promise.all([
          fetchAll(db.Session, { group_id: body.group_id }),
          fetchAll(db.Game, { group_id: body.group_id }),
          body.include_results === false ? [] : fetchAll(db.RoundResult, { group_id: body.group_id }),
        ]);
        return Response.json({ sessions: sessions.map((s) => withResult(s, rounds)), rounds, results });
      }

      case 'session': {
        if (!body.session_id) return deny(400, 'session_id is required');
        const session = await db.Session.get(body.session_id).catch(() => null);
        if (!session) return deny(404, 'Session not found');
        const gate = await authorize(base44, user, session.group_id);
        if (gate.response) return gate.response;
        const [rounds, results] = await Promise.all([
          fetchAll(db.Game, { session_id: session.id }),
          fetchAll(db.RoundResult, { session_id: session.id }),
        ]);
        return Response.json({ session: withResult(session, rounds), rounds, results });
      }

      case 'round': {
        if (!body.round_id) return deny(400, 'round_id is required');
        const round = await db.Game.get(body.round_id).catch(() => null);
        if (!round) return deny(404, 'Round not found');
        const gate = await authorize(base44, user, round.group_id);
        if (gate.response) return gate.response;
        const [session, results] = await Promise.all([
          db.Session.get(round.session_id).catch(() => null),
          db.RoundResult.filter({ game_id: round.id }, '-created_date', 20),
        ]);
        return Response.json({ round, session, results });
      }

      case 'player': {
        if (!body.player_id) return deny(400, 'player_id is required');
        const member = await db.GroupMember.get(body.player_id).catch(() => null);
        if (!member) return deny(404, 'Player not found');
        const gate = await authorize(base44, user, member.group_id);
        if (gate.response) return gate.response;
        // The group's rounds and sessions come in a few pages each, instead of one read
        // by id per row of the history.
        const [rows, groupRounds, groupSessions] = await Promise.all([
          fetchAll(db.RoundResult, { player_id: member.id }),
          fetchAll(db.Game, { group_id: member.group_id }),
          fetchAll(db.Session, { group_id: member.group_id }),
        ]);
        // Scored rows only, newest first. RoundResult rows are created with their round,
        // so their own created_date orders them the same way the rounds are ordered.
        const scored = rows
          .filter((r) => r.group_id === member.group_id && r.points != null)
          .sort((a, b) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime());
        // Never a silent cut: total_rows says how many there are, limit how many are sent.
        const results = scored.slice(0, PLAYER_HISTORY_LIMIT);
        const roundIds = new Set(results.map((r) => r.game_id));
        const rounds = groupRounds.filter((g) => roundIds.has(g.id));
        // The session of every row sent, by id — so each row can say which night it was.
        const sessionIds = new Set(results.map((r) => r.session_id));
        const sessions = {};
        for (const s of groupSessions) {
          if (!sessionIds.has(s.id)) continue;
          const { counted_rounds, no_winner } = withResult(s, groupRounds);
          sessions[s.id] = { id: s.id, name: s.name, session_date: s.session_date, status: s.status, counted_rounds, no_winner };
        }
        return Response.json({
          player: { id: member.id, name: member.player_name, group_id: member.group_id },
          results,
          rounds,
          sessions,
          total_rows: scored.length,
          limit: PLAYER_HISTORY_LIMIT,
        });
      }

      case 'shared_sessions': {
        if (!body.player_id) return deny(400, 'player_id is required');
        const target = await db.GroupMember.get(body.player_id).catch(() => null);
        if (!target) return deny(404, 'Player not found');
        const gate = await authorize(base44, user, target.group_id);
        if (gate.response) return gate.response;
        // An app admin who isn't a player in this group has played no nights with anyone.
        if (!gate.membership) return Response.json({ sessions: [] });
        const [mine, theirs] = await Promise.all([
          fetchAll(db.RoundResult, { player_id: gate.membership.id }),
          fetchAll(db.RoundResult, { player_id: target.id }),
        ]);
        const mySessionIds = new Set(mine.map((r) => r.session_id).filter(Boolean));
        const sharedIds = [...new Set(theirs.map((r) => r.session_id).filter((id) => id && mySessionIds.has(id)))];
        const sessions = (await Promise.all(sharedIds.map((id) => db.Session.get(id).catch(() => null))))
          .filter((s) => s && s.group_id === target.group_id)
          .sort((a, b) => new Date(b.session_date || b.created_date).getTime() - new Date(a.session_date || a.created_date).getTime())
          .map((s) => ({ id: s.id, name: s.name, session_date: s.session_date, created_date: s.created_date }));
        return Response.json({ sessions });
      }

      default:
        return deny(400, 'Unknown scope');
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
