import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// How many cache-hinted member rows are re-read by id at the most — a user can write
// their own cache, and stuffing it must not buy one request any number of reads.
const MAX_HINTS = 5;

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

// Every user, a page at a time: User.list() on its own returns the first page only, so
// members whose account is not on it would show no email. list() is the known-good read
// for the built-in User entity (.get(id) returned nothing here), so that is what is
// paged; if paging comes back empty, fall back to the plain call used before.
async function listAllUsers(base44) {
  const users = base44.asServiceRole.entities.User;
  const all = [];
  const seen = new Set();
  for (let guard = 0; guard < 200; guard++) {
    const page = await users.list('-created_date', PAGE, all.length).catch(() => null);
    if (!Array.isArray(page)) break;
    const fresh = page.filter((u) => u && u.id && !seen.has(u.id));
    fresh.forEach((u) => { seen.add(u.id); all.push(u); });
    if (page.length < PAGE || fresh.length === 0) break;
  }
  if (all.length > 0) return all;
  const firstPage = await users.list().catch(() => null);
  return Array.isArray(firstPage) ? firstPage : [];
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

    // Verify the requesting user is a member of this group
    const myMembershipRows = await base44.asServiceRole.entities.GroupMember.filter({ user_id: user.id });
    // Resilient membership lookup (P7-9): user_id-only query, group matched in
    // memory, cache-hinted row re-read by id -- compound (group_id, user_id) reads can
    // lag for freshly-claimed membership rows
    let myMembership = myMembershipRows.filter(m => m.group_id === group_id);
    if (myMembership.length === 0) {
      // The cache is only a hint (P12-1): a user can write their own record, and this
      // endpoint returns the roster (plus emails to admins). So a hinted row is re-read
      // by id and must really be the caller's — its role comes from the row, not the
      // cache — and at most MAX_HINTS different rows are tried.
      const tried = new Set();
      for (const hint of (user.groups || [])) {
        if (!hint || hint.group_id !== group_id || !hint.member_id || tried.has(hint.member_id)) continue;
        if (tried.size >= MAX_HINTS) break;
        tried.add(hint.member_id);
        const row = await base44.asServiceRole.entities.GroupMember.get(hint.member_id).catch(() => null);
        if (row && row.user_id === user.id && row.group_id === group_id) { myMembership = [row]; break; }
      }
    }

    if (myMembership.length === 0) {
      return Response.json({ error: 'You are not a member of this group' }, { status: 403 });
    }

    // Fetch ALL members (including ghosts), past the first page — service-role bypasses RLS
    const members = await fetchAll(base44.asServiceRole.entities.GroupMember, { group_id });

    // Sort: admins first, then by name
    members.sort((a, b) => {
      if (a.role === 'admin' && b.role !== 'admin') return -1;
      if (a.role !== 'admin' && b.role === 'admin') return 1;
      return a.player_name.localeCompare(b.player_name);
    });

    // Attach claimed players' emails — PII, so ONLY for admin requesters (P11).
    // This same endpoint feeds non-admin screens (player pickers), which must
    // never receive emails.
    const requesterIsAdmin = myMembership[0].role === 'admin' || user.role === 'admin';
    if (requesterIsAdmin) {
      // Map id -> email in memory (P11 fix)
      const allUsers = await listAllUsers(base44);
      const emailMap = {};
      allUsers.forEach(u => { if (u && u.id) emailMap[u.id] = u.email; });
      members.forEach(m => { if (m.user_id && emailMap[m.user_id]) m.email = emailMap[m.user_id]; });
    }

    return Response.json({ members, my_role: myMembership[0].role });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
