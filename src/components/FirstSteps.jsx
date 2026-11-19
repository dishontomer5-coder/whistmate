import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, UserPlus, Link2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserText } from '@/components/UserText';

const PLAYERS_FOR_A_ROUND = 4;

// The address a friend opens to join. `name` is only there so the invitation can greet
// them with the group's name before they sign in; the code is what lets them in.
export function inviteLink(group) {
  const params = new URLSearchParams({ code: group?.invite_code || '', name: group?.name || '' });
  return `${window.location.origin}/join?${params.toString()}`;
}

function Step({ number, done, title, children }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden="true"
        className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-sm font-heading font-bold ${
          done ? 'border border-primary text-foreground' : 'border border-input text-muted-foreground'
        }`}>
        {done ? <Check className="h-4 w-4" /> : number}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-medium text-foreground">
          {title}{done && <span className="sr-only"> — done</span>}
        </p>
        {children}
      </div>
    </li>
  );
}

// What a group with no session yet shows its admin instead of empty lists: the three
// steps to the first round, each with its button.
//
//   group         the Group record (name, invite_code).
//   playerCount   how many players the group has, with or without an account
//                 (null while it is loading).
export default function FirstSteps({ group, playerCount }) {
  const [linkState, setLinkState] = useState('idle'); // idle | copied | shown
  const count = playerCount ?? 0;
  const enoughPlayers = count >= PLAYERS_FOR_A_ROUND;
  const link = inviteLink(group);

  // Copy the link and say so. Where the browser will not let a page write to the
  // clipboard, the link itself is shown, to be copied by hand.
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setLinkState('copied');
    } catch {
      setLinkState('shown');
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-4" aria-labelledby="first-steps-title">
      <div>
        <h2 id="first-steps-title" className="section-title">Three steps to your first round</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          <UserText>{group?.name}</UserText> is ready. A round of whist needs four players.
        </p>
      </div>

      <ol className="space-y-5">
        <Step number={1} done={enoughPlayers} title={`Add players (${Math.min(count, PLAYERS_FOR_A_ROUND)} of ${PLAYERS_FOR_A_ROUND})`}>
          <p className="text-sm text-muted-foreground">
            {enoughPlayers
              ? `${count} players in the group. You can add more at any time.`
              : 'Add everyone who sits at your table by name. They do not need an account.'}
          </p>
          <Button asChild variant={enoughPlayers ? 'outline' : 'default'}>
            <Link to="/admin"><UserPlus /> Add players</Link>
          </Button>
        </Step>

        <Step number={2} title="Invite with a link">
          <p className="text-sm text-muted-foreground">
            Whoever opens the link joins the group and can take over the player you added for them.
          </p>
          <Button variant="outline" onClick={copyLink}>
            {linkState === 'copied' ? <Check /> : <Link2 />}
            Copy invite link
          </Button>
          {/* What happened is said next to the button; when copying is not possible the link itself is shown. */}
          <p role="status" className="text-sm text-muted-foreground empty:hidden">
            {linkState === 'copied' ? 'Link copied — paste it into your group chat.' : linkState === 'shown' ? 'Copy this link and send it to your players:' : ''}
          </p>
          {linkState === 'shown' && (
            <p className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground break-all select-all">{link}</p>
          )}
        </Step>

        <Step number={3} title="Start the first session">
          <p className="text-sm text-muted-foreground">
            {enoughPlayers
              ? 'A session is one night of whist. Open it, then start round 1.'
              : 'A session is one night of whist. You can open it now and add the players before round 1.'}
          </p>
          <Button asChild variant={enoughPlayers ? 'default' : 'outline'}>
            <Link to="/session/new"><Play /> Start the first session</Link>
          </Button>
        </Step>
      </ol>
    </section>
  );
}
