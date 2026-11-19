import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Plus, Play, RefreshCw, Lock, Loader2, SearchX, Trophy, Users, X, CheckCircle2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Leaderboard from '@/components/Leaderboard';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import { Name, UserText } from '@/components/UserText';
import { useConfirm } from '@/components/ConfirmDialog';
import { ScoringHelp, ScoringHelpButton } from '@/components/ScoringHelp';
import BackLink from '@/components/BackLink';
import ArchivedBanner from '@/components/ArchivedBanner';
import { usePageGroup } from '@/lib/ActiveGroupContext';
import { buildStandings } from '@/lib/standings';
import { SCORING_METHOD_LABEL } from '@/lib/scoring-help';
import { formatScore, formatDate, scoreTone, sessionName, errorMessage } from '@/lib/format';
import { clearDraft } from '@/lib/round-drafts';
import RoundCard from '@/components/round/RoundCard';
import { FROM_SESSION, takeSessionTop, takeSavedNote, rememberRedeal, redealTable, forgetRedeal } from '@/components/round/session-return';
import { confirmStartedElsewhere } from '@/components/round/started-elsewhere';
import { nextRoundNumber, roundLimit, sameTableOrder } from '@/components/round/round-logic';

// One session (a night of whist): its standings and its rounds.
//
// While it is open the page is the scorer's hub between rounds, top to bottom:
//   the primary action   Start round N / Resume round N (or Close session, once the round limit is reached)
//   the newest round     the result of the round just saved — or the round in play, with "Discard round"
//   the standings        then "Close session"
//   the earlier rounds
// Once it is closed the page leads with who won and the final standings.

const inPlay = (round) => round.status === 'bidding' || round.status === 'playing';

// A rule of the night in the session's header: a word in the line that opens its
// explanation. 20px tall in the text, 44px to the thumb (the ::after reaches 12px above
// and below, into the empty space around the line).
const RULE_LINK = 'inline-flex min-h-11 items-center underline decoration-dotted underline-offset-4 hover:text-foreground';

