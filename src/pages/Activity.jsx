import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useActiveGroup } from '@/lib/ActiveGroupContext';
import { Bell, MessageSquare, MessageCircle, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import PlayerAvatar from '@/components/PlayerAvatar';
import { Name, UserText } from '@/components/UserText';
import { formatDate, errorMessage } from '@/lib/format';

// When a note was written, in the words people use: "today", "yesterday", "3 days ago",
// and the date itself once it is a week or more old.
function writtenWhen(timestamp) {
  const then = new Date(timestamp);
  if (Number.isNaN(then.getTime())) return '';
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(then)) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDate(timestamp);
}

// The Activity tab: the notes left in every group the user belongs to, newest first.
// Opening this page marks everything as seen (a timestamp on the server, so it holds on
// every device), which clears the badge on the tab.
export default function Activity() {
  const { user, isAuthenticated, isLoadingAuth } = useAuth();
  const { setActiveGroup } = useActiveGroup();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isLoadingAuth) return;
    if (!isAuthenticated || !user) {
      setLoading(false);
      return;
    }
    loadFeed();
  }, [isLoadingAuth, isAuthenticated, user]);

  const loadFeed = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await base44.functions.invoke('getActivityFeed', { mark_seen: true });
      setNotes(res.data.notes || []);
    } catch (err) {
      console.error(err);
      setError(errorMessage(err, "Couldn't load the activity."));
    } finally {
      setLoading(false);
    }
  };

  // Open the player's page in the note's own group, on the notes, with this note in view.
  const openNote = (n) => {
    setActiveGroup(n.group_id);
    navigate(`/player/${n.target_player_id}#table-talk`, { state: { noteId: n.id } });
  };

  if (isLoadingAuth || loading) {
    return <LoadingSpinner showLogo />;
  }

  if (!isAuthenticated || !user) {
    return (
      <EmptyState as="h1" icon={Bell} title="Activity"
        description="Sign in to see the latest table talk from your whist groups."
        action={<Button asChild><Link to="/login"><LogIn />Sign in</Link></Button>} />
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="page-title">Activity</h1>

      {error ? (
        <ErrorState title="Couldn't load the activity" message={error} onRetry={loadFeed} />
      ) : notes.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title="No activity yet"
          description="When someone leaves a note in one of your groups, it'll show up here."
        />
      ) : (
        <div className="space-y-3">
          {notes.map(n => {
            // A signed note carries its author's player name, and names are unique within a
            // group — so a note under the viewer's own name in that group is the viewer's.
            // The server says which notes the caller wrote; matching by display name would also
            // claim a note by another player with the same name in a different group.
            const isMine = !!n.is_mine;
            const displayAuthor = n.is_anonymous ? 'Anonymous' : n.author_name;
            return (
              <button
                key={n.id}
                onClick={() => openNote(n)}
                className={`w-full text-left bg-card border rounded-lg p-4 space-y-2 transition-colors hover:border-primary/50 ${
                  n.is_about_me ? 'border-primary/50 bg-primary/5' : 'border-border'
                }`}
              >
                <div className="flex items-start gap-3">
                  <PlayerAvatar name={displayAuthor} />
                  <div className="min-w-0 flex-1">
                    {/* Each name is isolated, so a Hebrew name cannot reorder the sentence around it. */}
                    <p className="text-sm text-foreground">
                      <span className="font-medium">{isMine ? 'You' : <Name>{displayAuthor}</Name>}</span>
                      <span className="text-muted-foreground"> left a note about </span>
                      <span className={`font-medium ${n.is_about_me ? 'text-primary' : ''}`}>
                        {n.is_about_me ? 'you' : <Name>{n.target_player_name}</Name>}
                      </span>
                    </p>
                    {/* A session's name always goes with that session's own date; the day
                        the note was written is said as such. */}
                    <p className="text-xs text-muted-foreground">
                      <UserText>{n.group_name}</UserText>
                      {n.game_name ? <> · <UserText>{n.game_name}</UserText>{n.game_date ? `, ${formatDate(n.game_date)}` : ''}</> : ''}
                      {' · '}written {writtenWhen(n.created_date)}
                    </p>
                  </div>
                  {n.is_unseen && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium flex-shrink-0">
                      New
                    </span>
                  )}
                </div>
                <div className="flex items-start gap-2">
                  <MessageSquare className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-1" aria-hidden="true" />
                  {/* The note keeps its own direction: a Hebrew note reads right-to-left and aligns right. */}
                  <UserText as="p" className="min-w-0 flex-1 text-start text-sm text-foreground leading-relaxed line-clamp-3 break-words">{n.note}</UserText>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
