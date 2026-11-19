import { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate, useNavigationType, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useActiveGroup, usePageGroup } from '@/lib/ActiveGroupContext';
import { MessageSquarePlus, UserX, LogOut, ChevronRight } from 'lucide-react';
import StatGrid from '@/components/StatGrid';
import ScoreChart from '@/components/ScoreChart';
import NightCards from '@/components/NightCards';
import { HeldAwards } from '@/components/AwardsShowcase';
import TableTalkFeed from '@/components/TableTalkFeed';
import WriteNoteDialog from '@/components/WriteNoteDialog';
import BackLink from '@/components/BackLink';
import ArchivedBanner from '@/components/ArchivedBanner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ordinal } from '@/components/SessionCard';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { formatScore, formatDate, scoreTone, sessionName, errorMessage } from '@/lib/format';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import PlayerAvatar from '@/components/PlayerAvatar';
import { Name, UserText } from '@/components/UserText';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// How many rows of round history are on screen at first, and how many each "Show more" adds.
const HISTORY_STEP = 20;

// The address /player/:id — any player of a group, by id.
export default function PlayerProfile() {
  const { id } = useParams();
  return <PlayerView playerId={id} />;
}

// One player's page (/player/:id), reached from the Players list (/profile) or any name.
// Top to bottom:
//   back link · name and headline figures · awards held · best and worst session · the
//   figures · the chart · Table talk with "Leave a note" at its head · round history,
//   grouped by session · on the viewer's own page, "Leave this group" at the very bottom.
// On ANOTHER player's page the headline and every tile also show the viewer's own value
// ("You: 62%"), so two players compare without a second screen (returning-player-4).
//
//   playerId   the GroupMember id. The player's group comes from the loaded record, not
//              from the group last opened (a link can lead into any of the user's groups).
export function PlayerView({ playerId }) {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const { refreshGroups } = useActiveGroup();
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(null); // { playerId, player, stats, history }
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [roster, setRoster] = useState(null); // { groupId, members }
  const [mine, setMine] = useState(null); // { memberId, stats } — the viewer's own figures, to compare
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [feedRefreshKey, setFeedRefreshKey] = useState(0);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState('');
  const latestRequest = useRef(0);

  // Only what was loaded for the player in the address is drawn.
  const current = view?.playerId === playerId ? view : null;
  const player = current?.player || null;
  const { group, membership, isAdmin, isArchived } = usePageGroup(player?.group_id);
  const groupId = player?.group_id || null;

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  const loadData = async () => {
    const request = ++latestRequest.current;
    try {
      setLoading(true);
      setLoadError('');
      setNotFound(false);
      // Both reads find the player's group themselves and check that the caller belongs to
      // it (P12-1): the figures, and the latest scored rounds with their rounds and sessions.
      const [statsRes, historyRes] = await Promise.all([
        base44.functions.invoke('computePlayerStats', { player_id: playerId }),
        base44.functions.invoke('getGroupData', { scope: 'player', player_id: playerId }),
      ]);
      if (request !== latestRequest.current) return; // an answer for a player no longer on screen
      setView({ playerId, player: statsRes.data.player, stats: statsRes.data, history: historyRes.data });
    } catch (err) {
      if (request !== latestRequest.current) return;
      const status = err.response?.status;
      if (status === 404) setNotFound(true);
      // Not (or no longer) in the player's group — e.g. Back after leaving it: the same clean
      // way out a non-member gets from the app shell, not an error screen (qa-tester-6).
      else if (status === 403) {
        refreshGroups();
        navigate('/home', { replace: true, state: { notice: "That page isn't available — you're not in its group." } });
      } else {
        console.error(err);
        setLoadError(errorMessage(err, "Couldn't load this player."));
      }
    } finally {
      if (request === latestRequest.current) setLoading(false);
    }
  };

  // The viewer's own figures in this group, to show beside another player's.
  const myMemberId = membership?.member_id || null;
  useEffect(() => {
    if (!myMemberId || myMemberId === player?.id || mine?.memberId === myMemberId) return;
    let cancelled = false;
    base44.functions.invoke('computePlayerStats', { player_id: myMemberId })
      .then((res) => { if (!cancelled) setMine({ memberId: myMemberId, stats: res.data }); })
      .catch(() => {}); // without it the page simply shows no comparison
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myMemberId, player?.id]);

  // The group's players (to know whether the viewer is its only admin).
  useEffect(() => {
    if (!groupId || roster?.groupId === groupId) return;
    let cancelled = false;
    base44.functions.invoke('getGroupMembers', { group_id: groupId })
      .then((res) => { if (!cancelled) setRoster({ groupId, members: res.data.members || [] }); })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  // Opened from a note (Activity): land on the notes, not on the top of the page. The
  // note itself scrolls into view once the notes have loaded (TableTalkCard).
  const cameForNotes = location.hash === '#table-talk' && navigationType !== 'POP';
  const highlightNoteId = location.state?.noteId || null;
  useEffect(() => {
    if (current && cameForNotes) document.getElementById('table-talk')?.scrollIntoView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!current, cameForNotes]);

  const backLink = <BackLink fallback="/profile" className="-my-2" />;

  if (loading || (!current && !notFound && !loadError)) return <LoadingSpinner showLogo />;

  if (notFound) {
    return (
      <EmptyState as="h1" icon={UserX} title="Player not found" description="They were removed from the group, or the link is wrong."
        action={<Button asChild variant="outline"><Link to="/profile">Go to players</Link></Button>} />
    );
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        {backLink}
        <ErrorState title="Couldn't load this player" message={loadError} onRetry={loadData} />
      </div>
    );
  }

  const { stats, history } = current;
  const perf = stats.performance || {};
  const rounds = perf.rounds_played || 0;
  const myPlayerId = membership?.member_id || null;
  const isMe = !!myPlayerId && myPlayerId === player.id;
  const members = roster?.groupId === groupId ? roster.members : [];
  const myStats = !isMe && mine?.memberId === myPlayerId ? mine.stats : null;
  const myPerf = myStats?.performance || null;

  // The last admin with an account cannot leave: the group would have nobody to run it.
  const onlyAdmin = isMe && isAdmin && roster?.groupId === groupId
    && !members.some((m) => m.id !== player.id && m.role === 'admin' && m.user_id);

  const leaveGroup = async () => {
    try {
      setLeaving(true);
      setLeaveError('');
      await base44.functions.invoke('removeMember', { group_id: groupId, member_id: player.id });
      toast({ title: `You left ${group?.name || 'the group'}` });
      navigate('/home', { replace: true });
      refreshGroups();
    } catch (err) {
      setLeaveError(errorMessage(err, "Couldn't leave the group."));
      setLeaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {backLink}

      {isArchived && <ArchivedBanner />}

      <div className="flex items-start gap-4">
        <PlayerAvatar name={player.name} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="page-title break-words [overflow-wrap:anywhere]"><Name>{player.name}</Name>{isMe && <span className="font-normal text-muted-foreground"> (you)</span>}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {rounds === 0 ? 'No rounds yet' : (
              <>
                <span className={`font-heading font-bold ${scoreTone(perf.total_score)}`}>{formatScore(perf.total_score)}</span>
                {' '}in {plural(rounds, 'round')}
                {perf.sessions_played > 0 ? ` · ${plural(perf.wins || 0, 'win')} in ${plural(perf.sessions_played, 'session')}` : ''}
              </>
            )}
          </p>
          {myPerf && (
            <p className="text-xs text-muted-foreground mt-0.5">
              You: <span className={`font-heading font-bold ${scoreTone(myPerf.total_score)}`}>{formatScore(myPerf.total_score)}</span>
              {' '}in {plural(myPerf.rounds_played || 0, 'round')}
              {myPerf.sessions_played > 0 ? ` · ${plural(myPerf.wins || 0, 'win')} in ${plural(myPerf.sessions_played, 'session')}` : ''}
            </p>
          )}
          {!player.user_id && <p className="text-xs text-muted-foreground mt-0.5">Unclaimed player — no account yet</p>}
        </div>
      </div>

      <HeldAwards held={stats.awards?.held} groupAwards={stats.group_awards} playerId={player.id} />

      <NightCards best={stats.best_session} worst={stats.worst_session} />

      <StatGrid stats={stats} compare={myStats} />

      <ScoreChart timeline={stats.timeline} />

      <TableTalkFeed
        playerId={player.id}
        refreshKey={feedRefreshKey}
        isGroupAdmin={isAdmin}
        readOnly={isArchived}
        highlightNoteId={highlightNoteId}
        emptyDescription={isMe ? 'Notes other players leave about you will show up here.' : isArchived ? 'Nobody left a note about this player.' : 'Be the first to leave a note about this player.'}
        action={!isMe && !isArchived && (
          <Button variant="outline" onClick={() => setNoteDialogOpen(true)}>
            <MessageSquarePlus /> Leave a note
          </Button>
        )}
      />

      <RoundHistory key={player.id} history={history} nights={stats.sessions} />

      {/* Leaving is rare and final, so it sits at the foot of the viewer's own page, away
          from the figures (returning-player-10, visual-designer-13). */}
      {isMe && (
        <section aria-labelledby="membership-heading" className="space-y-2 rounded-lg border border-border p-4">
          <h2 id="membership-heading" className="section-label">Membership</h2>
          <p className="text-sm text-muted-foreground">
            Your rounds stay in the group's standings under your player name if you leave.
          </p>
          <Button variant="outline" className="w-full text-negative hover:text-negative"
            onClick={() => { setLeaveError(''); setLeaveOpen(true); }}>
            <LogOut /> Leave this group
          </Button>
        </section>
      )}

      <WriteNoteDialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen} groupId={groupId}
        targetPlayerId={player.id} targetPlayerName={player.name} onSubmitted={() => setFeedRefreshKey((k) => k + 1)} />

      <ConfirmDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title={<>Leave <Name>{group?.name || 'this group'}</Name>?</>}
        description={onlyAdmin
          ? 'You are the only admin of this group. Make another member an admin first (Admin tab), then you can leave.'
          : <>
            {rounds > 0
              ? <>Your {plural(rounds, 'round')} and scores stay in the group under the name <Name>{player.name}</Name>, no longer linked to your account.</>
              : 'You will be removed from the group.'}
            {!isArchived && ' To come back, open the group’s invite link again.'}
          </>}
        confirmLabel="Leave group"
        destructive
        busy={leaving}
        confirmDisabled={onlyAdmin}
        onConfirm={leaveGroup}
      >
        <ErrorState inline message={leaveError} />
      </ConfirmDialog>
    </div>
  );
}

// The player's scored rounds, newest first, under the session each was played in.
//   history  getGroupData scope "player": { results, rounds, sessions, total_rows, limit }
//            — results are the latest `limit` rows out of total_rows.
//   nights   computePlayerStats → sessions: the player's total and place in each session.
// Never a silent cut: 20 rows at first, "Show more" for the rest, and a line that says
// how many are on screen out of how many there are.
function RoundHistory({ history, nights = [] }) {
  const [shown, setShown] = useState(HISTORY_STEP);
  const results = history?.results || [];
  const totalRows = history?.total_rows ?? results.length;

  if (results.length === 0) {
    return (
      <section className="space-y-2">
        <h2 className="section-label">Round history</h2>
        <EmptyState compact title="No rounds yet" description="Scored rounds will be listed here, session by session." />
      </section>
    );
  }

  const roundById = {};
  (history.rounds || []).forEach((g) => { roundById[g.id] = g; });
  const sessionById = history.sessions || {};
  const nightById = {};
  nights.forEach((n) => { nightById[n.session_id] = n; });

  // The rows arrive newest first. They are grouped under their session in that order, and
  // inside a session listed from the last round to the first.
  const groups = [];
  const groupBySession = {};
  results.slice(0, shown).forEach((row) => {
    let group = groupBySession[row.session_id];
    if (!group) {
      group = { sessionId: row.session_id, rows: [] };
      groupBySession[row.session_id] = group;
      groups.push(group);
    }
    group.rows.push(row);
  });
  groups.forEach((g) => g.rows.sort((a, b) => (roundById[b.game_id]?.round_number ?? 0) - (roundById[a.game_id]?.round_number ?? 0)));

  const onScreen = Math.min(shown, results.length);
  const more = results.length - onScreen;

  return (
    <section className="space-y-3">
      <h2 className="section-label">Round history</h2>
      {groups.map(({ sessionId, rows }) => {
        const session = sessionById[sessionId];
        const night = nightById[sessionId];
        return (
          <div key={sessionId} className="space-y-2">
            <Link to={`/session/${sessionId}`}
              className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-1 hover:bg-secondary/60 transition-colors">
              <span className="min-w-0">
                <span className="block text-sm font-heading font-bold text-foreground truncate">
                  <UserText>{session ? sessionName(session) : 'Session'}</UserText>
                </span>
                <span className="block text-xs text-muted-foreground">
                  {formatDate(session?.session_date)}
                  {session?.status === 'open' ? ' · open' : ''}
                  {night && session?.status === 'closed' && !night.no_winner ? ` · ${ordinal(night.rank)} of ${night.players}` : ''}
                  {night?.no_winner && session?.status === 'closed' ? ' · no round counted' : ''}
                </span>
              </span>
              <span className="flex flex-shrink-0 items-center gap-1">
                {night && <span className={`text-sm font-heading font-bold ${scoreTone(night.total)}`}>{formatScore(night.total)}</span>}
                <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </span>
            </Link>
            {rows.map((r) => {
              const round = roundById[r.game_id];
              const body = (
                <>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">Round {round?.round_number ?? '?'}</span>
                    <span className="block text-xs text-muted-foreground">
                      bid {r.bid} · took {r.tricks_won}{r.reneged ? ' · reneged' : ''}{round?.everyone_falls ? ' · everyone fell' : ''}
                    </span>
                  </span>
                  <span className={`flex-shrink-0 font-heading font-bold ${scoreTone(r.points)}`}>{formatScore(r.points)}</span>
                </>
              );
              const rowClass = 'flex items-center justify-between gap-3 bg-card border border-border rounded-lg p-3';
              return round
                ? <Link key={r.id} to={`/round/${round.id}`} className={`${rowClass} hover:border-primary/50 transition-colors`}>{body}</Link>
                : <div key={r.id} className={rowClass}>{body}</div>;
            })}
          </div>
        );
      })}

      <p className="text-xs text-muted-foreground text-center" role="status">
        Showing {onScreen === totalRows ? `all ${plural(totalRows, 'round')}` : `the latest ${onScreen} of ${plural(totalRows, 'round')}`}
        {more === 0 && results.length < totalRows ? ' — older rounds are in their sessions.' : ''}
      </p>
      {more > 0 && (
        <Button variant="outline" className="w-full" onClick={() => setShown((n) => n + HISTORY_STEP)}>
          Show {Math.min(more, HISTORY_STEP)} more
        </Button>
      )}
    </section>
  );
}
