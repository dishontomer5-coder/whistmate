import { useId, useState } from 'react';
import { TrendingUp, TrendingDown, Hash, Trophy, BarChart3, Target, Zap, Percent, Skull, HandCoins, Rabbit, Medal, CalendarDays, Info } from 'lucide-react';
import { formatScore, formatAvg, formatPct, scoreTone } from '@/lib/format';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// One figure. The whole tile is a button: a tap opens what the figure means as a line
// INSIDE the tile, under the number — never a bubble on top of it.
// `score`: pass the number when the tile shows a score, and it takes the score colour
// (gained foreground, zero muted, lost red). Tiles that show a count or a rate stay white.
// `mine`: on another player's page, the viewer's own value of the same figure ("You: 62%").
function StatTile({ icon: Icon, label, value, subtext, score, explanation, mine }) {
  const [open, setOpen] = useState(false);
  const explanationId = useId();
  const toneClass = score == null ? 'text-foreground' : scoreTone(score);
  // The button is a column that starts at the top: the tiles of a row share its height,
  // and a button would otherwise centre its content in the taller box.
  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      aria-controls={explanationId}
      className="flex min-w-0 flex-col bg-secondary rounded-lg p-3 text-left shadow-sm transition-colors hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
    >
      <span className="flex items-start gap-2 mb-1.5 text-xs text-muted-foreground uppercase tracking-wide">
        <Icon className="w-3.5 h-3.5 mt-px flex-shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">{label}</span>
        <Info className={`w-3.5 h-3.5 mt-px flex-shrink-0 ${open ? 'text-foreground' : 'opacity-60'}`} aria-hidden="true" />
      </span>
      <span className={`block font-heading font-bold text-2xl ${toneClass}`}>{value}</span>
      {subtext && <span className="block text-xs text-muted-foreground mt-0.5">{subtext}</span>}
      {mine && (
        <span className="mt-1.5 block border-t border-border pt-1.5 text-xs text-muted-foreground">
          You: <span className="font-heading font-bold text-foreground">{mine}</span>
        </span>
      )}
      <span id={explanationId} hidden={!open}
        className="mt-2 border-t border-border pt-2 text-xs normal-case leading-relaxed text-muted-foreground [&:not([hidden])]:block">
        {explanation}
      </span>
    </button>
  );
}

function SectionHeader({ children }) {
  return <h2 className="section-label mb-2">{children}</h2>;
}

// The twelve figures of a stats object, as { key, value, subtext, score } — so the same
// figures can be read off two players' stats and shown side by side.
function figures(stats) {
  const perf = stats?.performance || {};
  const strat = stats?.strategy || {};
  const awards = stats?.awards || {};
  // An average or rate with nothing to count yet (null: no zero bids, no closed session, no rounds) is a dash, not 0%.
  const pct = (ratio) => (ratio == null ? '—' : formatPct(ratio));
  const total = perf.total_score || 0;
  const avg = perf.avg_score || 0;
  const rounds = perf.rounds_played || 0;
  const sessions = perf.sessions_played || 0;
  const open = perf.sessions_open || 0;
  const wins = perf.wins || 0;
  const zeroBids = strat.zero_bids || 0;
  const tooFew = -(awards.greedy_loss || 0);
  const tooMany = -(awards.coward_loss || 0);
  return {
    total: { value: formatScore(total), score: total, icon: total < 0 ? TrendingDown : TrendingUp },
    avg: { value: rounds > 0 ? formatAvg(avg) : '—', score: rounds > 0 ? avg : undefined },
    rounds: { value: rounds },
    sessions: { value: sessions, subtext: open > 0 ? `+ ${open} still open` : undefined },
    winRate: { value: pct(perf.win_ratio), subtext: sessions > 0 ? `${plural(wins, 'win')} in ${plural(sessions, 'session')}` : 'No closed session yet' },
    podiums: { value: perf.podiums || 0 },
    accuracy: { value: pct(strat.contract_accuracy), subtext: rounds > 0 && strat.made_count != null ? `${strat.made_count} of ${rounds} made` : undefined },
    zero: { value: pct(strat.zero_bid_success_rate), subtext: zeroBids > 0 ? `${strat.zero_bid_success || 0} of ${plural(zeroBids, 'zero bid')}` : 'No zero bids yet' },
    avgBid: { value: rounds > 0 ? Math.round((Number(strat.bid_aggressiveness) || 0) * 10) / 10 : '—' },
    tooFew: { value: formatScore(tooFew), score: tooFew },
    tooMany: { value: formatScore(tooMany), score: tooMany },
    fell: { value: awards.destroyer_count || 0 },
  };
}

