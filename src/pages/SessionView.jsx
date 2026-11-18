import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, Plus, Play, RefreshCw, Lock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Leaderboard from '@/components/Leaderboard';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import { useActiveGroup } from '@/lib/ActiveGroupContext';
import { buildStandings } from '@/lib/standings';
import { formatScore, formatDate, formatSuit } from '@/lib/format';

export default function SessionView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useActiveGroup();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [session, setSession] = useState(null);
  const [rounds, setRounds] = useState([]);
  const [resultsByRound, setResultsByRound] = useState({});
  const [standings, setStandings] = useState([]);
  const [closing, setClosing] = useState(false);

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const load = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError('');
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
      setError(err.response?.data?.error || err.message || 'Failed to load session.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleClose = async () => {
    if (!confirm('Close this session? No more rounds can be added.')) return;
    setClosing(true);
    try {
      await base44.functions.invoke('closeSession', { session_id: id });
      await load(true);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to close session.');
    } finally {
      setClosing(false);
    }
  };

  if (loading) return <LoadingSpinner showLogo />;
  if (error && !session) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-center space-y-2">
        <p className="text-sm text-destructive">{error}</p>
        <Button size="sm" variant="outline" onClick={() => load(true)}>Try Again</Button>
      </div>
    );
  }

  const openRound = rounds.find((r) => r.status === 'bidding' || r.status === 'playing');
  const isOpen = session?.status === 'open';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Sessions
        </button>
        <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={refreshing} onClick={() => load(true)} aria-label="Refresh">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">{session?.name || 'Whist Night'}</h1>
        <p className="text-sm text-muted-foreground">
          {formatDate(session?.session_date || session?.created_date)}
          {session?.location ? ` · ${session.location}` : ''}
          {` · ${isOpen ? 'Open' : 'Closed'}`}
          {session?.advanced_rules_enabled ? ' · Advanced' : ''}
          {` · ${session?.scoring_method === 'progressive' ? 'Progressive' : 'Classic'}`}
        </p>
      </div>

      {/* Primary action */}
      {isOpen && (
        openRound ? (
          <Link to={`/round/${openRound.id}`}
            className="flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg py-4 font-heading font-bold text-lg uppercase tracking-wide hover:bg-primary/90 transition-colors">
            <Play className="w-5 h-5" /> Resume Round {openRound.round_number}
          </Link>
        ) : (
          <Link to={`/session/${id}/round/new`}
            className="flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg py-4 font-heading font-bold text-lg uppercase tracking-wide hover:bg-primary/90 transition-colors">
            <Plus className="w-5 h-5" /> Start Round {rounds.length + 1}
          </Link>
        )
      )}

      {/* Standings (cumulative for this session) */}
      <div className="space-y-3">
        <h2 className="font-heading text-lg font-bold text-foreground">Standings</h2>
        <Leaderboard players={standings} sortBy="total" />
      </div>

      {/* Round feed */}
      <div className="space-y-3">
        <h2 className="font-heading text-lg font-bold text-foreground">Rounds</h2>
        {rounds.length === 0 ? (
          <EmptyState icon="♠" title="No rounds yet" description={isOpen ? 'Start the first round above.' : 'This session had no rounds.'} />
        ) : (
          rounds.map((round) => (
            <RoundFeedItem key={round.id} round={round} results={resultsByRound[round.id] || []} editable={isAdmin} />
          ))
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {isOpen && !openRound && (
        <Button variant="outline" className="w-full border-border text-muted-foreground" onClick={handleClose} disabled={closing}>
          {closing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Closing…</> : <><Lock className="w-4 h-4 mr-2" /> Close Session</>}
        </Button>
      )}
    </div>
  );
}

function RoundFeedItem({ round, results, editable }) {
  const cancelled = round.status === 'cancelled' || round.everyone_falls;
  const inProgress = round.status === 'bidding' || round.status === 'playing';
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="font-heading font-bold text-foreground">Round {round.round_number}</span>
        <div className="flex items-center gap-2">
          {round.table_state && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
              round.table_state === 'up' ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'
            }`}>{round.table_state}</span>
          )}
          {round.trump_suit && <span className="text-[10px] text-muted-foreground">{formatSuit(round.trump_suit)}</span>}
          {cancelled && <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-500 font-medium uppercase">Everyone fell</span>}
          {inProgress && <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium uppercase">{round.status}</span>}
        </div>
      </div>
      {inProgress ? (
        <Link to={`/round/${round.id}`} className="text-sm text-primary hover:underline">Open round →</Link>
      ) : (
        <div className="space-y-1">
          {results.map((r) => (
            <div key={r.id} className="flex items-center justify-between text-sm">
              <span className="text-foreground truncate">
                {r.player_name}
                {/* Trump winner gets the suit inline, so a scan of the feed shows who took
                    trump in each round without opening it. */}
                {round.trump_suit && r.player_id === round.highest_bidder_player_id && (
                  <span className={`ml-1.5 font-bold ${
                    round.trump_suit === 'hearts' || round.trump_suit === 'diamonds' ? 'text-rose-500' : 'text-foreground'
                  }`} title="Won the trump">{formatSuit(round.trump_suit)}</span>
                )}
                {r.reneged ? <span className="ml-1 text-destructive text-xs">(reneged)</span> : null}
              </span>
              <span className="flex items-center gap-3 flex-shrink-0">
                <span className="text-xs text-muted-foreground">bid {r.bid} · won {r.tricks_won}</span>
                <span className={`font-heading font-bold w-12 text-right ${(r.points ?? 0) >= 0 ? 'text-primary' : 'text-destructive'}`}>
                  {formatScore(r.points)}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
      {editable && !inProgress && (
        <div className="mt-2 pt-2 border-t border-border">
          <Link to={`/round/${round.id}`} className="text-xs text-muted-foreground hover:text-foreground">Edit round</Link>
        </div>
      )}
    </div>
  );
}
