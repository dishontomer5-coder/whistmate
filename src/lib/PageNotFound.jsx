import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import EmptyState from '@/components/EmptyState';

// Shown for any address the app does not know. It sits outside the Layout shell (it is the
// "*" route), so it draws its own slim header: the spade mark and the name, linking home —
// a stale or mistyped link still lands on something that is plainly WhistMate.
export default function PageNotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center px-4 py-3">
          <Link to="/home" className="flex min-h-11 items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
            <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">♠</span>
            <span className="font-heading text-lg font-bold uppercase tracking-wide text-primary">WhistMate</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 items-center justify-center px-4">
        <EmptyState
          as="h1"
          icon={Compass}
          title="Page not found"
          description="That link doesn't lead anywhere. It may be old, or mistyped."
          action={
            <Button asChild size="lg">
              <Link to="/home">Back to groups</Link>
            </Button>
          }
        />
      </main>
    </div>
  );
}
