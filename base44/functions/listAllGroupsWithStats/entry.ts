import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// App-admin overview: every group with whist activity counts.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    if (user.role !== 'admin') {
      return Response.json({ error: 'App admin only' }, { status: 403 });
    }

    const [groups, members, sessions, rounds] = await Promise.all([
      base44.asServiceRole.entities.Group.filter({}, '-created_date', 500),
      base44.asServiceRole.entities.GroupMember.filter({}, '-created_date', 2000),
      base44.asServiceRole.entities.Session.filter({}, '-created_date', 5000),
      base44.asServiceRole.entities.Game.filter({}, '-created_date', 20000),
    ]);

    const stats = groups.map((g) => {
      const groupMembers = members.filter((m) => m.group_id === g.id);
      const groupSessions = sessions.filter((s) => s.group_id === g.id);
      const groupRounds = rounds.filter((r) => r.group_id === g.id);
      const scoredRounds = groupRounds.filter((r) => r.status === 'complete').length;

      const lastActivity = groupSessions.length > 0
        ? groupSessions
            .map((s) => s.session_date || s.created_date)
            .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
        : null;

      return {
        id: g.id,
        name: g.name,
        status: g.status || 'active',
        player_count: groupMembers.length,
        total_sessions: groupSessions.length,
        total_rounds: groupRounds.length,
        scored_rounds: scoredRounds,
        last_activity: lastActivity,
        created_date: g.created_date,
      };
    });

    return Response.json({ groups: stats });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
