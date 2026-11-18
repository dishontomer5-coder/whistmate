import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useActiveGroup } from '@/lib/ActiveGroupContext';
import { ArrowLeft, MessageSquarePlus, Lock, UserX } from 'lucide-react';
import StatGrid from '@/components/StatGrid';
import ScoreChart from '@/components/ScoreChart';
import TableTalkFeed from '@/components/TableTalkFeed';
import WriteNoteDialog from '@/components/WriteNoteDialog';
import { Button } from '@/components/ui/button';
import { formatScore, formatDate, scoreTone, errorMessage } from '@/lib/format';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import PlayerAvatar from '@/components/PlayerAvatar';
import { Name } from '@/components/UserText';

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
      // Round history comes through getGroupData (membership-checked, P12-1): the player's
      // latest scored rounds plus the round records they belong to.
      const [statsRes, historyRes] = await Promise.all([
        base44.functions.invoke('computePlayerStats', { player_id: id, group_id: activeGroupId }),
        base44.functions.invoke('getGroupData', { scope: 'player', player_id: id }),
      ]);
      if (statsRes.data.error) throw new Error(statsRes.data.error);
      setPlayer(statsRes.data.player);
      setStats(statsRes.data);
      setResults(historyRes.data.results || []);
      const map = {};
      (historyRes.data.rounds || []).forEach((g) => { map[g.id] = g; });
      setGameMap(map);
    } catch (err) {
      console.error(err);
      if (err.response?.status !== 404) setLoadError(errorMessage(err, 'Failed to load player.'));
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingSpinner showLogo />;

  if (loadError) {
    return (
      <div className="space-y-6">
        <Link to="/history" className="flex items-center gap-2 min-h-11 -my-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Back</Link>
        <ErrorState title="Couldn't load this player" message={loadError} onRetry={loadData} />
      </div>
    );
  }

  if (!player) {
    return (
      <EmptyState as="h1" icon={UserX} title="Player not found" description="They were removed, or the link is wrong."
        action={<Button asChild variant="outline"><Link to="/history">Back</Link></Button>} />
    );
  }

  const rounds = stats.performance?.rounds_played || 0;
  const sorted = [...results].sort((a, b) => {
    const ga = gameMap[a.game_id]; const gb = gameMap[b.game_id];
    return new Date(gb?.created_date || 0).getTime() - new Date(ga?.created_date || 0).getTime();
  });

  return (
    <div className="space-y-6">
      <Link to="/history" className="flex items-center gap-2 min-h-11 -my-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Back</Link>

      <div className="flex items-center gap-4">
        <PlayerAvatar name={player.name} size="lg" />
        <div className="min-w-0">
          <h1 className="page-title break-words"><Name>{player.name}</Name></h1>
          <p className="text-sm text-muted-foreground mt-0.5">{rounds} round{rounds !== 1 ? 's' : ''} played</p>
        </div>
      </div>

      <StatGrid stats={stats} />

      <ScoreChart timeline={stats.timeline} />

      {sorted.length === 0 ? (
        <EmptyState compact title="No rounds yet" description="This player hasn't played any rounds." />
      ) : (
        <div>
          <h2 className="section-label mb-2">Round history</h2>
          <div className="space-y-2">
            {sorted.slice(0, 50).map((r) => {
              const g = gameMap[r.game_id];
              return (
                <Link key={r.id} to={g ? `/round/${g.id}` : '#'}
                  className="flex items-center justify-between bg-card border border-border rounded-lg p-3 hover:border-primary/50 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-foreground">Round {g?.round_number ?? '?'}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(g?.created_date)} · bid {r.bid} · took {r.tricks_won}{r.reneged ? ' · reneged' : ''}
                    </p>
                  </div>
                  <span className={`font-heading font-bold ${scoreTone(r.points)}`}>{formatScore(r.points)}</span>
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
          className="w-full">
          {isAuthenticated ? <MessageSquarePlus /> : <Lock />}
          {isAuthenticated ? 'Leave a note' : 'Sign in to leave a note'}
        </Button>
      )}

      <WriteNoteDialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen} targetPlayerId={id} targetPlayerName={player.name} onSubmitted={() => setFeedRefreshKey((k) => k + 1)} />
      <TableTalkFeed playerId={id} refreshKey={feedRefreshKey} />
    </div>
  );
}
