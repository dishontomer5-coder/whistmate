import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { Trophy, User, Activity as ActivityIcon, ArrowLeft, LogIn, Home as HomeIcon, Settings, Spade } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import GlobalProfileIcon from '@/components/GlobalProfileIcon';
import { useAuth } from '@/lib/AuthContext';
import { useActiveGroup } from '@/lib/ActiveGroupContext';
import HamburgerMenu from '@/components/HamburgerMenu';

const GLOBAL_ROUTES = ['/home', '/activity', '/profile/global', '/account', '/select-player', '/app-admin', '/about'];

const globalNavItems = [
  { icon: HomeIcon, label: 'Groups', path: '/home' },
  { icon: ActivityIcon, label: 'Activity', path: '/activity' },
  { icon: GlobalProfileIcon, label: 'Profile', path: '/profile/global' },
];

const groupNavItems = [
  { icon: Spade, label: 'Sessions', path: '/' },
  { icon: Trophy, label: 'History', path: '/history' },
  { icon: User, label: 'Profile', path: '/profile' },
  { icon: Settings, label: 'Admin', path: '/admin', adminOnly: true },
];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeGroup, isAdmin, setActiveGroup, loading: groupsLoading } = useActiveGroup();
  const [unseenActivity, setUnseenActivity] = useState(0);

  // Unseen table-talk badge: one cheap count per session; the Activity page
  // marks everything seen server-side when opened.
  useEffect(() => {
    if (!user) { setUnseenActivity(0); return; }
    base44.functions.invoke('getActivityFeed', { count_only: true })
      .then(res => setUnseenActivity(res.data.unseen_count || 0))
      .catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    if (location.pathname === '/activity') setUnseenActivity(0);
  }, [location.pathname]);

  const isGlobal = GLOBAL_ROUTES.some(route =>
    location.pathname === route || location.pathname.startsWith(route + '/')
  );

  // Redirect to /home on a group route without an active group (covers signed-in-
  // without-group AND signed-out visitors). App admins are exempt.
  const isAppAdmin = user?.role === 'admin';
  if (!isGlobal && !isAppAdmin && !activeGroup && (!user || !groupsLoading)) {
    return <Navigate to="/home" replace />;
  }

  const handleBackToGroups = () => {
    setActiveGroup(null);
    navigate('/home');
  };

  const visibleGroupNavItems = groupNavItems.filter(item => !item.adminOnly || isAdmin);
  const navItems = isGlobal ? globalNavItems : visibleGroupNavItems;

  const isActive = (path) => {
    if (isGlobal) return location.pathname === path;
    if (path === '/') return location.pathname === '/' || location.pathname.startsWith('/session') || location.pathname.startsWith('/round');
    if (path === '/profile') return location.pathname === '/profile' || location.pathname.startsWith('/player');
    return location.pathname === path;
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          {isGlobal ? (
            <>
              <Link to="/home" className="flex items-center gap-2 flex-shrink-0">
                <span className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold">♠</span>
                <span className="font-heading text-lg font-bold tracking-wide text-primary uppercase max-[399px]:hidden">
                  WhistMate
                </span>
                <span className="font-heading text-lg font-bold tracking-wide text-primary uppercase hidden max-[399px]:inline">
                  Whist
                </span>
              </Link>
              {user ? (
                <HamburgerMenu />
              ) : (
                <Link to="/login" className="flex items-center gap-1 text-sm text-primary hover:underline">
                  <LogIn className="w-4 h-4" />
                  Sign In
                </Link>
              )}
            </>
          ) : (
            <>
              <button
                onClick={handleBackToGroups}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="max-[399px]:hidden">Groups</span>
              </button>
              <span className="font-heading text-base font-bold text-foreground uppercase tracking-wide truncate text-center flex-1 px-2">
                {activeGroup?.name || (groupsLoading ? '…' : 'Group')}
                {activeGroup?.status === 'archived' && (
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-500 font-medium uppercase align-middle">
                    Archived
                  </span>
                )}
              </span>
              {user ? (
                <HamburgerMenu />
              ) : (
                <Link to="/login" className="flex items-center gap-1 text-sm text-primary hover:underline">
                  <LogIn className="w-4 h-4" />
                  Sign In
                </Link>
              )}
            </>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 pb-24">
        <Outlet />
      </main>

      {user && (
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border">
        <div className="max-w-2xl mx-auto flex">
          {navItems.map(({ icon: Icon, label, path }) => {
            const active = isActive(path);
            return (
              <Link
                key={path}
                to={path}
                className={`flex-1 flex flex-col items-center gap-1 py-3 px-1 transition-colors ${
                  active ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                <span className="relative">
                  <Icon className="w-5 h-5" />
                  {path === '/activity' && unseenActivity > 0 && (
                    <span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                      {unseenActivity > 9 ? '9+' : unseenActivity}
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-medium whitespace-nowrap leading-tight">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
      )}
    </div>
  );
}
