import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// How many cached memberships are re-read by id at the most — a user can write their
// own cache, and stuffing it must not buy one request any number of reads.
const MAX_HINTS = 5;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Fetch all GroupMember records for this user (service role for reliability,
    // including ghost members that may have user_id = null but were claimed by this user)
    const memberships = await base44.asServiceRole.entities.GroupMember.filter({
      user_id: user.id
    });

    // P7-9: reads can lag for freshly-claimed rows. Reconcile against the
    // session cache via by-ID gets (reliable) so a just-joined group doesn't
    // vanish — and stale cache entries (left groups) are dropped, not revived.
    const queriedIds = new Set(memberships.map(m => m.id));
    const tried = new Set();
    for (const cached of (user.groups || [])) {
      if (!cached || !cached.member_id || queriedIds.has(cached.member_id) || tried.has(cached.member_id)) continue;
      if (tried.size >= MAX_HINTS) break;
      tried.add(cached.member_id);
      const row = await base44.asServiceRole.entities.GroupMember.get(cached.member_id).catch(() => null);
      if (row && row.user_id === user.id) {
        memberships.push(row);
        queriedIds.add(row.id);
      }
    }

    if (memberships.length === 0) {
      // Cache empty array on user metadata to prevent stale state
      await base44.auth.updateMe({ groups: [] });
      return Response.json({ groups: [] });
    }

    // Fetch all related Groups (typically 1-5, so parallel gets are efficient)
    const groupIds = [...new Set(memberships.map(m => m.group_id))];
    const groups = await Promise.all(
      groupIds.map(gid =>
        base44.asServiceRole.entities.Group.get(gid).catch(() => null)
      )
    );

    const groupMap = {};
    groups.forEach(g => { if (g && g.status !== 'deleted') groupMap[g.id] = g; });

    // Build the cached membership array — exclude deleted groups
    const result = memberships
      .filter(m => groupMap[m.group_id])
      .map(m => ({
      member_id: m.id,
      group_id: m.group_id,
      role: m.role,
      player_name: m.player_name,
      group_name: groupMap[m.group_id]?.name || 'Unknown',
      group: groupMap[m.group_id] || null
    }));

    // Cache on user auth metadata for mid-session RLS checks and frontend access.
    // This is the session-cached membership array referenced in the architecture plan (§3.2, §5.2).
    // Mid-session cache invalidation (§5.3): createGroup/joinGroupByCode must call
    // updateMe with the refreshed array BEFORE returning success.
    await base44.auth.updateMe({ groups: result });

    return Response.json({ groups: result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});