import { ArrowLeft, Gavel, ClipboardCheck, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

// The frame the round screens share: the back link, the coloured band that names the
// step, the read-only banner of an archived group and the "restored" note.

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

// "← Session": the in-page way back. The label says where it goes.
export function BackLink({ label, onClick, className }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('-ml-1 flex min-h-11 items-center gap-1 pl-1 pr-2 text-sm text-muted-foreground hover:text-foreground', className)}>
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {label}
    </button>
  );
}

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

// An archived group is read-only: the screens offer no write action and say why.
export function ReadOnlyBanner({ className }) {
  return (
    <p role="status" data-read-only-banner
      className={cn('rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-center text-sm font-medium text-yellow-500', className)}>
      This group is archived — read-only.
    </p>
  );
}

// One line after the scorer comes back to a round they had started to fill in.
export function RestoredNote({ what }) {
  if (!what) return null;
  return (
    <p role="status" data-restored-note className="flex items-start gap-1.5 text-xs leading-snug text-emerald-400">
      <RotateCcw className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
      <span>Restored what was typed on this device: {what}.</span>
    </p>
  );
}
