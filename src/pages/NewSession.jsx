import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useActiveGroup } from '@/lib/ActiveGroupContext';
import { todayLocalISO, errorMessage } from '@/lib/format';
import { SCORING_METHOD_SUMMARY } from '@/lib/scoring-help';
import ErrorState from '@/components/ErrorState';
import { dirAuto } from '@/components/UserText';

export default function NewSession() {
  const navigate = useNavigate();
  const { activeGroupId, activeGroup } = useActiveGroup();
  const [name, setName] = useState('Whist Night');
  const [sessionDate, setSessionDate] = useState(todayLocalISO());
  const [location, setLocation] = useState('');
  // Seeded from the group defaults, but chosen per session and frozen for the night.
  const [scoringMethod, setScoringMethod] = useState(
    activeGroup?.scoring_method_default === 'progressive' ? 'progressive' : 'classic'
  );
  const [advancedRules, setAdvancedRules] = useState(!!activeGroup?.advanced_rules_default);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!activeGroupId) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await base44.functions.invoke('startSession', {
        group_id: activeGroupId,
        name: name.trim(),
        session_date: sessionDate,
        location: location.trim(),
        scoring_method: scoringMethod,
        advanced_rules_enabled: advancedRules,
      });
      const session = res.data.session;
      navigate(`/session/${session.id}`, { replace: true });
    } catch (err) {
      const msg = errorMessage(err, 'Failed to start session.');
      const openId = err.response?.data?.open_session_id;
      if (openId) { navigate(`/session/${openId}`, { replace: true }); return; }
      setError(msg);
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 min-h-11 pr-2 -my-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <h1 className="page-title">New session</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Session name</Label>
          <Input id="name" {...dirAuto} value={name} onChange={(e) => setName(e.target.value)} placeholder="Whist Night" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="date">Date</Label>
          <Input id="date" type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="location">Location (optional)</Label>
          <Input id="location" {...dirAuto} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Dana's place" />
        </div>

        {/* Scoring rules — chosen per session, frozen once the night starts */}
        <div className="space-y-1.5">
          <Label>Scoring method</Label>
          <div className="flex gap-2">
            {['classic', 'progressive'].map((m) => (
              <button key={m} type="button" onClick={() => setScoringMethod(m)}
                aria-pressed={scoringMethod === m}
                className={`flex-1 min-h-11 py-2 rounded-lg text-sm font-medium capitalize ${scoringMethod === m ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'}`}>
                {m}
              </button>
            ))}
          </div>
          {/* The numbers come from the scoring engine (scoring-help.js), not from this file. */}
          <p className="text-xs text-muted-foreground">
            Classic: {SCORING_METHOD_SUMMARY.classic}. Progressive: {SCORING_METHOD_SUMMARY.progressive}.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/40 p-3">
          <div>
            <Label htmlFor="advanced-rules">Advanced rules</Label>
            <p className="text-xs text-muted-foreground mt-1">Each round must record who won the trump, the suit, and the card order they chose.</p>
          </div>
          <Switch id="advanced-rules" checked={advancedRules} onCheckedChange={setAdvancedRules} />
        </div>

        <p className="text-xs text-muted-foreground">
          These rules can't be changed once the session has started. (The starting choice comes from the group — a group admin can change it in Admin.)
        </p>

        <ErrorState inline message={error} />

        <Button type="submit" size="lg" disabled={submitting || !activeGroupId} className="w-full">
          {submitting ? <><Loader2 className="animate-spin" /> Starting…</> : 'Start session'}
        </Button>
      </form>
    </div>
  );
}
