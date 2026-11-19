import { Link } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, badgeVariants } from '@/components/ui/badge';
import TableBadge from '@/components/TableBadge';
import { Suit } from '@/components/Suit';
import { Name } from '@/components/UserText';
import { CARD_ORDER_LABEL } from '@/lib/scoring-help';
import { formatScore, scoreTone } from '@/lib/format';
import { cn } from '@/lib/utils';
import { RENEGE_LABEL } from './TrickRows';
import { FROM_SESSION } from './session-return';

// One round as the session page and the round page show it: its number, the table state,
// the trump record, and each player's line — "bid 4 · took 4" and the points.
//
// Everything that a newcomer may not know opens "How scoring works" at the right place:
// the UP / DOWN badge, the "Everyone fell" badge and a player's "Renege −100" mark.
// `onHelp(section)` is called with 'updown' | 'everyone-falls' | 'renege'.

// "Everyone fell" — the round was cancelled because nobody made their bid. A neutral
// outline: it is not good news, and gold is kept for the one primary action.
export function EveryoneFellBadge({ onClick }) {
  const classes = cn(badgeVariants(), 'relative h-6 shrink-0');
  if (!onClick) return <Badge className="h-6 shrink-0">Everyone fell</Badge>;
  return (
    <button type="button" onClick={onClick} aria-label="Everyone fell: nobody made their bid, so the round scores 0. How scoring works"
      className={cn(classes, "after:absolute after:-inset-x-1 after:-inset-y-2.5 after:content-[''] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground")}>
      Everyone fell
    </button>
  );
}

// "Trump ♥ Hearts · Maya · Ace high" — who won the trump, the suit, and the card order of
// an advanced session; "No trump · Dan" when the call was no trump. When no trump was
// recorded (the table marks it only when it wants to), a scored round says so —
// `showMissing` — so the gap does not read as lost data (returning-player-1); a round
// still in play shows nothing.
export function TrumpLine({ round, players = [], className, showMissing = false }) {
  if (!round?.trump_suit) {
    return showMissing ? (
      <span className={cn('text-xs text-muted-foreground', className)} data-trump-line="none">Trump not recorded</span>
    ) : null;
  }
  const winner = players.find((p) => p.player_id === round.highest_bidder_player_id)?.player_name;
  return (
    <span className={cn('text-xs text-muted-foreground', className)} data-trump-line>
      {round.trump_suit === 'notrump' ? null : 'Trump '}<Suit suit={round.trump_suit} label />
      {winner ? <> · <span className="font-medium text-foreground"><Name>{winner}</Name></span></> : null}
      {round.hierarchy ? <> · <span className="whitespace-nowrap">{CARD_ORDER_LABEL[round.hierarchy] || round.hierarchy}</span></> : null}
    </span>
  );
}

