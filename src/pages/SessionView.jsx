import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, Plus, Play, RefreshCw, Lock, Loader2, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Leaderboard from '@/components/Leaderboard';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import TableBadge from '@/components/TableBadge';
import { Suit } from '@/components/Suit';
import { Name, UserText } from '@/components/UserText';
import { useConfirm } from '@/components/ConfirmDialog';
import { ScoringHelp, ScoringHelpButton } from '@/components/ScoringHelp';
import { useActiveGroup } from '@/lib/ActiveGroupContext';
import { buildStandings } from '@/lib/standings';
import { formatScore, formatDate, scoreTone, sessionName, errorMessage } from '@/lib/format';

export default function SessionView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useActiveGroup();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [session, setSession] = useState(null);
  const [rounds, setRounds] = useState([]);
  const [resultsByRound, setResultsByRound] = useState({});
  const [standings, setStandings] = useState([]);
  const [closing, setClosing] = useState(false);
  // Which section of "How scoring works" is open (null = closed).
  const [helpSection, setHelpSection] = useState(null);
  const [confirm, confirmElement] = useConfirm();

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const load = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError('');
      setNotFound(false);
      // Membership-checked read (P12-1) — session, its rounds and their results in one call.
      const res = await base44.functions.invoke('getGroupData', { scope: 'session', session_id: id });
      const { session: sess, rounds: rnds = [], results = [] } = res.data;
      setSession(sess);
      const byRound = {};
      results.forEach((r) => { (byRound[r.game_id] ||= []).push(r); });
      Object.values(byRound).forEach((arr) => arr.sort((a, b) => (a.bid_order ?? 0) - (b.bid_order ?? 0)));
      setResultsByRound(byRound);
      setRounds([...rnds].sort((a, b) => (b.round_number ?? 0) - (a.round_number ?? 0)));
      setStandings(buildStandings(results, {}, { sessions: [sess] })); // a win needs the session to be closed
    } catch (err) {
      console.error(err);
      setNotFound(err.response?.status === 404);
      setError(errorMessage(err, 'Failed to load session.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleClose = async () => {
    const ok = await confirm({
      title: 'Close this session?',
      description: 'No more rounds can be added.',
      confirmLabel: 'Close session',
    });
    if (!ok) return;
    setClosing(true);
    try {
      await base44.functions.invoke('closeSession', { session_id: id });
      await load(true);
    } catch (err) {
      setError(errorMessage(err, 'Failed to close session.'));
    } finally {
      setClosing(false);
    }
  };

  if (loading) return <LoadingSpinner showLogo />;
  if (error && !session) {
    // A missing session cannot be fixed by trying again — offer the way back instead.
    return notFound ? (
      <EmptyState as="h1" icon={SearchX} title="Session not found" description="It was deleted, or the link is wrong."
        action={<Button asChild variant="outline"><Link to="/">Back to sessions</Link></Button>} />
    ) : (
      <ErrorState title="Couldn't load this session" message={error} onRetry={() => load(true)} />
    );
  }

  const openRound = rounds.find((r) => r.status === 'bidding' || r.status === 'playing');
  const isOpen = session?.status === 'open';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/')} className="flex items-center gap-1 min-h-11 pr-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Sessions
        </button>
        <div className="flex items-center -mr-2">
          <ScoringHelpButton />
          <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-foreground" disabled={refreshing} onClick={() => load(true)} aria-label="Refresh">
            <RefreshCw className={refreshing ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      <div>
        <h1 className="page-title"><UserText>{sessionName(session)}</UserText></h1>
        <p className="text-sm text-muted-foreground mt-1">
          {formatDate(session?.session_date || session?.created_date)}
          {session?.location ? <> · <UserText>{session.location}</UserText></> : ''}
          {` · ${isOpen ? 'Open' : 'Closed'}`}
          {session?.advanced_rules_enabled ? ' · Advanced' : ''}
          {` · ${session?.scoring_method === 'progressive' ? 'Progressive' : 'Classic'}`}
        </p>
      </div>

      {/* Primary action */}
      {isOpen && (
        <Button asChild size="lg" className="w-full">
          {openRound ? (
            <Link to={`/round/${openRound.id}`}><Play /> Resume round {openRound.round_number}</Link>
          ) : (
            <Link to={`/session/${id}/round/new`}><Plus /> Start round {rounds.length + 1}</Link>
          )}
        </Button>
      )}

      {/* Standings (cumulative for this session) */}
      <div className="space-y-3">
        <h2 className="section-title">Standings</h2>
        <Leaderboard players={standings} sortBy="total" />
      </div>

      {/* Round feed */}
      <div className="space-y-3">
        <h2 className="section-title">Rounds</h2>
        {rounds.length === 0 ? (
          <EmptyState compact title="No rounds yet" description={isOpen ? 'Start the first round above.' : 'This session had no rounds.'} />
        ) : (
          rounds.map((round) => (
            <RoundFeedItem key={round.id} round={round} results={resultsByRound[round.id] || []} editable={isAdmin}
              onTableHelp={() => setHelpSection('updown')} />
          ))
        )}
      </div>

      <ErrorState inline message={error} />

      {isOpen && !openRound && (
        <Button variant="outline" className="w-full text-muted-foreground" onClick={handleClose} disabled={closing}>
          {closing ? <><Loader2 className="animate-spin" /> Closing…</> : <><Lock /> Close session</>}
        </Button>
      )}

      {confirmElement}
      <ScoringHelp open={helpSection != null} onOpenChange={(open) => { if (!open) setHelpSection(null); }} section={helpSection || undefined} />
    </div>
  );
}

function RoundFeedItem({ round, results, editable, onTableHelp }) {
  const cancelled = round.status === 'cancelled' || round.everyone_falls;
  const inProgress = round.status === 'bidding' || round.status === 'playing';
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="font-heading font-bold text-foreground whitespace-nowrap">Round {round.round_number}</span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <TableBadge state={round.table_state} onClick={onTableHelp} />
          {round.trump_suit && <Suit suit={round.trump_suit} label className="text-xs" />}
          {cancelled && <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-500 font-medium uppercase whitespace-nowrap">Everyone fell</span>}
          {inProgress && <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium uppercase">{round.status}</span>}
        </div>
      </div>
      {inProgress ? (
        <Link to={`/round/${round.id}`} className="inline-flex min-h-11 items-center text-sm text-primary hover:underline">Open round →</Link>
      ) : (
        <div className="space-y-1">
          {results.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-foreground truncate">
                <Name>{r.player_name}</Name>
                {/* Trump winner gets the suit inline, so a scan of the feed shows who took
                    trump in each round without opening it. */}
                {round.trump_suit && r.player_id === round.highest_bidder_player_id && (
                  <span className="ml-1.5" title="Won the trump"><Suit suit={round.trump_suit} /></span>
                )}
                {r.reneged ? <span className="ml-1 text-negative text-xs">(reneged)</span> : null}
              </span>
              <span className="flex items-center gap-3 flex-shrink-0">
                <span className="text-xs text-muted-foreground">bid {r.bid} · took {r.tricks_won}</span>
                <span className={`font-heading font-bold w-12 text-right ${scoreTone(r.points)}`}>
                  {formatScore(r.points)}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
      {editable && !inProgress && (
        <div className="mt-2 -mb-3 border-t border-border">
          <Link to={`/round/${round.id}`} className="inline-flex min-h-11 items-center text-xs text-muted-foreground hover:text-foreground">Edit round</Link>
        </div>
      )}
    </div>
  );
}
