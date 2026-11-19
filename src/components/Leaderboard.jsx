import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUp, ArrowDown, Trophy } from 'lucide-react';
import { formatScore, scoreTone } from '@/lib/format';
import { useActiveGroup } from '@/lib/ActiveGroupContext';
import { Button } from '@/components/ui/button';
import EmptyState from '@/components/EmptyState';
import PlayerAvatar from '@/components/PlayerAvatar';
import { Name } from '@/components/UserText';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** What the small figure beside a total refers to: "tonight" while a session is open, otherwise that session's name. */
export function deltaSessionLabel(deltaSession, fallbackName) {
  if (!deltaSession) return null;
  if (deltaSession.status === 'open') return 'tonight';
  return deltaSession.name || fallbackName || 'the last session';
}

// A standings list. `players` are the rows of buildStandings() (src/lib/standings.js):
//   { player_id, player_name, total_score, avg_score, rounds_played, rank, gap_to_leader,
//     wins, leading, session_delta, delta_session }
//
// It draws two kinds of table from the same rows:
//   · a group's standings over many sessions — each row says how many sessions the player
//     has won and, below the leader, how far behind they are; the small arrow figure is
//     the player's score in `delta_session` (the caller names that session in a legend);
//   · one session's own standings (no row has a delta_session) — nobody has "wins" here:
//     while the session is open the top player is "Leading", once it is closed "Winner".
//
// sortBy:     'total' | 'avg' (default) — the figure shown on the right.
// limit:      show only the first `limit` rows, with a "Show all" button for the rest.
// deltaLabel: what to call delta_session when announcing the small figure (default: see
//             deltaSessionLabel).
// emptyDescription: the line under "No rounds yet".
export default function Leaderboard({ players = [], sortBy = 'avg', limit, deltaLabel, emptyDescription = 'Standings appear once a round is scored.' }) {
  const { activeMembership } = useActiveGroup();
  const [showAll, setShowAll] = useState(false);
  const metricKey = sortBy === 'total' ? 'total_score' : 'avg_score';
  const sorted = [...players].sort((a, b) => (b[metricKey] ?? 0) - (a[metricKey] ?? 0));

  if (sorted.length === 0) {
    return <EmptyState compact title="No rounds yet" description={emptyDescription} />;
  }

  const singleSession = sorted.every((p) => !p.delta_session);
  const byTotal = sortBy === 'total';
  const figureLabel = deltaLabel || deltaSessionLabel(sorted[0].delta_session);
  const cut = limit && !showAll && sorted.length > limit;
  const visible = cut ? sorted.slice(0, limit) : sorted;

  return (
    <div className="space-y-2">
      {visible.map((player) => {
        const value = player[metricKey] ?? 0;
        // Tied players share a rank (#2, #2, #4). buildStandings ranks by total; any other
        // order is ranked here: the place of the first row with the same figure.
        const rank = byTotal && player.rank != null
          ? player.rank
          : sorted.findIndex((p) => (p[metricKey] ?? 0) === value) + 1;
        const isMe = !!activeMembership && player.player_id === activeMembership.member_id;
        const gap = byTotal ? player.gap_to_leader : null;
        const delta = player.session_delta;

        const facts = [];
        if (gap > 0) facts.push(`${gap} behind`);
        if (!singleSession && player.wins != null) facts.push(plural(player.wins, 'win'));
        if (byTotal && player.avg_score != null) facts.push(`${formatScore(Math.round(player.avg_score * 10) / 10)} avg`);
        const rounds = plural(player.rounds_played ?? 0, 'round');

        return (
          <Link
            key={player.player_id}
            to={`/player/${player.player_id}`}
            className={`flex items-center justify-between rounded-lg p-3 transition-colors hover:bg-secondary/80 ${
              isMe ? 'bg-secondary ring-1 ring-inset ring-primary/40' : 'bg-secondary'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="font-heading font-bold text-sm text-muted-foreground flex-shrink-0 w-6">
                #{rank}
              </span>
              <PlayerAvatar name={player.player_name} />
              <div className="min-w-0">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium text-foreground truncate"><Name>{player.player_name}</Name></span>
                  {isMe && <span className="flex-shrink-0 text-xs text-primary">You</span>}
                  {/* One session's own table: the top player leads while it is open and has won once it is closed. */}
                  {singleSession && player.leading && (
                    <span className="flex-shrink-0 rounded-full border border-primary/50 px-1.5 text-xs font-medium text-primary">Leading</span>
                  )}
                  {singleSession && !player.leading && player.wins > 0 && (
                    <span className="flex flex-shrink-0 items-center gap-1 rounded-full bg-primary/20 px-1.5 text-xs font-medium text-primary">
                      <Trophy className="h-3 w-3" aria-hidden="true" /> Winner
                    </span>
                  )}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {facts.join(' · ')}
                  {/* The round count is the least telling fact: on a phone it gives way to the others. */}
                  <span className={facts.length ? 'max-[419px]:hidden' : ''}>{facts.length ? ' · ' : ''}{rounds}</span>
                </span>
              </div>
            </div>
            <div className="flex flex-col items-end flex-shrink-0 ml-2">
              <span className={`font-heading font-bold text-base leading-none ${scoreTone(value)}`}>
                {formatScore(value)}
              </span>
              {/* The player's score in the session named by the legend: an arrow, green up, red down. */}
              {delta != null && delta !== 0 && (
                <span className={`mt-1 flex items-center gap-0.5 text-xs font-medium ${delta > 0 ? 'text-emerald-400' : 'text-negative'}`}>
                  {delta > 0 ? <ArrowUp className="w-3 h-3" aria-hidden="true" /> : <ArrowDown className="w-3 h-3" aria-hidden="true" />}
                  {figureLabel && <span className="sr-only">{figureLabel}: </span>}
                  {formatScore(delta)}
                </span>
              )}
            </div>
          </Link>
        );
      })}
      {cut && (
        <Button variant="outline" className="w-full" onClick={() => setShowAll(true)}>
          Show all {sorted.length} players
        </Button>
      )}
    </div>
  );
}
