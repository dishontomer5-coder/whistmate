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

// The optional cap on scored rounds in a session (startRound enforces it). Nothing, null
// or an empty string -> null, no limit. A whole number from 1 to 99, given as a number or
// as a numeric string -> that number. Anything else -> NaN, which the caller refuses.
function parseGameLimit(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const text = value.trim();
    if (text === '') return null;
    value = /^\d+$/.test(text) ? Number(text) : NaN;
  }
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 99 ? value : NaN;
}

// Start a new whist Session (a meetup/night) in a group. Session/Game/RoundResult
// create RLS is platform-admin only — sessions are created through this function,
// which enforces group membership + the group lifecycle and freezes the scoring
// rules from the group defaults. One open session per group at a time.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { group_id, name, session_date, location, scoring_method, advanced_rules_enabled, game_limit } = await req.json();
    if (!group_id) return Response.json({ error: 'group_id is required' }, { status: 400 });
    const gameLimit = parseGameLimit(game_limit);
    if (Number.isNaN(gameLimit)) {
      return Response.json({ error: 'game_limit must be a whole number between 1 and 99' }, { status: 400 });
    }

    // Any member of the group may start a session (app admins allowed for support).
    if (user.role !== 'admin') {
      const rows = await base44.asServiceRole.entities.GroupMember.filter({ user_id: user.id });
      // Resilient membership lookup: user_id-only query, group matched in memory --
      // compound (group_id, user_id) reads can lag for freshly-claimed membership
      // rows. If the query is empty, the cache may point at the caller's own row.
      let mine = rows.filter((m) => m.group_id === group_id);
      if (mine.length === 0) {
        const hinted = await hintedMemberRow(base44, user, group_id);
        if (hinted) mine = [hinted];
      }
      if (mine.length === 0) {
        return Response.json({ error: 'You are not a member of this group' }, { status: 403 });
      }
    }

    // Only then the group itself, so a non-member learns nothing about it. A group that
    // is not active is read-only: archived -> 403, deleted or gone -> 404.
    const group = await base44.asServiceRole.entities.Group.get(group_id).catch(() => null);
    if (!group || group.status === 'deleted') return Response.json({ error: 'Group not found' }, { status: 404 });
    if ((group.status || 'active') !== 'active') {
      return Response.json({ error: 'This group is archived — it is read-only' }, { status: 403 });
    }

    // One open session per group. Query by group_id only + check status in memory:
    // the compound {group_id, status} index can read stale right after a write.
    const recent = await base44.asServiceRole.entities.Session.filter({ group_id }, '-created_date', 200);
    const open = recent.find((s) => s.status === 'open');
    if (open) {
      return Response.json({ error: 'A session is already open in this group', open_session_id: open.id }, { status: 409 });
    }

    const session = await base44.asServiceRole.entities.Session.create({
      group_id,
      name: (name || '').trim() || 'Whist Night',
      status: 'open',
      session_date: session_date || new Date().toISOString().slice(0, 10),
      location: (location || '').trim(),
      // Scoring rules are chosen per-session at creation (falling back to the
      // group defaults), then frozen for the whole night.
      advanced_rules_enabled: advanced_rules_enabled != null ? !!advanced_rules_enabled : !!group.advanced_rules_default,
      scoring_method: (scoring_method || group.scoring_method_default) === 'progressive' ? 'progressive' : 'classic',
      game_limit: gameLimit,
    });

    return Response.json({ session });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
