import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Enter the actual tricks (+ reneges) for a round, score it, and persist points.
// Requires bids to be locked (round in 'playing'). The four tricks must total 13.
// Everyone-falls -> round 'cancelled' (excluded from game_limit) but points still
// persist (0, or -100 for a renege). Otherwise -> 'complete'.
//
// === Scoring MIRRORS src/lib/scoring.js — keep in sync (Deno can't import src/). ===
function progressiveRate(m: number): number {
  if (m <= 0) return 0;
  if (m <= 4) return 5;
  if (m === 5) return 10;
  if (m === 6) return 15;
  return 20; // 7..13
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

    const { game_id, tricks, reneges } = await req.json();
    if (!game_id || !tricks || typeof tricks !== 'object') {
      return Response.json({ error: 'game_id and tricks (map of player_id -> tricks_won) are required' }, { status: 400 });
    }
    const renegeMap = reneges && typeof reneges === 'object' ? reneges : {};

    const round = await base44.asServiceRole.entities.Game.get(game_id);
    if (!round) return Response.json({ error: 'Round not found' }, { status: 404 });
    if (round.status === 'bidding') {
      return Response.json({ error: 'Submit the bids before entering results' }, { status: 409 });
    }
    if (round.status !== 'playing') {
      return Response.json({ error: 'This round has already been scored' }, { status: 409 });
    }

    if (user.role !== 'admin') {
      const rows = await base44.asServiceRole.entities.GroupMember.filter({ user_id: user.id });
      let mine = rows.filter((m) => m.group_id === round.group_id);
      if (mine.length === 0 && (user.groups || []).some((g) => g.group_id === round.group_id)) mine = [1];
      if (mine.length === 0) {
        return Response.json({ error: 'You are not a member of this group' }, { status: 403 });
      }
    }

    const results = (await base44.asServiceRole.entities.RoundResult.filter({ game_id }))
      .sort((a, b) => (a.bid_order ?? 0) - (b.bid_order ?? 0));
    if (results.length !== 4) {
      return Response.json({ error: `Expected 4 players in the round, found ${results.length}` }, { status: 400 });
    }
    if (results.some((r) => r.bid == null)) {
      return Response.json({ error: 'Round is missing locked bids — submit bids first' }, { status: 409 });
    }

    // Validate tricks: each 0-13, sum exactly 13.
    const trickVals = results.map((r) => Number(tricks[r.player_id]));
    for (const t of trickVals) {
      if (!Number.isInteger(t) || t < 0 || t > 13) {
        return Response.json({ error: 'Every tricks value must be an integer from 0 to 13' }, { status: 400 });
      }
    }
    if (trickVals.reduce((s, t) => s + t, 0) !== 13) {
      return Response.json({ error: 'The four players\' tricks must total exactly 13' }, { status: 400 });
    }

    const session = await base44.asServiceRole.entities.Session.get(round.session_id);
    const scoringMethod = session && session.scoring_method === 'progressive' ? 'progressive' : 'classic';
    const tableStateValue = round.table_state || (round.total_bids >= 14 ? 'up' : 'down');

    // First pass: contract points + made-flags.
    const pre = results.map((r, i) => {
      const bid = Number(r.bid);
      const tricksWon = trickVals[i];
      return {
        r,
        bid,
        tricksWon,
        reneged: !!renegeMap[r.player_id],
        made: tricksWon === bid,
        contract: contractPoints(bid, tricksWon, tableStateValue, scoringMethod),
      };
    });
    const everyoneFalls = pre.every((p) => !p.made);

    // Persist per-player points (renege -100 is additive + independent of everyone-falls).
    await Promise.all(pre.map((p) => {
      const base = everyoneFalls ? 0 : p.contract;
      const points = base + (p.reneged ? -100 : 0);
      return base44.asServiceRole.entities.RoundResult.update(p.r.id, {
        tricks_won: p.tricksWon,
        reneged: p.reneged,
        points,
      });
    }));

    const updated = await base44.asServiceRole.entities.Game.update(game_id, {
      everyone_falls: everyoneFalls,
      status: everyoneFalls ? 'cancelled' : 'complete',
    });

    return Response.json({ round: updated, everyone_falls: everyoneFalls });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
