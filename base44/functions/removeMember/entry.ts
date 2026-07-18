import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { group_id, member_id } = body;

    if (!group_id || !member_id) {
      return Response.json({ error: 'group_id and member_id are required' }, { status: 400 });
    }

    // Fetch the target member
    const targetMember = await base44.asServiceRole.entities.GroupMember.get(member_id);
    if (!targetMember || targetMember.group_id !== group_id) {
      return Response.json({ error: 'Member not found in this group' }, { status: 404 });
    }

    // Self-removal (leaving the group) is allowed for non-last-admins
    const isSelf = targetMember.user_id === user.id;

    if (!isSelf) {
      // Admin check for removing others
      const myMembershipRows = await base44.asServiceRole.entities.GroupMember.filter({ user_id: user.id });
      // Resilient membership lookup (P7-9): user_id-only query, group matched in
      // memory, session-cache fallback -- compound (group_id, user_id) reads can
      // lag for freshly-claimed membership rows
      let myMembership = myMembershipRows.filter(m => m.group_id === group_id);
      if (myMembership.length === 0) {
        const cachedMembership = (user.groups || []).find(g => g.group_id === group_id);
        if (cachedMembership) myMembership = [{ id: cachedMembership.member_id, group_id: cachedMembership.group_id, user_id: user.id, role: cachedMembership.role, player_name: cachedMembership.player_name }];
      }

      if (myMembership.length === 0) {
        return Response.json({ error: 'You are not a member of this group' }, { status: 403 });
      }

      if (myMembership[0].role !== 'admin') {
        return Response.json({ error: 'Only group admins can remove other members' }, { status: 403 });
      }
    }

    // Prevent removing the last admin — applies to self-removal too, otherwise
    // the group is left with no admin (P2-2)
    if (targetMember.role === 'admin') {
      const allMembers = await base44.asServiceRole.entities.GroupMember.filter({ group_id });
      const adminCount = allMembers.filter(m => m.role === 'admin').length;
      if (adminCount <= 1) {
        return Response.json({ error: 'Cannot remove the last admin. Promote another member first.' }, { status: 400 });
      }
    }

    // Members with round history are never hard-deleted — that would orphan
    // RoundResult rows and scouting notes and break standings sums.
    // Claimed members are converted back to ghosts (history preserved).
    const history = await base44.asServiceRole.entities.RoundResult.filter({ player_id: member_id });
    if (history.length > 0) {
      if (!targetMember.user_id) {
        return Response.json({
          error: `"${targetMember.player_name}" has game history and cannot be removed. Ghost members with history stay on the roster.`
        }, { status: 400 });
      }
      const updated = await base44.asServiceRole.entities.GroupMember.update(member_id, {
        user_id: null,
        claimed: false,
        claim_token: null,
        role: 'player'
      });
      return Response.json({ success: true, converted_to_ghost: true, member: updated });
    }

    await base44.asServiceRole.entities.GroupMember.delete(member_id);

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});