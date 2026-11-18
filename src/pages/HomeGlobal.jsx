import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useActiveGroup } from '@/lib/ActiveGroupContext';
import { Plus, KeyRound, Users, Globe, LogIn, ChevronRight, Trophy, Target, Spade } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/LoadingSpinner';
import CreateGroupDialog from '@/components/groups/CreateGroupDialog';
import JoinGroupDialog from '@/components/groups/JoinGroupDialog';
import { formatScore, scoreTone } from '@/lib/format';
import EmptyState from '@/components/EmptyState';
import { UserText } from '@/components/UserText';

export default function HomeGlobal() {
  const { user, isAuthenticated, isLoadingAuth } = useAuth();
  const { myGroups, loading: groupsLoading, setActiveGroup, refreshGroups } = useActiveGroup();
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [globalStats, setGlobalStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoadingAuth && !groupsLoading && isAuthenticated && user && myGroups.length > 0) {
      loadGlobalStats();
    } else if (!isLoadingAuth && (!isAuthenticated || myGroups.length === 0)) {
      setStatsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoadingAuth, isAuthenticated, user, groupsLoading, myGroups.length]);

  const loadGlobalStats = async () => {
    try {
      setStatsLoading(true);
      const res = await base44.functions.invoke('computeGlobalStats', {});
      setGlobalStats(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setStatsLoading(false);
    }
  };

  const handleGroupClick = (groupId) => { setActiveGroup(groupId); navigate('/'); };
  const handleCreated = async (group) => { await refreshGroups(); setActiveGroup(group.id); navigate('/'); };
  const handleJoined = async (group) => { await refreshGroups(); setActiveGroup(group.id); navigate('/'); };

  if (isLoadingAuth || (isAuthenticated && groupsLoading)) return <LoadingSpinner showLogo />;

  if (!isAuthenticated || !user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[75vh] text-center px-4">
        <div className="w-28 h-28 rounded-3xl bg-primary text-primary-foreground flex items-center justify-center text-6xl font-bold mb-6 ring-1 ring-primary/30 shadow-[0_0_60px_-15px] shadow-primary/40">
          ♠
        </div>
        <h1 className="font-heading text-3xl font-bold text-foreground">WhistMate</h1>
        <p className="font-heading text-xs text-primary uppercase tracking-[0.12em] mt-2">Israeli Whist · Companion & Scorekeeper</p>

        <div className="space-y-3 mt-8 mb-10 text-left">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0"><Spade className="w-4 h-4 text-primary" /></div>
            <p className="text-sm text-muted-foreground">Auto-score every bid and trick — no math at the table</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0"><Target className="w-4 h-4 text-primary" /></div>
            <p className="text-sm text-muted-foreground">Track contracts, 0-bids, and up/down tables</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0"><Trophy className="w-4 h-4 text-primary" /></div>
            <p className="text-sm text-muted-foreground">Standings, awards, and bragging rights</p>
          </div>
        </div>

        <Button asChild size="lg" className="w-full max-w-xs">
          <Link to="/login"><LogIn /> Sign in / Sign up</Link>
        </Button>
        <p className="text-xs text-muted-foreground mt-4">
          New here? <Link to="/register" className="inline-flex min-h-11 items-center text-primary hover:underline">Create an account</Link>
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          <Link to="/about" className="inline-flex min-h-11 items-center hover:text-foreground hover:underline">About, contact & privacy</Link>
        </p>
      </div>
    );
  }

  const statsByGroup = {};
  if (globalStats?.groups_breakdown) {
    globalStats.groups_breakdown.forEach((g) => { statsByGroup[g.group_id] = g; });
  }

  return (
    <div className="space-y-6">
      <h1 className="page-title">Your groups</h1>

      {myGroups.length > 0 && !statsLoading && globalStats && (
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-primary" />
            <span className="section-label">All-time stats</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-xs text-muted-foreground">Total score</p>
              <p className={`font-heading text-lg font-bold ${scoreTone(globalStats.performance?.total_score)}`}>
                {formatScore(globalStats.performance?.total_score || 0)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Rounds</p>
              <p className="font-heading text-lg font-bold text-foreground">{globalStats.performance?.rounds_played || 0}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Groups</p>
              <p className="font-heading text-lg font-bold text-foreground">{globalStats.total_groups || 0}</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Button onClick={() => setShowCreate(true)} className="flex-1 px-2">
          <Plus /> Create group
        </Button>
        <Button onClick={() => setShowJoin(true)} variant="outline" className="flex-1 px-2">
          <KeyRound /> Join group
        </Button>
      </div>

      {myGroups.length === 0 ? (
        <EmptyState icon={Users} title="No groups yet"
          description="Create a group for your whist circle, or join an existing one with an invite code." />
      ) : (
        <div className="space-y-3">
          {myGroups.map((m) => {
            const stats = statsByGroup[m.group_id];
            return (
              <button key={m.group_id} onClick={() => handleGroupClick(m.group_id)}
                className="w-full flex items-center gap-3 bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition-colors text-left">
                <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <span dir="auto" className="font-heading text-xl font-bold text-primary">{Array.from((m.group_name || '?').trim())[0]?.toUpperCase() || '?'}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    <UserText>{m.group_name}</UserText>
                    {m.group?.status === 'archived' && (
                      <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-500 font-medium uppercase">Archived</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {m.role}{stats ? ` · ${stats.rounds_played} round${stats.rounds_played !== 1 ? 's' : ''}` : ''}
                  </p>
                </div>
                {stats && (
                  <span className={`font-heading font-bold text-sm flex-shrink-0 ${scoreTone(stats.total_score)}`}>
                    {formatScore(stats.total_score)}
                  </span>
                )}
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      <CreateGroupDialog open={showCreate} onOpenChange={setShowCreate} onCreated={handleCreated} />
      <JoinGroupDialog open={showJoin} onOpenChange={setShowJoin} onJoined={handleJoined} />
    </div>
  );
}
