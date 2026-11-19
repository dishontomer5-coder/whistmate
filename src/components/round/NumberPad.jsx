import { cn } from '@/lib/utils';

// The 0–13 tap pad of the round screens (bids, tricks and the editor all use this one).
//
//   <NumberPad label="Bid for Maya" value={3} blocked={2} onPick={(n) => …} tone="bid" />
//
// Every key is at least 44x44px with 8px between keys:
//   from 360px wide  7 columns (0–6 / 7–13). The grid reaches 14px past the dock's 16px
//                    gutter on each side at 360px — that is what makes seven 44px keys fit —
//                    8px past it from 372px, and stays inside the gutter from 420px.
//   below 360px      5 columns (0–4 / 5–9 / 10–13), keys about 51px wide.
// Keys are 48px tall where the screen has the height for it.
//
//   value    the number currently held by the row being entered (shown selected)
//   blocked  the one number that may not be picked (it would make the bids total 13)
//   tone     'bid' | 'trick' — the selected key takes the colour of the step: a gold outline
//            while bidding (a selection is never a gold fill), green for the results
const SELECTED = {
  bid: 'bg-secondary text-foreground ring-2 ring-inset ring-primary',
  trick: 'bg-emerald-500 text-background',
};

export default function NumberPad({ label, value, onPick, max = 13, blocked = null, tone = 'bid' }) {
  return (
    <div
      role="group"
      aria-label={label}
      data-number-pad
      className="grid grid-cols-5 gap-2 min-[360px]:-mx-3.5 min-[360px]:grid-cols-7 min-[372px]:-mx-2 min-[420px]:mx-0"
    >
      {Array.from({ length: max + 1 }, (_, n) => {
        const isBlocked = n === blocked;
        const selected = value === n;
        return (
          <button
            key={n}
            type="button"
            disabled={isBlocked}
            aria-pressed={selected}
            aria-label={isBlocked ? `${n} — not allowed: the bids can't total 13` : undefined}
            onClick={() => onPick(n)}
            className={cn(
              'h-11 rounded-lg font-heading text-lg font-bold transition-colors [@media(min-height:760px)]:h-12',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground',
              selected ? SELECTED[tone]
                : isBlocked ? 'cursor-not-allowed bg-secondary/40 text-muted-foreground/40 line-through'
                : 'bg-secondary text-foreground ring-1 ring-inset ring-white/10 active:bg-secondary/60'
            )}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}
