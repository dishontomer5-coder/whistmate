import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus } from 'lucide-react';
import ErrorState from '@/components/ErrorState';
import { dirAuto } from '@/components/UserText';
import { errorMessage } from '@/lib/format';

export default function CreateGroupDialog({ open, onOpenChange, onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setName(''); setDescription(''); setPlayerName(''); setError(''); }
  }, [open]);

  const handleSubmit = async () => {
    if (!name.trim() || !playerName.trim()) {
      setError('Group name and your display name are required.');
      return;
    }
    try {
      setSubmitting(true);
      setError('');
      const res = await base44.functions.invoke('createGroup', {
        name: name.trim(),
        description: description.trim(),
        player_name: playerName.trim(),
      });
      onOpenChange(false);
      if (onCreated) onCreated(res.data.group, res.data.groups);
    } catch (err) {
      setError(errorMessage(err, 'Failed to create group.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create a group</DialogTitle>
          <DialogDescription>Start a new whist circle. You'll be the admin. You'll pick the scoring rules when you start each session.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-group-name">Group name</Label>
            <Input id="new-group-name" {...dirAuto} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tuesday Whist Club" maxLength={60} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-group-description">Description (optional)</Label>
            <Input id="new-group-description" {...dirAuto} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A short bio for your group" maxLength={200} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-group-player">Your display name</Label>
            <Input id="new-group-player" {...dirAuto} value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="How others will see you in this group" maxLength={30} />
          </div>

          <ErrorState inline message={error} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting || !name.trim() || !playerName.trim()}>
            {submitting ? <Loader2 className="animate-spin" /> : <Plus />}
            {submitting ? 'Creating...' : 'Create group'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
