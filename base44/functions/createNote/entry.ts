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

    const { group_id, target_player_id, note, is_anonymous, session_id } = await req.json();

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

    // A note can be pinned to a whist night. The entity's game_* fields are inherited from
    // the poker app, where a "game" was a whole night — today's Session — so the link is
    // to a Session (P12-4; a whist Game is a single round with no name or date). Validated
    // + enriched server-side (never trust client fields).
    let gameFields = { game_id: null, game_name: null, game_date: null };
    if (session_id) {
      const session = await base44.asServiceRole.entities.Session.get(session_id).catch(() => null);
      if (session && session.group_id === group_id) {
        gameFields = {
          game_id: session.id,
          game_name: session.name || 'Whist Night',
          game_date: session.session_date || String(session.created_date || '').slice(0, 10) || null,
        };
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
