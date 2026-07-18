import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useActiveGroup } from '@/lib/ActiveGroupContext';
import { ArrowLeft, MessageSquarePlus, Lock } from 'lucide-react';
import StatGrid from '@/components/StatGrid';
import TableTalkFeed from '@/components/TableTalkFeed';
import WriteNoteDialog from '@/components/WriteNoteDialog';
import { Button } from '@/components/ui/button';
import { formatScore, formatDate } from '@/lib/format';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';

const EMPTY_STATS = {
  performance: { total_score: 0, avg_score: 0, rounds_played: 0, sessions_played: 0, wins: 0, podiums: 0, win_ratio: 0 },
  strategy: { contract_accuracy: 0, zero_bids: 0, zero_bid_success: 0, zero_bid_success_rate: 0, bid_aggressiveness: 0 },
  awards: { greedy_loss: 0, coward_loss: 0, destroyer_count: 0 },
  timeline: [],
};

export default function PlayerProfile() {
  const { id } = useParams();
  const { isAuthenticated } = useAuth();
  const { activeGroupId, activeGroup } = useActiveGroup();
  const isArchived = activeGroup?.status === 'archived';
  const [loading, setLoading] = useState(true);
  const [player, setPlayer] = useState(null);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [results, setResults] = useState([]);
  const [gameMap, setGameMap] = useState({});
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [feedRefreshKey, setFeedRefreshKey] = useState(0);

  useEffect(() => {
    if (!activeGroupId) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, activeGroupId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setLoadError('');
      const [statsRes, rr] = await Promise.all([
        base44.functions.invoke('computePlayerStats', { player_id: id, group_id: activeGroupId }),
        base44.entities.RoundResult.filter({ player_id: id }, '-created_date', 2000),
      ]);
      if (statsRes.data.error) throw new Error(statsRes.data.error);
      setPlayer(statsRes.data.player);
      setStats(statsRes.data);
      const scoped = rr.filter((r) => r.points != null);
      setResults(scoped);
      const gameIds = [...new Set(scoped.map((r) => r.game_id))];
      const games = await Promise.all(gameIds.map((gid) => base44.entities.Game.get(gid).catch(() => null)));
      const map = {};
      games.forEach((g) => { if (g) map[g.id] = g; });
      setGameMap(map);
    } catch (err) {
      console.error(err);
      if (err.response?.status !== 404) setLoadError(err.response?.data?.error || err.message || 'Failed to load player.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingSpinner showLogo />;

  if (loadError) {
    return (
      <div className="space-y-6">
        <Link to="/history" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Back</Link>
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-center space-y-2">
          <p className="text-sm text-destructive">Couldn't load this player.</p>
          <p className="text-xs text-muted-foreground break-words">{loadError}</p>
          <Button size="sm" variant="outline" className="border-border" onClick={loadData}>Try Again</Button>
        </div>
      </div>
    );
  }

  if (!player) {
    return <EmptyState icon="♠" title="Player Not Found" action={<Link to="/history" className="text-primary">Back</Link>} />;
  }

  const rounds = stats.performance?.rounds_played || 0;
  const sorted = [...results].sort((a, b) => {
    const ga = gameMap[a.game_id]; const gb = gameMap[b.game_id];
    return new Date(gb?.created_date || 0).getTime() - new Date(ga?.created_date || 0).getTime();
  });

  return (
    <div className="space-y-6">
      <Link to="/history" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Back</Link>

      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
          <span className="font-heading text-xl font-bold text-primary">{player.name.charAt(0).toUpperCase()}</span>
        </div>
        <div>
          <h1 className="font-heading text-3xl font-bold text-foreground uppercase tracking-wide">{player.name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{rounds} round{rounds !== 1 ? 's' : ''} played</p>
        </div>
      </div>

      <StatGrid stats={stats} />

      {sorted.length === 0 ? (
        <EmptyState icon="♠" title="No Rounds Yet" description="This player hasn't played any rounds." />
      ) : (
        <div>
          <h2 className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">Round History</h2>
          <div className="space-y-2">
            {sorted.slice(0, 50).map((r) => {
              const g = gameMap[r.game_id];
              return (
                <Link key={r.id} to={g ? `/round/${g.id}` : '#'}
                  className="flex items-center justify-between bg-card border border-border rounded-lg p-3 hover:border-primary/50 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-foreground">Round {g?.round_number ?? '?'}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(g?.created_date)} · bid {r.bid} · won {r.tricks_won}{r.reneged ? ' · reneged' : ''}
                    </p>
                  </div>
                  <span className={`font-heading font-bold ${(r.points ?? 0) >= 0 ? 'text-primary' : 'text-destructive'}`}>{formatScore(r.points)}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {isArchived ? (
        <p className="text-xs text-muted-foreground text-center">This group is archived — new notes are disabled.</p>
      ) : (
        <Button
          onClick={() => { if (!isAuthenticated) base44.auth.redirectToLogin(window.location.href); else setNoteDialogOpen(true); }}
          variant={isAuthenticated ? 'default' : 'outline'}
          className={`w-full ${isAuthenticated ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border-border'}`}>
          {isAuthenticated ? <MessageSquarePlus className="w-4 h-4 mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
          {isAuthenticated ? 'Leave a Note' : 'Sign In to Leave a Note'}
        </Button>
      )}

      <WriteNoteDialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen} targetPlayerId={id} targetPlayerName={player.name} onSubmitted={() => setFeedRefreshKey((k) => k + 1)} />
      <TableTalkFeed playerId={id} refreshKey={feedRefreshKey} />
    </div>
  );
}
