import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SessionCard from '@/components/SessionCard';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import NoGroupState from '@/components/NoGroupState';
import { useActiveGroup } from '@/lib/ActiveGroupContext';

export default function History() {
  const { activeGroupId, loading: groupsLoading } = useActiveGroup();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [roundCounts, setRoundCounts] = useState({});

  useEffect(() => {
    if (groupsLoading || !activeGroupId) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroupId, groupsLoading]);

  const loadData = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      // Membership-checked read (P12-1). The session log only needs round counts, so skip results.
      const res = await base44.functions.invoke('getGroupData', { scope: 'group', group_id: activeGroupId, include_results: false });
      const { sessions: sess = [], rounds = [] } = res.data;
      setSessions([...sess].sort((a, b) => new Date(b.session_date || b.created_date) - new Date(a.session_date || a.created_date)));
      const counts = {};
      rounds.forEach((r) => { counts[r.session_id] = (counts[r.session_id] || 0) + 1; });
      setRoundCounts(counts);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  if (groupsLoading || (loading && activeGroupId)) return <LoadingSpinner showLogo />;
  if (!activeGroupId) return <NoGroupState />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-foreground uppercase tracking-wide">History</h1>
        <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground" disabled={refreshing} onClick={() => loadData(true)} aria-label="Refresh">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {sessions.length === 0 ? (
        <EmptyState icon="♠" title="No Sessions Yet" description="Past whist nights will show up here." />
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <SessionCard key={s.id} session={s} roundCount={roundCounts[s.id] || 0} />
          ))}
        </div>
      )}
    </div>
  );
}
