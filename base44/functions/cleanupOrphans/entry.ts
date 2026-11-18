import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const PAGE = 500; // the entity store hands out at most 500 rows per filter()
// EVERY row of an entity, or an error. This function deletes what it finds to be
// orphaned, so it must never decide from the first page alone: a note about a member
// who is merely not on that page is not an orphan. Cursor pagination as in getGroupData;
// the $lte cursor + seen-set copes with rows sharing a created_date.
async function fetchAll(entity, what) {
  const all = [];
  const seen = new Set();
  let cursor = null;
  for (let guard = 0; guard < 1000; guard++) {
    const page = await entity.filter(cursor ? { created_date: { $lte: cursor } } : {}, '-created_date', PAGE);
    const fresh = page.filter((r) => !seen.has(r.id));
    fresh.forEach((r) => { seen.add(r.id); all.push(r); });
    if (page.length < PAGE) return all; // a short page is the last one: everything has been read
    if (fresh.length === 0) break;      // a full page with nothing new: no telling what is left
    cursor = page[page.length - 1].created_date;
  }
  throw new Error(`Could not read every ${what} — nothing was deleted`);
}

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

    // Read everything first, completely; only then delete. If a read cannot be
    // completed, fetchAll throws and nothing has been touched.
    const db = base44.asServiceRole.entities;
    const [allRounds, allSessions, allNotes, allMembers] = await Promise.all([
      fetchAll(db.Game, 'round'),
      fetchAll(db.Session, 'session'),
      fetchAll(db.TableTalkNote, 'note'),
      fetchAll(db.GroupMember, 'member'),
    ]);

    let sessionsDeleted = 0;
    let roundsDeleted = 0;
    let resultsDeleted = 0;
    let notesDeleted = 0;

    // 1. Orphaned rounds: group_id is null -> invisible on every group screen.
    const orphanRounds = allRounds.filter((g) => !g.group_id);
    for (const g of orphanRounds) {
      const rrs = await db.RoundResult.filter({ game_id: g.id });
      await db.RoundResult.deleteMany({ game_id: g.id });
      await db.Game.delete(g.id);
      roundsDeleted += 1;
      resultsDeleted += rrs.length;
    }

    // 2. Orphaned sessions: group_id is null.
    const orphanSessions = allSessions.filter((s) => !s.group_id);
    for (const s of orphanSessions) {
      await db.Session.delete(s.id);
      sessionsDeleted += 1;
    }

    // 3. Orphaned notes: target GroupMember no longer exists.
    const memberIds = new Set(allMembers.map((m) => m.id));
    const orphanNotes = allNotes.filter((n) => n.target_player_id && !memberIds.has(n.target_player_id));
    for (const n of orphanNotes) {
      await db.TableTalkNote.delete(n.id);
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
