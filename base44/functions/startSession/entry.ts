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

// The session name and the place: nothing, null or blank -> '' (not given); a text ->
// that text without surrounding spaces; longer than MAX_TEXT characters, or not a text at
// all -> null, which the caller refuses.
const MAX_TEXT = 60;
function parseText(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length <= MAX_TEXT ? text : null;
}

// The session date: nothing, null or blank -> '' (not given, the caller falls back to
// today). Otherwise it must be YYYY-MM-DD, a day that exists (not 2026-02-30), from
// MIN_DATE to MAX_DATE -> that string. Anything else -> null, which the caller refuses.
const MIN_DATE = '2000-01-01';
const MAX_DATE = '2100-12-31';
function parseSessionDate(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (text === '') return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return null;
  const day = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  // A day that does not exist rolls over (Feb 30 -> Mar 2) and no longer reads the same.
  if (day.toISOString().slice(0, 10) !== text) return null;
  return text >= MIN_DATE && text <= MAX_DATE ? text : null;
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
    // A session cannot be edited afterwards, so what goes in is checked here as well as
    // in the form: short texts, and a date that exists.
    const sessionName = parseText(name);
    if (sessionName === null) {
      return Response.json({ error: `The session name can be at most ${MAX_TEXT} characters` }, { status: 400 });
    }
    const sessionLocation = parseText(location);
    if (sessionLocation === null) {
      return Response.json({ error: `The place can be at most ${MAX_TEXT} characters` }, { status: 400 });
    }
    const sessionDate = parseSessionDate(session_date);
    if (sessionDate === null) {
      return Response.json({ error: `The date must be a real date between ${MIN_DATE} and ${MAX_DATE}, as YYYY-MM-DD` }, { status: 400 });
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
      name: sessionName || 'Whist Night',
      status: 'open',
      // No date sent: today's date in UTC — the server does not know the scorer's time
      // zone, so late in the evening west of UTC or just after midnight east of it this
      // is not the local day. The form always sends the local date.
      session_date: sessionDate || new Date().toISOString().slice(0, 10),
      location: sessionLocation,
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
