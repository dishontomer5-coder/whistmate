import { Link } from 'react-router-dom';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { formatScore, scoreTone } from '@/lib/format';
import EmptyState from '@/components/EmptyState';
import PlayerAvatar from '@/components/PlayerAvatar';
import { Name } from '@/components/UserText';

// players: [{ player_id, player_name, total_score, avg_score, rounds_played, wins }]
// sortBy: 'avg' (default) | 'total'
export default function Leaderboard({ players = [], sortBy = 'avg' }) {
  const metricKey = sortBy === 'total' ? 'total_score' : 'avg_score';
  const sorted = [...players].sort((a, b) => (b[metricKey] ?? 0) - (a[metricKey] ?? 0));

  if (sorted.length === 0) {
    return <EmptyState compact title="No rounds yet" description="Play a session to see standings." />;
  }

  return (
    <div className="space-y-2">
      {sorted.map((player) => {
        const value = player[metricKey] ?? 0;
        // Tied players share a rank (#2, #2, #4): the place of the first row with this value.
        const rank = sorted.findIndex((p) => (p[metricKey] ?? 0) === value) + 1;
        return (
          <Link
            key={player.player_id}
            to={`/player/${player.player_id}`}
            className="flex items-center justify-between bg-secondary rounded-lg p-3 hover:bg-secondary/80 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="font-heading font-bold text-sm text-muted-foreground flex-shrink-0 w-6">
                #{rank}
              </span>
              <PlayerAvatar name={player.player_name} />
              <div className="min-w-0">
                <span className="block text-sm font-medium text-foreground truncate"><Name>{player.player_name}</Name></span>
                <span className="block text-xs text-muted-foreground">
                  {player.rounds_played} round{player.rounds_played !== 1 ? 's' : ''}
                  {player.wins != null ? ` · ${player.wins} win${player.wins !== 1 ? 's' : ''}` : ''}
                  {sortBy === 'total' && player.avg_score != null ? ` · ${formatScore(player.avg_score)} avg` : ''}
                </span>
              </div>
            </div>
            <div className="flex flex-col items-end flex-shrink-0 ml-2">
              <span className={`font-heading font-bold text-base leading-none ${scoreTone(value)}`}>
                {formatScore(value)}
              </span>
              {/* Movement in the latest session: an arrow, green for up and red for down. */}
              {player.session_delta != null && player.session_delta !== 0 && (
                <span className={`mt-1 flex items-center gap-0.5 text-xs font-medium ${player.session_delta > 0 ? 'text-emerald-400' : 'text-negative'}`}
                  title="Change in the latest session">
                  {player.session_delta > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                  {formatScore(player.session_delta)}
                </span>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
