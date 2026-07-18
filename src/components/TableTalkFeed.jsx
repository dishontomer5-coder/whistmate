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
      const result = await base44.entities.TableTalkNote.filter(
        { target_player_id: playerId },
        '-created_date',
        50
      );
      setNotes(result);
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
              canDelete={(!!note.author_user_id && note.author_user_id === user?.id) || isAdmin || user?.role === 'admin'}
              onDeleted={(id) => setNotes(prev => prev.filter(n => n.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}