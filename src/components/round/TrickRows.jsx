import { useRef } from 'react';
import { Name } from '@/components/UserText';
import { RENEGE_PENALTY } from '@/lib/scoring';
import { signed } from '@/lib/scoring-help';
import { scoreTone } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PHASE } from './RoundChrome';
import { dockScrollMargins, useRowsInView } from './ActionDock';
import NumberPad from './NumberPad';
import { outcomeParts } from './round-logic';

// The label of a renege as the scored round shows it: "Renege −100".
export const RENEGE_LABEL = `Renege ${signed(-RENEGE_PENALTY)}`;

// The four players with the tricks they took, in the order the table bid (`order`: the
// rows' indexes, starting with the first bidder), so tricks are read out in the same order.
// As soon as a row has its tricks it says whether the bid was made and what the row will
// score — so the scorer can read the result out before saving, and a slip (a wrong number,
// a stray renege) shows at once:
//
//   bid 3 · made +19              bid 3 · made +19 − 100 renege
//   bid 2 · 1 off −10             zero bid failed (3 tricks) −30
//
//   players   [{ player_id, player_name }] in seat order
//   bids / tricks / reneges   values in the same order
//   order     the seat indexes in bidding order (default: seat order)
//   activeIndex  the seat index the pad is on
//   preview   previewRound()'s result (rows in seat order)
//
// A row is three buttons side by side: the player (selects the row for the pad), the
// renege switch, and the tricks cell (also selects the row). The renege switch is quiet —
// a neutral outline "Renege" — and turns red with "−100" only when it is on.
export default function TrickRows({ players, bids, tricks, reneges, order, activeIndex, onSelect, onToggleRenege, preview }) {
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
              <span className="block max-w-full truncate text-sm font-medium leading-tight text-foreground"><Name>{p.player_name}</Name></span>
              <span className="block text-xs leading-tight text-muted-foreground" data-outcome>
                {parts?.zeroFailed ? null : <span className="whitespace-nowrap">bid {bids[i]}</span>}
                {parts && (
                  <>
                    {parts.zeroFailed ? '' : ' · '}{parts.text}{' '}
                    <span className={cn('whitespace-nowrap text-sm font-bold', scoreTone(parts.points))}>{signed(parts.points)}</span>
                    {parts.renege && (
                      <>
                        {' '}<span className="whitespace-nowrap"><span className="text-sm font-bold text-negative">− {RENEGE_PENALTY}</span> renege</span>
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
                'flex h-11 min-w-[4.5rem] shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-2 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground',
                reneged
                  ? 'bg-[hsl(0_72%_47%)] font-bold text-destructive-foreground'
                  : 'border border-input text-muted-foreground hover:text-foreground'
              )}>
              {reneged ? signed(-RENEGE_PENALTY) : 'Renege'}
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
