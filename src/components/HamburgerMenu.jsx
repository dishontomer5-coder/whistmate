import { useNavigate } from 'react-router-dom';
import { Menu, User, LogOut, LayoutDashboard } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';

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
        <button className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-secondary transition-colors" aria-label="Menu">
          <Menu className="w-5 h-5 text-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground truncate">
          {user?.email || 'Account'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/account')}>
          <User className="w-4 h-4 mr-2" />
          My Account
        </DropdownMenuItem>
        {/* Global menu → global admin only. Group admin lives in the group's
            own bottom-nav Admin tab, so it doesn't belong here (P11). */}
        {isAppAdmin && (
          <DropdownMenuItem onClick={() => navigate('/app-admin')}>
            <LayoutDashboard className="w-4 h-4 mr-2" />
            App Admin Dashboard
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}