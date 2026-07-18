import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useActiveGroup } from '@/lib/ActiveGroupContext';
import { User, LogIn, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import StatGrid from '@/components/StatGrid';
import TableTalkFeed from '@/components/TableTalkFeed';
import LoadingSpinner from '@/components/LoadingSpinner';
import NoGroupState from '@/components/NoGroupState';

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
      setStatsErrorMsg(err.response?.data?.error || err.message || '');
    } finally {
      setLoading(false);
    }
  };

  const goToPlayer = (playerId) => { if (playerId && playerId !== 'none') navigate(`/player/${playerId}`); };

  if (isLoadingAuth || groupsLoading || (loading && activeGroupId)) return <LoadingSpinner showLogo />;

  if (!isAuthenticated || !user) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-secondary border border-border flex items-center justify-center mb-5">
          <User className="w-8 h-8 text-muted-foreground" />
        </div>
        <h1 className="font-heading text-xl font-bold text-foreground uppercase tracking-wide mb-2">Your Profile</h1>
        <p className="text-sm text-muted-foreground max-w-xs mb-6">Sign in to view your dashboard, track your whist stats, and see what other players say about you.</p>
        <div className="flex gap-3">
          <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90"><Link to="/login"><LogIn className="w-4 h-4 mr-1" />Sign In</Link></Button>
          <Button asChild variant="outline" className="border-border"><Link to="/register">Sign Up</Link></Button>
        </div>
      </div>
    );
  }

  if (!activeGroupId) return <NoGroupState />;

  if (!player) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-secondary border border-border flex items-center justify-center mb-5">
          <Users className="w-8 h-8 text-muted-foreground" />
        </div>
        <h1 className="font-heading text-xl font-bold text-foreground uppercase tracking-wide mb-2">No Player Profile</h1>
        <p className="text-sm text-muted-foreground max-w-xs mb-6">You don't have a player profile in this group yet. Contact a group admin to add you.</p>
      </div>
    );
  }

  const rounds = stats.performance?.rounds_played || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
          <span className="font-heading text-xl font-bold text-primary">{player.name.charAt(0).toUpperCase()}</span>
        </div>
        <div>
          <h1 className="font-heading text-3xl font-bold text-foreground uppercase tracking-wide">{player.name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{rounds} round{rounds !== 1 ? 's' : ''} played</p>
        </div>
      </div>

      {statsError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-center space-y-2">
          <p className="text-sm text-destructive">Couldn't load your stats.</p>
          {statsErrorMsg && <p className="text-xs text-muted-foreground break-words">{statsErrorMsg}</p>}
          <Button size="sm" variant="outline" className="border-border" onClick={loadProfile}>Try Again</Button>
        </div>
      ) : (
        <StatGrid stats={stats} />
      )}

      {allPlayers.length > 0 && (
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> View Another Player
          </label>
          <Select value="none" onValueChange={goToPlayer}>
            <SelectTrigger className="bg-card border-border"><SelectValue placeholder="Select a player to view" /></SelectTrigger>
            <SelectContent>
              {allPlayers.map(m => (
                <SelectItem key={m.id} value={m.id}>{m.player_name}{m.id === player.id ? ' (You)' : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <TableTalkFeed playerId={player.id} />
    </div>
  );
}
