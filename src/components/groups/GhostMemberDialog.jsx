import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, UserPlus } from 'lucide-react';

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
      setError(err.response?.data?.error || err.message || 'Failed to add member.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading uppercase tracking-wide text-foreground">
            Add Player
          </DialogTitle>
          <DialogDescription>
            Add a player who hasn't created an account yet. They can claim their profile later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
              Player Name
            </Label>
            <Input
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="e.g. Daniel"
              className="bg-background border-border"
              maxLength={30}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !submitting && playerName.trim()) {
                  handleSubmit();
                }
              }}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-border">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !playerName.trim()}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <UserPlus className="w-4 h-4 mr-1" />}
            {submitting ? 'Adding...' : 'Add Player'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}