export default function SessionView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [session, setSession] = useState(null);
  const [rounds, setRounds] = useState([]); // newest first
  const [resultsByRound, setResultsByRound] = useState({});
  const [standings, setStandings] = useState([]);
  const [busy, setBusy] = useState(''); // 'close' | 'start' | 'discard' while that request runs
  const [error, setError] = useState(''); // a failed action, shown beside the control that caused it
  const [errorAt, setErrorAt] = useState(''); // 'start' | 'discard' | 'close'
  // Which section of "How scoring works" is open (null = closed).
  const [help, setHelp] = useState(null);
  const [confirm, confirmElement] = useConfirm();
  // "Round 5 saved": the round screen that sent the scorer back here says what it saved.
  const [savedNote, setSavedNote] = useState(() => takeSavedNote());

  // The caller's standing in the group this session belongs to — not in whichever group
  // was open before. An archived group is read-only.
  const { isAdmin, isArchived: archived, role } = usePageGroup(session?.group_id);

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setLoadError('');
      setNotFound(false);
      // Membership-checked read — the session, its rounds and their results in one call.
      const res = await base44.functions.invoke('getGroupData', { scope: 'session', session_id: id });
      const { session: sess, rounds: rnds = [], results = [] } = res.data;
      setSession(sess);
      const byRound = {};
      results.forEach((r) => { (byRound[r.game_id] ||= []).push(r); });
      Object.values(byRound).forEach((arr) => arr.sort((a, b) => (a.bid_order ?? 0) - (b.bid_order ?? 0)));
      setResultsByRound(byRound);
      setRounds([...rnds].sort((a, b) => (b.round_number ?? 0) - (a.round_number ?? 0)));
      setStandings(buildStandings(results, {}, { sessions: [sess] })); // a win needs the session to be closed
      // Coming back from a round that was just saved or discarded: show the top of the
      // page, where its result is.
      if (takeSessionTop()) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    } catch (err) {
      setNotFound(err.response?.status === 404);
      setLoadError(errorMessage(err, 'Failed to load session.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const fail = (where, err, fallback) => { setErrorAt(where); setError(errorMessage(err, fallback)); };

  if (loading) return <LoadingSpinner showLogo />;
  if (!session) {
    // A missing session cannot be fixed by trying again — offer the way back instead.
    return notFound || !loadError ? (
      <EmptyState as="h1" icon={SearchX} title="Session not found" description="It was deleted, or the link is wrong."
        action={<Button asChild variant="outline"><Link to="/history">Back to sessions</Link></Button>} />
    ) : (
      <ErrorState title="Couldn't load this session" message={loadError} onRetry={() => load(true)} />
    );
  }

  const isOpen = session.status === 'open';
  const canWrite = isOpen && !archived;
  const openRound = rounds.find(inPlay);
  const scoredRounds = rounds.filter((r) => !inPlay(r));
  const lastScored = scoredRounds[0];
  // The round shown right under the primary action: the one in play, else the last one scored.
  const featured = isOpen ? (openRound || lastScored) : null;
  const otherRounds = rounds.filter((r) => r.id !== featured?.id);
  const nextNumber = nextRoundNumber(rounds);
  const limit = roundLimit(session, rounds);
  // Scored rounds that were cancelled (everyone fell): played, but not counted toward the limit.
  const cancelledCount = scoredRounds.length - limit.played;
  const canEditScored = isAdmin && !archived;
  // A plain player is told once who can change a scored round.
  const tellAdminOnly = role === 'player' && !archived;
  // "Same players as last round": the last round actually played (a discarded round is
  // gone from the list), with the bidding moved on by one. After a discard the discarded
  // table is offered too, as a second, smaller choice named by its four players — unless
  // it is the very same table.
  const sameTable = !openRound && rounds[0] ? sameTableOrder(resultsByRound[rounds[0].id] || []) : [];
  const savedRedeal = !openRound ? redealTable(id, rounds) : null;
  const redeal = savedRedeal && !savedRedeal.ids.every((pid, i) => sameTable[i] === pid) ? savedRedeal : null;
  const allResults = Object.values(resultsByRound).flat();
  const firstBidder = sameTable.length === 4
    ? allResults.find((r) => r.player_id === sameTable[0])?.player_name || ''
    : '';
  // A closed session in which no round counted (every scored round was cancelled because
  // everyone fell) has no winner — the server says so with `no_winner`.
  const noWinner = !isOpen && (session.no_winner === true || scoredRounds.length === 0);
  const winners = !isOpen && !noWinner ? standings.filter((p) => p.rank === 1) : [];

  // ---- actions ------------------------------------------------------------------------
  // One tap for the commonest case: the same four play again (or the discarded table, dealt again).
  const startTable = async (playerIds, which) => {
    setBusy(which); setError('');
    try {
      const res = await base44.functions.invoke('startRound', { session_id: id, player_ids: playerIds });
      forgetRedeal(id);
      navigate(`/round/${res.data.round.id}`, { state: FROM_SESSION });
    } catch (err) {
      const openId = err.response?.data?.open_round_id;
      if (openId) {
        // Another phone started a round first: say so, with its four, and let the scorer choose.
        setBusy('');
        if (await confirmStartedElsewhere({ confirm, openRoundId: openId })) navigate(`/round/${openId}`, { state: FROM_SESSION });
        else await load(true);
        return;
      }
      fail('start', err, 'Failed to start round.');
      setBusy('');
    }
  };

  // Delete a round that is not scored yet. Already gone counts as done.
  const removeUnscoredRound = async (round) => {
    try {
      await base44.functions.invoke('deleteRound', { game_id: round.id });
    } catch (err) {
      if (err.response?.status !== 404) throw err;
    }
    clearDraft(round.id);
  };

  const discardRound = async (round) => {
    const ok = await confirm({
      title: `Discard round ${round.round_number}?`,
      description: 'The round and everything entered for it are removed. Nobody scores anything for it.',
      confirmLabel: 'Discard round',
      cancelLabel: 'Keep it',
      destructive: true,
    });
    if (!ok) return;
    setBusy('discard'); setError('');
    try {
      await removeUnscoredRound(round);
      // Usually a redeal: offer the same table, same order, for the next round.
      rememberRedeal(id, resultsByRound[round.id] || [], round.round_number);
      await load(true);
    } catch (err) {
      fail('discard', err, 'Failed to discard the round.');
    } finally {
      setBusy('');
    }
  };

  // Closing is always offered. A round still in play is discarded first — the
  // confirmation says so — because a closed session cannot hold an unfinished round.
  const closeSession = async () => {
    const ok = await confirm({
      title: 'Close this session?',
      description: openRound
        ? `Round ${openRound.round_number} is still in play — it will be discarded. After closing, no more rounds can be added and the session cannot be reopened.`
        : 'No more rounds can be added, and a closed session cannot be reopened.',
      confirmLabel: openRound ? 'Discard round and close' : 'Close session',
      destructive: !!openRound,
    });
    if (!ok) return;
    setBusy('close'); setError('');
    try {
      if (openRound) await removeUnscoredRound(openRound);
      await base44.functions.invoke('closeSession', { session_id: id });
      await load(true);
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); // the result is at the top
    } catch (err) {
      fail('close', err, 'Failed to close session.');
      await load(true).catch(() => {});
    } finally {
      setBusy('');
    }
  };

  const dismissNotice = () => navigate(location.pathname, { replace: true, state: null });

  const closeButton = (primary) => (
    <Button variant={primary ? 'default' : 'outline'} size={primary ? 'lg' : 'default'}
      className={primary ? 'w-full' : 'w-full text-muted-foreground'} onClick={closeSession} disabled={!!busy}>
      {busy === 'close' ? <><Loader2 className="animate-spin" /> Closing…</> : <><Lock /> Close session</>}
    </Button>
  );

  return (
    <div className="-mt-3 space-y-4">
      <div className="-my-2 flex items-center justify-between">
        {/* Always "← Sessions", however the page was reached. */}
        <BackLink to="/history" className="-ml-1 pl-1" />
        <div className="-mr-2 flex items-center">
          <ScoringHelpButton />
          <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-foreground" disabled={refreshing} onClick={() => load(true)} aria-label="Refresh">
            <RefreshCw className={refreshing ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {/* Said by the page that sent the scorer here (starting a session while one is open). */}
      {location.state?.notice && (
        <p role="status" data-session-notice
          className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card py-1 pl-3 pr-1 text-sm text-foreground">
          <span>{location.state.notice}</span>
          <Button size="icon" variant="ghost" className="shrink-0" aria-label="Dismiss" onClick={dismissNotice}><X /></Button>
        </p>
      )}

      {savedNote && (
        <p role="status" data-saved-note
          className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card py-1 pl-3 pr-1 text-sm text-foreground">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
            {savedNote}
          </span>
          <Button size="icon" variant="ghost" className="shrink-0" aria-label="Dismiss" onClick={() => setSavedNote('')}><X /></Button>
        </p>
      )}

      {archived && <ArchivedBanner />}

      <div>
        {/* A long name without spaces wraps instead of widening the page. */}
        <h1 className="page-title break-words [overflow-wrap:anywhere]"><UserText>{sessionName(session)}</UserText></h1>
        <p className="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">
          {formatDate(session.session_date || session.created_date)}
          {session.location ? <> · <UserText>{session.location}</UserText></> : null}
          {` · ${isOpen ? 'Open' : 'Closed'}`}
        </p>
        {/* The rules of the night. Each one opens its explanation. */}
        <p className="-mb-2 flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground" data-session-rules>
          <button type="button" onClick={() => setHelp('miss')} className={RULE_LINK}>
            {SCORING_METHOD_LABEL[session.scoring_method === 'progressive' ? 'progressive' : 'classic']} scoring
          </button>
          {session.advanced_rules_enabled && (
            <button type="button" onClick={() => setHelp('trump')} className={RULE_LINK}>
              Advanced rules
            </button>
          )}
          {limit.limit != null && (
            <span className="whitespace-nowrap" data-round-limit>Round limit {limit.limit} · {limit.played} counted</span>
          )}
        </p>
      </div>

      {/* ---- a closed session leads with its result ---- */}
      {!isOpen && (
        <section aria-label="Final result" data-final-result className="rounded-lg border border-border bg-card p-4">
          <p className="section-label">Final result</p>
          {winners.length > 0 ? (
            <p className="mt-1 flex items-start gap-2 font-heading text-xl font-bold leading-snug text-foreground">
              <Trophy className="mt-1 h-5 w-5 shrink-0 text-foreground" aria-hidden="true" />
              <span>
                {winners.map((w, i) => (
                  <span key={w.player_id}>{i > 0 ? (i === winners.length - 1 ? ' and ' : ', ') : ''}<Name>{w.player_name}</Name></span>
                ))}
                {' won'}{winners.length > 1 ? ' together' : ''}{' · '}
                <span className={scoreTone(winners[0].total_score)}>{formatScore(winners[0].total_score)}</span>
              </span>
            </p>
          ) : (
            <p className="mt-1 font-heading text-lg font-bold text-foreground" data-no-winner>No winner — no round counted</p>
          )}
          {scoredRounds.length > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              {scoredRounds.length} round{scoredRounds.length !== 1 ? 's' : ''} played
              {cancelledCount > 0 ? ` · ${cancelledCount} cancelled (everyone fell)` : ''} · the session is closed
            </p>
          )}
        </section>
      )}

      {/* ---- the primary action of an open session ---- */}
      {canWrite && (
        <div className="space-y-2">
          {openRound ? (
            <Button asChild size="lg" className="w-full">
              <Link to={`/round/${openRound.id}`} state={FROM_SESSION}><Play /> Resume round {openRound.round_number}</Link>
            </Button>
          ) : limit.reached ? (
            <>
              <p className="text-sm text-muted-foreground" data-limit-reached>
                Round limit reached — {limit.played} of {limit.limit} rounds counted.
              </p>
              {closeButton(true)}
              {errorAt === 'close' && <ErrorState inline message={error} />}
            </>
          ) : (
            <>
              <Button asChild size="lg" className="w-full">
                <Link to={`/session/${id}/round/new`} state={FROM_SESSION}><Plus /> Start round {nextNumber}</Link>
              </Button>
              {/* One tap when the table has not changed: the same four, the bidding moved on by one. */}
              {sameTable.length === 4 && (
                <Button variant="outline" className="h-auto min-h-11 w-full whitespace-normal py-2" onClick={() => startTable(sameTable, 'start')} disabled={!!busy}>
                  {busy === 'start' ? <Loader2 className="animate-spin" /> : <Users />}
                  <span>Same players as last round — <Name>{firstBidder}</Name> bids first</span>
                </Button>
              )}
              {/* Right after a discard: that table again, same order — named, so it is never
                  mistaken for the table of the last round played. */}
              {redeal && (
                <Button variant="ghost" className="h-auto min-h-11 w-full whitespace-normal py-2 text-muted-foreground" data-redeal
                  onClick={() => startTable(redeal.ids, 'redeal')} disabled={!!busy}>
                  {busy === 'redeal' ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                  <span>Redeal — {redeal.names.map((name, i) => <span key={i}>{i > 0 ? ', ' : ''}<Name>{name}</Name></span>)}</span>
                </Button>
              )}
              {errorAt === 'start' && <ErrorState inline message={error} />}
            </>
          )}
        </div>
      )}

      {/* ---- the newest round, directly under the primary action ---- */}
      {featured && (
        <div className="space-y-2">
          <RoundCard round={featured} results={resultsByRound[featured.id] || []}
            label={inPlay(featured) ? undefined : 'Last round'}
            canEdit={!inPlay(featured) && canEditScored}
            onDiscard={inPlay(featured) && canWrite ? discardRound : undefined}
            discarding={busy === 'discard'}
            // The big "Resume round" button above is the one way in.
            showEntryLink={!(inPlay(featured) && canWrite)}
            onHelp={setHelp} />
          {errorAt === 'discard' && <ErrorState inline message={error} />}
        </div>
      )}

      {/* ---- standings ----
          A session with no rounds at all says so once, under "Rounds", not twice. */}
      {rounds.length > 0 && (
        <div className="space-y-3">
          <h2 className="section-title">{isOpen ? 'Standings' : 'Final standings'}</h2>
          {standings.length === 0 ? (
            <EmptyState compact title="No scores yet"
              description={isOpen ? 'Standings appear when the first round is saved.' : 'No round was scored in this session.'} />
          ) : (
            <Leaderboard players={standings} sortBy="total" />
          )}
        </div>
      )}

      {/* Closing sits right under the standings, not below the whole list of rounds. */}
      {canWrite && !(limit.reached && !openRound) && (
        <div className="space-y-2">
          {closeButton(false)}
          {errorAt === 'close' && <ErrorState inline message={error} />}
        </div>
      )}

      {/* ---- the rounds ---- */}
      {(otherRounds.length > 0 || !featured) && (
        <div className="space-y-3">
          <h2 className="section-title">{featured ? 'Earlier rounds' : 'Rounds'}</h2>
          {/* Said once, not on every card. */}
          {tellAdminOnly && otherRounds.some((r) => !inPlay(r)) && (
            <p className="text-sm text-muted-foreground" data-admin-only-note>Only a group admin can change a scored round.</p>
          )}
          {otherRounds.length === 0 ? (
            <EmptyState compact title="No rounds yet"
              description={canWrite ? 'Start the first round above.' : 'This session had no rounds.'} />
          ) : (
            otherRounds.map((round) => (
              <RoundCard key={round.id} round={round} results={resultsByRound[round.id] || []}
                canEdit={!inPlay(round) && canEditScored}
                onDiscard={inPlay(round) && canWrite ? discardRound : undefined}
                discarding={busy === 'discard'}
                onHelp={setHelp} />
            ))
          )}
        </div>
      )}
      {featured && !inPlay(featured) && otherRounds.length === 0 && tellAdminOnly && (
        <p className="text-sm text-muted-foreground" data-admin-only-note>Only a group admin can change a scored round.</p>
      )}

      {confirmElement}
      <ScoringHelp open={help != null} onOpenChange={(open) => { if (!open) setHelp(null); }} section={help || undefined} />
    </div>
  );
}
