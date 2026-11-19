import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// The membership cache on the user record (user.groups) is a hint, never proof (P12-9):
// a user can write their own record. It only rides out read-after-write lag (P7-9) — the
// GroupMember row it points at is re-read by id and counts only if it really belongs to
// the caller and to this group. Role and player_name come from that row, never the cache.
// At most MAX_HINTS different rows are re-read, so a stuffed cache buys no extra reads.
const MAX_HINTS = 5;
async function hintedMemberRow(base44, user, groupId) {
  if (!groupId) return null;
  const tried = new Set();
  for (const hint of (Array.isArray(user.groups) ? user.groups : [])) {
    if (!hint || hint.group_id !== groupId || !hint.member_id || tried.has(hint.member_id)) continue;
    if (tried.size >= MAX_HINTS) break;
    tried.add(hint.member_id);
    const row = await base44.asServiceRole.entities.GroupMember.get(hint.member_id).catch(() => null);
    if (row && row.user_id === user.id && row.group_id === groupId) return row;
  }
  return null;
}

// A group that is not active is read-only: archived -> 403, deleted or gone -> 404.
// Resolves to the response to send back, or to null when the group can be written to.
async function readOnlyGroup(base44, groupId) {
  if (!groupId) return null; // a record that belongs to no group has no status to honour
  const group = await base44.asServiceRole.entities.Group.get(groupId).catch(() => null);
  if (!group || group.status === 'deleted') return Response.json({ error: 'Group not found' }, { status: 404 });
  if ((group.status || 'active') !== 'active') {
    return Response.json({ error: 'This group is archived — it is read-only' }, { status: 403 });
  }
  return null;
}

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

// Start a new round (Game) inside an open session: seat exactly 4 players (the
// array order is the bidding order) and create their blank RoundResult rows. One
// open round per session; respects the session game_limit (only 'complete' rounds
// count toward it, not cancelled/everyone-falls).
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { session_id, player_ids } = await req.json();
    if (!session_id || !Array.isArray(player_ids)) {
      return Response.json({ error: 'session_id and player_ids are required' }, { status: 400 });
    }
    if (player_ids.length !== 4) {
      return Response.json({ error: 'A whist round needs exactly 4 players' }, { status: 400 });
    }
    if (new Set(player_ids).size !== 4) {
      return Response.json({ error: 'The 4 players must be distinct' }, { status: 400 });
    }

    const session = await base44.asServiceRole.entities.Session.get(session_id).catch(() => null);
    if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });
    if (session.status !== 'open') {
      return Response.json({ error: 'This session is closed — no new rounds' }, { status: 403 });
    }
    const group_id = session.group_id;

    if (user.role !== 'admin') {
      const rows = await base44.asServiceRole.entities.GroupMember.filter({ user_id: user.id });
      let mine = rows.filter((m) => m.group_id === group_id);
      if (mine.length === 0) {
        const hinted = await hintedMemberRow(base44, user, group_id);
        if (hinted) mine = [hinted];
      }
      if (mine.length === 0) {
        return Response.json({ error: 'You are not a member of this group' }, { status: 403 });
      }
    }

    const readOnly = await readOnlyGroup(base44, group_id);
    if (readOnly) return readOnly;

    // Composite integrity: every seated player must be a GroupMember of this group.
    // Each seat is read by id, so it does not matter how long the roster is.
    const seated = await Promise.all(
      player_ids.map((pid) => base44.asServiceRole.entities.GroupMember.get(pid).catch(() => null)),
    );
    if (seated.some((m) => !m || m.group_id !== group_id)) {
      return Response.json({ error: 'Some players are not members of this group' }, { status: 400 });
    }
    const memberMap = {};
    seated.forEach((m) => { memberMap[m.id] = m; });

    // One open round per session (query by session_id, check status in memory).
    // Every round of the session is read: the limit and the numbering depend on all of them.
    const rounds = await fetchAll(base44.asServiceRole.entities.Game, { session_id });
    const openRound = rounds.find((r) => r.status === 'bidding' || r.status === 'playing');
    if (openRound) {
      return Response.json({ error: 'A round is already in progress', open_round_id: openRound.id }, { status: 409 });
    }

    // game_limit: only completed (scored) rounds count toward the cap.
    if (session.game_limit != null) {
      const completed = rounds.filter((r) => r.status === 'complete').length;
      if (completed >= session.game_limit) {
        return Response.json({ error: `This session has reached its round limit (${session.game_limit})` }, { status: 409 });
      }
    }

    // Numbered after the highest round so far — counting rounds would repeat a number
    // once a round has been deleted.
    const lastNumber = rounds.reduce((max, r) => Math.max(max, Number(r.round_number) || 0), 0);

    const round = await base44.asServiceRole.entities.Game.create({
      session_id,
      group_id,
      round_number: lastNumber + 1,
      status: 'bidding',
      everyone_falls: false,
    });

    const results = await base44.asServiceRole.entities.RoundResult.bulkCreate(
      player_ids.map((pid, i) => ({
        game_id: round.id,
        session_id,
        group_id,
        player_id: pid,
        player_name: memberMap[pid].player_name,
        bid_order: i,
        reneged: false,
      })),
    );

    return Response.json({ round, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
