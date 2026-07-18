import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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
    // memory, session-cache fallback -- compound (group_id, user_id) reads can
    // lag for freshly-claimed membership rows
    let myMembership = myMembershipRows.filter(m => m.group_id === group_id);
    if (myMembership.length === 0) {
      const cachedMembership = (user.groups || []).find(g => g.group_id === group_id);
      if (cachedMembership) myMembership = [{ id: cachedMembership.member_id, group_id: cachedMembership.group_id, user_id: user.id, role: cachedMembership.role, player_name: cachedMembership.player_name }];
    }

    if (myMembership.length === 0) {
      return Response.json({ error: 'You are not a member of this group' }, { status: 403 });
    }

    if (myMembership[0].role !== 'admin') {
      return Response.json({ error: 'Only group admins can add ghost members' }, { status: 403 });
    }

    // v3: Enforce (group_id, player_name) uniqueness at application level
    const existingWithName = await base44.asServiceRole.entities.GroupMember.filter({
      group_id,
      player_name: player_name.trim()
    });
    if (existingWithName.length > 0) {
      return Response.json({ error: `A member named "${player_name.trim()}" already exists in this group` }, { status: 409 });
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