import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// The membership cache on the user record (user.groups) is a hint, never proof (P12-9):
// a user can write their own record. It only rides out read-after-write lag (P7-9) — the
// GroupMember row it points at is re-read by id and counts only if it really belongs to
// the caller and to this group. Role and player_name come from that row, never the cache.
// At most MAX_HINTS different rows are re-read, so a stuffed cache buys no extra reads.
const MAX_HINTS = 5;
async function hintedMemberRow(base44, user, groupId) {
  if (!groupId) return null;
  const tried = new Set();
  for (const hint of (Array.isArray(user.groups) ? user.groups : [])) {
    if (!hint || hint.group_id !== groupId || !hint.member_id || tried.has(hint.member_id)) continue;
    if (tried.size >= MAX_HINTS) break;
    tried.add(hint.member_id);
    const row = await base44.asServiceRole.entities.GroupMember.get(hint.member_id).catch(() => null);
    if (row && row.user_id === user.id && row.group_id === groupId) return row;
  }
  return null;
}

// A group that is not active is read-only: archived -> 403, deleted or gone -> 404.
// Resolves to the response to send back, or to null when the group can be written to.
async function readOnlyGroup(base44, groupId) {
  if (!groupId) return null; // a record that belongs to no group has no status to honour
  const group = await base44.asServiceRole.entities.Group.get(groupId).catch(() => null);
  if (!group || group.status === 'deleted') return Response.json({ error: 'Group not found' }, { status: 404 });
  if ((group.status || 'active') !== 'active') {
    return Response.json({ error: 'This group is archived — it is read-only' }, { status: 403 });
  }
  return null;
}

// Close (end) a whist session. Blocks while a round is still mid-play so we never
// orphan an open round. Idempotent: closing an already-closed session is a no-op OK.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { session_id } = await req.json();
    if (!session_id) return Response.json({ error: 'session_id is required' }, { status: 400 });

    const session = await base44.asServiceRole.entities.Session.get(session_id).catch(() => null);
    if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });

    if (user.role !== 'admin') {
      if (!session.group_id) {
        return Response.json({ error: 'Only app admins can close sessions without a group' }, { status: 403 });
      }
      const rows = await base44.asServiceRole.entities.GroupMember.filter({ user_id: user.id });
      let mine = rows.filter((m) => m.group_id === session.group_id);
      if (mine.length === 0) {
        const hinted = await hintedMemberRow(base44, user, session.group_id);
        if (hinted) mine = [hinted];
      }
      if (mine.length === 0) {
        return Response.json({ error: 'You are not a member of this group' }, { status: 403 });
      }
    }

    const readOnly = await readOnlyGroup(base44, session.group_id);
    if (readOnly) return readOnly;

    if (session.status === 'closed') {
      return Response.json({ session });
    }

    // Refuse to close with a round still in bidding/playing.
    const rounds = await base44.asServiceRole.entities.Game.filter({ session_id }, '-created_date', 200);
    const openRound = rounds.find((r) => r.status === 'bidding' || r.status === 'playing');
    if (openRound) {
      return Response.json({ error: 'Finish or cancel the current round before closing the session', open_round_id: openRound.id }, { status: 409 });
    }

    const updated = await base44.asServiceRole.entities.Session.update(session_id, { status: 'closed' });
    return Response.json({ session: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
