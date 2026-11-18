import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Plus, RefreshCw, ArrowRight, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SessionCard from '@/components/SessionCard';
import Leaderboard from '@/components/Leaderboard';
import AwardsShowcase from '@/components/AwardsShowcase';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import NoGroupState from '@/components/NoGroupState';
import { useActiveGroup } from '@/lib/ActiveGroupContext';
import { buildStandings, computeAwardLeaders } from '@/lib/standings';
import { errorMessage } from '@/lib/format';

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
      setError(errorMessage(err, 'Failed to load sessions.'));
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
        <h1 className="page-title">Sessions</h1>
        <Button size="icon" variant="ghost" className="-my-1 -mr-2 text-muted-foreground hover:text-foreground"
          disabled={refreshing} onClick={() => loadData(true)} aria-label="Refresh">
          <RefreshCw className={refreshing ? 'animate-spin' : ''} />
        </Button>
      </div>

      {error && <ErrorState title="Couldn't load sessions" message={error} onRetry={() => loadData(true)} />}

      {activeSession ? (
        <div className="space-y-2">
          <p className="section-label">Active session</p>
          <SessionCard session={activeSession} roundCount={roundCounts[activeSession.id] || 0} />
        </div>
      ) : isArchived ? (
        <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-center">
          <p className="text-sm text-yellow-500 font-medium">This group is archived — read-only.</p>
        </div>
      ) : (
        <Button asChild size="lg" className="w-full">
          <Link to="/session/new"><Plus /> Start new session</Link>
        </Button>
      )}

      {/* Standings */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Standings</h2>
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
            <h2 className="section-title">Recent</h2>
            <Link to="/history" className="text-xs text-primary flex items-center gap-1 min-h-11 hover:underline">
              All history <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {recentClosed.map((s) => (
            <SessionCard key={s.id} session={s} roundCount={roundCounts[s.id] || 0} />
          ))}
        </div>
      )}

      {sessions.length === 0 && !error && (
        <EmptyState icon={CalendarDays} title="No sessions yet" description="Start your first session to track bids, tricks and scores." />
      )}
    </div>
  );
}
