import { Link } from 'react-router-dom';
import { HandCoins, Rabbit, Skull } from 'lucide-react';
import { formatScore, scoreTone } from '@/lib/format';
import { Name } from '@/components/UserText';
import { AWARD_HELP } from '@/lib/scoring-help';

// The group's three awards. Each is held by whoever is on the top figure — every player
// level on it — and by nobody until somebody has earned it.
// The Greedy and The Coward are points LOST, so they are shown as a lost score (red).
// The Destroyer is a count of rounds, not a score, so it takes no score colour.
// The titles and one-line blurbs come from scoring-help.js, which also explains each award
// in the help sheet ("The standings"), so the card and the help say the same thing.
const help = Object.fromEntries(AWARD_HELP.map((a) => [a.key, a]));
export const AWARDS = [
  { key: 'greedy', icon: HandCoins, fmt: (v) => formatScore(-v), tone: (v) => scoreTone(-v) },
  { key: 'coward', icon: Rabbit, fmt: (v) => formatScore(-v), tone: (v) => scoreTone(-v) },
  { key: 'destroyer', icon: Skull, fmt: (v) => `${v} round${v !== 1 ? 's' : ''}`, tone: () => 'text-foreground' },
].map((a) => ({ ...a, title: help[a.key].title, blurb: help[a.key].blurb }));

function AwardIcon({ icon: Icon }) {
  return (
    <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
      <Icon className="w-4 h-4 text-foreground" aria-hidden="true" />
    </div>
  );
}

// awards: { greedy, coward, destroyer } — each { value, holders: [{ player_id, name }] },
// or null when nobody has earned it — then it is not shown.
export default function AwardsShowcase({ awards }) {
  if (!awards) return null;
  const held = AWARDS.filter((c) => awards[c.key]?.holders?.length);
  if (held.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="section-title">Awards</h2>
      <div className="grid grid-cols-1 gap-2">
        {held.map(({ key, icon, title, blurb, fmt, tone }) => {
          const { value, holders } = awards[key];
          return (
            <div key={key} className="flex items-center gap-3 bg-card border border-border rounded-lg p-3">
              <AwardIcon icon={icon} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-heading font-bold text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground">{blurb}</p>
              </div>
              <div className="text-right flex-shrink-0">
                {/* Each holder's name is a link at least 44 px tall and wide, so a name as
                    short as "Dan" is still an easy tap and a neighbouring name is not hit by mistake. */}
                {holders.map((h) => (
                  <Link key={h.player_id} to={`/player/${h.player_id}`}
                    className="-mr-2 flex min-h-11 min-w-11 items-center justify-end px-2 text-sm font-medium text-foreground underline decoration-muted-foreground/50 underline-offset-4">
                    <span className="block truncate max-w-[8rem]"><Name>{h.name}</Name></span>
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

// On a player's page: only the awards that player holds right now.
//   held         ['greedy' | 'coward' | 'destroyer', …]  (computePlayerStats → awards.held)
//   groupAwards  the group's awards, as above            (computePlayerStats → group_awards)
//   playerId     the player the page is about — the other holders of a shared award are named.
export function HeldAwards({ held = [], groupAwards, playerId }) {
  const mine = AWARDS.filter((a) => held.includes(a.key) && groupAwards?.[a.key]);
  if (mine.length === 0) return null;

  return (
    <div className="space-y-2">
      <h2 className="section-label">Awards held</h2>
      {mine.map(({ key, icon, title, blurb, fmt, tone }) => {
        const { value, holders = [] } = groupAwards[key];
        const others = holders.filter((h) => h.player_id !== playerId);
        return (
          <div key={key} className="flex items-center gap-3 bg-card border border-border rounded-lg p-3">
            <AwardIcon icon={icon} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-heading font-bold text-foreground">{title}</p>
              <p className="text-xs text-muted-foreground">
                {blurb}
                {others.length > 0 && (
                  <> · shared with {others.map((h, i) => <span key={h.player_id}>{i > 0 ? ', ' : ''}<Name>{h.name}</Name></span>)}</>
                )}
              </p>
            </div>
            <span className={`flex-shrink-0 text-sm font-heading font-bold ${tone(value)}`}>{fmt(value)}</span>
          </div>
        );
      })}
    </div>
  );
}
