import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { UserPlus } from 'lucide-react';
import LoadingSpinner from '@/components/LoadingSpinner';
import Logo from '@/components/Logo';
import { Name } from '@/components/UserText';
import { inviteFromPath, safeReturnPath, withReturnTo } from '@/lib/authReturnTo';

// The page behind a shared invite link: /join?code=XXXXXX&name=<group name>.
//
// Signed out, it is the first thing a stranger sees of WhistMate: which group they are
// invited to, what the app is, and the two ways in. Both carry this address along
// (?from_url=), so after signing up — the e-mail code step included — logging in or coming
// back from Google the visitor is here again, signed in.
//
// Signed in, there is nothing to show here: the groups list opens with the join dialog over
// it, which asks the server about the code and shows the group's real name.
//
// `name` in the link is only what the link says. It is display text, shown before sign-in
// because looking a code up needs an account; nothing is decided from it.
export default function Join() {
  const location = useLocation();
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const here = location.pathname + location.search;
  const invite = inviteFromPath(here) || { code: '', name: '' };

  if (isLoadingAuth) return <LoadingSpinner showLogo />;

  if (isAuthenticated) return <Navigate to="/home" replace state={{ invite }} />;

  // This address without sign-in leftovers; null only if the link is not ours at all.
  const returnTo = safeReturnPath(here);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background px-4 py-6 [@media(min-height:700px)]:py-8">
      <main className="m-auto flex w-full max-w-sm flex-col items-center text-center">
        <Logo size="lg" showText />

        {/* The group's name gets a line of its own: it is the news, and a Hebrew name that
            wrapped in the middle of the English sentence would read out of order. */}
        <h1 className="page-title mt-6">
          You're invited to join{' '}
          {invite.name
            ? <Name className="block break-words text-primary">{invite.name}</Name>
            : 'a whist group '}
          on WhistMate
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          WhistMate keeps score for Israeli Whist nights: it does the bidding and scoring maths, and tracks
          your group's standings and stats.
        </p>

        {invite.code ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Invite code <span className="font-mono font-semibold tracking-widest text-foreground">{invite.code}</span>
          </p>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            This link has no invite code in it. Ask for the link again, or sign in and type the 6-character code.
          </p>
        )}

        <div className="mt-8 flex w-full flex-col gap-3">
          <Button asChild size="lg" className="w-full">
            <Link to={withReturnTo('/register', returnTo)}><UserPlus /> Create an account</Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link to={withReturnTo('/login', returnTo)}>I already have an account</Link>
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Either way, the next step is choosing who you are in the group.
        </p>

        <Link to="/about" className="mt-4 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground hover:underline">
          About WhistMate &amp; privacy
        </Link>
      </main>
    </div>
  );
}
