import { useState } from 'react';
import { MessageSquare, Trash2, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { formatDate } from '@/lib/format';
import PlayerAvatar from '@/components/PlayerAvatar';
import { Button } from '@/components/ui/button';
import { Name, UserText } from '@/components/UserText';

export default function TableTalkCard({ note, canDelete = false, onDeleted }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isAnonymous = note.is_anonymous;
  const displayName = isAnonymous ? 'Anonymous' : (note.author_name || 'Unknown player');
  // game_name/game_date hold the session a note was pinned to, if any.
  const sessionLabel = note.game_name || (note.game_date ? 'Session' : 'General note');
  const sessionDate = formatDate(note.game_date);

  const handleDelete = async () => {
    try {
      setDeleting(true);
      await base44.functions.invoke('deleteNote', { note_id: note.id });
      if (onDeleted) onDeleted(note.id);
    } catch (err) {
      console.error(err);
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3 transition-colors hover:border-primary/30">
      <div className="flex items-center gap-3">
        <PlayerAvatar name={displayName} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">
            <Name>{displayName}</Name>
          </p>
          <p className="text-xs text-muted-foreground truncate">
            <UserText>{sessionLabel}</UserText>{sessionDate && ` · ${sessionDate}`}
          </p>
        </div>
        {isAnonymous && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground uppercase tracking-wide flex-shrink-0">
            Anon
          </span>
        )}
        {canDelete && !confirming && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setConfirming(true)}
            className="-my-2 -mr-2 text-muted-foreground hover:text-negative"
            aria-label="Delete note"
          >
            <Trash2 />
          </Button>
        )}
      </div>
      <div className="flex items-start gap-2">
        <MessageSquare className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-1" />
        {/* The note keeps its own direction: a Hebrew note reads right-to-left and aligns right. */}
        <UserText as="p" className="min-w-0 flex-1 text-start text-sm text-foreground leading-relaxed break-words">{note.note}</UserText>
      </div>
      {confirming && (
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <span className="text-xs text-muted-foreground mr-auto">Delete this note?</span>
          <Button variant="outline" size="sm" onClick={() => setConfirming(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
            {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Delete
          </Button>
        </div>
      )}
    </div>
  );
}
