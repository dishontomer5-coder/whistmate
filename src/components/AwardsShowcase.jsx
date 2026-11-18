import { Link } from 'react-router-dom';
import { HandCoins, Crown, Skull } from 'lucide-react';
import { formatScore, scoreTone } from '@/lib/format';
import { Name } from '@/components/UserText';

// awards: { greedy, coward, destroyer } — each { value, holders: [{ player_id, name }] } (every
// player level on the top figure), or null when nobody has earned it — then it is not shown.
// The Greedy and The Coward are points LOST, so they are shown as a lost score (red).
// The Destroyer is a count of rounds, not a score, so it takes no score colour.
const CARDS = [
  { key: 'greedy', icon: HandCoins, title: 'The Greedy', blurb: 'Most points lost taking too few tricks', fmt: (v) => formatScore(-v), tone: (v) => scoreTone(-v) },
  { key: 'coward', icon: Crown, title: 'The Coward', blurb: 'Most points lost taking too many tricks', fmt: (v) => formatScore(-v), tone: (v) => scoreTone(-v) },
  { key: 'destroyer', icon: Skull, title: 'The Destroyer', blurb: 'Most "everyone falls" rounds as the top bidder', fmt: (v) => `${v} round${v !== 1 ? 's' : ''}`, tone: () => 'text-foreground' },
];

export default function AwardsShowcase({ awards }) {
  if (!awards) return null;
  const held = CARDS.filter((c) => awards[c.key]?.holders?.length);
  if (held.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="section-title">Awards</h2>
      <div className="grid grid-cols-1 gap-2">
        {held.map(({ key, icon: Icon, title, blurb, fmt, tone }) => {
          const { value, holders } = awards[key];
          return (
            <div key={key} className="flex items-center gap-3 bg-card border border-border rounded-lg p-3">
              <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-heading font-bold text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground">{blurb}</p>
              </div>
              <div className="text-right flex-shrink-0">
                {holders.map((h) => (
                  <Link key={h.player_id} to={`/player/${h.player_id}`} className="block text-sm font-medium text-foreground truncate max-w-[8rem]">
                    <Name>{h.name}</Name>
                  </Link>
                ))}
                <span className={`block text-xs font-heading font-bold ${tone(value)}`}>{fmt(value)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
