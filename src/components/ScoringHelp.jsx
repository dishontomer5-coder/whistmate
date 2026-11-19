import { useRef, useState } from 'react';
import { CircleHelp } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Suit } from '@/components/Suit';
import { SCORING_HELP } from '@/lib/scoring-help';
import { cn } from '@/lib/utils';

// "How scoring works" — the one place the app explains its numbers.
//
//   <ScoringHelp open={open} onOpenChange={setOpen} />                 from the top
//   <ScoringHelp open={open} onOpenChange={setOpen} section="updown" /> opened at a section
//   <ScoringHelpButton />                                               a 44x44 "?" that opens it
//   <ScoringHelpButton section="renege" />
//
// section: 'contract' | 'miss' | 'zero' | 'updown' | 'everyone-falls' | 'renege' | 'trump'
//
// A bottom sheet on a phone, a dialog from 640px up. The words and every number in them
// come from src/lib/scoring-help.js, which computes them from the scoring engine.

// A "rich line" from scoring-help.js: a string, or strings mixed with { suit } tokens.
function Rich({ line }) {
  if (!Array.isArray(line)) return line;
  return line.map((part, i) => (typeof part === 'string' ? part : <Suit key={i} suit={part.suit} />));
}

export function ScoringHelp({ open, onOpenChange, section }) {
  const bodyRef = useRef(null);

  // Opened at a section: bring it to the top of the sheet and move focus to it, so a
  // screen reader starts reading there too. Otherwise focus the sheet itself rather than
  // the close button, which would scroll nothing and announce "Close" first.
  const handleOpenAutoFocus = (event) => {
    event.preventDefault();
    const body = bodyRef.current;
    if (!body) return;
    const target = section ? body.querySelector(`[data-section="${section}"]`) : null;
    if (target) {
      body.scrollTop = target.offsetTop - body.offsetTop - 12; // a little air above the section
      target.focus({ preventScroll: true });
    } else {
      body.scrollTop = 0;
      body.focus({ preventScroll: true });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        position="sheet"
        onOpenAutoFocus={handleOpenAutoFocus}
        className="flex flex-col gap-0 overflow-hidden p-0 pb-0 sm:p-0"
      >
        <DialogHeader className="border-b border-border px-5 pb-3 pt-5 pr-12">
          <DialogTitle>How scoring works</DialogTitle>
          <DialogDescription>What each number on the score sheet means.</DialogDescription>
        </DialogHeader>

        <div
          ref={bodyRef}
          tabIndex={-1}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 outline-none"
        >
          {SCORING_HELP.map((s) => (
            <section
              key={s.id}
              data-section={s.id}
              tabIndex={-1}
              aria-labelledby={`scoring-help-${s.id}`}
              className={cn(
                'space-y-2 rounded-lg border p-3 outline-none',
                // The section the help was opened for is outlined in gold.
                s.id === section ? 'border-primary bg-primary/5' : 'border-border bg-secondary/40'
              )}
            >
              <h3 id={`scoring-help-${s.id}`} className="font-heading text-base font-bold text-foreground">{s.title}</h3>
              {s.lines.map((line, i) => (
                <p key={i} className="text-sm leading-relaxed text-muted-foreground"><Rich line={line} /></p>
              ))}
              {s.facts && (
                <dl className="space-y-1.5">
                  {s.facts.map((fact) => (
                    <div key={fact.label} className="text-sm leading-relaxed">
                      <dt className="inline font-semibold text-foreground">{fact.label}: </dt>
                      <dd className="inline text-muted-foreground"><Rich line={fact.value} /></dd>
                    </div>
                  ))}
                </dl>
              )}
              <p className="rounded-md bg-background px-3 py-2 text-sm leading-relaxed text-foreground">
                <span className="font-semibold text-primary">Example </span>
                <Rich line={s.example.text} />
              </p>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// A 44x44 "?" that opens the help, at `section` when given. Self-contained: drop it next
// to a heading or a score. `label` is what a screen reader announces.
export function ScoringHelpButton({ section, label = 'How scoring works', className }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={label}
        title={label}
        className={cn('text-muted-foreground hover:text-foreground', className)}
        onClick={() => setOpen(true)}
      >
        <CircleHelp />
      </Button>
      <ScoringHelp open={open} onOpenChange={setOpen} section={section} />
    </>
  );
}

export default ScoringHelp;
