import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { MessageCircle } from 'lucide-react';
import TableTalkCard from './TableTalkCard';
import LoadingSpinner from './LoadingSpinner';
import EmptyState from './EmptyState';
import ErrorState from './ErrorState';
import { useAuth } from '@/lib/AuthContext';
import { useActiveGroup } from '@/lib/ActiveGroupContext';
import { errorMessage } from '@/lib/format';

// The notes about one player, newest first, under the heading "Table talk".
//
//   playerId          whose notes.
//   refreshKey        change it to read the notes again (after one was posted).
//   action            what sits at the head of the section, beside the title — the
//                     "Leave a note" button.
//   isGroupAdmin      the viewer is an admin of the player's group and may delete any note
//                     (default: their role in the active group).
//   readOnly          the group is archived: nobody deletes a note (except an app admin,
//                     whose moderation the server still allows).
//   highlightNoteId   a note the reader came for: it is scrolled to and outlined.
//   emptyDescription  the line shown when there are no notes.
export default function TableTalkFeed({ playerId, refreshKey = 0, action, isGroupAdmin, readOnly = false, highlightNoteId, emptyDescription = 'Notes about this player will show up here.' }) {
  const { user } = useAuth();
  const { isAdmin: isAdminOfActiveGroup } = useActiveGroup();
  const isAppAdmin = user?.role === 'admin';
  const canDelete = (note) => isAppAdmin || (!readOnly && (!!note.is_mine || (isGroupAdmin ?? isAdminOfActiveGroup)));
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const latestRequest = useRef(0);

  useEffect(() => {
    loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, refreshKey]);

  const loadNotes = async () => {
    const request = ++latestRequest.current;
    try {
      setLoading(true);
      setError('');
      // Notes are read through getPlayerNotes (membership-checked, P12-1). It never sends
      // an author's user id — it flags the caller's own notes with `is_mine` instead.
      const res = await base44.functions.invoke('getPlayerNotes', { player_id: playerId });
      if (request !== latestRequest.current) return; // an answer for a player no longer on screen
      setNotes(res.data.notes || []);
    } catch (err) {
      if (request !== latestRequest.current) return;
      console.error(err);
      setError(errorMessage(err, "Couldn't load the notes."));
    } finally {
      if (request === latestRequest.current) setLoading(false);
    }
  };

  return (
    <section id="table-talk" className="scroll-mt-20 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-primary" aria-hidden="true" />
          <h2 className="section-label">Table talk</h2>
        </div>
        {action}
      </div>

      {loading ? (
        <LoadingSpinner className="py-8" />
      ) : error ? (
        <ErrorState title="Couldn't load the notes" message={error} onRetry={loadNotes} />
      ) : notes.length === 0 ? (
        <EmptyState compact icon={MessageCircle} title="No notes yet" description={emptyDescription} />
      ) : (
        <div className="space-y-3">
          {notes.map(note => (
            <TableTalkCard
              key={note.id}
              note={note}
              highlight={!!highlightNoteId && note.id === highlightNoteId}
              canDelete={canDelete(note)}
              onDeleted={(id) => setNotes(prev => prev.filter(n => n.id !== id))}
            />
          ))}
        </div>
      )}
    </section>
  );
}
