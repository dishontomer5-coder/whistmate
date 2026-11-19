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
    // A cached entry whose row is gone or no longer the caller's means an admin took the
    // caller out (detached their account, or removed them): it is reported once in
    // removed_from — the cache is rewritten below, so the next call no longer has it.
    // Only what the caller's own cache says is echoed back; no group is read for it.
    // A group that was deleted while the caller was in it (their row is still theirs, but
    // its group is gone or has status 'deleted') is reported the same way, once, with
    // reason 'deleted' — below, from the groups of the caller's own rows.
    const queriedIds = new Set(memberships.map(m => m.id));
    const tried = new Set();
    const lost = [];
    const cachedName = new Map(); // group_id -> the name the caller's cache gives it
    for (const cached of (Array.isArray(user.groups) ? user.groups : [])) {
      if (cached?.group_id && !cachedName.has(String(cached.group_id))) cachedName.set(String(cached.group_id), typeof cached.group_name === 'string' ? cached.group_name : null);
      if (!cached || !cached.member_id || queriedIds.has(cached.member_id) || tried.has(cached.member_id)) continue;
      if (tried.size >= MAX_HINTS) continue;
      tried.add(cached.member_id);
      const row = await base44.asServiceRole.entities.GroupMember.get(cached.member_id).catch(() => null);
      if (row && row.user_id === user.id) {
        memberships.push(row);
        queriedIds.add(row.id);
      } else if (cached.group_id) {
        lost.push({ group_id: String(cached.group_id), group_name: typeof cached.group_name === 'string' ? cached.group_name : null });
      }
    }
    // Still in that group through another row (claimed again, rejoined): not removed.
    const removedFrom = (stillIn) => {
      const seen = new Set();
      return lost.filter((g) => !stillIn.has(g.group_id) && !seen.has(g.group_id) && seen.add(g.group_id));
    };

    if (memberships.length === 0) {
      // Cache empty array on user metadata to prevent stale state
      await base44.auth.updateMe({ groups: [] });
      return Response.json({ groups: [], removed_from: removedFrom(new Set()) });
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

    // Deleted under the caller: one of their own rows points at a group that is gone or
    // deleted, and their cache still lists it (so they have not been told yet).
    const deletedFrom = groupIds
      .filter((gid) => !groupMap[gid] && cachedName.has(String(gid)))
      .map((gid) => ({ group_id: String(gid), group_name: cachedName.get(String(gid)), reason: 'deleted' }));

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

    const liveIds = new Set(result.map((r) => r.group_id));
    return Response.json({ groups: result, removed_from: [...deletedFrom, ...removedFrom(liveIds).filter((g) => !deletedFrom.some((d) => d.group_id === g.group_id))] });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});