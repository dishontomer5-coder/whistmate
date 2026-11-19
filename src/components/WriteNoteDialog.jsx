import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useActiveGroup } from '@/lib/ActiveGroupContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, MessageSquarePlus } from 'lucide-react';
import { formatDate, sessionName, errorMessage } from '@/lib/format';
import ErrorState from '@/components/ErrorState';
import { Name, UserText, dirAuto } from '@/components/UserText';

// A note about one player.
//   groupId   the player's group (default: the active group). The player page passes the
//             group of the player on screen, which is where the note belongs.
export default function WriteNoteDialog({ open, onOpenChange, targetPlayerId, targetPlayerName, groupId, onSubmitted }) {
  const { user } = useAuth();
  const { activeGroupId, membershipIn } = useActiveGroup();
  const noteGroupId = groupId || activeGroupId;
  // A group admin can delete any note; anyone else cannot delete an anonymous one — not
  // even their own, since it is stored without an author (qa-tester-3).
  const isGroupAdmin = noteGroupId ? membershipIn(noteGroupId)?.role === 'admin' : false;
  const [note, setNote] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState('none');
  const [sharedSessions, setSharedSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // Set at once on the first tap, before React re-renders the disabled button, so a quick
  // second tap sends nothing (the server also refuses a copy sent within 10 seconds).
  const sending = useRef(false);

  useEffect(() => {
    if (open && user && targetPlayerId) {
      loadSharedSessions();
    }
  }, [open, user, targetPlayerId, noteGroupId]);

  useEffect(() => {
    if (open) {
      setNote('');
      setIsAnonymous(false);
      setSelectedSessionId('none');
      setError('');
    }
  }, [open]);

  // The sessions both players sat at — a note can be pinned to one (P12-4).
  // Worked out server-side: getGroupData checks group membership (P12-1).
  const loadSharedSessions = async () => {
    if (!noteGroupId) {
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
    if (sending.current) return;
    if (!note.trim()) {
      setError('Write the note first.');
      return;
    }
    try {
      sending.current = true;
      setSubmitting(true);
      setError('');
      // Via createNote — author is derived server-side; anonymous notes store no
      // identity at all. Direct TableTalkNote writes are blocked by RLS (P9-7).
      await base44.functions.invoke('createNote', {
        group_id: noteGroupId,
        target_player_id: targetPlayerId,
        note: note.trim(),
        is_anonymous: isAnonymous,
        session_id: selectedSessionId !== 'none' ? selectedSessionId : undefined
      });
      onOpenChange(false);
      if (onSubmitted) onSubmitted();
    } catch (err) {
      setError(errorMessage(err, "Couldn't post the note."));
    } finally {
      sending.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Leave a note</DialogTitle>
          <DialogDescription>
            A note about {targetPlayerName ? <Name>{targetPlayerName}</Name> : 'this player'}, visible to everyone in the group.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="note-text">Your note</Label>
            <Textarea
              id="note-text"
              {...dirAuto}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="How do they play? What happened at the table?"
              className="min-h-[100px] resize-none"
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground text-right">{note.length}/500</p>
          </div>

          <div className="space-y-2">
            <Label>Link to a session (optional)</Label>
            {loadingSessions ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading the sessions you both played…
              </div>
            ) : (
              <Select value={selectedSessionId} onValueChange={setSelectedSessionId}>
                <SelectTrigger aria-label="Link to a session">
                  <SelectValue placeholder="Choose a session" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">General note (no session)</SelectItem>
                  {sharedSessions.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      <UserText>{sessionName(s)}</UserText> · {formatDate(s.session_date || s.created_date)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 bg-background border border-border rounded-lg p-3">
            <div>
              <p className="text-sm font-medium text-foreground">Post anonymously</p>
              <p className="text-xs text-muted-foreground">Your name is not stored with the note.</p>
            </div>
            <Switch checked={isAnonymous} onCheckedChange={setIsAnonymous} aria-label="Post anonymously" />
          </div>
          {isAnonymous && !isGroupAdmin && (
            <p role="note" className="text-xs text-muted-foreground -mt-2">
              Only a group admin can delete an anonymous note — not even you.
            </p>
          )}

          <ErrorState inline message={error} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !note.trim()}>
            {submitting ? <Loader2 className="animate-spin" /> : <MessageSquarePlus />}
            {submitting ? 'Posting…' : 'Post note'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
