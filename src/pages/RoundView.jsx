import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Loader2, Pencil, Trash2, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import TableBadge from '@/components/TableBadge';
import { Name } from '@/components/UserText';
import { useConfirm } from '@/components/ConfirmDialog';
import { ScoringHelp, ScoringHelpButton } from '@/components/ScoringHelp';
import BackLink from '@/components/BackLink';
import ArchivedBanner from '@/components/ArchivedBanner';
import { usePageGroup } from '@/lib/ActiveGroupContext';
import { tableState, highestBidderIndex } from '@/lib/scoring';
import { errorMessage } from '@/lib/format';
import { readDraft, writeDraft, clearDraft, pruneDrafts, applyDraft, describeRestored } from '@/lib/round-drafts';
import { cn } from '@/lib/utils';
import ActionDock, { DockStatus } from '@/components/round/ActionDock';
import BidRows from '@/components/round/BidRows';
import BidKeys from '@/components/round/BidKeys';
import TrickRows, { TrickKeys } from '@/components/round/TrickRows';
import { PhaseBanner, RestoredNote } from '@/components/round/RoundChrome';
import { EveryoneFellBadge, ResultLines, TrumpLine } from '@/components/round/RoundCard';
import { returnToSession } from '@/components/round/session-return';
import { nextEmptyIndex, blockedBid, lockBlocker, saveBlocker, previewRound } from '@/components/round/round-logic';

// One round, from its first bid to its saved result. What is on screen follows the
// round's status on the server:
//
//   bidding              the bids (step 1 of 2)        → "Lock bids"
//   playing              the tricks (step 2 of 2)      → "Save round"
//   playing + Edit bids  the locked bids again         → "Save bids" / "Cancel"
//   complete / cancelled the scored round, read-only; a group admin can open the editor
//                        (`?edit=1`), which is the same rows and the same tap pad.
//
// The entry screens keep the primary action in a dock fixed to the bottom of the screen
// (ActionDock), with the number pad right above it. Nothing typed is lost: bids, the
// trump mark, tricks and reneges are written to the browser as they change
// (lib/round-drafts.js) and put back when the scorer returns.

const EVERYONE_FALLS_LINE = 'Nobody made their contract — everyone falls, all contract points are 0';

// The entry screens are laid out to need no scrolling on a 375x667 phone: tight spacing
// there, more air where the screen is taller.
const ENTRY_LAYOUT = '-mt-5 space-y-1 [@media(min-height:760px)]:-mt-2 [@media(min-height:760px)]:space-y-3';

// What the server holds for a round, in the shape the entry state uses.
function serverEntry(round, results) {
  const bids = {};
  const tricks = {};
  const reneges = {};
  results.forEach((r) => {
    bids[r.player_id] = r.bid ?? null;
    tricks[r.player_id] = r.tricks_won ?? null;
    reneges[r.player_id] = !!r.reneged;
  });
  return {
    bids, tricks, reneges,
    trump: round.trump_suit || null,
    hierarchy: round.hierarchy || null,
    // The stored winner is a real choice only once a suit exists — without one it is
    // just the highest number, and showing it as chosen would be a lie.
    trumpOwner: round.trump_suit ? (round.highest_bidder_player_id || null) : null,
  };
}

