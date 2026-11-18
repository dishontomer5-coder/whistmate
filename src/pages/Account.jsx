import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { User, Mail, LogIn, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import EmptyState from '@/components/EmptyState';
import PlayerAvatar from '@/components/PlayerAvatar';
import { Name } from '@/components/UserText';

export default function Account() {
  const { user, isAuthenticated, logout } = useAuth();

  if (!isAuthenticated || !user) {
    return (
      <EmptyState as="h1" icon={User} title="My account"
        description="Sign in to manage your account and settings."
        action={<Button asChild><Link to="/login"><LogIn />Sign in</Link></Button>} />
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="page-title">My account</h1>

      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-3">
          <PlayerAvatar name={user.full_name || user.email} size="lg" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              <Name>{user.full_name || 'User'}</Name>
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
            App admin
          </div>
        )}
      </div>

      <Button
        onClick={() => logout('/home')}
        variant="outline"
        className="w-full text-negative hover:text-negative"
      >
        Sign out
      </Button>
    </div>
  );
}