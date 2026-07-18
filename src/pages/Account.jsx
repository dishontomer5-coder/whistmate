import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { User, Mail, LogIn, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Account() {
  const { user, isAuthenticated, logout } = useAuth();

  if (!isAuthenticated || !user) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-secondary border border-border flex items-center justify-center mb-5">
          <User className="w-8 h-8 text-muted-foreground" />
        </div>
        <h1 className="font-heading text-xl font-bold text-foreground uppercase tracking-wide mb-2">
          My Account
        </h1>
        <p className="text-sm text-muted-foreground max-w-xs mb-6">
          Sign in to manage your account and settings.
        </p>
        <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Link to="/login"><LogIn className="w-4 h-4 mr-1" />Sign In</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold text-foreground uppercase tracking-wide">
        My Account
      </h1>

      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <span className="font-heading text-lg font-bold text-primary">
              {(user.full_name || user.email || '?').charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {user.full_name || 'User'}
            </p>
            <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
              <Mail className="w-3 h-3" />
              {user.email}
            </p>
          </div>
        </div>
        {user.role === 'admin' && (
          <div className="flex items-center gap-1.5 text-xs text-primary">
            <Shield className="w-3.5 h-3.5" />
            Platform Admin
          </div>
        )}
      </div>

      <Button
        onClick={() => logout('/home')}
        variant="outline"
        className="w-full border-border text-destructive hover:text-destructive"
      >
        Sign Out
      </Button>
    </div>
  );
}