import { Link } from 'react-router-dom';
import { CalendarDays, MapPin, Trophy } from 'lucide-react';
import { formatDate, formatScore, scoreTone, sessionName } from '@/lib/format';
import { rankSession } from '@/lib/whist-stats';
import { SCORING_METHOD_LABEL } from '@/lib/scoring-help';
import { Name, UserText } from '@/components/UserText';
import { Badge } from '@/components/ui/badge';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th", 11 -> "11th". */
export function ordinal(n) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
}

/**
 * How every session stands, from RoundResult rows (unscored rows are ignored).
 * @returns {{ [session_id]: { ranking: Map<player_id, {total, rank}>, leaders: [{ player_id, name }], top: number } }}
 *          leaders = everyone in first place (a tie is shared); top = their total.
 */
export function sessionOutcomes(results = []) {
  const bySession = {};
  const names = {};
  for (const r of results) {
    if (r.points == null || !r.session_id) continue;
    (bySession[r.session_id] ||= []).push(r);
    names[r.player_id] ||= r.player_name;
  }
  const outcomes = {};
  for (const [sessionId, rows] of Object.entries(bySession)) {
    const ranking = rankSession(rows);
    const leaders = [];
    let top = 0;
    ranking.forEach(({ total, rank }, playerId) => {
      if (rank !== 1) return;
      leaders.push({ player_id: playerId, name: names[playerId] || 'Player' });
      top = total;
    });
    outcomes[sessionId] = { ranking, leaders, top };
  }
  return outcomes;
}

// One session in a list: when and where it was, how it was scored, and how it ended.
//
//   session      the Session record.
//   roundCount   optional number of rounds.
//   outcome      optional — sessionOutcomes(results)[session.id]. A closed session then names
//                its winner; an open one, who is leading. A session is won only once it is closed.
//   myPlayerId   optional — the viewer's own member id, to add their place and score.
//
// Only the OPEN session carries a status badge: every other one is closed, and saying so
// on each card says nothing.
export default function SessionCard({ session, roundCount, outcome, myPlayerId }) {
  const isOpen = session.status === 'open';
  const mine = myPlayerId && outcome ? outcome.ranking.get(myPlayerId) : null;
  // A session in which no round counted (every scored round was everyone-falls) has no
  // winner and nobody leading it: getGroupData marks it no_winner.
  const noWinner = !!session.no_winner && !!outcome;
  const hasResult = !noWinner && !!outcome && outcome.leaders.length > 0;

  return (
    <Link
      to={`/session/${session.id}`}
      className="block bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 font-heading font-bold text-foreground break-words [overflow-wrap:anywhere]"><UserText>{sessionName(session)}</UserText></span>
        {isOpen && <Badge className="flex-shrink-0">Open</Badge>}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1 whitespace-nowrap">
          <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
          {formatDate(session.session_date || session.created_date)}
        </span>
        {session.location ? (
          <span className="flex items-center gap-1 min-w-0">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
            <UserText className="truncate">{session.location}</UserText>
          </span>
        ) : null}
        {roundCount != null ? (
          <span className="whitespace-nowrap">{plural(roundCount, 'round')}</span>
        ) : null}
        <span className="whitespace-nowrap">{SCORING_METHOD_LABEL[session.scoring_method] || SCORING_METHOD_LABEL.classic}</span>
        {session.advanced_rules_enabled ? <span className="whitespace-nowrap">Advanced</span> : null}
      </div>
      {noWinner && (
        <p className="mt-3 pt-3 border-t border-border text-sm text-muted-foreground">
          {isOpen ? 'Nobody leading — no round counted yet' : 'No winner — no round counted'}
        </p>
      )}
      {hasResult && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mt-3 pt-3 border-t border-border text-sm">
          <span className="flex items-center gap-1.5 min-w-0">
            {isOpen
              ? <span className="text-muted-foreground flex-shrink-0">Leading:</span>
              : <><Trophy className="w-4 h-4 text-foreground flex-shrink-0" aria-hidden="true" /><span className="sr-only">Won by </span></>}
            <span className="font-medium text-foreground truncate">
              {outcome.leaders.map((p, i) => (
                <span key={p.player_id}>{i > 0 ? ' & ' : ''}<Name>{p.name}</Name></span>
              ))}
            </span>
            <span className={`font-heading font-bold flex-shrink-0 ${scoreTone(outcome.top)}`}>{formatScore(outcome.top)}</span>
          </span>
          {/* The viewer's own result. In first place the line beside it already has the score. */}
          {mine && (mine.rank === 1 ? (
            <span className="font-medium text-foreground whitespace-nowrap">{isOpen ? 'You lead' : 'You won'}</span>
          ) : (
            <span className="text-muted-foreground whitespace-nowrap">
              You: {ordinal(mine.rank)} · <span className={`font-heading font-bold ${scoreTone(mine.total)}`}>{formatScore(mine.total)}</span>
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
