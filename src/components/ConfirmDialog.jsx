import { useCallback, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

// The one confirmation dialog of the app — for every destructive or hard-to-undo action
// (remove a member, archive, delete, discard, close a session…). It replaces
// window.confirm() and buttons that turn into "Confirm / Cancel" in place.
//
// Two ways to use it.
//
// 1. Controlled, when the dialog must stay open while the request runs, or needs extra
//    content (children) such as a "type the group name" field:
//
//      <ConfirmDialog
//        open={!!removing} onOpenChange={(open) => { if (!open) setRemoving(null); }}
//        title="Remove Dan from the group?"
//        description="His rounds and scores stay in the history."
//        confirmLabel="Remove" destructive busy={busy}
//        onConfirm={async () => { await remove(removing); setRemoving(null); }}
//      />
//
//    onConfirm does NOT close the dialog — close it yourself (set `open` to false) when the
//    work is done. While `busy` the buttons are disabled and the dialog cannot be dismissed.
//    `confirmDisabled` keeps the confirm button off until a condition holds (the typed name
//    matches).
//
// 2. As a question, with the hook — the direct replacement for `if (!confirm('…')) return;`:
//
//      const [confirm, confirmElement] = useConfirm();
//      …
//      if (!(await confirm({ title: 'Delete this round?', description: 'Its scores will be removed.',
//                            confirmLabel: 'Delete round', destructive: true }))) return;
//      …
//      return <>{…}{confirmElement}</>;   // render confirmElement once, anywhere in the component
//
// `title` and `description` may be text or JSX — wrap a player/group name in <Name> so a
// Hebrew name cannot reorder the sentence:  title={<>Remove <Name>{m.player_name}</Name>?</>}
//
// Cancel and Escape answer "no". A tap outside the card does nothing, so a stray tap can
// neither confirm nor lose what was typed.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  confirmDisabled = false,
  onConfirm,
  children,
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange?.(next); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {/* Screen readers need a description; without one, the title is repeated silently. */}
          <AlertDialogDescription className={description ? undefined : 'sr-only'}>
            {description || title}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{cancelLabel}</AlertDialogCancel>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={busy || confirmDisabled}
            onClick={() => onConfirm?.()}
          >
            {busy && <Loader2 className="animate-spin" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// const [confirm, confirmElement] = useConfirm();
// `await confirm({ title, description, confirmLabel, cancelLabel, destructive })` resolves to
// true (confirmed) or false (cancelled / dismissed). Render `confirmElement` once.
export function useConfirm() {
  const [open, setOpen] = useState(false);
  // The last question stays in state after closing so the text does not vanish mid-animation.
  const [options, setOptions] = useState({});
  const resolver = useRef(null);

  const settle = useCallback((answer) => {
    setOpen(false);
    const resolve = resolver.current;
    resolver.current = null;
    if (resolve) resolve(answer);
  }, []);

  const confirm = useCallback((nextOptions = {}) => new Promise((resolve) => {
    // A question asked while another is still open answers the earlier one "no".
    if (resolver.current) resolver.current(false);
    resolver.current = resolve;
    setOptions(nextOptions);
    setOpen(true);
  }), []);

  const confirmElement = (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => { if (!next) settle(false); }}
      title={options.title}
      description={options.description}
      confirmLabel={options.confirmLabel}
      cancelLabel={options.cancelLabel}
      destructive={options.destructive}
      onConfirm={() => settle(true)}
    />
  );

  return [confirm, confirmElement];
}

export default ConfirmDialog;
