import { cn } from '@/lib/utils';

// The UP / DOWN badge: whether the four bids promised more tricks than the 13 there are
// (UP, 14 or more) or fewer (DOWN, 12 or fewer).
//
//   <TableBadge state={round.table_state} />                ▲ UP
//   <TableBadge state="down" total={11} />                  ▼ DOWN · 11
//   <TableBadge state="up" total={15} onClick={openHelp} /> the same, as a button
//
// It is a neutral outlined badge with an arrow, the same on every screen — never red or
// green, which mean "lost" and "moved up" elsewhere. Pass `onClick` to make it a button
// (it opens the scoring help at "Up and down tables"); the tap area is then 44px tall.
export default function TableBadge({ state, total, onClick, className }) {
  if (state !== 'up' && state !== 'down') return null;
  const up = state === 'up';
  const word = up ? 'UP' : 'DOWN';
  const meaning = up ? 'Up table: the bids total more than 13' : 'Down table: the bids total less than 13';
  const classes = cn(
    'relative inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-input px-2 text-xs font-bold leading-none text-foreground',
    onClick && "transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground after:absolute after:-inset-x-1 after:-inset-y-3 after:content-['']",
    className
  );
  const content = (
    <>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      {word}
      {total != null && <span className="font-medium text-muted-foreground">· {total}</span>}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}
        aria-label={`${meaning}${total != null ? ` (${total})` : ''}. How scoring works`}>
        {content}
      </button>
    );
  }
  return <span className={classes} title={meaning}>{content}</span>;
}
