import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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
        const cached = (user.groups || []).find(g => g.group_id === group_id);
        if (cached) mine = [cached];
      }
      allowed = mine.length > 0 && mine[0].role === 'admin';
    }
    if (!allowed) {
      return Response.json({ error: 'Only a group admin can rename another player' }, { status: 403 });
    }

    if (newName === target.player_name) {
      return Response.json({ member: target }); // no-op
    }

    // (group_id, player_name) uniqueness — exclude the target itself
    const groupMembers = await base44.asServiceRole.entities.GroupMember.filter({ group_id });
    if (groupMembers.some(m => m.id !== member_id && m.player_name.toLowerCase() === newName.toLowerCase())) {
      return Response.json({ error: `A member named "${newName}" already exists in this group` }, { status: 409 });
    }

    const updated = await base44.asServiceRole.entities.GroupMember.update(member_id, { player_name: newName });

    // Sweep the denormalized name on this player's round results (bounded; rename is rare)
    const roundResults = await base44.asServiceRole.entities.RoundResult.filter({ player_id: member_id });
    await Promise.all(roundResults.map(rr =>
      base44.asServiceRole.entities.RoundResult.update(rr.id, { player_name: newName }).catch(() => null)
    ));

    return Response.json({ member: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
