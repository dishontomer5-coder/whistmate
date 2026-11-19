import { useState, useEffect, useRef } from 'react';
import { Outlet, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { Trophy, CalendarDays, Users, Settings, Bell, User, ChevronLeft, LogIn, Archive } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useActiveGroup, isGroupPage } from '@/lib/ActiveGroupContext';
import HamburgerMenu from '@/components/HamburgerMenu';
import { UserText } from '@/components/UserText';

// The app shell: a header, the page, and a tab bar. It comes in two frames.
//
//   All groups   header: the WhistMate mark            tabs: Groups · Activity · Me
//   One group    header: ‹ Groups | group name | menu   tabs: Standings · Sessions · Players · Admin
//
// Each tab's `covers` lists the pages that light it, so a session or round page lights
// Sessions and any player's page lights Players.
const startsWith = (prefix) => (p) => p.startsWith(prefix);

const GLOBAL_TABS = [
  { icon: Users, label: 'Groups', path: '/home', covers: [(p) => p === '/home'] },
  { icon: Bell, label: 'Activity', path: '/activity', covers: [(p) => p === '/activity'] },
  { icon: User, label: 'Me', path: '/profile/global', covers: [(p) => p === '/profile/global', (p) => p === '/account'] },
];

const GROUP_TABS = [
  { icon: Trophy, label: 'Standings', path: '/', covers: [(p) => p === '/'] },
  { icon: CalendarDays, label: 'Sessions', path: '/history', covers: [(p) => p === '/history', startsWith('/session/'), startsWith('/round/')] },
  { icon: Users, label: 'Players', path: '/profile', covers: [(p) => p === '/profile', startsWith('/player/')] },
  { icon: Settings, label: 'Admin', path: '/admin', covers: [(p) => p === '/admin'], adminOnly: true },
];

// Pages reached from the menu keep the frame of wherever they were opened from, so
// reading About from inside a group does not look like leaving the group.
const SIDE_PAGES = ['/about'];

