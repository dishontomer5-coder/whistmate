import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Plus, RefreshCw, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SessionCard from '@/components/SessionCard';
import Leaderboard from '@/components/Leaderboard';
import AwardsShowcase from '@/components/AwardsShowcase';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import NoGroupState from '@/components/NoGroupState';
import { useActiveGroup } from '@/lib/ActiveGroupContext';
import { buildStandings, computeAwardLeaders } from '@/lib/standings';

export default function Home() {
  const { activeGroupId, activeGroup, loading: groupsLoading } = useActiveGroup();
  const isArchived = activeGroup?.status === 'archived';
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [standings, setStandings] = useState([]);
  const [awards, setAwards] = useState(null);
  const [roundCounts, setRoundCounts] = useState({});

  useEffect(() => {
    if (groupsLoading || !activeGroupId) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroupId, groupsLoading]);

  const loadData = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError('');
      // Game data is read through getGroupData, which checks group membership server-side
      // (P12-1) — the entities themselves are not readable from the browser.
      const res = await base44.functions.invoke('getGroupData', { scope: 'group', group_id: activeGroupId });
      const { sessions: sess = [], rounds = [], results = [] } = res.data;
      const sorted = [...sess].sort(
        (a, b) => new Date(b.session_date || b.created_date) - new Date(a.session_date || a.created_date)
      );
      setSessions(sorted);
      setActiveSession(sorted.find((s) => s.status === 'open') || null);
      // Most recent session that actually has scored rounds → drives the "this session" delta.
      const scoredSessionIds = new Set(results.filter((r) => r.points != null).map((r) => r.session_id));
      const latestSessionId = (sorted.find((s) => scoredSessionIds.has(s.id)) || {}).id || null;
      setStandings(buildStandings(results, {}, latestSessionId));
      const efGames = new Set(rounds.filter((r) => r.everyone_falls).map((r) => r.id));
      setAwards(computeAwardLeaders(results, efGames));
      const counts = {};
      rounds.forEach((r) => { counts[r.session_id] = (counts[r.session_id] || 0) + 1; });
      setRoundCounts(counts);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || err.message || 'Failed to load sessions.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  if (groupsLoading || (loading && activeGroupId)) return <LoadingSpinner showLogo />;
  if (!activeGroupId) return <NoGroupState />;

  const recentClosed = sessions.filter((s) => s.status !== 'open').slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-foreground uppercase tracking-wide">Sessions</h1>
        <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground"
          disabled={refreshing} onClick={() => loadData(true)} aria-label="Refresh">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-center space-y-2">
          <p className="text-sm text-destructive">Couldn't load sessions.</p>
          <p className="text-xs text-muted-foreground break-words">{error}</p>
          <Button size="sm" variant="outline" className="border-border" onClick={() => loadData(true)}>Try Again</Button>
        </div>
      )}

      {activeSession ? (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Active session</p>
          <SessionCard session={activeSession} roundCount={roundCounts[activeSession.id] || 0} />
        </div>
      ) : isArchived ? (
        <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-center">
          <p className="text-sm text-yellow-500 font-medium">This group is archived — read-only.</p>
        </div>
      ) : (
        <Link to="/session/new"
          className="flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg py-4 font-heading font-bold text-lg uppercase tracking-wide hover:bg-primary/90 transition-colors">
          <Plus className="w-5 h-5" />
          Start New Session
        </Link>
      )}

      {/* Standings */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-bold text-foreground">Standings</h2>
          {standings.length > 0 && (
            <span className="text-xs text-muted-foreground">overall score · ▲ this session</span>
          )}
        </div>
        <Leaderboard players={standings.slice(0, 8)} sortBy="total" />
      </div>

      {/* Awards */}
      <AwardsShowcase awards={awards} />

      {/* Recent sessions */}
      {recentClosed.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-lg font-bold text-foreground">Recent</h2>
            <Link to="/history" className="text-xs text-primary flex items-center gap-1 hover:underline">
              All history <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {recentClosed.map((s) => (
            <SessionCard key={s.id} session={s} roundCount={roundCounts[s.id] || 0} />
          ))}
        </div>
      )}

      {sessions.length === 0 && !error && (
        <EmptyState icon="♠" title="No Sessions Yet" description="Start your first whist night to track bids, tricks, and scores." />
      )}
    </div>
  );
}
