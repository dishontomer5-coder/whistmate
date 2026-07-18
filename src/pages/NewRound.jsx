import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/LoadingSpinner';

// Table select: pick exactly 4 players (tap order = bidding order), then start the round.
export default function NewRound() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [session, setSession] = useState(null);
  const [members, setMembers] = useState([]);
  const [selected, setSelected] = useState([]); // ordered player_ids
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sessionId]);

  const load = async () => {
    try {
      setLoading(true);
      const sess = await base44.entities.Session.get(sessionId);
      setSession(sess);
      const res = await base44.functions.invoke('getGroupMembers', { group_id: sess.group_id });
      setMembers(res.data.members || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load roster.');
    } finally {
      setLoading(false);
    }
  };

  const toggle = (id) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      if (prev.length >= 4) return prev; // cap at 4
      return [...prev, id];
    });
  };

  const start = async () => {
    if (selected.length !== 4) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await base44.functions.invoke('startRound', { session_id: sessionId, player_ids: selected });
      navigate(`/round/${res.data.round.id}`, { replace: true });
    } catch (err) {
      const openId = err.response?.data?.open_round_id;
      if (openId) { navigate(`/round/${openId}`, { replace: true }); return; }
      setError(err.response?.data?.error || err.message || 'Failed to start round.');
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner showLogo />;

  return (
    <div className="space-y-6">
      <button onClick={() => navigate(`/session/${sessionId}`)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Session
      </button>
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground uppercase tracking-wide">Pick the Table</h1>
        <p className="text-sm text-muted-foreground mt-1">Select 4 players — tap order is the bidding order.</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {members.map((m) => {
          const idx = selected.indexOf(m.id);
          const picked = idx >= 0;
          return (
            <button key={m.id} onClick={() => toggle(m.id)}
              className={`relative flex items-center gap-2 rounded-lg border p-3 text-left transition-colors ${
                picked ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-primary/40'
              }`}>
              <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                picked ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
              }`}>
                {picked ? idx + 1 : (m.player_name || '?').charAt(0).toUpperCase()}
              </span>
              <span className="text-sm font-medium text-foreground truncate">{m.player_name}</span>
              {picked && <Check className="w-4 h-4 text-primary ml-auto flex-shrink-0" />}
            </button>
          );
        })}
      </div>

      {members.length < 4 && (
        <p className="text-xs text-muted-foreground">This group has fewer than 4 players — add members in Admin first.</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="fixed bottom-20 left-0 right-0 px-4">
        <div className="max-w-2xl mx-auto">
          <Button className="w-full" disabled={selected.length !== 4 || submitting} onClick={start}>
            {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Starting…</> : `Start Round (${selected.length}/4)`}
          </Button>
        </div>
      </div>
    </div>
  );
}
