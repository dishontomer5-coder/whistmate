import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Plus } from 'lucide-react';

export default function CreateGroupDialog({ open, onOpenChange, onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [scoringMethod, setScoringMethod] = useState('classic');
  const [advancedRules, setAdvancedRules] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName(''); setDescription(''); setPlayerName('');
      setScoringMethod('classic'); setAdvancedRules(false); setError('');
    }
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
        scoring_method_default: scoringMethod,
        advanced_rules_default: advancedRules,
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
          <DialogDescription>Start a new whist circle. You'll be the admin.</DialogDescription>
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

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Scoring Method</Label>
            <div className="flex gap-2">
              {['classic', 'progressive'].map((m) => (
                <button key={m} type="button" onClick={() => setScoringMethod(m)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize ${scoringMethod === m ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'}`}>
                  {m}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Classic = −10 per missed trick. Progressive = escalating penalty by miss size.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Advanced Rules</Label>
              <p className="text-[11px] text-muted-foreground">Highest bidder picks trump suit + hierarchy.</p>
            </div>
            <Switch checked={advancedRules} onCheckedChange={setAdvancedRules} />
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
