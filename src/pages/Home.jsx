import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Plus, Play, RefreshCw, ArrowUp, ArrowDown, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Leaderboard, { deltaSessionLabel } from '@/components/Leaderboard';
import AwardsShowcase from '@/components/AwardsShowcase';
import FirstSteps from '@/components/FirstSteps';
import ArchivedBanner from '@/components/ArchivedBanner';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import NoGroupState from '@/components/NoGroupState';
import { ScoringHelpButton } from '@/components/ScoringHelp';
import { sessionOutcomes } from '@/components/SessionCard';
import { Name, UserText } from '@/components/UserText';
import { useActiveGroup } from '@/lib/ActiveGroupContext';
import { buildStandings, computeAwardLeaders } from '@/lib/standings';
import { errorMessage, formatScore, sessionName } from '@/lib/format';

// How many rows the standings show before "Show all".
const STANDINGS_SHOWN = 10;

// The Standings tab — the group's home: the session in progress (or the button that
// starts one), the standings over every session, and the awards. The list of sessions
// has its own tab.
export default function Home() {
  const { activeGroupId, activeGroup, isAdmin, loading: groupsLoading } = useActiveGroup();
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
    // The group can change while a request is on its way (Back into another group): only
    // the answer to the latest request is shown.
    const request = ++latestRequest.current;
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError('');
      // Game data is read through getGroupData, which checks group membership server-side
      // (P12-1) — the entities themselves are not readable from the browser.
      const res = await base44.functions.invoke('getGroupData', { scope: 'group', group_id: activeGroupId });
      const { sessions = [], rounds = [], results = [] } = res.data;
      // A group with no session yet shows its first steps, which count the players.
      let playerCount = null;
      if (sessions.length === 0) {
        const members = await base44.functions.invoke('getGroupMembers', { group_id: activeGroupId }).catch(() => null);
        playerCount = members ? (members.data.members || []).length : null;
      }
      if (request !== latestRequest.current) return;

      const openSession = sessions.find((s) => s.status === 'open') || null;
      const openRounds = openSession ? rounds.filter((r) => r.session_id === openSession.id) : [];
      setData({
        groupId: activeGroupId,
        sessions,
        playerCount,
        openSession,
        roundInPlay: openRounds.find((r) => r.status === 'bidding' || r.status === 'playing') || null,
        scoredRounds: openRounds.filter((r) => r.status === 'complete' || r.status === 'cancelled').length,
        openOutcome: openSession ? sessionOutcomes(results)[openSession.id] || null : null,
        // Wins count closed sessions only, so the standings need the sessions; they also pick
        // the session the small figure beside a total refers to (delta_session on each row).
        standings: buildStandings(results, {}, { sessions }),
        awards: computeAwardLeaders(results, rounds),
      });
    } catch (err) {
      if (request !== latestRequest.current) return;
      console.error(err);
      setError(errorMessage(err, "Couldn't load the standings."));
    } finally {
      if (request === latestRequest.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  if (!groupsLoading && !activeGroupId) return <NoGroupState />;
  // Data of the group shown before (the group can change under this page) is never drawn
  // under the new group's header.
  const current = data?.groupId === activeGroupId ? data : null;
  if (groupsLoading || loading || (!current && !error)) return <LoadingSpinner showLogo />;

  const { sessions = [], standings = [], awards = null, openSession = null } = current || {};
  const isNewGroup = !!current && sessions.length === 0;

  // What the small arrow figure beside a total is: the open session ("tonight") or the
  // last closed one, by name.
  const deltaSession = standings.find((p) => p.delta_session)?.delta_session || null;
  const deltaRecord = deltaSession ? sessions.find((s) => s.id === deltaSession.id) : null;
  const deltaLabel = deltaSessionLabel(deltaSession, deltaRecord ? sessionName(deltaRecord) : null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Standings</h1>
        <div className="flex items-center -my-1 -mr-2">
          <ScoringHelpButton />
          <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-foreground"
            disabled={refreshing} onClick={() => loadData(true)} aria-label="Refresh">
            <RefreshCw className={refreshing ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {isArchived && <ArchivedBanner />}

      {error && <ErrorState title="Couldn't load the standings" message={error} onRetry={() => loadData(true)} />}

      {openSession ? (
        <Link to={`/session/${openSession.id}`}
          className="flex items-center gap-3 rounded-lg border border-primary/60 bg-primary/10 p-4 transition-colors hover:bg-primary/15">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-primary">Session in progress</p>
            <p className="mt-0.5 font-heading font-bold text-foreground truncate"><UserText>{sessionName(openSession)}</UserText></p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {current.roundInPlay
                ? `Round ${current.roundInPlay.round_number} in play`
                : current.scoredRounds > 0 ? `${current.scoredRounds} round${current.scoredRounds !== 1 ? 's' : ''} played` : 'No rounds yet'}
              {current.openOutcome?.leaders.length > 0 && (
                <> · {current.openOutcome.leaders.map((p, i) => <span key={p.player_id}>{i > 0 ? ' & ' : ''}<Name>{p.name}</Name></span>)}
                  {' '}leading {formatScore(current.openOutcome.top)}</>
              )}
            </p>
          </div>
          {!isArchived && (
            <span className="inline-flex h-11 flex-shrink-0 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">
              <Play className="h-4 w-4" aria-hidden="true" /> Resume
            </span>
          )}
        </Link>
      ) : !isArchived && current && !isNewGroup ? (
        <Button asChild size="lg" className="w-full">
          <Link to="/session/new"><Plus /> Start new session</Link>
        </Button>
      ) : null}

      {isNewGroup && !isArchived && (
        isAdmin ? (
          <FirstSteps group={activeGroup} playerCount={current.playerCount} />
        ) : (
          <EmptyState icon={CalendarDays} title="No sessions yet"
            description="Start the first session to track bids, tricks and scores. A round needs four players — a group admin adds them."
            action={<Button asChild size="lg"><Link to="/session/new"><Plus /> Start new session</Link></Button>} />
        )
      )}
      {isNewGroup && isArchived && (
        <EmptyState icon={CalendarDays} title="No sessions" description="This group was archived before a session was played." />
      )}

      {current && !isNewGroup && (
        <div className="space-y-3">
          {/* What the two figures on each row are (the page title already says "Standings"). */}
          {standings.length > 0 && (
            <p className="flex min-w-0 items-center justify-end gap-1 text-xs text-muted-foreground">
              <span className="flex-shrink-0">Total score</span>
              {deltaLabel && (
                <>
                  <span className="flex-shrink-0" aria-hidden="true">·</span>
                  <ArrowUp className="h-3 w-3 flex-shrink-0 text-emerald-400" aria-hidden="true" />
                  <ArrowDown className="-ml-1 h-3 w-3 flex-shrink-0 text-negative" aria-hidden="true" />
                  <UserText className="truncate">{deltaLabel}</UserText>
                </>
              )}
            </p>
          )}
          <Leaderboard players={standings} sortBy="total" limit={STANDINGS_SHOWN} deltaLabel={deltaLabel}
            emptyDescription="Standings appear once the first round is scored." />
        </div>
      )}

      <AwardsShowcase awards={awards} />
    </div>
  );
}
