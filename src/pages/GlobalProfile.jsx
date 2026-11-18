import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useActiveGroup } from '@/lib/ActiveGroupContext';
import { Globe, ArrowLeft, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import GlobalProfileIcon from '@/components/GlobalProfileIcon';
import StatGrid from '@/components/StatGrid';
import ScoreChart from '@/components/ScoreChart';
import LoadingSpinner from '@/components/LoadingSpinner';
import { formatScore, scoreTone, errorMessage } from '@/lib/format';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import { UserText } from '@/components/UserText';

const EMPTY_STATS = {
  performance: { total_score: 0, avg_score: 0, rounds_played: 0, sessions_played: 0, wins: 0, podiums: 0, win_ratio: 0 },
  strategy: { contract_accuracy: 0, zero_bids: 0, zero_bid_success: 0, zero_bid_success_rate: 0, bid_aggressiveness: 0 },
  awards: { greedy_loss: 0, coward_loss: 0, destroyer_count: 0 },
  timeline: [],
};

export default function GlobalProfile() {
  const { user, isAuthenticated, isLoadingAuth } = useAuth();
  const { loading: groupsLoading } = useActiveGroup();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState(EMPTY_STATS);
  const [groupsBreakdown, setGroupsBreakdown] = useState([]);
  const [totalGroups, setTotalGroups] = useState(0);

  useEffect(() => {
    if (!isLoadingAuth && !groupsLoading) {
      if (isAuthenticated && user) loadGlobalStats();
      else setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoadingAuth, isAuthenticated, user, groupsLoading]);

  const loadGlobalStats = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await base44.functions.invoke('computeGlobalStats', {});
      setStats(res.data);
      setGroupsBreakdown(res.data.groups_breakdown || []);
      setTotalGroups(res.data.total_groups || 0);
    } catch (err) {
      console.error(err);
      setError(errorMessage(err, 'Failed to load stats.'));
    } finally {
      setLoading(false);
    }
  };

  if (isLoadingAuth || groupsLoading || loading) return <LoadingSpinner showLogo />;

  if (!isAuthenticated || !user) {
    return (
      <EmptyState as="h1" icon={Globe} title="Global profile"
        description="Sign in to see your stats across all your whist groups."
        action={<Button asChild><Link to="/login"><LogIn />Sign in</Link></Button>} />
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Link to="/home" className="flex items-center gap-2 min-h-11 -my-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Back to groups</Link>
        <ErrorState title="Couldn't load your global stats" message={error} onRetry={loadGlobalStats} />
      </div>
    );
  }

  if (totalGroups === 0) {
    return (
      <EmptyState as="h1" icon={Globe} title="No groups yet"
        description="Join or create a group to start tracking your stats." />
    );
  }

  const rounds = stats.performance?.rounds_played || 0;

  return (
    <div className="space-y-6">
      <Link to="/home" className="flex items-center gap-2 min-h-11 -my-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Back to groups</Link>

      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
          <GlobalProfileIcon className="w-7 h-7 text-primary" />
        </div>
        <div>
          <h1 className="page-title">Global stats</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Across {totalGroups} group{totalGroups !== 1 ? 's' : ''} · {rounds} round{rounds !== 1 ? 's' : ''} played
          </p>
        </div>
      </div>

      <StatGrid stats={stats} />

      <ScoreChart timeline={stats.timeline} />

      {groupsBreakdown.length > 0 && (
        <div className="space-y-2">
          <h2 className="section-label">Groups breakdown</h2>
          <div className="space-y-2">
            {groupsBreakdown.map((g) => (
              <div key={g.group_id} className="flex items-center justify-between bg-card border border-border rounded-lg p-3">
                <div>
                  <p className="text-sm font-medium text-foreground"><UserText>{g.group_name}</UserText></p>
                  <p className="text-xs text-muted-foreground">
                    {g.rounds_played} round{g.rounds_played !== 1 ? 's' : ''} · {formatScore(g.avg_score)} avg
                  </p>
                </div>
                <span className={`font-heading font-bold ${scoreTone(g.total_score)}`}>
                  {formatScore(g.total_score)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
