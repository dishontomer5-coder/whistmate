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

const MAX_NOTE_LEN = 500;

// A note is posted once (qa-tester-2): the same note sent again within this window — a
// double tap, a retry — gives back the first one instead of a second copy.
const DUPLICATE_WINDOW_MS = 10_000;
const when = (row) => new Date(row.created_date || 0).getTime() || 0;
const earlier = (a, b) => when(a) - when(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// The first copy of `mine`: the earliest note about the same player in the same group with
// the same text, posted the same way, no more than DUPLICATE_WINDOW_MS before it. "The same
// way" is the same author for a signed note; an anonymous note stores no author, so any
// identical anonymous note counts — the two cannot be told apart anyway. The window is
// measured between the stored created_dates, so the server's clock does not matter.
async function firstCopy(base44, mine) {
  // Newest first; a window of ten seconds holds far fewer notes about one player than a page.
  const recent = await base44.asServiceRole.entities.TableTalkNote.filter(
    { group_id: mine.group_id, target_player_id: mine.target_player_id }, '-created_date', 50,
  );
  const copies = recent.filter((n) => (
    n.note === mine.note
    && !!n.is_anonymous === !!mine.is_anonymous
    && (mine.is_anonymous || n.author_user_id === mine.author_user_id)
    && earlier(n, mine) <= 0
    && when(mine) - when(n) <= DUPLICATE_WINDOW_MS
  ));
  return copies.sort(earlier)[0] || mine;
}

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

    // Membership (resilient P7-9 pattern) — also yields the author's display name,
    // which therefore always comes from the caller's own member row
    const myMembershipRows = await base44.asServiceRole.entities.GroupMember.filter({ user_id: user.id });
    let myMembership = myMembershipRows.filter(m => m.group_id === group_id);
    if (myMembership.length === 0) {
      const hinted = await hintedMemberRow(base44, user, group_id);
      if (hinted) myMembership = [hinted];
    }
    if (user.role !== 'admin' && myMembership.length === 0) {
      return Response.json({ error: 'You are not a member of this group' }, { status: 403 });
    }

    // Only then the group itself, so a non-member learns nothing about it
    const readOnly = await readOnlyGroup(base44, group_id);
    if (readOnly) return readOnly;

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
          game_name: session.name || null, // an unnamed session is shown by its date (noteSessionName)
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

    // Two requests can arrive together, so the check runs after the write: each request
    // looks for an earlier copy, and every copy but the first removes itself. Both
    // requests then answer with the same, first note.
    const first = await firstCopy(base44, created);
    if (first.id !== created.id) {
      await base44.asServiceRole.entities.TableTalkNote.delete(created.id).catch(() => null);
      return Response.json({ note: first });
    }
    return Response.json({ note: created });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
