import { useNavigate } from 'react-router-dom';
import { Menu, LogOut, LayoutDashboard, BookOpen, Info, Bell } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';

// The menu of both frames: the things that belong to no tab. The account (name, e-mail)
// lives at the foot of the Me tab; the menu only shows who is signed in and signs out.
//
//   unseenActivity  how many notes are new since Activity was last opened. Activity is a tab
//                   of the all-groups frame only, so inside a group the menu is the way to it
//                   (returning-player-2), with the count beside it.
export default function HamburgerMenu({ unseenActivity = 0 }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const isAppAdmin = user?.role === 'admin';

  const handleSignOut = () => {
    logout('/home');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="relative flex items-center justify-center w-11 h-11 -mr-2 flex-shrink-0 rounded-lg hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
          aria-label={unseenActivity > 0 ? 'Menu — new activity' : 'Menu'}>
          <Menu className="w-5 h-5 text-foreground" aria-hidden="true" />
          {unseenActivity > 0 && <span aria-hidden="true" className="absolute top-2 right-2 h-2 w-2 rounded-full bg-foreground ring-2 ring-background" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground truncate">
          {user?.email || 'Signed in'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/activity')} className="min-h-11">
          <Bell className="w-4 h-4 mr-2" />
          Activity
          {unseenActivity > 0 && (
            <span className="ml-auto rounded-full border border-input/70 px-2 text-xs font-semibold">
              {unseenActivity > 9 ? '9+' : unseenActivity}<span className="sr-only"> new</span>
            </span>
          )}
        </DropdownMenuItem>
        {/* The rules guide and assistant belong to no group, so they live here rather than in
            either tab bar — reachable from both frames. */}
        <DropdownMenuItem onClick={() => navigate('/rules')} className="min-h-11">
          <BookOpen className="w-4 h-4 mr-2" />
          Rules & scoring
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate('/about')} className="min-h-11">
          <Info className="w-4 h-4 mr-2" />
          About & privacy
        </DropdownMenuItem>
        {/* App admins only. Group admin lives in the group's own Admin tab (P11). */}
        {isAppAdmin && (
          <DropdownMenuItem onClick={() => navigate('/app-admin')} className="min-h-11">
            <LayoutDashboard className="w-4 h-4 mr-2" />
            App admin dashboard
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="min-h-11 text-negative focus:text-negative">
          <LogOut className="w-4 h-4 mr-2" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
