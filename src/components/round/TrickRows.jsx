import { useRef } from 'react';
import { Name } from '@/components/UserText';
import { RENEGE_PENALTY } from '@/lib/scoring';
import { signed } from '@/lib/scoring-help';
import { scoreTone } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Suit } from '@/components/Suit';
import { PHASE } from './RoundChrome';
import { FirstBidMark } from './BidRows';
import { dockScrollMargins, useRowsInView } from './ActionDock';
import NumberPad from './NumberPad';
import { outcomeParts } from './round-logic';

// The label of a renege as the scored round shows it: "Renege −100".
export const RENEGE_LABEL = `Renege ${signed(-RENEGE_PENALTY)}`;

// The four players with the tricks they took, in seat order — the order of the bidding
// rows — so tricks read round the table land on the rows they were bid on. The trump
// winner (their suit) and the first bidder are marked on their rows, never moved.
// As soon as a row has its tricks it says whether the bid was made and what the row will
// score — so the scorer can read the result out before saving, and a slip (a wrong number,
// a stray renege) shows at once:
//
//   bid 3 · made +19              bid 3 · made +19 − 100 renege = −81
//   bid 2 · 1 off −10             zero bid failed (3 tricks) −30
//
//   players   [{ player_id, player_name }] in seat order
//   bids / tricks / reneges   values in the same order
//   order     the rows' indexes in the order they are drawn (seat order)
//   trumpOwnerId / trump   the trump winner as locked, and the suit (marked), or null
//   firstBidderId          the player whose bid was entered first (marked), or null
//   activeIndex  the seat index the pad is on
//   preview   previewRound()'s result (rows in seat order)
//
// A row is three buttons side by side: the player (selects the row for the pad), the
// renege switch, and the tricks cell (also selects the row). The renege switch is a quiet
// text button, lighter than the tricks number (a 44px tap area all the same); when it is on
// it keeps its word and says the cost — "Renege · −100" in red, outlined, never a solid
// block that could be read as the row's score (visual-designer-1).
export default function TrickRows({ players, bids, tricks, reneges, order, activeIndex, onSelect, onToggleRenege, preview, trumpOwnerId = null, trump = null, firstBidderId = null }) {
  const blockRef = useRef(null);
  const rowRefs = useRef([]);
  const seats = order || players.map((_, i) => i);

  // Keep the rows on screen: on a short phone the dock would cover the lower ones.
  useRowsInView(() => [blockRef.current, rowRefs.current[activeIndex]], activeIndex);

  return (
    <div ref={blockRef} style={dockScrollMargins} className="space-y-1.5" data-trick-rows>
      {seats.map((i) => {
        const p = players[i];
        const active = activeIndex === i;
        const took = tricks[i];
        const reneged = !!reneges[i];
        const parts = outcomeParts({ bid: bids[i], tricks: took, row: preview?.rows?.[i], renege: reneged, everyoneFalls: !!preview?.everyoneFalls });
        return (
          <div key={p.player_id} ref={(el) => { rowRefs.current[i] = el; }} style={dockScrollMargins}
            data-trick-row
            className={cn(
              'flex min-h-[46px] items-center gap-1.5 rounded-lg border transition-colors [@media(min-height:760px)]:min-h-[58px]',
              active ? PHASE.results.row : 'border-border bg-card'
            )}>
            <button type="button" onClick={() => onSelect(i)} aria-pressed={active}
              className="flex min-h-[44px] min-w-0 flex-1 flex-col justify-center self-stretch rounded-l-lg py-0.5 pl-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
              <span className="flex max-w-full items-center gap-1.5 text-sm font-medium leading-tight text-foreground">
                <span className="min-w-0 truncate"><Name>{p.player_name}</Name></span>
                {trump && trumpOwnerId === p.player_id && (
                  <span className="shrink-0 text-xs" data-trump-mark title="Won the trump"><span className="sr-only">won the trump: </span><Suit suit={trump} /></span>
                )}
                {firstBidderId === p.player_id && <FirstBidMark />}
              </span>
              <span className="block text-xs leading-tight text-muted-foreground" data-outcome>
                {parts?.zeroFailed ? null : <span className="whitespace-nowrap">bid {bids[i]}</span>}
                {parts && (
                  <>
                    {parts.zeroFailed ? '' : ' · '}{parts.text}{' '}
                    <span className={cn('whitespace-nowrap text-sm font-bold', scoreTone(parts.points))}>{signed(parts.points)}</span>
                    {parts.renege && (
                      <>
                        {' '}<span className="whitespace-nowrap"><span className="text-sm font-bold text-negative">− {RENEGE_PENALTY}</span> renege</span>
                        {' '}<span className="whitespace-nowrap" data-net>= <span className={cn('text-sm font-bold', scoreTone(parts.net))}>{signed(parts.net)}</span></span>
                      </>
                    )}
                  </>
                )}
              </span>
            </button>
            <button type="button" aria-pressed={reneged} onClick={() => onToggleRenege(p.player_id)}
              aria-label={`Renege for ${p.player_name}${reneged ? ` — on, ${signed(-RENEGE_PENALTY)}` : ''}`}
              data-renege
              className={cn(
                'relative flex h-11 shrink-0 items-center justify-center whitespace-nowrap px-1 text-xs transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground rounded-md',
                // The drawn mark is 28px tall; the button around it takes the 44px tap.
                "before:absolute before:inset-x-0 before:inset-y-2 before:rounded-md before:content-['']",
                reneged
                  ? 'font-semibold text-negative before:border before:border-destructive'
                  : 'font-normal text-muted-foreground hover:text-foreground'
              )}>
              <span className="relative px-1.5">{reneged ? `Renege · ${signed(-RENEGE_PENALTY)}` : 'Renege'}</span>
            </button>
            <button type="button" onClick={() => onSelect(i)} tabIndex={-1}
              aria-label={`Tricks for ${p.player_name}: ${took != null ? took : 'not entered'}`}
              className="flex w-11 shrink-0 items-center justify-center self-stretch rounded-r-lg font-heading text-lg font-bold text-foreground">
              {took != null ? took : <span className="text-muted-foreground" aria-hidden="true">—</span>}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// What the dock shows while tricks are entered: whose tricks, a way to learn what a
// renege is, and the pad.
export function TrickKeys({ player, value, onPick, onRenegeHelp }) {
  return (
    <div className="space-y-2">
      <div className="flex min-h-7 items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          Tricks for <span className="font-medium text-foreground"><Name>{player?.player_name}</Name></span>
        </p>
        {/* 28px tall in the row, 44px to the thumb: the ::after reaches 8px up into the dock's
            padding and 8px down into the gap above the pad, and touches no other control. */}
        <button type="button" onClick={onRenegeHelp}
          className="relative flex h-7 shrink-0 items-center text-xs font-medium text-muted-foreground underline underline-offset-2 after:absolute after:-inset-x-2 after:-inset-y-2 after:content-[''] hover:text-foreground">
          What is a renege?
        </button>
      </div>
      <NumberPad label={`Tricks for ${player?.player_name ?? ''}`} tone="trick" value={value} onPick={onPick} />
    </div>
  );
}
