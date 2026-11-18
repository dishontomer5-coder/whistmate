import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Activity feed (P8-1): table-talk notes across every group the caller belongs
// to, enriched server-side. Names of other GroupMembers aren't client-readable
// under RLS, and anonymous authors must be stripped HERE, not just hidden in UI.
// Seen-state lives on the user record (activity_seen_ts) so badges are
// consistent across devices.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const countOnly = !!body.count_only;
    const markSeen = !!body.mark_seen;
    const limit = Math.min(Number(body.limit) || 50, 200);

    // Memberships via the resilient pattern (P7-9): user_id query + cache fallback
    const memberships = await base44.asServiceRole.entities.GroupMember.filter({ user_id: user.id });
    const memberIds = new Set(memberships.map(m => m.id));
    const groupIdSet = new Set(memberships.map(m => m.group_id));
    // The cache covers read-after-write lag, but it is only a hint (P12-1): a user can
    // write their own record, so each hinted membership is re-read by id and must really
    // be the caller's before its group's notes are included.
    for (const cached of (user.groups || [])) {
      if (!cached || !cached.member_id || memberIds.has(cached.member_id)) continue;
      const row = await base44.asServiceRole.entities.GroupMember.get(cached.member_id).catch(() => null);
      if (row && row.user_id === user.id) {
        memberIds.add(row.id);
        groupIdSet.add(row.group_id);
      }
    }

    if (groupIdSet.size === 0) {
      return Response.json({ notes: [], unseen_count: 0, latest_ts: null });
    }

    // Exclude deleted groups (archived groups keep their history visible)
    const groups = await Promise.all(
      [...groupIdSet].map(gid => base44.asServiceRole.entities.Group.get(gid).catch(() => null))
    );
    const groupMap = {};
    groups.forEach(g => { if (g && g.status !== 'deleted') groupMap[g.id] = g; });
    const activeGroupIds = Object.keys(groupMap);

    if (activeGroupIds.length === 0) {
      return Response.json({ notes: [], unseen_count: 0, latest_ts: null });
    }

    const notes = await base44.asServiceRole.entities.TableTalkNote.filter(
      { group_id: { $in: activeGroupIds } },
      '-created_date',
      limit
    );

    const seenTs = user.activity_seen_ts ? new Date(user.activity_seen_ts).getTime() : 0;
    const unseenCount = notes.filter(n => new Date(n.created_date).getTime() > seenTs).length;
    const latestTs = notes.length > 0 ? notes[0].created_date : null;

    if (markSeen) {
      await base44.auth.updateMe({ activity_seen_ts: new Date().toISOString() });
    }

    if (countOnly) {
      return Response.json({ unseen_count: unseenCount, latest_ts: latestTs });
    }

    // Resolve target player names (single batched query across the caller's groups)
    const allMembers = await base44.asServiceRole.entities.GroupMember.filter(
      { group_id: { $in: activeGroupIds } },
      '-created_date',
      2000
    );
    const memberNameMap = {};
    allMembers.forEach(m => { memberNameMap[m.id] = m.player_name; });

    const enriched = notes.map(n => ({
      id: n.id,
      group_id: n.group_id,
      group_name: groupMap[n.group_id]?.name || 'Unknown group',
      // Anonymous notes never expose the author — stripped server-side
      author_name: n.is_anonymous ? null : (n.author_name || 'Unknown player'),
      is_anonymous: !!n.is_anonymous,
      target_player_id: n.target_player_id,
      target_player_name: memberNameMap[n.target_player_id] || 'a former player',
      is_about_me: memberIds.has(n.target_player_id),
      note: n.note,
      game_name: n.game_name || null,
      game_date: n.game_date || null,
      created_date: n.created_date,
      is_unseen: new Date(n.created_date).getTime() > seenTs
    }));

    return Response.json({ notes: enriched, unseen_count: unseenCount, latest_ts: latestTs });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
