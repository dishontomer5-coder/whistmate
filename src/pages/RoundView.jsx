import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useActiveGroup } from '@/lib/ActiveGroupContext';
import { tableState, isBidSumLegal, highestBidderIndex, SUITS, HIERARCHIES } from '@/lib/scoring';
import { formatScore, formatSuit } from '@/lib/format';

const SUIT_LABEL = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣', notrump: 'NT' };
const HIER_LABEL = { standard: 'Standard (A high → 2 low)', down_up: 'Down-Up (A,2,3…K)' };

function NumberPad({ value, onPick, max = 13, disabled = [] }) {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {Array.from({ length: max + 1 }, (_, n) => {
        const isDisabled = disabled.includes(n);
        const active = value === n;
        return (
          <button key={n} type="button" disabled={isDisabled} onClick={() => onPick(n)}
            className={`aspect-square rounded-lg font-heading font-bold text-lg transition-colors ${
              active ? 'bg-primary text-primary-foreground'
              : isDisabled ? 'bg-secondary/40 text-muted-foreground/30 cursor-not-allowed line-through'
              : 'bg-secondary text-foreground hover:bg-secondary/70'
            }`}>
            {n}
          </button>
        );
      })}
    </div>
  );
}

export default function RoundView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useActiveGroup();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [round, setRound] = useState(null);
  const [session, setSession] = useState(null);
  const [results, setResults] = useState([]);

  // bidding state
  const [bids, setBids] = useState({});
  const [trump, setTrump] = useState(null);
  const [hierarchy, setHierarchy] = useState(null);
  const [activeIdx, setActiveIdx] = useState(0);

  // results state
  const [tricks, setTricks] = useState({});
  const [reneges, setReneges] = useState({});
  const [activeTrickIdx, setActiveTrickIdx] = useState(0);

  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const load = async () => {
    try {
      setLoading(true);
      const rnd = await base44.entities.Game.get(id);
      const [sess, rr] = await Promise.all([
        base44.entities.Session.get(rnd.session_id),
        base44.entities.RoundResult.filter({ game_id: id }, '-created_date', 20),
      ]);
      const sorted = [...rr].sort((a, b) => (a.bid_order ?? 0) - (b.bid_order ?? 0));
      setRound(rnd); setSession(sess); setResults(sorted);
      // seed editors from existing data (for resume / edit)
      const b = {}, t = {}, g = {};
      sorted.forEach((r) => { b[r.player_id] = r.bid ?? null; t[r.player_id] = r.tricks_won ?? null; g[r.player_id] = !!r.reneged; });
      setBids(b); setTricks(t); setReneges(g);
      setTrump(rnd.trump_suit || null); setHierarchy(rnd.hierarchy || null);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load round.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingSpinner showLogo />;
  if (!round) return <p className="text-sm text-destructive">{error || 'Round not found.'}</p>;

  const advanced = !!session?.advanced_rules_enabled;
  const bidVals = results.map((r) => bids[r.player_id]);
  const allBidsSet = bidVals.every((v) => v != null);
  const bidTotal = bidVals.reduce((s, v) => s + (v || 0), 0);
  const liveTable = allBidsSet ? tableState(bidVals.map(Number)) : null;
  const hbIdx = allBidsSet ? highestBidderIndex(bidVals.map((v) => ({ bid: Number(v) }))) : -1;

  // ---- BIDDING ----
  const renderBidding = () => {
    // forbidden value for the last unset player (Σ != 13)
    const setCount = bidVals.filter((v) => v != null).length;
    let disabledForActive = [];
    if (bids[results[activeIdx]?.player_id] == null && setCount === 3) {
      const otherSum = bidVals.reduce((s, v, i) => s + (i === activeIdx ? 0 : (v || 0)), 0);
      const forbidden = 13 - otherSum;
      if (forbidden >= 0 && forbidden <= 13) disabledForActive = [forbidden];
    }

    const canSubmit = allBidsSet && isBidSumLegal(bidVals.map(Number)) && (!advanced || (trump && hierarchy));

    const submit = async () => {
      setSaving(true); setError('');
      try {
        const bidMap = {};
        results.forEach((r) => { bidMap[r.player_id] = Number(bids[r.player_id]); });
        await base44.functions.invoke('submitBids', {
          game_id: id, bids: bidMap,
          trump_suit: advanced ? trump : undefined,
          hierarchy: advanced ? hierarchy : undefined,
        });
        await load();
      } catch (err) {
        setError(err.response?.data?.error || err.message || 'Failed to lock bids.');
      } finally { setSaving(false); }
    };

    return (
      <>
        <div className="flex items-center justify-between">
          <h1 className="font-heading text-xl font-bold text-foreground">Bidding · Round {round.round_number}</h1>
          {liveTable && (
            <span className={`text-xs px-2 py-1 rounded-full font-bold uppercase ${
              liveTable === 'up' ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'
            }`}>{liveTable} · {bidTotal}</span>
          )}
        </div>

        <div className="space-y-2">
          {results.map((r, i) => (
            <button key={r.id} onClick={() => setActiveIdx(i)}
              className={`w-full flex items-center justify-between rounded-lg border p-3 transition-colors ${
                activeIdx === i ? 'border-primary bg-primary/5' : 'border-border bg-card'
              }`}>
              <span className="text-sm font-medium text-foreground">{i + 1}. {r.player_name}</span>
              <span className="font-heading font-bold text-lg text-foreground w-8 text-center">
                {bids[r.player_id] != null ? bids[r.player_id] : '—'}
              </span>
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Bid for <span className="text-foreground font-medium">{results[activeIdx]?.player_name}</span>
            {disabledForActive.length > 0 && <span className="text-destructive"> · {disabledForActive[0]} blocked (would make Σ=13)</span>}
          </p>
          <NumberPad value={bids[results[activeIdx]?.player_id]} disabled={disabledForActive}
            onPick={(n) => {
              setBids((prev) => ({ ...prev, [results[activeIdx].player_id]: n }));
              const nextUnset = results.findIndex((r, i) => i !== activeIdx && bids[r.player_id] == null);
              if (nextUnset >= 0) setActiveIdx(nextUnset);
            }} />
        </div>

        {advanced && allBidsSet && (
          <div className="rounded-lg border border-border bg-card p-3 space-y-3">
            <p className="text-xs text-muted-foreground">
              Highest bidder <span className="text-foreground font-medium">{results[hbIdx]?.player_name}</span> chooses:
            </p>
            <div className="flex gap-1.5">
              {SUITS.map((s) => (
                <button key={s} onClick={() => setTrump(s)}
                  className={`flex-1 py-2 rounded-lg font-bold ${trump === s ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'}`}>
                  {SUIT_LABEL[s]}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              {HIERARCHIES.map((h) => (
                <button key={h} onClick={() => setHierarchy(h)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium ${hierarchy === h ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'}`}>
                  {HIER_LABEL[h]}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button className="w-full" disabled={!canSubmit || saving} onClick={submit}>
          {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Locking…</> : 'Lock Bids'}
        </Button>
      </>
    );
  };

  // ---- RESULTS ----
  const renderResults = () => {
    const trickVals = results.map((r) => tricks[r.player_id]);
    const total = trickVals.reduce((s, v) => s + (v || 0), 0);
    const allSet = trickVals.every((v) => v != null);
    const canSave = allSet && total === 13;

    const save = async () => {
      setSaving(true); setError('');
      try {
        const tMap = {}, gMap = {};
        results.forEach((r) => { tMap[r.player_id] = Number(tricks[r.player_id]); gMap[r.player_id] = !!reneges[r.player_id]; });
        await base44.functions.invoke('saveRoundResults', { game_id: id, tricks: tMap, reneges: gMap });
        navigate(`/session/${round.session_id}`, { replace: true });
      } catch (err) {
        setError(err.response?.data?.error || err.message || 'Failed to save results.');
        setSaving(false);
      }
    };

    return (
      <>
        <div className="flex items-center justify-between">
          <h1 className="font-heading text-xl font-bold text-foreground">Results · Round {round.round_number}</h1>
          <span className={`text-xs px-2 py-1 rounded-full font-bold ${total === 13 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-secondary text-muted-foreground'}`}>
            {total} / 13 tricks
          </span>
        </div>
        {round.table_state && (
          <p className="text-xs text-muted-foreground">
            Table <span className="font-bold uppercase">{round.table_state}</span>
            {round.trump_suit ? ` · ${formatSuit(round.trump_suit)}` : ''}
          </p>
        )}

        <div className="space-y-2">
          {results.map((r, i) => (
            <button key={r.id} onClick={() => setActiveTrickIdx(i)}
              className={`w-full flex items-center justify-between rounded-lg border p-3 transition-colors ${
                activeTrickIdx === i ? 'border-primary bg-primary/5' : 'border-border bg-card'
              }`}>
              <span className="text-sm font-medium text-foreground text-left">
                {r.player_name}
                <span className="block text-xs text-muted-foreground">bid {r.bid}</span>
              </span>
              <span className="flex items-center gap-2">
                <span
                  role="button" tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); setReneges((p) => ({ ...p, [r.player_id]: !p[r.player_id] })); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setReneges((p) => ({ ...p, [r.player_id]: !p[r.player_id] })); } }}
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase ${reneges[r.player_id] ? 'bg-destructive/20 text-destructive' : 'bg-secondary text-muted-foreground'}`}>
                  renege
                </span>
                <span className="font-heading font-bold text-lg text-foreground w-8 text-center">
                  {tricks[r.player_id] != null ? tricks[r.player_id] : '—'}
                </span>
              </span>
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Tricks for <span className="text-foreground font-medium">{results[activeTrickIdx]?.player_name}</span>
          </p>
          <NumberPad value={tricks[results[activeTrickIdx]?.player_id]}
            onPick={(n) => {
              setTricks((prev) => ({ ...prev, [results[activeTrickIdx].player_id]: n }));
              const nextUnset = results.findIndex((r, i) => i !== activeTrickIdx && tricks[r.player_id] == null);
              if (nextUnset >= 0) setActiveTrickIdx(nextUnset);
            }} />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {!canSave && allSet && <p className="text-xs text-destructive text-center">Tricks must total exactly 13 (currently {total}).</p>}
        <Button className="w-full" disabled={!canSave || saving} onClick={save}>
          {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : 'Save Round'}
        </Button>
      </>
    );
  };

  // ---- SUMMARY (complete / cancelled) ----
  const renderSummary = () => {
    const del = async () => {
      if (!confirm('Delete this round? Its scores will be removed.')) return;
      setSaving(true);
      try {
        await base44.functions.invoke('deleteRound', { game_id: id });
        navigate(`/session/${round.session_id}`, { replace: true });
      } catch (err) {
        setError(err.response?.data?.error || err.message || 'Failed to delete round.');
        setSaving(false);
      }
    };
    return (
      <>
        <div className="flex items-center justify-between">
          <h1 className="font-heading text-xl font-bold text-foreground">Round {round.round_number}</h1>
          <div className="flex items-center gap-2">
            {round.table_state && <span className="text-xs font-bold uppercase text-muted-foreground">{round.table_state}</span>}
            {round.everyone_falls && <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-500 font-medium uppercase">Everyone fell</span>}
          </div>
        </div>
        <div className="space-y-1.5">
          {results.map((r) => (
            <div key={r.id} className="flex items-center justify-between bg-card border border-border rounded-lg p-3 text-sm">
              <span className="text-foreground">{r.player_name}{r.reneged ? <span className="ml-1 text-destructive text-xs">(reneged)</span> : null}</span>
              <span className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">bid {r.bid} · won {r.tricks_won}</span>
                <span className={`font-heading font-bold w-12 text-right ${(r.points ?? 0) >= 0 ? 'text-primary' : 'text-destructive'}`}>{formatScore(r.points)}</span>
              </span>
            </div>
          ))}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {isAdmin && (
          <Button variant="outline" className="w-full border-destructive/40 text-destructive" onClick={del} disabled={saving}>
            <Trash2 className="w-4 h-4 mr-2" /> Delete Round
          </Button>
        )}
      </>
    );
  };

  return (
    <div className="space-y-5">
      <button onClick={() => navigate(`/session/${round.session_id}`)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Session
      </button>
      {round.status === 'bidding' && renderBidding()}
      {round.status === 'playing' && renderResults()}
      {(round.status === 'complete' || round.status === 'cancelled') && renderSummary()}
    </div>
  );
}
