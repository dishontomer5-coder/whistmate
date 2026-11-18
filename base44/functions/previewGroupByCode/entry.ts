import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const RATE_LIMIT_MAX_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes — shared window with joinGroupByCode

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

// Step 1 of the claim-by-code join flow (plan.md §11): validates the invite
// code and returns what the joiner needs to pick an identity — the group info
// and its unclaimed players. Possession of the code is the trust boundary.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { invite_code } = await req.json();
    if (!invite_code) {
      return Response.json({ error: 'Invite code is required' }, { status: 400 });
    }
    const code = invite_code.toUpperCase().trim();

    // Shared rate limit with joinGroupByCode via JoinAttempt
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const recentAttempts = await base44.asServiceRole.entities.JoinAttempt.filter({
      user_id: user.id,
      created_date: { $gte: windowStart }
    });
    if (recentAttempts.length >= RATE_LIMIT_MAX_ATTEMPTS) {
      return Response.json({ error: 'Too many attempts. Please try again in a few minutes.' }, { status: 429 });
    }
    await base44.asServiceRole.entities.JoinAttempt.create({ user_id: user.id, invite_code: code });

    const groups = await base44.asServiceRole.entities.Group.filter({ invite_code: code });
    if (groups.length === 0) {
      return Response.json({ error: 'Invalid invite code' }, { status: 404 });
    }
    const group = groups[0];

    // A group that is not active is read-only — no new members (§11.1 principle 5):
    // deleted -> 404, archived -> 403, the same answers every write gives
    if (group.status === 'deleted') return Response.json({ error: 'Group not found' }, { status: 404 });
    if ((group.status || 'active') !== 'active') {
      return Response.json({ error: 'This group is archived — it is read-only' }, { status: 403 });
    }

    // The whole roster: the joiner picks from every unclaimed player, not the first page
    const members = await fetchAll(base44.asServiceRole.entities.GroupMember, { group_id: group.id });
    const alreadyMember = members.some(m => m.user_id === user.id);

    const unclaimedPlayers = members
      .filter(m => !m.claimed && !m.user_id)
      .map(m => ({ id: m.id, player_name: m.player_name }))
      .sort((a, b) => a.player_name.localeCompare(b.player_name));

    return Response.json({
      group: { id: group.id, name: group.name, description: group.description || '' },
      already_member: alreadyMember,
      unclaimed_players: unclaimedPlayers,
      existing_names: members.map(m => m.player_name)
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
