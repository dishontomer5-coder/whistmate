import { Link } from 'react-router-dom';
import { CalendarDays, MapPin } from 'lucide-react';
import { formatDate } from '@/lib/format';

// session: Session entity. roundCount optional.
export default function SessionCard({ session, roundCount }) {
  const isOpen = session.status === 'open';
  return (
    <Link
      to={`/session/${session.id}`}
      className="block bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-heading font-bold text-foreground truncate">{session.name || 'Whist Night'}</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase flex-shrink-0 ${
          isOpen ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground'
        }`}>
          {isOpen ? 'Open' : 'Closed'}
        </span>
      </div>
      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <CalendarDays className="w-3.5 h-3.5" />
          {formatDate(session.session_date || session.created_date)}
        </span>
        {session.location ? (
          <span className="flex items-center gap-1 truncate">
            <MapPin className="w-3.5 h-3.5" />
            {session.location}
          </span>
        ) : null}
        {roundCount != null ? (
          <span>{roundCount} round{roundCount !== 1 ? 's' : ''}</span>
        ) : null}
        {session.advanced_rules_enabled ? <span className="text-primary/80">Advanced</span> : null}
      </div>
    </Link>
  );
}
