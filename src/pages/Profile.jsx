import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useActiveGroup } from '@/lib/ActiveGroupContext';
import { User, LogIn, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import StatGrid from '@/components/StatGrid';
import ScoreChart from '@/components/ScoreChart';
import TableTalkFeed from '@/components/TableTalkFeed';
import LoadingSpinner from '@/components/LoadingSpinner';
import NoGroupState from '@/components/NoGroupState';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import PlayerAvatar from '@/components/PlayerAvatar';
import { Name } from '@/components/UserText';
import { errorMessage } from '@/lib/format';

const EMPTY_STATS = {
  performance: { total_score: 0, avg_score: 0, rounds_played: 0, sessions_played: 0, wins: 0, podiums: 0, win_ratio: 0 },
  strategy: { contract_accuracy: 0, zero_bids: 0, zero_bid_success: 0, zero_bid_success_rate: 0, bid_aggressiveness: 0 },
  awards: { greedy_loss: 0, coward_loss: 0, destroyer_count: 0 },
  timeline: [],
};

export default function Profile() {
  const { user, isAuthenticated, isLoadingAuth } = useAuth();
  const { activeGroupId, activeMembership, loading: groupsLoading } = useActiveGroup();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [player, setPlayer] = useState(null);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [statsError, setStatsError] = useState(false);
  const [statsErrorMsg, setStatsErrorMsg] = useState('');
  const [allPlayers, setAllPlayers] = useState([]);

  useEffect(() => {
    if (!isLoadingAuth && !groupsLoading) {
      if (isAuthenticated && user && activeGroupId) loadProfile();
      else setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoadingAuth, isAuthenticated, user, activeGroupId, groupsLoading, activeMembership?.member_id]);

  const loadProfile = async () => {
    try {
      setLoading(true);
      setStatsError(false);
      const membersRes = await base44.functions.invoke('getGroupMembers', { group_id: activeGroupId });
      const members = membersRes.data.members || [];
      setAllPlayers(members.sort((a, b) => a.player_name.localeCompare(b.player_name)));

      if (!activeMembership?.member_id) { setPlayer(null); setLoading(false); return; }
      setPlayer({ id: activeMembership.member_id, player_name: activeMembership.player_name, name: activeMembership.player_name });
      const statsRes = await base44.functions.invoke('computePlayerStats', { player_id: activeMembership.member_id, group_id: activeGroupId });
      setStats(statsRes.data);
    } catch (err) {
      console.error(err);
      setStatsError(true);
      setStatsErrorMsg(errorMessage(err, ''));
    } finally {
      setLoading(false);
    }
  };

  const goToPlayer = (playerId) => { if (playerId && playerId !== 'none') navigate(`/player/${playerId}`); };

  if (isLoadingAuth || groupsLoading || (loading && activeGroupId)) return <LoadingSpinner showLogo />;

  if (!isAuthenticated || !user) {
    return (
      <EmptyState as="h1" icon={User} title="Your profile"
        description="Sign in to see your whist stats and what other players say about you."
        action={
          <div className="flex gap-3">
            <Button asChild><Link to="/login"><LogIn />Sign in</Link></Button>
            <Button asChild variant="outline"><Link to="/register">Sign up</Link></Button>
          </div>
        } />
    );
  }

  if (!activeGroupId) return <NoGroupState />;

  if (!player) {
    return (
      <EmptyState as="h1" icon={Users} title="No player profile"
        description="You don't have a player profile in this group yet. Ask a group admin to add you." />
    );
  }

  const rounds = stats.performance?.rounds_played || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <PlayerAvatar name={player.name} size="lg" />
        <div className="min-w-0">
          <h1 className="page-title break-words"><Name>{player.name}</Name></h1>
          <p className="text-sm text-muted-foreground mt-0.5">{rounds} round{rounds !== 1 ? 's' : ''} played</p>
        </div>
      </div>

      {statsError ? (
        <ErrorState title="Couldn't load your stats" message={statsErrorMsg} onRetry={loadProfile} />
      ) : (
        <>
          <StatGrid stats={stats} />
          <ScoreChart timeline={stats.timeline} />
        </>
      )}

      {allPlayers.length > 0 && (
        <div className="space-y-2">
          <label className="section-label flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> View another player
          </label>
          <Select value="none" onValueChange={goToPlayer}>
            <SelectTrigger aria-label="View another player"><SelectValue placeholder="Select a player to view" /></SelectTrigger>
            <SelectContent>
              {allPlayers.map(m => (
                <SelectItem key={m.id} value={m.id}><Name>{m.player_name}</Name>{m.id === player.id ? ' (you)' : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <TableTalkFeed playerId={player.id} />
    </div>
  );
}
