import { useEffect, useRef } from 'react';
import { Spade } from 'lucide-react';
import { Suit, SUIT_LABEL } from '@/components/Suit';
import { Name } from '@/components/UserText';
import { cn } from '@/lib/utils';
import { PHASE } from './RoundChrome';
import { dockScrollMargins, showRows } from './ActionDock';

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
//
// A row is two buttons side by side — the row itself (select it for the pad) and its
// trump mark — never a button inside a button.
export default function BidRows({ players, bids, focus, onSelect, trumpOwnerId, trump, onPickTrumpOwner, trumpRequired }) {
  const blockRef = useRef(null);
  const rowRefs = useRef([]);
  const activeIndex = focus.field === 'bid' ? focus.index : -1;

  // Keep the rows on screen: on a short phone the dock would cover the lower ones.
  useEffect(() => {
    showRows(blockRef.current, rowRefs.current[activeIndex]);
  }, [activeIndex]);

  return (
    <div className="space-y-1.5">
      <p className="section-label pr-1 text-right" id="trump-winner-caption">
        Trump winner{trumpRequired ? '' : ' (optional)'}
      </p>
      <div ref={blockRef} style={dockScrollMargins} className="space-y-1.5" data-bid-rows>
      {players.map((p, i) => {
        const active = activeIndex === i;
        const owned = trumpOwnerId === p.player_id;
        const bid = bids[i];
        return (
          <div key={p.player_id} ref={(el) => { rowRefs.current[i] = el; }} style={dockScrollMargins}
            className={cn(
              'flex h-12 items-center gap-1 rounded-lg border pr-0.5 transition-colors [@media(min-height:760px)]:h-14',
              active ? PHASE.bidding.row : 'border-border bg-card'
            )}>
            <button type="button" onClick={() => onSelect(i)} aria-pressed={active}
              className="flex h-full min-w-0 flex-1 items-center justify-between gap-2 rounded-l-lg pl-3 pr-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
              {/* The number stays in front of a Hebrew name: it is outside the isolated name. */}
              <span className="min-w-0 truncate text-sm font-medium text-foreground">{i + 1}. <Name>{p.player_name}</Name></span>
              <span className="w-8 shrink-0 text-center font-heading text-lg font-bold text-foreground">
                {bid != null ? bid : <span className="text-muted-foreground" aria-label="no bid yet">—</span>}
              </span>
            </button>
            <button type="button" onClick={() => onPickTrumpOwner(p.player_id)} aria-pressed={owned}
              aria-label={owned
                ? `${p.player_name} won the trump${trump ? `: ${SUIT_LABEL[trump]}` : ' — suit not chosen yet'}`
                : `Mark ${p.player_name} as the trump winner`}
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border font-bold transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground',
                owned
                  ? cn('border-primary bg-primary/15 text-foreground', focus.field === 'trump' && 'ring-2 ring-primary')
                  : 'border-dashed border-input text-muted-foreground',
                owned && trump === 'notrump' ? 'text-xs' : 'text-lg'
              )}>
              {owned
                ? (trump ? <Suit suit={trump} /> : <span aria-hidden="true">?</span>)
                : <Spade className="h-4 w-4" aria-hidden="true" />}
            </button>
          </div>
        );
      })}
      </div>
    </div>
  );
}
