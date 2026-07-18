import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useActiveGroup } from '@/lib/ActiveGroupContext';
import { todayLocalISO } from '@/lib/format';

export default function NewSession() {
  const navigate = useNavigate();
  const { activeGroupId, activeGroup } = useActiveGroup();
  const [name, setName] = useState('Whist Night');
  const [sessionDate, setSessionDate] = useState(todayLocalISO());
  const [location, setLocation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const scoringMethod = activeGroup?.scoring_method_default === 'progressive' ? 'Progressive' : 'Classic';
  const advanced = !!activeGroup?.advanced_rules_default;

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
      });
      const session = res.data.session;
      navigate(`/session/${session.id}`, { replace: true });
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to start session.';
      // If a session is already open, jump to it.
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

        <div className="rounded-lg border border-border bg-secondary/50 p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Rules for this session (from group defaults):</p>
          <p>Scoring: <span className="text-foreground">{scoringMethod}</span></p>
          <p>Advanced rules (trump + hierarchy): <span className="text-foreground">{advanced ? 'On' : 'Off'}</span></p>
          <p className="italic">These are frozen for the whole night. Change group defaults in Admin.</p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" disabled={submitting || !activeGroupId} className="w-full">
          {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Starting…</> : 'Start Session'}
        </Button>
      </form>
    </div>
  );
}
