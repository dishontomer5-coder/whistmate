import { useEffect, useRef, useState } from 'react';
import { MessageSquare, Trash2, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { formatDate, errorMessage } from '@/lib/format';
import PlayerAvatar from '@/components/PlayerAvatar';
import ErrorState from '@/components/ErrorState';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ConfirmDialog';
import { Name, UserText } from '@/components/UserText';

// One note about a player.
//   canDelete   show the delete button (the note's author, a group admin, an app admin).
//   onDeleted   called with the note id once it is gone.
//   highlight   the note the reader came for (opened from Activity): it is scrolled into
//               view and outlined.
export default function TableTalkCard({ note, canDelete = false, onDeleted, highlight = false }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [confirm, confirmElement] = useConfirm();
  const cardRef = useRef(null);
  const isAnonymous = note.is_anonymous;
  const displayName = isAnonymous ? 'Anonymous' : (note.author_name || 'Unknown player');
  // game_name/game_date hold the session a note was pinned to, if any — always that
  // session's own date, never the day the note was written.
  const sessionLabel = note.game_name || (note.game_date ? 'Session' : 'General note');
  const sessionDate = formatDate(note.game_date);

  useEffect(() => {
    if (highlight) cardRef.current?.scrollIntoView({ block: 'center' });
  }, [highlight]);

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Delete this note?',
      description: 'It is removed for everyone in the group.',
      confirmLabel: 'Delete note',
      destructive: true,
    });
    if (!ok) return;
    try {
      setDeleting(true);
      setError('');
      await base44.functions.invoke('deleteNote', { note_id: note.id });
      if (onDeleted) onDeleted(note.id);
    } catch (err) {
      // Somebody else already deleted it: it is gone, which is what was asked for.
      if (err?.response?.status === 404) {
        if (onDeleted) onDeleted(note.id);
        return;
      }
      setError(errorMessage(err, "Couldn't delete the note."));
      setDeleting(false);
    }
  };

  return (
    <div ref={cardRef}
      className={`scroll-mt-24 bg-card border rounded-lg p-4 space-y-3 transition-colors ${
        highlight ? 'border-primary ring-1 ring-primary/40' : 'border-border'
      }`}>
      <div className="flex items-center gap-3">
        <PlayerAvatar name={displayName} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">
            <Name>{displayName}</Name>
          </p>
          {/* Wraps rather than cuts: the date stays whole on a narrow phone. */}
          <p className="text-xs text-muted-foreground break-words [overflow-wrap:anywhere]">
            <UserText>{sessionLabel}</UserText>
            {sessionDate && <> · <span className="whitespace-nowrap">{sessionDate}</span></>}
          </p>
        </div>
        {canDelete && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDelete}
            disabled={deleting}
            className="-my-2 -mr-2 text-muted-foreground hover:text-negative"
            aria-label="Delete note"
          >
            {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
          </Button>
        )}
      </div>
      <div className="flex items-start gap-2">
        <MessageSquare className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-1" aria-hidden="true" />
        {/* The note keeps its own direction: a Hebrew note reads right-to-left and aligns right. */}
        <UserText as="p" className="min-w-0 flex-1 text-start text-sm text-foreground leading-relaxed break-words">{note.note}</UserText>
      </div>
      <ErrorState inline message={error} />
      {confirmElement}
    </div>
  );
}
