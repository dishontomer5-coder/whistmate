import { useState } from 'react';
import { MessageSquare, Trash2, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { formatDate } from '@/lib/format';

const AVATAR_COLORS = [
  'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'bg-rose-500/20 text-rose-400 border-rose-500/30',
  'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
];

function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function TableTalkCard({ note, canDelete = false, onDeleted }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isAnonymous = note.is_anonymous;
  const displayName = isAnonymous ? 'Anonymous' : (note.author_name || 'Unknown Player');
  const gameLabel = note.game_name || 'Poker Night';
  const gameDate = formatDate(note.game_date);
  const initial = displayName.charAt(0).toUpperCase();
  const avatarColor = getAvatarColor(displayName);

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
        <div className={`w-9 h-9 rounded-full border flex items-center justify-center flex-shrink-0 font-heading font-bold text-sm ${avatarColor}`}>
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">
            {displayName}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {gameLabel}{gameDate && ` · ${gameDate}`}
          </p>
        </div>
        {isAnonymous && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground uppercase tracking-wide flex-shrink-0">
            Anon
          </span>
        )}
        {canDelete && !confirming && (
          <button
            onClick={() => setConfirming(true)}
            className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0 p-1"
            aria-label="Delete note"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="flex items-start gap-2">
        <MessageSquare className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
        <p className="text-sm text-foreground leading-relaxed">{note.note}</p>
      </div>
      {confirming && (
        <div className="flex items-center justify-end gap-2 pt-1 border-t border-border">
          <span className="text-xs text-muted-foreground mr-auto">Delete this note?</span>
          <button
            onClick={() => setConfirming(false)}
            disabled={deleting}
            className="text-xs px-3 py-1.5 rounded-md border border-border text-foreground hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-xs px-3 py-1.5 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors flex items-center gap-1"
          >
            {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
