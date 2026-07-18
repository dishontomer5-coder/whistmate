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
import { formatScore } from '@/lib/format';

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
      setError(err.response?.data?.error || err.message || 'Failed to load stats.');
    } finally {
      setLoading(false);
    }
  };

  if (isLoadingAuth || groupsLoading || loading) return <LoadingSpinner showLogo />;

  if (!isAuthenticated || !user) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-secondary border border-border flex items-center justify-center mb-5">
          <Globe className="w-8 h-8 text-muted-foreground" />
        </div>
        <h1 className="font-heading text-xl font-bold text-foreground uppercase tracking-wide mb-2">Global Profile</h1>
        <p className="text-sm text-muted-foreground max-w-xs mb-6">Sign in to view your aggregated stats across all your whist groups.</p>
        <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90"><Link to="/login"><LogIn className="w-4 h-4 mr-1" />Sign In</Link></Button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Link to="/home" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Back to Groups</Link>
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-center space-y-2">
          <p className="text-sm text-destructive">Couldn't load your global stats.</p>
          <p className="text-xs text-muted-foreground break-words">{error}</p>
          <Button size="sm" variant="outline" className="border-border" onClick={loadGlobalStats}>Try Again</Button>
        </div>
      </div>
    );
  }

  if (totalGroups === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-secondary border border-border flex items-center justify-center mb-5">
          <Globe className="w-8 h-8 text-muted-foreground" />
        </div>
        <h1 className="font-heading text-xl font-bold text-foreground uppercase tracking-wide mb-2">No Groups Yet</h1>
        <p className="text-sm text-muted-foreground max-w-xs mb-6">Join or create a group to start tracking your stats.</p>
      </div>
    );
  }

  const rounds = stats.performance?.rounds_played || 0;

  return (
    <div className="space-y-6">
      <Link to="/home" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Back to Groups</Link>

      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
          <GlobalProfileIcon className="w-7 h-7 text-primary" />
        </div>
        <div>
          <h1 className="font-heading text-3xl font-bold text-foreground uppercase tracking-wide">Global Stats</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Across {totalGroups} group{totalGroups !== 1 ? 's' : ''} · {rounds} round{rounds !== 1 ? 's' : ''} played
          </p>
        </div>
      </div>

      <StatGrid stats={stats} />

      <ScoreChart timeline={stats.timeline} />

      {groupsBreakdown.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Groups Breakdown</h2>
          <div className="space-y-2">
            {groupsBreakdown.map((g) => (
              <div key={g.group_id} className="flex items-center justify-between bg-card border border-border rounded-lg p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{g.group_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {g.rounds_played} round{g.rounds_played !== 1 ? 's' : ''} · {formatScore(g.avg_score)} avg
                  </p>
                </div>
                <span className={`font-heading font-bold ${(g.total_score || 0) >= 0 ? 'text-primary' : 'text-destructive'}`}>
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
