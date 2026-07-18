import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

// Functional replacement for the non-working shadcn toast stub (the primitives
// in toast.jsx were plain divs — the X wasn't wired and nothing auto-dismissed).
// Auto-dismisses after 4s, and the close button actually closes.
function ToastItem({ t, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const destructive = t.variant === 'destructive';
  return (
    <div
      className={`pointer-events-auto relative flex w-full items-start justify-between gap-3 rounded-lg border p-4 pr-9 shadow-lg animate-in slide-in-from-bottom-2 ${
        destructive
          ? 'border-destructive bg-destructive text-destructive-foreground'
          : 'border-border bg-card text-foreground'
      }`}
    >
      <div className="grid gap-0.5 min-w-0">
        {t.title && <p className="text-sm font-semibold">{t.title}</p>}
        {t.description && <p className="text-sm opacity-90 break-words">{t.description}</p>}
      </div>
      <button
        onClick={onClose}
        aria-label="Dismiss"
        className="absolute right-2 top-2 rounded-md p-1 opacity-70 hover:opacity-100 transition-opacity"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function Toaster() {
  const { toasts, dismiss } = useToast();
  const visible = toasts.filter(t => t.open !== false);

  return (
    <div className="fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col gap-2 p-4 md:max-w-[400px]">
      {visible.map(t => (
        <ToastItem key={t.id} t={t} onClose={() => dismiss(t.id)} />
      ))}
    </div>
  );
}
