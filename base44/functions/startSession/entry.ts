import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Start a new whist Session (a meetup/night) in a group. Session/Game/RoundResult
// create RLS is platform-admin only — sessions are created through this function,
// which enforces group membership + the group lifecycle and freezes the scoring
// rules from the group defaults. One open session per group at a time.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { group_id, name, session_date, location, scoring_method, advanced_rules_enabled } = await req.json();
    if (!group_id) return Response.json({ error: 'group_id is required' }, { status: 400 });

    const group = await base44.asServiceRole.entities.Group.get(group_id);
    if (!group) return Response.json({ error: 'Group not found' }, { status: 404 });
    if ((group.status || 'active') !== 'active') {
      return Response.json({ error: 'This group is archived — new sessions cannot be started' }, { status: 403 });
    }

    // Any member of the group may start a session (app admins allowed for support).
    if (user.role !== 'admin') {
      const rows = await base44.asServiceRole.entities.GroupMember.filter({ user_id: user.id });
      // Resilient membership lookup: user_id-only query, group matched in memory,
      // session-cache fallback -- compound (group_id, user_id) reads can lag for
      // freshly-claimed membership rows.
      let mine = rows.filter((m) => m.group_id === group_id);
      if (mine.length === 0 && (user.groups || []).some((g) => g.group_id === group_id)) mine = [1];
      if (mine.length === 0) {
        return Response.json({ error: 'You are not a member of this group' }, { status: 403 });
      }
    }

    // One open session per group. Query by group_id only + check status in memory:
    // the compound {group_id, status} index can read stale right after a write.
    const recent = await base44.asServiceRole.entities.Session.filter({ group_id }, '-created_date', 200);
    const open = recent.find((s) => s.status === 'open');
    if (open) {
      return Response.json({ error: 'A session is already open in this group', open_session_id: open.id }, { status: 409 });
    }

    const session = await base44.asServiceRole.entities.Session.create({
      group_id,
      name: (name || '').trim() || 'Whist Night',
      status: 'open',
      session_date: session_date || new Date().toISOString().slice(0, 10),
      location: (location || '').trim(),
      // Scoring rules are chosen per-session at creation (falling back to the
      // group defaults), then frozen for the whole night.
      advanced_rules_enabled: advanced_rules_enabled != null ? !!advanced_rules_enabled : !!group.advanced_rules_default,
      scoring_method: (scoring_method || group.scoring_method_default) === 'progressive' ? 'progressive' : 'classic',
      game_limit: null,
    });

    return Response.json({ session });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
