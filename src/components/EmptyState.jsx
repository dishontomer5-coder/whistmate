import { Spade } from 'lucide-react';
import { cn } from '@/lib/utils';

// The one empty state of the app: a line icon in a circle, a title, one line of
// explanation and, optionally, the action that fills the gap.
//
//   <EmptyState icon={Users} title="No groups yet"
//     description="Create a group for your whist circle, or join one with an invite code."
//     action={<Button onClick={…}>Create group</Button>} />
//
//   icon         a lucide-react icon component (not an emoji, not a string). Default: Spade.
//   title        sentence case ("No rounds yet").
//   description  optional; one or two short lines.
//   action       optional; a Button or link.
//   compact      for an empty block inside a page that has other content (a section, a card):
//                less padding and a smaller icon, so two of them do not fill the screen.
//   as           the heading tag of the title — "h1" when the empty state IS the page.
export default function EmptyState({ icon: Icon = Spade, title, description, action, compact = false, as: Heading = 'h2', className }) {
  return (
    <div className={cn('flex flex-col items-center text-center', compact ? 'py-8' : 'py-16', className)}>
      <div className={cn(
        'mb-4 flex items-center justify-center rounded-full border border-border bg-secondary',
        compact ? 'h-12 w-12' : 'h-16 w-16'
      )}>
        <Icon className={cn('text-muted-foreground', compact ? 'h-5 w-5' : 'h-7 w-7')} aria-hidden="true" />
      </div>
      <Heading className="font-heading text-lg font-bold text-foreground">{title}</Heading>
      {description && <p className="mt-2 max-w-xs text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
