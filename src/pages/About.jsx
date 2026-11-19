import { Mail } from 'lucide-react';
import { APP_INFO } from '@/lib/app-info';
import BackLink from '@/components/BackLink';

// About, contact and privacy (P12-3). Public: reachable signed out, so anyone deciding
// whether to sign up can see who runs the app and what it does with their data.
// Keep the "Your data" list in step with what the code really does — the same
// statements are repeated in README.md and in the store listing.
const DATA_POINTS = [
  {
    title: 'Your account',
    body: 'Your email address, and your name if you sign in with Google. Sign-in is handled by Base44, the platform that hosts WhistMate.',
  },
  {
    title: 'What your group records',
    body: 'Group and player names (including players someone added without an account), session names, dates and locations, bids, tricks, scores and table-talk notes. They are stored on Base44’s servers. Only members of that group, and the developer as app administrator, can see them.',
  },
  {
    title: 'Rules assistant',
    body: 'The question you ask, with the recent conversation, is sent to an AI model through Base44 to write the answer. WhistMate does not save the conversation.',
  },
  {
    title: 'Hosting analytics',
    body: 'Base44 logs page views and basic usage, and may set a referral cookie for 30 days if you arrive from another site. There are no ads and no third-party trackers.',
  },
  {
    title: 'On your device',
    body: 'Your sign-in and your last-opened group are kept in your browser’s storage.',
  },
  {
    title: 'Permissions',
    body: 'None. WhistMate does not ask for your camera, microphone, location, contacts or notifications.',
  },
];

export default function About() {
  const mailto = `mailto:${APP_INFO.supportEmail}`;

  return (
    <div className="space-y-6">
      {/* Back to wherever About was opened from — a group page stays a group page. */}
      <BackLink fallback="/home" className="-my-2" />

      <div>
        <h1 className="page-title">About {APP_INFO.name}</h1>
        <p className="text-sm text-muted-foreground mt-2">
          {APP_INFO.name} is a scorekeeper and stats tracker for Israeli Whist. It records the bids and tricks at
          your table and does the scoring. It does not deal or play cards.
        </p>
      </div>

      <section className="bg-card border border-border rounded-lg p-4 space-y-2">
        <h2 className="section-title">Who makes it</h2>
        <p className="text-sm text-muted-foreground">
          Made by <span className="text-foreground font-medium">{APP_INFO.developer}</span>. For questions,
          problems, or to have your account or data deleted, write to:
        </p>
        <a href={mailto} className="inline-flex items-center gap-2 min-h-11 text-sm text-primary hover:underline break-all">
          <Mail className="w-4 h-4 flex-shrink-0" /> {APP_INFO.supportEmail}
        </a>
      </section>

      <section className="bg-card border border-border rounded-lg p-4 space-y-4">
        <h2 className="section-title">Your data</h2>
        <dl className="space-y-3">
          {DATA_POINTS.map(({ title, body }) => (
            <div key={title}>
              <dt className="text-sm font-medium text-foreground">{title}</dt>
              <dd className="text-sm text-muted-foreground mt-0.5">{body}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
