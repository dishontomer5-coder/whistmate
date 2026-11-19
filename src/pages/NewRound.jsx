import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Loader2, Check, Users, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import PlayerAvatar from '@/components/PlayerAvatar';
import { Name } from '@/components/UserText';
import { ScoringHelpButton } from '@/components/ScoringHelp';
import BackLink from '@/components/BackLink';
import ArchivedBanner from '@/components/ArchivedBanner';
import { usePageGroup } from '@/lib/ActiveGroupContext';
import { errorMessage } from '@/lib/format';
import { cn } from '@/lib/utils';
import ActionDock, { DockStatus } from '@/components/round/ActionDock';
import { FROM_SESSION } from '@/components/round/session-return';
import { sameTableOrder, startBlocker, nextRoundNumber } from '@/components/round/round-logic';

// Pick the table: exactly four players, then start the round.
//
// The order they are tapped in is the order of the rows on the bidding screen. It does
// not have to be the order of the bidding itself — on the next screen the scorer can start
// from any row and the cursor carries on round the table from there — but the first one
// picked is where the cursor starts, so the screen says who that is.
export default function NewRound() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [session, setSession] = useState(null);
  const [members, setMembers] = useState([]);
  const [roundNumber, setRoundNumber] = useState(1);
  const [selected, setSelected] = useState([]); // player ids, in the order picked
  const [sameTable, setSameTable] = useState([]); // last round's four, moved on by one
  const [submitting, setSubmitting] = useState(false);

  // The group of the session on screen: is it archived, may the caller add players to it.
  const { isAdmin, isArchived: archived, role } = usePageGroup(session?.group_id);
  const roundState = location.state?.fromSession ? FROM_SESSION : undefined;

  const load = useCallback(async () => {
    setLoading(true); setLoadError(''); setNotFound(false);
    try {
      // Membership-checked read — the session with its rounds and results.
      const dataRes = await base44.functions.invoke('getGroupData', { scope: 'session', session_id: sessionId });
      const { session: sess, rounds = [], results = [] } = dataRes.data;

      // A round is already in play: that is the one to carry on with.
      const inPlay = rounds.find((r) => r.status === 'bidding' || r.status === 'playing');
      if (inPlay && sess.status === 'open') {
        navigate(`/round/${inPlay.id}`, { replace: true, state: roundState });
        return;
      }

      const membersRes = await base44.functions.invoke('getGroupMembers', { group_id: sess.group_id });
      const roster = membersRes.data.members || [];
      setSession(sess);
      setMembers(roster);
      setRoundNumber(nextRoundNumber(rounds));

      // The most recent round's table, if all four are still in the group.
      const previous = [...rounds].sort((a, b) => (b.round_number ?? 0) - (a.round_number ?? 0))[0];
      const rosterIds = new Set(roster.map((m) => m.id));
      const order = previous ? sameTableOrder(results.filter((r) => r.game_id === previous.id)) : [];
      setSameTable(order.length === 4 && order.every((pid) => rosterIds.has(pid)) ? order : []);
    } catch (err) {
      setNotFound(err.response?.status === 404);
      setLoadError(errorMessage(err, 'Failed to load the players.'));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  const toggle = (id) => {
    setError('');
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      if (prev.length >= 4) return prev; // four seats
      return [...prev, id];
    });
  };

  const start = async () => {
    if (selected.length !== 4) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await base44.functions.invoke('startRound', { session_id: sessionId, player_ids: selected });
      navigate(`/round/${res.data.round.id}`, { replace: true, state: roundState });
    } catch (err) {
      const openId = err.response?.data?.open_round_id;
      if (openId) { navigate(`/round/${openId}`, { replace: true, state: roundState }); return; }
      setError(errorMessage(err, 'Failed to start round.'));
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner showLogo />;
  if (!session) {
    return notFound ? (
      <EmptyState as="h1" icon={SearchX} title="Session not found" description="It was deleted, or the link is wrong."
        action={<Button asChild variant="outline"><Link to="/history">Back to sessions</Link></Button>} />
    ) : (
      <ErrorState title="Couldn't load the players" message={loadError} onRetry={load} />
    );
  }

  const header = (
    <div className="flex items-center justify-between gap-2">
      <BackLink fallback={`/session/${sessionId}`} className="-ml-1 pl-1" />
      <ScoringHelpButton className="-mr-2" />
    </div>
  );

  // Nothing can be started here: say why instead of offering a table to pick.
  if (archived || session.status !== 'open') {
    return (
      <div className="space-y-4">
        {header}
        <h1 className="page-title">Pick the table</h1>
        {archived
          ? <ArchivedBanner />
          : <p className="text-sm text-muted-foreground">This session is closed — no more rounds can be added to it.</p>}
      </div>
    );
  }

  const nameOf = (id) => members.find((m) => m.id === id)?.player_name || '';
  const blocker = startBlocker({ selected: selected.length, members: members.length });
  const isSameTable = sameTable.length === 4 && sameTable.every((pid, i) => selected[i] === pid);

  return (
    <div className="-mt-4 space-y-3">
      {header}
      <div>
        <h1 className="page-title">Pick the table</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Round {roundNumber}. Tap the 4 players in the order they sit — the first one bids first.
        </p>
      </div>

      {sameTable.length === 4 && (
        <button type="button" onClick={() => { setError(''); setSelected(sameTable); }} aria-pressed={isSameTable}
          className={cn(
            'flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
            isSameTable ? 'border-primary bg-primary/15 text-primary' : 'border-primary/40 bg-primary/5 text-primary hover:bg-primary/10'
          )}>
          <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0">
            Same players as last round — <Name>{nameOf(sameTable[0])}</Name> bids first
          </span>
        </button>
      )}

      <div className="grid grid-cols-2 gap-2">
        {members.map((m) => {
          const idx = selected.indexOf(m.id);
          const picked = idx >= 0;
          return (
            <button key={m.id} type="button" onClick={() => toggle(m.id)} aria-pressed={picked}
              className={cn(
                'relative flex min-h-[52px] min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors',
                picked ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-primary/40'
              )}>
              {/* A picked player shows their place in the order instead of the avatar. */}
              {picked ? (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
                  aria-label={`number ${idx + 1}`}>
                  {idx + 1}
                </span>
              ) : (
                <PlayerAvatar name={m.player_name} size="sm" />
              )}
              <span className="min-w-0 truncate text-sm font-medium text-foreground"><Name>{m.player_name}</Name></span>
              {picked && <Check className="ml-auto h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      {members.length < 4 && (
        <p className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground" data-few-players>
          This group has {members.length === 1 ? '1 player' : `${members.length} players`} — a round needs 4.{' '}
          {isAdmin ? (
            <Link to="/admin" className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-2">Add players</Link>
          ) : role ? (
            <>Ask a group admin to add players or to share the invite link.</>
          ) : null}
        </p>
      )}

      <ActionDock label="Start the round">
        <ErrorState inline message={error} />
        <DockStatus>
          {blocker || <>The bidding starts with <span className="font-medium text-foreground"><Name>{nameOf(selected[0])}</Name></span></>}
        </DockStatus>
        <Button size="lg" className="w-full" disabled={!!blocker || submitting} onClick={start}>
          {submitting ? <><Loader2 className="animate-spin" /> Starting…</> : `Start round (${selected.length}/4)`}
        </Button>
      </ActionDock>
    </div>
  );
}
