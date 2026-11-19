import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useActiveGroup } from '@/lib/ActiveGroupContext';
import { User, Users, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StatGrid from '@/components/StatGrid';
import ScoreChart from '@/components/ScoreChart';
import NightCards from '@/components/NightCards';
import LoadingSpinner from '@/components/LoadingSpinner';
import { formatScore, formatAvg, scoreTone, errorMessage } from '@/lib/format';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import PlayerAvatar from '@/components/PlayerAvatar';
import { Name, UserText } from '@/components/UserText';
import { AccountSection } from '@/pages/Account';
import BackLink from '@/components/BackLink';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// The Me tab (/profile/global): the signed-in person across all their groups — their
// figures added up, their best and worst night anywhere, a line per group — and, at the
// foot, the account card (name, e-mail, sign out).
export default function GlobalProfile() {
  const { user, isAuthenticated, isLoadingAuth } = useAuth();
  const { loading: groupsLoading, setActiveGroup } = useActiveGroup();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState(null);

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
    } catch (err) {
      console.error(err);
      setError(errorMessage(err, "Couldn't load your stats."));
    } finally {
      setLoading(false);
    }
  };

  // /account lands here with #account: show the account card, which is at the foot.
  const wantsAccount = location.hash === '#account';
  useEffect(() => {
    if (!loading && wantsAccount) document.getElementById('account')?.scrollIntoView();
  }, [loading, wantsAccount]);

  if (isLoadingAuth || groupsLoading || loading) return <LoadingSpinner showLogo />;

  if (!isAuthenticated || !user) {
    return (
      <EmptyState as="h1" icon={User} title="Me"
        description="Sign in to see your stats across all your whist groups."
        action={<Button asChild><Link to="/login"><LogIn />Sign in</Link></Button>} />
    );
  }

  const displayName = user.full_name || String(user.email || '').split('@')[0] || 'Me';
  const totalGroups = stats?.total_groups || 0;
  const rounds = stats?.performance?.rounds_played || 0;
  const groupsBreakdown = stats?.groups_breakdown || [];

  return (
    <div className="space-y-6">
      {/* Opened from the menu ("My stats & account"), often from inside a group: back there. */}
      {location.state?.fromMenu && <BackLink fallback="/home" className="-my-2" />}
      <div className="flex items-center gap-4">
        <PlayerAvatar name={displayName} size="lg" />
        <div className="min-w-0">
          <h1 className="page-title break-words"><Name>{displayName}</Name></h1>
          {stats && totalGroups > 0 && (
            <p className="text-sm text-muted-foreground mt-0.5">
              All groups: <span className={`font-heading font-bold ${scoreTone(stats.performance?.total_score)}`}>{formatScore(stats.performance?.total_score)}</span>
              {' '}in {plural(rounds, 'round')} · {plural(totalGroups, 'group')}
            </p>
          )}
        </div>
      </div>

      {error ? (
        <ErrorState title="Couldn't load your stats" message={error} onRetry={loadGlobalStats} />
      ) : totalGroups === 0 ? (
        <EmptyState compact icon={Users} title="No groups yet"
          description="Create or join a group, and your stats across all of them will show up here."
          action={<Button asChild><Link to="/home">Go to groups</Link></Button>} />
      ) : (
        <>
          {/* A night can be in any group: open that group before its session page. */}
          <NightCards best={stats.best_session} worst={stats.worst_session} onOpen={(night) => night.group_id && setActiveGroup(night.group_id)} />

          <StatGrid stats={stats} allGroups />

          <ScoreChart timeline={stats.timeline} />

          {groupsBreakdown.length > 0 && (
            <div className="space-y-2">
              <h2 className="section-label">By group</h2>
              <div className="space-y-2">
                {groupsBreakdown.map((g) => (
                  <div key={g.group_id} className="flex items-center justify-between gap-3 bg-card border border-border rounded-lg p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground break-words [overflow-wrap:anywhere]"><UserText>{g.group_name}</UserText></p>
                      <p className="text-xs text-muted-foreground">
                        {plural(g.rounds_played, 'round')} · {formatAvg(g.avg_score)} avg
                      </p>
                    </div>
                    <span className={`flex-shrink-0 font-heading font-bold ${scoreTone(g.total_score)}`}>
                      {formatScore(g.total_score)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <AccountSection />
    </div>
  );
}
