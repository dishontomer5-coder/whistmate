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

// Scouting-note delete/moderation (P9-7). Allowed for: the note's author (only
// non-anonymous notes carry an author id), any admin of the note's group, or a
// platform admin. TableTalkNote delete RLS is platform-admin only; deletes flow
// through here.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { note_id } = await req.json();
    if (!note_id) return Response.json({ error: 'note_id is required' }, { status: 400 });

    const note = await base44.asServiceRole.entities.TableTalkNote.get(note_id).catch(() => null);
    if (!note) return Response.json({ error: 'Note not found' }, { status: 404 });

    const isPlatformAdmin = user.role === 'admin';
    const isAuthor = !!note.author_user_id && note.author_user_id === user.id;

    let isGroupAdmin = false;
    if (!isPlatformAdmin && !isAuthor && note.group_id) {
      const myMembershipRows = await base44.asServiceRole.entities.GroupMember.filter({ user_id: user.id });
      let myMembership = myMembershipRows.filter(m => m.group_id === note.group_id);
      if (myMembership.length === 0) {
        const hinted = await hintedMemberRow(base44, user, note.group_id);
        if (hinted) myMembership = [hinted];
      }
      isGroupAdmin = myMembership.length > 0 && myMembership[0].role === 'admin';
    }

    if (!isPlatformAdmin && !isAuthor && !isGroupAdmin) {
      return Response.json({ error: 'You can only delete your own notes, or notes in a group you admin' }, { status: 403 });
    }

    // In a group that is not active the notes stay as they are — except for a platform
    // admin, who can still moderate.
    if (!isPlatformAdmin) {
      const readOnly = await readOnlyGroup(base44, note.group_id);
      if (readOnly) return readOnly;
    }

    await base44.asServiceRole.entities.TableTalkNote.delete(note_id);
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
