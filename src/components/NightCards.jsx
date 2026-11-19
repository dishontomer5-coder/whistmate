import { Link } from 'react-router-dom';
import { Sunrise, CloudRain } from 'lucide-react';
import { formatDate, formatScore, scoreTone, sessionName } from '@/lib/format';
import { ordinal } from '@/components/SessionCard';
import { UserText } from '@/components/UserText';

// A player's best and worst night: the closed sessions with their highest and lowest
// total (computePlayerStats / computeGlobalStats → best_session, worst_session).
//
//   best, worst   { session_id, name, session_date, total, rank, players, group_name? } or null.
//                 Both null — no closed session yet — draws nothing. The same session in
//                 both (only one night closed) is shown once.
//   onOpen        optional; called with the night before its session page opens — the Me
//                 page uses it to open the night's group first.
function NightCard({ icon: Icon, label, night, onOpen }) {
  return (
    <Link
      to={`/session/${night.session_id}`}
      onClick={() => onOpen?.(night)}
      className="block bg-card border border-border rounded-lg p-3 hover:border-primary/50 transition-colors"
    >
      <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" /> {label}
      </p>
      <p className={`mt-1.5 font-heading font-bold text-2xl ${scoreTone(night.total)}`}>{formatScore(night.total)}</p>
      <p className="mt-1 text-sm font-medium text-foreground truncate">
        <UserText>{sessionName({ name: night.name, session_date: night.session_date })}</UserText>
      </p>
      <p className="text-xs text-muted-foreground">
        {formatDate(night.session_date)}
        {night.rank ? ` · ${ordinal(night.rank)} of ${night.players}` : ''}
      </p>
      {night.group_name && (
        <p className="text-xs text-muted-foreground truncate"><UserText>{night.group_name}</UserText></p>
      )}
    </Link>
  );
}

export default function NightCards({ best, worst, onOpen }) {
  if (!best && !worst) return null;
  const sameNight = best && worst && best.session_id === worst.session_id;
  return (
    <div className={`grid gap-3 ${sameNight ? 'grid-cols-1' : 'grid-cols-2'}`}>
      {best && <NightCard icon={Sunrise} label={sameNight ? 'Only night so far' : 'Best night'} night={best} onOpen={onOpen} />}
      {worst && !sameNight && <NightCard icon={CloudRain} label="Worst night" night={worst} onOpen={onOpen} />}
    </div>
  );
}
