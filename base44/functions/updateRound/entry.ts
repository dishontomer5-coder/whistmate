import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Group-admin edit of an existing round to fix mistakes: re-accept the four bids,
// tricks, reneges (+ advanced suit/hierarchy), re-validate, re-score, and persist.
// Requires the caller to be a group admin of the round's group (or app admin).
//
// === Scoring MIRRORS src/lib/scoring.js — keep in sync (Deno can't import src/). ===
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

    const { game_id, bids, tricks, reneges, trump_suit, hierarchy } = await req.json();
    if (!game_id || !bids || !tricks) {
      return Response.json({ error: 'game_id, bids and tricks are required' }, { status: 400 });
    }
    const renegeMap = reneges && typeof reneges === 'object' ? reneges : {};

    const round = await base44.asServiceRole.entities.Game.get(game_id);
    if (!round) return Response.json({ error: 'Round not found' }, { status: 404 });

    // Group-admin (or app-admin) only — this rewrites history.
    if (user.role !== 'admin') {
      const rows = await base44.asServiceRole.entities.GroupMember.filter({ user_id: user.id });
      const mine = rows.filter((m) => m.group_id === round.group_id);
      const isGroupAdmin = mine.some((m) => m.role === 'admin')
        || (user.groups || []).some((g) => g.group_id === round.group_id && g.role === 'admin');
      if (!isGroupAdmin) {
        return Response.json({ error: 'Only a group admin can edit a past round' }, { status: 403 });
      }
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
    let hbIdx = 0;
    for (let i = 1; i < bidVals.length; i++) if (bidVals[i] > bidVals[hbIdx]) hbIdx = i;

    const session = await base44.asServiceRole.entities.Session.get(round.session_id);
    const scoringMethod = session && session.scoring_method === 'progressive' ? 'progressive' : 'classic';

    let trump = null;
    let hier = null;
    if (session && session.advanced_rules_enabled) {
      if (!SUITS.includes(trump_suit) || !HIERARCHIES.includes(hierarchy)) {
        return Response.json({ error: 'Advanced rules on: trump_suit and hierarchy are required and must be valid' }, { status: 400 });
      }
      trump = trump_suit;
      hier = hierarchy;
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
      highest_bidder_player_id: results[hbIdx].player_id,
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
