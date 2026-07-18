import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// App-admin utility: removes records that are invisible/unreachable in the UI —
// sessions/rounds with no group (and their RoundResults), and scouting notes
// whose target GroupMember no longer exists.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    if (user.role !== 'admin') {
      return Response.json({ error: 'App admin only' }, { status: 403 });
    }

    let sessionsDeleted = 0;
    let roundsDeleted = 0;
    let resultsDeleted = 0;
    let notesDeleted = 0;

    // 1. Orphaned rounds: group_id is null -> invisible on every group screen.
    const allRounds = await base44.asServiceRole.entities.Game.filter({}, '-created_date', 2000);
    const orphanRounds = allRounds.filter((g) => !g.group_id);
    for (const g of orphanRounds) {
      const rrs = await base44.asServiceRole.entities.RoundResult.filter({ game_id: g.id });
      await base44.asServiceRole.entities.RoundResult.deleteMany({ game_id: g.id });
      await base44.asServiceRole.entities.Game.delete(g.id);
      roundsDeleted += 1;
      resultsDeleted += rrs.length;
    }

    // 2. Orphaned sessions: group_id is null.
    const allSessions = await base44.asServiceRole.entities.Session.filter({}, '-created_date', 2000);
    const orphanSessions = allSessions.filter((s) => !s.group_id);
    for (const s of orphanSessions) {
      await base44.asServiceRole.entities.Session.delete(s.id);
      sessionsDeleted += 1;
    }

    // 3. Orphaned notes: target GroupMember no longer exists.
    const [allNotes, allMembers] = await Promise.all([
      base44.asServiceRole.entities.TableTalkNote.filter({}, '-created_date', 2000),
      base44.asServiceRole.entities.GroupMember.filter({}, '-created_date', 2000),
    ]);
    const memberIds = new Set(allMembers.map((m) => m.id));
    const orphanNotes = allNotes.filter((n) => n.target_player_id && !memberIds.has(n.target_player_id));
    for (const n of orphanNotes) {
      await base44.asServiceRole.entities.TableTalkNote.delete(n.id);
      notesDeleted += 1;
    }

    return Response.json({
      sessions_deleted: sessionsDeleted,
      rounds_deleted: roundsDeleted,
      results_deleted: resultsDeleted,
      notes_deleted: notesDeleted,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
