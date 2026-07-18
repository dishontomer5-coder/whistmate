import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function generateInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function refreshUserGroups(base44, userId, knownMember = null) {
  const memberships = await base44.asServiceRole.entities.GroupMember.filter({ user_id: userId });
  // P7-9: a membership written moments ago can be missing from this query
  // (read-after-write lag) — merge the record we just wrote so the session
  // cache is never stale for the creator
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
  // v3: Mid-session cache invalidation — update auth metadata BEFORE returning
  await base44.auth.updateMe({ groups: result });
  return result;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { name, description, player_name, advanced_rules_default, scoring_method_default } = body;

    if (!name || !player_name) {
      return Response.json({ error: 'Group name and your display name are required' }, { status: 400 });
    }

    // Generate unique invite code (collision-checked)
    let inviteCode = generateInviteCode();
    let existing = await base44.asServiceRole.entities.Group.filter({ invite_code: inviteCode });
    while (existing.length > 0) {
      inviteCode = generateInviteCode();
      existing = await base44.asServiceRole.entities.Group.filter({ invite_code: inviteCode });
    }

    // Create the Group (whist defaults; frozen onto each Session at creation)
    const group = await base44.asServiceRole.entities.Group.create({
      name,
      description: description || '',
      invite_code: inviteCode,
      advanced_rules_default: !!advanced_rules_default,
      scoring_method_default: scoring_method_default === 'progressive' ? 'progressive' : 'classic'
    });

    // Create the creator's membership as admin
    const creatorMember = await base44.asServiceRole.entities.GroupMember.create({
      group_id: group.id,
      user_id: user.id,
      role: 'admin',
      player_name,
      joined_date: new Date().toISOString(),
      claimed: true,
      claim_token: null
    });

    // v3: Refresh the user's cached groups before returning (write-through, P7-9)
    const groups = await refreshUserGroups(base44, user.id, creatorMember);

    return Response.json({ group, groups });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});