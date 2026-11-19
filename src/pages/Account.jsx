import { Navigate } from 'react-router-dom';
import { Mail, Shield, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import PlayerAvatar from '@/components/PlayerAvatar';
import { Name } from '@/components/UserText';

// The address /account. The account card now sits at the foot of the Me tab, so the old
// address — bookmarks, links in old messages — lands there.
export default function Account() {
  return <Navigate to="/profile/global#account" replace />;
}

// Who is signed in, and the way out. Drawn at the foot of the Me page.
// An account made with e-mail and password has no name: the e-mail address is then the
// first line, rather than a made-up "User".
export function AccountSection() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <section id="account" className="scroll-mt-20 space-y-3">
      <h2 className="section-label">Account</h2>
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-3">
          <PlayerAvatar name={user.full_name || user.email} size="lg" />
          <div className="min-w-0">
            {user.full_name && (
              <p className="text-sm font-medium text-foreground truncate"><Name>{user.full_name}</Name></p>
            )}
            <p className={`flex items-center gap-1 ${user.full_name ? 'text-xs text-muted-foreground' : 'text-sm font-medium text-foreground'}`}>
              <Mail className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="truncate">{user.email}</span>
            </p>
          </div>
        </div>
        {user.role === 'admin' && (
          <div className="flex items-center gap-1.5 text-xs text-primary">
            <Shield className="w-3.5 h-3.5" aria-hidden="true" />
            App admin
          </div>
        )}
      </div>

      <Button onClick={() => logout('/home')} variant="outline" className="w-full text-negative hover:text-negative">
        <LogOut /> Sign out
      </Button>
    </section>
  );
}
