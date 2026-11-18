import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, UserPlus } from 'lucide-react';
import ErrorState from '@/components/ErrorState';
import { dirAuto } from '@/components/UserText';
import { errorMessage } from '@/lib/format';

export default function GhostMemberDialog({ open, onOpenChange, groupId, onAdded }) {
  const [playerName, setPlayerName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setPlayerName('');
      setError('');
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!playerName.trim()) {
      setError('Player name is required.');
      return;
    }
    try {
      setSubmitting(true);
      setError('');
      const res = await base44.functions.invoke('addGhostMember', {
        group_id: groupId,
        player_name: playerName.trim()
      });
      onOpenChange(false);
      if (onAdded) onAdded(res.data.member);
    } catch (err) {
      setError(errorMessage(err, 'Failed to add player.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add player</DialogTitle>
          <DialogDescription>
            Add a player who doesn't have an account yet. They can claim this player later, with its history.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-player-name">Player name</Label>
            <Input
              id="new-player-name"
              {...dirAuto}
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="e.g. Daniel"
              maxLength={30}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !submitting && playerName.trim()) {
                  handleSubmit();
                }
              }}
            />
          </div>

          <ErrorState inline message={error} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !playerName.trim()}
          >
            {submitting ? <Loader2 className="animate-spin" /> : <UserPlus />}
            {submitting ? 'Adding...' : 'Add player'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}