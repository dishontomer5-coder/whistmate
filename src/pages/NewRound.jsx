import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, Loader2, Check, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorState from '@/components/ErrorState';
import PlayerAvatar from '@/components/PlayerAvatar';
import { Name } from '@/components/UserText';
import { errorMessage } from '@/lib/format';

// Table select: pick exactly 4 players (tap order = bidding order), then start the round.
export default function NewRound() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [session, setSession] = useState(null);
  const [members, setMembers] = useState([]);
  const [selected, setSelected] = useState([]); // ordered player_ids
  const [lastPlayers, setLastPlayers] = useState([]); // ordered player_ids from the previous round
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sessionId]);

  const load = async () => {
    try {
      setLoading(true);
      // Membership-checked read (P12-1) — the session with its rounds and results.
      const dataRes = await base44.functions.invoke('getGroupData', { scope: 'session', session_id: sessionId });
      const { session: sess, rounds = [], results = [] } = dataRes.data;
      setSession(sess);
      const membersRes = await base44.functions.invoke('getGroupMembers', { group_id: sess.group_id });
      const roster = membersRes.data.members || [];
      setMembers(roster);

      // Most recent round's table (in bid order), limited to players still on the roster.
      const prev = [...rounds].sort((a, b) => (b.round_number ?? 0) - (a.round_number ?? 0))[0];
      if (prev) {
        const rr = results.filter((r) => r.game_id === prev.id);
        const rosterIds = new Set(roster.map((m) => m.id));
        const ids = rr.sort((a, b) => (a.bid_order ?? 0) - (b.bid_order ?? 0))
          .map((r) => r.player_id)
          .filter((id) => rosterIds.has(id));
        if (ids.length === 4) setLastPlayers(ids);
      }
    } catch (err) {
      setError(errorMessage(err, 'Failed to load the players.'));
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
      setError(errorMessage(err, 'Failed to start round.'));
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner showLogo />;

  return (
    <div className="space-y-6">
      <button onClick={() => navigate(`/session/${sessionId}`)} className="flex items-center gap-1 min-h-11 pr-2 -my-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Session
      </button>
      <div>
        <h1 className="page-title">Pick the table</h1>
        <p className="text-sm text-muted-foreground mt-1">Select 4 players — tap order is the bidding order.</p>
      </div>

      {lastPlayers.length === 4 && (
        <button type="button" onClick={() => setSelected(lastPlayers)}
          className="w-full flex items-center justify-center gap-2 min-h-11 rounded-lg border border-primary/40 bg-primary/5 py-2.5 text-sm font-medium text-primary hover:bg-primary/10 transition-colors">
          <Users className="w-4 h-4" /> Same players as last round
        </button>
      )}

      <div className="grid grid-cols-2 gap-2">
        {members.map((m) => {
          const idx = selected.indexOf(m.id);
          const picked = idx >= 0;
          return (
            <button key={m.id} onClick={() => toggle(m.id)}
              aria-pressed={picked}
              className={`relative flex items-center gap-2 min-w-0 rounded-lg border p-3 text-left transition-colors ${
                picked ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-primary/40'
              }`}>
              {/* A picked player shows their place in the bidding order instead of the avatar. */}
              {picked ? (
                <span className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 bg-primary text-primary-foreground">
                  {idx + 1}
                </span>
              ) : (
                <PlayerAvatar name={m.player_name} size="sm" />
              )}
              <span className="text-sm font-medium text-foreground truncate"><Name>{m.player_name}</Name></span>
              {picked && <Check className="w-4 h-4 text-primary ml-auto flex-shrink-0" />}
            </button>
          );
        })}
      </div>

      {members.length < 4 && (
        <p className="text-sm text-muted-foreground">This group has fewer than 4 players — add players in Admin first.</p>
      )}
      <ErrorState inline message={error} />

      <div className="fixed bottom-20 left-0 right-0 px-4">
        <div className="max-w-2xl mx-auto">
          <Button size="lg" className="w-full" disabled={selected.length !== 4 || submitting} onClick={start}>
            {submitting ? <><Loader2 className="animate-spin" /> Starting…</> : `Start round (${selected.length}/4)`}
          </Button>
        </div>
      </div>
    </div>
  );
}
