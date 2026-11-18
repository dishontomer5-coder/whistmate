import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, Loader2, Trash2, Pencil, Gavel, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorState from '@/components/ErrorState';
import TableBadge from '@/components/TableBadge';
import { Suit, SUITS_IN_AUCTION_ORDER, SUIT_LABEL } from '@/components/Suit';
import { Name } from '@/components/UserText';
import { useConfirm } from '@/components/ConfirmDialog';
import { ScoringHelp } from '@/components/ScoringHelp';
import { useActiveGroup } from '@/lib/ActiveGroupContext';
import { tableState, isBidSumLegal, isTricksTotalLegal, highestBidderIndex, HIERARCHIES } from '@/lib/scoring';
import { CARD_ORDER_LABEL } from '@/lib/scoring-help';
import { formatScore, scoreTone, errorMessage } from '@/lib/format';

// The renege chip on a player row (results and edit screens): a small pill whose tap
// area is 44px tall. On = red text on a red tint.
const renegeChip = (on) => `relative inline-flex items-center text-xs px-3 py-1.5 rounded-full font-medium uppercase after:absolute after:inset-x-0 after:-inset-y-2 after:content-[''] ${
  on ? 'bg-destructive/15 text-negative ring-1 ring-destructive/50' : 'bg-secondary text-muted-foreground'
}`;

