import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Lock the four contracts for a round. Enforces the Israeli Whist bid rule
// (each 0-13, sum != 13), derives table_state (up/down) + highest bidder, and —
// under advanced rules — records the highest bidder's trump suit + hierarchy.
// Moves the round bidding -> playing.
const SUITS = ['spades', 'hearts', 'diamonds', 'clubs', 'notrump'];
const HIERARCHIES = ['standard', 'down_up'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { game_id, bids, trump_suit, hierarchy, trump_owner_player_id } = await req.json();
    if (!game_id || !bids || typeof bids !== 'object') {
      return Response.json({ error: 'game_id and bids (map of player_id -> bid) are required' }, { status: 400 });
    }

    const round = await base44.asServiceRole.entities.Game.get(game_id);
    if (!round) return Response.json({ error: 'Round not found' }, { status: 404 });
    if (round.status !== 'bidding') {
      return Response.json({ error: 'Bids are already locked for this round' }, { status: 409 });
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

    // Resolve + validate each bid.
    const bidVals = results.map((r) => Number(bids[r.player_id]));
    for (const b of bidVals) {
      if (!Number.isInteger(b) || b < 0 || b > 13) {
        return Response.json({ error: 'Every bid must be an integer from 0 to 13' }, { status: 400 });
      }
    }
    const sum = bidVals.reduce((s, b) => s + b, 0);
    if (sum === 13) {
      return Response.json({ error: 'The four bids may not sum to exactly 13' }, { status: 400 });
    }
    const table_state = sum >= 14 ? 'up' : 'down';

    // Top bidder by number alone. This is only a FALLBACK/default: at a live table equal
    // numbers are settled by suit rank (clubs < diamonds < hearts < spades < notrump), and
    // the app only records final bids, so it cannot derive who actually won the auction.
    // The client sends the outcome as trump_owner_player_id.
    let hbIdx = 0;
    for (let i = 1; i < bidVals.length; i++) if (bidVals[i] > bidVals[hbIdx]) hbIdx = i;
    let highest_bidder_player_id = results[hbIdx].player_id;
    if (trump_owner_player_id != null) {
      if (!results.some((r) => r.player_id === trump_owner_player_id)) {
        return Response.json({ error: 'trump_owner_player_id must be one of the four players in the round' }, { status: 400 });
      }
      highest_bidder_player_id = trump_owner_player_id;
    }

    // Trump suit is recorded for EVERY session (the group wanted per-round trump history).
    // Hierarchy stays an advanced-rules concept, and advanced sessions still require both.
    const session = await base44.asServiceRole.entities.Session.get(round.session_id);
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

    await Promise.all(results.map((r, i) =>
      base44.asServiceRole.entities.RoundResult.update(r.id, { bid: bidVals[i] })));

    const updated = await base44.asServiceRole.entities.Game.update(game_id, {
      total_bids: sum,
      table_state,
      highest_bidder_player_id,
      trump_suit: trump,
      hierarchy: hier,
      status: 'playing',
    });

    return Response.json({ round: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
