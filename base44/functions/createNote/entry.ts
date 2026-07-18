import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const MAX_NOTE_LEN = 500;

// Scouting-note create path (P9-7). TableTalkNote create RLS is platform-admin
// only; all notes flow through here. Author fields are derived SERVER-SIDE
// (never trusted from the client), and anonymous notes store NO author identity
// at all — so anonymity holds even against raw open reads, not just the UI.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { group_id, target_player_id, note, is_anonymous, game_id } = await req.json();

    if (!group_id || !target_player_id) {
      return Response.json({ error: 'group_id and target_player_id are required' }, { status: 400 });
    }
    const text = (note || '').trim();
    if (!text) return Response.json({ error: 'Note text is required' }, { status: 400 });
    if (text.length > MAX_NOTE_LEN) {
      return Response.json({ error: `Note is too long (max ${MAX_NOTE_LEN} characters)` }, { status: 400 });
    }

    const group = await base44.asServiceRole.entities.Group.get(group_id).catch(() => null);
    if (!group) return Response.json({ error: 'Group not found' }, { status: 404 });
    if ((group.status || 'active') !== 'active') {
      return Response.json({ error: 'This group is archived — notes are read-only' }, { status: 403 });
    }

    // Membership (resilient P7-9 pattern) — also yields the author's display name
    const myMembershipRows = await base44.asServiceRole.entities.GroupMember.filter({ user_id: user.id });
    let myMembership = myMembershipRows.filter(m => m.group_id === group_id);
    if (myMembership.length === 0) {
      const cached = (user.groups || []).find(g => g.group_id === group_id);
      if (cached) myMembership = [{ id: cached.member_id, group_id: cached.group_id, user_id: user.id, role: cached.role, player_name: cached.player_name }];
    }
    if (user.role !== 'admin' && myMembership.length === 0) {
      return Response.json({ error: 'You are not a member of this group' }, { status: 403 });
    }

    // Target must be a member of this group
    const target = await base44.asServiceRole.entities.GroupMember.get(target_player_id).catch(() => null);
    if (!target || target.group_id !== group_id) {
      return Response.json({ error: 'That player is not in this group' }, { status: 404 });
    }

    // Game link is validated + enriched server-side (never trust client fields)
    let gameFields = { game_id: null, game_name: null, game_date: null };
    if (game_id) {
      const game = await base44.asServiceRole.entities.Game.get(game_id).catch(() => null);
      if (game && game.group_id === group_id) {
        gameFields = { game_id: game.id, game_name: game.name || null, game_date: game.game_date || null };
      }
    }

    const anon = !!is_anonymous;
    const authorName = myMembership[0]?.player_name || user.full_name || user.email || 'Unknown';

    const created = await base44.asServiceRole.entities.TableTalkNote.create({
      // Anonymous → store no identity; non-anonymous → real author for own-delete
      author_user_id: anon ? null : user.id,
      author_name: anon ? null : authorName,
      target_player_id,
      note: text,
      is_anonymous: anon,
      group_id,
      ...gameFields
    });

    return Response.json({ note: created });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
