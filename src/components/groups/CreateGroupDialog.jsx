import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus } from 'lucide-react';

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
      setError(err.response?.data?.error || err.message || 'Failed to create group.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading uppercase tracking-wide text-foreground">Create New Group</DialogTitle>
          <DialogDescription>Start a new whist circle. You'll be the admin. You'll pick the scoring rules when you start each session.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Group Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tuesday Whist Club" className="bg-background border-border" maxLength={60} />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Description (Optional)</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A short bio for your group" className="bg-background border-border" maxLength={200} />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Your Display Name</Label>
            <Input value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="How others will see you in this group" className="bg-background border-border" maxLength={30} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-border">Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting || !name.trim() || !playerName.trim()} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
            {submitting ? 'Creating...' : 'Create Group'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
