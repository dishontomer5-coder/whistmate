import { useRef } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

// The one in-page back control: it goes to the page the user came from, and says which.
//
//   <BackLink fallback="/history" />
//
//   fallback       where to go when there is no page to go back to (the page was opened
//                  directly: a shared link, a bookmark, a reload in a fresh tab).
//   fallbackLabel  the label for that case; by default the name of the fallback page.
//
//   <BackLink to="/history" />
//
//   to             a FIXED destination instead: the link always says that page's name
//                  ("← Sessions") however the page was reached, so its label never changes
//                  (scorekeeper-7). When that page is the one just before in the history
//                  it goes back (keeping its scroll); otherwise it opens it.
//
// It reads "← Standings", "← Sessions", "← Activity"… when the previous page is known,
// and "← Back" when it is not. To know, <NavTrail /> (rendered once, in App.jsx) notes for
// every history entry which page the user was on before it.

// location.key -> the address of the page the user came from. Kept in memory only, so it
// lasts until the page is reloaded (after that the link says "Back" and still goes back).
const cameFrom = new Map();
const MAX_ENTRIES = 200;
function noteCameFrom(key, pathname) {
  if (!key || !pathname) return;
  cameFrom.delete(key);
  cameFrom.set(key, pathname); // re-inserted, so the oldest notes are the first to go
  if (cameFrom.size > MAX_ENTRIES) cameFrom.delete(cameFrom.keys().next().value);
}

/** What a page is called in a back link, from its address — or null when it has no short name. */
export function pageName(pathname) {
  if (!pathname) return null;
  if (pathname === '/') return 'Standings';
  if (pathname === '/history') return 'Sessions';
  if (pathname === '/profile') return 'Players';
  if (pathname === '/admin') return 'Admin';
  if (pathname === '/home') return 'Groups';
  if (pathname === '/activity') return 'Activity';
  if (pathname === '/profile/global' || pathname === '/account') return 'Me';
  if (pathname === '/about') return 'About';
  if (pathname === '/rules') return 'Rules';
  if (pathname.startsWith('/session/')) return 'Session';
  if (pathname.startsWith('/round/')) return 'Round';
  if (pathname.startsWith('/player/')) return 'Player';
  return null;
}

/**
 * Notes where the user came from, for every page they open. Render it once, inside the
 * router and before the routes, so the note exists by the time a page draws its BackLink.
 */
export function NavTrail() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const last = useRef(null);

  // Done while rendering (not in an effect) so the page rendered in this same pass can
  // already read it. Writing the same note twice is harmless.
  if (last.current?.key !== location.key) {
    const previous = last.current;
    if (previous && navigationType === 'PUSH') {
      noteCameFrom(location.key, previous.pathname);
    } else if (previous && navigationType === 'REPLACE') {
      // The entry was replaced: Back still leads to wherever the replaced page came from.
      noteCameFrom(location.key, cameFrom.get(previous.key));
    }
    last.current = { key: location.key, pathname: location.pathname };
  }
  return null;
}

export default function BackLink({ to, fallback = '/', fallbackLabel, className }) {
  const navigate = useNavigate();
  const location = useLocation();
  // Is there a page of this visit to go back to? The router numbers the entries of a visit
  // (history.state.idx, 0 for the first); the first page loaded also has the key "default".
  const position = window.history.state?.idx;
  const canGoBack = typeof position === 'number' ? position > 0 : location.key !== 'default';
  const previous = cameFrom.get(location.key);
  let label = canGoBack
    ? pageName(previous) || 'Back'
    : fallbackLabel || pageName(fallback) || 'Back';
  let go = () => (canGoBack ? navigate(-1) : navigate(fallback, { replace: true }));
  if (to) {
    label = fallbackLabel || pageName(to) || 'Back';
    go = () => (canGoBack && previous === to ? navigate(-1) : navigate(to));
  }

  return (
    <button
      type="button"
      onClick={go}
      className={cn('flex min-h-11 items-center gap-1 pr-2 text-sm text-muted-foreground transition-colors hover:text-foreground', className)}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {label}
    </button>
  );
}
