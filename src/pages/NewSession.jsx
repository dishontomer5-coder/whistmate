import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useActiveGroup } from '@/lib/ActiveGroupContext';
import { todayLocalISO } from '@/lib/format';

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
      const msg = err.response?.data?.error || err.message || 'Failed to start session.';
      const openId = err.response?.data?.open_session_id;
      if (openId) { navigate(`/session/${openId}`, { replace: true }); return; }
      setError(msg);
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <h1 className="font-heading text-2xl font-bold text-foreground uppercase tracking-wide">New Session</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Session name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Whist Night" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="date">Date</Label>
          <Input id="date" type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="location">Location (optional)</Label>
          <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Dana's place" />
        </div>

        {/* Scoring rules — chosen per session, frozen once the night starts */}
        <div className="space-y-1.5">
          <Label>Scoring method</Label>
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

        <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 p-3">
          <div>
            <Label>Advanced rules</Label>
            <p className="text-[11px] text-muted-foreground">Highest bidder picks trump suit + hierarchy each round.</p>
          </div>
          <Switch checked={advancedRules} onCheckedChange={setAdvancedRules} />
        </div>

        <p className="text-[11px] text-muted-foreground italic">
          These rules are frozen for the whole session. (Defaults come from the group — a group admin can change them in Admin.)
        </p>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" disabled={submitting || !activeGroupId} className="w-full">
          {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Starting…</> : 'Start Session'}
        </Button>
      </form>
    </div>
  );
}
