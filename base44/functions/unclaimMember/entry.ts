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

// Mis-claim remedy (plan.md §11.2): a group admin detaches a user from a
// player — the player becomes an unclaimed ghost again (history preserved)
// and the freed user can rejoin with the invite code and claim correctly.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { group_id, member_id } = await req.json();
    if (!group_id || !member_id) {
      return Response.json({ error: 'group_id and member_id are required' }, { status: 400 });
    }

    // Verify the requesting user is an admin of this group (platform admins allowed)
    if (user.role !== 'admin') {
      const myMembershipRows = await base44.asServiceRole.entities.GroupMember.filter({ user_id: user.id });
      // Resilient membership lookup (P7-9): user_id-only query, group matched in
      // memory, cache-hinted row re-read by id -- compound (group_id, user_id) reads can
      // lag for freshly-claimed membership rows
      let myMembership = myMembershipRows.filter(m => m.group_id === group_id);
      if (myMembership.length === 0) {
        const hinted = await hintedMemberRow(base44, user, group_id);
        if (hinted) myMembership = [hinted];
      }
      if (myMembership.length === 0 || myMembership[0].role !== 'admin') {
        return Response.json({ error: 'Only group admins can unclaim players' }, { status: 403 });
      }
    }

    const target = await base44.asServiceRole.entities.GroupMember.get(member_id);
    if (!target || target.group_id !== group_id) {
      return Response.json({ error: 'Member not found in this group' }, { status: 404 });
    }
    if (!target.user_id && !target.claimed) {
      return Response.json({ error: 'This player is already unclaimed' }, { status: 400 });
    }
    if (target.user_id === user.id) {
      return Response.json({ error: 'You cannot unclaim yourself. Leave the group instead.' }, { status: 400 });
    }

    // Admins must be claimed (§11.1 principle 3) — unclaiming demotes to player,
    // so the last-admin guard applies
    if (target.role === 'admin') {
      const allMembers = await base44.asServiceRole.entities.GroupMember.filter({ group_id });
      const adminCount = allMembers.filter(m => m.role === 'admin').length;
      if (adminCount <= 1) {
        return Response.json({ error: 'Cannot unclaim the last admin. Promote another member first.' }, { status: 400 });
      }
    }

    const updated = await base44.asServiceRole.entities.GroupMember.update(member_id, {
      user_id: null,
      claimed: false,
      claim_token: null,
      role: 'player'
    });

    return Response.json({ member: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
