import { useNavigate } from 'react-router-dom';
import { Menu, LogOut, LayoutDashboard, BookOpen, Info } from 'lucide-react';
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
export default function HamburgerMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const isAppAdmin = user?.role === 'admin';

  const handleSignOut = () => {
    logout('/home');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center justify-center w-11 h-11 -mr-2 flex-shrink-0 rounded-lg hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground" aria-label="Menu">
          <Menu className="w-5 h-5 text-foreground" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground truncate">
          {user?.email || 'Signed in'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {/* The rules assistant belongs to no group, so it lives here rather than in either
            tab bar — reachable from both frames. */}
        <DropdownMenuItem onClick={() => navigate('/rules')}>
          <BookOpen className="w-4 h-4 mr-2" />
          Rules & scoring
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate('/about')}>
          <Info className="w-4 h-4 mr-2" />
          About & privacy
        </DropdownMenuItem>
        {/* App admins only. Group admin lives in the group's own Admin tab (P11). */}
        {isAppAdmin && (
          <DropdownMenuItem onClick={() => navigate('/app-admin')}>
            <LayoutDashboard className="w-4 h-4 mr-2" />
            App admin dashboard
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="text-negative focus:text-negative">
          <LogOut className="w-4 h-4 mr-2" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
