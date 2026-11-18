import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const RATE_LIMIT_MAX_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

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

async function refreshUserGroups(base44, userId, knownMember = null) {
  const memberships = await base44.asServiceRole.entities.GroupMember.filter({ user_id: userId });
  // P7-9: a membership written moments ago can be missing from this query
  // (read-after-write lag) — merge the record we just wrote so the session
  // cache is never stale for the joiner
  if (knownMember && !memberships.some(m => m.id === knownMember.id)) {
    memberships.push(knownMember);
  }
  const groupIds = [...new Set(memberships.map(m => m.group_id))];
  const groups = await Promise.all(
    groupIds.map(gid => base44.asServiceRole.entities.Group.get(gid).catch(() => null))
  );
  const groupMap = {};
  groups.forEach(g => { if (g) groupMap[g.id] = g; });
  const result = memberships.map(m => ({
    member_id: m.id,
    group_id: m.group_id,
    role: m.role,
    player_name: m.player_name,
    group_name: groupMap[m.group_id]?.name || 'Unknown',
    group: groupMap[m.group_id] || null
  }));
  await base44.auth.updateMe({ groups: result });
  return result;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    // Two identity paths (plan.md §11.2): claim an unclaimed player
    // (claim_member_id) or join as a new player (player_name)
    const { invite_code, player_name, claim_member_id } = body;

    if (!invite_code) {
      return Response.json({ error: 'Invite code is required' }, { status: 400 });
    }

    // Rate-limit: count recent attempts by this user
    const tenMinutesAgo = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const recentAttempts = await base44.asServiceRole.entities.JoinAttempt.filter({
      user_id: user.id,
      created_date: { $gte: tenMinutesAgo }
    });

    // Opportunistic cleanup — attempts outside the window are dead weight (P2-4)
    await base44.asServiceRole.entities.JoinAttempt.deleteMany({
      user_id: user.id,
      created_date: { $lt: tenMinutesAgo }
    }).catch(() => {});

    if (recentAttempts.length >= RATE_LIMIT_MAX_ATTEMPTS) {
      return Response.json({ error: 'Too many attempts. Please try again in a few minutes.' }, { status: 429 });
    }

    // Log this attempt
    await base44.asServiceRole.entities.JoinAttempt.create({
      user_id: user.id,
      invite_code: invite_code.toUpperCase().trim()
    });

    // Find the group by invite code
    const groups = await base44.asServiceRole.entities.Group.filter({
      invite_code: invite_code.toUpperCase().trim()
    });

    if (groups.length === 0) {
      return Response.json({ error: 'Invalid invite code' }, { status: 404 });
    }

    const group = groups[0];

    // A group that is not active is read-only — no new members (§11.1 principle 5):
    // deleted -> 404, archived -> 403, the same answers every other write gives
    if (group.status === 'deleted') return Response.json({ error: 'Group not found' }, { status: 404 });
    if ((group.status || 'active') !== 'active') {
      return Response.json({ error: 'This group is archived — it is read-only' }, { status: 403 });
    }

    // Check if user is already a member
    const existingRows = await base44.asServiceRole.entities.GroupMember.filter({ user_id: user.id });
    // Resilient membership lookup (P7-9): user_id-only query, group matched in
    // memory, cache-hinted row re-read by id -- compound (group_id, user_id) reads can
    // lag for freshly-claimed membership rows. Only a real row of the caller's counts
    // as "already a member"; a cache entry on its own says nothing.
    let existing = existingRows.filter(m => m.group_id === group.id);
    if (existing.length === 0) {
      const hinted = await hintedMemberRow(base44, user, group.id);
      if (hinted) existing = [hinted];
    }

    if (existing.length > 0) {
      return Response.json({ error: 'You are already a member of this group' }, { status: 409 });
    }

    // Claim path: link this user to an existing unclaimed player — the ghost's
    // name and game history are preserved. Unclaimed status is re-verified HERE
    // so a concurrent claim of the same player loses with a 409 (§11.2)
    if (claim_member_id) {
      const target = await base44.asServiceRole.entities.GroupMember.get(claim_member_id).catch(() => null);
      if (!target || target.group_id !== group.id) {
        return Response.json({ error: 'Player not found in this group' }, { status: 404 });
      }
      if (target.claimed || target.user_id) {
        return Response.json({ error: `"${target.player_name}" has already been claimed. Pick another player or join as new.` }, { status: 409 });
      }
      const claimedMember = await base44.asServiceRole.entities.GroupMember.update(claim_member_id, {
        user_id: user.id,
        claimed: true,
        claim_token: null
      });
      const updatedGroups = await refreshUserGroups(base44, user.id, claimedMember);
      return Response.json({ group, member: claimedMember, groups: updatedGroups });
    }

    // New-player path below.
    // Determine display name — use provided name, or fall back to user's full_name
    const displayName = (player_name || user.full_name || 'Player').trim();

    // v3: Enforce (group_id, player_name) uniqueness at application level
    const existingWithName = await base44.asServiceRole.entities.GroupMember.filter({
      group_id: group.id,
      player_name: displayName
    });
    if (existingWithName.length > 0) {
      return Response.json({ error: `A member named "${displayName}" already exists in this group. Try a different display name.` }, { status: 409 });
    }

    // Create membership (player role, claimed=true since they have an account)
    const newMember = await base44.asServiceRole.entities.GroupMember.create({
      group_id: group.id,
      user_id: user.id,
      role: 'player',
      player_name: displayName,
      joined_date: new Date().toISOString(),
      claimed: true,
      claim_token: null
    });

    // v3: Refresh cached groups before returning (write-through, P7-9)
    const updatedGroups = await refreshUserGroups(base44, user.id, newMember);

    return Response.json({ group, groups: updatedGroups });
  } catch (error) {
    // v3: Catch duplicate-key error from (group_id, player_name) unique constraint
    if (error.message && (error.message.includes('duplicate') || error.code === 11000)) {
      return Response.json({ error: 'A member with that name already exists in this group. Try a different display name.' }, { status: 409 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
});