import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Save, Loader2, Copy, Check, RefreshCw, Share2 } from 'lucide-react';
import GroupDangerZone from '@/components/admin/GroupDangerZone';

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
      setError(err.response?.data?.error || err.message || 'Failed to save settings.');
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
    const text = `Join our whist group "${group.name}" on Israeli Whist: ${link}`;
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
      setError(err.response?.data?.error || 'Failed to regenerate code.');
    } finally {
      setRegenerating(false);
    }
  };

  if (!group) return null;

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-lg p-4 space-y-4">
        <h2 className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Group Settings</h2>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Group Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-background border-border" maxLength={60} />
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Description</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A short bio for your group" className="bg-background border-border" maxLength={200} />
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Default Scoring Method</Label>
          <div className="flex gap-2">
            {['classic', 'progressive'].map((m) => (
              <button key={m} type="button" onClick={() => setScoringMethod(m)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize ${scoringMethod === m ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'}`}>
                {m}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">Applies to new sessions. Existing sessions keep the method they were created with.</p>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Advanced Rules by Default</Label>
            <p className="text-[11px] text-muted-foreground">Highest bidder picks trump suit + hierarchy.</p>
          </div>
          <Switch checked={advancedRules} onCheckedChange={setAdvancedRules} />
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>

      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <h2 className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Invite Code</h2>
        <p className="text-xs text-muted-foreground">Share this code with players so they can join your group.</p>
        <div className="flex gap-2">
          <Input value={group.invite_code || ''} readOnly className="bg-background border-border text-center text-2xl font-mono tracking-widest font-bold" />
          <Button onClick={handleCopyInvite} variant="outline" size="icon" className="border-border flex-shrink-0">
            {inviteCopied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
          </Button>
        </div>
        <Button onClick={handleShareLink} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
          {linkShared ? <Check className="w-4 h-4 mr-2" /> : <Share2 className="w-4 h-4 mr-2" />}
          {linkShared ? 'Link copied!' : 'Share Invite Link'}
        </Button>
        <Button onClick={handleRegenerateCode} variant="ghost" disabled={regenerating} className="text-muted-foreground hover:text-foreground w-full">
          {regenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          {regenerating ? 'Regenerating...' : 'Regenerate Code'}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive text-center">{error}</p>}

      <GroupDangerZone group={group} onGroupChanged={onSaved} />
    </div>
  );
}
