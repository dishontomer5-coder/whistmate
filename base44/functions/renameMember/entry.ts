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

// A group that is not active is read-only: archived -> 403, deleted or gone -> 404.
// Resolves to the response to send back, or to null when the group can be written to.
async function readOnlyGroup(base44, groupId) {
  if (!groupId) return null; // a record that belongs to no group has no status to honour
  const group = await base44.asServiceRole.entities.Group.get(groupId).catch(() => null);
  if (!group || group.status === 'deleted') return Response.json({ error: 'Group not found' }, { status: 404 });
  if ((group.status || 'active') !== 'active') {
    return Response.json({ error: 'This group is archived — it is read-only' }, { status: 403 });
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

// Rename a member / player. Group admins can rename anyone; a claimed member can
// rename their own profile. Enforces (group_id, player_name) uniqueness and sweeps
// the denormalized name on RoundResult so standings and round results all update.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { group_id, member_id, player_name } = await req.json();
    if (!group_id || !member_id || !player_name) {
      return Response.json({ error: 'group_id, member_id and player_name are required' }, { status: 400 });
    }
    const newName = player_name.trim();
    if (!newName) return Response.json({ error: 'Name cannot be empty' }, { status: 400 });
    if (newName.length > 30) return Response.json({ error: 'Name is too long (max 30)' }, { status: 400 });

    const target = await base44.asServiceRole.entities.GroupMember.get(member_id).catch(() => null);
    if (!target || target.group_id !== group_id) {
      return Response.json({ error: 'Member not found in this group' }, { status: 404 });
    }

    // Permission: platform admin, group admin, or the member renaming themselves
    let allowed = user.role === 'admin' || target.user_id === user.id;
    if (!allowed) {
      const rows = await base44.asServiceRole.entities.GroupMember.filter({ user_id: user.id });
      let mine = rows.filter(m => m.group_id === group_id);
      if (mine.length === 0) {
        const hinted = await hintedMemberRow(base44, user, group_id);
        if (hinted) mine = [hinted];
      }
      allowed = mine.length > 0 && mine[0].role === 'admin';
    }
    if (!allowed) {
      return Response.json({ error: 'Only a group admin can rename another player' }, { status: 403 });
    }

    const readOnly = await readOnlyGroup(base44, group_id);
    if (readOnly) return readOnly;

    if (newName === target.player_name) {
      return Response.json({ member: target }); // no-op
    }

    // (group_id, player_name) uniqueness — against the whole roster, excluding the target itself
    const groupMembers = await fetchAll(base44.asServiceRole.entities.GroupMember, { group_id });
    if (groupMembers.some(m => m.id !== member_id && String(m.player_name || '').toLowerCase() === newName.toLowerCase())) {
      return Response.json({ error: `A member named "${newName}" already exists in this group` }, { status: 409 });
    }

    const updated = await base44.asServiceRole.entities.GroupMember.update(member_id, { player_name: newName });

    // Sweep the denormalized name on EVERY round result of this player — one filter()
    // returns a single page — a batch at a time (rename is rare).
    const roundResults = (await fetchAll(base44.asServiceRole.entities.RoundResult, { player_id: member_id }))
      .filter(rr => rr.player_name !== newName);
    for (let i = 0; i < roundResults.length; i += 50) {
      await Promise.all(roundResults.slice(i, i + 50).map(rr =>
        base44.asServiceRole.entities.RoundResult.update(rr.id, { player_name: newName }).catch(() => null)
      ));
    }

    return Response.json({ member: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
