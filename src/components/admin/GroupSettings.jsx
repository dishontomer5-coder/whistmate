import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Save, Loader2, Copy, Check, RefreshCw, Share2 } from 'lucide-react';
import GroupDangerZone from '@/components/admin/GroupDangerZone';
import ErrorState from '@/components/ErrorState';
import { dirAuto } from '@/components/UserText';
import { errorMessage } from '@/lib/format';

export default function GroupSettings({ group, onSaved }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scoringMethod, setScoringMethod] = useState('classic');
  const [advancedRules, setAdvancedRules] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [linkShared, setLinkShared] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (group) {
      setName(group.name || '');
      setDescription(group.description || '');
      setScoringMethod(group.scoring_method_default === 'progressive' ? 'progressive' : 'classic');
      setAdvancedRules(!!group.advanced_rules_default);
    }
  }, [group]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');
      const res = await base44.functions.invoke('updateGroupSettings', {
        group_id: group.id,
        updates: {
          name: name.trim(),
          description: description.trim(),
          scoring_method_default: scoringMethod,
          advanced_rules_default: advancedRules,
        }
      });
      if (onSaved) onSaved(res.data.group);
    } catch (err) {
      setError(errorMessage(err, 'Failed to save settings.'));
    } finally {
      setSaving(false);
    }
  };

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(group.invite_code);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  };

  const handleShareLink = async () => {
    const link = `${window.location.origin}/join?code=${group.invite_code}`;
    const text = `Join our whist group "${group.name}" on WhistMate: ${link}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Join my whist group', text, url: link });
      } else {
        await navigator.clipboard.writeText(link);
        setLinkShared(true);
        setTimeout(() => setLinkShared(false), 2000);
      }
    } catch { /* user dismissed the share sheet */ }
  };

  const handleRegenerateCode = async () => {
    try {
      setRegenerating(true);
      const res = await base44.functions.invoke('regenerateInviteCode', { group_id: group.id });
      if (onSaved) onSaved(res.data.group);
    } catch (err) {
      setError(errorMessage(err, 'Failed to regenerate code.'));
    } finally {
      setRegenerating(false);
    }
  };

  if (!group) return null;

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-lg p-4 space-y-4">
        <h2 className="section-title">Group settings</h2>

        <div className="space-y-2">
          <Label htmlFor="group-name">Group name</Label>
          <Input id="group-name" {...dirAuto} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="group-description">Description</Label>
          <Input id="group-description" {...dirAuto} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A short bio for your group" maxLength={200} />
        </div>

        <div className="space-y-2">
          <Label>Default scoring method</Label>
          <div className="flex gap-2">
            {['classic', 'progressive'].map((m) => (
              <button key={m} type="button" onClick={() => setScoringMethod(m)}
                aria-pressed={scoringMethod === m}
                className={`flex-1 min-h-11 py-2 rounded-lg text-sm font-medium capitalize ${scoringMethod === m ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'}`}>
                {m}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Applies to new sessions. Existing sessions keep the method they were created with.</p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div>
            <Label htmlFor="advanced-default">Advanced rules by default</Label>
            <p className="text-xs text-muted-foreground mt-1">Each round must record who won the trump, the suit, and the card order they chose.</p>
          </div>
          <Switch id="advanced-default" checked={advancedRules} onCheckedChange={setAdvancedRules} />
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          {saving ? 'Saving...' : 'Save settings'}
        </Button>
      </div>

      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <h2 className="section-title">Invite code</h2>
        <p className="text-sm text-muted-foreground">Share this code with players so they can join your group.</p>
        <div className="flex gap-2">
          <Input value={group.invite_code || ''} readOnly aria-label="Invite code" className="text-center text-2xl font-mono tracking-widest font-bold" />
          <Button onClick={handleCopyInvite} variant="outline" size="icon" aria-label={inviteCopied ? 'Invite code copied' : 'Copy invite code'}>
            {inviteCopied ? <Check className="text-primary" /> : <Copy />}
          </Button>
        </div>
        <Button onClick={handleShareLink} className="w-full">
          {linkShared ? <Check /> : <Share2 />}
          {linkShared ? 'Link copied!' : 'Share invite link'}
        </Button>
        <Button onClick={handleRegenerateCode} variant="ghost" disabled={regenerating} className="text-muted-foreground hover:text-foreground w-full">
          {regenerating ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {regenerating ? 'Regenerating...' : 'Regenerate code'}
        </Button>
      </div>

      <ErrorState inline message={error} />

      <GroupDangerZone group={group} onGroupChanged={onSaved} />
    </div>
  );
}
