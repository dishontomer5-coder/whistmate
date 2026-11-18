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

// Delete a round (Game) and all its RoundResult rows. Admin or group member; app
// admins allowed for support. Used to fix mistakes (a mis-started or bad round).
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { game_id } = await req.json();
    if (!game_id) return Response.json({ error: 'game_id is required' }, { status: 400 });

    const round = await base44.asServiceRole.entities.Game.get(game_id);
    if (!round) return Response.json({ error: 'Round not found' }, { status: 404 });

    if (user.role !== 'admin') {
      if (!round.group_id) {
        return Response.json({ error: 'Only app admins can delete rounds without a group' }, { status: 403 });
      }
      const rows = await base44.asServiceRole.entities.GroupMember.filter({ user_id: user.id });
      let mine = rows.filter((m) => m.group_id === round.group_id);
      if (mine.length === 0) {
        const hinted = await hintedMemberRow(base44, user, round.group_id);
        if (hinted) mine = [hinted];
      }
      if (mine.length === 0) {
        return Response.json({ error: 'You are not a member of this group' }, { status: 403 });
      }
    }

    const results = await base44.asServiceRole.entities.RoundResult.filter({ game_id });
    await Promise.all(results.map((r) => base44.asServiceRole.entities.RoundResult.delete(r.id)));
    await base44.asServiceRole.entities.Game.delete(game_id);

    return Response.json({ deleted: true, game_id, results_deleted: results.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
