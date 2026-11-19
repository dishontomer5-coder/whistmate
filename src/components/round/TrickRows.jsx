import { useRef } from 'react';
import { Name } from '@/components/UserText';
import { RENEGE_PENALTY } from '@/lib/scoring';
import { signed } from '@/lib/scoring-help';
import { scoreTone } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PHASE } from './RoundChrome';
import { dockScrollMargins, useRowsInView } from './ActionDock';
import NumberPad from './NumberPad';

// The label of the renege switch, with its cost read off the engine: "Renege −100".
export const RENEGE_LABEL = `Renege ${signed(-RENEGE_PENALTY)}`;

// The four players with the tricks they took. As soon as a row has its tricks it says
// whether the bid was made and what the row will score — so the scorer can read the
// result out before saving, and a slip (a wrong number, a stray renege) shows at once.
//
//   players   [{ player_id, player_name }] in bidding order
//   bids / tricks / reneges   values in the same order
//   preview   previewRound()'s rows: [{ made, off, points, final }]
//
// A row is three buttons side by side: the player (selects the row for the pad), the
// renege switch, and the tricks cell (also selects the row).
export default function TrickRows({ players, bids, tricks, reneges, activeIndex, onSelect, onToggleRenege, preview }) {
  const blockRef = useRef(null);
  const rowRefs = useRef([]);

  // Keep the rows on screen: on a short phone the dock would cover the lower ones.
  useRowsInView(() => [blockRef.current, rowRefs.current[activeIndex]], activeIndex);

  return (
    <div ref={blockRef} style={dockScrollMargins} className="space-y-1.5" data-trick-rows>
      {players.map((p, i) => {
        const active = activeIndex === i;
        const took = tricks[i];
        const reneged = !!reneges[i];
        const row = preview?.rows?.[i];
        const hasOutcome = row && row.points != null;
        return (
          <div key={p.player_id} ref={(el) => { rowRefs.current[i] = el; }} style={dockScrollMargins}
            data-trick-row
            className={cn(
              'flex h-[46px] items-center gap-1.5 rounded-lg border transition-colors [@media(min-height:760px)]:h-[58px]',
              active ? PHASE.results.row : 'border-border bg-card'
            )}>
            <button type="button" onClick={() => onSelect(i)} aria-pressed={active}
              className="flex h-full min-w-0 flex-1 flex-col justify-center rounded-l-lg pl-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
              <span className="block max-w-full truncate text-sm font-medium leading-tight text-foreground"><Name>{p.player_name}</Name></span>
              <span className="block whitespace-nowrap text-xs leading-tight text-muted-foreground" data-outcome>
                bid {bids[i]}
                {hasOutcome && (
                  <>
                    {' · '}{row.made ? 'made' : `${row.off} off`}{' '}
                    <span className={cn('text-sm font-bold', scoreTone(row.points))}>{signed(row.points)}</span>
                  </>
                )}
              </span>
            </button>
            {/* 32px tall to the eye, 44px to the thumb (the ::after reaches 6px above and below). */}
            <button type="button" aria-pressed={reneged} onClick={() => onToggleRenege(p.player_id)}
              aria-label={`${RENEGE_LABEL} for ${p.player_name}`}
              className={cn(
                "relative flex h-8 shrink-0 items-center whitespace-nowrap rounded-full px-2 text-xs font-semibold transition-colors after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-['']",
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground',
                reneged
                  ? 'bg-[hsl(0_72%_47%)] text-destructive-foreground'
                  : 'border border-input/70 text-muted-foreground'
              )}>
              {RENEGE_LABEL}
            </button>
            <button type="button" onClick={() => onSelect(i)} tabIndex={-1}
              aria-label={`Tricks for ${p.player_name}: ${took != null ? took : 'not entered'}`}
              className="flex h-full w-11 shrink-0 items-center justify-center rounded-r-lg font-heading text-lg font-bold text-foreground">
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
