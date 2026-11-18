import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// The membership cache on the user record (user.groups) is a hint, never proof (P12-9):
// a user can write their own record. It only rides out read-after-write lag (P7-9) — the
// GroupMember row it points at is re-read by id and counts only if it really belongs to
// the caller and to this group. Role and player_name come from that row, never the cache.
async function hintedMemberRow(base44, user, groupId) {
  if (!groupId) return null;
  for (const hint of (Array.isArray(user.groups) ? user.groups : [])) {
    if (!hint || hint.group_id !== groupId || !hint.member_id) continue;
    const row = await base44.asServiceRole.entities.GroupMember.get(hint.member_id).catch(() => null);
    if (row && row.user_id === user.id && row.group_id === groupId) return row;
  }
  return null;
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

    const session = await base44.asServiceRole.entities.Session.get(session_id);
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

    // Composite integrity: every seated player must be a GroupMember of this group.
    const members = await base44.asServiceRole.entities.GroupMember.filter({ group_id });
    const memberMap = {};
    members.forEach((m) => { memberMap[m.id] = m; });
    const unknown = player_ids.filter((pid) => !memberMap[pid]);
    if (unknown.length > 0) {
      return Response.json({ error: 'Some players are not members of this group' }, { status: 400 });
    }

    // One open round per session (query by session_id, check status in memory).
    const rounds = await base44.asServiceRole.entities.Game.filter({ session_id }, '-created_date', 500);
    const openRound = rounds.find((r) => r.status === 'bidding' || r.status === 'playing');
    if (openRound) {
      return Response.json({ error: 'A round is already in progress', open_round_id: openRound.id }, { status: 409 });
    }

    // game_limit: only completed (scored) rounds count toward the cap.
    if (session.game_limit != null) {
      const completed = rounds.filter((r) => r.status === 'complete').length;
      if (completed >= session.game_limit) {
        return Response.json({ error: `Session game limit (${session.game_limit}) reached` }, { status: 409 });
      }
    }

    const round = await base44.asServiceRole.entities.Game.create({
      session_id,
      group_id,
      round_number: rounds.length + 1,
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
