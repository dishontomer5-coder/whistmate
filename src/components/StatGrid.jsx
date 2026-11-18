import { TrendingUp, TrendingDown, Hash, Trophy, BarChart3, Crown, Target, Zap, Percent, Skull, HandCoins, Medal } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { formatScore, formatPct, scoreTone } from '@/lib/format';

function InfoLabel({ label, explanation }) {
  if (!explanation) return <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="px-0 pb-0.5 border-0 border-b border-dotted border-muted-foreground/50 bg-transparent text-left text-xs text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors">
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 text-xs text-popover-foreground leading-relaxed">{explanation}</PopoverContent>
    </Popover>
  );
}

// `score`: pass the number when the tile shows a score, and it takes the score colour
// (gained gold, zero muted, lost red). Tiles that show a count or a rate stay white.
function StatTile({ icon: Icon, label, value, subtext, score, explanation, className = '' }) {
  const toneClass = score == null ? 'text-foreground' : scoreTone(score);
  return (
    <div className={`bg-secondary rounded-lg p-3 pb-2 shadow-sm ${className}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <InfoLabel label={label} explanation={explanation} />
      </div>
      <p className={`font-heading font-bold text-2xl ${toneClass}`}>{value}</p>
      {subtext && <p className="text-xs text-muted-foreground mt-0.5">{subtext}</p>}
    </div>
  );
}

function SectionHeader({ children }) {
  return <h2 className="section-label mb-2">{children}</h2>;
}

// stats: { performance, strategy, awards } from computePlayerStats / computeGlobalStats
export default function StatGrid({ stats }) {
  const perf = stats.performance || {};
  const strat = stats.strategy || {};
  const awards = stats.awards || {};
  // A rate with nothing to count yet (null: no zero bids, no closed session, no rounds) is a dash, not 0%.
  const pct = (ratio) => (ratio == null ? '—' : formatPct(ratio));

  const total = perf.total_score || 0;
  const avg = perf.avg_score || 0;
  const greedy = -(awards.greedy_loss || 0);
  const coward = -(awards.coward_loss || 0);

  return (
    <div className="space-y-5">
      <div>
        <SectionHeader>Performance</SectionHeader>
        <div className="grid grid-cols-2 gap-3">
          <StatTile icon={total < 0 ? TrendingDown : TrendingUp} label="Total score" value={formatScore(total)} score={total} explanation="Sum of points across every round played." />
          <StatTile icon={BarChart3} label="Avg / round" value={formatScore(avg)} score={avg} explanation="Average points per round." />
          <StatTile icon={Hash} label="Rounds" value={perf.rounds_played || 0} explanation="Total rounds played." subtext={`${perf.sessions_played || 0} session${perf.sessions_played !== 1 ? 's' : ''}`} />
          <StatTile icon={Trophy} label="Win rate" value={pct(perf.win_ratio)} subtext={`${perf.wins || 0} win${perf.wins !== 1 ? 's' : ''}`} explanation="Share of sessions finished in 1st place." />
          <StatTile icon={Medal} label="Podiums" value={perf.podiums || 0} explanation="Sessions finished in the top 3." />
        </div>
      </div>

      <div>
        <SectionHeader>Strategy</SectionHeader>
        <div className="grid grid-cols-2 gap-3">
          <StatTile icon={Target} label="Contract accuracy" value={pct(strat.contract_accuracy)} explanation="Share of rounds where the tricks taken exactly matched the bid." />
          <StatTile icon={Percent} label="0-bid success" value={pct(strat.zero_bid_success_rate)} subtext={`${strat.zero_bid_success || 0}/${strat.zero_bids || 0} zero-bids`} explanation="Of your zero bids, how often you took exactly zero tricks." />
          <StatTile icon={Zap} label="Aggressiveness" value={(strat.bid_aggressiveness ?? 0)} explanation="Average bid size — higher means you commit to more tricks." />
        </div>
      </div>

      <div>
        <SectionHeader>Awards</SectionHeader>
        <div className="grid grid-cols-2 gap-3">
          <StatTile icon={HandCoins} label="The Greedy" value={formatScore(greedy)} score={greedy} explanation="Points lost from taking too FEW tricks (bidding higher than you delivered)." />
          <StatTile icon={Crown} label="The Coward" value={formatScore(coward)} score={coward} explanation="Points lost from taking too MANY tricks (over-delivering / busting a low bid)." />
          <StatTile icon={Skull} label="The Destroyer" value={awards.destroyer_count || 0} explanation="Everyone-falls rounds where you were the top bidder: the trump winner, or the highest bid when no trump winner was marked." />
        </div>
      </div>
    </div>
  );
}
