import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Close (end) a whist session. Blocks while a round is still mid-play so we never
// orphan an open round. Idempotent: closing an already-closed session is a no-op OK.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { session_id } = await req.json();
    if (!session_id) return Response.json({ error: 'session_id is required' }, { status: 400 });

    const session = await base44.asServiceRole.entities.Session.get(session_id);
    if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });

    if (user.role !== 'admin') {
      if (!session.group_id) {
        return Response.json({ error: 'Only app admins can close sessions without a group' }, { status: 403 });
      }
      const rows = await base44.asServiceRole.entities.GroupMember.filter({ user_id: user.id });
      let mine = rows.filter((m) => m.group_id === session.group_id);
      if (mine.length === 0 && (user.groups || []).some((g) => g.group_id === session.group_id)) mine = [1];
      if (mine.length === 0) {
        return Response.json({ error: 'You are not a member of this group' }, { status: 403 });
      }
    }

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
