import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useActiveGroup } from '@/lib/ActiveGroupContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, MessageSquarePlus } from 'lucide-react';
import { formatDate } from '@/lib/format';

export default function WriteNoteDialog({ open, onOpenChange, targetPlayerId, targetPlayerName, onSubmitted }) {
  const { user } = useAuth();
  const { activeGroupId } = useActiveGroup();
  const [myMember, setMyMember] = useState(null);
  const [note, setNote] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [selectedGameId, setSelectedGameId] = useState('none');
  const [sharedGames, setSharedGames] = useState([]);
  const [loadingGames, setLoadingGames] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && user && targetPlayerId) {
      loadSharedGames();
    }
  }, [open, user, targetPlayerId, activeGroupId]);

  useEffect(() => {
    if (open) {
      setNote('');
      setIsAnonymous(false);
      setSelectedGameId('none');
      setError('');
    }
  }, [open]);

  const loadSharedGames = async () => {
    try {
      setLoadingGames(true);
      // Author identity comes from GroupMember in the active group — the legacy
      // Player entity is deprecated and empty for post-migration users (P0-4)
      if (!activeGroupId) {
        setSharedGames([]);
        return;
      }
      const myMembers = await base44.entities.GroupMember.filter({ group_id: activeGroupId, user_id: user.id });
      if (myMembers.length === 0) {
        setMyMember(null);
        setSharedGames([]);
        return;
      }
      setMyMember(myMembers[0]);
      const [myGamePlayers, targetGamePlayers] = await Promise.all([
        base44.entities.GamePlayer.filter({ player_id: myMembers[0].id }),
        base44.entities.GamePlayer.filter({ player_id: targetPlayerId })
      ]);
      const myGameIds = new Set(myGamePlayers.map(gp => gp.game_id));
      const sharedIds = targetGamePlayers.map(gp => gp.game_id).filter(gid => myGameIds.has(gid));
      if (sharedIds.length === 0) {
        setSharedGames([]);
        return;
      }
      const games = await Promise.all(sharedIds.map(gid => base44.entities.Game.get(gid).catch(() => null)));
      setSharedGames(games.filter(g => g).sort((a, b) => new Date(b.game_date || b.created_date) - new Date(a.game_date || a.created_date)));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingGames(false);
    }
  };

  const handleSubmit = async () => {
    if (!note.trim()) {
      setError('Please write a note before submitting.');
      return;
    }
    try {
      setSubmitting(true);
      setError('');
      // Via createNote — author is derived server-side; anonymous notes store no
      // identity at all. Direct TableTalkNote writes are blocked by RLS (P9-7).
      await base44.functions.invoke('createNote', {
        group_id: activeGroupId,
        target_player_id: targetPlayerId,
        note: note.trim(),
        is_anonymous: isAnonymous,
        game_id: selectedGameId !== 'none' ? selectedGameId : undefined
      });
      onOpenChange(false);
      if (onSubmitted) onSubmitted();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to submit note.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading uppercase tracking-wide text-foreground">
            Scouting Note
          </DialogTitle>
          <DialogDescription>
            Leave a public note about {targetPlayerName || 'this player'}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground uppercase tracking-wide font-medium block">
              Your Note
            </label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Share your thoughts on their play style..."
              className="bg-background border-border min-h-[100px] resize-none"
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground text-right">{note.length}/500</p>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground uppercase tracking-wide font-medium block">
              Link to Game (Optional)
            </label>
            {loadingGames ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading shared games...
              </div>
            ) : (
              <Select value={selectedGameId} onValueChange={setSelectedGameId}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Select a shared game" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">General note (no specific game)</SelectItem>
                  {sharedGames.map(g => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name || 'Poker Night'} · {formatDate(g.game_date || g.created_date)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex items-center justify-between bg-card border border-border rounded-lg p-3">
            <div>
              <p className="text-sm font-medium text-foreground">Post Anonymously</p>
              <p className="text-xs text-muted-foreground">Your name is never stored — truly anonymous.</p>
            </div>
            <Switch checked={isAnonymous} onCheckedChange={setIsAnonymous} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-border">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !note.trim()} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <MessageSquarePlus className="w-4 h-4 mr-1" />}
            {submitting ? 'Submitting...' : 'Submit Note'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}