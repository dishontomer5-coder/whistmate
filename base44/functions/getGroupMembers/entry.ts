import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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
    // memory, session-cache fallback -- compound (group_id, user_id) reads can
    // lag for freshly-claimed membership rows
    let myMembership = myMembershipRows.filter(m => m.group_id === group_id);
    if (myMembership.length === 0) {
      // The cache is only a hint (P12-1): a user can write their own record, and this
      // endpoint returns the roster (plus emails to admins). So the hinted row is re-read
      // by id and must really be the caller's — its role comes from the row, not the cache.
      const hint = (user.groups || []).find(g => g && g.group_id === group_id && g.member_id);
      const row = hint ? await base44.asServiceRole.entities.GroupMember.get(hint.member_id).catch(() => null) : null;
      if (row && row.user_id === user.id && row.group_id === group_id) myMembership = [row];
    }

    if (myMembership.length === 0) {
      return Response.json({ error: 'You are not a member of this group' }, { status: 403 });
    }

    // Fetch ALL members (including ghosts) — service-role bypasses RLS
    const members = await base44.asServiceRole.entities.GroupMember.filter({
      group_id
    });

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
      // User.list() is the known-good read for the built-in User entity
      // (.get(id) returned nothing here); map id -> email in memory (P11 fix).
      const allUsers = await base44.asServiceRole.entities.User.list().catch(() => []);
      const emailMap = {};
      (allUsers || []).forEach(u => { if (u && u.id) emailMap[u.id] = u.email; });
      members.forEach(m => { if (m.user_id && emailMap[m.user_id]) m.email = emailMap[m.user_id]; });
    }

    return Response.json({ members, my_role: myMembership[0].role });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});