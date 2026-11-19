import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Users } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useActiveGroup } from '@/lib/ActiveGroupContext';
import { buildStandings } from '@/lib/standings';
import { errorMessage, formatAvg, formatScore, scoreTone } from '@/lib/format';
import LoadingSpinner from '@/components/LoadingSpinner';
import NoGroupState from '@/components/NoGroupState';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import GroupDeletedState, { isGroupDeleted } from '@/components/GroupDeletedState';
import ArchivedBanner from '@/components/ArchivedBanner';
import PlayerAvatar from '@/components/PlayerAvatar';
import { Badge } from '@/components/ui/badge';
import { Name } from '@/components/UserText';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// The Players tab (/profile): the group's players as a list (returning-player-3) — the
// viewer first ("You"), then everyone by total score, each with total, rounds and average
// per round. A row opens that player's page; the viewer's own page is their row.
// Players with no scored round yet come last, by name.
export default function Profile() {
  const { activeGroupId, activeGroup, activeMembership, loading: groupsLoading } = useActiveGroup();
  const [data, setData] = useState(null); // { groupId, rows }
  const [error, setError] = useState('');
  // The page's group was deleted by its admin: say so, with the way to the list of groups.
  const [groupGone, setGroupGone] = useState(false);
  const latestRequest = useRef(0);

  useEffect(() => {
    if (groupsLoading || !activeGroupId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroupId, groupsLoading]);

  const load = async () => {
    const request = ++latestRequest.current;
    try {
      setError(''); setGroupGone(false);
      // Both reads check group membership server-side (P12-1).
      const [groupRes, membersRes] = await Promise.all([
        base44.functions.invoke('getGroupData', { scope: 'group', group_id: activeGroupId }),
        base44.functions.invoke('getGroupMembers', { group_id: activeGroupId }),
      ]);
      if (request !== latestRequest.current) return;
      const { sessions = [], results = [] } = groupRes.data;
      const members = membersRes.data.members || [];
      const standings = buildStandings(results, {}, { sessions });
      const byId = Object.fromEntries(standings.map((p) => [p.player_id, p]));
      // Everyone in the group now, with their figures if they have any; a player who left
      // keeps their place in the standings but is not listed here.
      const rows = members.map((m) => ({
        id: m.id,
        name: m.player_name,
        claimed: !!m.user_id,
        stats: byId[m.id] || null,
      }));
      setData({ groupId: activeGroupId, rows });
    } catch (err) {
      if (request !== latestRequest.current) return;
      if (isGroupDeleted(err)) { setGroupGone(true); return; }
      setError(errorMessage(err, "Couldn't load the players."));
    }
  };

  if (groupGone) return <GroupDeletedState />;
  if (!groupsLoading && !activeGroupId) return <NoGroupState />;
  const current = data?.groupId === activeGroupId ? data : null;
  if (groupsLoading || (!current && !error)) return <LoadingSpinner showLogo />;

  const myId = activeMembership?.member_id || null;
  const rows = [...(current?.rows || [])].sort((a, b) => {
    if (a.id === myId) return -1;
    if (b.id === myId) return 1;
    if (!!a.stats !== !!b.stats) return a.stats ? -1 : 1;
    return (b.stats?.total_score ?? 0) - (a.stats?.total_score ?? 0)
      || String(a.name).localeCompare(String(b.name));
  });

  return (
    <div className="space-y-6">
      <h1 className="page-title">Players</h1>

      {activeGroup?.status === 'archived' && <ArchivedBanner />}

      {error && <ErrorState title="Couldn't load the players" message={error} onRetry={load} />}

      {current && rows.length === 0 && (
        <EmptyState icon={Users} title="No players yet" description="A group admin adds players in the Admin tab." />
      )}

      {rows.length > 0 && (
        <ul className="space-y-2" aria-label="Players">
          {rows.map((p) => {
            const s = p.stats;
            const isMe = p.id === myId;
            return (
              <li key={p.id}>
                <Link to={`/player/${p.id}`}
                  className={`flex min-h-14 items-center gap-3 rounded-lg p-3 transition-colors hover:bg-secondary/80 ${isMe ? 'bg-accent ring-1 ring-inset ring-input/60' : 'bg-secondary'}`}>
                  <PlayerAvatar name={p.name} />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 truncate text-sm font-medium text-foreground"><Name>{p.name}</Name></span>
                      {isMe && <Badge className="flex-shrink-0">You</Badge>}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {s
                        ? `${plural(s.rounds_played, 'round')} · ${formatAvg(s.avg_score)} avg`
                        : 'No rounds yet'}
                      {!p.claimed && ' · no account'}
                    </span>
                  </span>
                  {s && (
                    <span className={`flex-shrink-0 font-heading text-base font-bold ${scoreTone(s.total_score)}`}>
                      {formatScore(s.total_score)}
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
