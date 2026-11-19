import { Archive } from 'lucide-react';
import { cn } from '@/lib/utils';

// Shown at the top of a page of an archived group: everything can be read, nothing can be
// changed — and the page offers no write action below it. The server refuses them anyway
// ("This group is archived — it is read-only").
export default function ArchivedBanner({ className }) {
  return (
    <p role="status"
      className={cn('flex items-center justify-center gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm font-medium text-yellow-500', className)}>
      <Archive className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
      This group is archived — read-only
    </p>
  );
}
