import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// The one error state of the app, in two sizes.
//
// A block, where something failed to load and the page has nothing else to show:
//
//   <ErrorState title="Couldn't load this session" message={error} onRetry={load} />
//
//   title     what failed, in plain words. Default "Something went wrong".
//   message   the detail (pass errorMessage(err, …) from @/lib/format).
//   onRetry   shows a "Try again" button. Leave it out when retrying cannot help
//             (a missing or deleted page) and give a way out with `action` instead.
//   action    optional extra content under the message (a link back, another button).
//
// One line, next to the form or button that failed:
//
//   <ErrorState inline message={error} />
//
// Both sit on a faint red tint and announce themselves to screen readers (role="alert").
// The inline form renders nothing while there is no message, so it can stay in the markup:
// no `{error && …}` needed around it.
export default function ErrorState({ title, message, onRetry, retryLabel = 'Try again', action, inline = false, className }) {
  if (inline) {
    if (!message) return null;
    return (
      <p role="alert"
        className={cn('flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-left text-sm text-negative', className)}>
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span dir="auto" className="min-w-0 break-words">{message}</span>
      </p>
    );
  }
  return (
    <div role="alert"
      className={cn('flex flex-col items-center rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-6 text-center', className)}>
      <AlertCircle className="mb-3 h-7 w-7 text-negative" aria-hidden="true" />
      <p className="font-heading text-lg font-bold text-foreground">{title || 'Something went wrong'}</p>
      {message && <p dir="auto" className="mt-1 max-w-xs break-words text-sm text-muted-foreground">{message}</p>}
      {onRetry && (
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          <RefreshCw /> {retryLabel}
        </Button>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
