import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function generateInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { group_id } = body;

    if (!group_id) {
      return Response.json({ error: 'group_id is required' }, { status: 400 });
    }

    // Verify the requesting user is an admin of this group
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
      return Response.json({ error: 'Only group admins can regenerate invite codes' }, { status: 403 });
    }

    // Generate new unique code
    let inviteCode = generateInviteCode();
    let existing = await base44.asServiceRole.entities.Group.filter({ invite_code: inviteCode });
    while (existing.length > 0) {
      inviteCode = generateInviteCode();
      existing = await base44.asServiceRole.entities.Group.filter({ invite_code: inviteCode });
    }

    const updated = await base44.asServiceRole.entities.Group.update(group_id, { invite_code: inviteCode });

    return Response.json({ group: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});