import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    if (user.role !== 'admin') {
      return Response.json({ error: 'App admin only' }, { status: 403 });
    }

    const { group_id } = await req.json();
    if (!group_id) return Response.json({ error: 'group_id required' }, { status: 400 });

    // Cascading hard deletes — order matters: child entities first, then parent.
    // RoundResult (per-player) -> Game (round) -> Session (night) -> notes/members -> Group.
    await base44.asServiceRole.entities.RoundResult.deleteMany({ group_id: group_id });
    await base44.asServiceRole.entities.TableTalkNote.deleteMany({ group_id: group_id });
    await base44.asServiceRole.entities.Game.deleteMany({ group_id: group_id });
    await base44.asServiceRole.entities.Session.deleteMany({ group_id: group_id });
    await base44.asServiceRole.entities.GroupMember.deleteMany({ group_id: group_id });
    await base44.asServiceRole.entities.Group.delete(group_id);

    return Response.json({ success: true, group_id: group_id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});