// The trump marker at the end of a player row. Tap it to record that this player won the
// auction at the table — the app can't derive that, since equal bids are settled by suit
// rank (♣<♦<♥<♠<NT) during an auction WhistMate never sees.
function TrumpCell({ owned, suit, onPick }) {
  const pick = (e) => { e.stopPropagation(); onPick(); };
  return (
    <span
      role="button" tabIndex={0} onClick={pick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') pick(e); }}
      aria-label={owned ? `Won trump${suit ? `, ${SUIT_LABEL[suit]}` : ''}` : 'Mark as trump winner'}
      className={`w-11 h-11 shrink-0 rounded-lg flex items-center justify-center font-bold transition-colors ${
        owned ? 'bg-primary/15 ring-1 ring-primary text-foreground' : 'bg-secondary text-muted-foreground'
      } ${owned && suit === 'notrump' ? 'text-xs' : 'text-lg'}`}>
      {owned ? (suit ? <Suit suit={suit} /> : '?') : <span aria-hidden="true">·</span>}
    </span>
  );
}

// The two in-round phases are near-identical in layout (4 rows + a number pad), so they
// carry distinct colour + icon: gold/gavel while bidding, emerald/clipboard while entering
// results. Defined once here so a screen can't drift from its own accent.
const PHASE = {
  bidding: {
    label: 'Bidding', step: '1 of 2', Icon: Gavel,
    band: 'border-l-primary bg-primary/10 text-primary',
    row: 'border-primary bg-primary/5',
    pad: 'bg-primary text-primary-foreground',
  },
  results: {
    label: 'Results', step: '2 of 2', Icon: ClipboardCheck,
    band: 'border-l-emerald-500 bg-emerald-500/10 text-emerald-400',
    row: 'border-emerald-500 bg-emerald-500/5',
    pad: 'bg-emerald-500 text-background',
  },
};

function PhaseBanner({ phase, roundNumber, badge }) {
  const { label, step, Icon, band } = PHASE[phase];
  return (
    <div className={`flex items-center justify-between gap-2 rounded-lg border-l-4 px-3 py-2.5 ${band}`}>
      <span className="flex items-center gap-2 min-w-0">
        <Icon className="w-4 h-4 shrink-0" />
        {/* The step counter sits under the title, so neither is cut off on a narrow phone. */}
        <span className="min-w-0">
          <h1 className="font-heading text-lg font-bold leading-tight">{label}</h1>
          <span className="block text-xs text-muted-foreground">Round {roundNumber} · step {step}</span>
        </span>
      </span>
      {badge}
    </div>
  );
}

function NumberPad({ value, onPick, max = 13, disabled = [], accent = PHASE.bidding.pad }) {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {Array.from({ length: max + 1 }, (_, n) => {
        const isDisabled = disabled.includes(n);
        const active = value === n;
        return (
          <button key={n} type="button" disabled={isDisabled} onClick={() => onPick(n)}
            className={`aspect-square rounded-lg font-heading font-bold text-lg transition-colors ${
              active ? accent
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
  const [trumpOwner, setTrumpOwner] = useState(null); // player_id who won the auction
  const [hierarchy, setHierarchy] = useState(null);
  const [activeIdx, setActiveIdx] = useState(0);

  // results state
  const [tricks, setTricks] = useState({});
  const [reneges, setReneges] = useState({});
  const [activeTrickIdx, setActiveTrickIdx] = useState(0);

  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBids, setEditBids] = useState(false); // reopen locked bids mid-round
  const [notFound, setNotFound] = useState(false);
  // Which section of "How scoring works" is open (null = closed).
  const [helpSection, setHelpSection] = useState(null);
  const [confirm, confirmElement] = useConfirm();

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const load = async () => {
    try {
      setLoading(true);
      // Membership-checked read (P12-1) — the round, its session and its four results.
      const res = await base44.functions.invoke('getGroupData', { scope: 'round', round_id: id });
      const { round: rnd, session: sess, results: rr = [] } = res.data;
      const sorted = [...rr].sort((a, b) => (a.bid_order ?? 0) - (b.bid_order ?? 0));
      setRound(rnd); setSession(sess); setResults(sorted);
      // seed editors from existing data (for resume / edit)
      const b = {}, t = {}, g = {};
      sorted.forEach((r) => { b[r.player_id] = r.bid ?? null; t[r.player_id] = r.tricks_won ?? null; g[r.player_id] = !!r.reneged; });
      setBids(b); setTricks(t); setReneges(g);
      setTrump(rnd.trump_suit || null); setHierarchy(rnd.hierarchy || null);
      // Only treat the stored winner as a real choice once a suit exists — without one it's
      // just the bid-number fallback, and showing it as chosen would be a lie.
      setTrumpOwner(rnd.trump_suit ? (rnd.highest_bidder_player_id || null) : null);
    } catch (err) {
      setNotFound(err.response?.status === 404);
      setError(errorMessage(err, 'Failed to load round.'));
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingSpinner showLogo />;
  if (!round) {
    // A missing round cannot be fixed by trying again — offer the way back instead.
    return notFound || !error ? (
      <ErrorState title="Round not found" message="It was deleted, or the link is wrong."
        action={<Button variant="outline" onClick={() => navigate('/')}>Back to sessions</Button>} />
    ) : (
      <ErrorState title="Couldn't load this round" message={error} onRetry={load} />
    );
  }

  const advanced = !!session?.advanced_rules_enabled;
  const bidVals = results.map((r) => bids[r.player_id]);
  const allBidsSet = bidVals.every((v) => v != null);
  const bidTotal = bidVals.reduce((s, v) => s + (v || 0), 0);
  const liveTable = allBidsSet ? tableState(bidVals.map(Number)) : null;
  // Top bidder by number = a DEFAULT for the trump marker, never the answer (see scoring.js).
  const hbIdx = allBidsSet ? highestBidderIndex(bidVals.map((v) => ({ bid: Number(v) }))) : -1;
  // Advanced sessions must record a trump, so pre-select the top bidder there. Elsewhere it's
  // opt-in: nothing is marked until someone taps a cell.
  const trumpOwnerId = trumpOwner ?? (advanced && hbIdx >= 0 ? results[hbIdx]?.player_id ?? null : null);
  const trumpOwnerName = results.find((r) => r.player_id === trumpOwnerId)?.player_name || '';
  const trumpWinnerName = results.find((r) => r.player_id === round.highest_bidder_player_id)?.player_name || '';

  // Tapping the marked player again clears the record — but only where trump is optional;
  // advanced sessions require one, so there it just moves the marker.
  const pickTrumpOwner = (playerId) => {
    if (!advanced && trumpOwnerId === playerId) {
      setTrumpOwner(null);
      setTrump(null);
      return;
    }
    setTrumpOwner(playerId);
  };

  // Who won the auction + what they called. Shared by the bidding and edit screens.
  const renderTrumpPanel = () => (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3">
      <p className="text-xs text-muted-foreground">
        Trump won by <span className="text-foreground font-medium">{trumpOwnerName ? <Name>{trumpOwnerName}</Name> : 'nobody yet'}</span>
        {trumpOwnerName ? ' — suit called:' : ' — tap a player\'s trump slot first'}
      </p>
      {/* Suits in auction order, lowest first. The chosen suit gets a gold outline rather
          than a gold fill, so hearts and diamonds stay red when selected. */}
      <div className="flex gap-1.5">
        {SUITS_IN_AUCTION_ORDER.map((s) => (
          <button key={s} type="button" disabled={!trumpOwnerId}
            aria-pressed={trump === s}
            onClick={() => setTrump(trump === s ? null : s)}
            className={`flex-1 min-h-11 rounded-lg text-lg disabled:opacity-40 ${
              trump === s ? 'bg-primary/15 ring-2 ring-primary' : 'bg-secondary'
            }`}>
            <Suit suit={s} className={s === 'notrump' ? 'text-sm' : undefined} />
          </button>
        ))}
      </div>
      {advanced && (
        <div className="flex gap-1.5">
          {HIERARCHIES.map((h) => (
            <button key={h} type="button" onClick={() => setHierarchy(h)}
              aria-pressed={hierarchy === h}
              className={`flex-1 min-h-11 px-2 py-2 rounded-lg text-xs font-medium ${hierarchy === h ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'}`}>
              {CARD_ORDER_LABEL[h]}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // ---- BIDDING ----
  const renderBidding = () => {
    // forbidden value for the last unset player (the four bids can't total 13)
    const setCount = bidVals.filter((v) => v != null).length;
    let disabledForActive = [];
    if (bids[results[activeIdx]?.player_id] == null && setCount === 3) {
      const otherSum = bidVals.reduce((s, v, i) => s + (i === activeIdx ? 0 : (v || 0)), 0);
      const forbidden = 13 - otherSum;
      if (forbidden >= 0 && forbidden <= 13) disabledForActive = [forbidden];
    }

    const canSubmit = allBidsSet && isBidSumLegal(bidVals.map(Number))
      && (!advanced || (trump && hierarchy))
      && (!trump || !!trumpOwnerId); // a suit with no owner is half a record

    const submit = async () => {
      setSaving(true); setError('');
      try {
        const bidMap = {};
        results.forEach((r) => { bidMap[r.player_id] = Number(bids[r.player_id]); });
        await base44.functions.invoke('submitBids', {
          game_id: id, bids: bidMap,
          trump_suit: trump || undefined,
          hierarchy: advanced ? hierarchy : undefined,
          trump_owner_player_id: trump ? trumpOwnerId : undefined,
        });
        setEditBids(false);
        await load();
      } catch (err) {
        setError(errorMessage(err, 'Failed to lock bids.'));
      } finally { setSaving(false); }
    };

    return (
      <>
        <PhaseBanner phase="bidding" roundNumber={round.round_number}
          badge={liveTable && (
            <TableBadge state={liveTable} total={bidTotal} onClick={() => setHelpSection('updown')} />
          )} />

        {editBids && (
          <p className="text-xs text-muted-foreground">
            Fixing the locked bids for this round. Saving updates the up or down table and the trump
            record; the tricks already entered are kept.
          </p>
        )}

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground text-right pr-2">trump</p>
          {results.map((r, i) => (
            <button key={r.id} onClick={() => setActiveIdx(i)}
              className={`w-full flex items-center justify-between rounded-lg border p-3 transition-colors ${
                activeIdx === i ? PHASE.bidding.row : 'border-border bg-card'
              }`}>
              <span className="text-sm font-medium text-foreground text-left">{i + 1}. <Name>{r.player_name}</Name></span>
              <span className="flex items-center gap-3">
                <span className="font-heading font-bold text-lg text-foreground w-8 text-center">
                  {bids[r.player_id] != null ? bids[r.player_id] : '—'}
                </span>
                <TrumpCell owned={trumpOwnerId === r.player_id} suit={trump}
                  onPick={() => pickTrumpOwner(r.player_id)} />
              </span>
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Bid for <span className="text-foreground font-medium"><Name>{results[activeIdx]?.player_name}</Name></span>
            {disabledForActive.length > 0 && <span className="text-negative"> · {disabledForActive[0]} is blocked — the bids can't total 13</span>}
            {/* All four in and nothing left to auto-advance to — say out loud that rows are
                tappable, otherwise a typo looks unfixable. */}
            {allBidsSet && disabledForActive.length === 0 && (
              <span className="opacity-70"> · tap a player above to change their bid</span>
            )}
          </p>
          <NumberPad value={bids[results[activeIdx]?.player_id]} disabled={disabledForActive}
            onPick={(n) => {
              setBids((prev) => ({ ...prev, [results[activeIdx].player_id]: n }));
              const nextUnset = results.findIndex((r, i) => i !== activeIdx && bids[r.player_id] == null);
              if (nextUnset >= 0) setActiveIdx(nextUnset);
            }} />
        </div>

        {trumpOwnerId && renderTrumpPanel()}

        {/* Before, an illegal total just greyed the button out with no reason given — easy to
            hit now that bids can be edited after the fact. */}
        {allBidsSet && !isBidSumLegal(bidVals.map(Number)) && (
          <p className="text-sm text-negative text-center">
            The four bids total exactly 13, which isn't allowed — change one.
          </p>
        )}
        <ErrorState inline message={error} />
        {editBids ? (
          <div className="flex gap-2">
            <Button variant="outline" size="lg" className="flex-1 px-2" disabled={saving}
              onClick={() => { setEditBids(false); setError(''); load(); }}>
              Cancel
            </Button>
            <Button size="lg" className="flex-1 px-2" disabled={!canSubmit || saving} onClick={submit}>
              {saving ? <><Loader2 className="animate-spin" /> Saving…</> : 'Save bids'}
            </Button>
          </div>
        ) : (
          <Button size="lg" className="w-full" disabled={!canSubmit || saving} onClick={submit}>
            {saving ? <><Loader2 className="animate-spin" /> Locking…</> : 'Lock bids'}
          </Button>
        )}
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
        setError(errorMessage(err, 'Failed to save results.'));
        setSaving(false);
      }
    };

    return (
      <>
        <PhaseBanner phase="results" roundNumber={round.round_number}
          badge={
            <span className={`text-xs px-2 py-1 rounded-full font-bold shrink-0 ${total === 13 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-secondary text-muted-foreground'}`}>
              {total} / 13 tricks
            </span>
          } />
        <div className="flex items-center justify-between gap-2">
          {round.table_state ? (
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
              <TableBadge state={round.table_state} onClick={() => setHelpSection('updown')} />
              {round.trump_suit ? <span>· trump <Suit suit={round.trump_suit} label /></span> : null}
              {round.trump_suit && trumpWinnerName ? <span>· won by <Name>{trumpWinnerName}</Name></span> : null}
            </p>
          ) : <span />}
          {/* Bids are typed in after the table's real auction, so typos show up here. Any
              member can fix them while the round is unscored. */}
          <button type="button" onClick={() => { setError(''); setEditBids(true); }}
            className="flex items-center gap-1 min-h-11 pl-2 text-xs text-muted-foreground hover:text-foreground shrink-0">
            <Pencil className="w-3 h-3" /> Edit bids
          </button>
        </div>

        <div className="space-y-2">
          {results.map((r, i) => (
            <button key={r.id} onClick={() => setActiveTrickIdx(i)}
              className={`w-full flex items-center justify-between rounded-lg border p-3 transition-colors ${
                activeTrickIdx === i ? PHASE.results.row : 'border-border bg-card'
              }`}>
              <span className="text-sm font-medium text-foreground text-left">
                <Name>{r.player_name}</Name>
                <span className="block text-xs text-muted-foreground">bid {r.bid}</span>
              </span>
              <span className="flex items-center gap-2">
                <span
                  role="button" tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); setReneges((p) => ({ ...p, [r.player_id]: !p[r.player_id] })); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setReneges((p) => ({ ...p, [r.player_id]: !p[r.player_id] })); } }}
                  aria-pressed={!!reneges[r.player_id]}
                  className={renegeChip(reneges[r.player_id])}>
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
            Tricks for <span className="text-foreground font-medium"><Name>{results[activeTrickIdx]?.player_name}</Name></span>
          </p>
          <NumberPad value={tricks[results[activeTrickIdx]?.player_id]} accent={PHASE.results.pad}
            onPick={(n) => {
              setTricks((prev) => ({ ...prev, [results[activeTrickIdx].player_id]: n }));
              const nextUnset = results.findIndex((r, i) => i !== activeTrickIdx && tricks[r.player_id] == null);
              if (nextUnset >= 0) setActiveTrickIdx(nextUnset);
            }} />
        </div>

        <ErrorState inline message={error} />
        {!canSave && allSet && <p className="text-sm text-negative text-center">Tricks must total exactly 13 (currently {total}).</p>}
        <Button size="lg" className="w-full" disabled={!canSave || saving} onClick={save}>
          {saving ? <><Loader2 className="animate-spin" /> Saving…</> : 'Save round'}
        </Button>
      </>
    );
  };

  // ---- SUMMARY (complete / cancelled) ----
  const renderSummary = () => {
    const del = async () => {
      const ok = await confirm({
        title: 'Delete this round?',
        description: 'Its scores will be removed.',
        confirmLabel: 'Delete round',
        destructive: true,
      });
      if (!ok) return;
      setSaving(true);
      try {
        await base44.functions.invoke('deleteRound', { game_id: id });
        navigate(`/session/${round.session_id}`, { replace: true });
      } catch (err) {
        setError(errorMessage(err, 'Failed to delete round.'));
        setSaving(false);
      }
    };
    return (
      <>
        <div className="flex items-center justify-between gap-2">
          <h1 className="page-title">Round {round.round_number}</h1>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <TableBadge state={round.table_state} onClick={() => setHelpSection('updown')} />
            {round.everyone_falls && <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-500 font-medium uppercase whitespace-nowrap">Everyone fell</span>}
          </div>
        </div>
        {round.trump_suit && (
          <p className="text-xs text-muted-foreground">
            Trump <Suit suit={round.trump_suit} label />
            {trumpWinnerName ? <> · won by <span className="text-foreground font-medium"><Name>{trumpWinnerName}</Name></span></> : null}
            {round.hierarchy ? ` · ${CARD_ORDER_LABEL[round.hierarchy] || round.hierarchy}` : ''}
          </p>
        )}
        <div className="space-y-1.5">
          {results.map((r) => (
            <div key={r.id} className="flex items-center justify-between bg-card border border-border rounded-lg p-3 text-sm">
              <span className="text-foreground min-w-0">
                <Name>{r.player_name}</Name>
                {round.trump_suit && r.player_id === round.highest_bidder_player_id && (
                  <span className="ml-1.5" title="Won the trump"><Suit suit={round.trump_suit} /></span>
                )}
                {r.reneged ? <span className="ml-1 text-negative text-xs">(reneged)</span> : null}
              </span>
              <span className="flex items-center gap-3 flex-shrink-0">
                <span className="text-xs text-muted-foreground">bid {r.bid} · took {r.tricks_won}</span>
                <span className={`font-heading font-bold w-12 text-right ${scoreTone(r.points)}`}>{formatScore(r.points)}</span>
              </span>
            </div>
          ))}
        </div>
        <ErrorState inline message={error} />
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 px-2" onClick={() => { setError(''); setEditing(true); }} disabled={saving}>
              <Pencil /> Edit round
            </Button>
            <Button variant="outline" className="flex-1 px-2 border-destructive/60 text-negative" onClick={del} disabled={saving}>
              <Trash2 /> Delete round
            </Button>
          </div>
        )}
      </>
    );
  };

  // ---- EDIT (group admin fixes a past round) ----
  const renderEdit = () => {
    const bidVals = results.map((r) => (bids[r.player_id] == null ? NaN : Number(bids[r.player_id])));
    const trickVals = results.map((r) => (tricks[r.player_id] == null ? NaN : Number(tricks[r.player_id])));
    const bidsOk = isBidSumLegal(bidVals);
    const tricksOk = isTricksTotalLegal(trickVals);
    const advancedOk = (!advanced || (trump && hierarchy)) && (!trump || !!trumpOwnerId);
    const bidTotal = bidVals.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
    const trickTotal = trickVals.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
    const canSave = bidsOk && tricksOk && advancedOk;

    const setNum = (setter, pid, raw) => {
      const v = raw === '' ? null : Math.max(0, Math.min(13, parseInt(raw, 10) || 0));
      setter((prev) => ({ ...prev, [pid]: v }));
    };

    const save = async () => {
      setSaving(true); setError('');
      try {
        const bidMap = {}, tMap = {}, gMap = {};
        results.forEach((r) => {
          bidMap[r.player_id] = Number(bids[r.player_id]);
          tMap[r.player_id] = Number(tricks[r.player_id]);
          gMap[r.player_id] = !!reneges[r.player_id];
        });
        await base44.functions.invoke('updateRound', {
          game_id: id, bids: bidMap, tricks: tMap, reneges: gMap,
          trump_suit: trump || undefined,
          hierarchy: advanced ? hierarchy : undefined,
          trump_owner_player_id: trump ? trumpOwnerId : undefined,
        });
        setEditing(false);
        await load();
      } catch (err) {
        setError(errorMessage(err, 'Failed to update round.'));
      } finally {
        setSaving(false);
      }
    };

    return (
      <>
        <div className="flex items-center justify-between gap-2">
          <h1 className="page-title">Edit round {round.round_number}</h1>
          <div className="flex items-center gap-2 text-xs whitespace-nowrap">
            <span className={bidsOk ? 'text-emerald-400' : 'text-negative'}>bids {bidTotal}{bidsOk ? '' : ' ✕'}</span>
            <span className={tricksOk ? 'text-emerald-400' : 'text-negative'}>tricks {trickTotal}/13</span>
          </div>
        </div>

        <div className="space-y-2">
          {results.map((r) => (
            <div key={r.id} className="bg-card border border-border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground"><Name>{r.player_name}</Name></span>
                <span className="flex items-center gap-2">
                  <button type="button"
                    aria-pressed={!!reneges[r.player_id]}
                    onClick={() => setReneges((p) => ({ ...p, [r.player_id]: !p[r.player_id] }))}
                    className={renegeChip(reneges[r.player_id])}>
                    renege
                  </button>
                  <TrumpCell owned={trumpOwnerId === r.player_id} suit={trump}
                    onPick={() => pickTrumpOwner(r.player_id)} />
                </span>
              </div>
              <div className="flex gap-3">
                <label className="flex-1 text-xs text-muted-foreground">
                  Bid
                  <Input type="number" min={0} max={13} inputMode="numeric" value={bids[r.player_id] ?? ''}
                    onChange={(e) => setNum(setBids, r.player_id, e.target.value)} className="mt-1" />
                </label>
                <label className="flex-1 text-xs text-muted-foreground">
                  Tricks
                  <Input type="number" min={0} max={13} inputMode="numeric" value={tricks[r.player_id] ?? ''}
                    onChange={(e) => setNum(setTricks, r.player_id, e.target.value)} className="mt-1" />
                </label>
              </div>
            </div>
          ))}
        </div>

        {(trumpOwnerId || advanced) && renderTrumpPanel()}

        {!bidsOk && <p className="text-sm text-negative">Bids must each be 0–13, and the four can't total 13.</p>}
        {!tricksOk && <p className="text-sm text-negative">Tricks must each be 0–13 and total exactly 13.</p>}
        <ErrorState inline message={error} />

        <div className="flex gap-2">
          <Button variant="outline" size="lg" className="flex-1 px-2" onClick={() => { setEditing(false); load(); }} disabled={saving}>Cancel</Button>
          <Button size="lg" className="flex-1 px-2" onClick={save} disabled={!canSave || saving}>
            {saving ? <><Loader2 className="animate-spin" /> Saving…</> : 'Save changes'}
          </Button>
        </div>
      </>
    );
  };

  return (
    <div className="space-y-5">
      <button onClick={() => navigate(`/session/${round.session_id}`)} className="flex items-center gap-1 min-h-11 pr-2 -my-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Session
      </button>
      {editing ? renderEdit()
        : round.status === 'bidding' || (editBids && round.status === 'playing') ? renderBidding()
        : round.status === 'playing' ? renderResults()
        : renderSummary()}
      {confirmElement}
      <ScoringHelp open={helpSection != null} onOpenChange={(open) => { if (!open) setHelpSection(null); }} section={helpSection || undefined} />
    </div>
  );
}