// Round entry is a focused screen: "pick the table", bidding, results and editing put
// their own action bar at the bottom of the screen, so the tab bar is not drawn there.
// The header (group name, ‹ Groups, menu) stays.
const isRoundEntry = (p) => p === '/session/new' || p.startsWith('/round/') || /^\/session\/[^/]+\/round\/new$/.test(p);

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeGroupId, activeGroup, isAdmin, loading: groupsLoading, groupPending } = useActiveGroup();
  const [unseenActivity, setUnseenActivity] = useState(0);
  const { pathname } = location;

  // Which frame this page is drawn in. A side page keeps the frame of the page before it.
  const lastFrame = useRef('global');
  const isSidePage = SIDE_PAGES.includes(pathname);
  let frame = isGroupPage(pathname) ? 'group' : 'global';
  if (isSidePage) frame = lastFrame.current === 'group' && activeGroup ? 'group' : 'global';
  else lastFrame.current = frame;
  const inGroup = frame === 'group';

  // Unseen table-talk badge: one cheap count when signing in and whenever the all-groups
  // frame is entered; the Activity page marks everything seen server-side when opened.
  useEffect(() => {
    if (!user) { setUnseenActivity(0); return; }
    base44.functions.invoke('getActivityFeed', { count_only: true })
      .then(res => setUnseenActivity(res.data.unseen_count || 0))
      .catch(() => {});
  }, [user?.id, inGroup]);

  useEffect(() => {
    if (pathname === '/activity') setUnseenActivity(0);
  }, [pathname]);

  // A group page needs a group. Signed out: the front door for "/", the sign-in form —
  // with the address to come back to — for anything deeper. Signed in with no group: the
  // Groups list. App admins are exempt (they can look at any group).
  const isAppAdmin = user?.role === 'admin';
  if (isGroupPage(pathname) && !isAppAdmin && !activeGroupId && (!user || !groupsLoading)) {
    if (!user && pathname !== '/') {
      return <Navigate to={`/login?from_url=${encodeURIComponent(window.location.href)}`} replace />;
    }
    // A link to one session, round or player of a group the user is not in: say so on the
    // Groups list rather than landing there without a word.
    const linked = /^\/(session|round|player)\//.test(pathname);
    return <Navigate to="/home" replace state={linked ? { notice: "That page isn't available — you're not in its group." } : undefined} />;
  }

  const tabs = inGroup
    ? GROUP_TABS.filter((tab) => !tab.adminOnly || (isAdmin && !groupPending))
    : GLOBAL_TABS;
  const showTabs = !!user && !isRoundEntry(pathname);

  const signInLink = (
    <Link to="/login" className="flex items-center gap-1 min-h-11 text-sm font-medium text-foreground hover:underline">
      <LogIn className="w-4 h-4" />
      Sign in
    </Link>
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          {inGroup ? (
            <>
              {/* Leaving for the list of groups does not forget the group: the browser's
                  Back button returns to the page that was left. */}
              <button
                onClick={() => navigate('/home')}
                aria-label={unseenActivity > 0 ? 'All groups — new activity' : 'All groups'}
                className="relative flex items-center min-h-11 -ml-2 pl-1 pr-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
              >
                <ChevronLeft className="w-5 h-5" aria-hidden="true" />
                Groups
                {unseenActivity > 0 && (
                  <span aria-hidden="true" className="absolute top-2 right-0 w-2 h-2 rounded-full bg-foreground" />
                )}
              </button>
              {/* The group of the page on screen. While that is not known yet (an id page
                  opened directly) nothing is claimed. */}
              <div className="flex-1 min-w-0 flex items-center justify-center gap-2 px-2">
                <UserText className="font-heading text-base font-bold text-foreground uppercase tracking-wide truncate">
                  {groupPending ? '…' : activeGroup?.name || (groupsLoading ? '…' : 'Group')}
                </UserText>
                {/* On the narrowest phones the badge is an icon, so the group's name keeps its room. */}
                {!groupPending && activeGroup?.status === 'archived' && (
                  <span className="flex flex-shrink-0 items-center text-xs px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-500 font-medium uppercase">
                    <Archive className="w-3.5 h-3.5 min-[360px]:hidden" aria-hidden="true" />
                    <span className="max-[359px]:sr-only">Archived</span>
                  </span>
                )}
              </div>
              {user ? <HamburgerMenu unseenActivity={unseenActivity} /> : signInLink}
            </>
          ) : (
            <>
              <Link to="/home" className="flex items-center gap-2 min-h-11 flex-shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
                <span aria-hidden="true" className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold">♠</span>
                <span className="font-heading text-lg font-bold tracking-wide text-primary uppercase">
                  WhistMate
                </span>
              </Link>
              {user ? <HamburgerMenu /> : signInLink}
            </>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 pb-24">
        <Outlet />
      </main>

      {showTabs && (
        <nav aria-label={inGroup ? 'Group' : 'All groups'}
          className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border pb-[env(safe-area-inset-bottom)]">
          <div className="max-w-2xl mx-auto flex">
            {tabs.map(({ icon: Icon, label, path, covers }) => {
              const active = covers.some((test) => test(pathname));
              const unseen = path === '/activity' ? unseenActivity : 0;
              return (
                <Link
                  key={path}
                  to={path}
                  aria-current={active ? 'page' : undefined}
                  className={`flex-1 min-w-0 flex flex-col items-center gap-1 py-3 px-1 transition-colors ${
                    active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span className="relative">
                    <Icon className="w-5 h-5" aria-hidden="true" />
                    {unseen > 0 && (
                      <span className="absolute -top-1.5 -right-3 min-w-[18px] h-[18px] px-1 rounded-full bg-foreground text-background text-xs leading-none font-bold flex items-center justify-center">
                        {unseen > 9 ? '9+' : unseen}
                        <span className="sr-only"> new</span>
                      </span>
                    )}
                  </span>
                  <span className="text-xs font-medium whitespace-nowrap leading-tight">{label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
