import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { MessageCircle } from 'lucide-react';
import TableTalkCard from './TableTalkCard';
import LoadingSpinner from './LoadingSpinner';
import EmptyState from './EmptyState';
import { useAuth } from '@/lib/AuthContext';
import { useActiveGroup } from '@/lib/ActiveGroupContext';

export default function TableTalkFeed({ playerId, refreshKey = 0 }) {
  const { user } = useAuth();
  const { isAdmin } = useActiveGroup();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotes();
  }, [playerId, refreshKey]);

  const loadNotes = async () => {
    try {
      setLoading(true);
      // Notes are read through getPlayerNotes (membership-checked, P12-1). It never sends
      // an author's user id — it flags the caller's own notes with `is_mine` instead.
      const res = await base44.functions.invoke('getPlayerNotes', { player_id: playerId });
      setNotes(res.data.notes || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 mt-2">
      <div className="flex items-center gap-2">
        <MessageCircle className="w-4 h-4 text-primary" />
        <h2 className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
          Table Talk
        </h2>
      </div>

      {loading ? (
        <LoadingSpinner className="py-8" />
      ) : notes.length === 0 ? (
        <EmptyState icon="💬" title="No Notes Yet" description="Notes left by other players will show up here." />
      ) : (
        <div className="space-y-4">
          {notes.map(note => (
            <TableTalkCard
              key={note.id}
              note={note}
              canDelete={!!note.is_mine || isAdmin || user?.role === 'admin'}
              onDeleted={(id) => setNotes(prev => prev.filter(n => n.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}