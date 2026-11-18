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

// What two player names are compared by: no surrounding spaces, no letter case.
const nameKey = (name) => String(name || '').trim().toLowerCase();

Deno.serve(async (req) => {
  // Hoisted above try so the catch block can reference it (P1-2)
  let playerName = '';
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { group_id, player_name } = body;
    playerName = (player_name || '').trim();

    if (!group_id || !player_name) {
      return Response.json({ error: 'group_id and player_name are required' }, { status: 400 });
    }

    // Verify the requesting user is an admin of this group
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
      return Response.json({ error: 'Only group admins can add ghost members' }, { status: 403 });
    }

    const readOnly = await readOnlyGroup(base44, group_id);
    if (readOnly) return readOnly;

    // A player name is unique within a group whatever its letter case or surrounding
    // spaces ("Dan", "dan " and "DAN" are one name) — checked against the whole roster,
    // not one page of it. joinGroupByCode and renameMember apply the same rule.
    const roster = await fetchAll(base44.asServiceRole.entities.GroupMember, { group_id });
    if (roster.some((m) => nameKey(m.player_name) === nameKey(playerName))) {
      return Response.json({ error: `A member named "${playerName}" already exists in this group` }, { status: 409 });
    }

    // Create ghost member (user_id=null, claimed=false)
    const member = await base44.asServiceRole.entities.GroupMember.create({
      group_id,
      user_id: null,
      role: 'player',
      player_name: player_name.trim(),
      joined_date: new Date().toISOString(),
      claimed: false,
      claim_token: null
    });

    return Response.json({ member });
  } catch (error) {
    // v3: Catch duplicate-key error from (group_id, player_name) unique constraint
    if (error.message && (error.message.includes('duplicate') || error.code === 11000)) {
      return Response.json({ error: `A member named "${playerName}" already exists in this group` }, { status: 409 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
});