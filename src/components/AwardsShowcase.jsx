import { Link } from 'react-router-dom';
import { HandCoins, Crown, Skull } from 'lucide-react';
import { formatScore } from '@/lib/format';

// awards: { greedy, coward, destroyer } — each { player_id, player_name, value } | null
const CARDS = [
  { key: 'greedy', icon: HandCoins, title: 'The Greedy', blurb: 'Most points lost taking too few tricks', fmt: (v) => formatScore(-v) },
  { key: 'coward', icon: Crown, title: 'The Coward', blurb: 'Most points lost taking too many tricks', fmt: (v) => formatScore(-v) },
  { key: 'destroyer', icon: Skull, title: 'The Destroyer', blurb: 'Most "everyone falls" rounds', fmt: (v) => `${v} round${v !== 1 ? 's' : ''}` },
];

export default function AwardsShowcase({ awards }) {
  if (!awards) return null;
  const any = CARDS.some((c) => awards[c.key]);
  if (!any) return null;

  return (
    <div className="space-y-3">
      <h2 className="font-heading text-lg font-bold text-foreground">Awards</h2>
      <div className="grid grid-cols-1 gap-2">
        {CARDS.map(({ key, icon: Icon, title, blurb, fmt }) => {
          const holder = awards[key];
          return (
            <div key={key} className="flex items-center gap-3 bg-card border border-border rounded-lg p-3">
              <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-heading font-bold text-foreground">{title}</p>
                <p className="text-[11px] text-muted-foreground truncate">{blurb}</p>
              </div>
              {holder ? (
                <Link to={`/player/${holder.player_id}`} className="text-right flex-shrink-0">
                  <span className="block text-sm font-medium text-foreground truncate max-w-[8rem]">{holder.player_name}</span>
                  <span className="block text-xs text-primary font-heading font-bold">{fmt(holder.value)}</span>
                </Link>
              ) : (
                <span className="text-sm text-muted-foreground flex-shrink-0">—</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
