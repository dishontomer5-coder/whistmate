import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useActiveGroup } from '@/lib/ActiveGroupContext';
import { Activity as ActivityIcon, MessageSquare, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import { formatDate } from '@/lib/format';

const AVATAR_COLORS = [
  'bg-amber-500/20 text-amber-400',
  'bg-emerald-500/20 text-emerald-400',
  'bg-blue-500/20 text-blue-400',
  'bg-purple-500/20 text-purple-400',
  'bg-rose-500/20 text-rose-400',
  'bg-cyan-500/20 text-cyan-400',
];

function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// Cross-group table-talk feed (P8-2). Opening this page marks everything as
// seen (server-side timestamp — consistent across devices), which clears the
// badge on the Activity tab.
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
      setError(err.response?.data?.error || err.message || 'Failed to load activity.');
    } finally {
      setLoading(false);
    }
  };

  const openNote = (n) => {
    setActiveGroup(n.group_id);
    navigate(`/player/${n.target_player_id}`);
  };

  if (isLoadingAuth || loading) {
    return <LoadingSpinner showLogo />;
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-secondary border border-border flex items-center justify-center mb-5">
          <ActivityIcon className="w-8 h-8 text-muted-foreground" />
        </div>
        <h1 className="font-heading text-xl font-bold text-foreground uppercase tracking-wide mb-2">
          Activity
        </h1>
        <p className="text-sm text-muted-foreground max-w-xs mb-6">
          Sign in to see the latest table talk from your whist groups.
        </p>
        <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Link to="/login"><LogIn className="w-4 h-4 mr-1" />Sign In</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold text-foreground uppercase tracking-wide">
        Activity
      </h1>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-center space-y-2">
          <p className="text-sm text-destructive">Couldn't load activity.</p>
          <p className="text-xs text-muted-foreground break-words">{error}</p>
          <Button size="sm" variant="outline" className="border-border" onClick={loadFeed}>
            Try Again
          </Button>
        </div>
      ) : notes.length === 0 ? (
        <EmptyState
          icon="💬"
          title="No Activity Yet"
          description="When someone posts a scouting note in one of your groups, it'll show up here."
        />
      ) : (
        <div className="space-y-3">
          {notes.map(n => {
            const displayAuthor = n.is_anonymous ? 'Anonymous' : n.author_name;
            const avatarColor = getAvatarColor(displayAuthor || '?');
            return (
              <button
                key={n.id}
                onClick={() => openNote(n)}
                className={`w-full text-left bg-card border rounded-lg p-4 space-y-2 transition-colors hover:border-primary/50 ${
                  n.is_about_me ? 'border-primary/50 bg-primary/5' : 'border-border'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-heading font-bold text-sm ${avatarColor}`}>
                    {(displayAuthor || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground truncate">
                      <span className="font-medium">{displayAuthor}</span>
                      <span className="text-muted-foreground"> left a note about </span>
                      <span className={`font-medium ${n.is_about_me ? 'text-primary' : ''}`}>
                        {n.is_about_me ? 'you' : n.target_player_name}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {n.group_name}{n.game_name ? ` · ${n.game_name}` : ''} · {formatDate(n.created_date)}
                    </p>
                  </div>
                  {n.is_about_me && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium uppercase flex-shrink-0">
                      You
                    </span>
                  )}
                </div>
                <div className="flex items-start gap-2">
                  <MessageSquare className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-foreground leading-relaxed line-clamp-3">{n.note}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
