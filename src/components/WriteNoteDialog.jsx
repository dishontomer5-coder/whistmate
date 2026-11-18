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
  const [note, setNote] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState('none');
  const [sharedSessions, setSharedSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && user && targetPlayerId) {
      loadSharedSessions();
    }
  }, [open, user, targetPlayerId, activeGroupId]);

  useEffect(() => {
    if (open) {
      setNote('');
      setIsAnonymous(false);
      setSelectedSessionId('none');
      setError('');
    }
  }, [open]);

  // The whist nights both players sat at — a note can be pinned to one (P12-4).
  // Worked out server-side: getGroupData checks group membership (P12-1).
  const loadSharedSessions = async () => {
    if (!activeGroupId) {
      setSharedSessions([]);
      return;
    }
    try {
      setLoadingSessions(true);
      const res = await base44.functions.invoke('getGroupData', { scope: 'shared_sessions', player_id: targetPlayerId });
      setSharedSessions(res.data.sessions || []);
    } catch (err) {
      console.error(err);
      setSharedSessions([]);
    } finally {
      setLoadingSessions(false);
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
        session_id: selectedSessionId !== 'none' ? selectedSessionId : undefined
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
              Link to Session (Optional)
            </label>
            {loadingSessions ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading shared sessions...
              </div>
            ) : (
              <Select value={selectedSessionId} onValueChange={setSelectedSessionId}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Select a shared session" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">General note (no specific session)</SelectItem>
                  {sharedSessions.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name || 'Whist Night'} · {formatDate(s.session_date || s.created_date)}
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