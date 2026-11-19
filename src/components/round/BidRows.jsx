import { useRef } from 'react';
import { Suit, SUIT_LABEL } from '@/components/Suit';
import { Name } from '@/components/UserText';
import { cn } from '@/lib/utils';
import { PHASE } from './RoundChrome';
import { dockScrollMargins, useRowsInView } from './ActionDock';

// The four players of a round with their bids, in bidding order, and at the end of each
// row the trump mark: tap it to record that this player won the trump.
//
// The app cannot work the trump winner out by itself — equal bids are settled by suit at
// the table, in an auction WhistMate never sees — so the table's decision is recorded, and
// any of the four may be marked.
//
//   players       [{ player_id, player_name }] in bidding order
//   bids          the four values in the same order (null = not entered)
//   focus         { field: 'bid' | 'trump', index } — which row the pad is entering, or
//                 that the trump keys are showing
//   trumpOwnerId  the player marked as the trump winner (or null), `trump` their suit
//   trumpRequired the session's advanced rules are on: every round records a trump
//   tiedIds       players tied on the top bid while nobody is marked: their marks are
//                 pointed out, because the screen asks who won the auction
//
// A row is two buttons side by side — the row itself (select it for the pad) and its
// trump mark — never a button inside a button.
export default function BidRows({ players, bids, focus, onSelect, trumpOwnerId, trump, onPickTrumpOwner, trumpRequired, tiedIds = [] }) {
  const blockRef = useRef(null);
  const rowRefs = useRef([]);
  const activeIndex = focus.field === 'bid' ? focus.index : -1;

  // Keep the rows on screen: on a short phone the dock would cover the lower ones.
  useRowsInView(() => [blockRef.current, rowRefs.current[activeIndex]], activeIndex);

  return (
    <div className="space-y-1.5">
      <p className="section-label pr-1 text-right" id="trump-winner-caption">
        Trump winner{trumpRequired ? '' : ' (optional)'}
      </p>
      <div ref={blockRef} style={dockScrollMargins} className="space-y-1.5" data-bid-rows>
      {players.map((p, i) => {
        const active = activeIndex === i;
        const owned = trumpOwnerId === p.player_id;
        const tied = tiedIds.includes(p.player_id);
        const bid = bids[i];
        return (
          <div key={p.player_id} ref={(el) => { rowRefs.current[i] = el; }} style={dockScrollMargins}
            className={cn(
              'flex h-[46px] items-center gap-1 rounded-lg border pr-0.5 transition-colors [@media(min-height:760px)]:h-14',
              active ? PHASE.bidding.row : 'border-border bg-card'
            )}>
            <button type="button" onClick={() => onSelect(i)} aria-pressed={active}
              className="flex h-full min-w-0 flex-1 items-center justify-between gap-2 rounded-l-lg pl-3 pr-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
              {/* The seat number is its own element, so it stays on the left of a Hebrew name too. */}
              <span className="flex min-w-0 items-baseline gap-1 text-sm font-medium text-foreground" dir="ltr">
                <span className="shrink-0 tabular-nums">{i + 1}.</span>
                <span className="min-w-0 truncate"><Name>{p.player_name}</Name></span>
              </span>
              <span className="w-8 shrink-0 text-center font-heading text-lg font-bold text-foreground">
                {bid != null ? bid : <span className="text-muted-foreground" aria-label="no bid yet">—</span>}
              </span>
            </button>
            <button type="button" onClick={() => onPickTrumpOwner(p.player_id)} aria-pressed={owned}
              aria-label={owned
                ? `${p.player_name} won the trump${trump ? `: ${SUIT_LABEL[trump]}` : ' — suit not chosen yet'}`
                : `Mark ${p.player_name} as the trump winner${tied ? ' (tied on the top bid)' : ''}`}
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border font-bold transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground',
                // Marked: a gold outline (a selection), never a gold fill.
                owned
                  ? cn('border-2 border-primary text-foreground', focus.field === 'trump' && 'ring-2 ring-primary/50')
                  : tied ? 'border-2 border-dashed border-foreground text-foreground'
                  : 'border-dashed border-input text-muted-foreground',
                owned && trump === 'notrump' ? 'text-xs' : 'text-lg'
              )}>
              {owned
                // The chosen suit (♥ ♦ in red), or a neutral "Trump" before a suit is chosen.
                ? (trump ? <Suit suit={trump} /> : <span aria-hidden="true" className="text-xs font-medium">Trump</span>)
                : <span aria-hidden="true" className="text-xs font-medium">Trump</span>}
            </button>
          </div>
        );
      })}
      </div>
    </div>
  );
}
