import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { group_id, status } = await req.json();
    if (!group_id || !['active', 'archived', 'deleted'].includes(status)) {
      return Response.json({ error: 'Invalid group_id or status' }, { status: 400 });
    }

    const isAppAdmin = user.role === 'admin';

    if (!isAppAdmin) {
      const membershipsRows = await base44.asServiceRole.entities.GroupMember.filter({ user_id: user.id });
      // Resilient membership lookup (P7-9): user_id-only query, group matched in
      // memory, session-cache fallback -- compound (group_id, user_id) reads can
      // lag for freshly-claimed membership rows
      let memberships = membershipsRows.filter(m => m.group_id === group_id);
      if (memberships.length === 0) {
        const cachedMembership = (user.groups || []).find(g => g.group_id === group_id);
        if (cachedMembership) memberships = [{ id: cachedMembership.member_id, group_id: cachedMembership.group_id, user_id: user.id, role: cachedMembership.role, player_name: cachedMembership.player_name }];
      }
      if (memberships.length === 0 || memberships[0].role !== 'admin') {
        return Response.json({ error: 'Only group admins can perform this action' }, { status: 403 });
      }
    }

    await base44.asServiceRole.entities.Group.update(group_id, { status });

    return Response.json({ success: true, group_id, status });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});