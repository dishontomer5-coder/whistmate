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

// Group-admin edit of an existing round to fix mistakes: re-accept the four bids,
// tricks, reneges (+ advanced suit/hierarchy), re-validate, re-score, and persist.
// Requires the caller to be a group admin of the round's group (or app admin).
//
// === Scoring MIRRORS src/lib/scoring.js — keep in sync (Deno can't import src/). ===
const ROUND_CHANGED = 'This round was changed on another phone — reload to see it';
const SUITS = ['spades', 'hearts', 'diamonds', 'clubs', 'notrump'];
const HIERARCHIES = ['standard', 'down_up'];
function progressiveRate(m: number): number {
  if (m <= 0) return 0;
  if (m <= 4) return 5;
  if (m === 5) return 10;
  if (m === 6) return 15;
  return 20;
}
function contractPoints(bid: number, tricksWon: number, tableStateValue: string, scoringMethod: string): number {
  if (bid === 0) {
    if (tricksWon === 0) return tableStateValue === 'down' ? 50 : 25;
    return -50 + 10 * (tricksWon - 1);
  }
  if (tricksWon === bid) return bid * bid + 10;
  const miss = Math.abs(tricksWon - bid);
  if (scoringMethod === 'progressive') return -progressiveRate(miss) * miss;
  return -10 * miss;
}
// === end mirror ===

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { game_id, bids, tricks, reneges, trump_suit, hierarchy, trump_owner_player_id, expected_updated_date } = await req.json();
    if (!game_id || !bids || !tricks) {
      return Response.json({ error: 'game_id, bids and tricks are required' }, { status: 400 });
    }
    const renegeMap = reneges && typeof reneges === 'object' ? reneges : {};

    const round = await base44.asServiceRole.entities.Game.get(game_id).catch(() => null);
    if (!round) return Response.json({ error: 'Round not found' }, { status: 404 });

    // Group-admin (or app-admin) only — this rewrites history.
    if (user.role !== 'admin') {
      const rows = await base44.asServiceRole.entities.GroupMember.filter({ user_id: user.id });
      const mine = rows.filter((m) => m.group_id === round.group_id);
      let isGroupAdmin = mine.some((m) => m.role === 'admin');
      if (!isGroupAdmin) {
        // Lag fallback: the caller's own row, re-read by id — its role decides, not the cache's.
        const hinted = await hintedMemberRow(base44, user, round.group_id);
        isGroupAdmin = !!hinted && hinted.role === 'admin';
      }
      if (!isGroupAdmin) {
        return Response.json({ error: 'Only a group admin can edit a past round' }, { status: 403 });
      }
    }

    const readOnly = await readOnlyGroup(base44, round.group_id);
    if (readOnly) return readOnly;

    // No silent overwrite: the editor sends the updated_date of the round it loaded. If the
    // round was saved since (another admin, another phone), nothing is written and the
    // editor reloads. Optional, so a client that sends nothing keeps working as before.
    if (expected_updated_date != null && String(expected_updated_date) !== String(round.updated_date)) {
      return Response.json({ error: ROUND_CHANGED, code: 'round_changed' }, { status: 409 });
    }

    const results = (await base44.asServiceRole.entities.RoundResult.filter({ game_id }))
      .sort((a, b) => (a.bid_order ?? 0) - (b.bid_order ?? 0));
    if (results.length !== 4) {
      return Response.json({ error: `Expected 4 players in the round, found ${results.length}` }, { status: 400 });
    }

    // Validate bids (each 0-13, sum != 13).
    const bidVals = results.map((r) => Number(bids[r.player_id]));
    if (bidVals.some((b) => !Number.isInteger(b) || b < 0 || b > 13)) {
      return Response.json({ error: 'Every bid must be an integer from 0 to 13' }, { status: 400 });
    }
    const bidTotal = bidVals.reduce((s, b) => s + b, 0);
    if (bidTotal === 13) {
      return Response.json({ error: 'The four bids may not sum to exactly 13' }, { status: 400 });
    }
    // Validate tricks (each 0-13, sum == 13).
    const trickVals = results.map((r) => Number(tricks[r.player_id]));
    if (trickVals.some((t) => !Number.isInteger(t) || t < 0 || t > 13)) {
      return Response.json({ error: 'Every tricks value must be an integer from 0 to 13' }, { status: 400 });
    }
    if (trickVals.reduce((s, t) => s + t, 0) !== 13) {
      return Response.json({ error: 'The four players\' tricks must total exactly 13' }, { status: 400 });
    }

    const table_state = bidTotal >= 14 ? 'up' : 'down';
    // Fallback only — see submitBids: the auction winner can't be derived from final bids
    // (equal numbers are settled by suit rank at the table), so the client sends it.
    let hbIdx = 0;
    for (let i = 1; i < bidVals.length; i++) if (bidVals[i] > bidVals[hbIdx]) hbIdx = i;
    let highest_bidder_player_id = results[hbIdx].player_id;
    if (trump_owner_player_id != null) {
      if (!results.some((r) => r.player_id === trump_owner_player_id)) {
        return Response.json({ error: 'trump_owner_player_id must be one of the four players in the round' }, { status: 400 });
      }
      highest_bidder_player_id = trump_owner_player_id;
    }

    const session = await base44.asServiceRole.entities.Session.get(round.session_id);
    const scoringMethod = session && session.scoring_method === 'progressive' ? 'progressive' : 'classic';

    // Trump recorded for every session; hierarchy stays advanced-only. Mirrors submitBids.
    let trump = null;
    let hier = null;
    if (session && session.advanced_rules_enabled) {
      if (!SUITS.includes(trump_suit) || !HIERARCHIES.includes(hierarchy)) {
        return Response.json({ error: 'Advanced rules on: trump_suit and hierarchy are required and must be valid' }, { status: 400 });
      }
      trump = trump_suit;
      hier = hierarchy;
    } else if (trump_suit != null) {
      if (!SUITS.includes(trump_suit)) {
        return Response.json({ error: `trump_suit must be one of: ${SUITS.join(', ')}` }, { status: 400 });
      }
      trump = trump_suit;
    }

    const pre = results.map((r, i) => ({
      r,
      reneged: !!renegeMap[r.player_id],
      made: trickVals[i] === bidVals[i],
      contract: contractPoints(bidVals[i], trickVals[i], table_state, scoringMethod),
      bid: bidVals[i],
      tricksWon: trickVals[i],
    }));
    const everyoneFalls = pre.every((p) => !p.made);

    await Promise.all(pre.map((p) => {
      const base = everyoneFalls ? 0 : p.contract;
      const points = base + (p.reneged ? -100 : 0);
      return base44.asServiceRole.entities.RoundResult.update(p.r.id, {
        bid: p.bid,
        tricks_won: p.tricksWon,
        reneged: p.reneged,
        points,
      });
    }));

    const updated = await base44.asServiceRole.entities.Game.update(game_id, {
      total_bids: bidTotal,
      table_state,
      highest_bidder_player_id,
      trump_suit: trump,
      hierarchy: hier,
      everyone_falls: everyoneFalls,
      status: everyoneFalls ? 'cancelled' : 'complete',
    });

    return Response.json({ round: updated, everyone_falls: everyoneFalls });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
