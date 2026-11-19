import { Suit, SUITS_IN_AUCTION_ORDER } from '@/components/Suit';
import { Name } from '@/components/UserText';
import { HIERARCHIES } from '@/lib/scoring';
import { CARD_ORDER_LABEL } from '@/lib/scoring-help';
import { cn } from '@/lib/utils';
import NumberPad from './NumberPad';

// What the dock shows while bids are entered. It follows the cursor:
//
//   on a player's row   "Bid for Maya" and the number pad
//   on the trump mark   "Trump won by Maya" and the five calls in auction order
//                       (♣ ♦ ♥ ♠ NT), plus, in an advanced session, the card order
//
// Showing the trump keys in place of the pad — instead of a panel in the page — is what
// keeps the lock button from being pushed off the screen when a trump winner is marked.
export default function BidKeys({
  focus, players, bids, blocked, onPickBid, anyBidEntered,
  trumpOwnerName, trump, onPickTrump, onRemoveTrump,
  advanced, hierarchy, onPickHierarchy,
}) {
  if (focus.field === 'trump') {
    return (
      <div className="space-y-2" data-trump-keys>
        <div className="flex min-h-7 items-center justify-between gap-2">
          <p className="min-w-0 truncate text-xs text-muted-foreground">
            Trump won by <span className="font-medium text-foreground"><Name>{trumpOwnerName}</Name></span> — pick the suit
          </p>
          {/* Trump is optional outside advanced sessions, so the mark can be taken off again. */}
          {onRemoveTrump && (
            <button type="button" onClick={onRemoveTrump}
              className="relative flex h-7 shrink-0 items-center text-xs font-medium text-muted-foreground underline underline-offset-2 after:absolute after:-inset-x-2 after:-inset-y-2 after:content-[''] hover:text-foreground">
              Remove trump mark
            </button>
          )}
        </div>
        {/* The chosen suit gets a gold outline, not a gold fill, so hearts and diamonds stay red. */}
        <div role="group" aria-label="Trump suit" className="grid grid-cols-5 gap-2">
          {SUITS_IN_AUCTION_ORDER.map((s) => (
            <button key={s} type="button" aria-pressed={trump === s} onClick={() => onPickTrump(s)}
              className={cn(
                'h-11 rounded-lg text-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground',
                trump === s ? 'bg-primary/15 ring-2 ring-primary' : 'bg-secondary ring-1 ring-inset ring-white/10'
              )}>
              <Suit suit={s} className={s === 'notrump' ? 'text-sm' : undefined} />
            </button>
          ))}
        </div>
        {advanced && (
          <div role="group" aria-labelledby="card-order-heading" className="space-y-1">
            <h2 id="card-order-heading" className="section-label">Card order</h2>
            <div className="grid grid-cols-2 gap-2">
              {HIERARCHIES.map((h) => (
                <button key={h} type="button" aria-pressed={hierarchy === h} onClick={() => onPickHierarchy(h)}
                  className={cn(
                    'min-h-11 rounded-lg px-2 py-1 text-xs font-medium leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground',
                    hierarchy === h ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground ring-1 ring-inset ring-white/10'
                  )}>
                  {CARD_ORDER_LABEL[h]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const player = players[focus.index];
  const allIn = bids.every((v) => v != null);
  return (
    <div className="space-y-2">
      <p className="flex min-h-7 flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
        Bid for <span className="font-medium text-foreground"><Name>{player?.player_name}</Name></span>
        {blocked != null ? (
          <span className="text-negative"> · {blocked} is blocked — the bids can't total 13</span>
        ) : !anyBidEntered ? (
          // Bidding starts with a different player every hand: say that any row can go first.
          <span> · someone else bids first? Tap their row</span>
        ) : allIn ? (
          <span> · tap a player to change their bid</span>
        ) : null}
      </p>
      <NumberPad label={`Bid for ${player?.player_name ?? ''}`} tone="bid"
        value={bids[focus.index]} blocked={blocked} onPick={onPickBid} />
    </div>
  );
}
