import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// How many cached memberships are re-read by id at the most — a user can write their
// own cache, and stuffing it must not buy one request any number of reads.
const MAX_HINTS = 5;

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
    // be the caller's before its group's notes are included. At most MAX_HINTS are tried.
    const tried = new Set();
    for (const cached of (user.groups || [])) {
      if (!cached || !cached.member_id || memberIds.has(cached.member_id) || tried.has(cached.member_id)) continue;
      if (tried.size >= MAX_HINTS) break;
      tried.add(cached.member_id);
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
    // A note the caller wrote is not news to them: it is never "unseen" and does not raise
    // their own badge. Only a signed note can be told apart — an anonymous note is stored
    // with no author at all (createNote), so the writer's own anonymous note still counts
    // for them like anybody else's.
    const isUnseen = (n) => !(n.author_user_id && n.author_user_id === user.id)
      && new Date(n.created_date).getTime() > seenTs;
    const unseenCount = notes.filter(isUnseen).length;
    const latestTs = notes.length > 0 ? notes[0].created_date : null;

    if (markSeen) {
      await base44.auth.updateMe({ activity_seen_ts: new Date().toISOString() });
    }

    if (countOnly) {
      return Response.json({ unseen_count: unseenCount, latest_ts: latestTs });
    }

    // Resolve target player names: every member of the caller's groups, past the first page
    const allMembers = await fetchAll(base44.asServiceRole.entities.GroupMember, { group_id: { $in: activeGroupIds } });
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
      // The caller wrote it (signed notes only: an anonymous note stores no author). The
      // author's user id itself never leaves the server.
      is_mine: !n.is_anonymous && !!n.author_user_id && n.author_user_id === user.id,
      note: n.note,
      game_name: n.game_name || null,
      game_date: n.game_date || null,
      created_date: n.created_date,
      is_unseen: isUnseen(n)
    }));

    return Response.json({ notes: enriched, unseen_count: unseenCount, latest_ts: latestTs });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
