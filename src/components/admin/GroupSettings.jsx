import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Save, Loader2, Check } from 'lucide-react';
import ErrorState from '@/components/ErrorState';
import { dirAuto } from '@/components/UserText';
import { SCORING_METHOD_LABEL, SCORING_METHOD_SUMMARY } from '@/lib/scoring-help';
import { adminError } from '@/components/admin/messages';

// The group's name, description and the defaults a new session starts with.
// A problem with the name is written under the name field; anything else the server
// refuses is written beside the Save button, and so is "Saved" when it worked.
// readOnly (an archived group): the values are shown, nothing can be edited.
export default function GroupSettings({ group, onSaved, readOnly = false }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scoringMethod, setScoringMethod] = useState('classic');
  const [advancedRules, setAdvancedRules] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [nameError, setNameError] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (group) {
      setName(group.name || '');
      setDescription(group.description || '');
      setScoringMethod(group.scoring_method_default === 'progressive' ? 'progressive' : 'classic');
      setAdvancedRules(!!group.advanced_rules_default);
    }
  }, [group]);

  // Any edit makes the last "Saved" untrue
  const edit = (set) => (value) => { set(value); setSaved(false); setError(''); };

  const handleSave = async () => {
    setSaved(false);
    setError('');
    setNameError('');
    if (!name.trim()) {
      setNameError('The group needs a name.');
      return;
    }
    try {
      setSaving(true);
      const res = await base44.functions.invoke('updateGroupSettings', {
        group_id: group.id,
        updates: {
          name: name.trim(),
          description: description.trim(),
          scoring_method_default: scoringMethod,
          advanced_rules_default: advancedRules,
        }
      });
      setSaved(true);
      if (onSaved) onSaved(res.data.group);
    } catch (err) {
      const message = adminError(err, "Couldn't save the settings.");
      if (/name/i.test(message)) setNameError(message);
      else setError(message);
    } finally {
      setSaving(false);
    }
  };

  if (!group) return null;

  return (
    <section className="bg-card border border-border rounded-lg p-4 space-y-4" aria-labelledby="group-settings-heading">
      <h2 id="group-settings-heading" className="section-title">Group settings</h2>

      <div className="space-y-2">
        <Label htmlFor="group-name">Group name</Label>
        <Input id="group-name" {...dirAuto} value={name} disabled={readOnly} maxLength={60}
          aria-invalid={nameError ? true : undefined}
          onChange={(e) => { edit(setName)(e.target.value); setNameError(''); }} />
        <ErrorState inline message={nameError} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="group-description">Description</Label>
        <Input id="group-description" {...dirAuto} value={description} disabled={readOnly} maxLength={200}
          onChange={(e) => edit(setDescription)(e.target.value)} placeholder="A short line about your group" />
      </div>

      <div className="space-y-2">
        <Label id="scoring-default-label">Default scoring method</Label>
        <div className="flex gap-2" role="group" aria-labelledby="scoring-default-label">
          {['classic', 'progressive'].map((m) => (
            <button key={m} type="button" onClick={() => edit(setScoringMethod)(m)} disabled={readOnly}
              aria-pressed={scoringMethod === m}
              className={`flex-1 min-h-11 py-2 rounded-lg border-2 text-sm font-medium disabled:opacity-60 ${scoringMethod === m ? 'border-primary bg-secondary text-foreground' : 'border-transparent bg-secondary text-muted-foreground'}`}>
              {SCORING_METHOD_LABEL[m]}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {SCORING_METHOD_LABEL[scoringMethod]}: {SCORING_METHOD_SUMMARY[scoringMethod]}. Applies to new sessions;
          a session keeps the method it was started with.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <Label htmlFor="advanced-default">Advanced rules by default</Label>
          <p id="advanced-default-help" className="text-xs text-muted-foreground mt-1">Each round must record who won the trump, the suit, and the card order they chose.</p>
        </div>
        <Switch id="advanced-default" checked={advancedRules} disabled={readOnly}
          aria-label="Advanced rules by default" aria-describedby="advanced-default-help"
          onCheckedChange={edit(setAdvancedRules)} />
      </div>

      {readOnly ? (
        <p className="text-sm text-muted-foreground">Unarchive the group to change its settings.</p>
      ) : (
        <div className="space-y-2">
          <ErrorState inline message={error} />
          {saved && (
            <p role="status" className="flex items-center gap-2 text-sm text-foreground">
              <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> Saved.
            </p>
          )}
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            {saving ? 'Saving...' : 'Save settings'}
          </Button>
        </div>
      )}
    </section>
  );
}
