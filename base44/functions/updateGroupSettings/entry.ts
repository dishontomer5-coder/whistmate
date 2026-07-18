import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Group RLS only lets the creator update the record directly, so promoted
// admins must go through this service-role function (P1-1)
const ALLOWED_FIELDS = [
  'name', 'description', 'advanced_rules_default', 'scoring_method_default'
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { group_id, updates } = await req.json();
    if (!group_id || !updates || typeof updates !== 'object') {
      return Response.json({ error: 'group_id and updates are required' }, { status: 400 });
    }

    // Verify the requesting user is an admin of this group (platform admins allowed)
    if (user.role !== 'admin') {
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
        return Response.json({ error: 'Only group admins can update group settings' }, { status: 403 });
      }
    }

    const safeUpdates = {};
    for (const key of ALLOWED_FIELDS) {
      if (key in updates) safeUpdates[key] = updates[key];
    }
    if (Object.keys(safeUpdates).length === 0) {
      return Response.json({ error: 'No valid fields to update' }, { status: 400 });
    }
    if ('name' in safeUpdates && !String(safeUpdates.name || '').trim()) {
      return Response.json({ error: 'Group name cannot be empty' }, { status: 400 });
    }

    const group = await base44.asServiceRole.entities.Group.update(group_id, safeUpdates);
    return Response.json({ group });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