export default function RoundView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [round, setRound] = useState(null);
  const [session, setSession] = useState(null);
  const [results, setResults] = useState([]); // the four RoundResult rows, in bidding order

  // What is being entered. Keyed by player_id.
  const [bids, setBids] = useState({});
  const [trump, setTrump] = useState(null);
  const [trumpOwner, setTrumpOwner] = useState(null); // the player marked as trump winner
  const [hierarchy, setHierarchy] = useState(null);
  const [tricks, setTricks] = useState({});
  const [reneges, setReneges] = useState({});

  // Where the pad is: a player's bid or the trump keys; and which player's tricks.
  const [bidFocus, setBidFocus] = useState({ field: 'bid', index: 0 });
  const [trickIndex, setTrickIndex] = useState(0);
  const [editBids, setEditBids] = useState(false); // the locked bids are open again
  const [editTab, setEditTab] = useState('tricks'); // the editor of a scored round: 'bids' | 'tricks'
  const [restoredNote, setRestoredNote] = useState('');
  // The round id whose saved draft has been read back. Until then nothing is written,
  // so the first render cannot overwrite a draft with an empty screen.
  const [hydratedFor, setHydratedFor] = useState(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [help, setHelp] = useState(null); // the section of "How scoring works" that is open
  const [confirm, confirmElement] = useConfirm();

  // The caller's standing in the group this round belongs to — not in whichever group was
  // open before. An archived group is read-only.
  const { isAdmin, isArchived: archived, role } = usePageGroup(round?.group_id);

  const applyEntry = (entry) => {
    setBids(entry.bids); setTricks(entry.tricks); setReneges(entry.reneges);
    setTrump(entry.trump); setTrumpOwner(entry.trumpOwner); setHierarchy(entry.hierarchy);
  };

  const load = useCallback(async () => {
    setLoading(true); setLoadError(''); setNotFound(false); setHydratedFor(null);
    try {
      // Membership-checked read — the round, its session and its four results.
      const res = await base44.functions.invoke('getGroupData', { scope: 'round', round_id: id });
      const { round: rnd, session: sess, results: rr = [] } = res.data;
      const sorted = [...rr].sort((a, b) => (a.bid_order ?? 0) - (b.bid_order ?? 0));
      const ids = sorted.map((r) => r.player_id);
      const server = serverEntry(rnd, sorted);

      // Lay what was typed here earlier over what the server holds (unscored rounds only).
      pruneDrafts();
      const restored = applyDraft(readDraft(id), { status: rnd.status, stamp: rnd.created_date, playerIds: ids, server });
      const entry = restored || server;

      setRound(rnd); setSession(sess); setResults(sorted);
      applyEntry(entry);
      setEditBids(!!restored?.editingBids);
      setRestoredNote(describeRestored(restored?.restored));

      // Put the cursors on the first thing still missing.
      const firstBid = nextEmptyIndex(ids.map((pid) => entry.bids[pid] ?? null), -1);
      const needsTrump = !!sess?.advanced_rules_enabled && (!entry.trump || !entry.hierarchy);
      setBidFocus({ field: rnd.status === 'bidding' && firstBid < 0 && needsTrump ? 'trump' : 'bid', index: Math.max(firstBid, 0) });
      setTrickIndex(Math.max(nextEmptyIndex(ids.map((pid) => entry.tricks[pid] ?? null), -1), 0));
      setEditTab('tricks');
      setError('');
      setHydratedFor(id);
    } catch (err) {
      setNotFound(err.response?.status === 404);
      setLoadError(errorMessage(err, 'Failed to load round.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Keep what is typed, as it is typed. Only what the server does not have yet is kept:
  // the bids until they are locked (and again while they are being re-edited), the tricks
  // and reneges until the round is saved. An entry with nothing in it is removed.
  const status = round?.status;
  const stamp = round?.created_date; // ties a draft to this very round
  useEffect(() => {
    if (hydratedFor !== id || !status || archived) return;
    if (status === 'bidding') {
      writeDraft(id, { stamp, bids, trump, trumpOwner, hierarchy });
    } else if (status === 'playing') {
      writeDraft(id, { stamp, tricks, reneges, ...(editBids ? { editingBids: true, bids, trump, trumpOwner, hierarchy } : {}) });
    } else {
      clearDraft(id);
    }
  }, [hydratedFor, id, status, stamp, archived, bids, trump, trumpOwner, hierarchy, tricks, reneges, editBids]);

  if (loading) return <LoadingSpinner showLogo />;
  if (!round) {
    // A missing round cannot be fixed by trying again — offer the way back instead.
    return notFound || !loadError ? (
      <EmptyState as="h1" icon={SearchX} title="Round not found" description="It was deleted, or the link is wrong."
        action={<Button variant="outline" onClick={() => navigate('/history')}>Back to sessions</Button>} />
    ) : (
      <ErrorState title="Couldn't load this round" message={loadError} onRetry={load} />
    );
  }

  // ---- what is on screen, in bidding order -------------------------------------------
  const players = results;
  const ids = players.map((p) => p.player_id);
  const bidVals = ids.map((pid) => bids[pid] ?? null);
  const trickVals = ids.map((pid) => tricks[pid] ?? null);
  const renegeVals = ids.map((pid) => !!reneges[pid]);
  const advanced = !!session?.advanced_rules_enabled;
  const allBidsSet = bidVals.every((v) => v != null);
  const bidTotal = bidVals.reduce((s, v) => s + (v || 0), 0);
  const trickTotal = trickVals.reduce((s, v) => s + (v || 0), 0);
  const liveTable = allBidsSet ? tableState(bidVals.map(Number)) : null;
  // The top bidder by number is only a DEFAULT for the trump mark, never the answer (see
  // scoring.js). Advanced sessions must record a trump, so the top bidder is pre-marked
  // there; elsewhere nothing is marked until someone taps a mark.
  const topBidder = allBidsSet ? highestBidderIndex(bidVals.map((v) => ({ bid: Number(v) }))) : -1;
  const trumpOwnerId = trumpOwner ?? (advanced && topBidder >= 0 ? ids[topBidder] : null);
  const trumpOwnerName = players.find((p) => p.player_id === trumpOwnerId)?.player_name || '';
  // The trump keys show only while somebody is marked; otherwise the pad is on a row.
  const focus = bidFocus.field === 'trump' && trumpOwnerId
    ? bidFocus
    : { field: 'bid', index: Math.min(Math.max(bidFocus.index, 0), Math.max(players.length - 1, 0)) };

  const scored = status === 'complete' || status === 'cancelled';
  const canChangeScored = isAdmin && !archived;
  const view = archived && !scored ? 'readonly'
    : status === 'bidding' ? 'bidding'
    : status === 'playing' ? (editBids ? 'editBids' : 'results')
    : searchParams.get('edit') === '1' && canChangeScored ? 'edit'
    : 'summary';

  const bidBlocker = lockBlocker({ bids: bidVals, advanced, trump, trumpOwnerId, hierarchy });
  const trickBlocker = saveBlocker({ tricks: trickVals });
  // What each row will score, from the same engine the server uses.
  const preview = previewRound({ bids: bidVals, tricks: trickVals, reneges: renegeVals, scoringMethod: session?.scoring_method });

  const goToSession = (top = false) => returnToSession({ navigate, location, sessionId: round.session_id, top });

  // ---- entering bids and the trump record --------------------------------------------
  const pickBid = (n) => {
    const idx = focus.index;
    const nextVals = bidVals.map((v, i) => (i === idx ? n : v));
    setBids((prev) => ({ ...prev, [ids[idx]]: n }));
    setRestoredNote('');
    // On to the next player round the table who has no bid yet — from whichever row the
    // scorer started on (3 → 4 → 1 → 2), not from the top.
    const next = nextEmptyIndex(nextVals, idx);
    if (next >= 0) setBidFocus({ field: 'bid', index: next });
    // All four in: if the trump record is the thing still missing, show its keys.
    else if (view !== 'edit' && ((advanced && (!trump || !hierarchy)) || (trumpOwnerId && !trump))) setBidFocus({ field: 'trump', index: idx });
  };

  const pickTrumpOwner = (playerId) => {
    setTrumpOwner(playerId);
    setBidFocus((f) => ({ field: 'trump', index: f.index }));
    setRestoredNote('');
  };

  // Once the trump record is complete, carry on with the bids: the trump winner's first
  // (they state their contract first at the table), then whoever is still missing.
  const leaveTrumpKeysWhenDone = (nextTrump, nextHierarchy) => {
    if (!nextTrump || (advanced && !nextHierarchy)) return;
    const ownerIdx = ids.indexOf(trumpOwnerId);
    const target = ownerIdx >= 0 && bidVals[ownerIdx] == null ? ownerIdx : nextEmptyIndex(bidVals, ownerIdx);
    if (target >= 0) setBidFocus({ field: 'bid', index: target });
  };
  const pickTrump = (suit) => { setTrump(suit); setRestoredNote(''); leaveTrumpKeysWhenDone(suit, hierarchy); };
  const pickHierarchy = (h) => { setHierarchy(h); setRestoredNote(''); leaveTrumpKeysWhenDone(trump, h); };
  // Outside advanced sessions the trump record is optional, so it can be taken off again.
  const removeTrump = () => {
    setTrumpOwner(null); setTrump(null); setRestoredNote('');
    setBidFocus((f) => ({ field: 'bid', index: Math.max(nextEmptyIndex(bidVals, -1), 0) || f.index }));
  };

  const submitBids = async () => {
    setSaving(true); setError('');
    try {
      const bidMap = {};
      ids.forEach((pid) => { bidMap[pid] = Number(bids[pid]); });
      const res = await base44.functions.invoke('submitBids', {
        game_id: id, bids: bidMap,
        trump_suit: trump || undefined,
        hierarchy: advanced ? hierarchy : undefined,
        trump_owner_player_id: trump ? trumpOwnerId : undefined,
      });
      // Take the server's answer and leave the tricks and reneges on screen alone: the
      // scorer may have typed some before reopening the bids, and they are kept.
      const updated = res.data?.round || {};
      setRound((prev) => ({ ...prev, ...updated, status: 'playing' }));
      setResults((prev) => prev.map((r) => ({ ...r, bid: bidMap[r.player_id] })));
      setTrumpOwner(trump ? trumpOwnerId : null);
      if (!advanced) setHierarchy(null);
      setEditBids(false);
      setTrickIndex(Math.max(nextEmptyIndex(trickVals, -1), 0));
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    } catch (err) {
      setError(errorMessage(err, 'Failed to lock bids.'));
    } finally {
      setSaving(false);
    }
  };

  // "Edit bids" → Cancel: back to the bids as locked. Tricks and reneges are not touched.
  const cancelEditBids = () => {
    const server = serverEntry(round, results);
    setBids(server.bids); setTrump(server.trump); setTrumpOwner(server.trumpOwner); setHierarchy(server.hierarchy);
    setEditBids(false); setError('');
  };

  // ---- entering tricks ----------------------------------------------------------------
  const pickTrick = (n) => {
    const nextVals = trickVals.map((v, i) => (i === trickIndex ? n : v));
    setTricks((prev) => ({ ...prev, [ids[trickIndex]]: n }));
    setRestoredNote('');
    const next = nextEmptyIndex(nextVals, trickIndex);
    if (next >= 0) setTrickIndex(next);
  };
  const toggleRenege = (playerId) => {
    setReneges((prev) => ({ ...prev, [playerId]: !prev[playerId] }));
    setRestoredNote('');
  };

  const saveResults = async () => {
    setSaving(true); setError('');
    try {
      const tMap = {};
      const gMap = {};
      ids.forEach((pid) => { tMap[pid] = Number(tricks[pid]); gMap[pid] = !!reneges[pid]; });
      await base44.functions.invoke('saveRoundResults', { game_id: id, tricks: tMap, reneges: gMap });
      clearDraft(id);
      goToSession(true); // the session page opens on the result of this round
    } catch (err) {
      setError(errorMessage(err, 'Failed to save results.'));
      setSaving(false);
    }
  };

  // ---- discarding a round that is not scored yet (any member may) -------------------
  const discardRound = async () => {
    const ok = await confirm({
      title: `Discard round ${round.round_number}?`,
      description: 'The round and everything entered for it are removed. Nobody scores anything for it.',
      confirmLabel: 'Discard round',
      cancelLabel: 'Keep it',
      destructive: true,
    });
    if (!ok) return;
    setSaving(true); setError('');
    try {
      await base44.functions.invoke('deleteRound', { game_id: id });
    } catch (err) {
      // Already gone (discarded on another phone) counts as done.
      if (err.response?.status !== 404) {
        setError(errorMessage(err, 'Failed to discard the round.'));
        setSaving(false);
        return;
      }
    }
    clearDraft(id);
    goToSession(true);
  };

  // ---- a scored round: delete it, or fix it (group admin) ---------------------------
  const deleteScoredRound = async () => {
    const ok = await confirm({
      title: `Delete round ${round.round_number}?`,
      description: 'Its scores are removed from the session and from every total. This cannot be undone.',
      confirmLabel: 'Delete round',
      destructive: true,
    });
    if (!ok) return;
    setSaving(true); setError('');
    try {
      await base44.functions.invoke('deleteRound', { game_id: id });
    } catch (err) {
      if (err.response?.status !== 404) {
        setError(errorMessage(err, 'Failed to delete round.'));
        setSaving(false);
        return;
      }
    }
    goToSession();
  };

  const openEditor = () => {
    setError('');
    navigate({ pathname: location.pathname, search: '?edit=1' }, { replace: true, state: { ...(location.state || {}), editFromSession: false } });
  };
  const cancelEditor = () => {
    applyEntry(serverEntry(round, results)); setError('');
    // Opened straight from the session's round card: go back there. Opened from this
    // round's own page: back to that page.
    if (location.state?.editFromSession) goToSession();
    else navigate({ pathname: location.pathname, search: '' }, { replace: true, state: location.state });
  };
  const saveEditor = async () => {
    setSaving(true); setError('');
    try {
      const bidMap = {};
      const tMap = {};
      const gMap = {};
      ids.forEach((pid) => { bidMap[pid] = Number(bids[pid]); tMap[pid] = Number(tricks[pid]); gMap[pid] = !!reneges[pid]; });
      await base44.functions.invoke('updateRound', {
        game_id: id, bids: bidMap, tricks: tMap, reneges: gMap,
        trump_suit: trump || undefined,
        hierarchy: advanced ? hierarchy : undefined,
        trump_owner_player_id: trump ? trumpOwnerId : undefined,
      });
      goToSession();
    } catch (err) {
      setError(errorMessage(err, 'Failed to update round.'));
      setSaving(false);
    }
  };

  // ---- pieces shared by the views ------------------------------------------------------
  // The first line of every view: the way back, the view's own extras, and the help.
  // On the entry screens it takes 36px of the page (its controls still take taps over 44px).
  const topLine = (extra, { compact = false, title = null } = {}) => (
    <div className={cn('flex items-center justify-between gap-2', compact && '-my-1')}>
      <BackLink fallback={`/session/${round.session_id}`} className="-ml-1 pl-1" />
      {title}
      <div className="-mr-2 flex items-center">
        {extra}
        <ScoringHelpButton />
      </div>
    </div>
  );
  const discardButton = (
    <button type="button" onClick={discardRound} disabled={saving}
      className="flex min-h-11 items-center px-2 text-sm text-muted-foreground hover:text-negative disabled:opacity-50">
      Discard round
    </button>
  );
  const tableBadge = liveTable && (
    <TableBadge state={liveTable} total={bidTotal} onClick={() => setHelp('updown')} />
  );
  const trickTotalBadge = (
    <span data-trick-total className={cn(
      'inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full px-2 text-xs font-bold',
      trickTotal === 13 ? 'bg-emerald-500/20 text-emerald-400'
        : trickTotal > 13 ? 'bg-destructive/15 text-negative'
        : 'bg-secondary text-muted-foreground'
    )}>
      {trickTotal} / 13 tricks
    </span>
  );
  const bidRows = (
    <BidRows players={players} bids={bidVals} focus={focus}
      onSelect={(i) => setBidFocus({ field: 'bid', index: i })}
      trumpOwnerId={trumpOwnerId} trump={trump} onPickTrumpOwner={pickTrumpOwner} trumpRequired={advanced} />
  );
  const bidKeys = (
    <BidKeys focus={focus} players={players} bids={bidVals}
      blocked={focus.field === 'bid' ? blockedBid(bidVals, focus.index) : null}
      onPickBid={pickBid} anyBidEntered={bidVals.some((v) => v != null)}
      trumpOwnerName={trumpOwnerName} trump={trump} onPickTrump={pickTrump}
      onRemoveTrump={advanced ? undefined : removeTrump}
      advanced={advanced} hierarchy={hierarchy} onPickHierarchy={pickHierarchy} />
  );
  const trickRows = (
    <TrickRows players={players} bids={bidVals} tricks={trickVals} reneges={renegeVals}
      activeIndex={trickIndex} onSelect={setTrickIndex} onToggleRenege={toggleRenege} preview={preview} />
  );
  const trickKeys = (
    <TrickKeys player={players[trickIndex]} value={trickVals[trickIndex]} onPick={pickTrick}
      onRenegeHelp={() => setHelp('renege')} />
  );
  const busy = (label) => <><Loader2 className="animate-spin" /> {label}</>;
  // The line above the button: why it is off, or that the round will be cancelled.
  const tricksStatus = trickBlocker
    ? <DockStatus tone={trickTotal > 13 && !trickVals.includes(null) ? 'error' : 'muted'}>{trickBlocker}</DockStatus>
    : <DockStatus tone="warn">{preview.everyoneFalls ? EVERYONE_FALLS_LINE : ''}</DockStatus>;
  const bidsStatus = (
    <DockStatus tone={allBidsSet && !liveTable ? 'error' : 'muted'}>{bidBlocker}</DockStatus>
  );

  // ---- the views -----------------------------------------------------------------------
  let body;
  if (view === 'bidding' || view === 'editBids') {
    body = (
      <div className={ENTRY_LAYOUT}>
        {topLine(view === 'bidding' ? discardButton : null, { compact: true })}
        <PhaseBanner phase="bidding" roundNumber={round.round_number} badge={tableBadge}
          title={view === 'editBids' ? 'Edit bids' : undefined}
          subtitle={view === 'editBids' ? `Round ${round.round_number} · the tricks entered are kept` : undefined} />
        <RestoredNote what={restoredNote} />
        {bidRows}
        <ActionDock label={view === 'editBids' ? 'Edit bids' : 'Bidding'}>
          {bidKeys}
          <ErrorState inline message={error} />
          {bidsStatus}
          {view === 'editBids' ? (
            <div className="flex gap-2">
              <Button variant="outline" size="lg" className="flex-1 px-2" disabled={saving} onClick={cancelEditBids}>Cancel</Button>
              <Button size="lg" className="flex-1 px-2" disabled={!!bidBlocker || saving} onClick={submitBids}>
                {saving ? busy('Saving…') : 'Save bids'}
              </Button>
            </div>
          ) : (
            <Button size="lg" className="w-full" disabled={!!bidBlocker || saving} onClick={submitBids}>
              {saving ? busy('Locking…') : 'Lock bids'}
            </Button>
          )}
        </ActionDock>
      </div>
    );
  } else if (view === 'results') {
    body = (
      <div className={ENTRY_LAYOUT}>
        {topLine(discardButton, { compact: true })}
        <PhaseBanner phase="results" roundNumber={round.round_number} badge={trickTotalBadge} />
        {/* What was locked: the table, the trump record and the card order — and the way
            to fix a mistyped bid, which any member may do while the round is unscored.
            The badge and the words flow as one text, so a long card order wraps beside
            the button instead of pushing the rows down. */}
        <div className="flex items-center justify-between gap-2" data-round-context>
          <p className="min-w-0 py-0.5 leading-6">
            <TableBadge state={round.table_state} total={round.total_bids ?? undefined} onClick={() => setHelp('updown')} className="mr-2 align-middle" />
            <TrumpLine round={round} players={players} className="align-middle" />
          </p>
          <button type="button" onClick={() => { setError(''); setEditBids(true); setBidFocus({ field: 'bid', index: 0 }); }}
            className="-my-2 flex min-h-11 shrink-0 items-center gap-1 pl-2 text-sm text-muted-foreground hover:text-foreground">
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit bids
          </button>
        </div>
        <RestoredNote what={restoredNote} />
        {trickRows}
        <ActionDock label="Results">
          {trickKeys}
          <ErrorState inline message={error} />
          {tricksStatus}
          <Button size="lg" className="w-full" disabled={!!trickBlocker || saving} onClick={saveResults}>
            {saving ? busy('Saving…') : 'Save round'}
          </Button>
        </ActionDock>
      </div>
    );
  } else if (view === 'edit') {
    const blocker = bidBlocker || trickBlocker;
    body = (
      <div className={ENTRY_LAYOUT}>
        {/* The title shares the first line, so the rows, the pad and both buttons fit a short phone. */}
        {topLine(null, {
          compact: true,
          title: <h1 className="min-w-0 whitespace-nowrap font-heading text-base font-bold text-foreground">Edit round {round.round_number}</h1>,
        })}
        <div role="tablist" aria-label="What to change" className="grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
          {[['bids', `Bids · ${bidTotal}${liveTable ? ` ${liveTable}` : ''}`], ['tricks', `Tricks · ${trickTotal} / 13`]].map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={editTab === key} onClick={() => setEditTab(key)}
              className={cn(
                "relative h-9 rounded-md text-sm font-medium after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']",
                editTab === key ? 'bg-background text-foreground shadow' : 'text-muted-foreground'
              )}>
              {label}
            </button>
          ))}
        </div>
        {editTab === 'bids' ? bidRows : trickRows}
        <ActionDock label="Edit round">
          {editTab === 'bids' ? bidKeys : trickKeys}
          <ErrorState inline message={error} />
          {blocker
            ? <DockStatus tone="error">{blocker}</DockStatus>
            : preview.everyoneFalls
              ? <DockStatus tone="warn">{EVERYONE_FALLS_LINE}</DockStatus>
              : <DockStatus>Saving replaces this round's points</DockStatus>}
          <div className="flex gap-2">
            <Button variant="outline" size="lg" className="flex-1 px-2" disabled={saving} onClick={cancelEditor}>Cancel</Button>
            <Button size="lg" className="flex-1 px-2" disabled={!!blocker || saving} onClick={saveEditor}>
              {saving ? busy('Saving…') : 'Save changes'}
            </Button>
          </div>
        </ActionDock>
      </div>
    );
  } else if (view === 'readonly') {
    // A round left unfinished in a group that was archived since: shown, not editable.
    body = (
      <div className="space-y-4">
        {topLine(null)}
        <ArchivedBanner />
        <h1 className="page-title">Round {round.round_number}</h1>
        <p className="text-sm text-muted-foreground">This round was never finished, so it has no scores.</p>
        <ul className="space-y-1.5">
          {players.map((p, i) => (
            <li key={p.id} className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 text-sm">
              <span className="min-w-0 truncate text-foreground">{i + 1}. <Name>{p.player_name}</Name></span>
              <span className="shrink-0 text-xs text-muted-foreground">{p.bid != null ? `bid ${p.bid}` : 'no bid'}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  } else {
    body = (
      <div className="space-y-4">
        {topLine(null)}
        {archived && <ArchivedBanner />}
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <h1 className="page-title">Round {round.round_number}</h1>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <TableBadge state={round.table_state} total={round.total_bids ?? undefined} onClick={() => setHelp('updown')} />
              {(round.everyone_falls || status === 'cancelled') && <EveryoneFellBadge onClick={() => setHelp('everyone-falls')} />}
            </div>
          </div>
          <TrumpLine round={round} players={players} className="block" />
        </div>
        <ResultLines results={players} onHelp={setHelp} size="lg" />
        <ErrorState inline message={error} />
        {canChangeScored ? (
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 px-2" onClick={openEditor} disabled={saving}>
              <Pencil /> Edit round
            </Button>
            <Button variant="outline" className="flex-1 px-2 text-negative" onClick={deleteScoredRound} disabled={saving}>
              <Trash2 /> Delete round
            </Button>
          </div>
        ) : role === 'player' && !archived ? (
          <p className="text-sm text-muted-foreground" data-admin-only-note>
            Only a group admin can change a scored round.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <>
      {body}
      {confirmElement}
      <ScoringHelp open={help != null} onOpenChange={(open) => { if (!open) setHelp(null); }} section={help || undefined} />
    </>
  );
}