// stats:     { performance, strategy, awards } from computePlayerStats / computeGlobalStats.
// allGroups: the figures are summed over every group (the Me page) — awards belong to one
//            group, so the explanations do not mention them there.
// compare:   optional — the viewer's own stats in the same group. On another player's page
//            every tile then also shows the viewer's value ("You: 62%"), so comparing needs
//            no second screen (returning-player-4).
// Two sections of six tiles, so the two-column grid has no holes.
export default function StatGrid({ stats, allGroups = false, compare = null }) {
  const f = figures(stats);
  const mine = compare ? figures(compare) : null;
  const you = (key) => (mine ? String(mine[key].value) : undefined);
  const holds = (award) => (allGroups ? '' : ` The most in the group holds ${award}.`);

  const tile = (key, props) => (
    <StatTile key={key} value={f[key].value} subtext={f[key].subtext} score={f[key].score} mine={you(key)} {...props} />
  );

  return (
    <div className="space-y-5">
      <div>
        <SectionHeader>Results</SectionHeader>
        <div className="grid grid-cols-2 gap-3">
          {tile('total', { icon: f.total.icon, label: 'Total score', explanation: 'The points of every scored round, added up.' })}
          {tile('avg', { icon: BarChart3, label: 'Avg / round', explanation: 'Total score divided by rounds played, to one decimal.' })}
          {tile('rounds', { icon: Hash, label: 'Rounds', explanation: 'Every scored round the player sat in. A round where everyone fell counts too: the hand was played and scored zero.' })}
          {tile('sessions', { icon: CalendarDays, label: 'Sessions', explanation: 'Closed sessions the player scored in. A session that is still open is counted once it is closed.' })}
          {tile('winRate', { icon: Trophy, label: 'Win rate', explanation: 'Share of closed sessions finished in first place. A session is won only when it is closed.' })}
          {tile('podiums', { icon: Medal, label: 'Podiums', explanation: 'Closed sessions finished in the top three.' })}
        </div>
      </div>

      <div>
        <SectionHeader>Bidding</SectionHeader>
        <div className="grid grid-cols-2 gap-3">
          {tile('accuracy', { icon: Target, label: 'Contract accuracy', explanation: 'Share of rounds where the tricks taken were exactly the bid.' })}
          {tile('zero', { icon: Percent, label: 'Zero-bid success', explanation: 'Of the rounds bid at zero, how many ended with no trick taken.' })}
          {tile('avgBid', { icon: Zap, label: 'Average bid', explanation: 'The average number of tricks bid. Higher means committing to more tricks.' })}
          {tile('tooFew', { icon: HandCoins, label: 'Lost taking too few', explanation: `Points lost in rounds that ended below the bid. Rounds with a renege are left out.${holds('The Greedy')}` })}
          {tile('tooMany', { icon: Rabbit, label: 'Lost taking too many', explanation: `Points lost in rounds that ended above the bid. Rounds with a renege are left out.${holds('The Coward')}` })}
          {tile('fell', { icon: Skull, label: 'Fell as top bidder', explanation: `Rounds where everyone fell and this player was the top bidder: the trump winner, or the highest bid when no trump winner was marked.${holds('The Destroyer')}` })}
        </div>
      </div>
    </div>
  );
}
