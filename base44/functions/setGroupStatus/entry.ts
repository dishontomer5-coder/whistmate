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
      // memory, cache-hinted row re-read by id -- compound (group_id, user_id) reads can
      // lag for freshly-claimed membership rows
      let memberships = membershipsRows.filter(m => m.group_id === group_id);
      if (memberships.length === 0) {
        const hinted = await hintedMemberRow(base44, user, group_id);
        if (hinted) memberships = [hinted];
      }
      if (memberships.length === 0 || memberships[0].role !== 'admin') {
        return Response.json({ error: 'Only group admins can perform this action' }, { status: 403 });
      }
    }

    // This is the one write that works on a group that is not active — it is how an
    // archived group is made active again. The group does have to exist.
    const group = await base44.asServiceRole.entities.Group.get(group_id).catch(() => null);
    if (!group) return Response.json({ error: 'Group not found' }, { status: 404 });

    await base44.asServiceRole.entities.Group.update(group_id, { status });

    return Response.json({ success: true, group_id, status });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});