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
    const targetMember = await base44.asServiceRole.entities.GroupMember.get(member_id).catch(() => null);
    if (!targetMember || targetMember.group_id !== group_id) {
      return Response.json({ error: 'Member not found in this group' }, { status: 404 });
    }

    // Self-removal (leaving the group) is allowed for non-last-admins
    const isSelf = targetMember.user_id === user.id;

    if (!isSelf) {
      // Admin check for removing others
      const myMembershipRows = await base44.asServiceRole.entities.GroupMember.filter({ user_id: user.id });
      // Resilient membership lookup (P7-9): user_id-only query, group matched in
      // memory, cache-hinted row re-read by id -- compound (group_id, user_id) reads can
      // lag for freshly-claimed membership rows
      let myMembership = myMembershipRows.filter(m => m.group_id === group_id);
      if (myMembership.length === 0) {
        const hinted = await hintedMemberRow(base44, user, group_id);
        if (hinted) myMembership = [hinted];
      }

      if (myMembership.length === 0) {
        return Response.json({ error: 'You are not a member of this group' }, { status: 403 });
      }

      if (myMembership[0].role !== 'admin') {
        return Response.json({ error: 'Only group admins can remove other members' }, { status: 403 });
      }
    }

    // A group that is not active is read-only: archived -> 403, deleted or gone -> 404.
    // The one thing a member can still do in an archived group is leave it.
    const group = await base44.asServiceRole.entities.Group.get(group_id).catch(() => null);
    if (!group || group.status === 'deleted') return Response.json({ error: 'Group not found' }, { status: 404 });
    if ((group.status || 'active') !== 'active' && !isSelf) {
      return Response.json({ error: 'This group is archived — it is read-only' }, { status: 403 });
    }

    // Prevent removing the last admin — applies to self-removal too, otherwise
    // the group is left with no admin (P2-2). The whole roster is read, and only an
    // admin who has an account counts as one who is left.
    if (targetMember.role === 'admin') {
      const allMembers = await fetchAll(base44.asServiceRole.entities.GroupMember, { group_id });
      const otherAdmins = allMembers.filter(m => m.id !== targetMember.id && m.role === 'admin' && m.user_id);
      if (otherAdmins.length === 0) {
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