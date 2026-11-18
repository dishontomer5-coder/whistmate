import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Table-talk notes about one player (P12-1). TableTalkNote is not readable from the
// browser any more (entity read RLS = app admin only): the feed on a profile reads
// through here. Members of the player's group, and app admins, may read. The author's
// user id never leaves the server — the client gets `is_mine` instead, and anonymous
// notes carry no author at all (createNote stores none; this strips it again anyway).

const MAX_NOTES = 50;

// Same rule as getGroupData: only a real GroupMember row owned by the caller counts.
// The user-record cache (user.groups) is a hint for read-after-write lag (P7-9), and a
// hinted row is re-read by id because a user can write their own record. At most
// MAX_HINTS different rows are re-read, so a stuffed cache buys no extra reads.
const MAX_HINTS = 5;
async function membershipIn(base44, user, groupId) {
  const rows = await base44.asServiceRole.entities.GroupMember.filter({ user_id: user.id });
  const direct = rows.find((m) => m.group_id === groupId);
  if (direct) return direct;
  const tried = new Set();
  for (const hint of (user.groups || [])) {
    if (!hint || hint.group_id !== groupId || !hint.member_id || tried.has(hint.member_id)) continue;
    if (tried.size >= MAX_HINTS) break;
    tried.add(hint.member_id);
    const row = await base44.asServiceRole.entities.GroupMember.get(hint.member_id).catch(() => null);
    if (row && row.user_id === user.id && row.group_id === groupId) return row;
  }
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    if (!body.player_id) return Response.json({ error: 'player_id is required' }, { status: 400 });

    const db = base44.asServiceRole.entities;
    const target = await db.GroupMember.get(body.player_id).catch(() => null);
    if (!target) return Response.json({ error: 'Player not found' }, { status: 404 });

    const isAppAdmin = user.role === 'admin';
    if (!isAppAdmin && !(await membershipIn(base44, user, target.group_id))) {
      return Response.json({ error: 'You are not a member of this group' }, { status: 403 });
    }
    const group = await db.Group.get(target.group_id).catch(() => null);
    if (!group || (group.status === 'deleted' && !isAppAdmin)) {
      return Response.json({ error: 'Group not found' }, { status: 404 });
    }

    const rows = await db.TableTalkNote.filter({ target_player_id: target.id }, '-created_date', MAX_NOTES);
    const notes = rows
      .filter((n) => !n.group_id || n.group_id === target.group_id)
      .map((n) => ({
        id: n.id,
        group_id: n.group_id,
        target_player_id: n.target_player_id,
        note: n.note,
        is_anonymous: !!n.is_anonymous,
        author_name: n.is_anonymous ? null : (n.author_name || null),
        game_name: n.game_name || null,
        game_date: n.game_date || null,
        created_date: n.created_date,
        is_mine: !n.is_anonymous && !!n.author_user_id && n.author_user_id === user.id,
      }));

    return Response.json({ notes });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
