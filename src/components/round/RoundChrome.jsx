import { Gavel, ClipboardCheck, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

// The frame the round screens share: the coloured band that names the step and the
// "restored" note. (The back link and the archived banner are the app-wide ones.)

// The two steps of a round look alike (four rows and a pad), so each has its own colour
// and icon: gold and a gavel while bidding, green and a clipboard for the results.
// Defined once so a row, a key and a band cannot drift apart.
export const PHASE = {
  bidding: {
    label: 'Bidding', step: 'step 1 of 2', Icon: Gavel,
    band: 'border-l-primary bg-primary/10 text-primary',
    row: 'border-primary bg-primary/5',
  },
  results: {
    label: 'Results', step: 'step 2 of 2', Icon: ClipboardCheck,
    band: 'border-l-emerald-500 bg-emerald-500/10 text-emerald-400',
    row: 'border-emerald-500 bg-emerald-500/5',
  },
};

// The band that names the step. The title is never cut: on a narrow phone the badge
// drops to its own line instead.
export function PhaseBanner({ phase, title, subtitle, roundNumber, badge }) {
  const { label, step, Icon, band } = PHASE[phase];
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-lg border-l-4 px-3 py-1 [@media(min-height:760px)]:py-2', band)}>
      <span className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <h1 className="whitespace-nowrap font-heading text-lg font-bold leading-tight">{title || label}</h1>
          <span className="block text-xs leading-tight text-muted-foreground">{subtitle || `Round ${roundNumber} · ${step}`}</span>
        </span>
      </span>
      {badge}
    </div>
  );
}

// One line after the scorer comes back to a round they had started to fill in: what was
// kept on this device and put back ("Restored: 3 bids."). Short, so it stays one line.
export function RestoredNote({ what }) {
  if (!what) return null;
  return (
    <p role="status" data-restored-note className="flex items-start gap-1.5 text-xs leading-snug text-emerald-400">
      <RotateCcw className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
      <span>Restored: {what}.</span>
    </p>
  );
}