// The per-player lines of a scored round, in seat order. With `linkPlayers` each name
// opens that player's page. The trump winner's line carries the suit (`trumpOwnerId`,
// `trump`); the line is not moved for it.
export function ResultLines({ results, onHelp, size = 'sm', linkPlayers = false, trumpOwnerId = null, trump = null }) {
  return (
    <ul className={size === 'lg' ? 'space-y-1.5' : 'space-y-1'}>
      {results.map((r) => (
        <li key={r.id} className={cn(
          'flex items-center justify-between gap-2 text-sm',
          size === 'lg' && 'min-h-11 rounded-lg border border-border bg-card px-3 py-2'
        )}>
          <span className="flex min-w-0 items-center gap-1.5 text-foreground">
            {linkPlayers ? (
              <Link to={`/player/${r.player_id}`} className="-my-2 flex min-h-11 min-w-11 items-center underline decoration-muted-foreground/50 underline-offset-4 hover:decoration-foreground">
                <span className="truncate"><Name>{r.player_name}</Name></span>
              </Link>
            ) : <span className="truncate"><Name>{r.player_name}</Name></span>}
            {trump && trumpOwnerId === r.player_id && (
              <span className="shrink-0 text-xs" data-trump-mark title="Won the trump"><span className="sr-only">won the trump: </span><Suit suit={trump} /></span>
            )}
            {r.reneged ? (
              onHelp ? (
                <button type="button" onClick={() => onHelp('renege')}
                  aria-label={`${r.player_name} reneged: ${RENEGE_LABEL}. How scoring works`}
                  className="relative shrink-0 whitespace-nowrap rounded-full bg-destructive/15 px-1.5 text-xs font-medium text-negative after:absolute after:-inset-x-1 after:-inset-y-3.5 after:content-[''] hover:bg-destructive/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
                  {RENEGE_LABEL}
                </button>
              ) : <span className="shrink-0 whitespace-nowrap text-xs text-negative">{RENEGE_LABEL}</span>
            ) : null}
          </span>
          <span className="flex shrink-0 items-center gap-3">
            <span className="whitespace-nowrap text-xs text-muted-foreground">bid {r.bid} · took {r.tricks_won}</span>
            <span className={cn('w-12 text-right font-heading font-bold', scoreTone(r.points))}>{formatScore(r.points)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// A round on the session page.
//
//   round, results   the Game record and its RoundResult rows in bidding order
//   label            a small label above the number ("Last round")
//   canEdit          the caller may change a scored round: one tap opens the editor
//   onDiscard        offered on a round that is still in play ("Discard round")
//   showEntryLink    a round in play links to its entry screen — unless the page already
//                    has a "Resume round" button for it (one way in, not two)
//   onHelp           see above
export default function RoundCard({ round, results = [], label, canEdit = false, onDiscard, discarding = false, showEntryLink = true, onHelp, className }) {
  const inPlay = round.status === 'bidding' || round.status === 'playing';
  const cancelled = round.status === 'cancelled' || round.everyone_falls;
  return (
    <section aria-label={`Round ${round.round_number}`} data-round-card={round.round_number}
      className={cn('rounded-lg border border-border bg-card p-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="whitespace-nowrap font-heading font-bold text-foreground">
          {label ? <><span className="section-label mr-1.5 font-body">{label}</span>{' '}</> : null}
          Round {round.round_number}
        </h3>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <TableBadge state={round.table_state} total={round.total_bids ?? undefined}
            onClick={onHelp ? () => onHelp('updown') : undefined} />
          {cancelled && <EveryoneFellBadge onClick={onHelp ? () => onHelp('everyone-falls') : undefined} />}
          {inPlay && (
            <Badge className="h-6">{round.status === 'bidding' ? 'Bidding' : 'In play'}</Badge>
          )}
        </div>
      </div>
      <TrumpLine round={round} players={results} className="mt-0.5 block" showMissing={!inPlay} />

      {inPlay ? (
        <>
          {/* Who is at the table, in bidding order, with the bids once they are locked. */}
          <p className="mt-2 text-sm text-muted-foreground" data-round-players>
            {results.map((r, i) => (
              <span key={r.id} className="whitespace-nowrap">
                {i > 0 ? ' · ' : ''}
                <span className="text-foreground"><Name>{r.player_name}</Name></span>
                {r.bid != null ? ` ${r.bid}` : ''}
              </span>
            ))}
          </p>
          <div className="-mb-2 mt-1 flex flex-wrap items-center justify-between gap-x-4">
            {showEntryLink ? (
              <Link to={`/round/${round.id}`} state={FROM_SESSION}
                className="inline-flex min-h-11 items-center text-sm font-medium text-foreground underline underline-offset-2">
                {round.status === 'bidding' ? 'Enter the bids' : 'Enter the results'} →
              </Link>
            ) : <span />}
            {onDiscard && (
              <button type="button" onClick={() => onDiscard(round)} disabled={discarding}
                className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-negative disabled:opacity-50">
                {discarding ? 'Discarding…' : 'Discard round'}
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="mt-2">
            <ResultLines results={results} onHelp={onHelp}
              trumpOwnerId={round.trump_suit ? round.highest_bidder_player_id : null} trump={round.trump_suit} />
          </div>
          {canEdit && (
            <div className="mt-3 flex justify-end">
              <Button asChild variant="outline" size="sm">
                <Link to={`/round/${round.id}?edit=1`} state={{ ...FROM_SESSION, editFromSession: true }}>
                  <Pencil /> Edit round
                </Link>
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
