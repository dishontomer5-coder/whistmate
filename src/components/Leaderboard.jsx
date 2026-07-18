import { Link } from 'react-router-dom';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { formatScore } from '@/lib/format';
import EmptyState from '@/components/EmptyState';

const AVATAR_COLORS = [
  'bg-amber-500/20 text-amber-400',
  'bg-emerald-500/20 text-emerald-400',
  'bg-blue-500/20 text-blue-400',
  'bg-purple-500/20 text-purple-400',
  'bg-rose-500/20 text-rose-400',
  'bg-cyan-500/20 text-cyan-400',
];

function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// players: [{ player_id, player_name, total_score, avg_score, rounds_played, wins }]
// sortBy: 'avg' (default) | 'total'
export default function Leaderboard({ players = [], sortBy = 'avg' }) {
  const metricKey = sortBy === 'total' ? 'total_score' : 'avg_score';
  const sorted = [...players].sort((a, b) => (b[metricKey] ?? 0) - (a[metricKey] ?? 0));

  if (sorted.length === 0) {
    return <EmptyState icon="♠" title="No Rounds Yet" description="Play a session to see standings." />;
  }

  return (
    <div className="space-y-2">
      {sorted.map((player, index) => {
        const value = player[metricKey] ?? 0;
        const isPositive = value >= 0;
        const avatarColor = getAvatarColor(player.player_name || '?');
        return (
          <Link
            key={player.player_id}
            to={`/player/${player.player_id}`}
            className="flex items-center justify-between bg-secondary rounded-lg p-3 hover:bg-secondary/80 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="font-heading font-bold text-sm text-muted-foreground flex-shrink-0 w-6">
                #{index + 1}
              </span>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center font-heading font-bold text-sm flex-shrink-0 ${avatarColor}`}>
                {(player.player_name || '?').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <span className="block text-sm font-medium text-foreground truncate">{player.player_name}</span>
                <span className="block text-xs text-muted-foreground">
                  {player.rounds_played} round{player.rounds_played !== 1 ? 's' : ''}
                  {player.wins != null ? ` · ${player.wins} win${player.wins !== 1 ? 's' : ''}` : ''}
                  {sortBy === 'total' && player.avg_score != null ? ` · ${formatScore(player.avg_score)} avg` : ''}
                </span>
              </div>
            </div>
            <div className="flex flex-col items-end flex-shrink-0 ml-2">
              <span className={`font-heading font-bold text-base leading-none ${isPositive ? 'text-primary' : 'text-destructive'}`}>
                {formatScore(value)}
              </span>
              {player.session_delta != null && player.session_delta !== 0 && (
                <span className={`mt-0.5 flex items-center gap-0.5 text-[10px] font-medium ${player.session_delta > 0 ? 'text-emerald-400' : 'text-rose-400'}`}
                  title="Change in the latest session">
                  {player.session_delta > 0 ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
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
