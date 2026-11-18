import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const PAGE = 500; // the entity store hands out at most 500 rows per filter()
// EVERY row of an entity, or an error — a count made from the first page alone is
// simply wrong. Cursor pagination as in getGroupData; the $lte cursor + seen-set copes
// with rows sharing a created_date.
async function fetchAll(entity, what) {
  const all = [];
  const seen = new Set();
  let cursor = null;
  for (let guard = 0; guard < 1000; guard++) {
    const page = await entity.filter(cursor ? { created_date: { $lte: cursor } } : {}, '-created_date', PAGE);
    const fresh = page.filter((r) => !seen.has(r.id));
    fresh.forEach((r) => { seen.add(r.id); all.push(r); });
    if (page.length < PAGE) return all; // a short page is the last one: everything has been read
    if (fresh.length === 0) break;      // a full page with nothing new: no telling what is left
    cursor = page[page.length - 1].created_date;
  }
  throw new Error(`Could not read every ${what}`);
}

// App-admin overview: every group with whist activity counts.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    if (user.role !== 'admin') {
      return Response.json({ error: 'App admin only' }, { status: 403 });
    }

    const db = base44.asServiceRole.entities;
    const [groups, members, sessions, rounds] = await Promise.all([
      fetchAll(db.Group, 'group'),
      fetchAll(db.GroupMember, 'member'),
      fetchAll(db.Session, 'session'),
      fetchAll(db.Game, 'round'),
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
