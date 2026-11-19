import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Plus, RefreshCw, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SessionCard, { sessionOutcomes } from '@/components/SessionCard';
import ArchivedBanner from '@/components/ArchivedBanner';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import NoGroupState from '@/components/NoGroupState';
import { useActiveGroup } from '@/lib/ActiveGroupContext';
import { errorMessage } from '@/lib/format';

const heldAt = (s) => new Date(s.session_date || s.created_date || 0).getTime() || 0;
const createdAt = (s) => new Date(s.created_date || 0).getTime() || 0;

// The Sessions tab: every session of the group — the open one first, then newest first —
// each with who won it and how the viewer did. (The address stays /history.)
export default function History() {
  const { activeGroupId, activeGroup, activeMembership, loading: groupsLoading } = useActiveGroup();
  const isArchived = activeGroup?.status === 'archived';
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const latestRequest = useRef(0);

  useEffect(() => {
    if (groupsLoading || !activeGroupId) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroupId, groupsLoading]);

  const loadData = async (isRefresh = false) => {
    // Only the answer to the latest request is shown (the group can change meanwhile).
    const request = ++latestRequest.current;
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError('');
      // Membership-checked read (P12-1). The results are needed to say who won each session.
      const res = await base44.functions.invoke('getGroupData', { scope: 'group', group_id: activeGroupId });
      if (request !== latestRequest.current) return;
      const { sessions = [], rounds = [], results = [] } = res.data;
      const roundCounts = {};
      rounds.forEach((r) => { roundCounts[r.session_id] = (roundCounts[r.session_id] || 0) + 1; });
      setData({
        groupId: activeGroupId,
        sessions: [...sessions].sort((a, b) => (
          (b.status === 'open') - (a.status === 'open') || heldAt(b) - heldAt(a) || createdAt(b) - createdAt(a)
        )),
        roundCounts,
        outcomes: sessionOutcomes(results),
      });
    } catch (err) {
      if (request !== latestRequest.current) return;
      console.error(err);
      setError(errorMessage(err, "Couldn't load the sessions."));
    } finally {
      if (request === latestRequest.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  if (!groupsLoading && !activeGroupId) return <NoGroupState />;
  // Sessions of the group shown before are never drawn under the new group's header.
  const current = data?.groupId === activeGroupId ? data : null;
  if (groupsLoading || loading || (!current && !error)) return <LoadingSpinner showLogo />;

  const sessions = current?.sessions || [];
  const hasOpenSession = sessions.some((s) => s.status === 'open');
  const startButton = (
    <Button asChild size="lg" className="w-full">
      <Link to="/session/new"><Plus /> Start new session</Link>
    </Button>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Sessions</h1>
        <Button size="icon" variant="ghost" className="-my-1 -mr-2 text-muted-foreground hover:text-foreground" disabled={refreshing} onClick={() => loadData(true)} aria-label="Refresh">
          <RefreshCw className={refreshing ? 'animate-spin' : ''} />
        </Button>
      </div>

      {isArchived && <ArchivedBanner />}

      {error && <ErrorState title="Couldn't load the sessions" message={error} onRetry={() => loadData(true)} />}

      {current && sessions.length === 0 && (
        <EmptyState icon={CalendarDays} title="No sessions yet"
          description={isArchived ? 'This group was archived before a session was played.' : 'A session is one night of whist. Start the first one to track bids, tricks and scores.'}
          action={isArchived ? undefined : <Button asChild size="lg"><Link to="/session/new"><Plus /> Start new session</Link></Button>} />
      )}

      {sessions.length > 0 && (
        <>
          {!hasOpenSession && !isArchived && startButton}
          <div className="space-y-3">
            {sessions.map((s) => (
              <SessionCard key={s.id} session={s} roundCount={current.roundCounts[s.id] || 0}
                outcome={current.outcomes[s.id]} myPlayerId={activeMembership?.member_id} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
